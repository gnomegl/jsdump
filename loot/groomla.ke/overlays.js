/**
 * GROOM LAKE — Overlays
 * 1. Side Networks    — scroll-driven schematic assembly (top→bottom)
 * 2. Hero Net Links   — SVG bracket around headline, draws in on Activate
 * 3. Man Overlay      — fire-and-forget GIF on Enter
 * 4. Hero Logo        — anchored artefact, fades on scroll
 * 5. Glyph Particles  — X / square / mini-node in 3 depth layers
 * 6. Globe Enhancement— lat/lon lines injected into Three.js scene
 */
(function () {
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─────────────────────────────────────────────────────────────
  // 1. SIDE NETWORKS — scroll-driven schematic assembly
  //    Strict 3-column grid, no jitter.
  //    Rows appear top→bottom as scroll progresses 0→80%.
  //    Reads as "instrumentation being constructed."
  // ─────────────────────────────────────────────────────────────
  function initSideNetworks() {
    if (prefersReduced) return;

    const GRID   = 60;
    const NODE_R = 1.6;
    const COLS   = [20, 55, 90]; // 3 columns within 110px strip

    ['side-net-left', 'side-net-right'].forEach(id => {
      const canvas = document.getElementById(id);
      if (!canvas) return;

      const W = 110;
      let H   = window.innerHeight;
      canvas.width  = W;
      canvas.height = H;

      const ctx = canvas.getContext('2d');
      let scrollProgress = 0;

      window.addEventListener('scroll', () => {
        scrollProgress = Math.min(1, window.scrollY / window.innerHeight);
      }, { passive: true });

      function buildGrid() {
        const rowCount = Math.ceil(H / GRID) + 1;
        const nCols    = COLS.length;
        const nodes    = [];
        const edges    = [];

        // Build nodes in row-major order so nodeAt() is index arithmetic
        for (let row = 0; row <= rowCount; row++) {
          const y = row * GRID;
          COLS.forEach((x, ci) => {
            nodes.push({
              x, y,
              threshold: Math.min(0.80, (row / rowCount) * 0.85),
            });
          });
        }

        const nodeAt = (row, ci) => nodes[row * nCols + ci];

        // Horizontal edges
        for (let row = 0; row <= rowCount; row++) {
          for (let ci = 0; ci < nCols - 1; ci++) {
            const a = nodeAt(row, ci);
            const b = nodeAt(row, ci + 1);
            if (a && b) edges.push({ a, b, threshold: Math.max(a.threshold, b.threshold) + 0.008 });
          }
        }

        // Vertical edges
        for (let row = 0; row < rowCount; row++) {
          for (let ci = 0; ci < nCols; ci++) {
            const a = nodeAt(row, ci);
            const b = nodeAt(row + 1, ci);
            if (a && b) edges.push({ a, b, threshold: Math.max(a.threshold, b.threshold) + 0.008 });
          }
        }

        return { nodes, edges };
      }

      let grid = buildGrid();

      function draw() {
        ctx.clearRect(0, 0, W, H);
        const sp = scrollProgress;

        grid.edges.forEach(e => {
          if (sp < e.threshold) return;
          const t     = Math.min(1, (sp - e.threshold) / 0.04);
          const alpha = t * 0.14;
          ctx.strokeStyle = `rgba(17,26,17,${alpha.toFixed(3)})`;
          ctx.lineWidth   = 0.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(e.a.x, e.a.y);
          ctx.lineTo(e.b.x, e.b.y);
          ctx.stroke();
        });

        grid.nodes.forEach(n => {
          if (sp < n.threshold) return;
          const t     = Math.min(1, (sp - n.threshold) / 0.03);
          const alpha = t * 0.28;
          ctx.fillStyle = `rgba(17,26,17,${alpha.toFixed(3)})`;
          ctx.fillRect(Math.round(n.x - NODE_R), Math.round(n.y - NODE_R), Math.round(NODE_R * 2), Math.round(NODE_R * 2));
        });

        requestAnimationFrame(draw);
      }

      requestAnimationFrame(draw);

      window.addEventListener('resize', () => {
        H             = window.innerHeight;
        canvas.height = H;
        grid          = buildGrid();
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 2. HERO NETWORK LINKS — SVG bracket, draws in on Activate
  //    8 corner segments (4 L-corners) + 2 center dashes.
  //    All arm lengths are multiples of grid (60px).
  //    Animates via stroke-dashoffset stagger.
  // ─────────────────────────────────────────────────────────────
  function initHeroNetworkLinks() {
    return; // removed — rectangular frame replaced by scanner corner brackets on face canvas
    const btn = document.getElementById('splash-btn');
    if (!svg || !btn) return;

    const G = 60;

    function buildLines() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cx = vw / 2;
      const cy = vh / 2;

      // Snap half-extents to nearest grid multiple
      const hw  = Math.round(Math.min(vw * 0.42, 400) / G) * G;
      const hh  = Math.round(Math.min(vh * 0.22, 180) / G) * G;
      const arm = G * 3; // 180px arm

      const x1 = cx - hw, x2 = cx + hw;
      const y1 = cy - hh, y2 = cy + hh;

      return [
        // TL corner
        [x1,      y1,      x1 + arm, y1      ],
        [x1,      y1,      x1,       y1 + arm],
        // TR corner
        [x2,      y1,      x2 - arm, y1      ],
        [x2,      y1,      x2,       y1 + arm],
        // BL corner
        [x1,      y2,      x1 + arm, y2      ],
        [x1,      y2,      x1,       y2 - arm],
        // BR corner
        [x2,      y2,      x2 - arm, y2      ],
        [x2,      y2,      x2,       y2 - arm],
        // Centre top/bottom dashes — faded in separately
        [cx - arm * 0.5, y1, cx + arm * 0.5, y1],
        [cx - arm * 0.5, y2, cx + arm * 0.5, y2],
      ];
    }

    function renderSvg() {
      const vw = window.innerWidth, vh = window.innerHeight;
      svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
      svg.setAttribute('width', vw);
      svg.setAttribute('height', vh);
      svg.innerHTML = '';

      buildLines().forEach((coords, i) => {
        const [ax, ay, bx, by] = coords;
        const len  = Math.hypot(bx - ax, by - ay);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');

        line.setAttribute('x1', ax);
        line.setAttribute('y1', ay);
        line.setAttribute('x2', bx);
        line.setAttribute('y2', by);
        line.setAttribute('stroke', '#111a11');
        line.setAttribute('stroke-width', '0.8');

        if (i >= 8) {
          // Centre dashes — opacity approach (dashed pattern can't use dashoffset cleanly)
          line.setAttribute('stroke-opacity', '0.22');
          line.setAttribute('stroke-dasharray', '3 7');
          line.style.opacity = '0';
        } else {
          // Corner brackets — draw-in via dashoffset
          line.setAttribute('stroke-opacity', '0.30');
          line.style.strokeDasharray  = `${len}`;
          line.style.strokeDashoffset = `${len}`;
        }

        line.dataset.idx = i;
        svg.appendChild(line);
      });
    }

    renderSvg();
    window.addEventListener('resize', renderSvg);

    btn.addEventListener('click', () => {
      const lines = svg.querySelectorAll('line');
      lines.forEach((line, i) => {
        // Staggered draw-in: 150ms initial hold, then 110ms between each segment
        setTimeout(() => {
          if (i >= 8) {
            line.style.transition = 'opacity 0.9s cubic-bezier(0.16,1,0.3,1)';
            line.style.opacity    = '1';
          } else {
            line.style.transition       = 'stroke-dashoffset 1.4s cubic-bezier(0.16,1,0.3,1)';
            line.style.strokeDashoffset = '0';
          }
        }, 1850 + i * 110);
      });
    }, { once: true });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. MAN OVERLAY — fire-and-forget on Enter click
  //    gif-b has transparency on 88/89 frames — used directly.
  // ─────────────────────────────────────────────────────────────
  function initManOverlay() {
    if (prefersReduced) return;

    const el  = document.getElementById('manOverlay');
    const btn = document.getElementById('splash-btn');
    if (!el || !btn) return;

    btn.addEventListener('click', () => {
      setTimeout(() => {
        el.style.display = 'block';
        el.getBoundingClientRect();
        el.classList.add('man-visible', 'man-floating');

        setTimeout(() => {
          el.classList.remove('man-visible');
          el.classList.add('man-out');
          setTimeout(() => {
            el.style.display = 'none';
            el.classList.remove('man-floating', 'man-out');
          }, 400);
        }, 2800);
      }, 1400);
    }, { once: true });
  }

  // ─────────────────────────────────────────────────────────────
  // 4. HERO LOGO OVERLAY — appears on Activate, fades on scroll
  // ─────────────────────────────────────────────────────────────
  function initHeroLogoOverlay() {
    const el = document.getElementById('heroLogoOverlay');
    if (!el) return;

    let activated = false;

    // Logo appears when hero is revealed — synced with head entrance (gl:activated)
    window.addEventListener('gl:activated', () => {
      activated = true;
      // Clear any stale classes (bfcache restore or same-page replay)
      el.classList.remove('hero-logo-visible', 'hero-logo-floating', 'hero-logo-out');
      void el.offsetWidth; // force reflow so transition re-arms from opacity:0
      el.classList.add('hero-logo-visible');
      if (!prefersReduced) el.classList.add('hero-logo-floating');
    }, { once: true });

    // Scroll-linked reversible: hide when scrolled down, restore on scroll back up
    const THRESHOLD = 120; // px before logo hides
    window.addEventListener('scroll', () => {
      if (!activated) return;
      if (window.scrollY > THRESHOLD) {
        el.classList.remove('hero-logo-visible', 'hero-logo-floating');
        el.classList.add('hero-logo-out');
      } else {
        el.classList.remove('hero-logo-out');
        el.classList.add('hero-logo-visible');
        if (!prefersReduced) el.classList.add('hero-logo-floating');
      }
    }, { passive: true });
  }

  // ─────────────────────────────────────────────────────────────
  // 5. GLYPH PARTICLES — network primitives in 3 depth layers
  //    Types: X mark / bit square / mini-node cluster
  //    Near layer: larger, faster, higher opacity
  //    Far layer : smaller, slower, lower opacity
  //    Cursor parallax. Safe zone keeps text area clear.
  // ─────────────────────────────────────────────────────────────
  function initGlyphParticles() {
    if (prefersReduced) return;

    const canvas = document.getElementById('glyphParticles');
    if (!canvas) return;

    let W = window.innerWidth, H = window.innerHeight;
    canvas.width  = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');

    // Layer definitions — all render as filled pixel squares
    // Counts set to 0: irregular drifting dots disrupt the uniform grid aesthetic
    const LAYERS = [
      { opacity: 0.36, sizeScale: 1.1, speed: 0.45, parallax: 6,  count: 0  }, // near
      { opacity: 0.22, sizeScale: 0.9, speed: 0.28, parallax: 3,  count: 0  }, // mid
      { opacity: 0.13, sizeScale: 0.65, speed: 0.16, parallax: 1, count: 0  }, // far
    ];

    // Deterministic seeded RNG — same particles every load
    let seed = 1337;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    function buildParticles() {
      seed = 1337;
      const pts = [];
      // Safe zone: avoid placing particles over the headline text block
      const sx1 = W * 0.22, sx2 = W * 0.78;
      const sy1 = H * 0.28, sy2 = H * 0.72;

      LAYERS.forEach((layer) => {
        for (let i = 0; i < layer.count; i++) {
          let x, y, tries = 0;
          do {
            x = rand() * W;
            y = rand() * H;
            tries++;
          } while (x > sx1 && x < sx2 && y > sy1 && y < sy2 && tries < 16);

          pts.push({
            x, y,
            driftX:  (rand() - 0.5) * 20 * layer.speed,
            driftY:  (rand() - 0.5) * 14 * layer.speed,
            phase:   rand() * Math.PI * 2,
            size:    Math.max(1, Math.round((1.5 + rand() * 1.5) * layer.sizeScale)),
            opacity: layer.opacity * (0.75 + rand() * 0.25),
            speed:   layer.speed   * (0.8  + rand() * 0.4),
            parallax: layer.parallax,
          });
        }
      });
      return pts;
    }

    let particles = buildParticles();

    let mxT = 0, myT = 0, mx = 0, my = 0;
    window.addEventListener('mousemove', e => {
      mxT = (e.clientX / W - 0.5) * 2;
      myT = (e.clientY / H - 0.5) * 2;
    }, { passive: true });

    let heroVisible = true;
    window.addEventListener('scroll', () => {
      heroVisible = window.scrollY < H * 0.9;
    }, { passive: true });

    // Pixel square drawer — crisp, pixel-aligned filled rectangle
    const drawPixel = (x, y, s) => {
      const ix = Math.round(x) - Math.round(s * 0.5);
      const iy = Math.round(y) - Math.round(s * 0.5);
      ctx.fillRect(ix, iy, s, s);
    };

    function draw(ts) {
      ctx.clearRect(0, 0, W, H);

      if (heroVisible) {
        const t = ts * 0.001;
        mx += (mxT - mx) * 0.04;
        my += (myT - my) * 0.04;

        ctx.fillStyle = '#111a11';
        particles.forEach(p => {
          const ox = Math.sin(t * p.speed        + p.phase) * Math.abs(p.driftX);
          const oy = Math.cos(t * p.speed * 0.71 + p.phase) * Math.abs(p.driftY);
          const px = p.x + ox + mx * p.parallax;
          const py = p.y + oy + my * p.parallax;

          ctx.globalAlpha = p.opacity;
          drawPixel(px, py, p.size);
        });
        ctx.globalAlpha = 1;
      }

      requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);

    window.addEventListener('resize', () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W;
      canvas.height = H;
      particles = buildParticles();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 6. GLOBE ENHANCEMENT — lat/lon lines + equator in Three.js
  // ─────────────────────────────────────────────────────────────
  function initGlobeEnhancement() {
    if (typeof THREE === 'undefined') return;

    window.onGlobeReady = function (scene) {
      if (!scene) return;

      const R = 2.5, LAT_STEPS = 8, LON_STEPS = 12, PTS = 80;

      const mat = new THREE.LineBasicMaterial({ color: 0x1a2a1a, transparent: true, opacity: 0.38 });

      for (let li = 1; li < LAT_STEPS; li++) {
        const lat = -90 + li * (180 / LAT_STEPS);
        const phi = (90 - lat) * (Math.PI / 180);
        const ringR = R * Math.sin(phi), y = R * Math.cos(phi);
        const pts = [];
        for (let p = 0; p <= PTS; p++) {
          const theta = (p / PTS) * Math.PI * 2;
          pts.push(new THREE.Vector3(ringR * Math.cos(theta), y, ringR * Math.sin(theta)));
        }
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat.clone()));
      }

      for (let lo = 0; lo < LON_STEPS; lo++) {
        const theta = (lo / LON_STEPS) * Math.PI * 2;
        const pts = [];
        for (let p = 0; p <= PTS; p++) {
          const phi = (p / PTS) * Math.PI;
          pts.push(new THREE.Vector3(
            R * Math.sin(phi) * Math.cos(theta),
            R * Math.cos(phi),
            R * Math.sin(phi) * Math.sin(theta)
          ));
        }
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat.clone()));
      }

      const eqMat = new THREE.LineBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0.45 });
      const eqPts = [];
      for (let p = 0; p <= PTS; p++) {
        const theta = (p / PTS) * Math.PI * 2;
        eqPts.push(new THREE.Vector3(R * Math.cos(theta), 0, R * Math.sin(theta)));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(eqPts), eqMat));
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────
  function init() {
    initSideNetworks();
    initHeroNetworkLinks();
    initManOverlay();
    initHeroLogoOverlay();
    initGlyphParticles();
    initGlobeEnhancement();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
