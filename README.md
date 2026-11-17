# Course for Mars 🚀

A cinematic browser game that teaches **n8n workflow building**. You fly a science vessel to Mars, land, and then solve
15 missions by building the right workflow in a faked (but honest) n8n editor — webhooks, HTTP requests, IF / Switch
routing, loops, Code nodes, AI agents and more.

**▶ Play:** https://softchris.github.io/n8n-mars/  (best in Chrome/Edge/Firefox, desktop, sound on, fullscreen with `F`)

## What's in it
- **Cinematic intro** — a giant vessel passing overhead, the approach to Mars, atmospheric entry and landing (Three.js), with typed history of the inventions that got us here.
- **15 missions** — from *Phone Home* (a webhook handshake with Earth) to *First Colony Broadcast*. Each one is a real workflow puzzle.
- **A real item-flow engine** — data moves as items, `{{ $json.field }}` expressions work, IF/Switch/Loop outputs matter, credentials are required, loops need an exit. Missions are checked by *running* your workflow against several scenarios (e.g. battery 18 % vs 64 %).
- **Never stuck** — a live Guide (what to build, in which order, what data goes in/out), INPUT/OUTPUT data panels per node, and 🔧 *Fix this node / Fix the connections* buttons.
- **3D reward cutscenes** and a **synthesized score** per mission.
- **Manual saves only** — the game always starts as a new game; use *Save game* and *Continue* to keep progress.

## Run locally
It's plain HTML/CSS/JS — no build step.
```bash
npx http-server . -p 8080
```
Then open http://localhost:8080.

## Tests
The execution engine and every mission have a headless test: all 15 reference solutions must pass and a set of deliberately wrong workflows must fail (and be fixable).
```bash
node tests/engine-test.js
node tests/wirefix.js
```

## Project layout
| Path | What |
|---|---|
| `js/n8n.js` | the execution engine (items, expressions, node implementations) |
| `js/mission-sim.js` | the "outside world" and the goal of each mission |
| `js/missions.js` | mission text, the Guide's step chains and help |
| `js/editor.js` | the n8n-style editor UI, Guide and Fix buttons |
| `js/dev-solutions.js` | reference solutions (**spoilers!**) — used by the tests and the Fix buttons |
| `js/ship.js`, `space.js`, `surface.js` | the 3D intro |
| `js/cutscenes3d.js`, `cutscenes.js`, `music.js` | reward cutscenes and the generated score |

## Credits
- Music: **“Also Sprach Zarathustra”** by **Kevin MacLeod** ([incompetech.com](https://incompetech.com)), licensed under
  [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/). Changes: tempo adjusted (≈ 0.82×), fades added.
- Typing sound effect: Pixabay (Pixabay Content License).
- 3D: [Three.js](https://threejs.org) r147 (MIT), loaded from a CDN.
- "n8n" is a trademark of n8n GmbH. This is an unofficial learning project and is not affiliated with or endorsed by n8n.
