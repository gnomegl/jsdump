/**
 * GROOM LAKE — Page Transition System
 *
 * Standard pages : horizontal strip sweep (alternating blinds).
 * Reaper page    : tactical canvas scan — red scan line, raster, grid, micro-text.
 *
 * Standard flow OUT : click → strips close (alternating) → navigate
 * Standard flow IN  : head script hides body → strips cover → body unhidden → strips open
 *
 * Reaper flow OUT   : canvas scan covers page top→bottom → navigate (sets gl-pt-reaper)
 * Reaper flow IN    : canvas scan reveals Reaper page top→bottom → canvas removed
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // STANDARD STRIP TRANSITION
  // ─────────────────────────────────────────────────────────────────────────
  var NUM_STRIPS = 8;
  var SWEEP_DUR  = 300;
  var STAGGER    = 52;
  var TOTAL      = SWEEP_DUR + STAGGER * (NUM_STRIPS - 1); // ≈ 664ms

  function buildOverlay() {
    if (document.getElementById('pt-overlay')) return;
    var ov = document.createElement('div');
    ov.id = 'pt-overlay';
    for (var i = 0; i < NUM_STRIPS; i++) {
      var strip = document.createElement('div');
      strip.className = 'pt-strip';
      var pct = 100 / NUM_STRIPS;
      strip.style.height    = (pct + 0.3) + '%';
      strip.style.top       = (i * pct) + '%';
      strip.style.transform = (i % 2 === 0) ? 'translateX(-100%)' : 'translateX(100%)';
      ov.appendChild(strip);
    }
    document.body.appendChild(ov);
  }

  function sweepIn(onDone) {
    var strips = document.querySelectorAll('.pt-strip');
    strips.forEach(function (strip, i) {
      strip.style.transition = 'transform ' + SWEEP_DUR + 'ms cubic-bezier(0.55,0,0.45,1) ' + (i * STAGGER) + 'ms';
      strip.style.transform  = 'translateX(0)';
    });
    setTimeout(onDone, TOTAL + 40);
  }

  function sweepOut(onComplete) {
    var strips = document.querySelectorAll('.pt-strip');
    var n = strips.length;
    strips.forEach(function (strip, i) {
      var delay = (n - 1 - i) * STAGGER;
      var exit  = (i % 2 === 0) ? 'translateX(100%)' : 'translateX(-100%)';
      strip.style.transition = 'transform ' + SWEEP_DUR + 'ms cubic-bezier(0.22,1,0.36,1) ' + delay + 'ms';
      strip.style.transform  = exit;
    });
    setTimeout(function () {
      var ov = document.getElementById('pt-overlay');
      if (ov) ov.style.display = 'none';
      if (onComplete) onComplete();
    }, TOTAL + 80);
  }

  function coverInstant() {
    var strips = document.querySelectorAll('.pt-strip');
    strips.forEach(function (strip) {
      strip.style.transition = 'none';
      strip.style.transform  = 'translateX(0)';
    });
  }

  function removeHeadCover() {
    var el = document.getElementById('gl-cover');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TACTICAL CANVAS SCAN — shared draw utilities
  // ─────────────────────────────────────────────────────────────────────────

  var SCAN_LABELS = [
    'REAPER ACTIVE',
    'SCAN INIT',
    'TARGET SURFACE MAP',
    'RECON PASS',
    'SYS AUTH',
    'GL-7741-COSMIC'
  ];

  // Pre-assign x positions so they don't jump between frames
  function buildLabelSet(W) {
    return SCAN_LABELS.map(function (text, i) {
      return {
        text:  text,
        x:     40 + Math.floor(Math.random() * (W - 280)),
        zone:  (i / SCAN_LABELS.length) * 0.9 + 0.05, // 0..1 fraction of H
        phase: Math.random() * Math.PI * 2
      };
    });
  }

  /**
   * Draw one frame of the tactical scan.
   *
   * mode      : 'cover'  — dark region is ABOVE scanY  (departure)
   *           : 'reveal' — dark region is BELOW scanY  (arrival)
   * scanY     : current leading edge in px
   * W, H      : viewport dimensions
   * labels    : array from buildLabelSet()
   * ts        : timestamp for flicker
   */
  function drawScanFrame(ctx, mode, scanY, W, H, labels, ts) {
    ctx.clearRect(0, 0, W, H);

    var darkTop, darkH;
    if (mode === 'cover') {
      darkTop = 0;
      darkH   = Math.max(0, scanY - 1);
    } else {
      darkTop = Math.min(H, scanY + 1);
      darkH   = Math.max(0, H - darkTop);
    }

    if (darkH > 0) {
      // ── Layer A: solid dark fill ─────────────────────────────────────────
      ctx.fillStyle = 'rgba(3, 3, 3, 0.97)';
      ctx.fillRect(0, darkTop, W, darkH);

      // ── Layer C: fine horizontal raster lines (CRT / surveillance feel) ──
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = '#0f1f0f';
      for (var ry = darkTop; ry < darkTop + darkH; ry += 3) {
        ctx.fillRect(0, ry, W, 1);
      }
      ctx.restore();

      // ── Layer C: subtle grid ─────────────────────────────────────────────
      ctx.save();
      ctx.globalAlpha = 0.055;
      ctx.strokeStyle = '#1e3220';
      ctx.lineWidth = 0.5;
      for (var gy = darkTop; gy < darkTop + darkH; gy += 44) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }
      for (var gx = 0; gx < W; gx += 64) {
        ctx.beginPath(); ctx.moveTo(gx, darkTop); ctx.lineTo(gx, darkTop + darkH); ctx.stroke();
      }
      ctx.restore();
    }

    // ── Layer D: trailing red glow (just behind the scan line) ───────────
    var trailLen = 70;
    var trailStartY = mode === 'cover'
      ? Math.max(0, scanY - trailLen)
      : scanY;
    var trailEndY = mode === 'cover'
      ? scanY
      : Math.min(H, scanY + trailLen);

    if (trailEndY > trailStartY) {
      var trailGrad = ctx.createLinearGradient(0, trailStartY, 0, trailEndY);
      if (mode === 'cover') {
        trailGrad.addColorStop(0, 'rgba(180, 0, 0, 0)');
        trailGrad.addColorStop(1, 'rgba(200, 0, 0, 0.09)');
      } else {
        trailGrad.addColorStop(0, 'rgba(200, 0, 0, 0.09)');
        trailGrad.addColorStop(1, 'rgba(180, 0, 0, 0)');
      }
      ctx.fillStyle = trailGrad;
      ctx.fillRect(0, trailStartY, W, trailEndY - trailStartY);
    }

    // ── Layer B: red scan line (multi-layer glow, no shadowBlur) ─────────
    var lineY = Math.round(scanY);

    // Wide soft halo
    ctx.fillStyle = 'rgba(230, 0, 0, 0.07)';
    ctx.fillRect(0, lineY - 7, W, 14);

    // Mid glow
    ctx.fillStyle = 'rgba(230, 0, 0, 0.18)';
    ctx.fillRect(0, lineY - 4, W, 8);

    // Inner glow
    ctx.fillStyle = 'rgba(230, 0, 0, 0.40)';
    ctx.fillRect(0, lineY - 2, W, 4);

    // Hard core line
    ctx.fillStyle = '#E60000';
    ctx.fillRect(0, lineY - 1, W, 2);

    // Bright center specular
    ctx.fillStyle = 'rgba(255, 80, 80, 0.75)';
    ctx.fillRect(0, lineY, W, 1);

    // ── Edge brackets ────────────────────────────────────────────────────
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#E60000';
    // Left
    ctx.fillRect(0,  lineY - 8, 28, 1);
    ctx.fillRect(0,  lineY + 6, 18, 1);
    ctx.fillRect(0,  lineY - 8, 1,  14);
    // Right
    ctx.fillRect(W - 28, lineY - 8, 28, 1);
    ctx.fillRect(W - 18, lineY + 6, 18, 1);
    ctx.fillRect(W - 1,  lineY - 8, 1,  14);
    ctx.restore();

    // ── Layer E: micro-text tactical labels ───────────────────────────────
    ctx.save();
    ctx.font = '500 8px "JetBrains Mono", monospace';
    ctx.textBaseline = 'bottom';

    labels.forEach(function (lp, idx) {
      var zoneY   = lp.zone * H;
      var dist    = Math.abs(scanY - zoneY);
      var window_ = 90;
      if (dist > window_) return;

      var proximity = 1 - dist / window_;
      // Flicker: fast enough to feel electronic, slow enough to read
      var flicker = 0.55 + 0.45 * Math.sin(ts * 0.016 + lp.phase);
      var alpha   = proximity * flicker * 0.50;

      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle   = '#E60000';

      var offsetY = (idx % 3 === 0) ? -14 : (idx % 3 === 1) ? -6 : -22;
      ctx.fillText(lp.text, lp.x, lineY + offsetY);
    });
    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REAPER TRANSITION — DEPARTURE  (covers current page, then navigates)
  // ─────────────────────────────────────────────────────────────────────────
  function scanToReaper(href) {
    var W = window.innerWidth;
    var H = window.innerHeight;

    var canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;pointer-events:none;';
    document.body.appendChild(canvas);
    var ctx    = canvas.getContext('2d');
    var labels = buildLabelSet(W);

    var DUR   = 750;
    var start = null;
    var done  = false;

    function ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    function frame(ts) {
      if (!start) start = ts;
      var p     = Math.min((ts - start) / DUR, 1);
      var scanY = ease(p) * H;

      drawScanFrame(ctx, 'cover', scanY, W, H, labels, ts);

      if (p < 1) {
        requestAnimationFrame(frame);
      } else if (!done) {
        done = true;
        sessionStorage.setItem('gl-pt-reaper', '1');
        window.location.href = href;
      }
    }

    requestAnimationFrame(frame);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REAPER TRANSITION — ARRIVAL  (reveals Reaper page from top, then clears)
  // ─────────────────────────────────────────────────────────────────────────
  function scanRevealIn() {
    removeHeadCover();

    var W = window.innerWidth;
    var H = window.innerHeight;

    var canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;pointer-events:none;';
    document.body.appendChild(canvas);
    var ctx    = canvas.getContext('2d');
    var labels = buildLabelSet(W);

    // Fill immediately so reaper page is hidden before rAF fires
    ctx.fillStyle = 'rgba(3,3,3,0.97)';
    ctx.fillRect(0, 0, W, H);

    var DUR   = 800;
    var start = null;
    var done  = false;

    function ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    function frame(ts) {
      if (!start) start = ts;
      var p     = Math.min((ts - start) / DUR, 1);
      var scanY = ease(p) * H;

      drawScanFrame(ctx, 'reveal', scanY, W, H, labels, ts);

      if (p < 1) {
        requestAnimationFrame(frame);
      } else if (!done) {
        done = true;
        canvas.parentNode && canvas.parentNode.removeChild(canvas);
      }
    }

    // Two rAF delay + small timeout ensures page has painted before we reveal
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        setTimeout(function () { requestAnimationFrame(frame); }, 30);
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LINK INTERCEPT
  // ─────────────────────────────────────────────────────────────────────────
  function initLinks() {
    var transitioning = false;

    document.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;

      var href = a.getAttribute('href');
      if (!href)                        return;
      if (href.charAt(0) === '#')       return;
      if (href.indexOf('mailto') === 0) return;
      if (href.indexOf('tel')    === 0) return;
      if (href.indexOf('http')   === 0) return;
      if (href.indexOf('//')     === 0) return;
      if (a.target === '_blank')        return;
      if (href === '/contact.html' || href === 'contact.html') return;

      e.preventDefault();
      if (transitioning) return;
      transitioning = true;

      // Logo: navigate to home (splash skipped if already activated)
      if (a.classList.contains('nav-logo')) {
        sessionStorage.setItem('gl-pt', '1');
        sweepIn(function () { window.location.href = '/'; });
        return;
      }

      // Reaper only: tactical scan
      if (href === '/reaper.html') {
        scanToReaper(href);
        return;
      }

      // All other pages: standard strip sweep
      sessionStorage.setItem('gl-pt', '1');
      sweepIn(function () { window.location.href = href; });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────────────────────
  function init() {
    // Reaper arrival — scan reveal only, no strip overlay
    if (sessionStorage.getItem('gl-pt-reaper') === '1') {
      sessionStorage.removeItem('gl-pt-reaper');
      scanRevealIn();
      initLinks();
      return;
    }

    // Standard arrival — strip sweep-out
    buildOverlay();

    if (sessionStorage.getItem('gl-pt') === '1') {
      sessionStorage.removeItem('gl-pt');
      coverInstant();
      removeHeadCover();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          // On the home page, fire gl:activated once the overlay has fully cleared
          // so the hero animation starts from a clean first frame, not behind the sweep.
          var isHome = (window.location.pathname === '/' || window.location.pathname === '/index.html');
          setTimeout(function () {
            sweepOut(isHome ? function () {
              window.dispatchEvent(new CustomEvent('gl:activated'));
            } : null);
          }, 60);
        });
      });
    } else {
      removeHeadCover();
    }

    initLinks();
  }

  // Bfcache guard — if the browser restores a home page snapshot, all
  // { once:true } gl:activated listeners are already consumed and hero
  // elements are mid-resolved.  Reload so the full entrance sequence replays.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      var isHome = (window.location.pathname === '/' || window.location.pathname === '/index.html');
      if (isHome) window.location.reload();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
