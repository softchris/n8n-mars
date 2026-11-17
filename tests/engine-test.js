// Node harness: loads the real engine + sims + reference solutions, runs everything headless.
global.window = global;
const fs = require('fs'), root = require('path').join(__dirname, '..', 'js') + '/';
for (const f of ['n8n.js', 'mission-sim.js', 'missions.js', 'dev-solutions.js']) { try { eval(fs.readFileSync(root + f, 'utf8')); } catch (e) { console.log('LOAD FAIL', f, e.message); process.exit(1); } }
const build = (sol, mut) => { const g = { nodes: sol.nodes.map(([type, params], i) => ({ id: i + 1, type, params: Object.assign({}, params) })), edges: sol.edges.map(([a, o, b, ti]) => ({ from: a + 1, o, to: b + 1, toIn: ti || 0 })) }; if (mut) mut(g); return g; };
async function go(id, mut) { const m = MISSIONS[id - 1]; const r = await N8N.runWorkflow(build(SOLUTIONS[id], mut), m, {}, { delay: 0 }); return r; }
(async () => {
  let bad = 0;
  for (let id = 1; id <= 15; id++) { const r = await go(id); const ok = r.goal.ok; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + id + ' ' + MISSIONS[id - 1].title + (ok ? '' : '  → ' + r.goal.msg.replace(/<[^>]+>/g, '')) + (r.runs.some(x => x.errors.length) ? '   [errors: ' + r.runs.flatMap(x => x.errors).map(e => e.msg).join(' | ') + ']' : '')); }
  console.log('\n--- must FAIL (wrong on purpose) ---');
  const neg = [
    [2, 'Wait too short (5s)', g => { g.nodes[2].params.sec = 5; }],
    [4, 'Slack on the FALSE output', g => { g.edges[2].o = 1; }],
    [4, 'no credential', g => { g.nodes[3].params.cred = '— select credential —'; }],
    [4, 'IF compares the wrong way (> 20)', g => { g.nodes[2].params.op = 'is greater than'; }],
    [1, 'Respond mode left on Immediately', g => { g.nodes[0].params.respondMode = 'Immediately'; }],
    [1, 'no body sent', g => { g.nodes[1].params.sendBody = 'No'; }],
    [5, 'Telegram on Switch output 2', g => { g.edges[1].o = 1; }],
    [6, 'no loop-back edge', g => { g.edges = g.edges.filter(e => !(e.from === 3 && e.to === 2)); }],
    [6, 'Code picks the minimum', g => { g.nodes[4].params.js = g.nodes[4].params.js.replace('>', '<'); }],
    [7, 'Wait 5s (sensor not refreshed)', g => { g.nodes[2].params.sec = 5; }],
    [8, 'water/light outputs swapped', g => { g.edges = g.edges.map(e => e.from === 3 && e.o === 0 ? Object.assign({}, e, { o: 1 }) : e.from === 3 && e.o === 1 ? Object.assign({}, e, { o: 0 }) : e); }],
    [9, 'AI prompt without the data', g => { g.nodes[2].params.prompt = 'Summarise the crew check-ins please'; }],
    [11, 'Code returns no map', g => { g.nodes[5].params.js = 'return $input.all();'; }],
    [12, 'Filter wrong threshold (<5)', g => { g.nodes[2].params.right = '5'; }],
    [13, 'incident text not from the error', g => { g.nodes[1].params.value = 'something broke'; }],
    [14, 'Code returns an object, not an array', g => { g.nodes[1].params.js = 'return { decoded: 1 };'; }],
    [15, 'unknown sub-workflow name', g => { g.nodes[1].params.wf = 'everything'; }]
  ];
  for (const [id, label, mut] of neg) { const r = await go(id, mut); const failed = !r.goal.ok; if (!failed) bad++; console.log((failed ? 'ok-fails ' : 'WRONGLY PASSES ') + id + ' · ' + label + (failed ? '  → ' + r.goal.msg.replace(/<[^>]+>/g, '').slice(0, 130) : '')); }
  console.log(bad ? '\n' + bad + ' PROBLEM(S)' : '\nALL GOOD');
})();
