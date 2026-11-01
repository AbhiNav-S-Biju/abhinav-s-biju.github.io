/*
 * BendSlider — a before/after divider for any two full-screen views.
 *
 * Drag the handle and a divider follows the pointer. The divider bends with
 * the drag speed, the incoming view slides in with motion blur, a red/blue
 * colour split fringes the divider, and dots spray off the line. Release past
 * halfway (or flick) to commit to the other view; otherwise it springs back.
 *
 * Cost control: the blur is a plain CSS blur (GPU, works in every browser) and the
 * colour split is drawn on the canvas, instead of an SVG filter over the whole view,
 * which was slow on large screens and unsupported on HTML content in Safari. If frames
 * still come in slow, it drops to a lite mode (no blur, fewer dots) and stays there.
 *
 *   new BendSlider({
 *     handle,          // element that starts the drag (a <button>; click/Enter sweeps)
 *     canvas,          // full-viewport <canvas> for the divider and the spray
 *     buildView,       // (bleed) => Element: the "after" view, laid out for the viewport and
 *                      //   offset by `bleed` px on both axes (room for the blur at the edges)
 *     onCommit,        // () => void: make the "after" view the real one
 *     onStart, onEnd,  // optional hooks (e.g. pause smooth scrolling)
 *     colors,          // () => [lineColour, ...sprayColours]
 *     reducedMotion,   // () => boolean
 *   });
 */
(function (global) {
  'use strict';

  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  var BLEED = 24;            // px the view extends past the viewport so a blur doesn't fade the edges
  var MAX_PARTICLES = 140;
  var SLOW_FRAME_MS = 28;    // average frame time that triggers lite mode
  var canBlur = !!(window.CSS && CSS.supports && CSS.supports('filter', 'blur(2px)'));

  function BendSlider(opts) {
    this.o = opts;
    this.handle = opts.handle;
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.active = false;      // overlay is showing
    this.dragging = false;
    this.running = false;     // rAF loop alive
    this.particles = [];
    this.x = 0; this.prevX = 0; this.vel = 0; this.bend = 0;
    this.py = 0; this.target = null;
    this.suppressClick = false;
    this.lite = false;        // set once frames prove slow; stays on for later drags
    this._tick = this._tick.bind(this);
    this._bind();
  }

  BendSlider.prototype._bind = function () {
    var self = this, h = this.handle, downX = 0, downY = 0, pending = false, id = null;

    h.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || self.active) return;
      self.suppressClick = false;
      pending = true; id = e.pointerId; downX = e.clientX; downY = e.clientY;
      h.setPointerCapture(id);
    });
    h.addEventListener('pointermove', function (e) {
      if (e.pointerId !== id) return;
      if (pending && Math.hypot(e.clientX - downX, e.clientY - downY) > 4) {
        pending = false;
        self._open(e.clientY);
        self.dragging = true;
        h.classList.add('is-dragging');
      }
      if (self.dragging) {
        self.x = clamp(e.clientX, 0, self.W);
        self.py = clamp(e.clientY, 0, self.H);
      }
    });
    var up = function (e) {
      if (e.pointerId !== id) return;
      pending = false; id = null;
      if (!self.dragging) return;
      self.dragging = false;
      self.suppressClick = true;
      h.classList.remove('is-dragging');
      // Past halfway, or a quick flick toward the far side, commits.
      var commit = self.x < self.W * 0.5 || self.vel < -18;
      if (self.vel > 18) commit = false;
      self._settle(commit);
    };
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);

    h.addEventListener('click', function () {
      if (self.suppressClick) { self.suppressClick = false; return; }
      if (self.active) return;
      self.sweep();
    });
  };

  // Animate a full switch, as if someone dragged it across.
  BendSlider.prototype.sweep = function () {
    if (this._reduced()) { this.o.onCommit(); return; }
    this._open(window.innerHeight / 2);
    this._settle(true, 0.07);
  };

  BendSlider.prototype._reduced = function () {
    return !!(this.o.reducedMotion && this.o.reducedMotion());
  };

  BendSlider.prototype._open = function (py) {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.x = this.prevX = this.W;
    this.vel = 0; this.bend = 0; this.py = py; this.target = null;
    this.stiffness = 0.16;

    this.last = 0; this.ema = 0; this.frames = 0; this.blurNow = 0; this.clipNow = '';
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var c = this.o.colors ? this.o.colors() : ['#333', '#9e3a2e', '#344c69'];
    this.lineColour = c[0];
    this.sprayColours = c.slice(1);

    var overlay = document.createElement('div');
    overlay.className = 'bend-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    var fx = document.createElement('div');
    fx.className = 'bend-overlay__fx';
    fx.style.inset = -BLEED + 'px';
    fx.appendChild(this.o.buildView(BLEED));
    overlay.appendChild(fx);
    document.body.appendChild(overlay);
    this.overlay = overlay; this.fx = fx;
    this.active = true;
    if (this.o.onStart) this.o.onStart();
    this._start();
  };

  BendSlider.prototype._settle = function (commit, stiffness) {
    this.commit = commit;
    this.target = commit ? 0 : this.W;
    if (stiffness) this.stiffness = stiffness;
    if (this._reduced()) { this.x = this.target; }
  };

  BendSlider.prototype._close = function () {
    if (this.commit) this.o.onCommit();
    var overlay = this.overlay;
    // Let the committed page paint underneath before removing the copy.
    requestAnimationFrame(function () { overlay && overlay.remove(); });
    this.overlay = this.fx = null;
    this.active = false;
    this.target = null;
    if (this.o.onEnd) this.o.onEnd();
  };

  BendSlider.prototype._start = function () {
    if (!this.running) { this.running = true; requestAnimationFrame(this._tick); }
  };

  BendSlider.prototype._tick = function (now) {
    var reduced = this._reduced();
    if (this.active) {
      // Watch the frame rate while dragging; on a slow machine switch the heavy bits off.
      if (this.last) {
        var dt = now - this.last;
        this.ema = this.ema ? this.ema * 0.85 + dt * 0.15 : dt;
        if (++this.frames > 12 && this.ema > SLOW_FRAME_MS && !this.lite) {
          this.lite = true;
          this.fx.style.filter = 'none';
          this.blurNow = 0;
        }
      }
      this.last = now;

      if (this.target !== null) {
        this.x = lerp(this.x, this.target, this.stiffness);
        if (Math.abs(this.x - this.target) < 0.6) this.x = this.target;
      }
      var v = this.x - this.prevX;
      this.prevX = this.x;
      this.vel = lerp(this.vel, v, 0.35);
      // The ends of the line trail behind the grabbed point.
      this.bend = reduced ? 0 : lerp(this.bend, clamp(-this.vel * 7, -170, 170), 0.2);
      this._paintOverlay(reduced);

      if (this.target !== null && this.x === this.target && Math.abs(this.vel) < 0.3 && Math.abs(this.bend) < 1) {
        this._close();
      }
    }

    this._paintCanvas(reduced);

    if (this.active || this.particles.length) {
      requestAnimationFrame(this._tick);
    } else {
      this.running = false;
      this.ctx.clearRect(0, 0, this.W, this.H);
    }
  };

  // Points of the bent divider: ends at ex, the grabbed point at (x, py).
  BendSlider.prototype._curve = function () {
    var x = this.x, ex = x + this.bend, py = this.py, H = this.H;
    return { x: x, ex: ex, py: py, H: H,
      d: 'M' + ex + ' 0 C' + ex + ' ' + py * 0.55 + ' ' + x + ' ' + py * 0.45 + ' ' + x + ' ' + py +
         ' C' + x + ' ' + (py + (H - py) * 0.55) + ' ' + ex + ' ' + (py + (H - py) * 0.45) + ' ' + ex + ' ' + H };
  };

  BendSlider.prototype._pointAt = function (t) {
    // Sample along the two cubic segments.
    var c = this._curve(), seg = t < 0.5 ? 0 : 1, u = seg ? (t - 0.5) * 2 : t * 2;
    var p0, p1, p2, p3;
    if (!seg) { p0 = [c.ex, 0]; p1 = [c.ex, c.py * 0.55]; p2 = [c.x, c.py * 0.45]; p3 = [c.x, c.py]; }
    else { p0 = [c.x, c.py]; p1 = [c.x, c.py + (c.H - c.py) * 0.55]; p2 = [c.ex, c.py + (c.H - c.py) * 0.45]; p3 = [c.ex, c.H]; }
    var m = 1 - u;
    return [
      m * m * m * p0[0] + 3 * m * m * u * p1[0] + 3 * m * u * u * p2[0] + u * u * u * p3[0],
      m * m * m * p0[1] + 3 * m * m * u * p1[1] + 3 * m * u * u * p2[1] + u * u * u * p3[1]
    ];
  };

  BendSlider.prototype._paintOverlay = function (reduced) {
    var c = this._curve(), W = this.W, H = this.H;
    // Only touch the style when the shape really moved: every clip change repaints a mask.
    var clip = "path('" + c.d + ' L' + (W + 400) + ' ' + H + ' L' + (W + 400) + " 0 Z')";
    if (clip !== this.clipNow) { this.overlay.style.clipPath = clip; this.clipNow = clip; }

    if (reduced) { this.fx.style.transform = 'none'; this.fx.style.filter = 'none'; return; }

    // The incoming view slides into place as it is revealed, faster with speed.
    var slide = (this.x / W) * 60 + clamp(this.vel * 2.2, -70, 70);
    this.fx.style.transform = 'translate3d(' + slide.toFixed(1) + 'px,0,0)';

    // Motion blur: a plain CSS blur, stepped in halves so it isn't re-rendered every frame.
    if (canBlur && !this.lite) {
      var blur = Math.round(clamp(Math.abs(this.vel) * 0.3, 0, 6) * 2) / 2;
      if (blur !== this.blurNow) {
        this.fx.style.filter = blur >= 1 ? 'blur(' + blur + 'px)' : 'none';
        this.blurNow = blur;
      }
    }
  };

  BendSlider.prototype._paintCanvas = function (reduced) {
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);

    // Spray
    if (this.active && !reduced) {
      var speed = Math.abs(this.vel);
      var n = speed > 1.2 ? Math.min(Math.round(speed * 0.35), this.lite ? 3 : 7) : 0;
      if (this.particles.length > (this.lite ? 60 : MAX_PARTICLES)) n = 0;
      for (var i = 0; i < n; i++) {
        var t = Math.random();
        var p = this._pointAt(t);
        var dir = this.vel < 0 ? -1 : 1;
        this.particles.push({
          x: p[0], y: p[1],
          vx: dir * (1.5 + Math.random() * speed * 0.35) + (Math.random() - 0.5),
          vy: (Math.random() - 0.5) * 3 - 0.6,
          r: 1.2 + Math.random() * 2.8,
          life: 0, max: 36 + Math.random() * 40,
          c: this.sprayColours[(Math.random() * this.sprayColours.length) | 0]
        });
      }
    }
    for (var k = this.particles.length - 1; k >= 0; k--) {
      var d = this.particles[k];
      d.life++; d.x += d.vx; d.y += d.vy; d.vx *= 0.96; d.vy = d.vy * 0.96 + 0.12;
      if (d.life > d.max) { this.particles.splice(k, 1); continue; }
      ctx.globalAlpha = 1 - d.life / d.max;
      ctx.fillStyle = d.c;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (!this.active) return;

    // Divider: a pencil line with a faint second pass.
    var c = this._curve();
    var path = new Path2D(c.d);
    ctx.lineCap = 'round';

    // Colour split: a red and a blue ghost of the line, pulled apart by the drag speed.
    var split = reduced || this.lite ? 0 : clamp(Math.abs(this.vel) * 0.45, 0, 10);
    if (split > 0.8) {
      ctx.save();
      ctx.lineWidth = 2 + split * 0.5;
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#ff2d55';
      ctx.translate(-split, 0); ctx.stroke(path);
      ctx.strokeStyle = '#2d6bff';
      ctx.translate(split * 2, 0); ctx.stroke(path);
      ctx.restore();
    }

    ctx.strokeStyle = this.lineColour;
    ctx.lineWidth = 2.2;
    ctx.stroke(path);
    if (!this.lite) {
      ctx.save();
      ctx.translate(1.6, 0.8);
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.stroke(path);
      ctx.restore();
    }

    // Grab knob
    if (this.dragging || this.target !== null) {
      ctx.save();
      ctx.translate(c.x, c.py);
      ctx.fillStyle = this.sprayColours[0];
      ctx.beginPath(); ctx.arc(2, 2, 17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.knobFill || '#fcf8ef';
      ctx.strokeStyle = this.lineColour; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8, 0); ctx.lineTo(8, 0);
      ctx.moveTo(-4, -4); ctx.lineTo(-8, 0); ctx.lineTo(-4, 4);
      ctx.moveTo(4, -4); ctx.lineTo(8, 0); ctx.lineTo(4, 4);
      ctx.stroke();
      ctx.restore();
    }
  };

  global.BendSlider = BendSlider;
})(window);
