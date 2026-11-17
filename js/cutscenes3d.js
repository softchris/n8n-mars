/* 3D cinematic stage for the mission reward scenes.
   One Mars-surface world (terrain, sky, rocks, the landed ship in the distance) + a prop library + one shot per mission.
   Scale: 1 metre ≈ 15 units (the ship is 1500 units ≈ 100 m). */
(function () {
  const { lerp, clamp } = U, sm = U.smooth, TAU = Math.PI * 2;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  let renderer, composer, rp, bloom, grade, scene, camera, sky, sun, hemi, fillL, ground, shipObj, dyn, anims = [], earth, ready = false, failed = false, canvasEl = null, curShot = null, shotId = 0;
  const C = c => new THREE.Color(c);

  // ------------------------------------------------------------------ terrain
  function stageH(x, z) {
    const d = Math.hypot(x, z), flat = sm(1700, 5200, d);
    const big = (U.fbm2(x * .0004 + 7, z * .0004, 5) - .42) * 1100 * flat;
    const mid = (U.fbm2(x * .004, z * .004, 4) - .5) * 70 * flat;
    let h = big + mid + (U.fbm2(x * .03, z * .03, 3) - .5) * 5;
    const cn = Math.exp(-Math.pow((x - 9000 + 380 * Math.sin(z * .0007)) / 340, 2));   // a canyon far to the east (drone shot)
    return h - 650 * cn * sm(7000, 8200, x) + 160 * sm(7600, 8300, x) * (1 - cn);
  }
  function makeTerrain() {
    const SIZE = 44000, SEG = 280, geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = stageH(x, z); pos.setY(i, h);
      const n = U.fbm2(x * .002, z * .002, 4), n2 = U.noise2(x * .04, z * .04), dark = sm(.5, .7, U.fbm2(x * .0008 + 9, z * .0008, 3));
      c.setRGB(.36 + n * .16 + n2 * .05, .16 + n * .08 + n2 * .025, .08 + n * .045); c.multiplyScalar((1 - dark * .45) * (.85 + clamp(h / 700, -.3, .5)));
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  }
  function makeRocks() {
    const N = 1400, r = U.rng(31), m = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x4a2c20, roughness: 1, flatShading: true }), N);
    const d = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = r() * TAU, rad = 260 + Math.pow(r(), .75) * 6500, x = Math.cos(a) * rad, z = Math.sin(a) * rad, s = 2 + Math.pow(r(), 3) * 44;
      d.position.set(x, stageH(x, z) + s * .25, z); d.scale.set(s * (.8 + r() * .8), s * (.5 + r() * .5), s * (.8 + r() * .8)); d.rotation.set(r() * 3, r() * 6, r() * 3); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
      const v = .6 + r() * .6; col.setRGB(v, v * .9, v * .85); m.setColorAt(i, col);
    }
    return m;
  }
  function makeSky() {
    return new THREE.Mesh(new THREE.SphereGeometry(60000, 40, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSun: { value: V(-.6, .3, .5).normalize() }, uNight: { value: 0 }, uStorm: { value: 0 } },
      vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uSun; uniform float uNight, uStorm; varying vec3 vD;
        float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          vec3 d = normalize(vD); float h = clamp(d.y,0.0,1.0);
          vec3 hor = mix(vec3(.80,.50,.32), vec3(.11,.07,.12), uNight), mid = mix(vec3(.42,.30,.28), vec3(.05,.05,.10), uNight), top = mix(vec3(.07,.09,.17), vec3(.004,.006,.022), uNight);
          vec3 c = mix(hor, mid, smoothstep(0.0,.22,h)); c = mix(c, top, smoothstep(.15,.8,h));
          float s = max(dot(d, normalize(uSun)), 0.0);
          c += vec3(1.0,.62,.35) * pow(s, 6.0) * .45 * (1.0-uNight) + vec3(.5,.6,1.0) * pow(s, 60.0) * .5 * (1.0-uNight);
          vec3 sp = d*520.0; vec3 cell = floor(sp); float r = h3(cell); vec3 f = fract(sp) - .5; float st = step(.9975, r) * (.4 + .6*h3(cell+7.0)) * smoothstep(.34, .0, length(f)) * smoothstep(-.1,.25,d.y);
          c += vec3(st) * uNight * 1.3;
          float band = exp(-pow(dot(d, normalize(vec3(.3,.2,-.9)))*3.0, 2.0)); c += band * uNight * vec3(.05,.04,.08);
          c = mix(c, vec3(.58,.30,.17), uStorm*.9);
          c = mix(c, hor*.9, smoothstep(0.0,-.25,d.y));
          gl_FragColor = vec4(c, 1.0);
        }`
    }));
  }

  // ------------------------------------------------------------------ tiny helpers
  const mats = () => SHIPMATS();
  const white = new THREE.MeshStandardMaterial({ color: 0xc4c8ce, roughness: .55, metalness: .3 });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x1d2026, roughness: .6, metalness: .5 });
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
  const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 20) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); return o; };
  const hdr = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
  const glowTex = U.glowTexture(128);
  const glowSprite = (col, size, op = 1) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: C(col), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: op })); s.scale.setScalar(size); return s; };
  const place = (o, x, z, y = 0) => { o.position.set(x, stageH(x, z) + y, z); return o; };
  const ease = U.easeInOut;

  function labelSprite(text, color = '#9ff') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,12,10,.75)'; g.fillRect(0, 0, 256, 64); g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(2, 2, 252, 60); g.fillStyle = color; g.font = '600 30px monospace'; g.textAlign = 'center'; g.fillText(text, 128, 43);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })); s.scale.set(78, 19.5, 1); s.renderOrder = 10; return s;
  }

  // ------------------------------------------------------------------ props
  function makeRover() {
    const g = new THREE.Group(), wheels = [], tire = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: .9 }), hub = new THREE.MeshStandardMaterial({ color: 0x8a8d96, metalness: .6, roughness: .4 });
    g.add(box(44, 11, 26, white, 0, 20, 0), box(40, 5, 22, darkM, 0, 13, 0), box(30, 2.5, 20, mats().solarMat, -2, 26.5, 0));
    g.add(cyl(1.5, 1.5, 28, white, 14, 40, 0), box(12, 7, 8, white, 14, 56, 0), box(1, 3.4, 3.4, hdr(1.4, 2.4, 3.2), 20.4, 56, 0));
    const dish = new THREE.Mesh(new THREE.SphereGeometry(7, 14, 6, 0, TAU, Math.PI - .9, .9).rotateX(Math.PI / 2).translate(0, 0, 7), white); dish.position.set(-15, 34, 0); dish.rotation.y = -1.2; dish.material = white.clone(); dish.material.side = THREE.DoubleSide; g.add(dish);
    const arm = new THREE.Group(); arm.position.set(22, 18, -9); arm.add(cyl(1.6, 1.6, 20, white, 8, 4, 0).rotateZ(1.2)); g.add(arm);
    const arm2 = new THREE.Group(); arm2.position.set(17, 6, 0); arm2.add(cyl(1.4, 1.4, 16, white, 5, -3, 0).rotateZ(-1.0)); arm.add(arm2);
    [[-18, -17], [0, -17], [18, -17], [-18, 17], [0, 17], [18, 17]].forEach(([x, z]) => {
      const w = new THREE.Group(); w.position.set(x, 8, z); const t = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 20).rotateX(Math.PI / 2), tire); w.add(t); w.add(new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 6.5, 8).rotateX(Math.PI / 2), hub)); g.add(w); wheels.push(w);
      g.add(box(2, 10, 2, hub, x, 14, z * .78));
    });
    g.userData = { wheels, arm, arm2 }; return g;
  }
  function makeDome(r = 110, litIntensity = 1.2) {
    const g = new THREE.Group(), m = mats().hullMat.clone(); m.emissiveIntensity = litIntensity; m.side = THREE.DoubleSide;
    const d = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 24, 0, TAU, 0, Math.PI / 2), m); g.add(d);
    g.add(cyl(r * 1.04, r * 1.07, r * .07, mats().greyMat, 0, r * .035, 0, 48), box(r * .2, r * .24, r * .12, darkM, 0, r * .12, r * .98));
    g.userData = { mat: m, r }; return g;
  }
  function makePanelRow(n = 8, spacing = 70) {
    const g = new THREE.Group(), panels = [];
    for (let i = 0; i < n; i++) {
      const p = new THREE.Group(); p.position.set(i * spacing, 0, 0); p.add(cyl(2, 2.6, 26, mats().greyMat, 0, 13, 0, 8));
      const pv = new THREE.Group(); pv.position.y = 27; pv.add(box(58, 2, 34, mats().solarMat)); p.add(pv); g.add(p); panels.push(pv);
    }
    g.userData = { panels }; return g;
  }
  function makeDish() {
    const g = new THREE.Group(); g.add(cyl(14, 18, 10, mats().greyMat, 0, 5, 0), cyl(3.2, 3.8, 46, mats().greyMat, 0, 33, 0, 10));
    const pivot = new THREE.Group(); pivot.position.y = 56; g.add(pivot);
    const dm = white.clone(); dm.side = THREE.DoubleSide;
    pivot.add(new THREE.Mesh(new THREE.SphereGeometry(48, 40, 12, 0, TAU, Math.PI - .9, .9).rotateX(Math.PI / 2).translate(0, 0, 48), dm));
    pivot.add(cyl(.9, .9, 42, mats().greyMat, 0, 0, 21).rotateX(Math.PI / 2), box(5, 5, 5, hdr(2.2, 1.6, .8), 0, 0, 44));
    g.userData = { pivot }; return g;
  }
  function makeAstronaut() {
    const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xd4a040, roughness: .25, metalness: .7, emissive: 0x3a2508, emissiveIntensity: .8 });
    g.add(box(8.5, 10, 5.5, white, 0, 17, 0), new THREE.Mesh(new THREE.SphereGeometry(4.7, 18, 14), white), box(7, 10, 3, white, 0, 17.5, -4.2));
    g.children[1].position.set(0, 25.5, .3); const v = new THREE.Mesh(new THREE.SphereGeometry(3.6, 14, 10), gold); v.position.set(0, 25.5, 2.2); v.scale.set(1.1, .85, .7); g.add(v);
    [-2.2, 2.2].forEach(x => g.add(box(3.2, 11, 3.4, white, x, 6, 0)));
    const armL = new THREE.Group(), armR = new THREE.Group(); armL.position.set(-5.6, 21, 0); armR.position.set(5.6, 21, 0);
    armL.add(box(2.8, 9, 2.8, white, 0, -4, 0)); armR.add(box(2.8, 9, 2.8, white, 0, -4, 0)); g.add(armL, armR); g.userData = { armL, armR }; g.scale.setScalar(1.05); return g;
  }
  function makeDrone() {
    const g = new THREE.Group(), rotors = [];
    g.add(box(14, 7, 14, white, 0, 0, 0), cyl(.8, .8, 14, darkM, 0, 10, 0, 6), box(11, 3, 11, mats().solarMat, 0, 11, 0));
    [[-14, -14], [14, -14], [-14, 14], [14, 14]].forEach(([x, z]) => {
      g.add(box(Math.abs(x) * 1.3, 1, 1, darkM, x / 2, 0, z / 2).rotateY(Math.atan2(-z, x)));
      const r = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, .4, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .18, depthWrite: false })); r.position.set(x, 3, z); g.add(r);
      const bl = box(30, .5, 2.4, darkM, x, 3.4, z); g.add(bl); rotors.push(bl);
    });
    [[-5, 5], [5, 5], [-5, -5], [5, -5]].forEach(([x, z]) => g.add(cyl(.5, .5, 8, darkM, x, -6, z, 5)));
    g.scale.setScalar(1.8); g.userData = { rotors }; return g;
  }
  function makeGreenhouse(r = 150) {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 20, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xbfe8d0, transparent: true, opacity: .2, depthWrite: false, emissive: 0x2f8a40, emissiveIntensity: .25, side: THREE.DoubleSide, roughness: .1 }));
    g.add(shell, cyl(r * 1.03, r * 1.05, r * .06, mats().greyMat, 0, r * .03, 0, 40));
    const plants = [], rr = U.rng(5), pm = new THREE.MeshStandardMaterial({ color: 0x5fe070, emissive: 0x1f8a30, emissiveIntensity: .8, roughness: .6 });
    for (let i = 0; i < 70; i++) {
      const a = rr() * TAU, d = Math.sqrt(rr()) * r * .8, p = new THREE.Group(); p.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      p.add(cyl(.9, 1.4, 20, pm, 0, 10, 0, 6)); for (let k = 0; k < 4; k++) { const lf = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), pm); lf.scale.set(1.6, .25, .8); lf.position.set(Math.cos(k * 1.6) * 5, 8 + k * 4, Math.sin(k * 1.6) * 5); lf.rotation.y = -k * 1.6; p.add(lf); }
      p.scale.setScalar(.001); p.userData.delay = rr() * .5; p.userData.size = .45 + rr() * .6; g.add(p); plants.push(p);
    }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.add(box(34, 7, 100, mats().greyMat, Math.cos(a) * r * .5, 3.5, Math.sin(a) * r * .5).rotateY(a + Math.PI / 2)); }
    const L = new THREE.PointLight(0x7dff8a, 1.4, 500, 1.6); L.position.y = r * .55; g.add(L);
    g.userData = { plants, light: L, shell }; return g;
  }
  function makeCrystal() {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x39b8e8, emissiveIntensity: 1.6, roughness: .15, metalness: .4 });
    for (let i = 0; i < 5; i++) { const o = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), m); const s = i ? 7 + i * 2 : 14; o.scale.set(s * .45, s * 1.8, s * .45); o.position.set(i ? Math.cos(i * 1.9) * 15 : 0, s * 1.5, i ? Math.sin(i * 1.9) * 15 : 0); o.rotation.set((i - 2) * .12, i, (i - 2) * .1); g.add(o); }
    const L = new THREE.PointLight(0x58c8ff, 2.2, 500, 1.6); L.position.y = 30; g.add(L, glowSprite('#58c8ff', 170, .3)); g.userData = { light: L }; return g;
  }
  function makeCrate(c) { const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: c, roughness: .6, metalness: .3, emissive: 0x000000 }); const b = box(24, 20, 24, m, 0, 10, 0); g.add(b, box(25, 2, 25, darkM, 0, 3, 0), box(25, 2, 25, darkM, 0, 17, 0)); g.userData = { mat: m }; return g; }
  function makeTower(h = 360) { const g = new THREE.Group(); g.add(cyl(3, 7, h, mats().greyMat, 0, h / 2, 0, 8), cyl(14, 14, 6, mats().greyMat, 0, 6, 0)); for (let i = 1; i < 5; i++) g.add(cyl(.8, .8, 40, darkM, 0, h * i / 5, 0, 4).rotateZ(Math.PI / 2)); const b = glowSprite('#ff6a4a', 60, 1); b.position.y = h + 6; g.add(b); g.userData = { beacon: b, h }; return g; }
  function makeSpire() {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: .25, metalness: .9, emissive: 0x0a3a30, emissiveIntensity: .7 });
    const o = new THREE.Mesh(new THREE.CylinderGeometry(5, 15, 280, 4), m); o.position.y = 140; o.rotation.y = Math.PI / 4; g.add(o);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 270, 6), hdr(.8, 3, 2.6)); core.position.y = 140; g.add(core);
    const pm = U.plumeMaterial(0x9fffe0, 0x3a9bff), beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 18, 1, 24, 1, true).rotateX(Math.PI / 2).translate(0, 0, .5), pm); beam.scale.z = 4200;
    const holder = new THREE.Group(); holder.rotation.x = -Math.PI / 2; holder.position.y = 270; holder.add(beam); g.add(holder);
    const L = new THREE.PointLight(0x4affd0, 3, 800, 1.5); L.position.y = 60; g.add(L, glowSprite('#4affd0', 300, .3)); g.userData = { pm, light: L, core }; return g;
  }
  function makeEarth() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#1b4fb0'; g.fillRect(0, 0, 256, 128);
    for (let y = 0; y < 128; y += 2) for (let x = 0; x < 256; x += 2) { const n = U.fbm2(x * .03, y * .05, 4); if (n > .56) { g.fillStyle = `rgba(60,140,70,${.7})`; g.fillRect(x, y, 2, 2); } const cl = U.fbm2(x * .02 + 40, y * .04, 3); if (cl > .6) { g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x, y, 2, 2); } }
    const m = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 20), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) })); const gl = glowSprite('#5aa0ff', 700, .4); const grp = new THREE.Group(); grp.add(m, gl); grp.userData = { glow: gl, mesh: m }; return grp;
  }
  function ringPulse(color = [2.2, 1.6, .8]) { const m = new THREE.Mesh(new THREE.RingGeometry(1, 1.05, 72), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); return m; }

  // soft particle field (dust / steam / sparkles), a pure function of time
  function particles({ n, box: bx, center, vel, size, color = '#d49060', alpha = .3, seed = 1 }) {
    const r = U.rng(seed), base = [], geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), sz = new Float32Array(n), al = new Float32Array(n);
    for (let i = 0; i < n; i++) base.push({ x: r(), y: r(), z: r(), sp: .6 + r() * .8, s: size[0] + r() * (size[1] - size[0]) });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); geo.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { uMap: { value: U.dustTexture() }, uScale: { value: 800 }, uCol: { value: C(color) }, uA: { value: alpha } },
      vertexShader: `attribute float aSize, aAlpha; varying float vA; uniform float uScale; void main(){ vA = aAlpha; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = min(aSize*uScale/max(-mv.z,1.0), 700.0); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uCol; uniform float uA; varying float vA; void main(){ float t = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(uCol, t*vA*uA); }` });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
    pts.userData.update = (t, k = 1) => {
      for (let i = 0; i < n; i++) { const b = base[i];
        const x = (((b.x * bx[0] + vel.x * t * b.sp) % bx[0]) + bx[0]) % bx[0] - bx[0] / 2, y = (((b.y * bx[1] + vel.y * t * b.sp) % bx[1]) + bx[1]) % bx[1], z = (((b.z * bx[2] + vel.z * t * b.sp) % bx[2]) + bx[2]) % bx[2] - bx[2] / 2;
        pos[i * 3] = center.x + x; pos[i * 3 + 1] = center.y + y; pos[i * 3 + 2] = center.z + z; sz[i] = b.s; al[i] = k * (.4 + .6 * Math.sin(i * 1.7 + t * .5) ** 2); }
      geo.attributes.position.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = true;
    };
    return pts;
  }

  // ------------------------------------------------------------------ time of day
  const WARM = C(0xffc08a), MOON = C(0x7d8cc8), FOGD = C(0xb9805a), FOGN = C(0x0b0810), FOGS = C(0xa5603c);
  function setTime(night, storm = 0) {
    sky.material.uniforms.uNight.value = night; sky.material.uniforms.uStorm.value = storm;
    sun.color.copy(WARM).lerp(MOON, night); sun.intensity = lerp(2.3, .38, night) * (1 - .45 * storm); sun.position.set(lerp(-.6, .3, night), lerp(.22, .5, night), lerp(.5, .4, night)).multiplyScalar(1000);
    hemi.color.copy(C(0xd8a880)).lerp(C(0x303c70), night); hemi.groundColor.copy(C(0x4a2a1c)).lerp(C(0x100810), night); hemi.intensity = lerp(.5, .32, night);
    scene.fog.color.copy(FOGD).lerp(FOGN, night).lerp(FOGS, storm); scene.fog.density = lerp(.00015, .00022, night) + storm * .0005;
    grade.uniforms.uExp.value = lerp(1.0, 1.12, night);
  }

  // ------------------------------------------------------------------ shots
  const orb = (c, r, a, h) => V(c.x + Math.cos(a) * r, h, c.z + Math.sin(a) * r);
  const lerp3 = (a, b, u) => V(lerp(a.x, b.x, u), lerp(a.y, b.y, u), lerp(a.z, b.z, u));
  const add = o => { dyn.add(o); return o; };
  const tick = fn => { anims.push(fn); };

  const SHOTS = {
    // 1 · Phone Home: a dish under the stars, signal rings racing to Earth
    1() {
      const D = V(.3, .72, -.62).normalize(), dish = add(place(makeDish(), 0, 0)); dish.userData.pivot.lookAt(dish.userData.pivot.position.clone().add(D));
      const E = D.clone().multiplyScalar(9000); earth.visible = true; earth.position.copy(E); earth.userData.base = E;
      const rings = Array.from({ length: 6 }, () => add(ringPulse())), pkt = add(glowSprite('#9fffd8', 120, 1)), foc = V(0, 56, 0).add(D.clone().multiplyScalar(46));
      add(place(makeDome(90, 1.4), -230, 130)); add(place(makeDome(70, 1.2), -330, -30)); add(place(makeDome(64, 1.2), 240, 210));
      return {
        night: () => .93, update(t, u) {
          rings.forEach((r, k) => { const p = ((t * .42 + k / 6) % 1), d = p * 3200, pos = foc.clone().add(D.clone().multiplyScalar(d)); r.position.copy(pos); r.lookAt(pos.clone().add(D)); r.scale.setScalar(26 + d * .09); r.material.opacity = (1 - p) * .85 * (u < .55 ? 1 : .35); });
          const back = sm(.55, .62, u); const q = u < .55 ? u / .55 : 1 - (u - .55) / .45; pkt.position.copy(foc).add(D.clone().multiplyScalar(lerp(0, 9000, clamp(q)))); pkt.scale.setScalar(120 + 260 * clamp(q)); pkt.material.opacity = u > .95 ? 0 : 1;
          earth.userData.glow.scale.setScalar(700 + 500 * Math.max(0, Math.sin(clamp((u - .5) * 3, 0, 1) * Math.PI)) * (u > .5 ? 1 : 0)); earth.userData.glow.material.opacity = .4 + .4 * back;
        },
        cam: (t, u) => ({ p: V(lerp(-210, -120, ease(u)), lerp(24, 50, ease(u)), lerp(60, 30, ease(u))), l: V(40, lerp(130, 200, u), -120), fov: 46 })
      };
    },

    // 2 · Wheels Down: the rover rolls past the camera, trailing dust
    2() {
      const rover = add(makeRover()); const path = u => ({ x: lerp(-560, 170, u), z: lerp(-120, 40, u) });
      const dust = add(particles({ n: 110, box: [420, 36, 120], center: V(0, 0, 0), vel: V(-6, 7, 0), size: [30, 70], alpha: .35, seed: 4 }));
      return {
        night: () => .0, update(t, u) {
          const s = ease(clamp(u * 1.15)), p = path(s), p2 = path(clamp(s + .01)); place(rover, p.x, p.z); rover.rotation.y = -Math.atan2(p2.z - p.z, p2.x - p.x); rover.userData.wheels.forEach(w => { w.rotation.z = -p.x * .12; });
          dust.userData.update(t, .8); dust.position.set(p.x - 190 - dust.position.x * 0, 2, p.z); dust.material.uniforms.uA.value = .32 * (1 - s * .4);
        },
        cam: (t, u) => ({ p: V(90, lerp(18, 26, u), 150), l: V(lerp(-110, 130, ease(u)), 20, 0), fov: lerp(34, 44, u) })
      };
    },

    // 3 · Something in the Dust: scan beam, a crystal rises from the ground
    3() {
      const rover = add(place(makeRover(), 0, 0)); rover.rotation.y = -.35; const cr = add(place(makeCrystal(), 210, -90)); cr.scale.setScalar(.01);
      const beamM = new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, 1.4, 1), transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const beam = add(new THREE.Mesh(new THREE.CylinderGeometry(1, 12, 1, 24, 1, true).rotateX(Math.PI / 2).translate(0, 0, .5), beamM));
      const ring = add(ringPulse([.4, 2, 1.6])); ring.rotation.x = Math.PI / 2; ring.position.set(210, 2, -90);
      return {
        night: u => .35 * sm(.4, 1, u), update(t, u) {
          rover.updateMatrixWorld(true); const head = rover.localToWorld(V(14, 56, 0)); const k = sm(.22, .4, u), tg = cr.position.clone().add(V(0, 20, 0)); beam.position.copy(head); beam.lookAt(tg); beam.scale.set(1, 1, head.distanceTo(tg)); beamM.opacity = .22 * k * (.7 + .3 * Math.sin(t * 14));
          cr.scale.setScalar(sm(.3, .62, u) * 1.4); cr.userData.light.intensity = 2.2 + 1.2 * Math.sin(t * 3); ring.scale.setScalar(20 + ((t * .5) % 1) * 160); ring.material.opacity = (1 - ((t * .5) % 1)) * .8 * sm(.35, .5, u);
          rover.userData.arm.rotation.z = Math.sin(t * 1.2) * .1;
        },
        cam: (t, u) => ({ p: orb(V(100, 0, -40), lerp(330, 240, u), lerp(.3, 1.35, ease(u)), lerp(30, 60, u)), l: V(110, 45, -50), fov: 38 })
      };
    },

    // 4 · Keep the Lights On: solar fields track the sun, the habitat glows on as dusk falls
    4() {
      const rows = [0, 1, 2].map(i => add(place(makePanelRow(9, 74), -300, -80 - i * 110))); const domes = [add(place(makeDome(110, .1), 150, 160)), add(place(makeDome(80, .1), 360, 60)), add(place(makeDome(70, .1), 40, 280))];
      return {
        night: u => lerp(.0, .9, sm(.15, .85, u)), update(t, u) {
          rows.forEach(r => r.userData.panels.forEach((p, i) => { p.rotation.z = lerp(.6, -.5, clamp(u * 1.2 + i * .01)); })); const lit = sm(.3, .8, u);
          domes.forEach((d, i) => { d.userData.mat.emissiveIntensity = lit * 2.2 * (.8 + .2 * Math.sin(t * 2 + i)); });
        },
        cam: (t, u) => ({ p: V(lerp(-380, 260, ease(u)), lerp(26, 70, u), lerp(60, 110, u)), l: V(lerp(-150, 330, ease(u)), 34, -80), fov: 44 })
      };
    },

    // 5 · Storm Front: a wall of dust rolls over the habitat
    5() {
      const domes = [add(place(makeDome(120, 1.5), 0, 0)), add(place(makeDome(86, 1.5), 230, 120)), add(place(makeDome(72, 1.5), -200, 140))];
      const dust = add(particles({ n: 700, box: [3600, 520, 3000], center: V(0, 0, 0), vel: V(-1100, 4, -140), size: [40, 100], alpha: .3, seed: 8 }));
      add(place(makePanelRow(5, 74), 80, -200));
      return {
        night: () => .2, storm: u => sm(.05, .55, u) * (1 - .25 * sm(.85, 1, u)), update(t, u) {
          dust.userData.update(t, sm(0, .45, u)); dust.position.set(0, 0, 0); domes.forEach((d, i) => { d.userData.mat.emissiveIntensity = 1.6 + .6 * Math.sin(t * 9 + i * 2) * sm(.4, .7, u); });
        },
        cam: (t, u) => ({ p: V(lerp(-70, 20, u) + Math.sin(t * 17) * 1.6 * sm(.3, .7, u), lerp(34, 60, u), lerp(260, 420, ease(u))), l: V(0, 70, 0), fov: 42 })
      };
    },

    // 6 · Ice Hunt: the drill rig finds a glowing vein of ice
    6() {
      const rover = add(place(makeRover(), -60, 20)); rover.rotation.y = .5; const ice = add(new THREE.Group()); place(ice, 90, -30);
      const patch = new THREE.Mesh(new THREE.CircleGeometry(80, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, 1.6, 2.4), transparent: true, opacity: .0, blending: THREE.AdditiveBlending, depthWrite: false })); patch.position.y = .8; ice.add(patch);
      const rr = U.rng(3); const shards = []; for (let i = 0; i < 22; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x2a9ad8, emissiveIntensity: 1.2, roughness: .1 })); const a = rr() * TAU, d = Math.sqrt(rr()) * 70; s.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); s.userData.h = 5 + rr() * 16; s.scale.setScalar(.001); ice.add(s); shards.push(s); }
      const L = new THREE.PointLight(0x58c8ff, 2.5, 450, 1.6); L.position.y = 24; ice.add(L, glowSprite('#58c8ff', 200, .22)); const steam = add(particles({ n: 60, box: [140, 160, 140], center: V(90, 0, -30), vel: V(4, 22, 0), size: [30, 60], color: '#dff4ff', alpha: .35, seed: 6 }));
      return {
        night: u => .45 * sm(.1, .8, u), update(t, u) {
          const k = sm(.2, .55, u); patch.material.opacity = .65 * k; shards.forEach((s, i) => { s.scale.set(1.2, s.userData.h * k, 1.2).multiplyScalar(.5 + (i % 3) * .2); s.position.y = s.userData.h * k * .3; }); L.intensity = 2.5 * k + .8 * Math.sin(t * 5);
          steam.userData.update(t, k); rover.userData.arm.rotation.z = Math.sin(t * 3) * .12 - .2;
        },
        cam: (t, u) => ({ p: orb(V(20, 0, -10), lerp(300, 210, u), lerp(-.6, .5, ease(u)), lerp(40, 70, u)), l: V(30, 24, -10), fov: 40 })
      };
    },

    // 7 · Breathe Easy: oxygen vents, a shimmering ring of air around the habitat
    7() {
      const dome = add(place(makeDome(130, 1.6), 0, 0)), unit = add(place(box(60, 36, 40, white, 0, 18, 0), 210, 20)); [-18, 0, 18].forEach(x => unit.add(cyl(5, 5, 14, darkM, x, 40, 0, 12)));
      const mist = add(particles({ n: 90, box: [90, 260, 90], center: V(210, 40, 20), vel: V(3, 38, 0), size: [30, 70], color: '#cfeaff', alpha: .35, seed: 11 }));
      const rings = Array.from({ length: 3 }, () => { const m = new THREE.Mesh(new THREE.TorusGeometry(1, .012, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(.4, 1.6, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.rotation.x = Math.PI / 2; m.position.set(0, 4, 0); return add(m); });
      return {
        night: () => .88, update(t, u) { mist.userData.update(t, 1); rings.forEach((r, k) => { const p = ((t * .22 + k / 3) % 1); r.scale.setScalar(130 + p * 260); r.position.y = 6 + p * 20; r.material.opacity = (1 - p) * .9; }); dome.userData.mat.emissiveIntensity = 1.8 + .3 * Math.sin(t * 2); },
        cam: (t, u) => ({ p: orb(V(60, 0, 0), lerp(420, 330, u), lerp(.5, 1.7, ease(u)), lerp(50, 120, ease(u))), l: V(60, 70, 0), fov: 40 })
      };
    },

    // 8 · Green Thumbs: through the glass, into a dome full of growing plants
    8() {
      const gh = add(place(makeGreenhouse(150), 0, 0)); add(place(makeDome(90, 1.4), -290, 90));
      return {
        night: () => .85, update(t, u) {
          gh.userData.plants.forEach(p => { const g = sm(.15 + p.userData.delay * .6, .55 + p.userData.delay * .6, u); p.scale.setScalar(.001 + g * p.userData.size); p.rotation.y = Math.sin(t + p.position.x) * .05; }); gh.userData.light.intensity = 1 + 1.2 * sm(.2, .8, u);
          gh.userData.shell.material.opacity = lerp(.22, .08, sm(.45, .65, u));
        },
        cam: (t, u) => ({ p: lerp3(V(-100, 70, 420), V(40, 44, 90), ease(u)), l: lerp3(V(0, 60, 0), V(0, 14, -40), ease(u)), fov: lerp(40, 58, u) })
      };
    },

    // 9 · Daily Check-In: seven crew watch the sun set over the ship, one waves
    9() {
      const crew = []; for (let i = 0; i < 7; i++) { const a = makeAstronaut(); place(a, 0, -105 + i * 35); a.rotation.y = -Math.PI / 2 + (i - 3) * .05; add(a); crew.push(a); }
      return {
        night: () => 0, update(t, u) { crew.forEach((a, i) => { a.userData.armR.rotation.z = (i === 3 ? 2.6 + Math.sin(t * 6) * .45 : .15 + Math.sin(t * .8 + i) * .05); a.userData.armL.rotation.z = -.1; a.position.y = stageH(a.position.x, a.position.z) + Math.max(0, Math.sin(t * 1.3 + i)) * .6; }); },
        cam: (t, u) => ({ p: V(lerp(330, 250, ease(u)), lerp(30, 44, u), lerp(120, 10, ease(u))), l: V(-260, 62, lerp(0, -100, u)), fov: 40 })
      };
    },

    // 10 · Rock Detective: the arm samples rocks, holograms classify them
    10() {
      const rover = add(place(makeRover(), 0, 0)); rover.rotation.y = -.9; const names = ['BASALT', 'IRON', 'SILICA', 'HEMATITE', 'OLIVINE', 'GYPSUM'], items = [];
      names.forEach((n, i) => { const a = -.5 + i * .42, d = 170 + (i % 2) * 40, x = Math.cos(a) * d + 40, z = Math.sin(a) * d; const r = new THREE.Mesh(new THREE.DodecahedronGeometry(11 + (i % 3) * 3, 0), new THREE.MeshStandardMaterial({ color: 0x57352a, roughness: 1, flatShading: true, emissive: 0x000000 })); place(r, x, z, 8); add(r);
        const lab = labelSprite(n); lab.position.set(x, stageH(x, z) + 62, z); lab.material.opacity = 0; add(lab); const rg = ringPulse([.3, 2, 1.5]); rg.rotation.x = Math.PI / 2; rg.position.set(x, stageH(x, z) + 1.5, z); add(rg); items.push({ r, lab, rg }); });
      return {
        night: u => .5 * sm(0, 1, u), update(t, u) { items.forEach((it, i) => { const k = sm(.12 + i * .11, .22 + i * .11, u); it.lab.material.opacity = k; it.lab.position.y = it.r.position.y + 40 + k * 14 + Math.sin(t * 2 + i) * 2; it.r.material.emissive.setRGB(0, .3 * k, .22 * k); const p = ((t * .6 + i * .2) % 1); it.rg.scale.setScalar(10 + p * 60 * k); it.rg.material.opacity = (1 - p) * k; });
          rover.userData.arm.rotation.z = Math.sin(t * .9) * .25; rover.userData.arm2.rotation.z = Math.sin(t * 1.4) * .3; },
        cam: (t, u) => ({ p: orb(V(90, 0, 40), lerp(350, 280, u), lerp(-.9, .3, ease(u)), lerp(40, 110, u)), l: V(100, 34, 40), fov: 40 })
      };
    },

    // 11 · Eyes in the Sky: chase the drone through a canyon
    11() {
      const drone = add(makeDrone()), base = V(9000, 0, 0), path = s => { const z = lerp(600, -4800, s); const x = 9000 - 380 * Math.sin(z * .0007) * -1 + 380 * Math.sin(z * .0007) * 0; return V(9000 + (-380 * Math.sin(z * .0007)) * -1 * -1 + 0, 0, z); };
      const cx = z => 9000 - 380 * Math.sin(z * .0007), dust = add(particles({ n: 90, box: [900, 500, 1400], center: V(9000, 0, 0), vel: V(0, 3, 0), size: [40, 90], alpha: .15, seed: 12 }));
      return {
        night: () => .1, update(t, u) { const s = u * .86 + .02, z = lerp(600, -4800, s), x = cx(z), y = stageH(x, z) + 330 + Math.sin(t * 1.3) * 9; drone.position.set(x, y, z); drone.rotation.y = -Math.atan2(cx(z - 30) - x, -30) * .5 + Math.PI; drone.rotation.z = Math.sin(t) * .06; drone.userData.rotors.forEach((r, i) => { r.rotation.y = t * 70 * (i % 2 ? 1 : -1); });
          dust.position.set(x - 9000, 0, z); dust.userData.update(t, 1); },
        cam: (t, u) => { const s = u * .86 + .02, z = lerp(600, -4800, s), x = cx(z); return { p: V(x + lerp(-140, 170, ease(u)), stageH(x, z) + lerp(520, 420, u), z + 380), l: V(x, stageH(x, z - 60) + 250, z - 60), fov: 52 }; }
      };
    },

    // 12 · Supply Run: floodlit crates get scanned one by one
    12() {
      const rr = U.rng(21), crates = []; const colors = [0xc86a20, 0x59616e, 0x2f6aa8, 0x8a8f99];
      for (let ix = 0; ix < 6; ix++) for (let iz = 0; iz < 4; iz++) for (let l = 0; l < 1 + ((ix + iz) % 3); l++) { const c = makeCrate(colors[(ix * 3 + iz + l) % 4]); place(c, -75 + ix * 30, -45 + iz * 30, l * 20.5); add(c); crates.push({ c, k: ix * .13 + iz * .02 }); }
      const gantry = add(new THREE.Group()); gantry.add(box(4, 90, 4, mats().greyMat, -105, 45, 0), box(4, 90, 4, mats().greyMat, 105, 45, 0), box(214, 5, 5, mats().greyMat, 0, 90, 0)); const laser = box(1.5, 88, 120, hdr(.3, 2.4, 1.6), 0, 45, 0); laser.material.transparent = true; laser.material.opacity = .3; gantry.add(laser);
      [-200, 200].forEach(x => { const L = new THREE.PointLight(0xfff0d0, 1.5, 900, 1.5); L.position.set(x, 160, 60); add(L); add(place(cyl(2, 2, 150, mats().greyMat, 0, 75, 0, 6), x, 60)); });
      place(gantry, 0, 0); add(place(makeDome(80, 1.4), -260, -130));
      return {
        night: () => .9, update(t, u) { const x = lerp(-105, 105, clamp((u - .08) / .8)); gantry.position.x = x * 0 + 0; laser.position.x = x; crates.forEach(o => { const on = sm(0, 1, (x + 105) / 210 - (o.c.position.x + 75) / 150 + 1) ; const hit = (o.c.position.x + 75) / 150 * 210 - 105 < x; o.c.userData.mat.emissive.setRGB(hit ? .05 : 0, hit ? .5 : 0, hit ? .3 : 0); }); },
        cam: (t, u) => ({ p: lerp3(V(-210, 24, 190), V(150, 140, 230), ease(u)), l: V(0, 24, 0), fov: lerp(42, 36, u) })
      };
    },

    // 13 · Mayday: red alarm lights sweep the habitat, then recovery flips them green
    13() {
      const doms = [add(place(makeDome(110, 1.2), 0, 0)), add(place(makeDome(80, 1.2), 230, 90))], tw = add(place(makeTower(230), -190, -40)), L = add(new THREE.PointLight(0xff2020, 14, 1100, 1.2)); L.position.set(-190, 235, -40);
      const sweepM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, .25, .2), transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const sweep = new THREE.Mesh(new THREE.ConeGeometry(70, 600, 24, 1, true).rotateX(Math.PI / 2).translate(0, 0, -300), sweepM); sweep.position.set(-190, 240, -40); add(sweep);
      return {
        night: () => .92, update(t, u) { const ok = u > .55, k = sm(.5, .6, u), flick = ok ? 1 : (Math.sin(t * 8) > 0 ? 1 : .15); const col = new THREE.Color().setRGB(lerp(2.5, .2, k), lerp(.25, 2.4, k), lerp(.2, .8, k));
          L.color.setRGB(lerp(1, .2, k), lerp(.12, 1, k), lerp(.1, .45, k)); L.intensity = 14 * flick; sweepM.color.copy(col); sweepM.opacity = (ok ? .16 : .3) * flick; sweep.rotation.y = ok ? sweep.rotation.y : t * 4.2; if (ok) sweep.rotation.y += .0;
          tw.userData.beacon.material.color.copy(col.clone().multiplyScalar(.6)); doms.forEach(d => { d.userData.mat.emissiveIntensity = ok ? 1.8 : .5 + 1.5 * (Math.sin(t * 8) > 0 ? 1 : 0); }); },
        cam: (t, u) => ({ p: lerp3(V(-60, 40, 330), V(120, 160, 560), ease(u)), l: V(-30, 80, 0), fov: 44 })
      };
    },

    // 14 · The Signal: an alien spire and a column of light, rings spreading across the plain
    14() {
      const sp = add(place(makeSpire(), 0, -330)), rings = Array.from({ length: 4 }, () => { const r = ringPulse([.4, 2.2, 1.8]); r.rotation.x = Math.PI / 2; r.position.set(0, 3, -330); return add(r); });
      const mist = add(particles({ n: 80, box: [700, 220, 700], center: V(0, 0, -330), vel: V(2, 8, 0), size: [30, 60], color: '#7fffd4', alpha: .05, seed: 15 }));
      return {
        night: () => .96, update(t, u) { rings.forEach((r, k) => { const p = ((t * .2 + k / 4) % 1); r.scale.setScalar(20 + p * 1600); r.material.opacity = (1 - p) * .8; }); sp.userData.light.intensity = 3 + 2 * Math.sin(t * 7 + Math.sin(t * 2) * 3); sp.userData.pm.uniforms.uTime.value = t; sp.userData.pm.uniforms.uPower.value = .32 + .12 * sm(.6, 1, u); mist.userData.update(t, 1); },
        cam: (t, u) => ({ p: lerp3(V(40, 22, 330), V(10, 34, -40), ease(u)), l: V(0, lerp(130, 180, u), -330), fov: lerp(46, 58, u) })
      };
    },

    // 15 · First Colony Broadcast: crane up over the lit colony as the tower broadcasts to Earth
    15() {
      const doms = []; [[0, 0, 120], [210, -60, 90], [-210, -50, 90], [130, 180, 80], [-150, 170, 80], [330, 80, 66], [-330, 90, 66], [60, -260, 76], [-120, -230, 66]].forEach(([x, z, r]) => { const d = makeDome(r, .1); place(d, x, z); add(d); doms.push(d); });
      const tw = add(place(makeTower(420), 0, -110)), E = V(.1, .8, -.55).normalize().multiplyScalar(9000); earth.visible = true; earth.userData.base = E;
      add(place(makePanelRow(8, 74), -300, 330)); add(place(makePanelRow(8, 74), -300, 410));
      const crew = []; for (let i = 0; i < 6; i++) { const a = makeAstronaut(); place(a, -90 + i * 36, 250); a.rotation.y = Math.PI; add(a); crew.push(a); }
      const rings = Array.from({ length: 6 }, () => add(ringPulse([2.2, 1.7, .9]))), D = E.clone().sub(V(0, 430, -110)).normalize();
      return {
        night: u => lerp(.35, .9, sm(0, .9, u)), update(t, u) { doms.forEach((d, i) => { d.userData.mat.emissiveIntensity = 2.1 * sm(.05 + i * .06, .2 + i * .06, u); }); tw.userData.beacon.material.opacity = .6 + .4 * Math.sin(t * 5);
          rings.forEach((r, k) => { const p = ((t * .4 + k / 6) % 1), pos = V(0, 430, -110).add(D.clone().multiplyScalar(p * 3600)); r.position.copy(pos); r.lookAt(pos.clone().add(D)); r.scale.setScalar(40 + p * 380); r.material.opacity = (1 - p) * .9 * sm(.2, .4, u); });
          crew.forEach((a, i) => { a.userData.armL.rotation.z = 2.7 + Math.sin(t * 5 + i) * .4; a.userData.armR.rotation.z = -2.7 - Math.sin(t * 5 + i * 1.3) * .4; });
          earth.userData.glow.scale.setScalar(1000 + 700 * sm(.3, 1, u)); },
        cam: (t, u) => ({ p: orb(V(0, 0, 0), lerp(520, 760, ease(u)), lerp(1.25, 2.2, ease(u)) + Math.PI / 2, lerp(26, 420, ease(u))), l: V(0, lerp(60, 200, u), -60), fov: lerp(46, 52, u) })
      };
    }
  };

  // ------------------------------------------------------------------ setup
  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setClearColor(0x000000);
    scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xb9805a, .00015); camera = new THREE.PerspectiveCamera(42, 16 / 9, 1, 120000);
    sky = makeSky(); sky.renderOrder = -10; scene.add(sky); ground = makeTerrain(); scene.add(ground, makeRocks());
    sun = new THREE.DirectionalLight(0xffc08a, 2.3); scene.add(sun); hemi = new THREE.HemisphereLight(0xd8a880, 0x4a2a1c, .5); scene.add(hemi);
    shipObj = createShip({ landing: true }); const rig = new THREE.Group(); rig.add(shipObj.group); rig.position.set(-1250, stageH(-1250, -950) + shipObj.rest, -950); rig.rotation.y = Math.PI / 2 + .3; scene.add(rig);
    earth = makeEarth(); earth.visible = false; scene.add(earth); dyn = new THREE.Group(); scene.add(dyn);
    composer = new THREE.EffectComposer(renderer); rp = new THREE.RenderPass(scene, camera); composer.addPass(rp);
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), .5, .5, .88); composer.addPass(bloom);
    grade = new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, uExp: { value: 1 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uExp, uTime; uniform vec2 uRes; varying vec2 vUv;
        float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
        vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
        void main(){ vec2 c = vUv-.5; float ca = .002*dot(c,c)*4.0;
          vec3 col = vec3(texture2D(tDiffuse, vUv+c*ca*2.0).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv-c*ca*2.0).b);
          col = pow(aces(col*uExp), vec3(1.0/2.2)); col *= 1.0 - smoothstep(.28,.95,length(c*vec2(1.0,.9))*1.35)*.6; col += (h21(vUv*uRes+fract(uTime)*91.7)-.5)*.04; gl_FragColor = vec4(col,1.0); }`
    });
    composer.addPass(grade); ready = true;
  }

  function resize(w, h) { if (!ready) return; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); const pr = renderer.getPixelRatio(); grade.uniforms.uRes.value.set(w * pr, h * pr); }

  function start(id, canvas, w, h) {
    try {
      if (!ready) init(canvas); if (!SHOTS[id]) return false;
      anims = []; while (dyn.children.length) { const o = dyn.children.pop(); o.traverse && o.traverse(n => { if (n.geometry && !n.userData.keep) n.geometry.dispose(); }); }
      earth.visible = false; curShot = SHOTS[id](); resize(w, h); return true;
    } catch (e) { console.error('3D cutscene failed', e); failed = true; return false; }
  }

  function render(t, total, w, h) {
    if (!ready || !curShot) return; const u = clamp(t / total);
    const night = curShot.night ? curShot.night(u) : 0, storm = curShot.storm ? curShot.storm(u) : 0; setTime(night, storm);
    curShot.update(t, u); const cs = curShot.cam(t, u); camera.position.copy(cs.p); camera.lookAt(cs.l); camera.fov = cs.fov || 42; camera.updateProjectionMatrix();
    sky.position.copy(camera.position); if (earth.visible) earth.position.copy(camera.position).add(earth.userData.base || V(0, 0, 0));
    shipObj.setThrust(0, 0, t, 0);
    dyn.traverse(o => { if (o.isPoints) { o.material.uniforms.uScale.value = renderer.domElement.height * .5 / Math.tan(camera.fov * Math.PI / 360); } });
    grade.uniforms.uTime.value = t; bloom.strength = .42 + .2 * night;
    composer.render();
  }

  window.Cine = { start, render, resize, available: () => !failed && !!window.THREE && !!THREE.EffectComposer };
})();
