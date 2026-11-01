/*
 * Project cards: a mouse-driven 3D tilt, and a details popup built on <dialog>.
 *
 * Opening zooms the card into the popup: the card's picture and title fly to their places
 * in the popup while the paper grows out of the card. Closing runs the same thing backwards.
 * The flying picture and title are copies kept in a layer of their own, because the real
 * ones sit inside a scrolling panel that would clip them. Without GSAP, or when the system
 * asks for reduced motion, the popup simply appears and disappears.
 */
(function () {
  'use strict';

  var dialog = document.getElementById('projectModal');
  var cards = document.querySelectorAll('.card3d');
  if (!dialog || !cards.length) return;

  var gsap = window.gsap;
  var body = document.getElementById('modalBody');
  var panel = dialog.querySelector('.modal__panel');
  var bar = dialog.querySelector('.modal__bar');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var current = null;   // the card that is open
  var busy = false;     // a zoom is running
  var ghosts = [];

  var DURATION = 0.7;
  var EASE = 'power3.inOut';

  function animated() { return !!gsap && !reduced.matches; }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  function flatten(card) {
    card.classList.remove('is-hover');
    card.querySelector('.card3d__inner').style.transform = '';
  }

  // Where the card's picture and title are on screen right now (tilt and lift included).
  function sourceOf(card) {
    var pic = card.querySelector('.card3d__pic');
    var title = card.querySelector('.card3d__title');
    var tr = rectOf(title);
    var k = tr.width / title.offsetWidth || 1;
    var cs = getComputedStyle(title);
    return {
      box: rectOf(card),
      pic: rectOf(pic),
      imgSrc: pic.querySelector('img').getAttribute('src'),
      title: tr,
      text: title.textContent.trim(),
      fontSize: parseFloat(cs.fontSize) * k,
      lineHeight: parseFloat(cs.lineHeight) * k
    };
  }

  // Where they belong inside the popup. Measure with the panel at rest (no transform on it).
  function targetOf() {
    var title = document.getElementById('modalTitle');
    var cs = getComputedStyle(title);
    return {
      pic: body.querySelector('.modal__pic'),
      title: title,
      picRect: rectOf(body.querySelector('.modal__pic')),
      titleRect: rectOf(title),
      fontSize: parseFloat(cs.fontSize),
      lineHeight: parseFloat(cs.lineHeight)
    };
  }

  function makeGhosts(src) {
    var pic = document.createElement('div');
    pic.className = 'modal__pic ghost';
    pic.setAttribute('aria-hidden', 'true');
    var img = document.createElement('img');
    img.src = src.imgSrc;
    img.alt = '';
    pic.appendChild(img);

    var title = document.createElement('div');
    title.className = 'modal__title ghost';
    title.setAttribute('aria-hidden', 'true');
    title.textContent = src.text;

    dialog.appendChild(pic);
    dialog.appendChild(title);
    ghosts = [pic, title];
    return { pic: pic, title: title };
  }

  function dropGhosts() {
    ghosts.forEach(function (g) { g.remove(); });
    ghosts = [];
  }

  function placePic(g, r) { gsap.set(g, { left: r.left, top: r.top, width: r.width }); }
  function placeTitle(g, r, fontSize, lineHeight) {
    // a hair of slack so the lines wrap the same way as the real text
    gsap.set(g, { left: r.left, top: r.top, width: r.width + 2, fontSize: fontSize, lineHeight: lineHeight + 'px' });
  }

  // The panel's own box grows out of (or shrinks back into) the card. Its content is invisible
  // while it moves, so stretching it unevenly never shows.
  function panelFrom(box, p) {
    return {
      x: box.left - p.left, y: box.top - p.top,
      scaleX: box.width / p.width, scaleY: box.height / p.height,
      transformOrigin: '0 0'
    };
  }
  var PANEL_REST = { x: 0, y: 0, scaleX: 1, scaleY: 1 };

  function others() {
    return Array.prototype.filter.call(body.children, function (el) {
      return !el.classList.contains('modal__pic') && el.id !== 'modalTitle';
    });
  }

  function reset() {
    gsap && gsap.killTweensOf([panel, bar].concat(ghosts, Array.prototype.slice.call(body.children)));
    gsap && gsap.set([panel, bar].concat(Array.prototype.slice.call(body.children)), { clearProps: 'all' });
    dropGhosts();
    dialog.classList.remove('is-closing');
    busy = false;
  }

  // ---------- Open ----------
  function open(card) {
    var tpl = document.getElementById('detail-' + card.dataset.project);
    if (!tpl || typeof dialog.showModal !== 'function' || busy) return;
    current = card;
    body.replaceChildren(tpl.content.cloneNode(true));

    var src = animated() ? sourceOf(card) : null;   // measure before the tilt is cleared
    flatten(card);
    dialog.showModal();
    panel.scrollTop = 0;
    if (!src) return;

    try { zoomIn(card, src); } catch (err) { reset(); card.classList.remove('is-flying'); }
  }

  function zoomIn(card, src) {
    busy = true;
    var dst = targetOf();
    var rest = others();
    var p = panel.getBoundingClientRect();
    var g = makeGhosts(src);

    card.classList.add('is-flying');
    gsap.set([dst.pic, dst.title], { opacity: 0 });
    gsap.set(rest, { opacity: 0, y: 18 });
    gsap.set(bar, { opacity: 0 });
    gsap.set(panel, panelFrom(src.box, p));
    placePic(g.pic, src.pic);
    placeTitle(g.title, src.title, src.fontSize, src.lineHeight);

    var tl = gsap.timeline({
      defaults: { duration: DURATION, ease: EASE },
      onComplete: function () {
        gsap.set([dst.pic, dst.title].concat(rest, [bar, panel]), { clearProps: 'all' });
        dropGhosts();
        card.classList.remove('is-flying');
        busy = false;
      }
    });
    tl.to(panel, PANEL_REST, 0)
      .to(g.pic, { left: dst.picRect.left, top: dst.picRect.top, width: dst.picRect.width }, 0)
      .to(g.title, {
        left: dst.titleRect.left, top: dst.titleRect.top, width: dst.titleRect.width + 2,
        fontSize: dst.fontSize, lineHeight: dst.lineHeight + 'px'
      }, 0)
      .to(rest, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.06 }, DURATION * 0.72)
      .to(bar, { opacity: 1, duration: 0.3, ease: 'power2.out' }, DURATION * 0.8);
  }

  // ---------- Close ----------
  function requestClose() {
    if (!dialog.open || busy) return;
    var card = current;
    if (!card || !animated() || panel.scrollTop > 40) { dialog.close(); return; }

    try { zoomOut(card); } catch (err) { reset(); dialog.close(); }
  }

  function zoomOut(card) {
    busy = true;
    var dst = targetOf();                 // where the picture and title are now
    var src = sourceOf(card);             // where they have to go back to
    var rest = others();
    var p = panel.getBoundingClientRect();
    var g = makeGhosts(src);

    gsap.set([dst.pic, dst.title], { opacity: 0 });
    placePic(g.pic, dst.picRect);
    placeTitle(g.title, dst.titleRect, dst.fontSize, dst.lineHeight);
    card.classList.add('is-flying');
    dialog.classList.add('is-closing');

    var tl = gsap.timeline({
      defaults: { duration: DURATION, ease: EASE },
      onComplete: function () {
        card.classList.remove('is-flying');
        dropGhosts();
        dialog.close();
      }
    });
    tl.to(rest, { opacity: 0, duration: 0.2, ease: 'power1.in' }, 0)
      .to(bar, { opacity: 0, duration: 0.2, ease: 'power1.in' }, 0)
      .to(panel, Object.assign({ duration: DURATION * 0.85 }, panelFrom(src.box, p)), DURATION * 0.15)
      .to(g.pic, { left: src.pic.left, top: src.pic.top, width: src.pic.width }, 0)
      .to(g.title, {
        left: src.title.left, top: src.title.top, width: src.title.width + 2,
        fontSize: src.fontSize, lineHeight: src.lineHeight + 'px'
      }, 0);
  }

  // ---------- Cards ----------
  cards.forEach(function (card) {
    var inner = card.querySelector('.card3d__inner');

    card.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'touch' || reduced.matches || busy) return;
      card.classList.add('is-hover');
    });
    card.addEventListener('pointermove', function (e) {
      if (!card.classList.contains('is-hover')) return;
      var r = card.getBoundingClientRect();
      var x = (e.clientX - r.left - r.width / 2) / 25;
      var y = (e.clientY - r.top - r.height / 2) / 25;
      inner.style.transform = 'rotateY(' + x.toFixed(2) + 'deg) rotateX(' + y.toFixed(2) + 'deg)';
    });
    card.addEventListener('pointerleave', function () { flatten(card); });

    // Anywhere on the card opens the details, except the link button, which goes to the project.
    // The title is a real button, so keyboard users get the same thing with Enter or Space.
    card.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;
      open(card);
    });
  });

  document.getElementById('modalClose').addEventListener('click', requestClose);

  // The dialog fills the viewport, so a click that lands on it directly is a click outside the panel.
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) requestClose();
  });

  // Esc: run the zoom-out instead of the instant close.
  dialog.addEventListener('cancel', function (e) {
    if (animated()) { e.preventDefault(); requestClose(); }
  });

  dialog.addEventListener('close', function () {
    if (gsap) reset(); else dialog.classList.remove('is-closing');
    body.replaceChildren();
    cards.forEach(function (c) { c.classList.remove('is-flying'); flatten(c); });
    if (current) current.querySelector('.card3d__open').focus({ preventScroll: true });
    current = null;
  });
})();
