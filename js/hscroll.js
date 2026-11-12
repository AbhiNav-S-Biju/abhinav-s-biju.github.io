/*
 * Projects as a pinned horizontal scroll.
 *
 * While the section is pinned, vertical scrolling drives one long timeline: a project card
 * sits in the middle, opens into its details, closes again, and the row slides sideways to
 * the next card. Scrolling back up plays it in reverse.
 *
 * The cards are copies of the ones in the plain grid, and the details are built from the same
 * <template>s the popup uses, so each project is written once. The plain grid stays in the page
 * as the fallback (no JS, reduced motion, very short screens) and is hidden when this takes over.
 */
(function () {
  'use strict';

  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var fallback = document.getElementById('projects');
  if (!gsap || !ST || !fallback) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.innerHeight < 520) return;
  gsap.registerPlugin(ST);

  var cards = fallback.querySelectorAll('.pcard');
  if (!cards.length) return;
  var n = cards.length;

  // Max bullets shown in the pinned view; the popup shows them all.
  var BULLETS = 4;

  // ---------- Build ----------
  var section = document.createElement('section');
  section.className = 'hscroll';
  section.setAttribute('aria-labelledby', 'projects-title-h');
  section.innerHTML =
    '<div class="hscroll__pin">' +
      '<div class="hscroll__top">' +
        '<h2 class="heading" id="projects-title-h"><span class="marker"><span class="hscroll__full">Things I\'ve built</span><span class="hscroll__short">My projects</span></span></h2>' +
        '<div class="hscroll__meta">' +
          '<div class="hscroll__nav" role="group" aria-label="Jump to a project"></div>' +
          '<span class="hscroll__count" aria-hidden="true"></span>' +
          '<button type="button" class="btn hscroll__skip" aria-label="Skip the projects and continue down the page">' +
            '<span class="hscroll__skip-long">Skip projects</span><span class="hscroll__skip-short">Skip</span> <span aria-hidden="true">↓</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="hscroll__view"><div class="hscroll__track"></div></div>' +
    '</div>';

  var track = section.querySelector('.hscroll__track');
  var dotsEl = section.querySelector('.hscroll__nav');
  var skipBtn = section.querySelector('.hscroll__skip');
  var countEl = section.querySelector('.hscroll__count');
  track.style.width = n * 100 + '%';

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // The pinned view has no room for a long intro: keep whole sentences until it is long enough.
  function shorten(text) {
    var sentences = text.trim().match(/[^.!?]+[.!?]+/g) || [text.trim()];
    var out = sentences[0];
    for (var i = 1; i < sentences.length && out.length < 110; i++) {
      if (out.length + sentences[i].length > 200) break;
      out += sentences[i];
    }
    return out.trim();
  }

  function buildSheet(id) {
    var tpl = document.getElementById('detail-' + id);
    if (!tpl) return null;
    var f = tpl.content;
    var title = f.querySelector('.modal__title');
    var lead = title && title.nextElementSibling;
    var img = f.querySelector('.modal__pic img');
    var links = f.querySelector('.modal__links');
    var stack = f.querySelector('.stack');
    var items = Array.prototype.slice.call(f.querySelectorAll('.checks li'), 0, BULLETS);

    var sheet = el('div', 'hsheet');
    var a = el('div', 'hsheet__col');
    var b = el('div', 'hsheet__col');

    var medal = f.querySelector('.modal__medal');
    if (medal) a.appendChild(el('p', 'hsheet__medal', medal.innerHTML));
    a.appendChild(el('p', 'hsheet__tag', f.querySelector('.modal__tag').innerHTML));
    a.appendChild(el('h3', 'hsheet__title', title.innerHTML));
    var pic = el('div', 'hsheet__pic');
    var im = document.createElement('img');
    im.src = img.getAttribute('src');
    im.alt = '';
    pic.appendChild(im);
    a.appendChild(pic);
    var l = el('div', 'hsheet__links', links.innerHTML);
    a.appendChild(l);

    if (lead) b.appendChild(el('p', 'hsheet__lead', shorten(lead.textContent)));
    var ul = el('ul', 'checks');
    items.forEach(function (li) { ul.appendChild(el('li', null, li.innerHTML)); });
    b.appendChild(ul);
    if (stack) b.appendChild(el('p', 'stack', stack.innerHTML));

    sheet.appendChild(a);
    sheet.appendChild(b);
    return sheet;
  }

  var panels = [];
  cards.forEach(function (pcard, i) {
    var panel = el('article', 'hpanel');
    panel.style.flex = '0 0 ' + 100 / n + '%';
    panel.setAttribute('data-index', i);

    var wrap = el('div', 'hpanel__card');
    var clone = pcard.cloneNode(true);
    clone.removeAttribute('style');            // the original may still carry its reveal opacity
    clone.querySelectorAll('img').forEach(function (im) { im.loading = 'eager'; });
    wrap.appendChild(clone);
    panel.appendChild(wrap);

    var sheet = buildSheet(clone.querySelector('.card3d').dataset.project);
    if (sheet) panel.appendChild(sheet);

    track.appendChild(panel);
    panels.push({ el: panel, card: wrap, sheet: sheet });

    var fullTitle = clone.querySelector('.card3d__open').textContent.trim();
    var label = clone.querySelector('.card3d').dataset.label || fullTitle.split(' ')[0];
    var pill = el('button', 'hscroll__pill',
      '<span class="hscroll__dot" aria-hidden="true"></span><span class="hscroll__label">' + label + '</span>');
    pill.type = 'button';
    pill.dataset.i = i;
    pill.setAttribute('aria-label', 'Go to ' + fullTitle);
    dotsEl.appendChild(pill);
  });

  fallback.parentNode.insertBefore(section, fallback);
  fallback.hidden = true;
  fallback.removeAttribute('id');
  section.id = 'projects';

  var dots = dotsEl.children;

  // ---------- Timeline ----------
  var T = { hold: 0.5, open: 0.7, read: 1.7, close: 0.7, slide: 1.2 };
  var starts = [];   // timeline time at which each project's card is centred

  gsap.set(panels.map(function (p) { return p.sheet; }), { autoAlpha: 0, scale: 0.72 });

  var tl = gsap.timeline({ defaults: { ease: 'none' }, paused: true });

  panels.forEach(function (p, i) {
    if (i > 0) {
      tl.to(track, { xPercent: -100 / n * i, duration: T.slide, ease: 'power2.inOut', immediateRender: false }, '>');
    }
    starts.push(tl.duration());
    tl.to({}, { duration: T.hold });

    // open: the card swells and fades while the details grow in behind it
    tl.to(p.card, { scale: 1.3, autoAlpha: 0, duration: T.open, ease: 'power2.in', immediateRender: false }, '>');
    tl.fromTo(p.sheet, { scale: 0.72, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: T.open, ease: 'power2.out', immediateRender: false }, '<+=' + T.open * 0.45);
    tl.to({}, { duration: T.read });

    // close: the details shrink away and the card comes back
    tl.to(p.sheet, { scale: 0.72, autoAlpha: 0, duration: T.close, ease: 'power2.in', immediateRender: false }, '>');
    tl.fromTo(p.card, { scale: 1.3, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: T.close, ease: 'power2.out', immediateRender: false }, '<+=' + T.close * 0.45);
  });
  tl.to({}, { duration: 0.4 });

  // ---------- Pin ----------
  var active = -1;
  function setActive(i) {
    if (i === active) return;
    active = i;
    panels.forEach(function (p, k) { p.el.inert = k !== i; });   // keep Tab inside the visible project
    for (var d = 0; d < dots.length; d++) {
      dots[d].classList.toggle('is-active', d === i);
      if (d === i) dots[d].setAttribute('aria-current', 'true'); else dots[d].removeAttribute('aria-current');
    }
    countEl.textContent = i + 1 + ' / ' + n;
  }
  setActive(0);

  // On the timeline itself, not the ScrollTrigger: with scrub smoothing the timeline lags the scroll.
  tl.eventCallback('onUpdate', function () {
    var t = tl.time(), idx = 0;
    for (var k = 0; k < starts.length; k++) if (t >= starts[k] - T.slide * 0.5) idx = k;
    setActive(idx);
  });

  var trig = ST.create({
    trigger: section,
    start: 'top top',
    end: function () { return '+=' + Math.round(tl.duration() * window.innerHeight * 0.4); },
    pin: true,
    scrub: 0.4,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    animation: tl
  });

  // ---------- Jump controls ----------
  function scrollTo(y) {
    if (window.portfolioScrollTo) window.portfolioScrollTo(y);
    else window.scrollTo(0, y);
  }
  function yForTime(t) { return trig.start + (t / tl.duration()) * (trig.end - trig.start); }

  // A project's name takes you to its card; "Skip" takes you past the whole pinned stretch.
  dotsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.hscroll__pill');
    if (b) scrollTo(yForTime(starts[+b.dataset.i] + T.hold * 0.5));
  });
  // Once the pin lets go the section scrolls away at its own height; that is where the next one begins.
  skipBtn.addEventListener('click', function () { scrollTo(trig.end + section.offsetHeight); });

  ST.config({ ignoreMobileResize: true });
  window.addEventListener('load', function () { ST.refresh(); });
})();
