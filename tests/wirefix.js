// every wiring mistake: run -> must fail with a fix -> apply fix -> run again -> must PASS
global.window = global; const fs = require('fs'), root = require('path').join(__dirname, '..', 'js') + '/';
for (const f of ['n8n.js', 'mission-sim.js', 'missions.js', 'dev-solutions.js']) eval(fs.readFileSync(root + f, 'utf8'));
const build = (id, mut) => { const sol = JSON.parse(JSON.stringify(SOLUTIONS[id])); const g = { nodes: sol.nodes.map(([type, params], i) => ({ id: i + 1, type, params })), edges: sol.edges.map(([a, o, b, t]) => ({ from: a + 1, o, to: b + 1, toIn: t || 0 })) }; mut(g); return g; };
const cases = [
  [2, 'IF false -> DEPLOY again (your case)', g => { g.nodes[2].params.sec = 30; g.edges.push({ from: 5, o: 1, to: 2, toIn: 0 }); }],
  [2, 'IF true -> Wait (infinite)', g => { g.nodes[2].params.sec = 240; g.edges.push({ from: 5, o: 0, to: 3, toIn: 0 }); }],
  [3, 'reports on IF false', g => { g.edges.find(e => e.from === 3).o = 1; }],
  [4, 'Slack on IF false', g => { g.edges.find(e => e.from === 3).o = 1; }],
  [5, 'Telegram on Switch output 2', g => { g.edges.find(e => e.from === 2).o = 1; }],
  [6, 'no loop-back', g => { g.edges = g.edges.filter(e => !(e.from === 3 && e.to === 2)); }],
  [7, 'alert on IF false', g => { g.edges.find(e => e.from === 5).o = 1; }]
];
(async () => { let bad = 0;
  for (const [id, label, mut] of cases) {
    const g = build(id, mut); let r = await N8N.runWorkflow(g, MISSIONS[id - 1], {}, { delay: 0 });
    if (r.goal.ok) { console.log('WRONGLY PASSES (before fix) ' + id + ' ' + label); bad++; continue; }
    const f = r.goal.fix; if (!f) { console.log('NO FIX OFFERED ' + id + ' ' + label + '  → ' + r.goal.msg.replace(/<[^>]+>/g, '').slice(0, 80)); bad++; continue; }
    f.remove.forEach(x => { g.edges = g.edges.filter(e => !(e.from === x.from && e.o === x.o && e.to === x.to)); }); f.add.forEach(x => g.edges.push({ from: x.from, o: x.o, to: x.to, toIn: x.toIn || 0 }));
    r = await N8N.runWorkflow(g, MISSIONS[id - 1], {}, { delay: 0 });
    const ok = r.goal.ok; if (!ok) bad++; console.log((ok ? 'FIXED  ' : 'STILL FAILS ') + id + ' · ' + label + ' → "' + f.label + '"' + (ok ? '' : ' → ' + r.goal.msg.replace(/<[^>]+>/g, '').slice(0, 100)));
  } console.log(bad ? bad + ' PROBLEM(S)' : 'ALL FIXABLE'); })();
