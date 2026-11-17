/* Space half of the film: flyover (camera under the ship) -> turn -> approach Mars -> atmospheric entry */
(function () {
  const { P } = CFG;
  const R = 2400;                                   // Mars radius (scene units)
  const MZ = 36000;                                 // distance of Mars centre along -Z
  const MARS = new THREE.Vector3(0, 0, -MZ);
  const SUN = new THREE.Vector3(-.55, .45, .7).normalize();

  const GLSL_NOISE = `
    float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float noise(vec3 x){
      vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x), f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x), f.y), f.z);
    }
    float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<6;i++){ s+=a*noise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
  `;

  function makeStars() {
    const n = 9000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), r = U.rng(3);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), d = 150000;
      pos.set([s * Math.cos(a) * d, u * d, s * Math.sin(a) * d], i * 3);
      const b = Math.pow(r(), 3) * .9 + .18, hot = r() < .02 ? 2.6 : 1;
      const tint = r();
      col.set([b * hot * (tint < .3 ? .8 : 1), b * hot * .95, b * hot * (tint > .7 ? 1.15 : .9)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, depthTest: false, depthWrite: false, transparent: true });
    const pts = new THREE.Points(g, m); pts.renderOrder = -10; pts.frustumCulled = false;
    return pts;
  }

  function makeNebula() {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: GLSL_NOISE + `
        varying vec3 vD; uniform float uTime;
        void main(){
          vec3 d = normalize(vD);
          float n = fbm(d*2.4 + 3.0);
          vec3 col = mix(vec3(0.004,0.006,0.016), vec3(0.10,0.035,0.07), smoothstep(.45,.85,n)) * 0.9;
          float band = exp(-pow(dot(d, normalize(vec3(.25,1.0,.35)))*3.2, 2.0));
          float dust = fbm(d*7.0);
          col += band * smoothstep(.3,.8,dust) * vec3(.12,.10,.16) * 0.8;
          col += band * pow(fbm(d*3.0+9.0),2.0) * vec3(.10,.07,.04) * 1.2;
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(200000, 32, 24), m);
    mesh.renderOrder = -20; mesh.frustumCulled = false;
    return mesh;
  }

  function makeMars() {
    const group = new THREE.Group();
    const surface = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 120), new THREE.ShaderMaterial({
      uniforms: { uSun: { value: SUN } },
      vertexShader: `
        varying vec3 vObj; varying vec3 vWN; varying vec3 vWP;
        void main(){
          vObj = normalize(position); vWN = normalize(mat3(modelMatrix)*normal);
          vec4 wp = modelMatrix*vec4(position,1.0); vWP = wp.xyz;
          gl_Position = projectionMatrix*viewMatrix*wp;
        }`,
      fragmentShader: GLSL_NOISE + `
        uniform vec3 uSun; uniform mat4 modelMatrix; varying vec3 vObj; varying vec3 vWN; varying vec3 vWP;
        float height(vec3 p){ return fbm(p*2.2)*0.62 + fbm(p*9.0)*0.38; }
        void main(){
          vec3 p = normalize(vObj);
          float h = height(p);
          float big = fbm(p*1.3 + 4.0);
          vec3 rust = vec3(0.52,0.19,0.075), ochre = vec3(0.72,0.34,0.15), dark = vec3(0.20,0.10,0.07);
          vec3 alb = mix(rust, ochre, smoothstep(.38,.74,h));
          alb = mix(alb, dark, smoothstep(.50,.70,big)*0.85);
          float scar = smoothstep(.035,.0, abs(p.y + .12 + (fbm(p*3.)-.5)*.3)) * smoothstep(.3,.6,fbm(p*5.0));
          alb = mix(alb, dark*.7, scar*.75);
          float cap = smoothstep(.87,.935, abs(p.y) + (fbm(p*7.)-.5)*.12);
          alb = mix(alb, vec3(.92,.9,.88), cap);
          float e = 0.004;
          vec3 g = vec3(height(p+vec3(e,0,0))-h, height(p+vec3(0,e,0))-h, height(p+vec3(0,0,e))-h)/e;
          g -= p*dot(g,p);
          vec3 N = normalize(vWN - 0.07*(mat3(modelMatrix)*g));
          vec3 S = normalize(uSun);
          float ndl = dot(N,S);
          float term = smoothstep(-0.08, 0.22, dot(vWN,S));
          float diff = max(ndl,0.0) * term;
          vec3 V = normalize(cameraPosition - vWP);
          float fres = pow(1.0 - max(dot(vWN,V),0.0), 3.0);
          vec3 col = alb * (diff*1.0 + 0.01);
          col += vec3(1.0,.55,.32) * fres * 0.3 * term;
          gl_FragColor = vec4(col, 1.0);
        }`
    }));
    surface.rotation.z = 1.2;
    group.add(surface);

    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.045, 96, 64), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uSun: { value: SUN } },
      vertexShader: `varying vec3 vWN; varying vec3 vWP;
        void main(){ vWN = normalize(mat3(modelMatrix)*normal); vec4 wp = modelMatrix*vec4(position,1.0); vWP = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform vec3 uSun; varying vec3 vWN; varying vec3 vWP;
        void main(){
          vec3 N = normalize(vWN), V = normalize(cameraPosition - vWP);
          float ndv = max(dot(N,V),0.0);
          float ring = smoothstep(0.0,.28,ndv) * pow(1.0 - smoothstep(.28,.95,ndv), 1.6);
          float sd = dot(N, normalize(uSun));
          float lit = smoothstep(-0.3, 0.55, sd);
          vec3 col = mix(vec3(1.0,.55,.30), vec3(.38,.58,1.0), (1.0 - smoothstep(0.0,.45,sd)) * .85);
          float a = ring * lit;
          gl_FragColor = vec4(col * a * 1.5, a);
        }`
    }));
    group.add(atmo);
    group.position.copy(MARS);
    return { group, surface };
  }

  function createSpace() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 1, 500000);
    camera.rotation.order = 'YXZ';

    const stars = makeStars(), nebula = makeNebula();
    scene.add(nebula, stars);
    const mars = makeMars(); scene.add(mars.group);

    // lights
    scene.add(new THREE.AmbientLight(0x303848, .28));
    const sun = new THREE.DirectionalLight(0xfff0dd, .8); sun.position.copy(SUN).multiplyScalar(1000); scene.add(sun);
    const below = new THREE.DirectionalLight(0x8fa4d8, .5); below.position.set(.1, -1, .25); scene.add(below);
    const marsLight = new THREE.DirectionalLight(0xff8a4a, 0); marsLight.position.set(0, -.15, -1); scene.add(marsLight);

    const ship = createShip();
    scene.add(ship.group);

    // atmospheric entry plasma
    const plasmaMat = U.plumeMaterial(0xffd7a0, 0xff3a10);
    const plasmaGeo = new THREE.CylinderGeometry(SHIP.W * .62, SHIP.W * .05, 1, 40, 1, true).rotateX(Math.PI / 2).translate(0, 0, .5);
    const plasma = new THREE.Mesh(plasmaGeo, plasmaMat);
    plasma.position.set(0, SHIP.CY, -SHIP.L / 2 - 70); plasma.scale.set(1, .6, 1300); ship.group.add(plasma);
    const noseGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: U.glowTexture(128), color: new THREE.Color(1, .45, .15), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    noseGlow.position.set(0, SHIP.CY, -SHIP.L / 2 - 70); ship.group.add(noseGlow);

    // ---- ship trajectory (pure function of u = t/DURATION)
    const S0 = new THREE.Vector3(0, 200, -1100);
    const E = new THREE.Vector3(0, 1.25 * R, -MZ + .12 * R);
    const entryR = [P.entry[0], P.entry[1]];
    const sp1 = u => { const s = U.clamp(u / P.approach[0]); return U.lerp(840, -1100, .75 * s + .25 * U.smooth(0, 1, s)); };
    function shipPos(u, out) {
      if (u <= P.approach[0]) return out.set(0, 200, sp1(u));
      const p = U.clamp((u - P.approach[0]) / (P.entry[1] - P.approach[0]));
      const f = U.smoother(0, 1, p);
      out.lerpVectors(S0, E, f);
      out.y -= 20 * U.smooth(.55, 1, p) * U.smooth(0, 1, p);   // dip into the atmosphere
      return out;
    }

    const kf = [   // camera offsets relative to the ship
      { u: P.approach[0], o: null },                         // filled at runtime = start from origin
      { u: .56, o: new THREE.Vector3(-420, 190, 760) },
      { u: .72, o: new THREE.Vector3(-820, 460, 150) },
      { u: P.entry[1], o: new THREE.Vector3(-950, 330, 950) }
    ];

    const a = new THREE.Vector3(), b = new THREE.Vector3(), cam = new THREE.Vector3(), tgt = new THREE.Vector3();
    const tmpO = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qs = new THREE.Quaternion();
    const m4 = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(0, 0, -1);
    const eul = new THREE.Euler(0, 0, 0, 'YXZ');

    function update(t, u, aspect) {
      camera.aspect = aspect;
      shipPos(u, a); shipPos(u + .002, b);
      const entryP = U.range(entryR, u);

      // --- ship pose
      const d = b.clone().sub(a).normalize();
      ship.group.position.copy(a);
      qs.setFromUnitVectors(fwd, d);
      eul.set(-.33 * U.smooth(0, 1, entryP) , 0, .05 * Math.sin(u * 40) * (1 - entryP) , 'XYZ');
      ship.group.quaternion.copy(qs).multiply(new THREE.Quaternion().setFromEuler(eul));
      if (u < P.approach[0]) ship.group.rotation.z = .012 * Math.sin(t * .3);

      // engines
      const rear = u < P.flyover[0] ? .2 : U.lerp(.55, 1.0, U.smooth(P.approach[0], .7, u)) * (1 - .25 * entryP);
      ship.setThrust(rear, 0, t, .5 + rear * .8);
      const plasmaPow = U.smooth(0, .35, entryP) * 1.6;
      plasmaMat.uniforms.uTime.value = t; plasmaMat.uniforms.uPower.value = plasmaPow; plasma.visible = plasmaPow > .01;
      noseGlow.material.opacity = U.clamp(plasmaPow * .9); noseGlow.scale.setScalar(300 + 900 * plasmaPow);

      // --- camera position
      const sh = Math.sin, sh2 = (x) => Math.sin(x) * Math.sin(x * 2.3 + 1);
      if (u <= P.approach[0]) {
        cam.set(6 * sh(t * .21), 4 * sh(t * .17), 0);
      } else {
        // keyframed offsets from the ship, starting exactly where the static camera was
        const o0 = tmpO.set(0, 0, 0).sub(shipPos(P.approach[0], new THREE.Vector3()));
        kf[0].o = o0.clone();
        let i = 0; while (i < kf.length - 2 && u > kf[i + 1].u) i++;
        const k = U.smoother(kf[i].u, kf[i + 1].u, u);
        cam.copy(kf[i].o).lerp(kf[i + 1].o, k).add(a);
      }
      const shake = (.0012 + .010 * entryP) * (u > P.approach[0] ? 1 : .4);
      cam.x += shake * 400 * sh2(t * 9.1); cam.y += shake * 400 * sh2(t * 7.3 + 2);
      camera.position.copy(cam);

      // --- camera orientation: blend 'looking up at the hull' -> 'looking at the ship'
      const pitch = U.lerp(.98, .80, U.smooth(0, P.turn[0], u));
      eul.set(pitch, .06 * sh(t * .13), .02 * sh(t * .11), 'YXZ');
      q1.setFromEuler(eul);
      const kLook = .30 * U.smooth(.5, .8, u) * (1 - entryP);
      tgt.copy(a).lerp(MARS, kLook); tgt.y += 40;
      m4.lookAt(cam, tgt, up); q2.setFromRotationMatrix(m4);
      const w = U.smoother(P.turn[0], P.turn[1], u);
      camera.quaternion.copy(q1).slerp(q2, w);
      camera.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(fwd, shake * 6 * sh2(t * 11)));

      camera.fov = U.lerp(55, 38, U.smooth(.5, .86, u));
      const near = u < P.approach[0] ? 1 : 6;
      if (camera.near !== near) camera.near = near;
      camera.updateProjectionMatrix();

      // --- backdrop follows the camera
      stars.position.copy(cam); nebula.position.copy(cam);
      mars.surface.rotation.y = u * .35;
      marsLight.intensity = .1 + .8 * U.smooth(.42, .8, u);
      below.intensity = .5 * (1 - .75 * U.smooth(.45, .75, u));
    }

    return { scene, camera, update, shipPos, MARS, R };
  }

  window.createSpace = createSpace;
})();
