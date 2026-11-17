/* Manual save slot. The game ALWAYS starts as a new game; progress only persists when you press "Save game",
   and is only restored when you press "Continue" on the start screen. */
(function () {
  const KEY = 'mars.save';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  // old builds auto-saved under these keys — a new game must never pick them up
  try { localStorage.removeItem('mars.done'); localStorage.removeItem('mars.graphs'); localStorage.removeItem('mars.graphs2'); } catch (e) { }

  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  window.Save = {
    exists: () => !!read(),
    describe() { const s = read(); return s ? `${s.done.length} of ${MISSIONS.length} missions complete · saved ${ago(s.t)}` : ''; },
    write() { const s = { v: 1, t: Date.now(), done: UI.state(), graphs: Editor.getGraphs() }; try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } },
    load() { const s = read(); if (!s) return false; UI.restore(s.done || []); Editor.setGraphs(s.graphs || {}); return true; },
    clear() { try { localStorage.removeItem(KEY); } catch (e) { } }
  };
})();
