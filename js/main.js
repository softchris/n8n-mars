/* Orchestrator: renderer, post-processing, film clock (audio is the master clock), start screen. */
(function () {
  const qs = new URLSearchParams(location.search);
  const DUR = parseFloat(qs.get('d')) || CFG.DURATION;
  const DEBUG = qs.has('debug'), FREEZE = qs.has('freeze'), T_START = parseFloat(qs.get('t')) || 0;
  const { P } = CFG;

  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000);

  const space = createSpace();
  const surface = createSurface();

  // ---- post: render -> bloom -> grade (tone map, gamma, vignette, grain, fade/flash)
  const composer = new THREE.EffectComposer(renderer);
  const rp = new THREE.RenderPass(space.scene, space.camera); composer.addPass(rp);
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), .8, .65, .72); composer.addPass(bloom);
  const grade = new THREE.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uFade: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uExp: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uFade, uFlash, uTime, uExp; uniform vec2 uRes; varying vec2 vUv;
      float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
      void main(){
        vec2 c = vUv - .5;
        float ca = .0022 * dot(c,c) * 4.0;
        vec3 col = vec3(texture2D(tDiffuse, vUv + c*ca*2.0).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c*ca*2.0).b);
        col = aces(col * uExp);
        col = pow(col, vec3(1.0/2.2));
        col *= 1.0 - smoothstep(.28,.95,length(c*vec2(1.0,.9))*1.35) * .65;
        col += (h21(vUv*uRes + fract(uTime)*91.7) - .5) * .045;
        col = mix(col, vec3(1.0,.86,.66), uFlash);
        gl_FragColor = vec4(col * uFade, 1.0);
      }`
  });
  composer.addPass(grade);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight, pr = renderer.getPixelRatio();
    renderer.setSize(w, h, false); composer.setSize(w, h);
    grade.uniforms.uRes.value.set(w * pr, h * pr);
  }
  window.addEventListener('resize', resize); resize();

  // ---- audio = master clock
  const audio = document.getElementById('music');
  let audioOK = false;
  if (!FREEZE) {
    audio.src = CFG.AUDIO_SRC;
    audio.addEventListener('canplay', () => { audioOK = true; });
    audio.addEventListener('ended', () => { wallStart = now() - audio.duration; });
    audio.addEventListener('error', () => { audioOK = false; console.warn('No audio at ' + CFG.AUDIO_SRC + ' — running on the internal clock.'); });
  }

  let playing = false, wallStart = 0, tFrozen = T_START;
  const now = () => performance.now() / 1000;
  function filmTime() {
    if (FREEZE) return tFrozen;
    if (!playing) return 0;
    if (audioOK && !audio.paused) return audio.currentTime;
    return now() - wallStart;
  }
  function seek(t) {
    t = Math.max(0, t);
    if (FREEZE) { tFrozen = t; return; }
    wallStart = now() - t;
    if (audioOK) try { audio.currentTime = t; } catch (e) { }
  }

  // ---- frame
  const dbg = document.getElementById('debug'); if (DEBUG) dbg.style.display = 'block';
  let introShown = false;
  function frame() {
    requestAnimationFrame(frame);
    if (window.EDITING) return;                 // editor open: pause the 3D scene
    const t = filmTime(), u = t / DUR;      // u keeps growing past 1: the world stays alive after landing
    const aspect = window.innerWidth / window.innerHeight, vh = window.innerHeight * renderer.getPixelRatio();
    const mid = (P.flash[0] + P.flash[1]) / 2;

    const inSpace = u < mid;
    if (inSpace) space.update(t, u, aspect); else surface.update(t, u, aspect, DUR, vh);
    rp.scene = inSpace ? space.scene : surface.scene; rp.camera = inSpace ? space.camera : surface.camera;

    // bloom + exposure per phase
    const entryP = U.range(P.entry, u);
    let pulse = 0; CFG.HITS.forEach(h => { const x = (t - h) / .7; pulse += x < 0 ? Math.exp(-x * x * 6) * .5 : Math.exp(-x * 1.6); });
    pulse = Math.min(pulse, 1.2);
    bloom.strength = (U.lerp(.6, 1.1, entryP) + .45 * pulse) * (inSpace ? 1 : .55);
    bloom.threshold = inSpace ? .72 : .85;
    grade.uniforms.uExp.value = (inSpace ? 1.0 : 1.05) + .22 * pulse;

    // fades & flash
    const fadeIn = U.smooth(P.fadeIn[0], P.fadeIn[1], u);
    const fadeOut = 1;
    const flash = U.smoother(P.flash[0], mid, u) - U.smoother(mid, P.flash[1], u);
    grade.uniforms.uFade.value = fadeIn * fadeOut;
    grade.uniforms.uFlash.value = U.clamp(flash * 1.15);
    grade.uniforms.uTime.value = t + (performance.now() % 1000) / 1000;
    if (audioOK && !audio.paused) audio.volume = U.clamp(fadeOut);

    updateTyper(t, DUR);
    if (!introShown && t >= DUR + CFG.MODAL_DELAY) { introShown = true; UI.showIntro(); }
    if (DEBUG) dbg.textContent = `t = ${t.toFixed(1)}s / ${DUR}s\nu = ${u.toFixed(3)}\nscene = ${inSpace ? 'space' : 'surface'}\naudio = ${audioOK ? 'yes' : 'no (internal clock)'}`;
    composer.render();
  }

  // ---- start
  function begin(skip) {
    const st = document.getElementById('start'); st.classList.add('hide'); if (FREEZE) st.style.display = 'none';
    const t0 = skip ? DUR + 6 : T_START;            // skip = land straight on Mars, mission 1 up, no music
    playing = true; wallStart = now() - t0;
    if (audioOK && !skip) { audio.currentTime = T_START; audio.play().catch(() => { audioOK = false; }); }
    if (document.fullscreenEnabled && !document.fullscreenElement && !DEBUG) document.documentElement.requestFullscreen().catch(() => { });
  }
  document.getElementById('go').addEventListener('click', () => begin(false));
  document.getElementById('skip').addEventListener('click', () => begin(true));
  document.getElementById('cont').addEventListener('click', () => { if (Save.load()) begin(true); });          // only a deliberate Continue loads a save

  window.addEventListener('keydown', e => {
    const tag = (document.activeElement || {}).tagName || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || document.activeElement.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;   // typing in a field: hands off
    if (window.EDITING || document.getElementById('cutscene').classList.contains('on')) return;                                         // the editor / cutscene own the keyboard
    if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
    if (e.key === 'r' || e.key === 'R') { UI.reset(); introShown = false; seek(0); if (audioOK) audio.play().catch(() => { }); }
    if (DEBUG || FREEZE) {
      if (e.key === 'ArrowRight') seek(filmTime() + 5);
      if (e.key === 'ArrowLeft') seek(filmTime() - 5);
      if (e.key === ' ') { if (audioOK) audio.paused ? audio.play() : audio.pause(); }
    }
  });

  // build is synchronous and heavy — let the loading label paint first
  const go = document.getElementById('go'), skipBtn = document.getElementById('skip'), contBtn = document.getElementById('cont'); go.disabled = skipBtn.disabled = true;
  if (Save.exists()) {                                  // a save exists: offer it, but never load it automatically
    contBtn.hidden = false; const info = document.getElementById('saveinfo');
    info.innerHTML = Save.describe() + ' · <a href="#" id="delsave">delete save</a>';
    document.getElementById('delsave').onclick = e => { e.preventDefault(); if (confirm('Delete your saved game?')) { Save.clear(); contBtn.hidden = true; info.textContent = ''; } };
  }
  requestAnimationFrame(() => setTimeout(() => {
    document.getElementById('loading').textContent = '';
    go.disabled = skipBtn.disabled = false;
    requestAnimationFrame(frame);
    if (FREEZE || T_START) { begin(false); }
    const cu = qs.get('cut'); if (cu) { document.getElementById('start').style.display = 'none'; Cutscene.play(MISSIONS[+cu - 1], null, { at: parseFloat(qs.get('ct')) || 5 }); }
    const gu = qs.get('guide'); if (gu) { document.getElementById('start').style.display = 'none'; setTimeout(() => { Editor.demoPartial(MISSIONS[+gu - 1], qs.get('k') == null ? undefined : +qs.get('k')); if (qs.get('break')) { const [i, k, v] = qs.get('break').split(':'); Editor.breakNode(+i, k, v); }
      if (qs.get('step')) setTimeout(() => Editor.addStep(+qs.get('step')), 400);
      if (qs.get('edge')) { const [a, o, b] = qs.get('edge').split(':').map(Number); Editor.addEdge(a, o, b); }
      if (qs.has('wirefix')) setTimeout(() => { const b = document.querySelector('[data-wirefix]'); if (b) b.click(); }, +qs.get('wirefix'));
      if (qs.has('fix')) setTimeout(() => Editor.fixNode(Editor.ids()[+qs.get('fix')]), +(qs.get('ft') || 7000));
      if (qs.has('run')) setTimeout(() => document.getElementById('ed-run').click(), 400);
      if (qs.has('rerun')) setTimeout(() => document.getElementById('ed-run').click(), +qs.get('rerun')); if (qs.has('drawer')) setTimeout(() => Editor.openDrawer(Editor.ids()[+qs.get('drawer')]), +(qs.get('dt') || 9000)); }, 200); }
    const sv = qs.get('solve'); if (sv) { document.getElementById('start').style.display = 'none'; setTimeout(() => Editor.autoSolve(MISSIONS[+sv - 1]).then(() => { if (qs.has('keep')) { const b = document.getElementById('d-stay'); if (b) b.click(); } }), 200); }
  }, 30));
})();
