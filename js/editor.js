/* A faked n8n editor: drag nodes from the palette, wire them up, configure them, execute the workflow.
   A mission is solved when the executed workflow contains the mission's `solve` chain (see missions.js). */
(function () {
  const NW = 68, NH = 68;                                    // node box size (world units)
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- node catalogue
  const CRED = '— select credential —';
  const P = {
    txt: (k, label, def = '', ph = '') => ({ k, label, type: 'text', def, ph }),
    sel: (k, label, opts, def) => ({ k, label, type: 'select', opts, def: def || opts[0] }),
    num: (k, label, def) => ({ k, label, type: 'number', def }),
    area: (k, label, def = '', ph = '') => ({ k, label, type: 'area', def, ph }),
    cred: () => ({ k: 'cred', label: 'Credential to connect with', type: 'select', opts: [CRED, 'Mars Ops account'], def: CRED })
  };
  const OPS = ['is equal to', 'is not equal to', 'contains', 'is greater than', 'is less than', 'is empty', 'is not empty'];
  const T = (name, cat, ic, color, o = {}) => ({ name, cat, ic, color, trigger: !!o.trigger, outs: o.outs || [''], ins: o.trigger ? 0 : (o.ins || 1), params: o.params || [], desc: o.desc || '' });
  const cond = (left = '') => [P.txt('left', 'Value 1', left, '{{ $json.field }}'), P.sel('op', 'Operation', OPS, 'is equal to'), P.txt('right', 'Value 2', '', 'compare to…')];
  const rules = [1, 2, 3].flatMap(k => [P.txt('r' + k + 'l', 'Rule ' + k + ' — value', '', '{{ $json.field }}'), P.sel('r' + k + 'op', 'Rule ' + k + ' — operation', OPS, 'is equal to'), P.txt('r' + k + 'r', 'Rule ' + k + ' — compare to', '', '')]);
  const CODE_DEFAULT = '// Loop over input items and add a new field\n// called myNewField to the JSON of each one\nfor (const item of $input.all()) {\n  item.json.myNewField = 1;\n}\n\nreturn $input.all();';
  const TYPES = [
    T('Manual Trigger', 'Triggers', '👆', '#ff6d5a', { trigger: true, desc: 'Runs the workflow when you click Execute' }),
    T('Schedule Trigger', 'Triggers', '⏰', '#5f6ad6', { trigger: true, desc: 'Runs on a time interval', params: [P.sel('every', 'Trigger interval', ['Every 10 minutes', 'Every hour', 'Every Sol (24h 40m)'], 'Every hour')] }),
    T('Webhook', 'Triggers', '⚡', '#e0526b', { trigger: true, desc: 'Starts when a request arrives', params: [P.sel('method', 'HTTP Method', ['GET', 'POST', 'PUT'], 'POST'), P.txt('path', 'Path', '', 'e.g. earth-handshake'), P.sel('respondMode', 'Respond', ['Immediately', 'Using Respond to Webhook node'], 'Immediately')] }),
    T('Form Trigger', 'Triggers', '📝', '#7b61d1', { trigger: true, desc: 'Starts when a form is submitted', params: [P.txt('title', 'Form title', 'Crew check-in')] }),
    T('Error Trigger', 'Triggers', '🚨', '#d94444', { trigger: true, desc: 'Starts when another workflow fails' }),
    T('HTTP Request', 'Core', '🌐', '#4a8bd9', { desc: 'Call any API. Runs once per incoming item.', params: [P.sel('method', 'Method', ['GET', 'POST', 'PUT', 'DELETE'], 'GET'), P.txt('url', 'URL', '', '{EARTH}/…'), P.sel('sendBody', 'Send Body', ['No', 'Yes'], 'No'), P.area('body', 'Body (JSON)', '', '{ "key": "{{ $json.value }}" }')] }),
    T('Set', 'Core', '✎', '#2f9e8f', { desc: 'Edit Fields — set a value on every item', params: [P.txt('field', 'Field name', 'status'), P.txt('value', 'Value', 'ok', 'text or {{ expression }}'), P.sel('keep', 'Keep other fields', ['Yes', 'No'], 'Yes')] }),
    T('Code', 'Core', '{ }', '#e8884a', { desc: 'Run your own JavaScript', params: [P.sel('mode', 'Mode', ['Run Once for All Items', 'Run Once for Each Item'], 'Run Once for All Items'), P.area('js', 'JavaScript', CODE_DEFAULT)] }),
    T('IF', 'Core', '⑂', '#3cb371', { outs: ['true', 'false'], desc: 'Items that match go out of “true”, the rest out of “false”', params: cond('{{ $json.value }}') }),
    T('Switch', 'Core', '⇶', '#3cb371', { outs: ['1', '2', '3', 'fallback'], desc: 'Each rule has its own output; unmatched items go to “fallback”', params: rules }),
    T('Filter', 'Core', '▽', '#3cb371', { desc: 'Keep only the items that match', params: cond('{{ $json.value }}') }),
    T('Wait', 'Core', '⏳', '#8c8c99', { desc: 'Pause the workflow', params: [P.num('sec', 'Wait for (seconds)', 5)] }),
    T('Merge', 'Core', '⛙', '#2f9aa3', { ins: 2, desc: 'Combine two branches (two inputs)', params: [P.sel('mode', 'Mode', ['Append', 'Combine by position'], 'Append')] }),
    T('Aggregate', 'Core', 'Σ', '#2f9aa3', { desc: 'Combine all items into ONE item with a “data” list' }),
    T('Split Out', 'Core', '⇲', '#2f9aa3', { desc: 'Turn a list field into separate items', params: [P.txt('field', 'Field to split out', '', 'e.g. waypoints')] }),
    T('Loop Over Items', 'Core', '↻', '#6b7280', { outs: ['done', 'loop'], desc: 'Send items through the “loop” output in batches; connect the loop’s end back here. “done” fires when all are processed', params: [P.num('size', 'Batch size', 1)] }),
    T('Execute Workflow', 'Core', '▶', '#ff6d5a', { desc: 'Run another workflow for each item', params: [P.txt('wf', 'Workflow', '', 'name')] }),
    T('Respond to Webhook', 'Core', '↩', '#e0526b', { desc: 'Send the response back to the webhook caller (set the Webhook’s Respond option accordingly)', params: [P.area('body', 'Response body', '{ "status": "ok" }')] }),
    T('Data table', 'Core', '▤', '#4a9d6f', { desc: 'Read or store table rows', params: [P.sel('op', 'Operation', ['Get row(s)', 'Insert row'], 'Get row(s)'), P.txt('table', 'Table', 'mars_data')] }),
    T('Slack', 'Apps', '#', '#4a154b', { desc: 'Send a Slack message', params: [P.cred(), P.txt('channel', 'Channel', '#mars-ops'), P.txt('text', 'Message', '', 'Heads up!')] }),
    T('Telegram', 'Apps', '✈', '#2a9fd6', { desc: 'Send a Telegram message', params: [P.cred(), P.txt('chat', 'Chat ID', '', 'e.g. 123456789'), P.txt('text', 'Text', '', 'Heads up!')] }),
    T('Gmail', 'Apps', '✉', '#d44638', { desc: 'Send an email', params: [P.cred(), P.txt('to', 'To', '', 'name@earth.example'), P.txt('subject', 'Subject', ''), P.area('message', 'Message', '')] }),
    T('AI Agent', 'AI', '🤖', '#8a5cf6', { desc: 'An agent that reasons over your prompt. Output field: output', params: [P.cred(), P.area('prompt', 'Prompt (User Message)', '', 'Tell the agent what to do. Use {{ … }} to pass data in.')] }),
    T('Basic LLM Chain', 'AI', '🧠', '#8a5cf6', { desc: 'Prompt a language model. Output field: text', params: [P.cred(), P.area('prompt', 'Prompt', '', 'Use {{ … }} to pass data in.')] })
  ];
  const BY = Object.fromEntries(TYPES.map(t => [t.name, t]));

  // ---------------------------------------------------------------- state
  let wireFixPending = null, signal = { stop: false }, loopLines = {}, mission = null, graph = null, selected = null, running = false, scale = 1, tx = 0, ty = 0, openNode = null;
  const graphs = {};                                    // lives in memory; Save.write() stores it only when the player asks
  const save = () => { };
  const $ = id => document.getElementById(id);
  let root, view, world, svg, nodesEl, tmpPath, logBody;

  // ---------------------------------------------------------------- DOM
  function build() {
    root = document.createElement('div'); root.id = 'editor';
    root.innerHTML = `
      <div class="ed-top">
        <button class="ed-back" id="ed-back">‹ Back to Mars</button>
        <div class="ed-name"><span class="ed-pill">MISSION</span><span id="ed-title"></span></div>
        <div class="ed-top-r"><span id="ed-saved"></span><button class="ed-save" id="ed-save">💾 Save game</button><button class="ed-run" id="ed-run">▶ Execute workflow</button></div>
      </div>
      <div class="ed-main">
        <div class="ed-side">
          <div class="ed-brief" id="ed-brief"></div>
          <div class="ed-tabs"><button id="tab-guide" class="on">📋 Guide <i id="gd-count"></i></button><button id="tab-nodes">➕ Nodes</button></div>
          <div class="ed-guide" id="ed-guide"></div>
          <div class="ed-nodes-tab" id="ed-nodes-tab">
            <input class="ed-search" id="ed-search" placeholder="Search nodes…" autocomplete="off">
            <div class="ed-palette" id="ed-palette"></div>
          </div>
        </div>
        <div class="ed-view" id="ed-view">
          <div class="ed-world" id="ed-world">
            <svg class="ed-svg" id="ed-svg" width="1" height="1"><path id="ed-tmp" class="edge tmp" d=""></path></svg>
            <div id="ed-nodes"></div>
          </div>
          <div class="ed-empty" id="ed-empty">Drag a node from the left, or click one, to start building.<br><small>Connect nodes by dragging from an output dot to another node.</small></div>
          <div class="ed-zoom"><button id="z-in">＋</button><button id="z-out">－</button><button id="z-fit">⤢</button></div>
          <div class="ed-log" id="ed-log"><div class="ed-log-h"><span>LOGS</span><button id="ed-log-clear">Clear</button></div><div class="ed-log-b" id="ed-log-b"></div></div>
        </div>
        <div class="ed-drawer" id="ed-drawer"></div>
      </div>
      <div class="ed-done" id="ed-done"></div>`;
    document.body.appendChild(root);
    view = $('ed-view'); world = $('ed-world'); svg = $('ed-svg'); nodesEl = $('ed-nodes'); tmpPath = $('ed-tmp'); logBody = $('ed-log-b');

    // palette
    const pal = $('ed-palette');
    ['Triggers', 'Core', 'Apps', 'AI'].forEach(cat => {
      const sec = document.createElement('div'); sec.className = 'pal-sec'; sec.dataset.cat = cat;
      sec.innerHTML = `<div class="pal-h">${cat}</div>` + TYPES.filter(t => t.cat === cat).map(t => `
        <div class="pal-item" draggable="true" data-t="${esc(t.name)}" title="${esc(t.desc)}">
          <span class="pal-ic" style="background:${t.color}">${esc(t.ic)}</span><span class="pal-n">${esc(t.name)}</span></div>`).join('');
      pal.appendChild(sec);
    });
    pal.addEventListener('dragstart', e => { const it = e.target.closest('.pal-item'); if (it) e.dataTransfer.setData('text/plain', it.dataset.t); });
    pal.addEventListener('click', e => {
      const it = e.target.closest('.pal-item'); if (!it) return;
      const r = view.getBoundingClientRect();
      addNode(it.dataset.t, (r.width / 2 - tx) / scale - NW / 2 + (Math.random() - .5) * 120, (r.height / 2 - ty) / scale - NH / 2 + (Math.random() - .5) * 120);
    });
    $('ed-search').addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      pal.querySelectorAll('.pal-item').forEach(it => { it.style.display = !q || it.dataset.t.toLowerCase().includes(q) ? '' : 'none'; });
      pal.querySelectorAll('.pal-sec').forEach(s => { s.style.display = [...s.querySelectorAll('.pal-item')].some(i => i.style.display !== 'none') ? '' : 'none'; });
    });

    // canvas: drop, pan, zoom
    view.addEventListener('dragover', e => e.preventDefault());
    view.addEventListener('drop', e => {
      e.preventDefault(); const name = e.dataTransfer.getData('text/plain'); if (!BY[name]) return;
      const r = view.getBoundingClientRect(); addNode(name, (e.clientX - r.left - tx) / scale - NW / 2, (e.clientY - r.top - ty) / scale - NH / 2);
    });
    view.addEventListener('pointerdown', e => {
      if (e.target.closest('.nd, .ed-zoom, .ed-log, .edge-hit')) return;
      select(null); const sx = e.clientX, sy = e.clientY, ox = tx, oy = ty; view.classList.add('pan');
      const mv = ev => { tx = ox + ev.clientX - sx; ty = oy + ev.clientY - sy; applyView(); };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); view.classList.remove('pan'); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    view.addEventListener('wheel', e => {
      if (e.target.closest('.ed-log')) return; e.preventDefault();
      const r = view.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, ns = Math.min(1.6, Math.max(.35, scale * (e.deltaY < 0 ? 1.1 : .9)));
      tx = mx - (mx - tx) * (ns / scale); ty = my - (my - ty) * (ns / scale); scale = ns; applyView();
    }, { passive: false });
    $('z-in').onclick = () => zoomBy(1.2); $('z-out').onclick = () => zoomBy(1 / 1.2); $('z-fit').onclick = fit;

    // nodes (delegated)
    nodesEl.addEventListener('pointerdown', onNodeDown);
    nodesEl.addEventListener('dblclick', e => { const nd = e.target.closest('.nd'); if (nd) openDrawer(+nd.dataset.id); });
    svg.addEventListener('pointerdown', e => { const h = e.target.closest('.edge-hit'); if (h) { e.stopPropagation(); select({ kind: 'edge', i: +h.dataset.i }); } });

    $('tab-guide').onclick = () => showTab('guide'); $('tab-nodes').onclick = () => showTab('nodes');
    $('ed-save').onclick = () => { const ok = window.Save && Save.write(); const s = $('ed-saved'); s.textContent = ok ? 'Saved ✓' : 'Could not save'; };
    logBody.addEventListener('click', e => { const b = e.target.closest('[data-fix],[data-fixall],[data-wirefix]'); if (!b) return; if (b.dataset.wirefix) applyWireFix(); else if (b.dataset.fixall) fixAll(); else fixNode(+b.dataset.fix); });
    $('ed-back').onclick = close; $('ed-run').onclick = () => { if (running) { signal.stop = true; $('ed-run').textContent = '⏳ Stopping…'; } else run(); }; $('ed-log-clear').onclick = () => { logBody.innerHTML = ''; };
    window.addEventListener('keydown', e => {
      if (!root.classList.contains('on')) return;
      const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && selected) { e.preventDefault(); removeSelected(); }
      if (e.key === 'Escape') { if ($('ed-drawer').classList.contains('on')) closeDrawer(); else if (!typing) close(); }
    });
  }

  const applyView = () => { world.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; view.style.backgroundSize = `${24 * scale}px ${24 * scale}px`; view.style.backgroundPosition = `${tx}px ${ty}px`; };
  function zoomBy(f) { const r = view.getBoundingClientRect(), mx = r.width / 2, my = r.height / 2, ns = Math.min(1.6, Math.max(.35, scale * f)); tx = mx - (mx - tx) * (ns / scale); ty = my - (my - ty) * (ns / scale); scale = ns; applyView(); }
  function reveal(id) {                                  // pan just enough that a node is fully visible (not under the settings drawer or the log)
    const n = byId(id); if (!n || !view) return; const r = view.getBoundingClientRect(), m = 60, logH = 165, w = NW * scale, h = (NH + 30) * scale;
    const sx = n.x * scale + tx, sy = n.y * scale + ty;
    if (sx < m) tx += m - sx; else if (sx + w > r.width - m) tx -= sx + w - (r.width - m);
    if (sy < m) ty += m - sy; else if (sy + h > r.height - logH) ty -= sy + h - (r.height - logH);
    applyView();
  }
  function fit() {
    if (!graph.nodes.length) { scale = 1; tx = 60; ty = 80; applyView(); return; }
    const xs = graph.nodes.map(n => n.x), ys = graph.nodes.map(n => n.y), r = view.getBoundingClientRect();
    const minx = Math.min(...xs), maxx = Math.max(...xs) + NW, miny = Math.min(...ys), maxy = Math.max(...ys) + NH + 24;
    scale = Math.min(1.2, Math.max(.4, Math.min((r.width - 160) / (maxx - minx), (r.height - 260) / (maxy - miny))));
    tx = (r.width - (maxx - minx) * scale) / 2 - minx * scale; ty = (r.height - 150 - (maxy - miny) * scale) / 2 - miny * scale + 20; applyView();
  }

  // ---------------------------------------------------------------- graph ops
  function addNode(type, x, y, params) {
    const def = BY[type], n = { id: graph.n++, type, x: Math.round(x / 12) * 12, y: Math.round(y / 12) * 12, params: {} };
    def.params.forEach(p => { n.params[p.k] = p.def; }); if (params) Object.assign(n.params, params);
    graph.nodes.push(n); nodesEl.appendChild(nodeEl(n)); persist(); updateEmpty(); drawEdges(); return n;
  }
  function nodeEl(n) {
    const def = BY[n.type], el = document.createElement('div'); el.className = 'nd' + (def.trigger ? ' trig' : ''); el.dataset.id = n.id;
    el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
    const outY = outYs(def);
    el.innerHTML = `
      <div class="nd-box" style="--c:${def.color}"><span class="nd-ic">${esc(def.ic)}</span><span class="nd-st"></span><span class="nd-badge"></span></div>
      ${def.ins === 2 ? '<span class="port in" data-i="0" style="top:' + (NH * .32 - 6) + 'px"></span><span class="port in" data-i="1" style="top:' + (NH * .68 - 6) + 'px"></span>' : (def.ins ? '<span class="port in" data-i="0"></span>' : '')}
      ${outY.map((y, i) => `<span class="port out" data-o="${i}" style="top:${y - 6}px"></span>${def.outs.length > 1 ? `<span class="port-l" style="top:${y - 7}px">${esc(def.outs[i])}</span>` : ''}`).join('')}
      <span class="nd-fix" title="This node needs attention — click to fix it">🔧</span>
      <div class="nd-label">${esc(n.type)}</div>`;
    return el;
  }
  const outYs = def => def.outs.length === 1 ? [NH / 2] : def.outs.length === 2 ? [NH * .32, NH * .68] : def.outs.length === 3 ? [NH * .24, NH * .5, NH * .76] : [NH * .16, NH * .39, NH * .62, NH * .85];
  const byId = id => graph.nodes.find(n => n.id === id);
  const portOut = (n, o) => ({ x: n.x + NW, y: n.y + outYs(BY[n.type])[o] });
  const portIn = (n, i = 0) => ({ x: n.x, y: n.y + (BY[n.type].ins === 2 ? NH * (i ? .68 : .32) : NH / 2) });
  const curve = (a, b) => {
    if (b.x < a.x + 30) {                                     // a connection running BACKWARDS (a loop): draw it as a clear arc below the nodes
      const dy = Math.max(75, Math.abs(a.y - b.y) / 2 + 75), c = Math.max(90, (a.x - b.x) * .3 + 70);
      return `M${a.x},${a.y} C${a.x + c},${a.y + dy} ${b.x - c},${b.y + dy} ${b.x},${b.y}`;
    }
    const c = Math.max(50, Math.abs(b.x - a.x) * .5); return `M${a.x},${a.y} C${a.x + c},${a.y} ${b.x - c},${b.y} ${b.x},${b.y}`;
  };

  function drawEdges(execOk) {
    svg.querySelectorAll('.edge:not(.tmp), .edge-hit').forEach(e => e.remove());
    graph.edges.forEach((e, i) => {
      const a = byId(e.from), b = byId(e.to); if (!a || !b) return;
      const d = curve(portOut(a, e.o), portIn(b, e.toIn || 0));
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d);
      p.setAttribute('class', 'edge' + (selected && selected.kind === 'edge' && selected.i === i ? ' sel' : '') + (e.state ? ' ' + e.state : '')); svg.insertBefore(p, tmpPath);
      const h = document.createElementNS('http://www.w3.org/2000/svg', 'path'); h.setAttribute('d', d); h.setAttribute('class', 'edge-hit'); h.dataset.i = i; svg.appendChild(h);
    });
  }
  function updateEmpty() { $('ed-empty').style.display = graph.nodes.length ? 'none' : ''; }
  function persist() { graphs[mission.id] = graph; save(); const s = $('ed-saved'); if (s) s.textContent = 'Not saved'; refreshGuide(); }

  function select(sel) {
    selected = sel;
    nodesEl.querySelectorAll('.nd').forEach(el => el.classList.toggle('sel', !!sel && sel.kind === 'node' && sel.id === +el.dataset.id));
    drawEdges();
  }
  function removeSelected() {
    if (!selected) return;
    if (selected.kind === 'node') {
      graph.nodes = graph.nodes.filter(n => n.id !== selected.id); graph.edges = graph.edges.filter(e => e.from !== selected.id && e.to !== selected.id);
      const el = nodesEl.querySelector(`.nd[data-id="${selected.id}"]`); if (el) el.remove(); if (openNode === selected.id) closeDrawer();
    } else graph.edges.splice(selected.i, 1);
    selected = null; persist(); updateEmpty(); drawEdges();
  }

  // ---------------------------------------------------------------- node interaction
  function onNodeDown(e) {
    const nd = e.target.closest('.nd'); if (!nd) return; const n = byId(+nd.dataset.id); e.stopPropagation();
    if (e.target.closest('.nd-fix')) { fixNode(n.id); return; }
    const outP = e.target.closest('.port.out');
    if (outP) {                                                // drag a new connection
      const o = +outP.dataset.o; select(null); const start = portOut(n, o); let over = null, lastY = 0;
      const mv = ev => {
        const r = view.getBoundingClientRect(), p = { x: (ev.clientX - r.left - tx) / scale, y: (ev.clientY - r.top - ty) / scale };
        tmpPath.setAttribute('d', curve(start, p));
        const t = document.elementFromPoint(ev.clientX, ev.clientY), tn = t && t.closest('.nd');
        if (over) over.classList.remove('drop'); over = tn && +tn.dataset.id !== n.id && !BY[byId(+tn.dataset.id).type].trigger ? tn : null; if (over) { over.classList.add('drop'); lastY = p.y; }
      };
      const up = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); tmpPath.setAttribute('d', '');
        if (over) {
          over.classList.remove('drop'); const to = +over.dataset.id;
          const tgt = byId(to), toIn = BY[tgt.type].ins === 2 ? (lastY < tgt.y + NH / 2 ? 0 : 1) : 0;
          if (!graph.edges.some(x => x.from === n.id && x.o === o && x.to === to && (x.toIn || 0) === toIn)) { graph.edges.push({ from: n.id, o, to, toIn }); persist(); drawEdges(); }
        }
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); return;
    }
    select({ kind: 'node', id: n.id });                        // drag the node
    const sx = e.clientX, sy = e.clientY, ox = n.x, oy = n.y; let moved = false;
    const mv = ev => {
      moved = true; n.x = Math.round((ox + (ev.clientX - sx) / scale) / 6) * 6; n.y = Math.round((oy + (ev.clientY - sy) / scale) / 6) * 6;
      nd.style.left = n.x + 'px'; nd.style.top = n.y + 'px'; drawEdges();
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) persist(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }

  // ---------------------------------------------------------------- parameter drawer
  function openDrawer(id) {
    const n = byId(id), def = BY[n.type]; openNode = id; select({ kind: 'node', id });
    const fields = def.params.map(p => {
      const v = n.params[p.k] ?? '';
      const input = p.type === 'select' ? `<select data-k="${p.k}">${p.opts.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : p.type === 'area' ? `<textarea data-k="${p.k}" rows="${p.k === 'js' ? 12 : 5}" spellcheck="false" placeholder="${esc(p.ph || '')}">${esc(v)}</textarea>`
        : `<input data-k="${p.k}" type="${p.type === 'number' ? 'number' : 'text'}" value="${esc(v)}" placeholder="${esc(p.ph || '')}" spellcheck="false">`;
      return `<label><span>${esc(p.label)}</span>${input}</label>`;
    }).join('') || '<p class="dim">This node has no parameters.</p>';
    const rec = lastRun && lastRun[id], fmt = items => esc(JSON.stringify((items || []).slice(0, 3).map(i => i.json), null, 2) || '[]').slice(0, 1100);
    const io = rec ? `<div class="dr-io"><div class="gs-k">INPUT <small>· last run, first ${Math.min(3, ((rec.in && rec.in[0]) || []).length)} item(s)</small></div><pre>${rec.in ? fmt(rec.in[0]) : '—'}</pre>
      ${(rec.out || []).map((o, k) => `<div class="gs-k">OUTPUT${def.outs.length > 1 ? ' · ' + esc(def.outs[k]) : ''} <small>· ${(o || []).length} item(s)</small></div><pre>${fmt(o)}</pre>`).join('')}${rec.error ? `<div class="dr-err">⚠ ${esc(rec.error)}</div>` : ''}</div>`
      : '<div class="dr-io dim">Run the workflow once to see the data going in and out of this node. Reference it with <code>{{ $json.field }}</code>.</div>';
    const role = assignRoles().indexOf(id), mm = role >= 0 ? mismatches(id, role) : [];
    const fixBox = role < 0 ? '' : `<div class="dr-fix ${mm.length ? 'bad' : ''}">${mm.length ? '<b>⚠ This node isn’t set up right yet:</b><ul>' + mm.map(x => `<li>${x}</li>`).join('') + '</ul>' : 'Stuck on this one? I can fill in the recommended settings for you.'}<button id="dr-fix">🔧 Fix this node</button></div>`;
    const d = $('ed-drawer');
    d.innerHTML = `<div class="dr-h"><span class="pal-ic" style="background:${def.color}">${esc(def.ic)}</span><div><b>${esc(n.type)}</b><small>${esc(def.desc)}</small></div><button id="dr-x">✕</button></div>
      <div class="dr-b">${fixBox}${fields}${io}</div><div class="dr-f"><button class="dr-del" id="dr-del">Delete node</button></div>`;
    d.classList.add('on');
    d.querySelectorAll('[data-k]').forEach(el => el.addEventListener('input', () => { n.params[el.dataset.k] = el.type === 'number' ? +el.value : el.value; persist(); }));
    if ($('dr-fix')) $('dr-fix').onclick = () => fixNode(id);
    setTimeout(() => reveal(id), 280);                    // after the drawer has slid in and the canvas has narrowed
    $('dr-x').onclick = closeDrawer; $('dr-del').onclick = () => { select({ kind: 'node', id }); removeSelected(); };
  }
  function closeDrawer() { openNode = null; $('ed-drawer').classList.remove('on'); }

  // ---------------------------------------------------------------- logs
  function log(kind, html) {
    const l = document.createElement('div'); l.className = 'lg ' + kind; l.innerHTML = html; logBody.appendChild(l); logBody.scrollTop = logBody.scrollHeight; return l;
  }

  // ---------------------------------------------------------------- execution (real item flow — see n8n.js / mission-sim.js)
  const isTrigger = n => BY[n.type].trigger;
  let lastRun = null;                                  // per-node records of the latest execution (INPUT / OUTPUT panels)
  const stepType = item => item === '*Trigger' ? 'Manual Trigger' : item.split('|')[0].split('@')[0];
  const outOf = item => { const m = String(item).match(/@(\d)$/); return m ? +m[1] : null; };
  const matchItem = (n, item) => {
    if (item === '*Trigger') return isTrigger(n);
    const type = stepType(item), kw = stepKw(item);
    return n.type === type && (!kw || String(n.params.url || '').toLowerCase().includes(kw));
  };

  async function run() {
    if (running) return; running = true; signal = { stop: false }; loopLines = {}; $('ed-run').disabled = false; $('ed-run').textContent = '■ Stop execution';
    closeDrawer(); logBody.innerHTML = ''; $('ed-done').classList.remove('on'); ranOnce = true; const roles0 = assignRoles();
    const clearViz = () => { nodesEl.querySelectorAll('.nd').forEach(el => { el.classList.remove('ok', 'err', 'run'); el.querySelector('.nd-badge').textContent = ''; }); graph.edges.forEach(e => { e.state = ''; }); drawEdges(); };
    clearViz();
    log('info', `Executing workflow for <b>${esc(mission.title)}</b>…`);
    if (!graph.nodes.some(isTrigger)) { log('err', 'This workflow has no trigger node. Add one so it knows when to start.'); finishRun(); return; }
    const el = n => nodesEl.querySelector(`.nd[data-id="${n.id}"]`);
    const hooks = {
      scenario: (i, tot, label) => { loopLines = {}; if (i) clearViz(); if (tot > 1) log('scn', `Scenario ${i + 1} of ${tot} — <b>${esc(label)}</b>`); },
      start: n => { const e = el(n); if (e) e.classList.add('run'); },
      edge: e => { e.state = 'ok'; drawEdges(); },
      done: (n, res, rec) => {
        const e = el(n); if (e) { e.classList.remove('run', 'err'); e.classList.add('ok'); e.querySelector('.nd-badge').textContent = rec.total; }
        const lines = res.log && res.log.length ? res.log : ['ran successfully'];
        if (rec.runs > 2) {                                  // a loop: keep ONE updating line per node instead of flooding the log
          const html = `<b>${esc(n.type)}</b> — ${lines[lines.length - 1]} <span class="lg-n">↻ pass ${rec.runs}</span>`;
          if (!loopLines[n.id]) loopLines[n.id] = log('ok', html); else loopLines[n.id].innerHTML = html;
        } else lines.forEach(l => log('ok', `<b>${esc(n.type)}</b> — ${l}`));
      },
      error: (n, err) => { const e = el(n); if (e) { e.classList.remove('run', 'ok'); e.classList.add('err'); } log('err', `<b>${esc(n.type)}</b>: ${esc(err.message)}${err.hint ? `<br><span class="hint-i">${esc(err.hint)}</span>` : ''}${roles0.includes(n.id) ? ` <button class="lg-fix" data-fix="${n.id}">🔧 Fix this node</button>` : ''}`); }
    };
    let result;
    try { result = await N8N.runWorkflow(graph, mission, hooks, { delay: 420, signal }); }
    catch (e) { console.error(e); log('err', 'Something went wrong while executing: ' + esc(e.message)); finishRun(); return; }
    lastRun = {}; result.runs.forEach(r => Object.keys(r.nodes).forEach(id => { lastRun[id] = r.nodes[id]; }));
    if (result.goal.stopped) { log('info', '■ Execution stopped.'); finishRun(); return; }
    const g = result.goal;
    if (g.ok) { log('win', '✔ Mission objective achieved!'); await sleep(700); finishRun(); complete(); return; }
    if (g.fix) { (g.fix.mark || []).forEach(e => { e.state = 'bad'; }); drawEdges(); wireFixPending = g.fix; }
    log('hint', g.msg + (g.fix ? `<br><button class="lg-fix" data-wirefix="1">🔧 ${esc(g.fix.label)}</button>` : '') + (roles0.some(x => x != null) ? '<br><button class="lg-fix" data-fixall="1">🔧 Fix all node settings</button> <span class="hint-i">or double-click a node and use its Fix button</span>' : '')); finishRun();
  }
  function finishRun() { running = false; $('ed-run').disabled = false; $('ed-run').textContent = '▶ Execute workflow'; refreshGuide(); }

  // ---------------------------------------------------------------- "Fix it" — the learner is never left stuck
  let ranOnce = false; const refCache = {};
  const FIX_CONTENT = ['body', 'text', 'message', 'prompt', 'left', 'right', 'op', 'r1l', 'r1op', 'r1r', 'r2l', 'r2op', 'r2r', 'r3l', 'r3op', 'r3r', 'js', 'value'];
  function refMap() {                                   // chain step -> index of the matching node in the reference solution
    if (refCache[mission.id]) return refCache[mission.id];
    const sol = SOLUTIONS[mission.id], chain = mission.solve, used = new Set(), map = [];
    chain.forEach((item, i) => {
      const t = stepType(item), kw = stepKw(item), earlier = chain.slice(0, i).map(stepType).lastIndexOf(t);
      if (earlier >= 0 && map[earlier] != null && !kw) { map.push(map[earlier]); return; }
      let idx = sol.nodes.findIndex(([ty, pr], k) => !used.has(k) && (item === '*Trigger' ? BY[ty].trigger : ty === t) && (!kw || String(pr.url || '').toLowerCase().includes(kw)));
      if (idx < 0) idx = null; else used.add(idx); map.push(idx);
    });
    return (refCache[mission.id] = map);
  }
  const refParams = i => { const k = refMap()[i]; return k == null ? null : Object.assign({}, SOLUTIONS[mission.id].nodes[k][1]); };
  function assignRoles() {                              // which of the player's nodes plays which step? (best effort)
    const chain = mission.solve, roles = [], used = new Set(), edgeOf = (a, b) => graph.edges.some(e => e.from === a && e.to === b);
    chain.forEach((item, i) => {
      const t = stepType(item), kw = stepKw(item), earlier = chain.slice(0, i).map(stepType).lastIndexOf(t);
      if (earlier >= 0 && !kw && roles[earlier] != null) { roles.push(roles[earlier]); return; }
      const prev = i > 0 ? roles[i - 1] : null, cand = graph.nodes.filter(n => !used.has(n.id) && (item === '*Trigger' ? isTrigger(n) : n.type === t));
      if (!cand.length) { roles.push(null); return; }
      const score = n => (kw && String(n.params.url || '').toLowerCase().includes(kw) ? 4 : 0) + (prev != null && edgeOf(prev, n.id) ? 3 : 0);
      cand.sort((a, b) => score(b) - score(a) || a.id - b.id); roles.push(cand[0].id); used.add(cand[0].id);
    });
    return roles;
  }
  const inLoop = id => graph.edges.filter(e => e.to === id).length > 1;      // a node fed from more than one place is part of a loop (e.g. a polling Wait)
  function mismatches(id, i) {                          // objective problems with a node's setup (empty fields, wrong mode, missing credential …)
    const n = byId(id), ref = refParams(i), item = mission.solve[i], out = []; if (!n || !ref) return out;
    const p = n.params, kw = stepKw(item), T = n.type, blank = k => !String(p[k] == null ? '' : p[k]).trim();
    if (BY[T].params.some(x => x.k === 'cred') && /^—/.test(p.cred || CRED)) out.push('no <b>credential</b> is selected (choose “Mars Ops account”)');
    if (T === 'Webhook') { if (blank('path')) out.push('the <b>Path</b> is empty'); if (ref.respondMode && p.respondMode !== ref.respondMode) out.push(`<b>Respond</b> should be “${ref.respondMode}”`); if (ref.method && p.method !== ref.method) out.push(`<b>Method</b> should be ${ref.method}`); }
    if (T === 'HTTP Request') {
      if (ref.method && p.method !== ref.method) out.push(`<b>Method</b> should be ${ref.method}`);
      if (blank('url')) out.push('the <b>URL</b> is empty'); else if (kw && !String(p.url).toLowerCase().includes(kw)) out.push(`the <b>URL</b> should contain <code>${kw}</code>`);
      if (ref.sendBody === 'Yes' && p.sendBody !== 'Yes') out.push('<b>Send Body</b> should be Yes'); else if (ref.sendBody === 'Yes' && blank('body')) out.push('the <b>Body</b> is empty');
    }
    if (T === 'Wait' && ref.sec != null && !(+p.sec >= ref.sec) && !inLoop(id)) out.push(`it should wait at least <b>${ref.sec} s</b>`);
    if (T === 'Data table') { if (p.op !== ref.op) out.push(`<b>Operation</b> should be “${ref.op}”`); if (blank('table')) out.push('the <b>Table</b> is empty'); }
    if ((T === 'IF' || T === 'Filter') && blank('left')) out.push('<b>Value 1</b> is empty');
    if (T === 'Switch' && ![1, 2, 3].some(k => String(p['r' + k + 'l'] || '').trim())) out.push('the Switch has no rules');
    if (T === 'Code' && blank('js')) out.push('the code is empty');
    if ((T === 'AI Agent' || T === 'Basic LLM Chain') && blank('prompt')) out.push('the <b>prompt</b> is empty');
    if (T === 'Slack') { if (blank('channel')) out.push('the <b>Channel</b> is empty'); if (blank('text')) out.push('the <b>Message</b> is empty'); }
    if (T === 'Telegram') { if (blank('chat')) out.push('the <b>Chat ID</b> is empty'); if (blank('text')) out.push('the <b>Text</b> is empty'); }
    if (T === 'Gmail') { if (blank('to')) out.push('<b>To</b> is empty'); if (blank('subject')) out.push('the <b>Subject</b> is empty'); if (blank('message')) out.push('the <b>Message</b> is empty'); }
    if (T === 'Split Out' && blank('field')) out.push('<b>Field to split out</b> is empty');
    if (T === 'Set' && blank('field')) out.push('the <b>Field name</b> is empty');
    if (T === 'Execute Workflow' && blank('wf')) out.push('the <b>Workflow</b> name is empty');
    return out;
  }
  function fixNode(id, quiet) {
    const n = byId(id); if (!n) return false; const i = assignRoles().indexOf(id);
    if (i < 0) { log('hint', `<b>${esc(n.type)}</b> isn’t part of the expected solution — you might not need it for this mission.`); return false; }
    // Hold back "content" fields (body, prompt, conditions …) only when it is genuinely ambiguous which node plays which role:
    // i.e. the graph has MORE nodes of this type than the mission has distinct roles for it (e.g. Mission 8's two near-identical actuate calls).
    const rolesOfType = new Set(assignRoles().filter(x => x != null && byId(x) && byId(x).type === n.type));
    const ref = refParams(i), multi = graph.nodes.filter(x => x.type === n.type).length > rolesOfType.size, changed = [];
    Object.keys(ref).forEach(k => { if (multi && FIX_CONTENT.includes(k)) return; if (n.type === 'Wait' && k === 'sec' && inLoop(id)) return; if (String(n.params[k]) !== String(ref[k])) { n.params[k] = ref[k]; changed.push(k); } });
    BY[n.type].params.forEach(p => { if (n.params[p.k] === undefined) n.params[p.k] = p.def; });
    persist(); if (openNode === id) openDrawer(id);
    const el = nodesEl.querySelector(`.nd[data-id="${id}"]`); if (el) { el.classList.add('fixed'); setTimeout(() => el.classList.remove('fixed'), 1500); }
    if (!quiet) log('ok', `🔧 Fixed <b>${esc(n.type)}</b> — ${changed.length ? 'updated ' + changed.map(c => `<code>${c}</code>`).join(', ') : 'it already matched the recommended settings'}. Press <b>Execute workflow</b> again.`);
    return true;
  }
  function applyWireFix() {                                // rewire connections the way the mission needs them
    const f = wireFixPending; if (!f) return;
    f.remove.forEach(x => { graph.edges = graph.edges.filter(e => !(e.from === x.from && e.o === x.o && e.to === x.to)); });
    f.add.forEach(x => { if (!graph.edges.some(e => e.from === x.from && e.o === x.o && e.to === x.to)) graph.edges.push({ from: x.from, o: x.o, to: x.to, toIn: x.toIn || 0 }); });
    graph.edges.forEach(e => { e.state = ''; }); wireFixPending = null; persist(); drawEdges();
    log('ok', '🔧 Fixed the connections. Press <b>Execute workflow</b> again.');
  }
  function fixAll() {
    const roles = assignRoles().filter(x => x != null); let n = 0; roles.forEach(id => { if (fixNode(id, true)) n++; });
    log('ok', `🔧 Set ${n} node${n === 1 ? '' : 's'} to the recommended settings. Press <b>Execute workflow</b> again.`);
  }
  function updateFlags() {
    const roles = assignRoles(); nodesEl.querySelectorAll('.nd').forEach(el => {
      const id = +el.dataset.id, i = roles.indexOf(id), bad = i >= 0 && ranOnce && (mismatches(id, i).length || (lastRun && lastRun[id] && lastRun[id].error));
      el.classList.toggle('needfix', !!bad);
    });
  }

  // ---------------------------------------------------------------- mission guide (live checklist)
  let openStep = null, lastBest = -1, manualOpen = false;
  function showTab(t) {
    $('tab-guide').classList.toggle('on', t === 'guide'); $('tab-nodes').classList.toggle('on', t === 'nodes');
    $('ed-guide').style.display = t === 'guide' ? '' : 'none'; $('ed-nodes-tab').style.display = t === 'nodes' ? '' : 'none';
  }
  const stepKw = item => item === '*Trigger' ? '' : (item.split('|')[1] || '');
  const nodeValid = n => { const p = n.params || {}; if (n.type === 'Webhook') return !!String(p.path || '').trim(); if (n.type === 'HTTP Request') return !!String(p.url || '').trim(); return true; };
  function cfgText(item) {
    const t = stepType(item), kw = stepKw(item);
    if (item === '*Trigger') return 'Any trigger works. <b>Manual Trigger</b> is the simplest.';
    if (t === 'Webhook') return 'Set a <b>Path</b> (any name, e.g. <code>earth-handshake</code>).';
    if (t === 'HTTP Request') return kw ? `Set the <b>URL</b> so it contains <code>${esc(kw)}</code> — e.g. <code>{EARTH}/…/${esc(kw)}</code>. ` + (/status|power|scan|sensors|spectrometer|flight/.test(kw) ? 'Method <b>GET</b>.' : 'Method <b>POST</b>.') : 'Set any <b>URL</b>.';
    if (t === 'Wait') return 'Any number of seconds is fine.';
    if (t === 'Code') return 'Write a little JavaScript (the default works for now).';
    if (t === 'IF' || t === 'Filter') return 'Describe the condition — the text is flavour, the node just has to be there.';
    return 'No special settings needed — just put it in the right place.';
  }
  // structural progress: how far down the required chain does the CURRENT graph already get (respecting IF/Switch/Loop outputs)?
  function guideProgress() {
    const chain = mission.solve, adj = {}; graph.edges.forEach(e => { (adj[e.from] = adj[e.from] || []).push(e); });
    let best = 0, last = null; const seen = new Set();
    const dfs = (id, idx, lastId) => {
      const key = id + ':' + idx; if (seen.has(key)) return; seen.add(key); const n = byId(id); if (!n) return;
      let outC = null;
      if (idx < chain.length && nodeValid(n) && matchItem(n, chain[idx])) { outC = outOf(chain[idx]); idx++; lastId = id; }
      if (idx > best) { best = idx; last = lastId; }
      (adj[id] || []).forEach(e => { if (outC != null && e.o !== outC) return; dfs(e.to, idx, lastId); });
    };
    graph.nodes.filter(isTrigger).forEach(t => dfs(t.id, 0, null));
    return { best, last };
  }
  function guideProblems(best) {
    const out = [], chain = mission.solve, roles = assignRoles(); let fixes = 0;
    roles.forEach((nid, i) => { if (nid == null) return; const mm = mismatches(nid, i); if (mm.length) { fixes++; out.push(`<b>${esc(byId(nid).type)}</b>: ${mm.join('; ')} <button class="gs-fix-s" data-fix="${nid}">🔧 Fix</button>`); } });
    if (fixes > 1) out.unshift('<button class="gs-fix-s" data-fixall="1">🔧 Fix all settings</button>');
    graph.nodes.filter(n => !roles.includes(n.id)).forEach(n => { if (!nodeValid(n)) out.push(`<b>${esc(n.type)}</b> is missing its ${n.type === 'Webhook' ? 'Path' : 'URL'} — double-click it to set one.`); });
    const linked = new Set(); graph.edges.forEach(e => { linked.add(e.from); linked.add(e.to); });
    const loose = graph.nodes.filter(n => graph.nodes.length > 1 && !linked.has(n.id)).length;
    if (loose) out.push(`${loose} node${loose > 1 ? 's aren’t' : ' isn’t'} connected to anything. Drag from a node’s <b>right dot</b> onto the next node.`);
    graph.nodes.filter(n => n.type === 'Loop Over Items').forEach(l => {
      const loopOut = graph.edges.some(e => e.from === l.id && e.o === 1), back = graph.edges.filter(e => e.to === l.id).length > 1;
      if (loopOut && !back) out.push('Your <b>Loop Over Items</b> has no way back: connect the <b>last node of the loop</b> into the Loop node again, or it will only process the first batch.');
    });
    graph.nodes.filter(n => n.type === 'Merge').forEach(m => { if (graph.edges.filter(e => e.to === m.id).length < 1) out.push('<b>Merge</b> has two inputs — connect a branch to each one.'); });
    if (best < chain.length) {
      const want = chain[best], t = stepType(want), kw = stepKw(want), cand = graph.nodes.filter(n => n.type === t);
      if (kw && cand.length && !cand.some(n => String(n.params.url || '').toLowerCase().includes(kw))) out.push(`Your <b>${esc(t)}</b> URL needs to contain <code>${esc(kw)}</code>.`);
      else if (cand.length && best > 0) { const o = outOf(chain[best - 1]); out.push(`You have a <b>${esc(t)}</b> node, but it isn’t connected after step ${best}${o != null ? ` — use the <b>${esc(BY[stepType(chain[best - 1])].outs[o])}</b> output of the previous node` : ''}.`); }
    }
    return out;
  }
  function refreshGuide() {
    if (!root || !mission || !graph) return; const el = $('ed-guide'); if (!el) return;
    const chain = mission.solve, help = (window.HELP && HELP[mission.id]) || [], { best, last } = guideProgress(), problems = guideProblems(best), roles = assignRoles();
    if (best !== lastBest) { lastBest = best; manualOpen = false; }            // progress changed: follow the current step again
    if (!manualOpen) openStep = Math.min(best, chain.length - 1);
    $('gd-count').textContent = best + '/' + chain.length;
    const steps = chain.map((item, i) => {
      const t = stepType(item), def = BY[t], h = help[i] || [def.desc, '', ''], st = i < best ? 'done' : i === best ? 'cur' : 'todo', open = i === openStep;
      return `<li class="gs ${st}${open ? ' open' : ''}" data-i="${i}">
        <div class="gs-top"><span class="gs-n">${st === 'done' ? '✔' : i + 1}</span><span class="pal-ic" style="background:${def.color}">${esc(def.ic)}</span><b>${esc(item === '*Trigger' ? 'Any trigger' : t)}</b>${st === 'cur' ? '<em>NEXT</em>' : ''}</div>
        <div class="gs-note">${h[0]}</div>
        <div class="gs-more">
          <div class="gs-k">SET UP</div><div>${h[3] || cfgText(item)}</div>${roles[i] != null ? `<button class="gs-fix" data-fix="${roles[i]}">🔧 Fix this node’s settings</button>` : ''}
          <div class="gs-io"><div><div class="gs-k">DATA IN</div><code>${h[1] || '—'}</code></div><div><div class="gs-k">DATA OUT</div><code>${h[2] || '—'}</code></div></div>
          ${st !== 'done' ? `<button class="gs-add" data-add="${i}">＋ Add ${esc(item === '*Trigger' ? 'Manual Trigger' : t)} &amp; connect</button>` : ''}
        </div></li>`;
    }).join('');
    const allDone = best >= chain.length;
    el.innerHTML = `<div class="gd-bar"><div style="width:${Math.round(best / chain.length * 100)}%"></div></div>
      <div class="gd-title">Build order <span>${best} of ${chain.length} steps connected</span></div>
      <ol class="gd-steps">${steps}</ol>
      ${allDone ? '<div class="gd-ok">✔ Everything is in place. Press <b>Execute workflow</b> to run it!</div>' : ''}
      ${problems.length ? `<div class="gd-warn"><div class="gs-k">⚠ THINGS TO FIX</div>${problems.map(p => `<div>${p}</div>`).join('')}</div>` : ''}
      <details class="gd-how"><summary>How does this editor work?</summary><ol><li><b>Add</b> a node: drag it from <i>Nodes</i> or press “Add &amp; connect” above.</li><li><b>Connect</b>: drag from a node’s right-hand dot onto the next node.</li><li><b>Configure</b>: double-click a node to open its settings.</li><li><b>Run</b>: press Execute workflow. Delete removes a selected node or line.</li></ol></details>`;
    el.querySelectorAll('.gs-top').forEach(x => { x.onclick = () => { const i = +x.parentNode.dataset.i; openStep = openStep === i ? -1 : i; manualOpen = true; refreshGuide(); }; });
    el.querySelectorAll('[data-fix]').forEach(b => { b.onclick = ev => { ev.stopPropagation(); fixNode(+b.dataset.fix); }; });
    el.querySelectorAll('[data-fixall]').forEach(b => { b.onclick = () => fixAll(); });
    updateFlags();
    el.querySelectorAll('[data-add]').forEach(b => { b.onclick = ev => { ev.stopPropagation(); addStepNode(+b.dataset.add); }; });
    // glow the palette item for the next step
    const want = best < chain.length ? stepType(chain[best]) : null;
    root.querySelectorAll('.pal-item').forEach(it => it.classList.toggle('next', it.dataset.t === want));
  }
  function addStepNode(i) {
    const chain = mission.solve, item = chain[i], type = stepType(item), { best, last } = guideProgress(), prev = last != null ? byId(last) : null;
    const prevOut = best > 0 ? (outOf(chain[best - 1]) || 0) : 0;
    // reuse an existing node only for a true loop-back step (same node type, no endpoint keyword — e.g. “Loop Over Items” appearing twice).
    // Two different HTTP Requests (deploy / status) are separate nodes and must NOT be merged.
    const existing = (!stepKw(item) && chain.slice(0, i).some(it => stepType(it) === type && !stepKw(it))) ? graph.nodes.find(n => n.type === type) : null;
    if (existing && prev) {                                            // e.g. the loop-back into “Loop Over Items”
      if (!graph.edges.some(e => e.from === prev.id && e.o === prevOut && e.to === existing.id)) graph.edges.push({ from: prev.id, o: prevOut, to: existing.id, toIn: 0 });
      persist(); drawEdges(); select({ kind: 'node', id: existing.id }); return;
    }
    let x = prev ? prev.x + 150 : 60, y = prev ? prev.y + (prevOut > 1 ? 100 : prevOut === 1 ? 70 : 0) : 120;
    while (graph.nodes.some(n => Math.abs(n.x - x) < 110 && Math.abs(n.y - y) < 90)) y += 100;
    const n = addNode(type, x, y);
    if (prev && !BY[type].trigger) graph.edges.push({ from: prev.id, o: prevOut, to: n.id, toIn: 0 });
    persist(); drawEdges(); select({ kind: 'node', id: n.id }); fit();
    if (BY[type].params.length) openDrawer(n.id); else setTimeout(() => reveal(n.id), 50);
  }

  // ---------------------------------------------------------------- completion
  function complete() {
    UI.complete(mission.id);
    Cutscene.play(mission, showCard);                          // reward: a short cinematic, then the card
  }
  function showCard() {
    const next = MISSIONS[mission.id], d = $('ed-done');
    d.innerHTML = `<div class="done-card">
      <div class="done-k">MISSION ${String(mission.id).padStart(2, '0')} COMPLETE</div><h2>${esc(mission.title)}</h2>
      <p>${esc(mission.reward)}</p>
      <div class="done-b">${next ? '<button id="d-next">NEXT MISSION ›</button>' : '<div class="done-fin">Mars is open for business.</div>'}<button class="ghost" id="d-stay">KEEP EDITING</button></div></div>`;
    d.classList.add('on'); $('d-stay').onclick = () => d.classList.remove('on');
    if (next) $('d-next').onclick = () => { d.classList.remove('on'); close(); UI.show(next); };
  }

  // ---------------------------------------------------------------- open / close
  function open(m) {
    if (!root) build();
    mission = m; graph = graphs[m.id] || (graphs[m.id] = { nodes: [], edges: [], n: 1 }); selected = null; openNode = null; lastRun = null; ranOnce = false;
    graph.nodes = graph.nodes.filter(n => BY[n.type]); graph.nodes.forEach(n => BY[n.type].params.forEach(p => { if (n.params[p.k] === undefined) n.params[p.k] = p.def; }));
    $('ed-title').textContent = `${String(m.id).padStart(2, '0')} · ${m.title}`;
    $('ed-brief').innerHTML = `<div class="b-k">OBJECTIVE</div><div>${esc(m.objective)}</div><div class="b-api">${esc(m.api)}</div>
      <div class="b-chips">${m.nodes.map(n => `<span>${esc(n)}</span>`).join('')}</div>`;
    nodesEl.innerHTML = ''; graph.nodes.forEach(n => nodesEl.appendChild(nodeEl(n))); logBody.innerHTML = ''; closeDrawer(); $('ed-done').classList.remove('on');
    graph.edges.forEach(e => { e.state = ''; }); updateEmpty(); drawEdges();
    root.classList.add('on'); window.EDITING = true; scale = 1; tx = 60; ty = 70; applyView(); fit(); openStep = null; lastBest = -1; manualOpen = false; showTab('guide'); refreshGuide();
    log('info', 'Build a workflow that solves the mission, then press <b>Execute workflow</b>. Double-click a node to configure it.');
  }
  function close() { if (!root) return; root.classList.remove('on'); window.EDITING = false; }

  // developer helpers: build a mission's reference solution (all of it, or the first k nodes) — see dev-solutions.js
  function loadSolution(m, k) {
    const sol = SOLUTIONS[m.id]; open(m); graph.nodes = []; graph.edges = []; graph.n = 1; nodesEl.innerHTML = '';
    const ids = [];
    sol.nodes.slice(0, k == null ? sol.nodes.length : k).forEach(([type, params], i) => { const n = addNode(type, 40 + (i % 5) * 170, 120 + Math.floor(i / 5) * 150 + (i % 2) * 40, params); ids.push(n.id); });
    sol.edges.forEach(([a, o, b, ti]) => { if (ids[a] && ids[b]) graph.edges.push({ from: ids[a], o, to: ids[b], toIn: ti || 0 }); });
    persist(); drawEdges(); fit();
  }
  async function autoSolve(m) { loadSolution(m); await run(); }
  function demoPartial(m, k) { loadSolution(m, k); }

  window.Editor = { getGraphs: () => graphs, setGraphs: g => { Object.keys(graphs).forEach(k => delete graphs[k]); Object.assign(graphs, g); }, open, close, autoSolve, demoPartial, loadSolution, openDrawer, fixNode, ids: () => graph.nodes.map(n => n.id), addStep: i => addStepNode(i), addEdge: (a, o, b) => { graph.edges.push({ from: graph.nodes[a].id, o, to: graph.nodes[b].id, toIn: 0 }); persist(); drawEdges(); }, breakNode: (i, k, v) => { graph.nodes[i].params[k] = v; persist(); } };
})();
