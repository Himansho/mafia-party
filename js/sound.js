/* Mafia Party — WebAudio sound engine (no audio files, pure synthesis) */
(function (global) {
  'use strict';
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setEnabled(on) { enabled = !!on; if (on) ac(); }

  /** core tone helper */
  function tone(freq, dur, opts) {
    if (!enabled) return;
    const c = ac(); if (!c) return;
    opts = opts || {};
    const t0 = c.currentTime + (opts.delay || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    const vol = opts.vol != null ? opts.vol : 0.18;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, opts) {
    if (!enabled) return;
    const c = ac(); if (!c) return;
    opts = opts || {};
    const t0 = c.currentTime + (opts.delay || 0);
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = opts.filter || 'highpass';
    filt.frequency.value = opts.f || 800;
    const gain = c.createGain();
    gain.gain.setValueAtTime(opts.vol || 0.12, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(gain).connect(c.destination);
    src.start(t0); src.stop(t0 + dur);
  }

  const Sfx = {
    setEnabled: setEnabled,
    /* UI */
    tap: function () { tone(520, 0.06, { type: 'triangle', vol: .12 }); },
    select: function () { tone(660, 0.07, { type: 'triangle', vol: .14 }); tone(880, 0.08, { delay: .05, vol: .1 }); },
    success: function () { tone(523, .12); tone(659, .12, { delay: .1 }); tone(784, .2, { delay: .2 }); },
    error: function () { tone(220, .18, { type: 'sawtooth', vol: .12 }); tone(160, .22, { delay: .1, type: 'sawtooth', vol: .12 }); },
    /* game events */
    reveal: function () {
      // mysterious shimmer
      [523, 622, 784, 932].forEach(function (f, i) { tone(f, .5, { delay: i * .07, vol: .07, type: 'sine' }); });
    },
    mafiaReveal: function () {
      // dramatic dun-dun-DUN
      tone(147, .5, { type: 'sawtooth', vol: .2 });
      tone(110, .9, { type: 'sawtooth', delay: .25, vol: .22 });
      noise(.7, { filter: 'lowpass', f: 400, vol: .1, delay: .25 });
      tone(74, 1.2, { type: 'sine', delay: .5, vol: .25 });
    },
    win: function () {
      [392, 523, 659, 784].forEach(function (f, i) { tone(f, .3, { delay: i * .12, vol: .15 }); });
      tone(1046, .5, { delay: .5, vol: .12 });
    },
    lose: function () {
      [392, 349, 311, 262].forEach(function (f, i) { tone(f, .35, { delay: i * .18, type: 'triangle', vol: .15 }); });
    },
    vote: function () { tone(440, .1, { type: 'square', vol: .08 }); tone(440, .1, { type: 'square', delay: .12, vol: .08 }); },
    tick: function () { tone(1000, .03, { type: 'square', vol: .05 }); },
    tock: function () { tone(1400, .03, { type: 'square', vol: .04 }); }
  };

  global.Sfx = Sfx;
})(typeof window !== 'undefined' ? window : globalThis);
