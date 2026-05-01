/**
 * GROOM LAKE — Splash Screen
 * Real-geography world map via Natural Earth 110m / world-atlas TopoJSON.
 * Countries are fetched async, pre-rendered to an offscreen canvas once,
 * then composited each frame. All animation is transforms + opacity only.
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // Bfcache bust: if the browser restores this page from its back-forward
  // cache, the splash will still be in its dismissed state (display:none).
  // Force a fresh reload so the full experience always runs on return.
  // ─────────────────────────────────────────────
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) window.location.reload();
  });

  // ─────────────────────────────────────────────
  // Decrypt target + scramble charset
  // ─────────────────────────────────────────────
  const DECRYPT_TARGET = 'PRIVATE SECURITY\n& INTELLIGENCE\nCORPORATION';
  const CHARSET = '!@#$%^&*()-+=[]|;:,.?/~<>{}0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  // ─────────────────────────────────────────────
  // Cities — ~15, distributed globally
  // ─────────────────────────────────────────────
  const CITIES = [
    { id: 'NYC', lat:  40.71, lon:  -74.01 },
    { id: 'WDC', lat:  38.91, lon:  -77.04 },
    { id: 'MIA', lat:  25.77, lon:  -80.19 },
    { id: 'LDN', lat:  51.51, lon:   -0.13 },
    { id: 'PAR', lat:  48.85, lon:    2.35 },
    { id: 'FRA', lat:  50.11, lon:    8.68 },
    { id: 'IST', lat:  41.01, lon:   28.98 },
    { id: 'DXB', lat:  25.20, lon:   55.27 },
    { id: 'RUH', lat:  24.69, lon:   46.72 },
    { id: 'DEL', lat:  28.66, lon:   77.23 },
    { id: 'SIN', lat:   1.35, lon:  103.82 },
    { id: 'HKG', lat:  22.32, lon:  114.17 },
    { id: 'TYO', lat:  35.69, lon:  139.69 },
    { id: 'SYD', lat: -33.87, lon:  151.21 },
    { id: 'SAO', lat: -23.55, lon:  -46.63 },
  ];

  // ─────────────────────────────────────────────
  // City-to-city connections — sparse global network
  // ─────────────────────────────────────────────
  const CONNECTIONS = [
    [0, 3],   // NYC → London
    [3, 6],   // London → Istanbul
    [6, 7],   // Istanbul → Dubai
    [7, 9],   // Dubai → Delhi
    [9, 10],  // Delhi → Singapore
    [10, 11], // Singapore → HK
    [11, 12], // HK → Tokyo
    [3, 4],   // London → Paris
    [0, 14],  // NYC → São Paulo
  ];

  // ─────────────────────────────────────────────
  // Operations — red filled diamonds, dashed lines, hover labels
  // ─────────────────────────────────────────────
  const OPERATIONS = [
    {
      name: 'NORTHERN LIGHT',
      locations: [
        { lat: 51.51,  lon:   -0.13 }, // UK (London)
        { lat: 53.55,  lon: -113.49 }, // Canada (Edmonton)
      ],
    },
    {
      name: 'WAVEFRONT',
      locations: [
        { lat: 45.75,  lon:    4.85 }, // France (Lyon)
      ],
    },
    {
      name: 'EUCLIDEAN MIRAGE',
      locations: [
        { lat: 24.69,  lon:   46.72 }, // Saudi Arabia (Riyadh)
        { lat: 39.93,  lon:   32.86 }, // Turkey (Ankara)
      ],
    },
    {
      name: 'BLOOD RUBY',
      locations: [
        { lat: 38.91,  lon:  -77.04 }, // USA (Washington DC)
        { lat: 25.20,  lon:   55.27 }, // Dubai
      ],
    },
    {
      name: 'WHITE MOUNTAIN',
      locations: [
        { lat: 45.50,  lon:  -73.57 }, // Canada (Montreal)
        { lat: 52.37,  lon:    4.90 }, // Netherlands (Amsterdam)
        { lat: 43.85,  lon:   18.36 }, // Bosnia (Sarajevo)
      ],
    },
    {
      name: 'URAL SPECTRE',
      locations: [
        { lat: 43.10,  lon:  131.90 }, // Russian Far East (Vladivostok)
        { lat: 39.02,  lon:  125.75 }, // North Korea (Pyongyang)
      ],
    },
    {
      name: 'KOSHER RYE',
      locations: [
        { lat: 52.52,  lon:   13.41 }, // Germany (Berlin)
      ],
    },
    {
      name: 'SANDY BEACH',
      locations: [
        { lat: 21.49,  lon:   39.19 }, // Saudi Arabia (Jeddah)
      ],
    },
    {
      name: 'UNION GENERAL',
      locations: [
        { lat: 33.75,  lon:  -84.39 }, // USA (Atlanta)
      ],
    },
  ];

  // ─────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────
  function randChar() {
    return CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // ─────────────────────────────────────────────
  // World Map — Natural Earth 110m via world-atlas TopoJSON
  // ─────────────────────────────────────────────
  class SplashMap {
    constructor(canvas) {
      this.canvas     = canvas;
      this.ctx        = canvas.getContext('2d');
      this.raf        = null;
      this.progress   = 0;
      this.mouse      = { x: -9999, y: -9999 };
      this._offscreen = null;   // pre-rendered static background
      this._geoReady     = false;
      this._features     = [];
      this._hintDismissed = false;

      // ── Tactical tracker state ──────────────────────────────────────
      // Lerped display position (starts off-canvas so nothing renders)
      this._tx      = -9999;
      this._ty      = -9999;
      // Raw target (set on mousemove, frozen on mouseleave)
      this._tTargetX = -9999;
      this._tTargetY = -9999;
      // Fade envelope: 0 = invisible, 1 = fully drawn
      this._tAlpha   = 0;
      this._tInside  = false;
      // Disable on touch-only devices
      this._isTouch  = window.matchMedia('(hover: none)').matches;
      // ────────────────────────────────────────────────────────────────

      this._resize();

      window.addEventListener('resize', () => {
        this._resize();
        if (this._geoReady) this._buildOffscreen();
      });

      // ── Mouse tracking ────────────────────────────────────────────────
      // Listen on the splash parent (not just the canvas) so the tracker
      // works everywhere on the splash — including over text and button
      // elements that sit above the canvas in the z-stack.
      const splashEl = canvas.closest('#splash') || canvas.parentElement || canvas;

      splashEl.addEventListener('mousemove', e => {
        const rect   = canvas.getBoundingClientRect();
        const mx     = e.clientX - rect.left;
        const my     = e.clientY - rect.top;
        this.mouse.x = mx;
        this.mouse.y = my;
        // Snap lerp position on first entry so nothing sweeps in from off-canvas
        if (!this._tInside) { this._tx = mx; this._ty = my; }
        this._tTargetX = mx;
        this._tTargetY = my;
        this._tInside  = true;
      });
      splashEl.addEventListener('mouseleave', () => {
        this.mouse.x  = -9999;
        this.mouse.y  = -9999;
        this._tInside = false;
        canvas.style.cursor = '';
      });

      this._loadGeo();
    }

    // Fetch Natural Earth 110m countries from world-atlas CDN.
    // Converts TopoJSON → GeoJSON features using the globally loaded topojson-client.
    async _loadGeo() {
      try {
        const resp = await fetch(
          'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const topo = await resp.json();
        if (typeof topojson !== 'undefined') {
          this._features = topojson.feature(topo, topo.objects.countries).features;
        }
      } catch (_) {
        // Graceful fallback — map works, just no land fills
        this._features = [];
      }
      this._geoReady = true;
      this._buildOffscreen();
    }

    _resize() {
      this.canvas.width  = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }

    _mapRect() {
      const W = this.canvas.width, H = this.canvas.height;
      const isPortrait = H > W * 1.2;

      if (isPortrait) {
        // Portrait mobile: keep 2:1 aspect (undistorted continents) but
        // position the map in the upper third of the viewport — not at
        // absolute centre. The text overlays the map; the lower half of
        // the viewport is for the head + CTA. Previously centered-vertically
        // left too much empty space above; now map sits at ~18% from top.
        const padX = Math.round(W * 0.04);
        const mapW = W - padX * 2;
        const mapH = mapW / 2;               // strict 2:1
        const topY = Math.round(H * 0.16);   // upper third — less dead space up top
        return { x: padX, y: topY, w: mapW, h: mapH };
      }

      // Landscape / desktop: fill canvas with margin
      const padX = Math.round(W * (W < 900 ? 0.06 : 0.10));
      const padY = Math.round(H * (W < 900 ? 0.07 : 0.12));
      return { x: padX, y: padY, w: W - padX * 2, h: H - padY * 2 };
    }

    // Equirectangular projection: lon/lat → canvas pixel within the map rect.
    _geo(lat, lon) {
      const r = this._mapRect();
      return {
        x: r.x + (lon + 180) / 360 * r.w,
        y: r.y + (90 - lat)  / 180 * r.h,
      };
    }

    // Build an offscreen canvas with the static elements: graticule + country polygons.
    // Called once after GeoJSON loads (or on resize). Never called per-frame.
    _buildOffscreen() {
      const W = this.canvas.width, H = this.canvas.height;
      const oc      = document.createElement('canvas');
      oc.width      = W;
      oc.height     = H;
      const ctx     = oc.getContext('2d');
      const r       = this._mapRect();

      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();

      // ── Graticule — 30° grid ─────────────────────────────────────────
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth   = 0.4;
      for (let lon = -180; lon <= 180; lon += 30) {
        const x = r.x + (lon + 180) / 360 * r.w;
        ctx.beginPath(); ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); ctx.stroke();
      }
      for (let lat = -90; lat <= 90; lat += 30) {
        const y = r.y + (90 - lat) / 180 * r.h;
        ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke();
      }
      // Equator slightly stronger
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth   = 0.7;
      const ey = r.y + r.h / 2;
      ctx.beginPath(); ctx.moveTo(r.x, ey); ctx.lineTo(r.x + r.w, ey); ctx.stroke();

      // ── Country polygons from Natural Earth GeoJSON ──────────────────
      if (this._features.length) {
        ctx.fillStyle   = 'rgba(0,0,0,0.10)';
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth   = 0.6;
        ctx.lineJoin    = 'round';
        this._features.forEach(f => {
          if (!f.geometry) return;
          ctx.beginPath();
          this._tracePath(ctx, f.geometry, r);
          ctx.fill();
          ctx.stroke();
        });
      }

      ctx.restore();
      this._offscreen = oc;
    }

    // Trace a GeoJSON Polygon or MultiPolygon onto the given context.
    // Guards against anti-meridian artifacts by detecting >180° longitude jumps.
    _tracePath(ctx, geometry, r) {
      const px = ([lon, lat]) => [
        r.x + (lon + 180) / 360 * r.w,
        r.y + (90 - lat)  / 180 * r.h,
      ];

      const ring = (coords) => {
        let prevLon = null;
        coords.forEach((pt, i) => {
          const [x, y] = px(pt);
          if (i === 0 || (prevLon !== null && Math.abs(pt[0] - prevLon) > 180)) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          prevLon = pt[0];
        });
        ctx.closePath();
      };

      if (geometry.type === 'Polygon') {
        geometry.coordinates.forEach(ring);
      } else if (geometry.type === 'MultiPolygon') {
        geometry.coordinates.forEach(poly => poly.forEach(ring));
      }
    }

    _drawFrame() {
      const { ctx } = this;
      const r = this._mapRect();
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth   = 0.8;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      const tk      = 8;
      const corners = [
        [r.x,       r.y,        tk,  0,  0,  tk],
        [r.x + r.w, r.y,       -tk,  0,  0,  tk],
        [r.x,       r.y + r.h,  tk,  0,  0, -tk],
        [r.x + r.w, r.y + r.h, -tk,  0,  0, -tk],
      ];
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth   = 1.2;
      corners.forEach(([cx, cy, dx1, dy1, dx2, dy2]) => {
        ctx.beginPath();
        ctx.moveTo(cx + dx1, cy + dy1);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + dx2, cy + dy2);
        ctx.stroke();
      });
    }

    _drawConnections(ts) {
      const { ctx } = this;
      const r = this._mapRect();
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();

      CONNECTIONS.forEach(([a, b], idx) => {
        const delay = idx * 0.6;
        const lineP = Math.max(0, Math.min(1, (this.progress - delay) / 0.7));
        if (lineP <= 0) return;

        const A = this._geo(CITIES[a].lat, CITIES[a].lon);
        const B = this._geo(CITIES[b].lat, CITIES[b].lon);

        const cpX = (A.x + B.x) / 2;
        const cpY = (A.y + B.y) / 2 - Math.abs(B.x - A.x) * 0.22;

        // Partial quadratic bezier via de Casteljau
        const t    = lineP;
        const p01x = A.x + (cpX - A.x) * t;
        const p01y = A.y + (cpY - A.y) * t;
        const p12x = cpX + (B.x - cpX) * t;
        const p12y = cpY + (B.y - cpY) * t;
        const endX = p01x + (p12x - p01x) * t;
        const endY = p01y + (p12y - p01y) * t;

        ctx.setLineDash([3, 7]);
        ctx.lineDashOffset = -(ts / 1000) * 14;
        ctx.strokeStyle    = `rgba(160,0,0,${0.3 * lineP})`;
        ctx.lineWidth      = 0.7;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.quadraticCurveTo(p01x, p01y, endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Travelling dot along completed arcs
        if (lineP >= 1) {
          const dt    = ((ts / 1000) * 0.2 + idx * 0.15) % 1;
          const dp01x = A.x + (cpX - A.x) * dt;
          const dp01y = A.y + (cpY - A.y) * dt;
          const dp12x = cpX + (B.x - cpX) * dt;
          const dp12y = cpY + (B.y - cpY) * dt;
          const dotX  = dp01x + (dp12x - dp01x) * dt;
          const dotY  = dp01y + (dp12y - dp01y) * dt;
          ctx.fillStyle = 'rgba(160,0,0,0.7)';
          ctx.beginPath();
          ctx.arc(dotX, dotY, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.restore();
    }

    _drawCities(ts) {
      const { ctx } = this;
      const r = this._mapRect();
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();

      CITIES.forEach((city, idx) => {
        const delay = idx * 0.28;
        const p     = Math.max(0, Math.min(1, (this.progress - delay) / 0.35));
        if (p <= 0) return;

        const { x, y } = this._geo(city.lat, city.lon);
        const pulse     = Math.sin(ts / 1000 * 2.2 + idx * 1.1) * 0.5 + 0.5;

        // Ripple ring
        ctx.strokeStyle = `rgba(160,0,0,${(1 - pulse) * 0.25 * p})`;
        ctx.lineWidth   = 0.7;
        ctx.beginPath();
        ctx.arc(x, y, 6 + pulse * 14, 0, Math.PI * 2);
        ctx.stroke();

        // Hollow diamond
        const sz = 4 * p;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = `rgba(160,0,0,${0.9 * p})`;
        ctx.lineWidth   = 1;
        ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
        ctx.restore();

        // Centre dot
        ctx.fillStyle = `rgba(160,0,0,${0.6 * p})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Label for major cities
        if (['NYC', 'LDN', 'DXB', 'SIN', 'TYO', 'SYD'].includes(city.id)) {
          ctx.font      = `${Math.ceil(7 * p)}px 'GT Flexa','Space Grotesk',sans-serif`;
          ctx.fillStyle = `rgba(0,0,0,${0.55 * p})`;
          const lx      = x > (r.x + r.w * 0.8) ? x - 30 : x + 7;
          ctx.fillText(city.id, lx, y - 5);
        }
      });

      ctx.restore();
    }

    _drawOperations(ts) {
      const { ctx } = this;
      const r = this._mapRect();
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();

      let hoveredOp = null;
      let hoveredPt = null;

      OPERATIONS.forEach((op, opIdx) => {
        const pts = op.locations.map(loc => this._geo(loc.lat, loc.lon));

        // Dashed lines connecting locations within the same operation
        for (let i = 0; i < pts.length - 1; i++) {
          ctx.save();
          ctx.setLineDash([4, 5]);
          ctx.lineDashOffset = -(ts / 1000) * 10;
          ctx.strokeStyle    = 'rgba(200,0,0,0.55)';
          ctx.lineWidth      = 1.0;
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
          ctx.stroke();
          ctx.restore();
        }

        pts.forEach(pt => {
          // Generous hit area for reliable hover detection
          const dist = Math.hypot(this.mouse.x - pt.x, this.mouse.y - pt.y);
          const isHovered = dist < 22;
          if (isHovered) { hoveredOp = op.name; hoveredPt = pt; }

          // Outer pulse ring (animated, faint)
          const pulse = Math.sin(ts / 1000 * 1.8 + opIdx * 0.9) * 0.5 + 0.5;
          ctx.strokeStyle = `rgba(200,0,0,${(1 - pulse) * (isHovered ? 0.55 : 0.35)})`;
          ctx.lineWidth   = isHovered ? 1.2 : 0.8;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 10 + pulse * 18, 0, Math.PI * 2);
          ctx.stroke();

          // Hover glow ring
          if (isHovered) {
            ctx.strokeStyle = 'rgba(255,60,60,0.25)';
            ctx.lineWidth   = 6;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Filled red diamond — larger and more prominent
          const sz = isHovered ? 13 : 10;
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle   = isHovered ? 'rgba(255,30,30,0.97)' : 'rgba(210,0,0,0.90)';
          ctx.strokeStyle = isHovered ? 'rgba(255,120,120,1)' : 'rgba(255,70,70,0.95)';
          ctx.lineWidth   = isHovered ? 1.5 : 1.0;
          ctx.shadowColor = 'rgba(255,0,0,0.6)';
          ctx.shadowBlur  = isHovered ? 8 : 3;
          ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
          ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
          ctx.restore();
        });
      });

      // Cursor
      this.canvas.style.cursor = hoveredOp ? 'pointer' : '';

      // Dismiss the interact hint on first successful hover
      if (hoveredOp && !this._hintDismissed) {
        this._hintDismissed = true;
        const hint = document.getElementById('splash-interact-hint');
        if (hint) hint.classList.add('hidden');
      }

      // Tooltip — classified dossier panel
      if (hoveredOp && hoveredPt) {
        const opLine     = '// OP: ' + hoveredOp;
        const statusLine = 'STATUS: ACTIVE';
        ctx.font         = "bold 9px 'JetBrains Mono','Space Grotesk',monospace";
        ctx.textBaseline = 'alphabetic';
        const opW        = ctx.measureText(opLine).width;
        ctx.font         = "8px 'JetBrains Mono','Space Grotesk',monospace";
        const stW        = ctx.measureText(statusLine).width;
        const panelW     = Math.max(opW, stW) + 22;
        const panelH     = 38;
        let tx = hoveredPt.x + 18;
        let ty = hoveredPt.y - panelH / 2;
        if (tx + panelW > r.x + r.w - 4) tx = hoveredPt.x - panelW - 18;
        if (ty < r.y + 4) ty = r.y + 4;
        if (ty + panelH > r.y + r.h - 4) ty = r.y + r.h - panelH - 4;

        // Panel background
        ctx.fillStyle = 'rgba(8, 14, 8, 0.92)';
        ctx.fillRect(tx, ty, panelW, panelH);
        // Red top accent bar
        ctx.fillStyle = 'rgba(210, 0, 0, 0.95)';
        ctx.fillRect(tx, ty, panelW, 2);
        // Outer border
        ctx.strokeStyle = 'rgba(200, 0, 0, 0.50)';
        ctx.lineWidth   = 0.8;
        ctx.strokeRect(tx, ty, panelW, panelH);
        // Operation name
        ctx.font      = "bold 9px 'JetBrains Mono','Space Grotesk',monospace";
        ctx.fillStyle = '#ff3333';
        ctx.fillText(opLine, tx + 10, ty + 16);
        // Status line
        ctx.font      = "8px 'JetBrains Mono','Space Grotesk',monospace";
        ctx.fillStyle = 'rgba(180, 200, 175, 0.60)';
        ctx.fillText(statusLine, tx + 10, ty + 30);
      }

      ctx.restore();
    }

    _draw(ts) {
      const { ctx, canvas } = this;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Composite pre-rendered background (graticule + countries)
      if (this._offscreen) ctx.drawImage(this._offscreen, 0, 0);
      this._drawFrame();
      // Touch/mobile: static map only — no animated dots, arcs, or operation markers.
      // The clean geographic background is the focal element; overlays add clutter.
      if (!this._isTouch) {
        this._drawConnections(ts);
        this._drawCities(ts);
        this._drawOperations(ts);
        this._advanceTracker();
      }
    }

    // ── Tactical Map Tracker ─────────────────────────────────────────────
    // Advances lerp state and renders the crosshair + center point.
    // Called every frame from _draw(); all state lives on `this`.
    _advanceTracker() {
      const LERP       = 0.13;  // position smoothing (higher = snappier)
      const ALPHA_LERP = 0.09;  // opacity fade speed

      // Chase target position (only when mouse is inside canvas)
      if (this._tInside) {
        this._tx += (this._tTargetX - this._tx) * LERP;
        this._ty += (this._tTargetY - this._ty) * LERP;
      }

      // Fade toward 1 when inside, 0 when outside
      const alphaTarget = this._tInside ? 1 : 0;
      this._tAlpha += (alphaTarget - this._tAlpha) * ALPHA_LERP;

      if (this._tAlpha < 0.01 || this._tx < 0) return;

      const { ctx, canvas } = this;
      const x = this._tx, y = this._ty, a = this._tAlpha;
      const GAP = 13;  // pixel gap around the center point on each axis

      ctx.save();

      // ── Crosshair lines ─────────────────────────────────────────────
      ctx.globalAlpha = a * 0.32;
      ctx.strokeStyle = 'rgba(17, 26, 17, 1)';
      ctx.lineWidth   = 0.75;

      // Horizontal — left segment
      ctx.beginPath(); ctx.moveTo(0, y);           ctx.lineTo(x - GAP, y); ctx.stroke();
      // Horizontal — right segment
      ctx.beginPath(); ctx.moveTo(x + GAP, y);     ctx.lineTo(canvas.width, y); ctx.stroke();
      // Vertical — top segment
      ctx.beginPath(); ctx.moveTo(x, 0);           ctx.lineTo(x, y - GAP); ctx.stroke();
      // Vertical — bottom segment
      ctx.beginPath(); ctx.moveTo(x, y + GAP);     ctx.lineTo(x, canvas.height); ctx.stroke();

      // ── Center red dot ──────────────────────────────────────────────
      ctx.globalAlpha  = a * 0.88;
      ctx.fillStyle    = '#ff2d2d';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
    // ────────────────────────────────────────────────────────────────────

    start() {
      const loop = ts => {
        this._draw(ts);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);

      // Progress drives the staggered reveal of cities + arcs.
      // On touch devices those layers are suppressed, so skip the timer entirely.
      if (!this._isTouch) {
        const step = () => {
          this.progress += 0.07;
          if (this.progress < CONNECTIONS.length * 0.6 + CITIES.length * 0.3 + 2) {
            setTimeout(step, 50);
          }
        };
        setTimeout(step, 400);
      }
    }

    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
    }
  }

  // ─────────────────────────────────────────────
  // Glitch FX — Cold War / analog terminal interference
  // Canvas overlay: scanlines, noise burst, VHS tear bands.
  // CSS classes on elements handle jitter + chroma (applied by caller).
  // Self-mounts to DOM on start(), self-removes when done.
  // ─────────────────────────────────────────────
  class GlitchFX {
    constructor() {
      const cvs = document.createElement('canvas');
      cvs.style.cssText =
        'position:fixed;inset:0;z-index:100001;pointer-events:none;width:100%;height:100%';
      cvs.setAttribute('aria-hidden', 'true');
      this._cvs = cvs;
      this._ctx = cvs.getContext('2d');
      this._raf = null;
      this._t0  = 0;
    }

    start() {
      document.body.appendChild(this._cvs);
      this._cvs.width  = window.innerWidth;
      this._cvs.height = window.innerHeight;
      this._t0 = performance.now();
      this._loop();
    }

    _loop() {
      const elapsed = performance.now() - this._t0;
      const TOTAL   = 750; // ms — burst 0-450ms, settle 450-750ms
      if (elapsed >= TOTAL) {
        this._ctx.clearRect(0, 0, this._cvs.width, this._cvs.height);
        this._cvs.remove();
        return;
      }
      this._frame(elapsed, TOTAL);
      this._raf = requestAnimationFrame(() => this._loop());
    }

    _frame(t, total) {
      const W   = this._cvs.width;
      const H   = this._cvs.height;
      const ctx = this._ctx;
      ctx.clearRect(0, 0, W, H);

      // Master envelope: full burst 0–450ms, fade out 450–750ms
      const mOpacity = t < 450 ? 1 : 1 - (t - 450) / 300;

      // ── Scanlines — horizontal rules every 3px, opacity pulses ────────
      const slAlpha = mOpacity * this._pulse(t, 70) * 0.09;
      if (slAlpha > 0.003) {
        ctx.strokeStyle = `rgba(0,0,0,${slAlpha.toFixed(3)})`;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        for (let y = 0; y < H; y += 3) {
          ctx.moveTo(0, y + 0.5);
          ctx.lineTo(W, y + 0.5);
        }
        ctx.stroke();
      }

      // ── Noise burst — coarse pixel blocks, first 200ms only ───────────
      if (t < 200) {
        const nAlpha = mOpacity * this._pulse(t, 25) * 0.04;
        if (nAlpha > 0.003) {
          ctx.fillStyle = `rgba(150,158,148,${nAlpha.toFixed(3)})`;
          for (let i = 0; i < 55; i++) {
            // Deterministic noise — sin/cos hash, no Math.random per frame
            const nx = (Math.abs(Math.sin(t * 0.04 + i * 137.5)) * W) | 0;
            const ny = (Math.abs(Math.cos(t * 0.037 + i * 61.3)) * H) | 0;
            const nw = 1 + ((Math.abs(Math.sin(i * 23.1)) * 4) | 0);
            const nh = 1 + ((Math.abs(Math.cos(i * 17.7)) * 2) | 0);
            ctx.fillRect(nx, ny, nw, nh);
          }
        }
      }

      // ── VHS tear bands — phosphor-tinted horizontals at staggered times
      const TEARS = [
        { at:  40, y: H * 0.30, h: 13, a: 0.09 },
        { at: 130, y: H * 0.57, h:  7, a: 0.07 },
        { at: 220, y: H * 0.73, h: 17, a: 0.08 },
        { at: 320, y: H * 0.42, h: 10, a: 0.06 },
      ];
      TEARS.forEach(({ at, y, h, a }) => {
        if (t < at) return;
        const age = t - at;
        if (age > 200) return; // each tear lives 200ms
        const alpha = mOpacity * a * Math.sin((age / 200) * Math.PI); // arc envelope
        if (alpha < 0.004) return;
        // Slight phosphor-green tint — CRT bleed, not neon
        ctx.fillStyle = `rgba(160,178,154,${alpha.toFixed(3)})`;
        ctx.fillRect(0, y, W, h);
      });
    }

    // Deterministic stepped pulse (stable per time step, no random drift)
    _pulse(t, stepMs) {
      const step = Math.floor(t / stepMs);
      return 0.35 + 0.65 * Math.abs(Math.sin(step * 2.718 + 1.618));
    }
  }

  // ─────────────────────────────────────────────
  // Text Scramble / Decrypt
  // ─────────────────────────────────────────────
  /**
   * Build DOM once on start(); cache per-char span refs; tick updates only
   * the single character textContent for scrambled spans (no innerHTML
   * rebuild, no reflow). rAF-driven with throttled frame cadence so the
   * animation is smooth on mobile.
   */
  class TextScramble {
    constructor(el) {
      this.el         = el;
      this.spans      = [];  // span refs for non-space/newline chars
      this.revealed   = [];  // bool[] per index in DECRYPT_TARGET
      this._rafId     = null;
      this._lastTick  = 0;
      this._stopped   = false;
    }

    start(onComplete) {
      const T = DECRYPT_TARGET;
      const chars = T.split('');
      this.revealed = chars.map(c => c === ' ' || c === '\n');
      this.spans    = new Array(chars.length);

      // Build DOM once.
      const frag = document.createDocumentFragment();
      chars.forEach((char, i) => {
        if (char === '\n')      { frag.appendChild(document.createElement('br')); return; }
        if (char === ' ')       { const s = document.createElement('span'); s.className = 'sp'; s.textContent = ' '; frag.appendChild(s); return; }
        const s = document.createElement('span');
        s.className = 'scr';
        s.textContent = randChar();
        frag.appendChild(s);
        this.spans[i] = s;
      });
      this.el.innerHTML = '';
      this.el.appendChild(frag);

      // Throttle: slower ticks on mobile (feels smoother, lower CPU).
      const TICK_MS = window.innerWidth < 768 ? 95 : 70;

      const loop = (ts) => {
        if (this._stopped) return;
        if (ts - this._lastTick >= TICK_MS) {
          // Only mutate textContent of scrambled spans — no reflow.
          for (let i = 0; i < this.spans.length; i++) {
            const sp = this.spans[i];
            if (sp && !this.revealed[i]) sp.textContent = randChar();
          }
          this._lastTick = ts;
        }
        this._rafId = requestAnimationFrame(loop);
      };
      this._rafId = requestAnimationFrame(loop);

      // Schedule character reveals across the duration.
      const nonSpaces = chars.filter(c => c !== ' ' && c !== '\n').length;
      let   nsIdx     = 0;
      // Faster reveal on mobile (2s vs 3s desktop) — scramble still visible
      // but the full headline lands quicker and ACTIVATE appears sooner.
      const dur       = window.innerWidth < 768 ? 2000 : 3000;

      chars.forEach((char, i) => {
        if (char === ' ' || char === '\n') return;
        const delay = (nsIdx / nonSpaces) * dur;
        nsIdx++;
        setTimeout(() => {
          this.revealed[i]       = true;
          const sp = this.spans[i];
          if (sp) {
            sp.textContent = char;
            sp.className   = 'rev';
          }
          if (this.revealed.every(Boolean)) {
            setTimeout(() => {
              this._stopped = true;
              if (this._rafId) cancelAnimationFrame(this._rafId);
              onComplete && onComplete();
            }, 380);
          }
        }, delay);
      });
    }
  }

  // ─────────────────────────────────────────────
  // Corner Readouts
  // ─────────────────────────────────────────────
  function startReadouts() {
    const baseLat  =  37.2399;
    const baseLon  = 115.8111;
    const STATUSES = ['HANDSHAKE','VERIFYING','ENCRYPTED','AUTHENTICATED','ACTIVE','NOMINAL'];

    function update() {
      const now   = new Date();
      const drift = 0.0003;
      const lat   = baseLat + Math.sin(Date.now() / 7200)  * drift;
      const lon   = baseLon + Math.cos(Date.now() / 10800) * drift;
      const set   = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

      set('s-lat',    `${lat.toFixed(4)}°N`);
      set('s-lon',    `${lon.toFixed(4)}°W`);
      set('s-time',   `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())} UTC`);
      set('s-nodes',  `NODES: ${Math.floor(4 + Math.sin(Date.now() / 2400) * 1.5)}`);
      set('s-status', STATUSES[Math.floor(Date.now() / 1600) % STATUSES.length]);
    }

    update();
    return setInterval(update, 1000);
  }

  // ─────────────────────────────────────────────
  // Logo disintegration → grid formation.
  //
  // One continuous motion — no phase jumps.
  //
  // Scatter:   fragments fly outward, gravity + initial velocity
  // Reform:    spring physics pulls each fragment toward its grid node;
  //            spring activates at a per-particle staggered time so
  //            arrivals are spread across ~400ms, not simultaneous
  // Formation: grid lines draw from individual arrivedAt timestamps —
  //            lines appear wherever two neighbours have both landed,
  //            spreading organically as more particles settle
  // Hold/fade: completed grid holds briefly then fades out
  // ─────────────────────────────────────────────
  function disintegrateLogo(logoEl, onDone) {
    if (!logoEl) { onDone && onDone(); return; }

    const W = window.innerWidth, H = window.innerHeight;
    const rect = logoEl.getBoundingClientRect();
    const cvs  = document.createElement('canvas');
    cvs.style.cssText = 'position:fixed;inset:0;z-index:100002;pointer-events:none';
    cvs.setAttribute('aria-hidden', 'true');
    cvs.width  = W;
    cvs.height = H;
    document.body.appendChild(cvs);
    const ctx = cvs.getContext('2d');

    const cx   = rect.left + rect.width  / 2;
    const cy   = rect.top  + rect.height / 2;
    const hw   = rect.width  * 0.46;
    const hh   = rect.height * 0.46;
    const maxD = Math.sqrt(hw * hw + hh * hh);

    // ── Grid ─────────────────────────────────────────────────────────
    const GCOLS = 15, GROWS = 9;
    const gPadX = W * 0.065, gPadY = H * 0.09;
    const gW = W - gPadX * 2, gH = H - gPadY * 2;

    const gridPts = [];
    for (let gc = 0; gc <= GCOLS; gc++) {
      for (let gr = 0; gr <= GROWS; gr++) {
        gridPts.push({
          col: gc, row: gr,
          x: gPadX + (gc / GCOLS) * gW,
          y: gPadY + (gr / GROWS) * gH,
          arrivedAt: -1
        });
      }
    }
    // Positional lookup survives the shuffle below
    const gridByPos = {};
    gridPts.forEach(pt => { gridByPos[`${pt.col},${pt.row}`] = pt; });

    // Shuffle particle→node assignment for spatial variety
    const shuffled = gridPts.map((_, i) => i);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // ── Particles ─────────────────────────────────────────────────────
    const COLS = 14, ROWS = 12;
    const particles = [];

    for (let c = 0; c < COLS; c++) {
      for (let ro = 0; ro < ROWS; ro++) {
        const ox = cx + (-0.5 + (c + 0.5 + (Math.random()-0.5)*0.7) / COLS) * hw * 2;
        const oy = cy + (-0.5 + (ro + 0.5 + (Math.random()-0.5)*0.7) / ROWS) * hh * 2;
        const dx = ox - cx, dy = oy - cy;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        const spd = 0.5 + Math.random() * 3.4;
        const startDelay = (1 - len / maxD) * 160;
        const vx = (dx/len*(0.7+Math.random()*0.5) + (Math.random()-0.5)*0.7) * spd;
        const vy = (dy/len*(0.7+Math.random()*0.5) + (Math.random()-0.5)*0.7) * spd - Math.random()*0.6;
        const sz = 1.0 + Math.random() * 2.6;
        const r  = Math.random();
        const color = r < 0.62 ? [17,26,17] : r < 0.82 ? [5,10,5] : r < 0.94 ? [40,55,38] : [200,0,0];
        const tIdx = shuffled[(c * ROWS + ro) % gridPts.length];
        // Per-particle spring start: stagger up to 160ms so arrivals spread naturally
        const springOffset = Math.random() * 160;
        particles.push({ x:ox, y:oy, vx, vy, sz, color, startDelay, tIdx, settled:false, springOffset });
      }
    }

    logoEl.style.transition = 'opacity 150ms ease';
    logoEl.style.opacity    = '0';

    const t0 = performance.now();
    // T_SPRING_BASE: when spring begins blending in (earliest particle)
    // T_SETTLED:     when the last particles should be near their nodes
    // T_HOLD:        grid at peak visibility
    // DUR:           canvas removed
    const T_SPRING_BASE = 320;   // spring starts blending in here (60ms before T_SCATTER_END)
    const T_SCATTER_END = 400;   // scatter-only phase done; spring dominant after
    const T_SETTLED     = 980;   // all particles should be settled by ~here
    const T_HOLD        = 1100;
    const DUR           = 1300;

    const LINE_FADE_MS = 260;    // ms to fade in each grid segment

    function eoc(t) { return 1 - Math.pow(1-t, 3); }   // ease-out cubic

    function frame() {
      const elapsed = performance.now() - t0;
      if (elapsed >= DUR) { ctx.clearRect(0,0,W,H); cvs.remove(); onDone && onDone(); return; }
      ctx.clearRect(0,0,W,H);

      const exitA = elapsed > T_HOLD
        ? Math.pow(1 - (elapsed - T_HOLD) / (DUR - T_HOLD), 1.5)
        : 1;

      // ── Particles ────────────────────────────────────────────────
      particles.forEach(frag => {
        if (elapsed < frag.startDelay) return;
        const active = elapsed - frag.startDelay;
        const gp = gridPts[frag.tIdx];

        if (!frag.settled) {
          // Per-particle spring progress — each fragment has its own ramp-in time
          const mySpringStart = T_SPRING_BASE + frag.springOffset;
          const springRaw     = Math.max(0, Math.min(1, (elapsed - mySpringStart) / (T_SETTLED - mySpringStart)));
          const springE       = eoc(springRaw);

          // Spring force: pulls velocity toward target — grows with springE
          // k=0.022 gives a natural arc; damping prevents overshoot
          const toX = gp.x - frag.x;
          const toY = gp.y - frag.y;
          frag.vx *= (1 - springE * 0.13);   // progressive velocity damping
          frag.vy *= (1 - springE * 0.13);
          frag.vx += toX * springE * 0.022;
          frag.vy += toY * springE * 0.022;

          // Gravity fades out as spring takes over (not abrupt — linear blend)
          const gravityWeight = Math.max(0, 1 - (elapsed - (T_SCATTER_END - 80)) / 80);
          if (gravityWeight > 0) frag.vy += 0.052 * gravityWeight;

          frag.x += frag.vx;
          frag.y += frag.vy;

          // Settle: only once spring has meaningful hold (avoids premature lock)
          if (springE > 0.15 && Math.hypot(gp.x - frag.x, gp.y - frag.y) < 3.0) {
            frag.x = gp.x; frag.y = gp.y;
            frag.vx = 0; frag.vy = 0;
            frag.settled = true;
            if (gp.arrivedAt < 0) gp.arrivedAt = elapsed;
          }
        }

        // Alpha ── keep particles well-lit so the motion reads as structure forming
        let alpha;
        if (frag.settled) {
          alpha = exitA * 0.50;
        } else {
          const mySpringStart = T_SPRING_BASE + frag.springOffset;
          const springRaw     = Math.max(0, Math.min(1, (elapsed - mySpringStart) / (T_SETTLED - mySpringStart)));
          // Scatter life: fade in fast, hold, gradually fade toward T_SETTLED
          const scatterA = elapsed < T_SCATTER_END
            ? Math.min(active / 70, 1) * 0.82
            : Math.max(0, 1 - (elapsed - T_SCATTER_END) / (T_SETTLED - T_SCATTER_END)) * 0.75;
          // Spring boost: keeps particle bright while it's actively converging
          const springBoost = eoc(springRaw) * 0.62;
          alpha = Math.max(scatterA, springBoost) * exitA;
        }
        if (alpha < 0.008) return;

        ctx.globalAlpha = alpha;
        ctx.fillStyle   = `rgb(${frag.color[0]},${frag.color[1]},${frag.color[2]})`;

        if (frag.settled) {
          // The settled fragment IS the grid node — drawn as a crisp dot
          ctx.beginPath();
          ctx.arc(frag.x, frag.y, Math.max(1.0, frag.sz * 0.58), 0, Math.PI*2);
          ctx.fill();
        } else {
          ctx.fillRect(frag.x - frag.sz/2, frag.y - frag.sz/2, frag.sz, frag.sz);
        }
      });
      ctx.globalAlpha = 1;

      // ── Grid lines ────────────────────────────────────────────────
      // Each segment draws only after BOTH its endpoint nodes have a
      // particle. Fade-in is timed from the later of the two arrivals.
      // Because arrivals are staggered (spring offsets + natural physics),
      // lines form progressively across the grid — not all at once.
      ctx.strokeStyle = '#111a11';
      ctx.lineWidth   = 0.5;
      ctx.setLineDash([]);

      gridPts.forEach(pt => {
        if (pt.arrivedAt < 0) return;

        const right = gridByPos[`${pt.col + 1},${pt.row}`];
        if (right && right.arrivedAt >= 0) {
          const age   = elapsed - Math.max(pt.arrivedAt, right.arrivedAt);
          const lineA = Math.min(Math.max(age, 0) / LINE_FADE_MS, 1) * 0.11 * exitA;
          if (lineA > 0.002) {
            ctx.globalAlpha = lineA;
            ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(right.x, right.y); ctx.stroke();
          }
        }

        const below = gridByPos[`${pt.col},${pt.row + 1}`];
        if (below && below.arrivedAt >= 0) {
          const age   = elapsed - Math.max(pt.arrivedAt, below.arrivedAt);
          const lineA = Math.min(Math.max(age, 0) / LINE_FADE_MS, 1) * 0.11 * exitA;
          if (lineA > 0.002) {
            ctx.globalAlpha = lineA;
            ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(below.x, below.y); ctx.stroke();
          }
        }
      });
      ctx.globalAlpha = 1;

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ─────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────
  function init() {
    history.scrollRestoration = 'manual';
    const splash = document.getElementById('splash');
    if (!splash) return;

    // ── Splash scroll-lock ────────────────────────────────────────────────
    // Hard-lock body + html scroll while splash is visible so the user can't
    // touch-scroll the homepage behind it on mobile. Matching CSS applies
    // overflow:hidden, touch-action:none, overscroll-behavior:none.
    // Also block touchmove at the document level — handles momentum scroll
    // on iOS that overflow:hidden alone can't fully suppress.
    const blockTouchMove = (e) => {
      // Allow touchmove inside the splash itself (for the map canvas etc).
      if (splash.contains(e.target)) return;
      e.preventDefault();
    };
    function lockSplashScroll() {
      document.body.classList.add('mobile-splash-active');
      document.documentElement.classList.add('mobile-splash-active');
      document.addEventListener('touchmove', blockTouchMove, { passive: false });
    }
    function unlockSplashScroll() {
      document.body.classList.remove('mobile-splash-active');
      document.documentElement.classList.remove('mobile-splash-active');
      document.removeEventListener('touchmove', blockTouchMove);
    }
    // Expose for the activate handler further down.
    splash.__lockSplashScroll   = lockSplashScroll;
    splash.__unlockSplashScroll = unlockSplashScroll;

    // If the user has already activated the site in this session,
    // skip the splash entirely and show the page immediately.
    // If a page transition (gl-pt) is in flight, transition.js will fire
    // gl:activated once the sweep-out overlay clears — don't double-fire.
    // If there's no transition in flight (e.g. direct URL entry), fire it
    // ourselves after a short delay so main.js listeners are registered.
    if (sessionStorage.getItem('gl-activated') === '1') {
      splash.style.display = 'none';
      document.body.style.overflow = '';
      unlockSplashScroll();  // ensure no stale lock from a previous session
      if (!sessionStorage.getItem('gl-pt')) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent('gl:activated'));
          });
        });
      }
      return;
    }

    // Splash IS about to show — engage the scroll lock immediately.
    lockSplashScroll();

    const canvas = document.getElementById('splash-map');
    const textEl = document.getElementById('splash-text');
    const btn    = document.getElementById('splash-btn');

    const map          = new SplashMap(canvas);
    const readoutTimer = startReadouts();

    map.start();

    // Show interact hint after map has had time to render
    const interactHint = document.getElementById('splash-interact-hint');
    setTimeout(() => { if (interactHint) interactHint.classList.add('visible'); }, 2200);

    // Start decrypt animation quickly. 250ms pre-pause + 2s scramble (mobile)
    // + 100ms post = ACTIVATE appears ~2.35s after splash loads.
    setTimeout(() => {
      const scramble = new TextScramble(textEl);
      scramble.start(() => {
        setTimeout(() => {
          btn.classList.add('visible');
          const hint = document.getElementById('splash-scroll-hint');
          if (hint) hint.classList.add('visible');
        }, 100);
      });
    }, 250);

    // Safety fallback — show button if decrypt stalls
    setTimeout(() => { btn.classList.add('visible'); }, 7000);

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Consistent easing across the entire timeline
    const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

    btn.addEventListener('click', () => {
      btn.disabled = true;
      clearInterval(readoutTimer);
      sessionStorage.setItem('gl-activated', '1');

      // Lock scroll immediately
      document.body.style.overflow = 'hidden';

      // Hide the CSS background grid instantly — it must not be visible while
      // the splash transitions. The grid will only come into existence as the
      // logo fragments settle into it. Restored in the disintegrateLogo callback.
      const bgGridEl = document.querySelector('.bg-grid');
      if (bgGridEl) { bgGridEl.style.transition = 'none'; bgGridEl.style.opacity = '0'; }

      const overlay = document.getElementById('transition-overlay');
      const txLogo  = overlay && overlay.querySelector('.tx-logo');
      const mainEl  = document.querySelector('main');
      const navEl   = document.querySelector('nav');

      // ── Reduced motion: skip button animation, quick cross-fade ───────
      if (prefersReduced) {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        splash.style.transition = `opacity 250ms ease`;
        splash.style.opacity    = '0';
        setTimeout(() => {
          splash.style.display        = 'none';
          document.body.style.overflow = '';
          unlockSplashScroll();
          map.stop();
        }, 300);
        return;
      }

      // ── Button activation — purple sweep plays before transition ───────
      // Add the activating class (CSS handles the sweep animation).
      // The page transition begins after ACTIVATION_MS so the sweep is
      // visible before the overlay takes over the screen.
      btn.classList.add('splash-btn--activating');
      const ACTIVATION_MS = 380;

      setTimeout(() => {
      // ── Prepare main page for reveal (it's hidden behind splash now) ──
      [mainEl, navEl].filter(Boolean).forEach(el => {
        el.style.opacity    = '0';
        el.style.transform  = 'translateY(8px)';
        el.style.transition = 'none';
      });

      // ── t=0 (after activation): show overlay ──────────────────────────
      if (overlay) overlay.classList.add('active');

      // ── t=0–700ms: intelligence system boot glitch ───────────────────
      // Scanlines + noise blocks + VHS tear bands + chromatic split.
      // All subtle — intelligence aesthetic, not aggressive VHS.
      (function premiumGlitch() {
        const gc = document.createElement('canvas');
        gc.style.cssText = 'position:fixed;inset:0;z-index:100001;pointer-events:none';
        gc.setAttribute('aria-hidden', 'true');
        document.body.appendChild(gc);
        gc.width  = window.innerWidth;
        gc.height = window.innerHeight;
        const gctx = gc.getContext('2d');
        const t0   = performance.now();
        const DUR  = 700;

        function gf() {
          const t = performance.now() - t0;
          if (t >= DUR) { gc.remove(); return; }
          gctx.clearRect(0, 0, gc.width, gc.height);

          // Envelope: sustain 0–500ms, fade 500–700ms
          const env = t < 500 ? 1 : 1 - (t - 500) / 200;

          // Scanlines — fade with envelope
          const slA = env * 0.07;
          if (slA > 0.003) {
            gctx.strokeStyle = `rgba(0,0,0,${slA.toFixed(3)})`;
            gctx.lineWidth   = 1;
            gctx.beginPath();
            for (let y = 0; y < gc.height; y += 3) {
              gctx.moveTo(0, y + 0.5);
              gctx.lineTo(gc.width, y + 0.5);
            }
            gctx.stroke();
          }

          // Noise blocks — first 200ms, deterministic (no random per frame)
          if (t < 200) {
            const nA = env * 0.042;
            gctx.fillStyle = `rgba(150,158,148,${nA.toFixed(3)})`;
            for (let i = 0; i < 48; i++) {
              const nx = (Math.abs(Math.sin(t * 0.04 + i * 137.5)) * gc.width)  | 0;
              const ny = (Math.abs(Math.cos(t * 0.037 + i * 61.3))  * gc.height) | 0;
              const nw = 1 + ((Math.abs(Math.sin(i * 23.1)) * 5) | 0);
              const nh = 1 + ((Math.abs(Math.cos(i * 17.7)) * 3) | 0);
              gctx.fillRect(nx, ny, nw, nh);
            }
          }

          // VHS tear bands — brief horizontal phosphor highlights
          const TEARS = [
            { at:  30, y: gc.height * 0.28, h: 10, a: 0.065 },
            { at: 120, y: gc.height * 0.55, h:  6, a: 0.055 },
            { at: 240, y: gc.height * 0.72, h: 14, a: 0.060 },
          ];
          TEARS.forEach(({ at, y, h, a }) => {
            if (t < at || t > at + 190) return;
            const age   = t - at;
            const alpha = env * a * Math.sin((age / 190) * Math.PI);
            if (alpha < 0.003) return;
            gctx.fillStyle = `rgba(160,178,154,${alpha.toFixed(3)})`;
            gctx.fillRect(0, y, gc.width, h);
          });

          // Chromatic offset burst — first 130ms, very subtle
          if (t < 130) {
            const ca = (1 - t / 130) * 0.042;
            gctx.globalCompositeOperation = 'screen';
            gctx.fillStyle = `rgba(255,45,45,${ca.toFixed(3)})`;
            gctx.fillRect(2, 0, gc.width, gc.height);
            gctx.fillStyle = `rgba(0,200,80,${(ca * 0.65).toFixed(3)})`;
            gctx.fillRect(-2, 0, gc.width, gc.height);
            gctx.globalCompositeOperation = 'source-over';
          }

          requestAnimationFrame(gf);
        }
        requestAnimationFrame(gf);
      }());

      // ── t=0–800ms: logo materialises large + prominent ────────────────
      if (txLogo) {
        txLogo.style.transform  = 'scale(0.72)';
        txLogo.offsetWidth; // force reflow before transition starts
        txLogo.style.transition = `opacity 800ms ${EASE}, transform 800ms ${EASE}`;
        txLogo.style.opacity    = '1';
        txLogo.style.transform  = 'scale(1.0)';
      }

      // ── t=200–900ms: scene zooms in (splash scales up 1 → 1.06) ──────
      setTimeout(() => {
        splash.style.transformOrigin = 'center center';
        splash.style.transition      = `transform 700ms ${EASE}`;
        splash.style.transform       = 'scale(1.06)';
      }, 200);

      // ── t=900ms: logo disintegrates, splash fades ────────────────────
      setTimeout(() => {
        splash.style.transition = `opacity 350ms ${EASE}`;
        splash.style.opacity    = '0';
        if (txLogo) disintegrateLogo(txLogo, () => {
        // Particle formation complete — fade in the real CSS grid to replace it
        if (bgGridEl) {
          bgGridEl.style.transition = 'opacity 400ms ease';
          bgGridEl.style.opacity    = '1';
        }
      });
      }, 900);

      // ── t=1200ms: scroll to top, hide splash ──────────────────────────
      setTimeout(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        splash.style.display = 'none';
        map.stop();
        if (overlay) overlay.classList.remove('active');
      }, 1200);

      // ── t=1400ms: main page fades in, unlock scroll ───────────────────
      setTimeout(() => {
        [mainEl, navEl].filter(Boolean).forEach(el => {
          el.style.transition = `opacity 300ms ${EASE}, transform 300ms ${EASE}`;
          el.style.opacity    = '1';
          el.style.transform  = 'translateY(0)';
        });
        document.body.style.overflow = '';
        unlockSplashScroll();
      }, 1400);

      // ── t=1750ms: strip inline styles + signal main.js that hero is live
      setTimeout(() => {
        [mainEl, navEl].filter(Boolean).forEach(el => {
          el.style.opacity    = '';
          el.style.transform  = '';
          el.style.transition = '';
        });
        // Signal: hero interface is now active — triggers decrypt, logo reveal, etc.
        window.dispatchEvent(new CustomEvent('gl:activated'));
      }, 1750);

      }, ACTIVATION_MS); // end of post-activation setTimeout
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
