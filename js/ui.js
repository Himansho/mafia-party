/* Mafia Party — UI helpers: navigation, toasts, haptics, avatars, storage */
(function (global) {
  'use strict';

  /* ---------- tiny DOM helpers ---------- */
  const $ = function (sel) { return document.querySelector(sel); };
  const $$ = function (sel) { return Array.from(document.querySelectorAll(sel)); };
  const el = function (tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  /* ---------- avatars: deterministic color + initial ---------- */
  const AV_COLORS = ['#e06a5a', '#5aa9ff', '#4cd97b', '#e8c05a', '#b97ee0', '#ff8a5c',
    '#5cd6c9', '#f26d9d', '#8fa5ff', '#a3d55d', '#d9a566', '#7ad0f2'];
  function avatarFor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    return {
      color: AV_COLORS[h % AV_COLORS.length],
      initial: (name.trim()[0] || '?').toUpperCase()
    };
  }

  /* ---------- screens ---------- */
  let current = null;
  function show(id) {
    $$('.screen').forEach(function (s) { s.classList.remove('active'); });
    const target = document.getElementById('screen-' + id);
    if (!target) throw new Error('No screen: ' + id);
    target.classList.add('active');
    current = id;
    target.scrollTop = 0;
  }
  function screen() { return current; }

  /* ---------- toasts ---------- */
  function toast(msg, kind) {
    const layer = $('#toast-layer');
    const t = el('div', 'toast' + (kind ? ' ' + kind : ''), msg);
    layer.appendChild(t);
    setTimeout(function () { t.remove(); }, 3100);
  }

  /* ---------- haptics ---------- */
  let hapticsOn = true;
  function haptic(ms) {
    if (!hapticsOn) return;
    if (global.navigator && navigator.vibrate) {
      try { navigator.vibrate(ms || 12); } catch (e) { /* ignore */ }
    }
  }

  /* ---------- settings persistence ---------- */
  const KEY = 'mafia-settings';
  const defaults = { sound: true, haptics: true };
  function loadSettings() {
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch (e) { return Object.assign({}, defaults); }
  }
  function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  /* ---------- misc ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffleNames() {
    const names = ['Ava', 'Ben', 'Cara', 'Dan', 'Eli', 'Fay', 'Gus', 'Hana',
      'Ike', 'Jo', 'Kip', 'Lena', 'Milo', 'Nia', 'Omar', 'Pia',
      'Quinn', 'Rex', 'Sana', 'Tao'];
    return names[Math.floor(Math.random() * names.length)];
  }

  global.UI = {
    $: $, $$: $$, el: el,
    show: show, screen: screen,
    toast: toast,
    haptic: haptic,
    setHaptics: function (on) { hapticsOn = !!on; },
    avatarFor: avatarFor,
    loadSettings: loadSettings, saveSettings: saveSettings,
    escapeHtml: escapeHtml,
    randomName: shuffleNames
  };
})(typeof window !== 'undefined' ? window : globalThis);
