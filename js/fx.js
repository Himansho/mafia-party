/* Mafia Party — canvas FX: confetti, win bursts, red glitch rain */
(function (global) {
  'use strict';

  const canvas = document.getElementById('fx-canvas');
  const ctx2 = canvas.getContext('2d');
  let particles = [];
  let raf = null;
  let W = 0, H = 0;

  function resize() {
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    W = canvas.width = innerWidth * dpr;
    H = canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  const GOLD = ['#e8c05a', '#f5d67b', '#c9992e', '#fff2c4'];
  const REDS = ['#ff5964', '#c0343d', '#ff8a92', '#7a1f26'];
  const GREENS = ['#4cd97b', '#8dffb0', '#2e9e57', '#d9ffe6'];

  function spawn(n, colors, opts) {
    opts = opts || {};
    for (let i = 0; i < n; i++) {
      particles.push({
        x: opts.x != null ? opts.x : Math.random() * innerWidth,
        y: opts.y != null ? opts.y : -20 - Math.random() * innerHeight * .3,
        vx: (Math.random() - .5) * (opts.spread || 3),
        vy: 1 + Math.random() * (opts.speed || 3),
        size: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - .5) * .3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: .004 + Math.random() * .008,
        shape: Math.random() < .5 ? 'rect' : 'circle'
      });
    }
    if (!raf) loop();
  }

  function loop() {
    ctx2.clearRect(0, 0, W, H);
    if (!particles.length) { raf = null; return; }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= p.decay;
      p.vy += 0.04; // gravity
      if (p.life <= 0 || p.y > innerHeight + 30) { particles.splice(i, 1); continue; }
      ctx2.save();
      ctx2.globalAlpha = Math.max(0, p.life);
      ctx2.translate(p.x, p.y);
      ctx2.rotate(p.rot);
      ctx2.fillStyle = p.color;
      if (p.shape === 'rect') ctx2.fillRect(-p.size / 2, -p.size, p.size, p.size * 2);
      else { ctx2.beginPath(); ctx2.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx2.fill(); }
      ctx2.restore();
    }
    raf = requestAnimationFrame(loop);
  }

  global.Fx = {
    /** gold celebration for civilian wins */
    celebrate: function () {
      spawn(90, GOLD, { speed: 4 });
      setTimeout(function () { spawn(60, GOLD); }, 350);
    },
    /** red rain for mafia wins */
    sinister: function () {
      spawn(110, REDS, { speed: 2.5, spread: 1.5 });
      setTimeout(function () { spawn(50, REDS, { speed: 2 }); }, 400);
    },
    /** green burst when a guess/action is correct */
    burst: function (x, y) {
      spawn(36, GREENS, { x: x, y: y, speed: 6, spread: 8 });
    },
    smallPop: function (x, y) {
      spawn(14, GOLD, { x: x, y: y, speed: 4, spread: 5 });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
