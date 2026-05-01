/* ═══════════════════════════════════════════════════════
   GROOM LAKE — Mobile Section Navigator
   Visible on ≤ 1100px (where sidenav-rail is hidden).
   Auto-reads data-sidenav-label from sections.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Only build on mobile/tablet — sidenav handles desktop */
  if (window.innerWidth > 1100) return;

  /* Gather sections */
  var sections = Array.from(
    document.querySelectorAll('[data-sidenav-label]')
  ).filter(function (el) { return el.id; });

  if (!sections.length) return;

  /* ── Build DOM ─────────────────────────────────────── */
  var btn = document.createElement('button');
  btn.id = 'gl-mob-nav-btn';
  btn.className = 'gl-mob-nav-btn';
  btn.setAttribute('aria-label', 'Navigate page sections');
  btn.innerHTML =
    '<span class="gl-mob-nav-dot"></span>' +
    '<span class="gl-mob-nav-label">// NAV</span>';

  var panel = document.createElement('div');
  panel.id = 'gl-mob-nav-panel';
  panel.className = 'gl-mob-nav-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Page sections');

  var header = document.createElement('div');
  header.className = 'gl-mob-nav-header';
  header.innerHTML =
    '<span class="gl-mob-nav-title">// PAGE SECTIONS</span>' +
    '<button class="gl-mob-nav-close" id="gl-mob-nav-close" aria-label="Close">&#x2715;</button>';

  var list = document.createElement('ul');
  list.className = 'gl-mob-nav-list';

  sections.forEach(function (sec, i) {
    var label = sec.dataset.sidenavLabel || sec.id.replace(/-/g, ' ').toUpperCase();
    var li = document.createElement('li');
    li.className = 'gl-mob-nav-item';
    var a = document.createElement('a');
    a.href = '#' + sec.id;
    a.className = 'gl-mob-nav-link';
    a.dataset.target = sec.id;
    a.innerHTML =
      '<span class="gl-mob-nav-num">' + (i + 1).toString().padStart(2, '0') + '</span>' +
      '<span class="gl-mob-nav-name">' + label + '</span>' +
      '<span class="gl-mob-nav-arrow">→</span>';
    a.addEventListener('click', closePanel);
    li.appendChild(a);
    list.appendChild(li);
  });

  panel.appendChild(header);
  panel.appendChild(list);
  document.body.appendChild(btn);
  document.body.appendChild(panel);

  /* ── Backdrop ──────────────────────────────────────── */
  var backdrop = document.createElement('div');
  backdrop.className = 'gl-mob-nav-backdrop';
  backdrop.addEventListener('click', closePanel);
  document.body.appendChild(backdrop);

  /* ── Toggle logic ──────────────────────────────────── */
  function openPanel() {
    panel.classList.add('open');
    backdrop.classList.add('open');
    btn.classList.add('panel-open');
  }

  function closePanel() {
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    btn.classList.remove('panel-open');
  }

  btn.addEventListener('click', function () {
    if (panel.classList.contains('open')) {
      closePanel();
    } else {
      openPanel();
    }
  });

  document.getElementById('gl-mob-nav-close').addEventListener('click', closePanel);

  /* ESC to close */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePanel();
  });

  /* ── Active section tracking ───────────────────────── */
  var links = Array.from(list.querySelectorAll('.gl-mob-nav-link'));

  function setActive(id) {
    links.forEach(function (a) {
      var active = a.dataset.target === id;
      a.classList.toggle('active', active);
    });
    /* Update button indicator */
    var activeLink = list.querySelector('.gl-mob-nav-link.active .gl-mob-nav-name');
    if (activeLink) {
      btn.querySelector('.gl-mob-nav-label').textContent = '// ' + activeLink.textContent;
    }
  }

  var ratios = {};
  sections.forEach(function (sec) { ratios[sec.id] = 0; });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { ratios[e.target.id] = e.intersectionRatio; });
    var best = null, bestR = -1;
    Object.keys(ratios).forEach(function (id) {
      if (ratios[id] > bestR) { bestR = ratios[id]; best = id; }
    });
    if (best && bestR > 0) setActive(best);
  }, { threshold: [0, 0.1, 0.25, 0.5], rootMargin: '-60px 0px -30% 0px' });

  sections.forEach(function (sec) { io.observe(sec); });

  /* ── Hide button during scroll, show when still ────── */
  var scrollTimer;
  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    btn.classList.add('scrolling');
    scrollTimer = setTimeout(function () {
      btn.classList.remove('scrolling');
    }, 600);
  }, { passive: true });

})();
