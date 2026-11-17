/* Typing sound, synced to the text: the typewriter recording (audio/typing.mp3) is cut into individual keystrokes
   (onset times in audio/typing-hits.json, found offline) and ONE real keystroke is played for every character typed.
   Silence between blocks / while the text waits comes for free — no keystrokes, no sound. */
(function () {
  const C = CFG.TYPE_SFX;
  let ctx = null, buf = null, hits = [], muted = false, last = 0, bag = [];
  try { muted = localStorage.getItem('mars.sfxMuted') === '1'; } catch (e) { }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); return ctx;
  }
  function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); }

  // load the recording + keystroke map
  Promise.all([
    fetch(C.src).then(r => r.arrayBuffer()), fetch(C.hits).then(r => r.json())
  ]).then(([ab, h]) => { ensure().decodeAudioData(ab, b => { buf = b; hits = h; }, () => console.warn('typing sound: could not decode ' + C.src)); })
    .catch(() => console.warn('typing sound: could not load ' + C.src + ' / ' + C.hits));

  // a shuffled bag so we hear every keystroke before any repeats
  function nextHit() {
    if (!bag.length) { bag = hits.map((_, i) => i); for (let i = bag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [bag[i], bag[j]] = [bag[j], bag[i]]; } }
    return bag.pop();
  }

  function tick(vol = 1) {
    if (muted || !buf || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime; if (now - last < .026) return; last = now;
    const i = nextHit(), t0 = Math.max(0, hits[i] - .012), gap = (hits[i + 1] || hits[i] + .3) - hits[i];
    const dur = Math.min(.085, Math.max(.05, gap - .01));          // keep each keystroke short and tight
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.playbackRate.value = .97 + Math.random() * .06;
    const v = C.volume * vol * (.85 + Math.random() * .3);
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(v, now + .002); g.gain.setValueAtTime(v, now + dur - .02); g.gain.linearRampToValueAtTime(0, now + dur);
    src.connect(g).connect(ctx.destination); src.start(now, t0, dur + .01);
  }

  function toggleMute() { muted = !muted; try { localStorage.setItem('mars.sfxMuted', muted ? '1' : '0'); } catch (e) { } return muted; }

  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', e => { unlock(); if ((e.key === 'm' || e.key === 'M') && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) toggleMute(); });
  window.SFX = { tick, bell() { }, unlock, toggleMute };
})();
