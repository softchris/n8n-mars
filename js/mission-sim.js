/* The outside world for each mission: what the triggers deliver, how Mission Control's API behaves,
   what the AI says, and — most importantly — the GOAL the player's workflow must achieve.
   Each mission runs the workflow against several SCENARIOS (e.g. battery low vs. battery fine) and the workflow must do
   the right thing in every one of them. */
(function () {
  const clone = o => JSON.parse(JSON.stringify(o));
  const J = o => [{ json: o }];
  const parseQ = u => { const q = {}; (String(u).split('?')[1] || '').split('&').forEach(p => { if (!p) return; const [k, v] = p.split('='); q[decodeURIComponent(k)] = decodeURIComponent(v || ''); }); return q; };

  function makeWorld({ triggers = {}, routes = [], tables = {}, ai, sub, state = {} }) {
    const W = { clock: 0, events: [], state, tables: clone(tables) };
    W.trigger = type => triggers[type] ? clone(triggers[type]) : (type === 'Error Trigger' ? null : undefined);
    W.api = (method, url, body) => {
      const u = String(url), route = routes.find(r => u.toLowerCase().includes(r.key)); let res;
      if (!route) res = { status: 404, json: { error: `No endpoint matches “${u}”. Use the endpoint named in the mission brief.` } };
      else if (route.method !== method) res = { status: 405, json: { error: `The ${route.key} endpoint expects ${route.method}, not ${method}.` } };
      else res = route.h({ body: body || {}, q: parseQ(u), W, url: u });
      W.events.push({ kind: 'http', key: route && route.key, method, url: u, body: body || {}, status: res.status, json: res.json });
      W.clock += 5;                                       // every round-trip to Mission Control takes about 5 s of mission time
      return res;
    };
    W.ai = (p, kind) => { if (!ai) return 'OK.'; return ai(p, kind, W); };
    W.sub = (name, item) => { if (!sub) return [{ json: Object.assign({}, item.json, { workflow: name }) }]; const r = sub(name, item, W); W.events.push({ kind: 'sub', name, item: item.json }); return r; };
    return W;
  }
  const ok = (json, status = 200) => ({ status, json });
  const bad = (msg, status = 400) => ({ status, json: { error: msg } });
  const evs = (runs, i, kind, pred) => (runs[i] ? runs[i].events : []).filter(e => e.kind === kind && (!pred || pred(e)));
  const nodesOf = (run, type) => Object.values(run.nodes).filter(r => r.type === type);
  const firstError = runs => { for (const r of runs) if (r.errors && r.errors.length) return r.errors[0]; return null; };
  const R = (okv, msg, fix) => ({ ok: okv, msg: okv ? 'Mission objective achieved!' : msg, fix: okv ? null : (fix || null) });
  // ---- wiring fixes: { label, remove:[{from,o,to}], add:[{from,o,to,toIn}], mark:[edge objects to draw in red] }
  const typeOf = (g, id) => (g.nodes.find(n => n.id === id) || {}).type || '';
  const http = (g, kw) => g.nodes.find(n => n.type === 'HTTP Request' && String(n.params.url || '').toLowerCase().includes(kw));
  function wireFix(g, routerType, target, outIdx, label) {       // make sure `target` hangs off output `outIdx` of the router (IF / Switch)
    const router = g.nodes.find(n => n.type === routerType), tgt = typeof target === 'function' ? g.nodes.find(target) : target; if (!router || !tgt) return null;
    const cur = g.edges.filter(e => e.from === router.id && e.to === tgt.id); if (cur.some(e => e.o === outIdx)) return null;
    if (!cur.length) return null;                               // not connected at all: the Guide's “Add & connect” handles that
    return { label, remove: cur.map(e => ({ from: e.from, o: e.o, to: e.to })), add: [{ from: router.id, o: outIdx, to: tgt.id, toIn: 0 }], mark: cur };
  }

  const SIM = {};

  // 1 · Phone Home --------------------------------------------------------------------------------------------
  SIM[1] = {
    scenarios: ['Earth sends the handshake'],
    world: () => makeWorld({
      triggers: { Webhook: J({ headers: { host: 'mars-ops' }, params: {}, query: {}, body: { token: 'EARTH-7731', from: 'Earth Mission Control' } }) },
      routes: [{ key: 'handshake', method: 'POST', h: ({ body }) => body.token === 'EARTH-7731' ? ok({ link: 'OPEN', station: 'EARTH-1', message: 'We hear you, Mars.' }) : bad('Missing or invalid token — you sent ' + JSON.stringify(body) + '. Earth’s token arrived in the webhook’s body: open the Webhook node after a run and look at its OUTPUT.') }]
    }),
    goal: runs => {
      const r = runs[0]; if (r.aborted) return R(false, 'Fix the Webhook/Respond setup first.');
      const h = evs(runs, 0, 'http', e => e.key === 'handshake' && e.status === 200);
      if (!h.length) return R(false, 'Mission Control has not accepted a handshake yet. POST to the <b>handshake</b> endpoint with <b>Send Body</b> on, and include the <b>token</b> from the webhook (<code>{{ $json.body.token }}</code>).');
      if (!evs(runs, 0, 'respond').length) return R(false, 'The link is open, but Earth is still waiting for an answer — add a <b>Respond to Webhook</b> node after the HTTP Request.');
      return R(true);
    }
  };

  // 2 · Wheels Down -------------------------------------------------------------------------------------------
  SIM[2] = {
    scenarios: [''],
    world: () => makeWorld({
      state: { dep: null },
      routes: [
        { key: 'deploy', method: 'POST', h: ({ W }) => { W.state.dep = W.clock; return ok({ rover: 'DEPLOYING', eta_s: 240 }); } },
        { key: 'status', method: 'GET', h: ({ W }) => W.state.dep == null ? ok({ rover: 'STOWED' }) : (W.clock - W.state.dep >= 240 ? ok({ rover: 'READY', battery: 98 }) : ok({ rover: 'DEPLOYING', remaining_s: 240 - (W.clock - W.state.dep) })) }]
    }),
    goal: (runs, m, g) => {
      const loopFix = () => {
        const dep = http(g, 'deploy'), wait = g.nodes.find(n => n.type === 'Wait'), iff = g.nodes.find(n => n.type === 'IF'); if (!dep || !wait || !iff) return null;
        const bad = g.edges.filter(e => (e.to === dep.id && !/Trigger$/.test(typeOf(g, e.from))) || (e.from === iff.id && e.o === 0 && e.to === wait.id)); if (!bad.length) return null;
        const need = !g.edges.some(e => e.from === iff.id && e.o === 1 && e.to === wait.id);
        return { label: 'Fix the loop: send the IF’s false output back to the Wait', remove: bad.map(e => ({ from: e.from, o: e.o, to: e.to })), add: need ? [{ from: iff.id, o: 1, to: wait.id, toIn: 0 }] : [], mark: bad };
      };
      const deploys = evs(runs, 0, 'http', e => e.key === 'deploy').length;
      if (deploys > 2) return R(false, `Your workflow sent the deploy command <b>${deploys} times</b>. Look for the connection drawn in <b style="color:#ff8a8f">red</b>: it leads back <i>into the deploy call</i>, so every pass redeploys the rover and restarts its 240 s countdown — it can never reach READY.<br>Deploy should happen <b>once</b>. If you want to keep checking until the rover is ready, the loop must go back to the <b>Wait</b> node (from the IF’s <b>false</b> output) — not to the deploy call.`, loopFix());
      if (runs[0].errors.some(e => /kept looping/.test(e.msg))) return R(false, 'Your workflow keeps looping and never finishes. To poll: connect only the IF’s <b>false</b> output back to the <b>Wait</b> node (never the true output — that is where READY leaves), and wait ~30 s between checks. The connection that causes the endless loop is drawn in <b style="color:#ff8a8f">red</b>.', loopFix());
      if (!evs(runs, 0, 'http', e => e.key === 'deploy' && e.status === 200).length) return R(false, 'Send the deploy command first: <b>POST</b> to the <b>deploy</b> endpoint.');
      const st = evs(runs, 0, 'http', e => e.key === 'status');
      if (!st.length) return R(false, 'Now ask the rover how it is doing: <b>GET</b> the <b>status</b> endpoint.');
      if (!st.some(e => e.json.rover === 'READY')) return R(false, 'The rover wasn’t READY when you asked: <code>' + JSON.stringify(st[st.length - 1].json) + '</code>. Deployment takes <b>240 s</b> (see <code>eta_s</code>). Either make the <b>Wait</b> node wait that long — or <b>poll</b>: connect the IF’s <b>false</b> output back into the Wait node so it keeps checking until READY.');
      const ifs = nodesOf(runs[0], 'IF');
      if (!ifs.length) return R(false, 'Add an <b>IF</b> node after the status call to check that the rover is READY.');
      if (!ifs.some(r => (r.out[0] || []).some(i => i.json.rover === 'READY'))) return R(false, 'Your IF node didn’t send the READY item to its <b>true</b> output. Check the condition: <code>{{ $json.rover }}</code> is equal to <code>READY</code>.');
      return R(true);
    }
  };

  // 3 · Something in the Dust ---------------------------------------------------------------------------------
  const SCANS = [{ anomaly_score: 0.93, feature: 'unknown metallic object', sol: 112 }, { anomaly_score: 0.12, feature: 'ordinary basalt', sol: 113 }];
  SIM[3] = {
    scenarios: ['Sol 112 — a strange reading', 'Sol 113 — just rocks'],
    world: si => makeWorld({
      triggers: { 'Schedule Trigger': J({ timestamp: '2031-04-02T06:00:00Z' }) },
      routes: [{ key: 'scan', method: 'GET', h: () => ok(SCANS[si]) },
               { key: 'reports', method: 'POST', h: ({ body }) => (body.feature && body.anomaly_score != null) ? ok({ received: true }) : bad('A report needs both “feature” and “anomaly_score”.') }]
    }),
    goal: (runs, m, g) => {
      const e = firstError(runs); const fx = () => wireFix(g, 'IF', http(g, 'reports'), 0, 'Fix: connect the report to the IF’s true output');
      const rep0 = evs(runs, 0, 'http', x => x.key === 'reports' && x.status === 200), rep1 = evs(runs, 1, 'http', x => x.key === 'reports');
      if (!evs(runs, 0, 'http', x => x.key === 'scan').length) return R(false, 'Fetch the rover scan first: <b>GET</b> the <b>scan</b> endpoint.');
      if (!rep0.length) return R(false, 'Sol 112 had an anomaly (score 0.93) but nothing was reported to Earth. Connect the <b>true</b> output of your IF to a <b>POST</b> to the <b>reports</b> endpoint, sending <code>feature</code> and <code>anomaly_score</code> in the body.' + (e ? ' First error: ' + e.msg : ''), fx());
      if (rep1.length) return R(false, 'On Sol 113 the scan was just rocks (score 0.12) but you reported it anyway. Only anomalies above your threshold (say 0.8) should go to Earth — check the IF condition and which output you connected.', fx());
      return R(true);
    }
  };

  // 4 · Keep the Lights On ------------------------------------------------------------------------------------
  SIM[4] = {
    scenarios: ['Battery at 18%', 'Battery at 64%'],
    world: si => makeWorld({
      triggers: { 'Schedule Trigger': J({ timestamp: '2031-04-02T18:00:00Z' }) },
      routes: [{ key: 'power', method: 'GET', h: () => ok({ solar_w: 210, battery_pct: [18, 64][si] }) }]
    }),
    goal: (runs, m, g) => {
      const fx = () => wireFix(g, 'IF', n => n.type === 'Slack', 0, 'Fix: connect Slack to the IF’s true output');
      if (!evs(runs, 0, 'http', e => e.key === 'power').length) return R(false, 'Read the power telemetry first: <b>GET</b> the <b>power</b> endpoint.');
      if (!evs(runs, 0, 'slack').length) return R(false, 'The battery was at 18% but nobody was warned. Compare <code>{{ $json.battery_pct }}</code> <b>is less than</b> <code>20</code> in an IF node, and connect its <b>true</b> output to Slack (with a credential selected).', fx());
      if (evs(runs, 1, 'slack').length) return R(false, 'At 64% the battery is fine, but you still alerted the crew. The Slack node must be connected to the IF’s <b>true</b> output only.', fx());
      return R(true);
    }
  };

  // 5 · Storm Front -------------------------------------------------------------------------------------------
  SIM[5] = {
    scenarios: ['HIGH severity', 'MEDIUM severity', 'LOW severity'],
    world: si => makeWorld({ triggers: { Webhook: J({ headers: {}, params: {}, query: {}, body: { severity: ['HIGH', 'MEDIUM', 'LOW'][si], eta_h: 6 } }) } }),
    goal: (runs, m, g) => {
      const e = firstError(runs), fx = () => wireFix(g, 'Switch', n => n.type === 'Telegram', 0, 'Fix: connect Telegram to the Switch’s first output (the HIGH rule)');
      if (!evs(runs, 0, 'telegram').length) return R(false, 'A HIGH severity storm should reach the crew on Telegram. Use a <b>Switch</b> with a rule like <code>{{ $json.body.severity }}</code> <b>is equal to</b> <code>HIGH</code>, then connect that rule’s output to Telegram (credential selected, a Chat ID and some text).' + (e ? ' First error: ' + e.msg : ''), fx());
      if (evs(runs, 2, 'telegram').length) return R(false, 'A LOW severity storm shouldn’t wake the crew. Only the HIGH rule’s output should lead to Telegram.', fx());
      return R(true);
    }
  };

  // 6 · Ice Hunt ----------------------------------------------------------------------------------------------
  const ICE = [3.1, 8.4, 12.2, 5.0, 19.8, 2.2, 31.2, 14.0, 9.9, 4.4, 22.5];
  SIM[6] = {
    scenarios: [''],
    world: () => makeWorld({
      triggers: { 'Manual Trigger': ICE.map((_, i) => ({ json: { site: i + 1 } })) },
      routes: [{ key: 'spectrometer', method: 'GET', h: ({ q }) => q.site ? ok({ site: +q.site, ice_pct: ICE[+q.site - 1] }) : bad('Tell the spectrometer which site to read: add ?site=… to the URL.') }]
    }),
    goal: (runs, m, g) => {
      const loopFx = () => { const loop = g.nodes.find(n => n.type === 'Loop Over Items'), h = http(g, 'spectrometer'); if (!loop || !h) return null; const add = [];
        if (!g.edges.some(e => e.from === loop.id && e.o === 1 && e.to === h.id)) add.push({ from: loop.id, o: 1, to: h.id, toIn: 0 });
        if (!g.edges.some(e => e.from === h.id && e.to === loop.id)) add.push({ from: h.id, o: 0, to: loop.id, toIn: 0 });
        return add.length ? { label: 'Fix the loop: Loop → HTTP Request → back into Loop Over Items', remove: [], add, mark: [] } : null; };
      const calls = evs(runs, 0, 'http', e => e.key === 'spectrometer' && e.status === 200), sites = new Set(calls.map(c => c.json.site));
      if (!calls.length) return R(false, 'Visit the sites: inside the loop, <b>GET</b> the <b>spectrometer</b> endpoint with <code>?site={{ $json.site }}</code>.');
      const err = runs[0].errors.find(x => /never reached/.test(x.msg));
      if (sites.size < ICE.length) return R(false, `Only ${sites.size} of ${ICE.length} sites were read. ${err ? 'The loop never finished — ' : ''}connect the end of the loop branch <b>back into Loop Over Items</b> so it keeps sending the next site.`, loopFx());
      const rows = evs(runs, 0, 'table', e => (e.row.best_site || e.row.site) == 7);
      if (!evs(runs, 0, 'table').length) return R(false, 'All sites are read. Now pick the winner (highest <code>ice_pct</code>) in a <b>Code</b> node and save it with <b>Data table → Insert row</b>.');
      if (!rows.length) return R(false, 'The row you saved isn’t the best site. The highest ice concentration is at <b>site 7</b> (31.2%). Check how your Code node picks the maximum.');
      return R(true);
    }
  };

  // 7 · Breathe Easy ------------------------------------------------------------------------------------------
  SIM[7] = {
    scenarios: ['Dip, then recovery (noise)', 'Dip that stays low (real problem)'],
    world: si => makeWorld({
      triggers: { Webhook: J({ headers: {}, params: {}, query: {}, body: { o2_pct: 17.9 } }) },
      routes: [
        { key: 'oxygen', method: 'GET', h: ({ W }) => W.clock >= 30 ? ok({ o2_pct: si === 0 ? 20.8 : 17.5 }) : ok({ o2_pct: 17.9, note: 'sensor has not refreshed yet' }) },
        { key: 'alerts', method: 'POST', h: () => ok({ ticket: 'ALERT-1' }) }]
    }),
    goal: (runs, m, g) => {
      const fx = () => wireFix(g, 'IF', http(g, 'alerts'), 0, 'Fix: connect the alert to the IF’s true output');
      if (!evs(runs, 0, 'http', e => e.key === 'oxygen').length) return R(false, 'Re-check the oxygen after a pause: <b>Filter</b> (low readings) → <b>Wait</b> → <b>GET</b> the <b>oxygen</b> endpoint → <b>IF</b> it is still low.');
      if (evs(runs, 0, 'http', e => e.key === 'alerts').length) return R(false, 'In the first scenario the oxygen recovered by itself, but you escalated anyway. Wait at least <b>30 s</b> before re-checking (the sensor needs time to refresh), and only escalate from the IF’s <b>true</b> output.', fx());
      if (!evs(runs, 1, 'http', e => e.key === 'alerts').length) return R(false, 'The oxygen stayed low after the re-check but nobody was alerted. Connect the IF’s <b>true</b> output to a <b>POST</b> to the <b>alerts</b> endpoint.', fx());
      return R(true);
    }
  };

  // 8 · Green Thumbs ------------------------------------------------------------------------------------------
  const MOIST = [.5, .22, .6, .18, .7, .4, .25, .55, .35, .12, .8, .45], LIGHT = [.9, .8, .4, .7, .3, .85, .6, .45, .9, .7, .5, .2];
  SIM[8] = {
    scenarios: [''],
    world: () => makeWorld({
      triggers: { 'Schedule Trigger': J({ timestamp: '2031-04-03T06:00:00Z' }) },
      routes: [
        { key: 'sensors', method: 'GET', h: () => ok(MOIST.map((m, i) => ({ tray: i + 1, moisture: m, light: LIGHT[i] }))) },
        { key: 'actuate', method: 'POST', h: ({ body }) => (body.tray && ['water', 'light'].includes(body.action)) ? ok({ ok: true }) : bad('Send { "tray": <number>, "action": "water" | "light" }.') }]
    }),
    goal: runs => {
      const calls = evs(runs, 0, 'http', e => e.key === 'actuate' && e.status === 200), got = new Set(calls.map(c => c.body.tray + ':' + c.body.action)), want = new Set();
      MOIST.forEach((m, i) => { if (m < .3) want.add((i + 1) + ':water'); if (LIGHT[i] < .5) want.add((i + 1) + ':light'); });
      if (!evs(runs, 0, 'http', e => e.key === 'sensors').length) return R(false, 'Read every tray first: <b>GET</b> the <b>sensors</b> endpoint (it returns one item per tray).');
      const missing = [...want].filter(x => !got.has(x)), extra = [...got].filter(x => !want.has(x));
      if (missing.length) return R(false, 'Some trays still need care: ' + missing.map(x => 'tray ' + x.replace(':', ' → ')).join(', ') + '. Route with a <b>Switch</b>: <code>{{ $json.moisture }}</code> is less than <code>0.3</code> → water, <code>{{ $json.light }}</code> is less than <code>0.5</code> → light, then POST the right <code>action</code>.');
      if (extra.length) return R(false, 'You acted on trays that were fine: ' + extra.join(', ') + '. Only trays under the thresholds (moisture < 0.3, light < 0.5) need action.');
      return R(true);
    }
  };

  // 9 · Daily Check-In ----------------------------------------------------------------------------------------
  const CREW = [['Ana', 5, 'Slept well'], ['Ben', 4, 'Tired but fine'], ['Chidi', 4, 'Greenhouse looks great'], ['Dara', 3, 'Missing home'], ['Eli', 5, 'Ready'], ['Fay', 4, 'Back ache'], ['Gus', 4, 'All good']];
  SIM[9] = {
    scenarios: [''],
    world: () => makeWorld({
      triggers: { 'Form Trigger': CREW.map(c => ({ json: { name: c[0], mood: c[1], notes: c[2] } })) },
      ai: p => /Ana|Ben|Chidi|mood/.test(p) ? 'Crew report: 7 of 7 members checked in. Average mood 4.1/5. Notes: Dara is missing home; Fay has a sore back; the greenhouse is cheering everyone up.' : 'I don’t see any crew check-ins to summarise. (Did you pass the aggregated data into the prompt?)'
    }),
    goal: runs => {
      const g = evs(runs, 0, 'gmail');
      if (!g.length) return R(false, 'No email was sent. Collect the 7 submissions with <b>Aggregate</b>, summarise them with the <b>AI Agent</b>, then <b>Gmail</b> (credential, To, Subject, Message).');
      if (!g.some(e => /Crew report/.test(e.message))) return R(false, 'The email didn’t contain the summary. Put the AI’s answer into the Gmail message with <code>{{ $json.output }}</code>, and make sure the AI prompt includes the check-ins: <code>{{ JSON.stringify($json.data) }}</code>.');
      return R(true);
    }
  };

  // 10 · Rock Detective ---------------------------------------------------------------------------------------
  const ROCKS = [{ id: 217, color: 'dark grey', texture: 'fine grained', density: 3.0, type: 'basalt' }, { id: 218, color: 'red', texture: 'banded', density: 5.2, type: 'hematite' }, { id: 219, color: 'white', texture: 'soft and chalky', density: 2.3, type: 'gypsum' }];
  SIM[10] = {
    scenarios: ROCKS.map(r => 'Rock #' + r.id),
    world: si => makeWorld({
      triggers: { Webhook: J({ headers: {}, params: {}, query: {}, body: { id: ROCKS[si].id, color: ROCKS[si].color, texture: ROCKS[si].texture, density: ROCKS[si].density } }) },
      ai: p => /fine grained/.test(p) ? 'basalt' : /banded/.test(p) ? 'hematite' : /chalky/.test(p) ? 'gypsum' : 'unknown — I was not given any rock features'
    }),
    goal: runs => {
      for (let i = 0; i < ROCKS.length; i++) {
        const rows = evs(runs, i, 'table');
        if (!rows.length) return R(false, `Rock #${ROCKS[i].id}: nothing was saved. Classify with the <b>AI Agent</b> (put the rock’s features in the prompt, e.g. <code>{{ JSON.stringify($json.body) }}</code>) and save the result with <b>Data table → Insert row</b>.`);
        if (!rows.some(r => JSON.stringify(r.row).includes(ROCKS[i].type))) return R(false, `Rock #${ROCKS[i].id} should be classified as <b>${ROCKS[i].type}</b>, but the saved row says <code>${JSON.stringify(rows[0].row)}</code>. The AI can only classify what it is shown — include the rock’s color, texture and density in the prompt.`);
      }
      return R(true);
    }
  };

  // 11 · Eyes in the Sky --------------------------------------------------------------------------------------
  const WPS = [{ x: 1200, y: 340 }, { x: 1580, y: 410 }, { x: 1830, y: 620 }, { x: 2050, y: 540 }, { x: 2310, y: 700 }];
  SIM[11] = {
    scenarios: [''],
    world: () => makeWorld({
      triggers: { 'Manual Trigger': J({ waypoints: WPS }) },
      routes: [{ key: 'drone', method: 'POST', h: ({ body }) => (body.x != null && body.y != null) ? ok({ flight: 'COMPLETE', images: 14, x: body.x, y: body.y }) : bad('The drone needs { "x": …, "y": … } for each flight.') }]
    }),
    goal: runs => {
      const f = evs(runs, 0, 'http', e => e.key === 'drone' && e.status === 200), uniq = new Set(f.map(e => e.body.x + ',' + e.body.y));
      if (!f.length) return R(false, 'Fly the drone: <b>Split Out</b> the <code>waypoints</code> list, then <b>POST</b> each waypoint (<code>x</code> and <code>y</code>) to the <b>drone</b> endpoint. Hint: after Split Out the fields are <code>{{ $json.waypoints.x }}</code>.');
      if (uniq.size < WPS.length) return R(false, `Only ${uniq.size} of ${WPS.length} different waypoints were flown. Make sure every item goes through the HTTP Request with its own coordinates.`);
      const codes = nodesOf(runs[0], 'Code');
      if (!codes.some(c => (c.out[0] || []).some(i => i.json.map))) return R(false, 'All flights are done. Finally, stitch the results with a <b>Code</b> node that outputs an item with a <code>map</code> field (for example <code>return [{ json: { map: "canyon.png", flights: items.length } }];</code>).');
      return R(true);
    }
  };

  // 12 · Supply Run -------------------------------------------------------------------------------------------
  const STOCK = [['ration pack', 4], ['oxygen filter', 22], ['water canister', 7], ['spare wheel', 3], ['battery cell', 40], ['bandages', 9], ['fuel cell', 2], ['seeds', 15]];
  SIM[12] = {
    scenarios: [''],
    world: () => makeWorld({
      triggers: { 'Schedule Trigger': J({ timestamp: '2031-04-04T05:00:00Z' }) },
      tables: { inventory: STOCK.map(s => ({ item: s[0], qty: s[1] })) },
      sub: (name, item) => [{ json: Object.assign({}, item.json, { ordered: true, workflow: name }) }]
    }),
    goal: runs => {
      const sub = evs(runs, 0, 'sub').map(e => e.item.item), want = STOCK.filter(s => s[1] < 10).map(s => s[0]);
      if (!nodesOf(runs[0], 'Data table').length) return R(false, 'Read the stock first: <b>Data table → Get row(s)</b> from the table <code>inventory</code>.');
      if (!sub.length) return R(false, 'Nothing was re-ordered. Keep only low items with <b>Filter</b> (<code>{{ $json.qty }}</code> <b>is less than</b> <code>10</code>), then run <b>Execute Workflow</b> for each.');
      const miss = want.filter(x => !sub.includes(x)), extra = sub.filter(x => !want.includes(x));
      if (miss.length || extra.length) return R(false, (miss.length ? 'Still missing: ' + miss.join(', ') + '. ' : '') + (extra.length ? 'You re-ordered items that are fine: ' + extra.join(', ') + '. ' : '') + 'Low means <b>qty below 10</b>.');
      if (!evs(runs, 0, 'gmail').length) return R(false, 'The re-orders are placed. Now email Earth about it with <b>Gmail</b> (credential, To, Subject, Message).');
      return R(true);
    }
  };

  // 13 · Mayday -----------------------------------------------------------------------------------------------
  SIM[13] = {
    scenarios: ['Rover telemetry workflow fails'],
    world: () => makeWorld({
      triggers: { 'Error Trigger': J({ workflow: { name: 'Rover Telemetry' }, execution: { error: { message: 'ECONNRESET: rover link lost' }, lastNodeExecuted: 'HTTP Request' } }) },
      routes: [{ key: 'incidents', method: 'POST', h: ({ body }) => body.incident ? ok({ ticket: 'INC-0042' }) : bad('An incident needs an “incident” field.') }]
    }),
    goal: runs => {
      if (!runs[0].nodes || !Object.values(runs[0].nodes).some(r => r.type === 'Error Trigger')) return R(false, 'Start the workflow with an <b>Error Trigger</b> — it fires whenever another workflow fails.');
      const inc = evs(runs, 0, 'http', e => e.key === 'incidents' && e.status === 200), sl = evs(runs, 0, 'slack');
      if (!sl.length) return R(false, 'Page the crew with <b>Slack</b> (credential, channel, message). Mention what failed, e.g. <code>{{ $json.execution.error.message }}</code>.');
      if (!inc.length) return R(false, 'File the incident: <b>POST</b> to the <b>incidents</b> endpoint with a body containing an <code>incident</code> field.');
      if (!inc.some(e => /ECONNRESET/.test(String(e.body.incident)))) return R(false, 'The incident should describe the real error. Use an expression, e.g. <code>{ "incident": "{{ $json.execution.error.message }}" }</code>.');
      return R(true);
    }
  };

  // 14 · The Signal -------------------------------------------------------------------------------------------
  SIM[14] = {
    scenarios: [''],
    world: () => makeWorld({
      triggers: { Webhook: J({ headers: {}, params: {}, query: {}, body: { raw: 'V0VMQ09NRQ==' } }) },
      ai: p => /WELCOME/i.test(p) ? 'A friendly greeting from an unknown sender: “WELCOME”. No threat detected.' : 'I can’t read this — it looks encoded.'
    }),
    goal: runs => {
      if (runs[0].aborted) return R(false, 'Fix the Webhook/Respond setup first.');
      const rs = evs(runs, 0, 'respond');
      if (!nodesOf(runs[0], 'Code').length) return R(false, 'The transmission is encoded. Decode it in a <b>Code</b> node — it looks like base64: <code>atob($json.body.raw)</code>.');
      if (!rs.length) return R(false, 'Answer the caller with <b>Respond to Webhook</b> (and set the Webhook’s “Respond” to “Using Respond to Webhook node”).');
      if (!rs.some(r => /greeting|WELCOME/i.test(String(typeof r.body === 'object' ? JSON.stringify(r.body) : r.body)))) return R(false, 'Your reply doesn’t say what the signal means. Decode it, give the decoded text to the <b>AI Agent</b>, and respond with its answer: <code>{{ $json.output }}</code>.');
      return R(true);
    }
  };

  // 15 · First Colony Broadcast -------------------------------------------------------------------------------
  const SYSTEMS = [['comms', 'link open'], ['rover', 'ready'], ['power', 'battery 100%'], ['water', 'ice site 7 mapped'], ['food', 'first harvest'], ['crew', '7 of 7 healthy']];
  SIM[15] = {
    scenarios: [''],
    world: () => makeWorld({
      triggers: { 'Manual Trigger': J({}) },
      routes: [{ key: 'broadcast', method: 'POST', h: ({ body }) => (body.text && String(body.text).length > 30) ? ok({ delivered_to: 'all of Earth' }) : bad('The broadcast needs a “text” of at least a sentence.') }],
      sub: name => name === 'all-systems' ? SYSTEMS.map(s => ({ json: { system: s[0], status: s[1] } })) : (() => { throw new N8N.NErr(`The workflow “${name}” doesn't exist.`, 'Use the name all-systems to run every mission workflow.'); })(),
      ai: p => /comms|rover|power/.test(p) ? 'People of Earth: this is Mars. Comms are open, the rover is rolling, we have power, water, food and a healthy crew. We are here to stay.' : 'People of Earth: …(I was not given a status report).'
    }),
    goal: runs => {
      const b = evs(runs, 0, 'http', e => e.key === 'broadcast' && e.status === 200);
      if (!evs(runs, 0, 'sub').length) return R(false, 'Run every mission workflow with <b>Execute Workflow</b> (workflow name <code>all-systems</code>).');
      if (!b.length) return R(false, 'Write the broadcast with the <b>Basic LLM Chain</b> (give it the aggregated status: <code>{{ JSON.stringify($json.data) }}</code>) and <b>POST</b> its <code>{{ $json.text }}</code> as <code>text</code> to the <b>broadcast</b> endpoint.');
      if (!b.some(e => /comms|rover|power/i.test(e.body.text))) return R(false, 'The broadcast didn’t mention any of your systems — the AI needs the status report in its prompt.');
      return R(true);
    }
  };

  window.MISSION_SIM = SIM;
})();
