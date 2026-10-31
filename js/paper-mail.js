/*
 * Paper mail — the contact note.
 * On send: the note prints onto a sheet, the sheet folds into a paper plane,
 * the plane flies into the Send button, and the button opens into a receipt
 * from the person who got it. The real send (Web3Forms) runs alongside.
 */
(function () {
  'use strict';

  var TO_EMAIL = 'abhinavbijusn@gmail.com';
  var TO_NAME = 'Abhinav S Biju';
  var ENDPOINT = 'https://api.web3forms.com/submit';
  // Web3Forms access keys are meant to be public; it only lets the form deliver to the key's inbox.
  var ACCESS_KEY = '6c1016ac-48b7-4aa4-915a-c644a5d35750';

  var form = document.getElementById('mailForm');
  if (!form) return;
  var stage = document.getElementById('mailStage');
  var note = document.getElementById('mfNote');
  var nameEl = document.getElementById('mfName');
  var emailEl = document.getElementById('mfEmail');
  var sendWrap = document.getElementById('mailSendWrap');
  var sendBtn = document.getElementById('mailSend');
  var errorEl = document.getElementById('mailError');
  var statusEl = document.getElementById('mailStatus');

  var gsap = window.gsap;
  var reduced = function () { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; };
  // ?mailtest=ok or ?mailtest=fail runs the whole animation without sending anything.
  var mock = new URLSearchParams(location.search).get('mailtest');
  var busy = false;

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function tween(target, vars) {
    return new Promise(function (r) { vars.onComplete = r; gsap.to(target, vars); });
  }

  // ---------- Sending ----------
  function send(data) {
    if (mock) return wait(1200).then(function () {
      return mock === 'ok' ? { ok: true } : { ok: false, reason: 'Test mode: pretending the post office is closed.' };
    });
    // Bots fill the hidden field; let them think it worked.
    if (data.honey) return wait(800).then(function () { return { ok: true }; });
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { ctrl && ctrl.abort(); }, 15000);
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: ACCESS_KEY,
        subject: 'Portfolio note from ' + data.name,
        from_name: 'Portfolio paper plane',
        name: data.name,
        email: data.email,
        replyto: data.email,
        message: data.message
      }),
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (j) { return { res: res, j: j }; }); })
      .then(function (o) {
        clearTimeout(timer);
        var ok = o.res.ok && String(o.j.success) === 'true';
        return ok ? { ok: true } : { ok: false, reason: o.j.message || 'The mail server said no.' };
      })
      .catch(function () {
        clearTimeout(timer);
        return { ok: false, reason: 'It couldn\'t reach the mail server. Check your connection.' };
      });
  }

  // ---------- Validation ----------
  function validate() {
    var checks = [
      [nameEl, nameEl.value.trim().length > 0, 'Add your name so I know who wrote.'],
      [emailEl, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim()), 'That email doesn\'t look right. I need it to reply.'],
      [note, note.value.trim().length >= 2, 'Write a note first.']
    ];
    for (var i = 0; i < checks.length; i++) {
      checks[i][0].setAttribute('aria-invalid', checks[i][1] ? 'false' : 'true');
    }
    for (var k = 0; k < checks.length; k++) {
      if (!checks[k][1]) { errorEl.textContent = checks[k][2]; checks[k][0].focus(); return false; }
    }
    errorEl.textContent = '';
    return true;
  }

  // ---------- Animation pieces ----------
  function printSheet(text) {
    var sheet = document.createElement('div');
    sheet.className = 'mail__sheet';
    sheet.setAttribute('aria-hidden', 'true');
    var inner = document.createElement('div');
    inner.className = 'mail__sheet-text';
    inner.textContent = text;
    var head = document.createElement('span');
    head.className = 'mail__printhead';
    sheet.appendChild(inner);
    sheet.appendChild(head);
    stage.appendChild(sheet);
    note.style.visibility = 'hidden';

    var lines = Math.max(1, Math.round(inner.scrollHeight / parseFloat(getComputedStyle(inner).lineHeight)));
    var dur = Math.min(0.25 + lines * 0.16, 1.6);
    gsap.fromTo(sheet, { y: -10 }, { y: 0, duration: 0.25, ease: 'power2.out' });
    gsap.fromTo(head, { top: '8%' }, { top: '96%', duration: dur, ease: 'steps(' + Math.min(lines, 12) + ')' });
    return tween(inner, {
      startAt: { clipPath: 'inset(0 0 100% 0)' },
      clipPath: 'inset(0 0 0% 0)', duration: dur, ease: 'steps(' + Math.min(lines, 12) + ')'
    }).then(function () { head.remove(); return sheet; });
  }

  function pts(arr) { return arr.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }

  // Four panels that make the sheet; each is folded in two steps into the plane.
  function foldShapes(w, h) {
    var q = w / 4, m = w / 2, hs = Math.min(m, h * 0.7);
    var sheet = [
      [[0, 0], [q, 0], [q, h], [0, h]],
      [[q, 0], [m, 0], [m, h], [q, h]],
      [[m, 0], [m + q, 0], [m + q, h], [m, h]],
      [[m + q, 0], [w, 0], [w, h], [m + q, h]]
    ];
    var corners = [
      [[0, hs], [q, hs / 2], [q, h], [0, h]],
      [[q, hs / 2], [m, 0], [m, h], [q, h]],
      [[m, 0], [m + q, hs / 2], [m + q, h], [m, h]],
      [[m + q, hs / 2], [w, hs], [w, h], [m + q, h]]
    ];
    // Plane, nose up, in a square box centred on the sheet.
    var P = Math.min(w, h), cx = m, top = h / 2 - P / 2, bot = h / 2 + P / 2;
    var plane = [
      [[cx - P * 0.36, bot - P * 0.08], [cx, top], [cx - P * 0.04, bot - P * 0.08], [cx - P * 0.36, bot - P * 0.08]],
      [[cx, top], [cx, top], [cx, bot], [cx - P * 0.04, bot - P * 0.08]],
      [[cx, top], [cx, top], [cx + P * 0.04, bot - P * 0.08], [cx, bot]],
      [[cx + P * 0.04, bot - P * 0.08], [cx, top], [cx + P * 0.36, bot - P * 0.08], [cx + P * 0.36, bot - P * 0.08]]
    ];
    return { sheet: sheet, corners: corners, plane: plane, P: P };
  }

  function foldPlane(sheet) {
    var w = sheet.offsetWidth, h = sheet.offsetHeight;
    var s = foldShapes(w, h);
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'mail__fold');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('aria-hidden', 'true');
    var polys = s.sheet.map(function (p, i) {
      var el = document.createElementNS(NS, 'polygon');
      el.setAttribute('points', pts(p));
      el.setAttribute('class', i === 1 || i === 2 ? 'keel' : 'wing');
      svg.appendChild(el);
      return el;
    });
    stage.appendChild(svg);

    var tl = gsap.timeline();
    tl.to(sheet.firstChild, { autoAlpha: 0, duration: 0.2 })
      .add(function () { sheet.style.visibility = 'hidden'; })
      .to(polys, { attr: { points: function (i) { return pts(s.corners[i]); } }, duration: 0.35, ease: 'power2.inOut' })
      .to(polys, { attr: { points: function (i) { return pts(s.plane[i]); } }, duration: 0.4, ease: 'power3.inOut' })
      .to(svg, { scale: 120 / s.P, duration: 0.4, ease: 'power2.inOut', transformOrigin: '50% 50%' }, '<');
    return new Promise(function (r) { tl.eventCallback('onComplete', function () { sheet.remove(); r(svg); }); });
  }

  function fly(svg) {
    var a = svg.getBoundingClientRect(), b = sendBtn.getBoundingClientRect();
    var start = [a.left + a.width / 2, a.top + a.height / 2];
    var end = [b.left + b.width / 2, b.top + b.height / 2];
    var dx = end[0] - start[0], dy = end[1] - start[1];
    // Control point: swing up and out before diving into the button.
    var c = [start[0] + dx * 0.5 + Math.max(160, Math.abs(dy) * 0.6), start[1] + dy * 0.1 - 140];
    var base = gsap.getProperty(svg, 'scale');
    var st = { p: 0 };
    gsap.set(svg, { rotation: 0 });
    return new Promise(function (r) {
      gsap.to(st, {
        p: 1, duration: 1.15, ease: 'power1.in',
        onUpdate: function () {
          var t = st.p, u = 1 - t;
          var x = u * u * start[0] + 2 * u * t * c[0] + t * t * end[0];
          var y = u * u * start[1] + 2 * u * t * c[1] + t * t * end[1];
          var tx = 2 * u * (c[0] - start[0]) + 2 * t * (end[0] - c[0]);
          var ty = 2 * u * (c[1] - start[1]) + 2 * t * (end[1] - c[1]);
          gsap.set(svg, {
            x: x - start[0], y: y - start[1],
            rotation: Math.atan2(ty, tx) * 180 / Math.PI + 90,
            scale: base * (1 - t * 0.7),
            opacity: t > 0.92 ? (1 - t) / 0.08 : 1
          });
        },
        onComplete: function () { svg.remove(); r(); }
      });
    });
  }

  function gulp() {
    return tween(sendBtn, { keyframes: [{ scale: 1.14, rotation: 2, duration: 0.12 }, { scale: 1, rotation: -0.8, duration: 0.25, ease: 'back.out(3)' }] });
  }

  // ---------- Receipt ----------
  function stamp() {
    var d = new Date();
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function receiptHTML(ok, data, reason) {
    var esc = function (s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
    var excerpt = data.message.length > 120 ? data.message.slice(0, 117).trim() + '…' : data.message;
    var ref = Math.random().toString(36).slice(2, 8).toUpperCase();
    if (ok) {
      return '' +
        '<p class="receipt__stamp">Received</p>' +
        '<dl class="receipt__rows">' +
          '<div><dt>to</dt><dd>' + TO_NAME + '</dd></div>' +
          '<div><dt>from</dt><dd>' + esc(data.name) + '</dd></div>' +
          '<div><dt>when</dt><dd>' + stamp() + '</dd></div>' +
          '<div><dt>ref</dt><dd>#' + ref + '</dd></div>' +
        '</dl>' +
        '<p class="receipt__note">“' + esc(excerpt) + '”</p>' +
        '<p class="receipt__sig">Got it — thank you! I\'ll write back to ' + esc(data.email) + '.<span>— Abhinav</span></p>' +
        '<button class="btn receipt__again" type="button" data-act="new">Write another note</button>';
    }
    return '' +
      '<p class="receipt__stamp receipt__stamp--fail">Returned</p>' +
      '<p class="receipt__note">The plane didn\'t land. ' + esc(reason || '') + '</p>' +
      '<p class="receipt__sig">You can still email me at <a href="mailto:' + TO_EMAIL + '">' + TO_EMAIL + '</a>.</p>' +
      '<button class="btn btn--red receipt__again" type="button" data-act="retry">Try again</button>';
  }

  function openReceipt(ok, data, reason, animate) {
    var r = document.createElement('div');
    r.className = 'receipt' + (ok ? '' : ' receipt--fail');
    r.setAttribute('tabindex', '-1');
    r.setAttribute('role', 'group');
    r.setAttribute('aria-label', ok ? 'Delivery receipt' : 'Not delivered');
    r.innerHTML = receiptHTML(ok, data, reason);
    sendWrap.appendChild(r);
    statusEl.textContent = ok ? 'Sent. Abhinav received your note.' : 'Not sent. ' + (reason || '');

    var full = { w: r.offsetWidth, h: r.offsetHeight };
    var btnW = sendBtn.offsetWidth, btnH = sendBtn.offsetHeight;
    sendBtn.hidden = true;
    r.querySelector('[data-act]').addEventListener('click', function (e) {
      reset(e.currentTarget.getAttribute('data-act') === 'new');
    });

    if (!animate) { r.focus(); return; }
    // The button grows into the receipt, then its lines print in.
    var kids = r.children;
    gsap.set(kids, { autoAlpha: 0 });
    gsap.timeline({ onComplete: function () { r.style.width = r.style.height = ''; r.focus(); } })
      .fromTo(r, { width: btnW, height: btnH, rotation: -0.8 },
        { width: full.w, height: full.h, rotation: ok ? -1.2 : 1, duration: 0.55, ease: 'back.out(1.3)' })
      .to(kids, { autoAlpha: 1, y: 0, startAt: { y: 8 }, duration: 0.3, stagger: 0.08, ease: 'power2.out' }, '-=0.15')
      .fromTo(r.querySelector('.receipt__stamp'), { scale: 1.8, rotation: -14 }, { scale: 1, rotation: -6, duration: 0.3, ease: 'back.out(2)' }, '<');
  }

  function reset(clear) {
    var r = sendWrap.querySelector('.receipt');
    if (r) r.remove();
    sendBtn.hidden = false;
    gsap && gsap.set(sendBtn, { clearProps: 'transform' });
    note.style.visibility = '';
    if (clear) note.value = '';
    [nameEl, emailEl, note, sendBtn].forEach(function (el) { el.disabled = false; });
    busy = false;
    statusEl.textContent = '';
    note.focus();
  }

  // ---------- Submit ----------
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy || !validate()) return;
    busy = true;
    var data = {
      name: nameEl.value.trim(),
      email: emailEl.value.trim(),
      message: note.value.trim(),
      honey: form.elements._honey.value
    };
    [nameEl, emailEl, note, sendBtn].forEach(function (el) { el.disabled = true; });
    statusEl.textContent = 'Sending your note…';
    var result = send(data);

    if (!gsap || reduced()) {
      result.then(function (o) { openReceipt(o.ok, data, o.reason, false); });
      return;
    }

    printSheet(data.message)
      .then(foldPlane)
      .then(fly)
      .then(gulp)
      .then(function () { return result; })
      .then(function (o) { openReceipt(o.ok, data, o.reason, true); })
      .catch(function () { result.then(function (o) { openReceipt(o.ok, data, o.reason, false); }); });
  });
})();
