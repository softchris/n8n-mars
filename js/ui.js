/* Mission UI: intro modal, active-mission HUD, mission log, progress. */
(function () {
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const total = MISSIONS.length;
  let typeTimer = null, active = null;

  // ---- progress (saved in the browser)
  let done = new Set();
  const saveDone = () => { };                     // progress is kept in memory; the player saves explicitly (see save.js)
  const saveBtn = b => { if (!window.Save) return; const ok = Save.write(); const t = b.textContent; b.textContent = ok ? '✔ SAVED' : '✖ FAILED'; setTimeout(() => { b.textContent = t; }, 1600); };
  const unlocked = i => i === 0 || done.has(MISSIONS[i - 1].id) || done.has(MISSIONS[i].id);

  function esc(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function renderModal(m) {
    const isDone = done.has(m.id);
    $('mission').innerHTML = `
      <div class="m-eyebrow"><span>MISSION ${pad(m.id)} / ${total}</span><span class="dot"></span><span>${m.tag}</span>${isDone ? '<span class="m-done">✔ COMPLETE</span>' : ''}</div>
      <h2>${esc(m.title)}</h2>
      <div class="m-from">INCOMING  ·  MISSION CONTROL, EARTH</div>
      <p class="m-brief" id="m-brief"></p>
      <div class="m-block"><div class="m-label">OBJECTIVE</div><div>${esc(m.objective)}</div></div>
      <div class="m-block"><div class="m-label">BUILD IT IN n8n</div>
        <div class="chips">${m.nodes.map(n => `<span class="chip">${esc(n)}</span>`).join('')}</div>
        <div class="m-api">${esc(m.api)}</div></div>
      <div class="m-foot">
        <span class="m-reward">${esc(m.reward)}</span>
        <span class="m-btns">
          <button class="ghost" id="m-all">ALL ${total} MISSIONS</button>
          <button id="m-accept">${isDone ? 'REOPEN EDITOR' : 'OPEN n8n EDITOR'}</button>
        </span>
      </div>`;
    $('m-accept').onclick = () => accept(m);
    $('m-all').onclick = showList;
    const el = $('m-brief'); let i = 0; clearInterval(typeTimer);
    typeTimer = setInterval(() => {
      i += 2; el.textContent = m.briefing.slice(0, i); SFX.tick(.8);
      if (i >= m.briefing.length) { clearInterval(typeTimer); el.textContent = m.briefing; SFX.bell(.8); }
    }, 22);
  }

  function showIntro() { show(MISSIONS.find(m => !done.has(m.id)) || MISSIONS[0]); }
  function show(m) { renderModal(m); $('hud').classList.remove('on'); $('mission').classList.add('on'); }

  function setHud(m) {
    $('hud').innerHTML = `<span class="pulse"></span><span class="h-id">MISSION ${pad(m.id)}</span><span class="h-t">${esc(m.title)}</span>
      <span class="h-s">${done.has(m.id) ? 'COMPLETE' : 'ACTIVE'}</span><button class="h-b" id="h-open">OPEN EDITOR</button><button class="h-b" id="h-list">MISSIONS</button><button class="h-b" id="h-save">💾 SAVE</button>`;
    $('hud').classList.add('on');
    $('h-open').onclick = () => Editor.open(m); $('h-list').onclick = showList; $('h-save').onclick = e => saveBtn(e.target);
  }

  function accept(m) {
    active = m; clearInterval(typeTimer);
    $('mission').classList.remove('on'); $('list').classList.remove('on');
    setHud(m); Editor.open(m);
  }

  function complete(id) { done.add(id); saveDone(); if (active && active.id === id) setHud(active); }

  function showList() {
    $('list').innerHTML = `
      <div class="l-head"><h3>MISSION LOG  ·  ${done.size} / ${total} COMPLETE</h3><span><button class="ghost" id="l-save">💾 SAVE GAME</button> <button class="ghost" id="l-close">CLOSE</button></span></div>
      <div class="l-grid">${MISSIONS.map((m, i) => {
        const st = done.has(m.id) ? 'done' : unlocked(i) ? 'open' : 'locked';
        return `<div class="card ${st}" data-i="${i}">
          <div class="c-top"><span>${pad(m.id)}</span><span>${st === 'done' ? '✔ COMPLETE' : st === 'open' ? 'AVAILABLE' : 'LOCKED'}</span></div>
          <div class="c-title">${esc(m.title)}</div>
          <div class="c-tag">${m.tag}</div>
          <div class="c-nodes">${m.nodes.slice(0, 3).map(esc).join(' · ')}</div>
        </div>`; }).join('')}</div>`;
    $('list').classList.add('on');
    $('l-close').onclick = () => $('list').classList.remove('on'); $('l-save').onclick = e => saveBtn(e.target);
    $('list').querySelectorAll('.card.open, .card.done').forEach(c => c.onclick = () => { $('list').classList.remove('on'); show(MISSIONS[+c.dataset.i]); });
  }

  function reset() {
    clearInterval(typeTimer); active = null;
    ['mission', 'hud', 'list'].forEach(id => $(id).classList.remove('on'));
    if (window.Editor) Editor.close();
  }

  window.UI = { showIntro, show, reset, complete, saveBtn, state: () => [...done], restore: a => { done = new Set(a); } };
})();
