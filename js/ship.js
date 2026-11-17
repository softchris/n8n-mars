/* The ship — a Mars-transit SCIENCE VESSEL, fully procedural.
   Nose points to -Z, engines at +Z. The main axis sits at y = AXIS above the local origin.
   Layout (nose -> tail): comms dish + observation dome, forward habitat, rotating habitat ring,
   lab modules + solar wings, gold propellant tanks, radiator fins, main engine cluster. */
(function () {
  const L = 1500, W = 420, AXIS = 120, REST = 90;
  const ZR = 668;                                   // engine exit plane
  const shared = {};

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function textures() {
    if (shared.hullMat) return shared;
    const r = U.rng(42);

    // ---- hull: white/grey panels, orange mission stripes, windows (emissive)
    const w = 1024, h = 512;
    const c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#979ca3'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) {
      let x = -((r() * 60) | 0);
      while (x < w) {
        const pw = 64 + ((r() * 3) | 0) * 64, v = 124 + r() * 36;
        g.fillStyle = `rgb(${v},${v + 2},${v + 6})`; g.fillRect(x, y, pw - 2, 62); x += pw;
      }
    }
    for (let i = 0; i < 2500; i++) {
      const x = r() * w, y = r() * h, s = 2 + r() * 10, v = 90 + r() * 100;
      g.fillStyle = `rgba(${v},${v},${v + 4},${.15 + r() * .3})`; g.fillRect(x, y, s * (1 + r() * 3), s);
    }
    g.fillStyle = '#d4601f'; g.fillRect(0, 192, w, 22); g.fillRect(0, 232, w, 6);            // orange stripes
    g.fillStyle = '#3a3d44'; for (let i = 0; i < 12; i++) g.fillRect(30 + i * 84, 330, 40, 6);   // vents
    g.strokeStyle = 'rgba(40,44,52,.55)'; g.lineWidth = 2;
    for (let i = 0; i < 30; i++) { const x = r() * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let i = 0; i < 200; i++) {                                                          // streaks
      const x = r() * w, y = r() * h, l = 40 + r() * 200;
      const gr = g.createLinearGradient(0, y, 0, y + l);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, 'rgba(30,25,20,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x, y, 2 + r() * 6, l);
    }
    const e = canvas(w, h), ge = e.getContext('2d');
    ge.fillStyle = '#000'; ge.fillRect(0, 0, w, h);
    [100, 130, 410, 440].forEach((y, k) => {                                                // window rows
      for (let x = 4; x < w; x += 14) {
        if (r() < .08) continue;
        ge.fillStyle = r() < .85 ? 'rgba(255,214,150,.95)' : 'rgba(170,215,255,.95)';
        ge.fillRect(x, y, 8, k % 2 ? 5 : 8);
      }
    });

    const hull = new THREE.CanvasTexture(c); hull.encoding = THREE.sRGBEncoding; hull.anisotropy = 8; hull.wrapS = hull.wrapT = THREE.RepeatWrapping;
    const emi = new THREE.CanvasTexture(e); emi.encoding = THREE.sRGBEncoding; emi.wrapS = emi.wrapT = THREE.RepeatWrapping;
    shared.hullMat = new THREE.MeshStandardMaterial({
      map: hull, bumpMap: hull, bumpScale: 1.5, emissiveMap: emi, emissive: new THREE.Color(0xffe0b0), emissiveIntensity: .95,
      roughness: .6, metalness: .25
    });

    // ---- solar cells
    const sc = canvas(512, 256), gs = sc.getContext('2d');
    const gr = gs.createLinearGradient(0, 0, 512, 256); gr.addColorStop(0, '#16336e'); gr.addColorStop(1, '#0b1e47');
    gs.fillStyle = gr; gs.fillRect(0, 0, 512, 256);
    gs.strokeStyle = 'rgba(190,205,235,.75)'; gs.lineWidth = 2;
    for (let x = 0; x <= 512; x += 32) { gs.beginPath(); gs.moveTo(x, 0); gs.lineTo(x, 256); gs.stroke(); }
    for (let y = 0; y <= 256; y += 32) { gs.beginPath(); gs.moveTo(0, y); gs.lineTo(512, y); gs.stroke(); }
    gs.strokeStyle = 'rgba(230,235,250,.9)'; gs.lineWidth = 5; gs.strokeRect(2, 2, 508, 252);
    const solar = new THREE.CanvasTexture(sc); solar.encoding = THREE.sRGBEncoding; solar.anisotropy = 8;
    shared.solarMat = new THREE.MeshStandardMaterial({ map: solar, emissiveMap: solar, emissive: new THREE.Color(0x3a5ca8), emissiveIntensity: .55, roughness: .35, metalness: .6 });

    shared.goldMat = new THREE.MeshStandardMaterial({ color: 0xa87a2c, roughness: .38, metalness: .35, emissive: 0x2a1a05, emissiveIntensity: .25 });
    shared.greyMat = new THREE.MeshStandardMaterial({ color: 0x7c8088, roughness: .55, metalness: .5 });
    shared.darkMat = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: .6, metalness: .6, side: THREE.DoubleSide });
    shared.whiteMat = new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: .6, metalness: .2, side: THREE.DoubleSide });
    shared.glow = U.glowTexture(128);
    return shared;
  }

  const cylZ = (rt, rb, len, seg = 32) => new THREE.CylinderGeometry(rt, rb, len, seg, 1).rotateX(Math.PI / 2);

  function createShip(opts = {}) {
    const S = textures();
    const group = new THREE.Group();
    const r = U.rng(opts.landing ? 99 : 5);
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); group.add(m); return m; };

    // spine
    add(cylZ(24, 24, 920), S.greyMat, 0, AXIS, 40);
    // observation dome + forward habitat
    add(new THREE.SphereGeometry(74, 36, 24), S.hullMat, 0, AXIS, -735);
    add(cylZ(78, 78, 330, 40), S.hullMat, 0, AXIS, -560);
    add(cylZ(78, 30, 90, 32), S.hullMat, 0, AXIS, -350);
    add(new THREE.SphereGeometry(95, 32, 10, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(-Math.PI / 2), S.whiteMat, 0, AXIS + 125, -640).rotation.x = .25;
    add(new THREE.CylinderGeometry(4, 4, 90, 8), S.greyMat, 0, AXIS + 82, -625);
    add(new THREE.CylinderGeometry(2, 2, 130, 6), S.greyMat, 40, AXIS + 140, -520);
    add(new THREE.CylinderGeometry(2, 2, 90, 6), S.greyMat, -40, AXIS + 120, -480);

    // rotating habitat ring
    const ring = new THREE.Group(); ring.position.set(0, AXIS, -310); group.add(ring);
    const RR = 175;
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(RR, 24, 20, 96), S.hullMat));
    const spokeGeo = new THREE.CylinderGeometry(4.5, 4.5, RR - 40, 8).rotateZ(Math.PI / 2).translate((RR - 40) / 2 + 36, 0, 0);
    for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(spokeGeo, S.greyMat); s.rotation.z = i * Math.PI / 4; ring.add(s); }
    add(cylZ(46, 46, 90, 28), S.hullMat, 0, AXIS, -310);
    // ring lights (HDR so they bloom)
    const nl = 340, rl = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), nl);
    const d = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < nl; i++) {
      const th = r() * Math.PI * 2, ph = r() * Math.PI * 2, rr = RR + Math.cos(ph) * 24.5;
      d.position.set(Math.cos(th) * rr, Math.sin(th) * rr, Math.sin(ph) * 22);
      d.scale.set(3.5, 3.5, 3.5); d.rotation.set(0, 0, 0); d.updateMatrix(); rl.setMatrixAt(i, d.matrix);
      const warm = r() < .85, hot = 1.8 + r() * 2;
      if (warm) col.setRGB(hot, hot * .8, hot * .5); else col.setRGB(hot * .5, hot * .8, hot);
      rl.setColorAt(i, col);
    }
    ring.add(rl);

    // lab modules (4 around the spine)
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      add(cylZ(34, 34, 230, 28), S.hullMat, Math.cos(a) * 70, AXIS + Math.sin(a) * 70, -105);
      add(cylZ(34, 18, 40, 20), S.greyMat, Math.cos(a) * 70, AXIS + Math.sin(a) * 70, -230);
    }

    // solar wings
    add(new THREE.CylinderGeometry(6, 6, 1580, 10).rotateZ(Math.PI / 2), S.greyMat, 0, AXIS, 20);
    [-1, 1].forEach(sd => [0, 1, 2].forEach(k => {
      const p = add(new THREE.BoxGeometry(190, 3.5, 270), S.solarMat, sd * (260 + k * 205), AXIS, 20);
      p.rotation.z = sd * .02 * k; p.rotation.y = sd * .02;
    }));
    const beacons = [];
    [[-790, 1, .25, .2], [790, .2, 1, .3]].forEach(([x, rr, gg, bb]) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.glow, color: new THREE.Color(rr * 2.5, gg * 2.5, bb * 2.5), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      sp.scale.setScalar(70); sp.position.set(x, AXIS + 8, 20); group.add(sp); beacons.push(sp);
    });

    // propellant tanks : two clusters of three
    [150, 340].forEach(z => [90, 210, 330].forEach(deg => {
      const a = deg * Math.PI / 180;
      add(new THREE.SphereGeometry(62, 32, 22), S.goldMat, Math.cos(a) * 92, AXIS + Math.sin(a) * 92, z);
    }));
    add(cylZ(30, 30, 40), S.greyMat, 0, AXIS, 245);

    // engine section
    add(cylZ(78, 62, 160, 36), S.hullMat, 0, AXIS, 560);
    add(cylZ(30, 78, 90, 28), S.hullMat, 0, AXIS, 435);
    [-1, 1].forEach(s => add(new THREE.BoxGeometry(3, 90, 130), S.darkMat, s * 22, AXIS + 95, 520));   // radiator fins

    // main engines
    const engines = [[0, 0, 34], [46, 46, 22], [-46, 46, 22], [46, -46, 22], [-46, -46, 22]];
    const plumes = [], sprites = [], engineR = [];
    engines.forEach(([ox, oy, rad]) => {
      const x = ox, y = AXIS + oy;
      add(new THREE.CylinderGeometry(rad * 1.5, rad * .75, 60, 28, 1, true).rotateX(Math.PI / 2), S.darkMat, x, y, ZR - 28);
      add(new THREE.CircleGeometry(rad * 1.2, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.4, 2.2) }), x, y, ZR - 22);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.glow, color: new THREE.Color(1.0, .62, .35), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      sp.position.set(x, y, ZR + 24); group.add(sp); sprites.push(sp); engineR.push(rad);
      const pm = U.plumeMaterial(0xffc890, 0x4f9bff);
      const pg = new THREE.CylinderGeometry(rad * .2, rad * 1.15, 1, 24, 1, true).rotateX(Math.PI / 2).translate(0, 0, .5);
      const pl = new THREE.Mesh(pg, pm); pl.position.set(x, y, ZR); pl.scale.set(1, 1, 380); group.add(pl);
      plumes.push({ mesh: pl, mat: pm, base: 380 });
    });
    const engineLight = new THREE.PointLight(0xff9a50, 0, 1400, 1.4);
    engineLight.position.set(0, AXIS, ZR + 160); group.add(engineLight);

    // ---- landing hardware (surface version only)
    const ventral = [];
    if (opts.landing) {
      // thruster pods on outriggers
      [[-150, -560], [150, -560], [-170, -20], [170, -20], [-130, 560], [130, 560]].forEach(([x, z]) => {
        const y0 = 36;
        add(new THREE.CylinderGeometry(30, 36, 70, 22), S.darkMat, x, y0 + 35, z);
        const bx = Math.abs(x) - 20;
        add(new THREE.CylinderGeometry(6, 6, bx, 8).rotateZ(Math.PI / 2), S.greyMat, Math.sign(x) * bx / 2, AXIS - 10, z);
        add(new THREE.CylinderGeometry(6, 6, AXIS - y0 - 40, 8), S.greyMat, x, (AXIS + y0 + 40) / 2 - 10, z);
        const hot = new THREE.Mesh(new THREE.CircleGeometry(30, 22).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 2.2), side: THREE.DoubleSide }));
        hot.position.set(x, y0 - .5, z); group.add(hot);
        const pm = U.plumeMaterial(0xffd9a8, 0xff6a20);
        const pg = new THREE.CylinderGeometry(7, 34, 1, 22, 1, true).rotateX(Math.PI / 2).translate(0, 0, .5);
        const holder = new THREE.Group(); holder.position.set(x, y0 - 1, z); holder.rotation.x = Math.PI / 2;
        const pl = new THREE.Mesh(pg, pm); pl.scale.set(1, 1, 260); holder.add(pl); group.add(holder);
        ventral.push({ mesh: pl, mat: pm });
      });
      // legs: splayed struts from the spine to foot pads
      [[-560, 1], [-560, -1], [560, 1], [560, -1], [60, 1], [60, -1]].forEach(([z, s]) => {
        const fx = s * 120, fy = -80, top = new THREE.Vector3(0, AXIS, z), bot = new THREE.Vector3(fx, fy, z);
        const len = top.distanceTo(bot), strut = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, len, 10), S.greyMat);
        strut.position.copy(top).lerp(bot, .5); strut.rotation.z = Math.atan2(top.x - bot.x, top.y - bot.y) * -1; group.add(strut);
        add(new THREE.CylinderGeometry(26, 30, 7, 16), S.darkMat, fx, fy - 2, z);
      });
    }

    // ---- control
    function setThrust(rear, vent, t, rearLight) {
      ring.rotation.z = t * .12;
      beacons.forEach((b, i) => { b.material.opacity = .25 + .75 * Math.max(0, Math.sin(t * 3 + i * 1.6)); });
      plumes.forEach((p, i) => {
        p.mat.uniforms.uTime.value = t + i * .37; p.mat.uniforms.uPower.value = Math.min(1.5, rear * 1.2);
        p.mesh.scale.z = p.base * (.15 + rear * 1.0); p.mesh.visible = rear > .02;
      });
      sprites.forEach((s, i) => { s.material.opacity = U.clamp(.2 + rear * .85); s.scale.setScalar(engineR[i] * (6 + rear * 5)); });
      engineLight.intensity = (rearLight === undefined ? rear : rearLight) * 5;
      ventral.forEach((p, i) => {
        p.mat.uniforms.uTime.value = t + i * .53; p.mat.uniforms.uPower.value = vent * 1.2;
        p.mesh.scale.z = 90 + 520 * vent; p.mesh.visible = vent > .02;
      });
    }

    return { group, setThrust, engineLight, L, W, rest: REST };
  }

  window.SHIPMATS = textures;
  window.createShip = createShip;
  window.SHIP = { L, W, CY: AXIS, REST };
})();
