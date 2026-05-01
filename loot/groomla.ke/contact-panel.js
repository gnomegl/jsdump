/**
 * GROOM LAKE — Contact Panel
 *
 * Left-side sliding contact panel triggered by any nav CONTACT link.
 * Self-contained: injects HTML, intercepts links, manages open/close,
 * handles the form submission, and traps focus for accessibility.
 *
 * Works on all pages — loaded universally alongside cursor.js.
 */
(function () {
  'use strict';

  // ── Panel HTML template ──────────────────────────────────────────────────
  // Form fields re-use the .cx-* classes from styles.css so they
  // inherit all existing contact form styling with no duplication.
  var PANEL_HTML = `
<div id="cp-backdrop" class="cp-backdrop" aria-hidden="true"></div>
<aside id="cp-panel" class="cp-panel" role="dialog" aria-modal="true"
       aria-label="Contact Groom Lake" tabindex="-1">
  <div class="cp-inner">

    <!-- Close control -->
    <div class="cp-topbar">
      <button class="cp-close" id="cp-close" aria-label="Close contact panel">
        <span aria-hidden="true">×</span>
        <span class="cp-close-esc" aria-hidden="true">ESC</span>
      </button>
    </div>

    <!-- Groom Lake emblem — first visual element inside the panel,
         above the eyebrow/heading. Sits inside .cp-inner so it
         translates with the panel's slide-in transform. Never the
         text wordmark — only the angular GL mark. -->
    <div class="cp-emblem" aria-hidden="true">
      <img src="/logo-black.svg" alt="">
    </div>

    <!-- Heading block -->
    <div class="cp-head">
      <div class="cp-eyebrow">// Secure Channel</div>
      <h2 class="cp-heading">Contact An<br>Operative.</h2>
    </div>

    <!-- Form area -->
    <div class="cp-form-area">

      <!-- Success state (shown after submission) -->
      <div id="cp-success" class="cp-success" hidden aria-live="polite">
        <div class="cp-success-check">✓</div>
        <div class="cp-success-title">Request Transmitted</div>
        <p class="cp-success-text">
          Secure channel established. Our team will contact you within 24 hours.<br>
          Reference: <span id="cp-ref">—</span>
        </p>
        <button class="cp-success-close btn btn-secondary" type="button" id="cp-success-close">
          Close Channel
        </button>
      </div>

      <!-- Contact form -->
      <form class="cp-form" id="cp-form" novalidate>

        <div class="cx-form-row">
          <div class="cx-field">
            <label class="cx-label" for="cp-first">First Name</label>
            <input id="cp-first" type="text" class="cx-input" name="firstName"
                   placeholder="—" required autocomplete="given-name">
          </div>
          <div class="cx-field">
            <label class="cx-label" for="cp-last">Last Name</label>
            <input id="cp-last" type="text" class="cx-input" name="lastName"
                   placeholder="—" required autocomplete="family-name">
          </div>
        </div>

        <div class="cx-field">
          <label class="cx-label" for="cp-email">Email Address</label>
          <input id="cp-email" type="email" class="cx-input" name="email"
                 placeholder="operator@secure.com" required autocomplete="email">
        </div>

        <div class="cx-form-row">
          <div class="cx-field">
            <label class="cx-label" for="cp-org">Organization / Protocol</label>
            <input id="cp-org" type="text" class="cx-input" name="organization"
                   placeholder="—" autocomplete="organization">
          </div>
          <div class="cx-field">
            <label class="cx-label" for="cp-contact">Telegram / Signal / Preferred</label>
            <input id="cp-contact" type="text" class="cx-input" name="preferredContact"
                   placeholder="@handle">
          </div>
        </div>

        <div class="cx-field">
          <label class="cx-label" for="cp-message">Message / Brief</label>
          <textarea id="cp-message" class="cx-input cx-textarea" name="message"
                    placeholder="Describe your situation or inquiry. All details are confidential and covered by our operational security protocols."></textarea>
        </div>

        <div class="cx-submit-row">
          <button type="submit" class="btn btn-primary" id="cp-submit">
            Transmit Request
          </button>
          <div class="cx-submit-note">// Encrypted · 24H Response · Confidential</div>
        </div>

        <div class="cx-calendly-row">
          <div class="cx-calendly-divider"><span>// Or</span></div>
          <button type="button" id="cp-book-call-btn" class="btn btn-secondary cx-calendly-btn">
            Schedule a Call
          </button>
          <div class="cx-submit-note">// Book a 30-min sync directly with an operative</div>
          <div id="cp-book-call-warning" class="cx-schedule-warning" role="alert" aria-live="polite">
            // Please complete your contact details before scheduling a call.
          </div>
        </div>

      </form>
    </div><!-- /cp-form-area -->

  </div><!-- /cp-inner -->
</aside><!-- /cp-panel -->
`;

  // ── State ────────────────────────────────────────────────────────────────
  var backdrop, panel, closeBtn, form, successEl, submitBtn;
  var isOpen = false;
  var returnFocus = null;

  // ── Inject into DOM ──────────────────────────────────────────────────────
  function inject() {
    var wrap = document.createElement('div');
    wrap.id = 'cp-root';
    // aria-hidden managed by openPanel/closePanel
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = PANEL_HTML;
    document.body.appendChild(wrap);

    backdrop  = document.getElementById('cp-backdrop');
    panel     = document.getElementById('cp-panel');
    closeBtn  = document.getElementById('cp-close');
    form      = document.getElementById('cp-form');
    successEl = document.getElementById('cp-success');
    submitBtn = document.getElementById('cp-submit');
  }

  // ── Open ─────────────────────────────────────────────────────────────────
  function openPanel(triggerEl) {
    if (isOpen) return;
    isOpen = true;
    returnFocus = triggerEl || document.activeElement;

    document.getElementById('cp-root').removeAttribute('aria-hidden');
    backdrop.classList.add('cp-open');
    panel.classList.add('cp-open');
    document.body.classList.add('cp-body-open');

    // Focus first text input after slide-in settles
    setTimeout(function () {
      var first = panel.querySelector(
        'input:not([type="checkbox"]):not([type="radio"]):not([disabled]), textarea'
      );
      if (first) first.focus();
    }, 430);
  }

  // ── Close ────────────────────────────────────────────────────────────────
  function closePanel() {
    if (!isOpen) return;
    isOpen = false;

    backdrop.classList.remove('cp-open');
    panel.classList.remove('cp-open');
    document.body.classList.remove('cp-body-open');
    document.getElementById('cp-root').setAttribute('aria-hidden', 'true');

    if (returnFocus && returnFocus.focus) returnFocus.focus();
    returnFocus = null;
  }

  // ── Focus trap ───────────────────────────────────────────────────────────
  function trapFocus(e) {
    if (!isOpen || e.key !== 'Tab') return;
    var focusable = Array.from(panel.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) {
      return !el.closest('[hidden]');
    });
    if (!focusable.length) return;
    var first = focusable[0];
    var last  = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  }

  // ── Form submission ──────────────────────────────────────────────────────
  function initFormHandler() {
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitBtn.textContent = 'Transmitting...';
      submitBtn.disabled = true;

      if (!window.GLHubSpot) { resetSubmit('Form system not loaded. Please refresh.'); return; }

      var fields = {
        firstname:                document.getElementById('cp-first')  ? document.getElementById('cp-first').value.trim()   : '',
        lastname:                 document.getElementById('cp-last')   ? document.getElementById('cp-last').value.trim()    : '',
        email:                    document.getElementById('cp-email')  ? document.getElementById('cp-email').value.trim()   : '',
        company:                  document.getElementById('cp-org')    ? document.getElementById('cp-org').value.trim()     : '',
        telegram_discord_handle:  document.getElementById('cp-contact')? document.getElementById('cp-contact').value.trim() : '',
        message:                  document.getElementById('cp-message')? document.getElementById('cp-message').value.trim() : ''
      };

      GLHubSpot.submit(GLHubSpot.FORMS.contact, fields, { pageName: 'Contact Panel' })
        .then(function () {
          showSuccess();
        })
        .catch(function () {
          resetSubmit('Submission failed. Please try again.');
        });
    });

    // Success close button
    var successCloseBtn = document.getElementById('cp-success-close');
    if (successCloseBtn) {
      successCloseBtn.addEventListener('click', closePanel);
    }
  }

  function showSuccess() {
    form.style.display = 'none';
    var ref = 'GL-' + Date.now().toString(36).toUpperCase();
    document.getElementById('cp-ref').textContent = ref;
    successEl.removeAttribute('hidden');
    // Focus success region
    successEl.focus && successEl.focus();
  }

  function resetSubmit(errMsg) {
    submitBtn.textContent = 'Transmit Request';
    submitBtn.disabled = false;
    var existing = form.querySelector('.cx-form-error');
    if (existing) existing.remove();
    if (errMsg) {
      var el = document.createElement('p');
      el.className = 'cx-form-error';
      el.textContent = errMsg;
      var submitRow = form.querySelector('.cx-submit-row');
      if (submitRow) submitRow.insertAdjacentElement('beforebegin', el);
    }
  }

  // ── Intercept contact nav links ──────────────────────────────────────────
  function interceptLinks() {
    document.querySelectorAll(
      'a[href="/contact.html"], a[href="contact.html"]'
    ).forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();

        // If mobile menu is open, close it cleanly first
        var mobileMenu    = document.getElementById('mobileMenu');
        var mobileOverlay = document.getElementById('mobileOverlay');
        if (mobileMenu && mobileMenu.classList.contains('open')) {
          mobileMenu.classList.remove('open');
          if (mobileOverlay) mobileOverlay.classList.remove('open');
          // Brief delay lets mobile menu finish closing before panel opens
          setTimeout(function () { openPanel(link); }, 80);
          return;
        }

        openPanel(link);
      });
    });
  }

  // ── Events ───────────────────────────────────────────────────────────────
  function bindEvents() {
    // Backdrop click closes
    backdrop.addEventListener('click', closePanel);

    // Close button
    closeBtn.addEventListener('click', closePanel);

    // Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) { e.preventDefault(); closePanel(); }
      trapFocus(e);
    });
  }

  // ── Calendly lazy loader ─────────────────────────────────────────────────
  function loadCalendly(cb) {
    if (window.Calendly) { cb(); return; }
    // Load CSS once
    if (!document.getElementById('calendly-css')) {
      var link = document.createElement('link');
      link.id  = 'calendly-css';
      link.rel = 'stylesheet';
      link.href = 'https://assets.calendly.com/assets/external/widget.css';
      document.head.appendChild(link);
    }
    // Load JS once
    if (!document.getElementById('calendly-js')) {
      var script    = document.createElement('script');
      script.id     = 'calendly-js';
      script.src    = 'https://assets.calendly.com/assets/external/widget.js';
      script.async  = true;
      script.onload = cb;
      document.head.appendChild(script);
    }
  }

  function initCalendlyButton() {
    var btn  = document.getElementById('cp-book-call-btn');
    var warn = document.getElementById('cp-book-call-warning');
    if (!btn) return;

    // Required-for-scheduling fields.
    var REQUIRED = ['cp-first', 'cp-last', 'cp-email', 'cp-org'];
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function checkField(id) {
      var el = document.getElementById(id);
      if (!el) return { el: null, bad: false };
      var v = (el.value || '').trim();
      var bad = !v || (id === 'cp-email' && !EMAIL_RE.test(v));
      return { el: el, bad: bad };
    }

    function validate() {
      var firstMissing = null;
      var anyBad = false;
      REQUIRED.forEach(function (id) {
        var r = checkField(id);
        if (!r.el) return;
        r.el.classList.toggle('cx-input--invalid', r.bad);
        if (r.bad) {
          anyBad = true;
          if (!firstMissing) firstMissing = r.el;
        }
      });
      return { ok: !anyBad, firstMissing: firstMissing };
    }

    // Clear invalid highlight + warning as the user fills fields.
    REQUIRED.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        el.classList.remove('cx-input--invalid');
        var allGood = REQUIRED.every(function (rid) { return !checkField(rid).bad; });
        if (allGood && warn) warn.classList.remove('visible');
      });
    });

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var res = validate();
      if (!res.ok) {
        if (warn) warn.classList.add('visible');
        if (res.firstMissing) {
          try { res.firstMissing.focus({ preventScroll: false }); } catch (err) { res.firstMissing.focus(); }
          res.firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      if (warn) warn.classList.remove('visible');
      loadCalendly(function () {
        Calendly.initPopupWidget({ url: 'https://calendly.com/cerberus-groomlake/sync' });
      });
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    inject();
    bindEvents();
    interceptLinks();
    initFormHandler();
    initCalendlyButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
