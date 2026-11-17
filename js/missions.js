/* The 15 missions. Each one is solved by building the right n8n workflow.
   api  = the (fictional) Mission Control endpoint the workflow talks to — {EARTH} is a placeholder base URL.
   nodes = the n8n building blocks the player is expected to reach for. */
window.MISSIONS = [
  {
    id: 1, tag: 'COMMUNICATIONS', title: 'Phone Home',
    briefing: 'Touchdown confirmed — but nobody on Earth knows yet. Our transmitter is warm and listening. Earth will ping us with a handshake token; we must catch it, answer it, and announce that humanity has arrived on Mars.',
    objective: 'Receive the handshake from Earth on a webhook, then call back Mission Control with the token to open the link.',
    api: 'POST {EARTH}/api/v1/handshake', nodes: ['Webhook', 'Set', 'HTTP Request', 'Respond to Webhook'],
    reward: 'Unlocks: permanent Earth link'
  },
  {
    id: 2, tag: 'ROBOTICS', title: 'Wheels Down',
    briefing: 'The rover is folded in the cargo bay, waiting for a command. Deployment takes minutes and can fail if the ramp jams — so we poll, we never assume.',
    objective: 'Send the deploy command, wait, then poll the rover until its status reads READY.',
    api: 'POST {EARTH}/rover/deploy  ·  GET {EARTH}/rover/status', nodes: ['HTTP Request', 'Wait', 'IF'],
    reward: 'Unlocks: rover telemetry'
  },
  {
    id: 3, tag: 'DISCOVERY', title: 'Something in the Dust',
    briefing: 'The rover scans a new patch of ground every sol. Most of it is rock. Some of it is not. We need something that watches the scans while we sleep, and shouts when it sees an anomaly.',
    objective: 'Scan on a schedule, score each reading, and report to Earth the moment an anomaly crosses the threshold.',
    api: 'GET {EARTH}/rover/scan  ·  POST {EARTH}/reports', nodes: ['Schedule Trigger', 'HTTP Request', 'Code', 'IF', 'Set'],
    reward: 'First discovery logged'
  },
  {
    id: 4, tag: 'POWER', title: 'Keep the Lights On',
    briefing: 'Solar output on Mars is less than half of what it is at home, and the batteries are the only thing between us and a very cold night. Somebody has to watch the numbers.',
    objective: 'Poll solar and battery telemetry every few minutes and alert the crew before the battery drops under 20%.',
    api: 'GET {EARTH}/habitat/power', nodes: ['Schedule Trigger', 'HTTP Request', 'IF', 'Slack'],
    reward: 'Unlocks: night mode'
  },
  {
    id: 5, tag: 'WEATHER', title: 'Storm Front',
    briefing: 'A wall of dust is building to the west. Global storms can blot out the Sun for weeks. The orbiter will push forecasts to us — we choose how loudly to react.',
    objective: 'Receive storm forecasts, route them by severity, and trigger the correct response for each level.',
    api: 'POST {EARTH}/weather/forecast  (webhook)', nodes: ['Webhook', 'Switch', 'HTTP Request', 'Telegram'],
    reward: 'Unlocks: storm shutters'
  },
  {
    id: 6, tag: 'GEOLOGY', title: 'Ice Hunt',
    briefing: 'Water is the difference between a visit and a home. The rover carries a spectrometer; we have eleven candidate sites and only enough battery to drive to one.',
    objective: 'Visit every waypoint, collect the readings, and pick the site with the highest ice concentration.',
    api: 'POST {EARTH}/rover/goto  ·  GET {EARTH}/rover/spectrometer', nodes: ['Loop Over Items', 'HTTP Request', 'Aggregate', 'Code', 'Data table'],
    reward: 'Unlocks: water extraction site'
  },
  {
    id: 7, tag: 'LIFE SUPPORT', title: 'Breathe Easy',
    briefing: 'The oxygen generators report in every few seconds. A single low reading is noise. Three in a row is a problem. Nobody wants to be woken up by noise.',
    objective: 'Accept sensor readings, ignore the noise, and escalate only when oxygen stays low after a re-check.',
    api: 'POST {EARTH}/sensors/oxygen  (webhook)', nodes: ['Webhook', 'Filter', 'Wait', 'IF', 'HTTP Request'],
    reward: 'Unlocks: habitat pressurisation'
  },
  {
    id: 8, tag: 'FOOD', title: 'Green Thumbs',
    briefing: 'The greenhouse has twelve trays, each with its own idea of the perfect light and water. Left alone, half of them will die by Friday.',
    objective: 'Read every tray sensor and drive the water and light actuators so each tray stays inside its range.',
    api: 'GET {EARTH}/greenhouse/sensors  ·  POST {EARTH}/greenhouse/actuate', nodes: ['Schedule Trigger', 'HTTP Request', 'Switch', 'Split Out'],
    reward: 'Unlocks: first harvest'
  },
  {
    id: 9, tag: 'CREW', title: 'Daily Check-In',
    briefing: 'Seven months in a tin can, and now a new world. The flight surgeon on Earth wants to know how everyone is doing — but not as seven separate messages.',
    objective: 'Collect each crew member\'s check-in from a form, summarise them with AI, and email one clear report to Earth.',
    api: 'POST {EARTH}/crew/report', nodes: ['Form Trigger', 'Aggregate', 'AI Agent', 'Gmail'],
    reward: 'Crew morale +10'
  },
  {
    id: 10, tag: 'GEOLOGY', title: 'Rock Detective',
    briefing: 'The rover has photographed 400 rocks. Earth\'s geologists would love to sort them. We cannot wait for them — we need the pictures classified on the spot.',
    objective: 'Receive each image, classify the rock type with a vision model, and file it under the right category.',
    api: 'POST {EARTH}/samples/image  (webhook)', nodes: ['Webhook', 'AI Agent', 'Switch', 'Data table'],
    reward: 'Unlocks: sample library'
  },
  {
    id: 11, tag: 'EXPLORATION', title: 'Eyes in the Sky',
    briefing: 'The helicopter drone can fly for ninety seconds at a time. Enough to scout a canyon — if we feed it waypoints one flight at a time and stitch the footage together.',
    objective: 'Send the drone to each waypoint in turn, wait for each flight to finish, and merge the results into one map.',
    api: 'POST {EARTH}/drone/fly  ·  GET {EARTH}/drone/flight', nodes: ['Split Out', 'HTTP Request', 'Wait', 'Merge', 'Code'],
    reward: 'Unlocks: canyon map'
  },
  {
    id: 12, tag: 'LOGISTICS', title: 'Supply Run',
    briefing: 'Everything we own was launched from Earth, and the next resupply is two years away. Running out of anything is not an option, so something must count the cans.',
    objective: 'Check stock levels daily, find anything running low, and trigger a reorder sub-workflow for each item.',
    api: 'GET {EARTH}/inventory  ·  POST {EARTH}/resupply/request', nodes: ['Schedule Trigger', 'Data table', 'Filter', 'Execute Workflow', 'Gmail'],
    reward: 'Unlocks: resupply manifest'
  },
  {
    id: 13, tag: 'EMERGENCY', title: 'Mayday',
    briefing: 'Sooner or later, something will break at three in the morning. The only question is whether anyone finds out before it matters.',
    objective: 'Catch any failing workflow, build an incident report from the error, page the crew, and fail over to the backup.',
    api: 'POST {EARTH}/incidents', nodes: ['Error Trigger', 'Set', 'Slack', 'Telegram', 'HTTP Request'],
    reward: 'Unlocks: auto-recovery'
  },
  {
    id: 14, tag: 'MYSTERY', title: 'The Signal',
    briefing: 'A repeating transmission is coming from beneath the polar ice. It is not ours. It is encoded, and it repeats every 11 minutes. Somebody should read it.',
    objective: 'Capture the transmission, decode it, and have an AI classify what it says before reporting to Earth.',
    api: 'POST {EARTH}/signals/raw  (webhook)', nodes: ['Webhook', 'Code', 'AI Agent', 'Respond to Webhook'],
    reward: 'Unlocks: ???'
  },
  {
    id: 15, tag: 'FINALE', title: 'First Colony Broadcast',
    briefing: 'Fourteen missions done. Comms, rover, power, water, food, crew — everything works. One thing is left: tell the world.',
    objective: 'Run every mission workflow, merge their results, have AI write the broadcast, and transmit it to all of Earth.',
    api: 'POST {EARTH}/broadcast', nodes: ['Execute Workflow', 'Merge', 'Aggregate', 'Basic LLM Chain', 'HTTP Request', 'Slack'],
    reward: 'Mars is open for business'
  }
];

/* ---- Guide data for the editor ----
   solve = the chain of nodes the Guide checks off (in order, along a connected path starting at a trigger).
     'Type'           any node of that type          'HTTP Request|x'  an HTTP Request whose URL contains x
     '*Trigger'       any trigger node               'IF@0'            leave this node through output 0 (true / loop / first rule…)
   Whether a mission is actually SOLVED is decided by really running the workflow (n8n.js + mission-sim.js). */
(function () {
  const SOLVE = {
    1: ['Webhook', 'HTTP Request|handshake', 'Respond to Webhook'],
    2: ['*Trigger', 'HTTP Request|deploy', 'Wait', 'HTTP Request|status', 'IF@0'],
    3: ['Schedule Trigger', 'HTTP Request|scan', 'IF@0', 'HTTP Request|reports'],
    4: ['Schedule Trigger', 'HTTP Request|power', 'IF@0', 'Slack'],
    5: ['Webhook', 'Switch', 'Telegram'],
    6: ['*Trigger', 'Loop Over Items@1', 'HTTP Request|spectrometer', 'Loop Over Items@0', 'Aggregate', 'Code', 'Data table'],
    7: ['Webhook', 'Filter', 'Wait', 'HTTP Request|oxygen', 'IF@0', 'HTTP Request|alerts'],
    8: ['Schedule Trigger', 'HTTP Request|sensors', 'Switch', 'HTTP Request|actuate'],
    9: ['Form Trigger', 'Aggregate', 'AI Agent', 'Gmail'],
    10: ['Webhook', 'AI Agent', 'Data table'],
    11: ['*Trigger', 'Split Out', 'HTTP Request|drone', 'Code'],
    12: ['Schedule Trigger', 'Data table', 'Filter', 'Execute Workflow', 'Gmail'],
    13: ['Error Trigger', 'Set', 'Slack', 'HTTP Request|incidents'],
    14: ['Webhook', 'Code', 'AI Agent', 'Respond to Webhook'],
    15: ['*Trigger', 'Execute Workflow', 'Merge', 'Aggregate', 'Basic LLM Chain', 'HTTP Request|broadcast']
  };
  MISSIONS.forEach(m => { m.solve = SOLVE[m.id]; });
  MISSIONS.forEach(m => { m.nodes = [...new Set(m.solve.map(x => x === '*Trigger' ? 'Any trigger' : x.split('|')[0].split('@')[0]))]; });   // chips = what the guide actually needs
})();

/* ---- Editor help: one entry per step of `solve`: [why / what to do, data coming IN, data going OUT, SET UP (html)] ---- */
window.HELP = {
  1: [
    ['Earth calls this URL to say hello. Give it a Path, and tell it you’ll answer later with a Respond to Webhook node.', '(nothing — it waits for Earth)', '{ "headers": {…}, "body": { "token": "EARTH-7731" } }', 'Method <b>POST</b>, <b>Path</b> e.g. <code>earth-handshake</code>, and set <b>Respond</b> to <code>Using Respond to Webhook node</code>.'],
    ['Call Mission Control back to open the link. The token Earth sent must travel along in the request body.', '{ "body": { "token": "EARTH-7731" } }', '{ "link": "OPEN", "station": "EARTH-1" }', 'Method <b>POST</b>, URL containing <code>handshake</code>, <b>Send Body</b> = Yes, Body: <code>{ "token": "{{ $json.body.token }}" }</code>'],
    ['Answer Earth’s original request, otherwise Earth keeps waiting.', '{ "link": "OPEN" }', 'the HTTP response Earth receives', 'Response body, e.g. <code>{ "status": "MARS_ONLINE" }</code>']
  ],
  2: [
    ['Any trigger will do — a Manual Trigger lets you start it by clicking Execute.', '(nothing)', '{}', 'No settings needed.'],
    ['Tell the rover to roll out of the cargo bay.', '{}', '{ "rover": "DEPLOYING", "eta_s": 240 }', 'Method <b>POST</b>, URL containing <code>deploy</code>.'],
    ['Deployment takes time — read <code>eta_s</code>. Either wait that long once, or wait a shorter time and <b>poll in a loop</b> (see the IF step). Every call to Mission Control also costs ~5 s.', '{ "rover": "DEPLOYING", "eta_s": 240 }', 'same item, after the pause', '<b>Wait for</b> e.g. <code>240</code> s — or <code>30</code> s if you will poll in a loop (the default of 5 is too short for a straight line).'],
    ['Ask the rover how it is doing.', 'any item', '{ "rover": "READY", "battery": 98 }', 'Method <b>GET</b>, URL containing <code>status</code>.'],
    ['Only the READY item should leave through the <b>true</b> output.', '{ "rover": "READY" }', '<b>true</b> output → READY items · <b>false</b> output → everything else', 'Value 1 <code>{{ $json.rover }}</code> · is equal to · Value 2 <code>READY</code>.<br><b>To poll:</b> connect the IF’s <b>false</b> output back into the <b>Wait</b> node — the workflow keeps checking until the rover is READY. Only <b>false</b> goes back (and never back to deploy).']
  ],
  3: [
    ['The rover scans a new patch of ground every Sol — let a schedule run the workflow.', '(a timer)', '{ "timestamp": "…" }', 'Any interval.'],
    ['Fetch the latest scan.', '{ "timestamp": "…" }', '{ "anomaly_score": 0.93, "feature": "unknown metallic object" }', 'Method <b>GET</b>, URL containing <code>scan</code>.'],
    ['Only real anomalies should go to Earth. Ordinary rocks (score 0.12) must be ignored.', '{ "anomaly_score": 0.93 }', '<b>true</b> → anomaly · <b>false</b> → ignore', 'Value 1 <code>{{ $json.anomaly_score }}</code> · is greater than · <code>0.8</code>'],
    ['Report the discovery to Earth — from the <b>true</b> output only.', '{ "feature": "…", "anomaly_score": 0.93 }', '{ "received": true }', 'Method <b>POST</b>, URL containing <code>reports</code>, Send Body = Yes, body with <code>feature</code> and <code>anomaly_score</code> using expressions.']
  ],
  4: [
    ['Poll the habitat power system on a schedule.', '(a timer)', '{ "timestamp": "…" }', 'Any interval.'],
    ['Read solar and battery telemetry.', '{ "timestamp": "…" }', '{ "solar_w": 210, "battery_pct": 18 }', 'Method <b>GET</b>, URL containing <code>power</code>.'],
    ['Is the battery low? Only low batteries should leave through <b>true</b>. At 64% nobody should be bothered.', '{ "battery_pct": 18 }', '<b>true</b> → low · <b>false</b> → fine', 'Value 1 <code>{{ $json.battery_pct }}</code> · is less than · <code>20</code>'],
    ['Warn the crew — connect Slack to the <b>true</b> output.', '{ "battery_pct": 18 }', 'Slack message posted', '<b>Credential</b>: Mars Ops account · Channel <code>#mars-ops</code> · Message e.g. <code>Battery low: {{ $json.battery_pct }}%</code>']
  ],
  5: [
    ['The orbiter pushes storm forecasts here. Each call carries a severity.', '(waits for the orbiter)', '{ "body": { "severity": "HIGH", "eta_h": 6 } }', 'Method <b>POST</b>, any <b>Path</b>, e.g. <code>storm-forecast</code>.'],
    ['Route by severity. Each rule has its OWN output — only the HIGH rule should lead to Telegram.', '{ "body": { "severity": "HIGH" } }', 'output 1 → rule 1 · 2 → rule 2 · 3 → rule 3 · fallback → no rule matched', 'Rule 1: <code>{{ $json.body.severity }}</code> · is equal to · <code>HIGH</code>. Connect Telegram to the <b>1</b> output.'],
    ['Alert the crew on the channel they actually read.', '{ "body": { "severity": "HIGH" } }', 'Telegram message sent', '<b>Credential</b>: Mars Ops account · <b>Chat ID</b> e.g. <code>123456789</code> · <b>Text</b> e.g. <code>Storm {{ $json.body.severity }} in {{ $json.body.eta_h }} h</code>']
  ],
  6: [
    ['The trigger delivers 11 candidate sites, one item each: <code>{ "site": 1 }</code> … <code>{ "site": 11 }</code>.', '(nothing)', '11 items', 'Any trigger.'],
    ['Loop Over Items sends the sites through its <b>loop</b> output (batch size 1). Whatever you connect to <b>loop</b> runs once per site.', '11 items', '<b>done</b> → when every site is processed · <b>loop</b> → the current batch', 'Batch size 1. Connect the <b>loop</b> output (the lower dot) to the HTTP Request.'],
    ['Read the spectrometer for the current site. <b>Then connect this node back into Loop Over Items</b> so the next site is sent.', '{ "site": 4 }', '{ "site": 4, "ice_pct": 5.0 }', 'Method <b>GET</b>, URL <code>…/spectrometer?site={{ $json.site }}</code>. Drag from this node’s output back to the Loop node.'],
    ['When all sites are done, the <b>done</b> output fires once with all the results.', '(loop finished)', '11 readings', 'Connect the <b>done</b> output (upper dot) to the next node.'],
    ['Merge the 11 readings into one item.', '11 items', '{ "data": [ …11 readings… ] }', 'No settings.'],
    ['Find the site with the highest <code>ice_pct</code>.', '{ "data": [ … ] }', '{ "best_site": 7, "ice_pct": 31.2 }', 'JavaScript, e.g. <code>const rows = $input.first().json.data; … return [{ json: { best_site, ice_pct } }];</code>'],
    ['Save the winner so the crew can drive there.', '{ "best_site": 7 }', 'row stored', 'Operation <b>Insert row</b>, any table name.']
  ],
  7: [
    ['The oxygen generators send readings here every few seconds.', '(waits for sensors)', '{ "body": { "o2_pct": 17.9 } }', 'Method <b>POST</b>, any <b>Path</b>.'],
    ['Ignore normal readings — keep only low ones.', '{ "body": { "o2_pct": 17.9 } }', 'only low readings pass', 'Value 1 <code>{{ $json.body.o2_pct }}</code> · is less than · <code>19</code>'],
    ['A single low reading is often noise. Give the sensor time to refresh.', 'the low reading', 'same item, after the pause', '<b>Wait for</b> at least <code>30</code> seconds.'],
    ['Look again, now that the sensor has refreshed.', 'any item', '{ "o2_pct": 20.8 }  or  { "o2_pct": 17.5 }', 'Method <b>GET</b>, URL containing <code>oxygen</code>.'],
    ['Is it STILL low? Only then is it a real problem — use the <b>true</b> output.', '{ "o2_pct": 17.5 }', '<b>true</b> → still low · <b>false</b> → recovered', 'Value 1 <code>{{ $json.o2_pct }}</code> · is less than · <code>19</code>'],
    ['Escalate to Mission Control — from the <b>true</b> output only.', 'the second reading', '{ "ticket": "ALERT-1" }', 'Method <b>POST</b>, URL containing <code>alerts</code>.']
  ],
  8: [
    ['Check the greenhouse once a day.', '(a timer)', '{ "timestamp": "…" }', 'Any interval.'],
    ['Read every tray. The endpoint returns ONE ITEM PER TRAY.', '{ "timestamp": "…" }', '12 items like { "tray": 2, "moisture": 0.22, "light": 0.8 }', 'Method <b>GET</b>, URL containing <code>sensors</code>.'],
    ['Decide what each tray needs — each rule gets its own output.', '12 trays', 'output 1 → needs water · output 2 → needs light · fallback → fine', 'Rule 1: <code>{{ $json.moisture }}</code> is less than <code>0.3</code> · Rule 2: <code>{{ $json.light }}</code> is less than <code>0.5</code>'],
    ['Tell the actuators what to do. You need <b>one HTTP Request per output</b> — one sends <code>"water"</code>, the other <code>"light"</code>.', '{ "tray": 2, … }', '{ "ok": true }', 'Method <b>POST</b>, URL containing <code>actuate</code>, Body <code>{ "tray": {{ $json.tray }}, "action": "water" }</code>']
  ],
  9: [
    ['Crew members fill in a check-in form. Each submission is one item.', '(a form submission)', '7 items like { "name": "Ana", "mood": 5, "notes": "…" }', 'No settings needed.'],
    ['Seven separate items would send seven emails. Combine them into one.', '7 items', '{ "data": [ …7 check-ins… ] }', 'No settings.'],
    ['The AI only knows what you put in the prompt. Pass the check-ins in.', '{ "data": [ … ] }', '{ "output": "Crew report: …" }', '<b>Credential</b>: Mars Ops account · Prompt e.g. <code>Summarise these check-ins: {{ JSON.stringify($json.data) }}</code>'],
    ['Email the summary to the flight surgeon.', '{ "output": "…" }', 'email sent', '<b>Credential</b> · To <code>surgeon@earth.example</code> · Subject · Message <code>{{ $json.output }}</code>']
  ],
  10: [
    ['The rover posts each rock’s measurements here (one run per rock).', '(waits for the rover)', '{ "body": { "id": 217, "color": "dark grey", "texture": "fine grained", "density": 3.0 } }', 'Method <b>POST</b>, any <b>Path</b>.'],
    ['Ask the AI to classify the rock — but show it the measurements!', '{ "body": { … } }', '{ "output": "basalt" }', '<b>Credential</b> · Prompt e.g. <code>Classify this rock (basalt, hematite or gypsum): {{ JSON.stringify($json.body) }}</code>'],
    ['File the result in the sample library.', '{ "output": "basalt" }', 'row stored', 'Operation <b>Insert row</b>, table e.g. <code>rocks</code>.']
  ],
  11: [
    ['Start the survey flight.', '(nothing)', '{ "waypoints": [ {x,y}, … 5 waypoints ] }', 'Any trigger.'],
    ['The waypoints arrive as ONE item with a list. Turn the list into one item per waypoint.', '1 item', '5 items like { "waypoints": { "x": 1200, "y": 340 } }', '<b>Field to split out</b>: <code>waypoints</code>'],
    ['Fly the drone to each waypoint (this node runs once per item).', '{ "waypoints": { "x": 1200, "y": 340 } }', '{ "flight": "COMPLETE", "images": 14 }', 'Method <b>POST</b>, URL containing <code>drone</code>, body <code>{ "x": {{ $json.waypoints.x }}, "y": {{ $json.waypoints.y }} }</code>'],
    ['Stitch the flights into one map. Output an item with a <code>map</code> field.', '5 flight results', '{ "map": "canyon.png" }', 'e.g. <code>return [{ json: { map: "canyon.png", flights: $input.all().length } }];</code>']
  ],
  12: [
    ['Count the stock once a day.', '(a timer)', '{ "timestamp": "…" }', 'Any interval.'],
    ['Read the inventory table — one item per product.', '{ "timestamp": "…" }', '8 items like { "item": "ration pack", "qty": 4 }', 'Operation <b>Get row(s)</b>, table <code>inventory</code>.'],
    ['Keep only items that are running low (fewer than 10).', '8 items', '5 low items', 'Value 1 <code>{{ $json.qty }}</code> · is less than · <code>10</code>'],
    ['Run the re-order workflow once for each low item.', '5 items', 'the sub-workflow’s result', '<b>Workflow</b>: any name, e.g. <code>Reorder</code>'],
    ['Tell Earth what was ordered.', 'ordered items', 'email sent', '<b>Credential</b> · To <code>supply@earth.example</code> · Subject · Message e.g. <code>Re-ordered {{ $json.item }}</code>']
  ],
  13: [
    ['This starts automatically whenever ANOTHER workflow fails.', '(a failure somewhere)', '{ "workflow": { "name": "…" }, "execution": { "error": { "message": "ECONNRESET…" } } }', 'No settings needed.'],
    ['Turn the raw error into a tidy field you can reuse.', 'the error item', 'same item + <code>incident</code>', 'Field name <code>incident</code>, Value <code>{{ $json.execution.error.message }}</code>'],
    ['Page the crew with what actually failed.', '{ "incident": "…" }', 'Slack message posted', '<b>Credential</b> · Channel · Message <code>Incident: {{ $json.incident }}</code>'],
    ['File the incident with Mission Control.', '{ "incident": "…" }', '{ "ticket": "INC-0042" }', 'Method <b>POST</b>, URL containing <code>incidents</code>, body <code>{ "incident": "{{ $json.incident }}" }</code>']
  ],
  14: [
    ['The strange transmission arrives here. Because you will reply from a Respond to Webhook node, set <b>Respond</b> accordingly.', '(waits for the signal)', '{ "body": { "raw": "V0VMQ09NRQ==" } }', 'Method <b>POST</b>, any <b>Path</b>, <b>Respond</b> = <code>Using Respond to Webhook node</code>.'],
    ['Decode it. The text looks like base64 — in a Code node you can use <code>atob(…)</code>.', '{ "body": { "raw": "…" } }', '{ "decoded": "WELCOME" }', '<code>return [{ json: { decoded: atob($input.first().json.body.raw) } }];</code>'],
    ['Ask the AI what the decoded message means. It only knows what the prompt contains.', '{ "decoded": "WELCOME" }', '{ "output": "A friendly greeting…" }', '<b>Credential</b> · Prompt <code>What does this say? {{ $json.decoded }}</code>'],
    ['Answer the caller with what you found.', '{ "output": "…" }', 'HTTP response', 'Response body <code>{{ $json.output }}</code>']
  ],
  15: [
    ['Start the broadcast yourself — it is the finale, after all.', '(nothing)', '{}', 'Any trigger.'],
    ['Run every mission workflow in one go.', '{}', '6 items like { "system": "comms", "status": "link open" }', '<b>Workflow</b>: <code>all-systems</code>'],
    ['Merge has TWO inputs. Connect your branch to one of them.', '6 items', 'the same 6 items', 'Mode Append. Connect to <b>Input 1</b> (upper dot).'],
    ['Combine the six statuses into one report.', '6 items', '{ "data": [ …6 statuses… ] }', 'No settings.'],
    ['Let the AI write the broadcast from the status report.', '{ "data": [ … ] }', '{ "text": "People of Earth…" }', '<b>Credential</b> · Prompt <code>Write a short broadcast to Earth from: {{ JSON.stringify($json.data) }}</code>'],
    ['Transmit it to all of Earth.', '{ "text": "…" }', '{ "delivered_to": "all of Earth" }', 'Method <b>POST</b>, URL containing <code>broadcast</code>, body <code>{ "text": "{{ $json.text }}" }</code>']
  ]
};
