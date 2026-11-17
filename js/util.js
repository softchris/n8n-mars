/* Small helpers shared by everything */
(function () {
  const U = {};

  U.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = (a, b, x) => { const t = U.clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  U.smoother = (a, b, x) => { const t = U.clamp((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
  U.range = (r, x) => U.clamp((x - r[0]) / (r[1] - r[0]));   // 0..1 progress inside [a,b]
  U.easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  U.easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  U.easeInCubic = t => t * t * t;

  // deterministic RNG so every run (and every scrub position) looks the same
  U.rng = function (seed) {
    let s = seed >>> 0;
    return function () {
      s += 0x6D2B79F5;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // --- 2D value noise (CPU) used for the Mars terrain
  const hash2 = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  U.noise2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  U.fbm2 = (x, y, oct = 5) => {
    let s = 0, a = .5;
    for (let i = 0; i < oct; i++) { s += a * U.noise2(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; a *= .5; }
    return s;
  };

  // --- Textures
  U.glowTexture = function (size = 128, stops) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    (stops || [[0, 'rgba(255,255,255,1)'], [.15, 'rgba(255,255,255,.6)'], [.4, 'rgba(255,255,255,.15)'], [1, 'rgba(255,255,255,0)']])
      .forEach(s => gr.addColorStop(s[0], s[1]));
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  };

  U.dustTexture = function () {
    const size = 128;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const r = U.rng(7);
    g.clearRect(0, 0, size, size);
    for (let i = 0; i < 26; i++) {           // lumpy cloud = several soft blobs
      const x = size / 2 + (r() - .5) * size * .4, y = size / 2 + (r() - .5) * size * .4, rad = size * (.14 + r() * .2);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, size, size);
    }
    return new THREE.CanvasTexture(c);
  };

  // --- Additive engine plume (shader): bright at nozzle, fades along its length
  U.plumeMaterial = function (colorA, colorB) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 }, uPower: { value: 1 },
        uA: { value: new THREE.Color(colorA) }, uB: { value: new THREE.Color(colorB) }
      },
      vertexShader: `
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime; uniform float uPower; uniform vec3 uA; uniform vec3 uB;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          float along = vUv.y;                                  // 0 nozzle -> 1 tip
          float fres = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
          float flick = 0.85 + 0.15 * sin(uTime*37.0 + along*18.0) * sin(uTime*23.0 + vUv.x*12.0);
          float core = pow(1.0 - along, 2.2);
          vec3 col = mix(uB, uA, pow(1.0 - along, 1.6));
          float a = fres * core * flick * uPower;
          gl_FragColor = vec4(col * a * 2.6, a);
        }`
    });
  };

  window.U = U;
})();
