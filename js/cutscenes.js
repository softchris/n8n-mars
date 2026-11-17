/* Cinematic reward scenes shown after each mission. Procedural 2D canvas + typed narration. */
(function () {
  const TAU = Math.PI * 2, clamp = U.clamp, sm = U.smooth;

  // ---------------------------------------------------------------- story beats (one per mission)
  const CUTS = {
    1: { kind: 'comms', lines: ['Signal sent. Eleven minutes across the dark.', 'Then, faintly: “Mars, we hear you.”', 'Earth knows we are here.'] },
    2: { kind: 'rover', mark: 'none', lines: ['The ramp lowers. Six wheels touch Martian soil.', 'Every great journey starts with a single track.'] },
    3: { kind: 'rover', mark: 'object', lines: ['The scan lights up.', 'Something metallic beneath the dust. Not rock.', 'Earth is already asking for more.'] },
    4: { kind: 'habitat', fx: 'power', lines: ['The panels drink the thin sunlight.', 'Batteries climb. Twenty. Sixty. One hundred.', 'The habitat will not go dark tonight.'] },
    5: { kind: 'habitat', fx: 'storm', lines: ['The sky turns the colour of rust.', 'Shutters close. The storm rolls over us.', 'We wait. We are still here.'] },
    6: { kind: 'rover', mark: 'ice', lines: ['Eleven sites. One answer.', 'Beneath the red dust: ice. Enough for a thousand showers.', 'Water. Now Mars is a home, not a visit.'] },
    7: { kind: 'habitat', fx: 'air', lines: ['Oxygen holds steady at twenty-one percent.', 'The quiet alarms stay quiet. That is how you know it works.'] },
    8: { kind: 'habitat', fx: 'green', lines: ['Twelve trays. Twelve small miracles.', 'The first green leaf on Mars.'] },
    9: { kind: 'wave', fx: 'crew', lines: ['Seven crew. Seven heartbeats.', 'One calm summary lands on Earth.', 'Home knows we are okay.'] },
    10: { kind: 'rover', mark: 'rocks', lines: ['Four hundred rocks, sorted before lunch.', 'Each one tells a story four billion years old.'] },
    11: { kind: 'flyover', lines: ['Ninety seconds of flight at a time.', 'The canyon unfolds beneath us, line by line.', 'Nobody has ever seen it like this.'] },
    12: { kind: 'wave', fx: 'stock', lines: ['Every can, counted. Every bolt, accounted for.', 'Nothing runs out unless we let it.'] },
    13: { kind: 'alert', lines: ['Three a.m. Something breaks.', 'Nobody wakes up. The workflow already did.', 'Systems nominal.'] },
    14: { kind: 'wave', fx: 'signal', lines: ['The signal repeats every eleven minutes.', 'Decoded.', '“Welcome. We have been waiting.”'] },
    15: { kind: 'habitat', fx: 'colony', lines: ['Fourteen systems. All green.', 'The broadcast goes out to every screen on Earth.', 'Mars is open for business.'] }
  };

  // ---------------------------------------------------------------- drawing helpers
  const rnd = U.rng(1234);
  const STARS = Array.from({ length: 260 }, () => ({ x: rnd(), y: rnd() * .8, s: .4 + rnd() * 1.4, p: rnd() * TAU }));
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function stars(g, w, h, t, a = 1) {
    STARS.forEach(s => { g.globalAlpha = a * (.35 + .55 * (.5 + .5 * Math.sin(t * 1.3 + s.p))); g.fillStyle = '#fff'; g.fillRect(s.x * w, s.y * h, s.s, s.s); });
    g.globalAlpha = 1;
  }
  function glow(g, x, y, r, rgb, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function planet(g, x, y, r, c0, c1, c2) {
    const gr = g.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r); gr.addColorStop(0, c0); gr.addColorStop(.7, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  function skyGrad(g, w, h, stops) { const gr = g.createLinearGradient(0, 0, 0, h); stops.forEach(s => gr.addColorStop(s[0], s[1])); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
  function ridge(g, w, h, base, amp, freq, speed, t, fill, seed) {
    g.fillStyle = fill; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w + 8; x += 8) { const u = x / w * freq + t * speed + seed; g.lineTo(x, base + amp * (Math.sin(u) * .5 + Math.sin(u * 2.3 + seed) * .3 + Math.sin(u * .5 + 1) * .4)); }
    g.lineTo(w, h); g.closePath(); g.fill();
  }

  // ---------------------------------------------------------------- scenes
  const SCENES = {};

  // Mars -> Earth signal link
  SCENES.comms = (g, w, h, t) => {
    skyGrad(g, w, h, [[0, '#02030a'], [1, '#0d0a1c']]); stars(g, w, h, t);
    const ex = w * .8, ey = h * .27, er = h * .07, mx = w * .16, my = h * .86, mr = h * .36;
    const P0 = { x: w * .27, y: h * .6 }, P1 = { x: ex - er * 1.2, y: ey + er * .6 };
    glow(g, ex, ey, er * 4, '80,160,255', .18 + .1 * sm(5, 6, t));
    planet(g, ex, ey, er, '#9fd0ff', '#2f6fd0', '#0a1f4a');
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(ex - er * .2, ey - er * .1, er * .55, 0, TAU); g.fill();
    planet(g, mx, my, mr, '#f0a070', '#b4502a', '#3a140c');
    // dish on the horizon
    g.strokeStyle = '#ffd7a0'; g.lineWidth = 3; g.beginPath(); g.moveTo(P0.x, P0.y + 16); g.lineTo(P0.x, P0.y); g.stroke();
    g.beginPath(); g.arc(P0.x, P0.y, 14, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    // expanding rings
    for (let k = 0; k < 4; k++) {
      const ph = ((t * .5 + k * .25) % 1), rr = ph * h * .22;
      g.strokeStyle = `rgba(255,190,110,${(1 - ph) * .7})`; g.lineWidth = 2; g.beginPath(); g.arc(P0.x, P0.y, rr, -Math.PI * .85, -Math.PI * .1); g.stroke();
    }
    // dashed link + packets
    g.setLineDash([6, 10]); g.strokeStyle = 'rgba(255,200,130,.28)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(P0.x, P0.y); g.lineTo(P1.x, P1.y); g.stroke(); g.setLineDash([]);
    for (let k = 0; k < 6; k++) {
      let s = t < 5.2 ? (t * .21 - k * .1) : 1 - ((t - 5.4) * .21 - k * .1);
      if (s <= 0 || s >= 1) continue;
      const x = U.lerp(P0.x, P1.x, s), y = U.lerp(P0.y, P1.y, s), rev = t >= 5.2;
      glow(g, x, y, 22, rev ? '120,255,200' : '255,190,110', .9); g.fillStyle = '#fff'; g.fillRect(x - 2, y - 2, 4, 4);
    }
  };

  // rover driving through dunes at dusk
  SCENES.rover = (g, w, h, t, c) => {
    skyGrad(g, w, h, [[0, '#1a1630'], [.45, '#6a3a3a'], [.72, '#e08a50'], [1, '#f0b070']]);
    stars(g, w, h, t, .5); glow(g, w * .72, h * .62, h * .5, '255,180,100', .5);
    g.fillStyle = '#ffe2b0'; g.beginPath(); g.arc(w * .72, h * .62, h * .035, 0, TAU); g.fill();
    const stop = c.mark !== 'none' ? sm(4.6, 5.4, t) : 0, drive = t * (1 - stop * .98) + 2.6 * stop;      // camera scroll slows when something is found
    const off = t < 4.6 || c.mark === 'none' ? t : 4.6 + (t - 4.6) * .02;
    ridge(g, w, h, h * .62, h * .05, 5, -off * .12, 0, '#8a4a38', 1.3);
    ridge(g, w, h, h * .68, h * .06, 6, -off * .3, 0, '#6e3a2c', 4.2);
    ridge(g, w, h, h * .78, h * .05, 8, -off * .7, 0, '#4a261f', 7.1);
    // marks on the ground ahead of the rover
    const gx = w * .74, gy = h * .79;
    if (c.mark === 'object' && t > 4.2) { const a = sm(4.2, 5.4, t); glow(g, gx, gy, 90 * a, '160,220,255', .85 * a); g.fillStyle = `rgba(230,245,255,${a})`; g.save(); g.translate(gx, gy); g.rotate(.4); g.fillRect(-7, -14, 14, 28); g.restore(); }
    if (c.mark === 'ice' && t > 4.2) { const a = sm(4.2, 5.4, t); glow(g, gx, gy + 4, 120 * a, '150,220,255', .7 * a); g.fillStyle = `rgba(190,235,255,${.85 * a})`; g.beginPath(); g.ellipse(gx, gy + 6, 70 * a, 11 * a, 0, 0, TAU); g.fill(); }
    if (c.mark === 'rocks') for (let k = 0; k < 9; k++) {
      const rx = w * (.55 + .4 * hash(k + 1)), ry = h * (.79 + .1 * hash(k + 9)), a = sm(2 + k * .35, 2.8 + k * .35, t);
      g.fillStyle = '#3a1e18'; g.beginPath(); g.ellipse(rx, ry, 14, 8, 0, 0, TAU); g.fill();
      if (a > 0) { g.strokeStyle = `rgba(255,200,120,${a})`; g.lineWidth = 1.5; g.strokeRect(rx - 20, ry - 18, 40, 30); g.fillStyle = `rgba(255,200,120,${a})`; g.font = '11px monospace'; g.fillText(['BASALT', 'IRON', 'SILICA', 'HEMATITE'][k % 4], rx - 20, ry - 22); }
    }
    // scan beam
    if (c.mark !== 'none' && c.mark !== 'rocks' && t > 3.4) { const a = sm(3.4, 4.2, t); g.strokeStyle = `rgba(150,255,210,${.5 * a})`; g.lineWidth = 2; for (let k = 0; k < 3; k++) { const ph = ((t * .8 + k / 3) % 1); g.beginPath(); g.arc(w * .48, h * .73, 30 + ph * h * .5, -.25, .5); g.stroke(); } }
    // the rover
    const rx = w * .46, ry = h * .795 + Math.sin(off * 6) * 2 * (1 - stop), s = h / 420;
    g.save(); g.translate(rx, ry); g.scale(s, s);
    g.fillStyle = '#d8d8de'; g.fillRect(-46, -34, 92, 22); g.fillStyle = '#9a9aa4'; g.fillRect(-46, -14, 92, 6);
    g.fillStyle = '#2a4a8a'; g.fillRect(-36, -42, 44, 8);                                                   // solar deck
    g.strokeStyle = '#bcbcc6'; g.lineWidth = 3; g.beginPath(); g.moveTo(30, -34); g.lineTo(30, -66); g.stroke();
    g.fillStyle = '#e8e8ee'; g.fillRect(22, -76, 22, 12); g.fillStyle = '#1b1d22'; g.fillRect(36, -73, 6, 6);  // mast + camera
    [-34, 0, 34].forEach(x => { g.save(); g.translate(x, 0); g.rotate(off * 5); g.fillStyle = '#1e1f24'; g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.fill(); g.strokeStyle = '#777'; g.lineWidth = 2; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(k * 1.57) * 11, Math.sin(k * 1.57) * 11); g.stroke(); } g.restore(); });
    g.restore();
  };

  // night habitat — lots of variations on one theme
  SCENES.habitat = (g, w, h, t, c) => {
    const fx = c.fx, colony = fx === 'colony', storm = fx === 'storm';
    skyGrad(g, w, h, [[0, '#03040b'], [.55, '#161025'], [.78, '#4a2a2e'], [1, '#6a3a30']]);
    stars(g, w, h, t, storm ? .25 : 1);
    if (colony) { planet(g, w * .84, h * .2, h * .04, '#a8d4ff', '#3a78d8', '#0a1f4a'); }
    ridge(g, w, h, h * .72, h * .03, 4, 0, 0, '#2c1814', 2.2);
    const gy = h * .76; g.fillStyle = '#3a1d17'; g.fillRect(0, gy, w, h - gy);
    const lit = clamp((t - .8) / 4.5) * (storm ? 1 - .9 * sm(2.5, 3.5, t) * (1 - sm(6.5, 8, t)) : 1);
    // buildings
    const B = colony ? [[.1, .06], [.24, .09], [.4, .12], [.56, .07], [.68, .1], [.84, .08], [.5, .035, 'tower']] : [[.22, .09], [.42, .13], [.62, .08], [.78, .1]];
    B.forEach(([bx, br, kind], i) => {
      const x = w * bx, r = h * br * (colony ? .9 : 1.1);
      if (kind === 'tower') { g.fillStyle = '#2b2d38'; g.fillRect(x - 5, gy - h * .32, 10, h * .32); const ph = (t * 1.2) % 1; g.fillStyle = Math.sin(t * 5) > 0 ? '#ff6a4a' : '#552'; g.beginPath(); g.arc(x, gy - h * .32, 5, 0, TAU); g.fill();
        if (t > 3) for (let k = 0; k < 4; k++) { const p = ((t * .35 + k * .25) % 1); g.strokeStyle = `rgba(255,200,120,${(1 - p) * .6})`; g.lineWidth = 2; g.beginPath(); g.arc(x, gy - h * .32, p * h * .5, -Math.PI * .9, -Math.PI * .1); g.stroke(); } return; }
      const gr = g.createLinearGradient(x, gy - r, x, gy); gr.addColorStop(0, '#4a4e5c'); gr.addColorStop(1, '#23252e');
      g.fillStyle = gr; g.beginPath(); g.arc(x, gy, r, Math.PI, 0); g.fill(); g.fillRect(x - r, gy - 6, r * 2, 6);
      const isGreen = fx === 'green' && i === 1;
      if (isGreen) { glow(g, x, gy - r * .4, r * 1.3, '120,255,140', .35 * lit); }
      const N = 7; for (let k = 0; k < N; k++) {
        const a = Math.PI + (k + .5) / N * Math.PI, wx = x + Math.cos(a) * r * .7, wy = gy + Math.sin(a) * r * .7 - 2, on = hash(i * 9 + k) < lit;
        g.fillStyle = on ? (isGreen ? 'rgba(140,255,150,.95)' : 'rgba(255,214,150,.95)') : 'rgba(0,0,0,.45)'; g.fillRect(wx - 3, wy - 4, 6, 8);
      }
      if (isGreen) { const gr2 = clamp((t - 2.2) / 5); for (let k = 0; k < 9; k++) { const px = x - r * .7 + k * r * .175, ph = clamp(gr2 * 1.6 - k * .08), ht = ph * r * .45 * (.7 + hash(k) * .5);
        g.strokeStyle = '#6ae26a'; g.lineWidth = 3; g.beginPath(); g.moveTo(px, gy - 6); g.lineTo(px + Math.sin(t + k) * 2, gy - 6 - ht); g.stroke();
        if (ph > .6) { g.fillStyle = '#9bff8a'; g.beginPath(); g.ellipse(px + 5, gy - 6 - ht, 6, 3, -.5, 0, TAU); g.fill(); } } }
      // solar rows
      if (!colony && (fx === 'power') && i % 2 === 0) { g.fillStyle = '#1d3a78'; for (let k = 0; k < 3; k++) { g.save(); g.translate(x + r * 1.15 + k * 34, gy - 4); g.rotate(-.5); g.fillRect(0, -26, 28, 6); g.restore(); } }
    });
    // per-variant effects
    if (fx === 'power') {
      const lvl = U.lerp(.18, 1, sm(1.5, 7.5, t)); g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(w * .66, h * .12, w * .26, 56);
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.strokeRect(w * .66, h * .12, w * .26, 56); g.fillStyle = lvl < .3 ? '#ff6a4a' : '#7fffd4'; g.fillRect(w * .66 + 4, h * .12 + 4, (w * .26 - 8) * lvl, 48);
      g.fillStyle = '#fff'; g.font = '600 14px monospace'; g.fillText(`BATTERY  ${Math.round(lvl * 100)}%`, w * .66, h * .12 - 8);
    }
    if (fx === 'air') {
      for (let k = 0; k < 40; k++) { const p = ((t * .12 + hash(k) * 3) % 1), bx = w * (.2 + .6 * hash(k + 3)), by = gy - p * h * .45; g.fillStyle = `rgba(180,230,255,${(1 - p) * .55})`; g.beginPath(); g.arc(bx + Math.sin(t + k) * 8, by, 2 + hash(k + 8) * 3, 0, TAU); g.fill(); }
      g.fillStyle = '#9ff'; g.font = '600 16px monospace'; g.fillText(`O₂  ${(U.lerp(17.9, 21, sm(1, 6, t))).toFixed(1)} %`, w * .68, h * .14);
    }
    if (storm) {
      const sev = sm(0, 2.5, t) * (1 - .8 * sm(7, 9, t));
      g.fillStyle = `rgba(150,70,40,${.32 * sev})`; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 260; k++) { const sp = .5 + hash(k) * 1.4, x = ((hash(k + 2) * w * 1.4 - t * w * .55 * sp) % (w * 1.4) + w * 1.4) % (w * 1.4) - w * .2, y = hash(k + 5) * h; g.fillStyle = `rgba(230,150,100,${.28 * sev})`; g.fillRect(x, y, 26 * sp, 2); }
    }
    if (colony) {
      const n = clamp((t - 2) / 5); for (let k = 0; k < 40; k++) { if (hash(k) > n) continue; g.fillStyle = 'rgba(255,214,150,.9)'; g.fillRect(w * hash(k + 1), gy + 10 + hash(k + 2) * (h - gy - 30), 3, 3); }
    }
  };

  // dark HUD scenes
  SCENES.wave = (g, w, h, t, c) => {
    skyGrad(g, w, h, [[0, '#05080c'], [1, '#0a1218']]);
    g.strokeStyle = 'rgba(80,255,200,.07)'; g.lineWidth = 1; for (let x = 0; x < w; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.font = '12px monospace';
    if (c.fx === 'crew') {
      for (let k = 0; k < 7; k++) {
        const y = h * (.2 + k * .085), on = sm(k * .5, k * .5 + 1, t); g.strokeStyle = `rgba(127,255,212,${.85 * on})`; g.lineWidth = 2; g.beginPath();
        for (let x = 0; x < w * .8; x += 3) { const u = (x / 70 - t * 2.2 + k * .7) % 4.2, e = u > 1 && u < 1.3 ? -Math.sin((u - 1) * 10.4) * 26 : u > 1.3 && u < 1.6 ? Math.sin((u - 1.3) * 10) * 13 : 0; (x ? g.lineTo : g.moveTo).call(g, w * .1 + x, y + e); }
        g.stroke(); g.fillStyle = `rgba(127,255,212,${on})`; g.fillText(`CREW ${k + 1}   ${60 + Math.round(hash(k) * 18)} bpm   OK`, w * .1, y - 14);
      }
    }
    if (c.fx === 'stock') {
      const cols = 14, rows = 6, n = Math.floor(clamp((t - .5) / 6) * cols * rows);
      for (let i = 0; i < cols * rows; i++) { const x = w * .12 + (i % cols) * w * .05, y = h * .22 + Math.floor(i / cols) * h * .1, on = i < n; g.fillStyle = on ? 'rgba(127,255,212,.8)' : 'rgba(255,255,255,.08)'; g.fillRect(x, y, w * .04, h * .07); if (on && i === n - 1) { g.fillStyle = '#fff'; g.fillRect(x, y, w * .04, h * .07); } }
      g.fillStyle = '#9ff'; g.font = '600 15px monospace'; g.fillText(`INVENTORY  ${n} / ${cols * rows}  ITEMS VERIFIED`, w * .12, h * .16);
    }
    if (c.fx === 'signal') {
      const dec = sm(3, 7, t), chars = '0123456789ABCDEF';
      for (let k = 0; k < 26; k++) { const x = w * .08 + k * w * .035; for (let r = 0; r < 12; r++) { const y = h * .1 + r * 22 + ((t * 90 * (.4 + hash(k) )) % 22); g.fillStyle = `rgba(127,255,212,${.1 + .5 * hash(k * 7 + r)})`; g.fillText(chars[Math.floor(hash(k * 13 + r + Math.floor(t * 8)) * 16)], x, y); } }
      g.strokeStyle = '#7fffd4'; g.lineWidth = 2.5; g.beginPath();
      for (let x = 0; x < w; x += 3) { const noise = (hash(x + Math.floor(t * 30)) - .5) * 90 * (1 - dec), clean = Math.sin(x / 26 - t * 4) * 38 * Math.sin(x / 190 + t); (x ? g.lineTo : g.moveTo).call(g, x, h * .66 + noise + clean * dec); }
      g.stroke();
      if (dec > .9) { g.fillStyle = `rgba(255,255,255,${(dec - .9) * 10})`; g.font = '600 26px monospace'; g.fillStyle = `rgba(0,0,0,${(dec - .9) * 6})`; g.fillRect(w * .34, h * .42, w * .32, 46); g.fillStyle = `rgba(255,255,255,${(dec - .9) * 10})`; g.fillText('W E L C O M E', w * .385, h * .42 + 33); }
    }
    glow(g, w * .5, h * .5, h * .7, '40,200,160', .05);
  };

  // topographic drone flyover
  SCENES.flyover = (g, w, h, t) => {
    g.fillStyle = '#1b0f0c'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 46; k++) {
      const by = k * h / 40 - 20; g.strokeStyle = `rgba(${200 + k % 3 * 15},${110 + k % 4 * 10},80,${.14 + .12 * ((k % 5) === 0)})`; g.lineWidth = (k % 5) === 0 ? 1.6 : 1; g.beginPath();
      for (let x = 0; x <= w; x += 10) { const u = x / w * 6 + t * .35; g.lineTo(x, by + Math.sin(u + k * .35) * 26 + Math.sin(u * 2.1 + k * .2) * 12 + Math.sin(x / 90 - k * .1) * 8); }
      g.stroke();
    }
    const pts = [[.18, .62], [.34, .36], [.52, .55], [.68, .3], [.82, .5]];
    g.strokeStyle = 'rgba(127,255,212,.6)'; g.setLineDash([8, 8]); g.lineWidth = 2; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, p[0] * w, p[1] * h)); g.stroke(); g.setLineDash([]);
    pts.forEach((p, i) => { const a = sm(i * 1.5 + .5, i * 1.5 + 1.2, t); if (a <= 0) return; g.strokeStyle = `rgba(127,255,212,${a})`; g.beginPath(); g.arc(p[0] * w, p[1] * h, 14 + (1 - a) * 20, 0, TAU); g.stroke(); g.fillStyle = `rgba(127,255,212,${a})`; g.fillRect(p[0] * w - 3, p[1] * h - 3, 6, 6); g.font = '11px monospace'; g.fillText('WP ' + (i + 1), p[0] * w + 18, p[1] * h - 14); });
    const k = clamp(t / 7.5) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(k)), f = k - i, dx = U.lerp(pts[i][0], pts[i + 1][0], f) * w, dy = U.lerp(pts[i][1], pts[i + 1][1], f) * h;
    glow(g, dx, dy + 18, 70, '0,0,0', .55);
    g.save(); g.translate(dx, dy); g.strokeStyle = '#e8e8ee'; g.lineWidth = 3; g.beginPath(); g.moveTo(-18, -18); g.lineTo(18, 18); g.moveTo(18, -18); g.lineTo(-18, 18); g.stroke();
    [[-18, -18], [18, -18], [-18, 18], [18, 18]].forEach(([x, y]) => { g.save(); g.translate(x, y); g.rotate(t * 40); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(-12, -1.5, 24, 3); g.restore(); });
    g.fillStyle = '#ffb347'; g.fillRect(-6, -6, 12, 12); g.restore();
  };

  // red alert -> recovered
  SCENES.alert = (g, w, h, t) => {
    const ok = t > 4.6, k = sm(4.4, 5.2, t), pulse = .5 + .5 * Math.sin(t * 7);
    g.fillStyle = '#07070a'; g.fillRect(0, 0, w, h);
    const rgb = ok ? '60,230,140' : '255,60,60'; glow(g, w / 2, h / 2, h * (.8 + (ok ? 0 : .08 * pulse)), rgb, ok ? .22 : .18 + .12 * pulse);
    for (let r = 0; r < 4; r++) { const p = ((t * .45 + r / 4) % 1); g.strokeStyle = `rgba(${rgb},${(1 - p) * .55})`; g.lineWidth = 2; g.beginPath(); g.arc(w / 2, h / 2, 50 + p * h * .6, 0, TAU); g.stroke(); }
    g.fillStyle = `rgb(${rgb})`; g.textAlign = 'center'; g.font = `700 ${Math.round(h * .08)}px monospace`;
    g.fillText(ok ? 'RECOVERED' : (Math.sin(t * 7) > -.3 ? '⚠ ANOMALY' : ''), w / 2, h / 2 + h * .03);
    g.font = '14px monospace'; g.fillStyle = 'rgba(255,255,255,.55)';
    g.fillText(ok ? 'failover complete · incident INC-0042 filed · crew notified' : 'workflow error detected · paging crew…', w / 2, h / 2 + h * .1); g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,.04)'; for (let y = (t * 60) % 6; y < h; y += 6) g.fillRect(0, y, w, 1);
  };

  // ---------------------------------------------------------------- player
  let root, canvas, canvas3d, g, cap, lab, raf = 0, cur = null, W = 0, H = 0;
  const MUSIC = { 1: 'hope', 2: 'hope', 3: 'wonder', 4: 'hope', 5: 'tense', 6: 'wonder', 7: 'wonder', 8: 'hope', 9: 'hope', 10: 'wonder', 11: 'wonder', 12: 'hope', 13: 'tense', 14: 'mystery', 15: 'epic' };
  function build() {
    root = document.createElement('div'); root.id = 'cutscene';
    root.innerHTML = `<canvas id="cs3d"></canvas><canvas id="cs2d"></canvas><div class="cs-bar t"></div><div class="cs-bar b"></div>
      <div class="cs-label" id="cs-label"></div><div class="cs-cap" id="cs-cap"></div><button class="cs-skip" id="cs-skip">SKIP ›</button>`;
    document.body.appendChild(root); canvas3d = root.querySelector('#cs3d'); canvas = root.querySelector('#cs2d'); g = canvas.getContext('2d'); cap = root.querySelector('#cs-cap'); lab = root.querySelector('#cs-label');
    root.querySelector('#cs-skip').onclick = () => finish();
    window.addEventListener('keydown', e => { if (cur && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); finish(); } });
    window.addEventListener('resize', size);
  }
  function size() { if (!canvas) return; const d = Math.min(devicePixelRatio || 1, 1.5); W = innerWidth; H = innerHeight; canvas.width = W * d; canvas.height = H * d; g.setTransform(d, 0, 0, d, 0, 0); if (cur && cur.use3d) Cine.resize(W, H); }

  const LINE_AT = 2.2, LINE_LEN = 3.7, CPS = 24;
  function play(m, done, opts = {}) {
    if (!root) build(); const c = CUTS[m.id]; if (!c) { done && done(); return; }
    size(); cur = { m, c, done, t0: performance.now() - (opts.at || 0) * 1000, total: LINE_AT + c.lines.length * LINE_LEN + 1.2, prev: 0, lastLine: -1, fixed: opts.at != null ? opts.at : null, frozen: opts.at != null };
    lab.textContent = `MISSION ${String(m.id).padStart(2, '0')} COMPLETE  ·  ${m.title.toUpperCase()}`; cap.textContent = '';
    root.classList.add('on'); root.classList.remove('out');
    cur.use3d = !!(window.Cine && Cine.available() && Cine.start(m.id, canvas3d, W, H)); canvas3d.style.display = cur.use3d ? 'block' : 'none';
    if (!cur.frozen && window.Score) Score.start(m.id, cur.total);
    cancelAnimationFrame(raf); loop();
  }
  function loop() {
    if (!cur) return; const t = cur.fixed != null ? cur.fixed : (performance.now() - cur.t0) / 1000;
    g.clearRect(0, 0, W, H); if (cur.use3d) Cine.render(t, cur.total, W, H); else SCENES[cur.c.kind](g, W, H, t, cur.c);
    const fadeIn = sm(0, 1.1, t), fadeOut = 1 - sm(cur.total - 1, cur.total, t);
    g.fillStyle = `rgba(0,0,0,${1 - fadeIn * fadeOut})`; g.fillRect(0, 0, W, H);
    lab.style.opacity = sm(.6, 1.6, t) * (1 - sm(LINE_AT - .3, LINE_AT, t) * .55);
    // narration, one line at a time, typed
    const li = Math.floor((t - LINE_AT) / LINE_LEN);
    if (li >= 0 && li < cur.c.lines.length) {
      const age = t - LINE_AT - li * LINE_LEN, txt = cur.c.lines[li], n = Math.min(txt.length, Math.floor(age * CPS));
      if (li !== cur.lastLine) { cur.lastLine = li; cur.prev = 0; }
      if (n > cur.prev) { if (n < txt.length - 1) SFX.tick(1); cur.prev = n; }
      cap.textContent = txt.slice(0, n); cap.classList.toggle('on', age < LINE_LEN - .5);
    } else { cap.classList.remove('on'); }
    if (t >= cur.total && !cur.frozen) { finish(); return; }
    raf = requestAnimationFrame(loop);
  }
  function finish() {
    if (!cur) return; const d = cur.done; cur = null; if (window.Score) Score.stop(); cancelAnimationFrame(raf); root.classList.add('out');
    setTimeout(() => { root.classList.remove('on'); }, 500); d && d();
  }

  window.Cutscene = { play, CUTS };
})();
