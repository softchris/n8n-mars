/* Surface half: the ship descends on ventral thrusters and lands on Mars. */
(function () {
  const { P } = CFG;
  const SITE = new THREE.Vector3(0, 0, -1900);
  const SUNDIR = new THREE.Vector3(-.6, .38, .55).normalize();
  const FOGC = 0xb9805a;

  function terrainH(x, z) {
    const dx = x - SITE.x, dz = z - SITE.z, d = Math.sqrt(dx * dx + dz * dz);
    const flat = U.smooth(1100, 3000, d);
    const big = (U.fbm2(x * .00045, z * .00045, 5) - .42) * 900 * (1 + d / 9000);
    const mid = (U.fbm2(x * .0035, z * .0035, 4) - .5) * 90;
    const ripple = Math.sin(x * .02 + U.fbm2(x * .004, z * .004) * 6) * 6;
    return (big + mid + ripple) * flat;
  }

  function makeTerrain() {
    const SIZE = 60000, SEG = 260;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = terrainH(x, z);
      pos.setY(i, h);
      const n = U.fbm2(x * .002, z * .002, 4), n2 = U.noise2(x * .03, z * .03);
      c.setRGB(.34 + n * .16 + n2 * .05, .15 + n * .08 + n2 * .025, .075 + n * .045);
      const dark = U.smooth(.5, .7, U.fbm2(x * .0008 + 9, z * .0008, 3));
      c.multiplyScalar(1 - dark * .45);
      c.multiplyScalar(.85 + U.clamp(h / 600, -.3, .5));
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  }

  function makeRocks() {
    const N = 1800, r = U.rng(77);
    const m = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x4a2c20, roughness: 1, flatShading: true }), N);
    const d = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const ang = r() * Math.PI * 2, rad = 500 + Math.pow(r(), .7) * 14000;
      const x = SITE.x + Math.cos(ang) * rad, z = SITE.z + Math.sin(ang) * rad;
      const s = 2 + Math.pow(r(), 3) * 40;
      d.position.set(x, terrainH(x, z) + s * .25, z);
      d.scale.set(s * (.8 + r() * .8), s * (.5 + r() * .5), s * (.8 + r() * .8));
      d.rotation.set(r() * 3, r() * 6, r() * 3); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
      const v = .6 + r() * .6; col.setRGB(v, v * .9, v * .85); m.setColorAt(i, col);
    }
    return m;
  }

  function makeSky() {
    return new THREE.Mesh(new THREE.SphereGeometry(45000, 32, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSun: { value: SUNDIR } },
      vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uSun; varying vec3 vD;
        void main(){
          vec3 d = normalize(vD);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 hor = vec3(0.80,0.50,0.32), mid = vec3(0.42,0.30,0.28), top = vec3(0.07,0.09,0.17);
          vec3 c = mix(hor, mid, smoothstep(0.0,0.22,h));
          c = mix(c, top, smoothstep(0.15,0.8,h));
          float s = max(dot(d, normalize(uSun)), 0.0);
          c += vec3(1.0,.62,.35) * pow(s, 6.0) * 0.45 + vec3(.5,.6,1.0) * pow(s, 60.0) * .5;
          c = mix(c, hor*0.9, smoothstep(0.0,-0.25,d.y));
          gl_FragColor = vec4(c, 1.0);
        }`
    }));
  }

  function makeDust(N) {
    const r = U.rng(2024), geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uMap: { value: U.dustTexture() }, uScale: { value: 800 }, uSun: { value: 1 } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
        void main(){
          vA = aAlpha;
          vec4 mv = modelViewMatrix*vec4(position,1.0);
          gl_PointSize = min(aSize*uScale/max(-mv.z,1.0), 900.0);
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; varying float vA;
        void main(){
          float t = texture2D(uMap, gl_PointCoord).a;
          vec3 col = vec3(0.62,0.40,0.26) * 1.25;
          gl_FragColor = vec4(col, t * vA);
        }`
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
    const P_ = [];
    for (let i = 0; i < N; i++) P_.push({
      ang: r() * Math.PI * 2, spd: .5 + r() * .5, lift: r(), sz: .6 + r() * .8, b: Math.pow(r(), .75), r0: r(), jit: r()
    });
    return { pts, mat, P_, pos, size, alpha, geo };
  }

  function createSurface() {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(FOGC, .000018);
    const camera = new THREE.PerspectiveCamera(48, 16 / 9, 2, 120000);

    const sky = makeSky(); sky.renderOrder = -10; scene.add(sky);
    scene.add(makeTerrain(), makeRocks());

    scene.add(new THREE.HemisphereLight(0xd8a880, 0x4a2a1c, .45));
    const sun = new THREE.DirectionalLight(0xffe0c0, 1.5); sun.position.copy(SUNDIR).multiplyScalar(1000); scene.add(sun);

    const ship = createShip({ landing: true });
    const rig = new THREE.Group(); rig.add(ship.group); rig.position.copy(SITE); rig.rotation.y = .62; scene.add(rig);
    const thrustLight = new THREE.PointLight(0xff9a55, 0, 3200, 1.3); thrustLight.position.set(0, -90, 100); ship.group.add(thrustLight);

    const dust = makeDust(1400); scene.add(dust.pts);

    // landing curve ---------------------------------------------------------
    const t0 = P.flash[0] + (P.flash[1] - P.flash[0]) * .45;       // descent begins under the flash
    const td = P.touchdown, ALT0 = 1700, REST = ship.rest;
    const altitude = u => REST + ALT0 * Math.pow(1 - U.clamp((u - t0) / (td - t0)), 2.5);
    const uDust0 = (() => { let lo = t0, hi = td; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; altitude(m) > 1000 ? lo = m : hi = m; } return lo; })();

    const cam = new THREE.Vector3(), tgt = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4();

    function update(t, u, aspect, dur, viewH) {
      camera.aspect = aspect;
      const alt = altitude(u);
      const landedK = U.smooth(td - .004, td + .004, u);
      ship.group.position.y = alt;
      const vent = (1 - U.smooth(td, td + .014, u)) * U.smooth(t0 - .02, t0 + .004, u);
      ship.setThrust(.06 * (1 - landedK), vent, t, 0);
      thrustLight.intensity = vent * 28 * (.55 + .45 * Math.sin(t * 31) * Math.sin(t * 17.3));
      ship.group.rotation.z = .02 * Math.sin(t * .8) * (1 - landedK); ship.group.rotation.x = .015 * Math.sin(t * .6 + 1) * (1 - landedK);

      // camera: low, wide, pushing in; tilts down following the ship
      const s = U.smooth(t0, 1, u);
      cam.set(-1250 + 520 * s, 48 + 22 * s, 320 - 240 * s);
      tgt.set(0, U.lerp(alt * .8, 140, landedK) + 60, SITE.z);
      const rumble = (1 - alt / ALT0) * 1.6 * vent + 9 * Math.exp(-Math.max(0, u - td) * dur * 1.6) * (u >= td ? 1 : 0);
      cam.x += 14 * Math.sin(t * .13); cam.z += 10 * Math.sin(t * .09 + 1);   // slow idle drift once landed
      cam.x += rumble * Math.sin(t * 43) ; cam.y += rumble * Math.sin(t * 51 + 1.3);
      camera.position.copy(cam);
      // after the film ends, slide the framing so the landed ship sits on the left and the mission panel on the right
      const pan = U.smooth(dur, dur + 2.8, t) * 720;
      tgt.x += .94 * pan; tgt.z += .35 * pan;
      m4.lookAt(cam, tgt, up); camera.quaternion.setFromRotationMatrix(m4);
      camera.fov = U.lerp(54, 42, s);
      camera.updateProjectionMatrix();
      sky.position.copy(cam);

      // dust ---------------------------------------------------------------
      dust.mat.uniforms.uScale.value = viewH * .5 / Math.tan(camera.fov * Math.PI / 360);
      const { P_, pos, size, alpha } = dust;
      for (let i = 0; i < P_.length; i++) {
        const p = P_[i], ub = uDust0 + (td + .02 - uDust0) * p.b, age = (u - ub) * dur;
        if (age < 0 || u < uDust0) { alpha[i] = 0; continue; }
        const close = 1 - U.clamp((altitude(ub) - REST) / 900);          // how low the ship was when this puff spawned
        const spd = (260 + 1500 * Math.pow(close, .8)) * (.5 + p.spd);
        const rad = p.r0 * 260 + spd * (1 - Math.exp(-age * .45)) / .45;
        const ang = p.ang + age * .03;
        const y = 8 + p.jit * 30 + (40 + 160 * p.lift) * close * (1 - Math.exp(-age * .35)) / .35 * .35;
        pos[i * 3] = SITE.x + Math.cos(ang) * rad; pos[i * 3 + 1] = y; pos[i * 3 + 2] = SITE.z + Math.sin(ang) * rad;
        size[i] = (220 + 420 * close) * p.sz * (1 + age * .12);
        alpha[i] = U.smooth(0, .5, age) * (1 - U.smooth(3.5, 11, age)) * (.025 + .15 * close);
      }
      dust.geo.attributes.position.needsUpdate = true; dust.geo.attributes.aSize.needsUpdate = true; dust.geo.attributes.aAlpha.needsUpdate = true;
    }

    return { scene, camera, update };
  }

  window.createSurface = createSurface;
})();
