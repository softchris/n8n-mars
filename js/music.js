/* A synthesized cinematic score engine (no audio files).
   Score.start(spec, seconds) plays one piece; Score.forMission(id) returns a distinct piece for each of the 15 missions
   (own key, tempo, chords, instrument colour, rhythm and lead melody). Mission 15 is the finale with a rising C–G–C brass fanfare. */
(function () {
  let ctx = null, master = null, verb = null, wet = null, live = [];
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  // ------------------------------------------------------------------ the 15 pieces
  // chords: midi note lists, one per bar (cycles).  arp: {pat, oct, wave, gain, rate(beats), len}.  lead: [bar, beat, midi, lenBeats]
  const SCORES = {
    1: { name: 'Signal',      bpm: 76, padWave: 'sawtooth', padGain: .018, cut: [500, 1800],
         chords: [[50, 57, 62, 66], [49, 57, 61, 64], [47, 54, 59, 62], [43, 50, 55, 59]],
         arp: { pat: [0, 2, 1, 3], oct: 36, wave: 'sine', gain: .05, rate: 1, len: .5 },
         lead: { wave: 'sine', gain: .075, vib: 1, notes: [[0, 1, 74, 2], [1, 0, 81, 2], [1, 2, 78, 2], [2, 0, 79, 3], [3, 0, 78, 1], [3, 1, 76, 1], [3, 2, 74, 2], [4, 0, 86, 4]] }, wet: .5 },
    2: { name: 'Departure',   bpm: 100, padWave: 'triangle', padGain: .03, cut: [700, 2200],
         chords: [[55, 62, 67, 71], [50, 57, 62, 66], [52, 59, 64, 67], [48, 55, 60, 64]], tick: .05,
         arp: { pat: [0, 1, 2, 1], oct: 24, wave: 'triangle', gain: .06, rate: .5, len: .16 },
         lead: { wave: 'triangle', gain: .06, notes: [[0, 0, 74, 1], [0, 1, 79, 1], [0, 2, 83, 2], [1, 0, 81, 1], [1, 1, 78, 1], [1, 2, 74, 2], [2, 0, 76, 1], [2, 1, 79, 1], [2, 2, 83, 2], [3, 0, 84, 4]] }, wet: .3 },
    3: { name: 'Discovery',   bpm: 66, padWave: 'sine', padGain: .05, cut: [900, 2600],
         chords: [[45, 52, 57, 64], [41, 48, 53, 60], [48, 55, 60, 67], [43, 50, 55, 62]],
         arp: { pat: [0, 3, 2], oct: 36, wave: 'sine', gain: .04, rate: 1.5, len: .9 },
         lead: { wave: 'sine', gain: .08, vib: 1, notes: [[0, 0, 76, 4], [1, 0, 77, 3], [2, 0, 79, 2], [2, 2, 84, 2], [3, 0, 83, 4], [4, 0, 88, 4]] }, riser: 1, wet: .6 },
    4: { name: 'Warm Light',  bpm: 84, padWave: 'sawtooth', padGain: .02, cut: [500, 2000],
         chords: [[52, 59, 64, 68], [47, 54, 59, 63], [49, 56, 61, 64], [45, 52, 57, 61]],
         arp: { pat: [0, 1, 2, 3, 2, 1], oct: 24, wave: 'triangle', gain: .05, rate: .5, len: .3 },
         lead: { wave: 'triangle', gain: .06, vib: 1, notes: [[0, 0, 80, 2], [0, 2, 76, 2], [1, 0, 78, 2], [1, 2, 75, 2], [2, 0, 76, 2], [2, 2, 73, 2], [3, 0, 80, 4]] }, wet: .4 },
    5: { name: 'Front',       bpm: 92, padWave: 'sawtooth', padGain: .022, cut: [260, 900],
         chords: [[38, 45, 50, 53], [34, 41, 46, 50], [31, 38, 43, 46], [33, 40, 45, 49]], pulse: .15, boom: 1, wind: .09,
         lead: { wave: 'sawtooth', gain: .03, notes: [[1, 0, 62, 4], [2, 0, 61, 4], [3, 0, 58, 2], [3, 2, 57, 2]] }, wet: .45 },
    6: { name: 'Ice',         bpm: 70, padWave: 'sine', padGain: .045, cut: [1200, 3200],
         chords: [[54, 61, 66, 69], [50, 57, 62, 66], [57, 64, 69, 73], [52, 59, 64, 68]],
         arp: { pat: [3, 2, 3, 1, 2, 0], oct: 36, wave: 'sine', gain: .045, rate: .5, len: .7 },
         lead: { wave: 'triangle', gain: .045, notes: [[0, 2, 90, 2], [1, 2, 88, 2], [2, 2, 93, 2], [3, 2, 92, 2]] }, wet: .75 },
    7: { name: 'Breath',      bpm: 56, padWave: 'sine', padGain: .06, cut: [1500, 1500], bassGain: .14,
         chords: [[48, 55, 60, 64], [43, 50, 55, 59], [45, 52, 57, 60], [41, 48, 53, 57]],
         lead: { wave: 'sine', gain: .07, vib: 1, notes: [[0, 0, 72, 4], [1, 0, 71, 4], [2, 0, 69, 4], [3, 0, 67, 2], [3, 2, 72, 2], [4, 0, 76, 4]] }, wet: .6 },
    8: { name: 'Growth',      bpm: 72, padWave: 'triangle', padGain: .035, cut: [800, 2400],
         chords: [[53, 60, 65, 69], [48, 55, 60, 64], [50, 57, 62, 65], [46, 53, 58, 62]],
         arp: { pat: [0, 2, 1, 3, 2, 1, 0, 2], oct: 24, wave: 'triangle', gain: .055, rate: .5, len: .12 },
         lead: { wave: 'sine', gain: .07, vib: 1, notes: [[0, 0, 77, 1], [0, 1, 81, 1], [0, 2, 84, 2], [1, 0, 79, 1], [1, 1, 83, 1], [1, 2, 86, 2], [2, 0, 81, 2], [2, 2, 77, 2], [3, 0, 79, 4]] }, wet: .4 },
    9: { name: 'Home',        bpm: 64, padWave: 'sawtooth', padGain: .018, cut: [450, 1700],
         chords: [[45, 52, 57, 61], [44, 51, 56, 59], [42, 49, 54, 57], [38, 45, 50, 54]],
         lead: { wave: 'sawtooth', gain: .03, vib: 1, notes: [[0, 0, 76, 3], [0, 3, 78, 1], [1, 0, 80, 4], [2, 0, 81, 3], [2, 3, 80, 1], [3, 0, 78, 2], [3, 2, 76, 2], [4, 0, 76, 4]] }, wet: .55 },
    10: { name: 'Clues',      bpm: 108, padWave: 'triangle', padGain: .02, cut: [500, 1400], bassPluck: 1,
         chords: [[48, 55, 58, 63], [44, 51, 55, 60], [51, 58, 62, 67], [46, 53, 58, 62]], tick: .04,
         arp: { pat: [0, 2, 1, 2], oct: 24, wave: 'square', gain: .028, rate: .5, len: .08 },
         lead: { wave: 'triangle', gain: .05, notes: [[0, 0, 72, .5], [0, 1, 75, .5], [0, 2, 79, 1], [1, 0, 77, .5], [1, 1, 75, .5], [1, 2, 72, 1], [2, 0, 74, .5], [2, 1, 77, .5], [2, 2, 82, 1.5], [3, 0, 79, 3]] }, wet: .3 },
    11: { name: 'Soar',       bpm: 96, padWave: 'sawtooth', padGain: .02, cut: [600, 2600],
         chords: [[51, 58, 63, 67], [46, 53, 58, 62], [48, 55, 60, 63], [44, 51, 56, 60]],
         arp: { pat: [0, 1, 2, 3, 2, 1], oct: 36, wave: 'triangle', gain: .055, rate: .5, len: .22 },
         lead: { wave: 'sawtooth', gain: .035, vib: 1, notes: [[0, 0, 79, 2], [0, 2, 82, 2], [1, 0, 84, 3], [1, 3, 82, 1], [2, 0, 87, 2], [2, 2, 84, 2], [3, 0, 91, 4]] }, riser: 1, wet: .5 },
    12: { name: 'Machine',    bpm: 112, padWave: 'sawtooth', padGain: .015, cut: [300, 900], pulse: .12,
         chords: [[43, 50, 55, 58], [38, 45, 50, 53], [39, 46, 51, 55], [41, 48, 53, 57]], tick: .06,
         arp: { pat: [0, 0, 2, 0, 1, 0, 3, 0], oct: 24, wave: 'square', gain: .03, rate: .25, len: .06 },
         lead: { wave: 'square', gain: .02, notes: [[1, 0, 70, 1], [1, 2, 74, 1], [2, 0, 77, 1], [2, 2, 74, 1], [3, 0, 79, 2]] }, wet: .2 },
    13: { name: 'Mayday',     bpm: 120, padWave: 'sawtooth', padGain: .025, cut: [250, 1100], pulse: .17, boom: 1,
         chords: [[36, 43, 48, 51], [36, 43, 48, 51], [42, 49, 54, 57], [43, 49, 53, 56], [48, 55, 60, 64], [53, 60, 65, 69], [48, 55, 60, 67]],
         arp: { pat: [0, 3], oct: 36, wave: 'square', gain: .02, rate: .5, len: .1, bars: 3 },
         lead: { wave: 'triangle', gain: .06, vib: 1, notes: [[4, 0, 76, 2], [4, 2, 79, 2], [5, 0, 81, 2], [5, 2, 84, 2], [6, 0, 84, 4]] }, wet: .35 },
    14: { name: 'Signal II',  bpm: 54, padWave: 'sine', padGain: .05, cut: [800, 2400], boom: 1, bassGain: .22,
         chords: [[50, 55, 60, 65], [46, 51, 56, 61], [47, 52, 57, 62], [49, 54, 59, 64]],
         arp: { pat: [0, 2, 3, 1], oct: 48, wave: 'sine', gain: .03, rate: 2, len: 1.2 },
         lead: { wave: 'sine', gain: .05, notes: [[1, 0, 86, 2], [1, 3, 85, 1], [2, 0, 88, 3], [3, 0, 91, 1], [3, 2, 85, 2]] }, riser: 1, wet: .8 },
    15: { name: 'Zarathustra', bpm: 66, padWave: 'sawtooth', padGain: .02, cut: [500, 1700],
          chords: [[48, 55, 60, 64], [48, 55, 60, 64], [53, 60, 65, 69], [55, 62, 67, 71], [48, 55, 60, 67]], boom: 1, fanfare: 1,
          arp: { pat: [0, 2, 1, 3], oct: 24, wave: 'triangle', gain: .045, rate: .5, len: .22 }, wet: .5 }
  };

  // legacy moods (kept for any caller that passes a name)
  const MOODS = { hope: SCORES[1], wonder: SCORES[3], tense: SCORES[5], mystery: SCORES[14], epic: SCORES[15] };

  // ------------------------------------------------------------------ engine
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    verb = ctx.createConvolver(); verb.buffer = ir; wet = ctx.createGain(); wet.gain.value = .42; verb.connect(wet); wet.connect(master);
    return ctx;
  }
  const track = n => { live.push(n); return n; };
  function env(g, t, a, hold, r, peak) { g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(.0001, t + a + hold + r); }
  function osc(type, f, t, dur, { gain = .05, a = .6, r = .9, detune = 0, cutoff = 0, cutTo = 0, vib = 0 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    let node = o; if (cutoff) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = .6; lp.frequency.setValueAtTime(cutoff, t); lp.frequency.linearRampToValueAtTime(cutTo || cutoff, t + dur); o.connect(lp); node = lp; }
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.2; lg.gain.value = 9; l.connect(lg); lg.connect(o.detune); l.start(t); l.stop(t + dur + r + .05); track(l); }
    env(g, t, a, Math.max(.01, dur - a), r, gain); node.connect(g); g.connect(master); g.connect(verb);
    o.start(t); o.stop(t + dur + r + .05); track(o);
  }
  function noise(t, dur, { gain = .1, f0 = 400, f1 = 4000, q = .8, type = 'bandpass' } = {}) {
    const len = Math.max(1, ctx.sampleRate * dur), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = b; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(gain, t + dur * .9); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); g.connect(verb); s.start(t); s.stop(t + dur + .05); track(s);
  }
  function boom(t, vol = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.1);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.55 * vol, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + 2.2);
    o.connect(g); g.connect(master); g.connect(verb); o.start(t); o.stop(t + 2.3); track(o);
    noise(t, .5, { gain: .22 * vol, f0: 2200, f1: 120, type: 'lowpass' });
  }
  function brass(m, t, dur, vol = .09) {
    [-9, 0, 9].forEach(d => osc('sawtooth', hz(m), t, dur, { gain: vol / 2, a: .22, r: 1.2, detune: d, cutoff: 500, cutTo: 2600 }));
    osc('sawtooth', hz(m - 12), t, dur, { gain: vol / 3, a: .25, r: 1.2, cutoff: 700, cutTo: 1800 });
  }

  function start(spec = 1, total = 12) {
    if (!ensure()) return; stop(true); if (ctx.state === 'suspended') ctx.resume();
    if (typeof spec === 'number') spec = SCORES[spec] || SCORES[1]; else if (typeof spec === 'string') spec = MOODS[spec] || SCORES[1];
    const S = spec, t0 = ctx.currentTime + .05, beat = 60 / S.bpm, bar = beat * 4;
    wet.gain.value = S.wet == null ? .42 : S.wet;
    master.gain.cancelScheduledValues(t0); master.gain.setValueAtTime(0, t0); master.gain.linearRampToValueAtTime(.8, t0 + 1.2); master.gain.setValueAtTime(.8, t0 + total - 1.0); master.gain.linearRampToValueAtTime(0, t0 + total + .3);
    if (S.boom) boom(t0 + .05, S.fanfare ? .8 : 1);
    if (S.wind) noise(t0 + .3, total - .6, { gain: S.wind, f0: 250, f1: 1100, q: .5 });

    const nBars = Math.ceil(total / bar) + 1;
    for (let c = 0; c < nBars; c++) {                                              // pads, bass, pulse
      const ch = S.chords[c % S.chords.length], t = t0 + c * bar, dur = bar * 1.12, pg = S.padGain || .02;
      ch.forEach((m, i) => {
        osc(S.padWave || 'sawtooth', hz(m), t, dur, { gain: pg, a: 1.0, r: 1.1, detune: -8, cutoff: S.cut[0], cutTo: S.cut[1] });
        osc(S.padWave || 'sawtooth', hz(m + (i % 2 ? 12 : 0)), t, dur, { gain: pg * .9, a: 1.0, r: 1.1, detune: 8, cutoff: S.cut[0], cutTo: S.cut[1] });
      });
      if (S.bassPluck) for (let k = 0; k < 4; k++) osc('triangle', hz(ch[k % 2 ? 2 : 0] - 12), t + k * beat, beat * .8, { gain: .12, a: .01, r: .2 });
      else osc('sine', hz(ch[0] - 12), t, dur, { gain: S.bassGain || .2, a: .5, r: 1.0 });
      if (S.pulse) for (let k = 0; k < 8; k++) osc('square', hz(ch[0] - 24), t + k * beat * .5, beat * .35, { gain: S.pulse * .5, a: .02, r: .15, cutoff: 160 });
      if (S.tick) for (let k = 0; k < 4; k++) noise(t + k * beat, .05, { gain: S.tick, f0: 5000, f1: 7000, type: 'highpass' });
    }
    if (S.arp) {                                                                   // arpeggio / rhythm figure
      const A = S.arp, step = beat * A.rate, steps = Math.floor(total / step);
      for (let i = 2; i < steps; i++) {
        const t = t0 + i * step, c = Math.floor((t - t0) / bar); if (A.bars && c >= A.bars && !S.fanfare && S.lead) { }
        const ch = S.chords[c % S.chords.length], n = ch[A.pat[i % A.pat.length] % ch.length] + A.oct + ((i % 8) > 5 ? 12 : 0);
        osc(A.wave, hz(n), t, A.len, { gain: A.gain * (.7 + .3 * Math.sin(i)), a: .01, r: .4 });
      }
    }
    if (S.lead) S.lead.notes.forEach(([b, bt, m, len]) => {                         // lead melody
      const t = t0 + b * bar + bt * beat; if (t > t0 + total - .8) return;
      osc(S.lead.wave, hz(m), t, len * beat, { gain: S.lead.gain, a: .06, r: .7, vib: S.lead.vib, cutoff: S.lead.wave === 'sawtooth' ? 1800 : 0 });
    });
    if (S.riser || !S.fanfare) noise(t0 + total - 4.2, 3.6, { gain: .05, f0: 300, f1: 7000, q: 1.4 });
    if (S.fanfare) {                                                               // the finale: rising C–G–C, timpani roll, full tutti
      brass(48, t0 + 1.2, 2.2, .1); brass(55, t0 + 2.9, 2.2, .1); brass(60, t0 + 4.6, 3.6, .12);
      for (let i = 0; i < 8; i++) noise(t0 + 4.2 + i * .12, .18, { gain: .1 + i * .012, f0: 600, f1: 160, type: 'lowpass' });
      const T = t0 + 7.3; boom(T, 1); [36, 48, 55, 60, 64, 67, 72, 76].forEach(m => brass(m, T, total - 7.3, .085));
    }
  }

  function stop(quick) {
    const when = ctx ? ctx.currentTime + (quick ? 0 : .6) : 0;
    live.forEach(n => { try { n.stop(when); } catch (e) { } }); live = [];
    if (ctx && master) { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + (quick ? .02 : .5)); }
  }

  window.Score = { start, stop, forMission: id => SCORES[id] || SCORES[1], SCORES };
})();
