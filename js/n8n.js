/* A small, honest n8n-style execution engine.
   - Data moves as ITEMS: [{ json: {...} }, ...] from a node's output into the next node's input.
   - Parameters can contain expressions:  {{ $json.field }}, {{ $node["HTTP Request"].json.x }}, {{ $('Code').first().json.y }}
   - IF / Switch / Filter / Loop Over Items route items to specific OUTPUTS — what you connect to which output matters.
   - Credentialed nodes (Slack, Telegram, Gmail, AI) refuse to run without a credential.
   The "outside world" (Mission Control API, sensors, sub-workflows, AI replies) comes from mission-sim.js. */
(function () {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clone = o => JSON.parse(JSON.stringify(o === undefined ? null : o));
  class NErr extends Error { constructor(m, hint) { super(m); this.hint = hint; } }

  // ------------------------------------------------------------------ expressions
  function evalExpr(code, c) {
    let fn;
    try { fn = new Function('$json', '$input', '$node', '$', '$now', '$itemIndex', 'return (' + code + ');'); }
    catch (e) { throw new NErr('Invalid expression {{ ' + code.trim() + ' }}: ' + e.message); }
    try { return fn(c.$json, c.$input, c.$node, c.$, c.$now, c.$itemIndex); }
    catch (e) { throw new NErr('Expression error in {{ ' + code.trim() + ' }}: ' + e.message, 'Open the node and look at its INPUT panel to see the real field names.'); }
  }
  function resolve(v, c) {
    if (typeof v !== 'string') return v;
    const re = /\{\{([\s\S]+?)\}\}/g, m = [...v.matchAll(re)];
    if (!m.length) return v;
    if (m.length === 1 && v.trim() === m[0][0]) return evalExpr(m[0][1], c);              // a lone expression keeps its type
    return v.replace(re, (_, e) => { const x = evalExpr(e, c); return x !== null && typeof x === 'object' ? JSON.stringify(x) : String(x); });
  }
  // JSON body templates: an expression inside "quotes" becomes a (safely escaped) string; outside quotes it becomes a JSON value.
  // So  { "token": "{{ $json.body.token }}" }  and  { "token": {{ $json.body.token }} }  both work, and quotes/newlines in the data can't break the JSON.
  function resolveJson(tpl, c) {
    const re = /\{\{([\s\S]+?)\}\}/g; let out = '', last = 0, m;
    while ((m = re.exec(tpl))) {
      const before = tpl.slice(0, m.index), inStr = ((before.match(/(^|[^\\])"/g) || []).length % 2) === 1, val = evalExpr(m[1], c);
      const rep = inStr ? JSON.stringify(val !== null && typeof val === 'object' ? JSON.stringify(val) : String(val)).slice(1, -1) : JSON.stringify(val === undefined ? null : val);
      out += tpl.slice(last, m.index) + rep; last = m.index + m[0].length;
    }
    return out + tpl.slice(last);
  }
  function mkCtx(run, items, i) {
    const item = items[i] || { json: {} };
    const rec = name => { const r = run.byType[name]; if (!r) throw new NErr(`The node “${name}” hasn't run yet, so it has no data.`); return r.out[0] || []; };
    const access = name => { const a = rec(name); return { json: a[0] ? a[0].json : {}, all: () => a }; };
    return {
      $json: item.json, $itemIndex: i, $now: new Date().toISOString(),
      $input: { all: () => items, first: () => items[0], last: () => items[items.length - 1], item },
      $node: new Proxy({}, { get: (_, name) => access(String(name)) }),
      $: name => { const a = rec(name); return { first: () => a[0], last: () => a[a.length - 1], all: () => a, item: a[0] }; }
    };
  }

  function cmp(op, l, r) {
    const num = v => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(+v)), both = num(l) && num(r);
    switch (op) {
      case 'is equal to': return both ? +l === +r : String(l) === String(r);
      case 'is not equal to': return !cmp('is equal to', l, r);
      case 'contains': return String(l).includes(String(r));
      case 'is greater than': return both && +l > +r;
      case 'is less than': return both && +l < +r;
      case 'is empty': return l === '' || l == null || (Array.isArray(l) && !l.length);
      case 'is not empty': return !cmp('is empty', l);
      default: return false;
    }
  }

  // ------------------------------------------------------------------ node implementations
  // exec(node, ins, W, run, X) -> { out: [items, items, ...], log: [strings] }
  const needCred = n => { const c = n.params.cred; if (!c || /^—/.test(c)) throw new NErr('Credentials for ' + n.type + ' are not set.', 'Open the node and choose “Mars Ops account” under Credential.'); };
  const items0 = ins => ins[0] || [];
  const req = (n, key, label) => { if (!String(n.params[key] == null ? '' : n.params[key]).trim()) throw new NErr(`The “${label}” parameter is required.`); };
  const perItem = (n, items, fn, X) => items.map((it, i) => fn(it, X.v.bind(null, n, items, i), i));

  const EXEC = {
    'Manual Trigger': (n, ins, W) => ({ out: [W.trigger('Manual Trigger') || [{ json: {} }]] }),
    'Schedule Trigger': (n, ins, W) => ({ out: [W.trigger('Schedule Trigger') || [{ json: { timestamp: new Date().toISOString() } }]] }),
    'Form Trigger': (n, ins, W) => ({ out: [W.trigger('Form Trigger') || [{ json: {} }]] }),
    'Error Trigger': (n, ins, W) => { const t = W.trigger('Error Trigger'); if (!t) return { skip: true }; return { out: [t] }; },
    'Webhook': (n, ins, W) => {
      req(n, 'path', 'Path'); const t = W.trigger('Webhook');
      return { out: [t || [{ json: { headers: {}, params: {}, query: {}, body: {} } }]], log: [`received <code>${n.params.method} /webhook/${n.params.path}</code>`] };
    },

    'HTTP Request': (n, ins, W, run, X) => {
      const items = items0(ins), out = [], log = [];
      items.forEach((it, i) => {
        const url = String(X.v(n, items, i, 'url') || '').trim(); if (!url) throw new NErr('The “URL” parameter is required.');
        let body = null;
        if (n.params.sendBody === 'Yes') {
          const tpl = String(n.params.body == null ? '' : n.params.body).trim();
          if (!tpl) throw new NErr('“Send Body” is on, but the body is empty.');
          let raw = resolveJson(tpl, mkCtx(run, items, i));
          try { raw = JSON.parse(raw); } catch (e) { throw new NErr('The body is not valid JSON.', 'It should look like { "key": "value" } — and expressions go inside {{ }}, e.g. { "token": "{{ $json.body.token }}" }'); }
          body = raw;
        }
        const res = W.api(n.params.method, url, body);
        if (res.status >= 400) throw new NErr(`${res.status} – ${res.json && res.json.error ? res.json.error : 'The request failed'}`, 'The service replied with an error, so the workflow stops here (just like real n8n).');
        const arr = Array.isArray(res.json) ? res.json : [res.json]; arr.forEach(j => out.push({ json: clone(j) }));
        log.push(`<code>${n.params.method} ${esc(url)}</code> → <span class="g">${res.status}</span> <code>${esc(JSON.stringify(res.json)).slice(0, 140)}</code> <span class="lg-n">· mission clock ${W.clock}s</span>`);
      });
      return { out: [out], log };
    },

    'Set': (n, ins, W, run, X) => {
      req(n, 'field', 'Field name'); const items = items0(ins);
      return { out: [items.map((it, i) => { const j = n.params.keep === 'No' ? {} : clone(it.json); j[n.params.field] = X.v(n, items, i, 'value'); return { json: j }; })], log: [`set <code>${esc(n.params.field)}</code>`] };
    },

    'Code': (n, ins, W, run, X) => {
      const items = items0(ins), logs = [], code = n.params.js || '';
      const con = { log: (...a) => logs.push('console.log: ' + a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')) };
      const norm = (r, where) => {
        if (!Array.isArray(r)) throw new NErr('Code doesn’t return items properly' + where, 'Return an array of items, e.g. return [ { json: { ... } } ]; or just return $input.all();');
        return r.map((x, k) => { if (x && typeof x === 'object' && x.json && typeof x.json === 'object') return { json: clone(x.json) }; if (x && typeof x === 'object') return { json: clone(x) }; throw new NErr(`Code returned something that isn't an object [item ${k}]`, 'Each returned item should look like { json: { ... } }.'); });
      };
      const call = (src, args) => { let fn; try { fn = new Function('$input', '$json', 'items', '$node', '$', '$now', 'console', 'atob', 'btoa', src); } catch (e) { throw new NErr('Code error: ' + e.message); } try { return fn(...args); } catch (e) { throw new NErr('Code error: ' + e.message, 'Check the browser-style JavaScript in your Code node.'); } };
      let out = [];
      if (n.params.mode === 'Run Once for Each Item') {
        items.forEach((it, i) => { const c = mkCtx(run, items, i), r = call(code, [c.$input, c.$json, items, c.$node, c.$, c.$now, con, atob, btoa]); if (r == null) return; out.push(...norm(Array.isArray(r) ? r : [r], '')); });
      } else {
        const c = mkCtx(run, items, 0), live = items.map(x => ({ json: clone(x.json) })), inp = { all: () => live, first: () => live[0], last: () => live[live.length - 1], item: live[0] };
        out = norm(call(code, [inp, c.$json, live, c.$node, c.$, c.$now, con, atob, btoa]), '');
      }
      return { out: [out], log: logs };
    },

    'IF': (n, ins, W, run, X) => {
      req(n, 'left', 'Value 1'); const items = items0(ins), t = [], f = [];
      items.forEach((it, i) => { (cmp(n.params.op, X.v(n, items, i, 'left'), X.v(n, items, i, 'right')) ? t : f).push(it); });
      return { out: [t, f], log: [`${t.length} item(s) → <b>true</b>, ${f.length} → <b>false</b>`] };
    },
    'Switch': (n, ins, W, run, X) => {
      const items = items0(ins), out = [[], [], [], []]; let any = false;
      [1, 2, 3].forEach(k => { if (String(n.params['r' + k + 'l'] || '').trim()) any = true; });
      if (!any) throw new NErr('The Switch has no rules.', 'Fill in “Rule 1 — value” (and the others you need).');
      items.forEach((it, i) => { let hit = -1; for (let k = 1; k <= 3 && hit < 0; k++) { const l = n.params['r' + k + 'l']; if (!String(l || '').trim()) continue; if (cmp(n.params['r' + k + 'op'], X.v(n, items, i, 'r' + k + 'l'), X.v(n, items, i, 'r' + k + 'r'))) hit = k - 1; } out[hit < 0 ? 3 : hit].push(it); });
      return { out, log: [`routed: ${out.map((o, k) => `${['1', '2', '3', 'fallback'][k]}=${o.length}`).join('  ')}`] };
    },
    'Filter': (n, ins, W, run, X) => {
      req(n, 'left', 'Value 1'); const items = items0(ins), keep = items.filter((it, i) => cmp(n.params.op, X.v(n, items, i, 'left'), X.v(n, items, i, 'right')));
      return { out: [keep], log: [`${keep.length} of ${items.length} item(s) kept`] };
    },
    'Wait': (n, ins, W) => { const s = Math.max(0, +n.params.sec || 0); W.clock += s; return { out: [items0(ins)], log: [`waited ${s} s (mission clock: ${W.clock} s)`] }; },
    'Merge': (n, ins) => {
      const a = ins[0] || [], b = ins[1] || [];
      if (n.params.mode === 'Combine by position') { const m = Math.max(a.length, b.length), out = []; for (let i = 0; i < m; i++) out.push({ json: Object.assign({}, a[i] && a[i].json, b[i] && b[i].json) }); return { out: [out] }; }
      return { out: [a.concat(b)], log: [`appended ${a.length} + ${b.length} item(s)`] };
    },
    'Aggregate': (n, ins) => { const items = items0(ins); return { out: [items.length ? [{ json: { data: items.map(i => clone(i.json)) } }] : []], log: [`${items.length} item(s) → 1 item with <code>data</code>`] }; },
    'Split Out': (n, ins) => {
      req(n, 'field', 'Field to split out'); const out = [];
      items0(ins).forEach(it => { const arr = it.json[n.params.field]; if (!Array.isArray(arr)) throw new NErr(`The field “${n.params.field}” wasn't found as a list in the input item.`, 'Check the INPUT panel for the exact field name.'); arr.forEach(el => out.push({ json: { [n.params.field]: clone(el) } })); });
      return { out: [out], log: [`${out.length} item(s)`] };
    },
    'Loop Over Items': (n, ins, W, run) => {
      const items = items0(ins), size = Math.max(1, +n.params.size || 1); let st = run.state[n.id];
      if (!st) { st = run.state[n.id] = { rest: items.slice(size), done: [] }; return { out: [[], items.slice(0, size)], log: [`${items.length} item(s) in, batch size ${size}`, `→ loop (${Math.min(size, items.length)})`] }; }
      st.done.push(...items);
      if (st.rest.length) { const b = st.rest.splice(0, size); return { out: [[], b], log: [`→ loop (${b.length}), ${st.rest.length} left`] }; }
      const all = st.done; delete run.state[n.id]; return { out: [all, []], log: [`finished — ${all.length} item(s) → <b>done</b>`] };
    },
    'Execute Workflow': (n, ins, W) => { req(n, 'wf', 'Workflow'); const items = items0(ins), out = []; items.forEach(it => out.push(...W.sub(n.params.wf, it))); return { out: [out], log: [`ran “${esc(n.params.wf)}” → ${out.length} item(s)`] }; },
    'Respond to Webhook': (n, ins, W, run, X) => { const items = items0(ins); const b = items.length ? X.v(n, items, 0, 'body') : n.params.body; W.events.push({ kind: 'respond', body: b }); return { out: [items], log: [`responded: <code>${esc(typeof b === 'object' ? JSON.stringify(b) : String(b)).slice(0, 140)}</code>`] }; },
    'Data table': (n, ins, W, run) => {
      req(n, 'table', 'Table'); const items = items0(ins);
      if (n.params.op === 'Insert row') { items.forEach(it => { W.events.push({ kind: 'table', table: n.params.table, row: clone(it.json) }); (W.tables[n.params.table] = W.tables[n.params.table] || []).push(clone(it.json)); }); return { out: [items], log: [`inserted ${items.length} row(s) into <code>${esc(n.params.table)}</code>`] }; }
      const rows = W.tables[n.params.table]; if (!rows) throw new NErr(`There is no table called “${n.params.table}”.`, 'Available tables: ' + Object.keys(W.tables).join(', '));
      return { out: [rows.map(r => ({ json: clone(r) }))], log: [`read ${rows.length} row(s) from <code>${esc(n.params.table)}</code>`] };
    },
    'Slack': (n, ins, W, run, X) => { needCred(n); req(n, 'channel', 'Channel'); req(n, 'text', 'Message'); const items = items0(ins), log = []; items.forEach((it, i) => { const t = String(X.v(n, items, i, 'text')); W.events.push({ kind: 'slack', channel: n.params.channel, text: t }); log.push(`posted to <code>${esc(n.params.channel)}</code>: “${esc(t).slice(0, 100)}”`); }); return { out: [items], log }; },
    'Telegram': (n, ins, W, run, X) => { needCred(n); req(n, 'chat', 'Chat ID'); req(n, 'text', 'Text'); const items = items0(ins), log = []; items.forEach((it, i) => { const t = String(X.v(n, items, i, 'text')); W.events.push({ kind: 'telegram', chat: n.params.chat, text: t }); log.push(`sent to chat <code>${esc(n.params.chat)}</code>: “${esc(t).slice(0, 100)}”`); }); return { out: [items], log }; },
    'Gmail': (n, ins, W, run, X) => {
      needCred(n); req(n, 'to', 'To'); req(n, 'subject', 'Subject'); req(n, 'message', 'Message'); const items = items0(ins), log = [];
      items.forEach((it, i) => { const to = String(X.v(n, items, i, 'to')); if (!/@/.test(to)) throw new NErr('“To” must be an email address.'); const msg = String(X.v(n, items, i, 'message')); W.events.push({ kind: 'gmail', to, subject: String(X.v(n, items, i, 'subject')), message: msg }); log.push(`email to <code>${esc(to)}</code>: “${esc(msg).slice(0, 100)}”`); });
      return { out: [items], log };
    },
    'AI Agent': (n, ins, W, run, X) => { needCred(n); req(n, 'prompt', 'Prompt'); const items = items0(ins), out = [], log = []; items.forEach((it, i) => { const p = String(X.v(n, items, i, 'prompt')), o = W.ai(p, 'agent'); out.push({ json: { output: o } }); log.push(`model replied: “${esc(o).slice(0, 110)}”`); }); return { out: [out], log }; },
    'Basic LLM Chain': (n, ins, W, run, X) => { needCred(n); req(n, 'prompt', 'Prompt'); const items = items0(ins), out = [], log = []; items.forEach((it, i) => { const p = String(X.v(n, items, i, 'prompt')), o = W.ai(p, 'chain'); out.push({ json: { text: o } }); log.push(`model replied: “${esc(o).slice(0, 110)}”`); }); return { out: [out], log }; }
  };
  function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  // ------------------------------------------------------------------ the run loop
  /* graph: { nodes:[{id,type,params}], edges:[{from,o,to,toIn}] }
     hooks: { scenario(i,n,label), start(node), done(node,res,rec), error(node,err), edge(e) }, delay: ms per node */
  async function runWorkflow(graph, mission, hooks = {}, opts = {}) {
    const sim = MISSION_SIM[mission.id], scenarios = sim.scenarios || [''], runs = [];
    const signal = opts.signal || { stop: false };
    for (let si = 0; si < scenarios.length && !signal.stop; si++) {
      if (hooks.scenario) hooks.scenario(si, scenarios.length, scenarios[si]);
      runs.push(await runScenario(graph, sim, si, hooks, opts.delay == null ? 450 : (si ? Math.min(150, opts.delay) : opts.delay), signal));
    }
    if (signal.stop) return { runs, goal: { ok: false, stopped: true, msg: '' } };
    return { runs, goal: sim.goal(runs, mission, graph) };
  }

  async function runScenario(graph, sim, si, hooks, delay, signal) {
    const W = sim.world(si), run = { nodes: {}, byType: {}, state: {}, events: W.events, errors: [], steps: 0, scenario: si };
    const byId = Object.fromEntries(graph.nodes.map(n => [n.id, n])), from = {}, conn = {};
    graph.edges.forEach(e => { ((from[e.from] = from[e.from] || {})[e.o] = (from[e.from][e.o] || [])).push(e); (conn[e.to] = conn[e.to] || new Set()).add(e.toIn || 0); });
    const X = { v: (n, items, i, key) => resolve(n.params[key], mkCtx(run, items, i)) };
    const queue = [], pending = {};
    const triggers = graph.nodes.filter(n => /Trigger$|^Webhook$/.test(n.type));
    // n8n refuses these combinations, so do we
    const hasRespond = graph.nodes.some(n => n.type === 'Respond to Webhook');
    graph.nodes.filter(n => n.type === 'Webhook').forEach(w => {
      if (hasRespond && w.params.respondMode !== 'Using Respond to Webhook node') run.errors.push({ node: w, msg: 'Unused Respond to Webhook node found in the workflow.', hint: 'Open the Webhook node and set “Respond” to “Using Respond to Webhook node”.' });
      if (!hasRespond && w.params.respondMode === 'Using Respond to Webhook node') run.errors.push({ node: w, msg: 'No Respond to Webhook node found in the workflow.', hint: 'Add a Respond to Webhook node, or set “Respond” back to “Immediately”.' });
    });
    if (run.errors.length) { run.errors.forEach(e => { hooks.error && hooks.error(e.node, new NErr(e.msg, e.hint)); }); run.aborted = true; return run; }
    triggers.forEach(t => queue.push({ id: t.id, ins: [] }));

    const record = (n, patch) => { const r = run.nodes[n.id] = run.nodes[n.id] || { type: n.type, runs: 0, out: [], in: null, error: null }; Object.assign(r, patch); run.byType[n.type] = r; return r; };
    const deliver = (n, out) => {
      (out || []).forEach((items, o) => {
        if (!items || !items.length) return;
        ((from[n.id] || {})[o] || []).forEach(e => {
          hooks.edge && hooks.edge(e); const tn = byId[e.to]; if (!tn) return;
          if (tn.type === 'Merge') { const p = pending[tn.id] = pending[tn.id] || {}; p[e.toIn || 0] = items; if ([...conn[tn.id]].every(k => p[k])) { const ins = [p[0] || [], p[1] || []]; delete pending[tn.id]; queue.push({ id: tn.id, ins }); } }
          else queue.push({ id: tn.id, ins: [items] });
        });
      });
    };
    const step = async job => {
      const n = byId[job.id]; if (!n) return;
      if (signal && signal.stop) { queue.length = 0; return; }
      const nth = run.nodes[n.id] ? run.nodes[n.id].runs : 0;
      if (++run.steps > 900 || nth > 90) {
        run.errors.push({ node: n, msg: 'Stopped: the workflow kept looping and never finished.', hint: 'A loop needs an exit. For polling: send only the IF’s false output back, and put a Wait inside the loop so time passes between checks.' });
        queue.length = 0; return;
      }
      hooks.start && hooks.start(n);
      const d = nth >= 2 ? Math.min(delay, 20) : delay;                  // later passes of a loop animate quickly
      if (d) await sleep(n.type === 'Wait' && nth < 2 ? Math.min(d * 1.4, 700) : d);
      let res; const first = !(run.nodes[n.id] && run.nodes[n.id].runs);
      try { res = EXEC[n.type](n, job.ins, W, run, X); }
      catch (e) { const err = e instanceof NErr ? e : new NErr(e.message); record(n, { error: err.message, hint: err.hint, in: first ? job.ins : (run.nodes[n.id] || {}).in }); run.errors.push({ node: n, msg: err.message, hint: err.hint }); hooks.error && hooks.error(n, err); return; }
      if (res.skip) return;
      const prev = run.nodes[n.id], rec = record(n, { runs: (prev ? prev.runs : 0) + 1, out: res.out, error: null, in: first ? job.ins : prev.in });
      rec.total = (prev && prev.total || 0) + res.out.reduce((a, o) => a + (o ? o.length : 0), 0);
      hooks.done && hooks.done(n, res, rec); deliver(n, res.out);
    };
    while (queue.length) { await step(queue.shift()); if (!queue.length) {                  // Merge nodes still waiting for a branch that never delivered
      for (const id of Object.keys(pending)) { const p = pending[id]; delete pending[id]; queue.push({ id: +id, ins: [p[0] || [], p[1] || []] }); } } }
    const loopOpen = graph.nodes.filter(n => n.type === 'Loop Over Items' && run.state[n.id]);
    if (loopOpen.length) run.errors.push({ node: loopOpen[0], msg: 'Loop Over Items never reached its “done” output.', hint: 'Connect the end of the loop branch back into the Loop Over Items node, so it can send the next batch.' });
    return run;
  }

  window.N8N = { runWorkflow, resolve, NErr, EXEC };
})();
