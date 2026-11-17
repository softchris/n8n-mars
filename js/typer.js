/* Typewriter: stateless, driven purely by the film clock so scrubbing / audio sync stay exact. */
(function () {
  const CPS = 30;                      // typing speed (characters / second)
  const elText = document.getElementById('text'), elHead = document.getElementById('head'),
        elBody = document.getElementById('body'), elTitle = document.getElementById('title');
  let last = '', lastTitle = '', prevTotal = 0, belled = -1;

  function updateTyper(t, dur) {
    const u = t / dur;
    const blk = CFG.TEXT.find(b => u >= b.at && u < b.end);
    if (!blk) { elText.classList.remove('on'); last = ''; prevTotal = 0; }
    else {
      const age = t - blk.at * dur, fade = (blk.end - u) * dur;
      const cps = blk.fast ? 22 : CPS;
      const headN = Math.min(blk.head.length, Math.floor(age * 70));
      const bodyN = Math.min(blk.body.length, Math.max(0, Math.floor((age - blk.head.length / 70 - .25) * cps)));
      const key = blk.at + ':' + headN + ':' + bodyN;
      if (key !== last) {
        last = key;
        if (headN + bodyN > prevTotal) {
          const ch = (blk.head + ' ' + blk.body)[Math.min(headN + bodyN, blk.head.length + 1 + blk.body.length) - 1];
          if (bodyN > 0 ? bodyN < blk.body.length - 1 : (headN % 3) === 0) SFX.tick(bodyN > 0 ? 1 : .7);   // stop a hair before the end
        }
        if (bodyN >= blk.body.length && belled !== blk.at) { belled = blk.at; SFX.bell(); }
        prevTotal = headN + bodyN;
        elHead.textContent = blk.head.slice(0, headN);
        elBody.textContent = blk.body.slice(0, bodyN);
      }
      elText.classList.toggle('on', fade > .9);
    }
    // final title
    const T = CFG.TITLE;
    if (u >= T.at) {
      const a = (u - T.at) * dur, n = Math.min(T.text.length, Math.floor(a * 9));
      const s = T.text.slice(0, n);
      if (s !== lastTitle) { if (s.length > lastTitle.length) SFX.tick(1.4); elTitle.textContent = s; lastTitle = s; }
      elTitle.style.opacity = String(U.smooth(0, 1.2, a) * (1 - U.smooth(dur + CFG.TITLE_HOLD, dur + CFG.TITLE_HOLD + 1.5, t)));
    } else if (lastTitle) { elTitle.textContent = ''; elTitle.style.opacity = 0; lastTitle = ''; }
  }
  window.updateTyper = updateTyper;
})();
