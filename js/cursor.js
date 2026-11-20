/*
 * Velocity Squish cursor.
 *
 * A white dot (difference-blended, so it reads on both paper themes) follows the pointer with a
 * little lag, turns to face its direction of travel and stretches along it with speed: atan2 of
 * the movement gives the angle, speed pushes scaleX up and scaleY down. Over links, buttons and
 * inputs it swells.
 *
 * It is only an overlay: the system cursor is never hidden, the dot ignores the pointer, and it
 * is hidden from assistive tech. It only mounts on a hover-capable fine pointer, never with
 * reduced motion, and only while the visitor has it switched on (the "cursor" button in the nav).
 */
(function () {
  'use strict';

  var SIZE = 34;          // px
  var FOLLOW = 0.16;      // share of the remaining distance covered per 60 Hz frame
  var DEFORM = 0.72;      // how much speed stretches it
  var HOVER_SCALE = 1.7;
  var STORE_KEY = 'cursor';

  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var toggle = document.getElementById('cursorToggle');

  function wanted() {
    var v = null;
    try { v = localStorage.getItem(STORE_KEY); } catch (e) {}
    return v !== 'off';
  }
  function remember(on) {
    try { localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch (e) {}
  }

  var cursor = null;  // the mounted instance, or null

  function mount() {
    var el = document.createElement('div');
    el.className = 'squish';
    el.setAttribute('aria-hidden', 'true');
    el.style.width = el.style.height = SIZE + 'px';
    document.body.appendChild(el);

    var tx = 0, ty = 0;           // pointer
    var x = 0, y = 0;             // dot
    var stretch = 0, angle = 0, hover = 1, hoverTarget = 1, press = 1;
    var seen = false, raf = 0, last = 0;

    function frame(now) {
      raf = 0;
      var dt = last ? Math.min(Math.max(now - last, 4), 50) : 16.67;
      last = now;
      var k = dt / 16.67;

      // frame-rate independent easing toward the pointer
      var f = 1 - Math.pow(1 - FOLLOW, k);
      var px = x, py = y;
      x += (tx - x) * f;
      y += (ty - y) * f;

      var vx = (x - px) / k, vy = (y - py) / k;   // px per 60 Hz frame
      var speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > 0.4) angle = Math.atan2(vy, vx);
      var s = Math.min(speed / SIZE, 1) * DEFORM;
      stretch += (s - stretch) * Math.min(1, 0.35 * k);
      hover += (hoverTarget - hover) * Math.min(1, 0.2 * k);
      press += (1 - press) * Math.min(1, 0.18 * k);

      var sx = (1 + stretch) * hover * press;
      var sy = Math.max(0.35, 1 - stretch * 0.6) * hover * press;
      el.style.transform =
        'translate3d(' + (x - SIZE / 2).toFixed(2) + 'px,' + (y - SIZE / 2).toFixed(2) + 'px,0)' +
        ' rotate(' + angle.toFixed(4) + 'rad) scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')';

      // keep going until everything has settled, then sleep until the pointer moves again
      var busy = Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1 || stretch > 0.002 ||
        Math.abs(hoverTarget - hover) > 0.002 || Math.abs(1 - press) > 0.002;
      if (busy) raf = requestAnimationFrame(frame); else last = 0;
    }
    function wake() { if (!raf) raf = requestAnimationFrame(frame); }

    function onMove(e) {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      tx = e.clientX; ty = e.clientY;
      if (!seen) { seen = true; x = tx; y = ty; el.classList.add('is-on'); }
      var t = e.target;
      hoverTarget = t && t.closest && t.closest('a, button, input') ? HOVER_SCALE : 1;
      wake();
    }
    function onDown() { press = 0.78; wake(); }
    function onLeave() { el.classList.remove('is-on'); seen = false; }

    // A modal <dialog> sits in the top layer, above any z-index, so the dot rides along inside it.
    function follow() {
      var open = document.querySelector('dialog[open]');
      var host = open || document.body;
      if (el.parentNode !== host) host.appendChild(el);
    }
    var mo = new MutationObserver(follow);
    document.querySelectorAll('dialog').forEach(function (d) {
      mo.observe(d, { attributes: true, attributeFilter: ['open'] });
    });

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);

    return function teardown() {
      if (raf) cancelAnimationFrame(raf);
      mo.disconnect();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerdown', onDown);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      el.remove();
    };
  }

  function available() { return fine.matches && !calm.matches; }

  function sync() {
    var on = available() && wanted();
    if (on && !cursor) cursor = mount();
    if (!on && cursor) { cursor(); cursor = null; }
    if (toggle) {
      toggle.hidden = !available();
      toggle.setAttribute('aria-pressed', wanted() ? 'true' : 'false');
    }
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      remember(!wanted());
      sync();
    });
  }

  [fine, calm].forEach(function (q) {
    if (q.addEventListener) q.addEventListener('change', sync);
    else if (q.addListener) q.addListener(sync);
  });
  // Docking a tablet or plugging in a mouse doesn't always fire the media query's change event.
  window.addEventListener('resize', sync);

  sync();
})();
