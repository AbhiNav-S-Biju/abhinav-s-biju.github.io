(function () {
  'use strict';

  // Fill these in to show the matching contact buttons.
  var CONFIG = {
    email: 'abhinavbijusn@gmail.com',
    linkedin: 'https://www.linkedin.com/in/abhinav-s-biju-a8aa96331'
  };

  var root = document.documentElement;
  var page = document.getElementById('page');
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = function () { return motionQuery.matches; };
  var hasGsap = !!(window.gsap && window.ScrollTrigger);

  document.getElementById('year').textContent = new Date().getFullYear();

  // ---------- Contact ----------
  if (CONFIG.email) {
    var emailBtn = document.getElementById('emailBtn');
    emailBtn.href = 'mailto:' + CONFIG.email;
    emailBtn.hidden = false;
  }
  if (CONFIG.linkedin) {
    var li = document.getElementById('linkedinBtn');
    li.href = CONFIG.linkedin;
    li.hidden = false;
  }

  // ---------- Theme ----------
  var handle = document.getElementById('themeHandle');
  var label = document.getElementById('themeLabel');
  var srText = document.getElementById('themeSr');

  function currentTheme() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function otherTheme() { return currentTheme() === 'dark' ? 'light' : 'dark'; }

  function syncHandle() {
    var next = otherTheme();
    label.textContent = next === 'dark' ? 'night' : 'day';
    srText.textContent = 'Switch to ' + next + ' mode. You can also drag this handle across the page.';
  }

  function setTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) {}
    syncHandle();
  }
  syncHandle();

  function cssVar(el, name) { return getComputedStyle(el).getPropertyValue(name).trim(); }

  // ---------- Smooth scroll ----------
  var lenis = null;
  if (!reduced() && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
    if (hasGsap) {
      lenis.on('scroll', window.ScrollTrigger.update);
      // Pinning adds scroll length after Lenis measured the page; keep its limit in step.
      window.ScrollTrigger.addEventListener('refresh', function () { lenis.resize(); });
      window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      window.gsap.ticker.lagSmoothing(0);
    } else {
      var raf = function (time) { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  } else if (!reduced()) {
    root.style.scrollBehavior = 'smooth';
  }

  // Other scripts (the projects' jump buttons) scroll through this so Lenis stays in charge.
  window.portfolioScrollTo = function (y) {
    if (lenis) lenis.scrollTo(y, { duration: 1.3 });
    else window.scrollTo({ top: y, behavior: reduced() ? 'auto' : 'smooth' });
  };

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href');
    var target = id === '#top' ? document.body : document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(id === '#top' ? 0 : target, { offset: -64 });
    else window.scrollTo({ top: id === '#top' ? 0 : target.getBoundingClientRect().top + window.scrollY - 64 });
    if (target !== document.body) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });

  var nav = document.getElementById('nav');
  var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 10); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- Light / dark slider ----------
  new window.BendSlider({
    handle: handle,
    canvas: document.getElementById('spray'),
    reducedMotion: reduced,
    colors: function () {
      return [
        cssVar(root, '--dp-color-ink'),
        cssVar(root, '--dp-color-accent'),
        cssVar(root, '--dp-color-annotation'),
        '#e2c25a'
      ];
    },
    buildView: function (bleed) {
      // A copy of the page in the other theme, lined up with the current scroll.
      // The slider's layer reaches `bleed` px past the viewport, so the copy sits that far in.
      var clone = page.cloneNode(true);
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
      clone.querySelectorAll('img[loading="lazy"]').forEach(function (img) { img.loading = 'eager'; });
      clone.setAttribute('data-theme', otherTheme());
      // A pinned section is position:fixed; inside the offset copy it would land `bleed` px off.
      clone.querySelectorAll('[style*="position: fixed"]').forEach(function (el) {
        el.style.marginLeft = el.style.marginTop = bleed + 'px';
      });
      clone.style.left = bleed + 'px';
      clone.style.top = (bleed - window.scrollY) + 'px';
      clone.style.width = page.offsetWidth + 'px';
      return clone;
    },
    onStart: function () { if (lenis) lenis.stop(); },
    onEnd: function () { if (lenis) lenis.start(); },
    onCommit: function () { setTheme(otherTheme()); }
  });

  // ---------- Loader ----------
  var loader = document.getElementById('loader');
  var fill = document.getElementById('loaderFill');
  var count = document.getElementById('loaderCount');
  var heroImg = document.querySelector('.mount--photo img');
  var shown = 0, goal = 0, finished = false;
  var startedAt = performance.now();
  var MIN_MS = reduced() ? 0 : 1300;

  var tasks = [
    document.fonts ? document.fonts.ready : Promise.resolve(),
    heroImg.decode ? heroImg.decode().catch(function () {}) : Promise.resolve(),
    new Promise(function (r) { if (document.readyState !== 'loading') r(); else document.addEventListener('DOMContentLoaded', r); })
  ];
  var done = 0;
  tasks.forEach(function (p) { p.then(function () { done++; goal = done / tasks.length; }); });

  function loaderTick(now) {
    // The counter never runs ahead of real progress, or of the minimum time.
    var timeCap = MIN_MS ? Math.min(1, (now - startedAt) / MIN_MS) : 1;
    var aim = Math.min(goal, timeCap);
    shown += (aim - shown) * 0.12;
    if (aim - shown < 0.004) shown = aim;
    fill.style.setProperty('--p', shown.toFixed(3));
    count.textContent = Math.round(shown * 100);
    if (shown >= 1) return finishLoader();
    requestAnimationFrame(loaderTick);
  }
  requestAnimationFrame(loaderTick);
  setTimeout(function () { goal = 1; }, 3500); // never hang on a slow asset
  setTimeout(function () { finishLoader(); }, 5000); // or on paused animation frames

  function finishLoader() {
    if (finished) return;
    finished = true;
    loader.classList.add('is-done');
    loader.setAttribute('aria-busy', 'false');
    if (hasGsap && !reduced()) {
      window.gsap.to(loader, {
        yPercent: -100, duration: 0.8, ease: 'power3.inOut', delay: 0.15,
        onComplete: function () { loader.remove(); }
      });
      intro(0.45);
    } else {
      loader.remove();
    }
  }

  // ---------- Scroll animations ----------
  if (!hasGsap || reduced()) return;
  var gsap = window.gsap, ST = window.ScrollTrigger;
  gsap.registerPlugin(ST);

  // Hide hero pieces until the loader lifts.
  gsap.set(['.hero__hello', '.hero__title', '.hero__actions', '.hero__cluster > *', '.facts'], { autoAlpha: 0 });

  function intro(delay) {
    var tl = gsap.timeline({ delay: delay, defaults: { ease: 'power3.out' } });
    tl.fromTo('.hero__hello', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.6 })
      .fromTo('.hero__title', { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, duration: 0.9 }, '-=0.35')
      .fromTo('.hero__cluster > *', { autoAlpha: 0, y: 40 },
        { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.12 }, '-=0.6')
      .fromTo('.hero__actions', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.6 }, '-=0.5')
      .fromTo('.facts', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.6 }, '-=0.4');
  }

  // clamp() keeps triggers that are already past their start on load (the hero)
  // from jumping: progress starts at 0 instead of mid-way.
  gsap.to('.hero__statement', {
    y: -70, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'clamp(top top)', end: 'clamp(bottom top)', scrub: true }
  });
  gsap.to('.hero__cluster', {
    y: 50, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'clamp(top top)', end: 'clamp(bottom top)', scrub: true }
  });

  // Headings settle onto the page.
  gsap.utils.toArray('.heading').forEach(function (h) {
    gsap.from(h, {
      autoAlpha: 0, y: 30, rotate: -4, duration: 0.7, ease: 'power3.out',
      scrollTrigger: { trigger: h, start: 'clamp(top 88%)', toggleActions: 'play none none none' }
    });
  });

  // Highlighter sweeps across with the scroll.
  gsap.utils.toArray('.thoughts .hl').forEach(function (el) {
    gsap.fromTo(el, { '--hl': '0%' }, {
      '--hl': '100%', ease: 'none',
      scrollTrigger: { trigger: el, start: 'clamp(top 85%)', end: 'clamp(top 55%)', scrub: true }
    });
  });

  // Content drops in as it arrives.
  ST.batch('.thought, .process li, .ledger__row, .contact__actions', {
    start: 'clamp(top 90%)',
    onEnter: function (els) {
      gsap.fromTo(els, { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.08, overwrite: true });
    }
  });
  // opacity rather than autoAlpha: hidden-by-visibility links (contact) couldn't be reached with Tab
  gsap.set('.thought, .process li, .ledger__row, .contact__actions', { opacity: 0 });

  // Project cards spring up in turn. Opacity (not visibility) so they stay reachable by keyboard.
  ST.batch('.pcard', {
    start: 'top 90%',
    onEnter: function (els) {
      gsap.fromTo(els, { opacity: 0, y: 90 }, {
        opacity: 1, y: 0, duration: 0.85, ease: 'back.out(1.4)', stagger: 0.14,
        overwrite: true, clearProps: 'opacity,transform'
      });
    }
  });
  gsap.set('.pcard', { opacity: 0 });

  // The closing statement grows into place.
  gsap.fromTo('.contact__title', { scale: 0.86, autoAlpha: 0.2, transformOrigin: 'left center' }, {
    scale: 1, autoAlpha: 1, ease: 'none',
    scrollTrigger: { trigger: '.contact', start: 'clamp(top bottom)', end: 'clamp(top 40%)', scrub: true }
  });

  window.addEventListener('load', function () { ST.refresh(); });
})();
