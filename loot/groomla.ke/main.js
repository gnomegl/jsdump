/**
 * GROOM LAKE - Main JavaScript
 * Three.js Globe + GSAP ScrollTrigger
 */

(function() {
  'use strict';

  // ============================================
  // Configuration
  // ============================================
  const CONFIG = {
    colors: {
      accent: 0xff2d2d,
      accentRGB: { r: 1, g: 0.176, b: 0.176 },
      background: 0xc8d4c4,
      particles: 0x1e1e1e,
      connections: 0xff2d2d
    },
    globe: {
      radius: 2.5,
      particleCount: 2000,
      connectionDistance: 0.5,
      rotationSpeed: 0.0003
    },
    performance: {
      lowPowerParticles: 500,
      mobileParticles: 800
    }
  };

  // ============================================
  // Feature Detection
  // ============================================
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Viewport-width + coarse-pointer match — same source of truth as the
  // CSS mobile breakpoint (767px) and the splash gate in splash-head-mobile.js.
  // Intentionally NOT based on navigator.userAgent so iframe simulators,
  // DevTools device presets, and real phones all behave identically.
  const isMobile = window.matchMedia('(max-width: 767px), (pointer: coarse) and (max-width: 1023px)').matches;
  const isLowPower = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;

  // ============================================
  // Network map — structured geographic layout
  // ============================================

  // Camera at z=7, FOV=60° → visible ±5.7w × ±3.2h at z=0
  function geoToFlat(lat, lon) {
    return [lon / 180 * 5.4, lat / 90 * 2.9, 0];
  }

  // Key operation nodes [lat, lon]
  const NETWORK_NODES = [
    [ 40.71,  -74.01],  //  0 NYC
    [ 38.91,  -77.04],  //  1 WDC
    [ 25.77,  -80.19],  //  2 MIA
    [ 51.51,   -0.13],  //  3 LDN
    [ 48.85,    2.35],  //  4 PAR
    [ 50.11,    8.68],  //  5 FRA
    [ 41.01,   28.98],  //  6 IST
    [ 25.20,   55.27],  //  7 DXB
    [ 24.69,   46.72],  //  8 RUH
    [ 28.66,   77.23],  //  9 DEL
    [  1.35,  103.82],  // 10 SIN
    [ 22.32,  114.17],  // 11 HKG
    [ 35.69,  139.69],  // 12 TYO
    [-33.87,  151.21],  // 13 SYD
    [-23.55,  -46.63],  // 14 SAO
    [ 53.55, -113.49],  // 15 Edmonton
    [ 45.75,    4.85],  // 16 Lyon
    [ 39.93,   32.86],  // 17 Ankara
    [ 45.50,  -73.57],  // 18 Montreal
    [ 52.37,    4.90],  // 19 Amsterdam
    [ 43.85,   18.36],  // 20 Sarajevo
    [ 43.10,  131.90],  // 21 Vladivostok
    [ 39.02,  125.75],  // 22 Pyongyang
    [ 52.52,   13.41],  // 23 Berlin
    [ 21.49,   39.19],  // 24 Jeddah
    [ 33.75,  -84.39],  // 25 Atlanta
  ];

  // Key node connections (sparse intelligence network)
  const NODE_CONNECTIONS = [
    [0, 3],  [0, 1],  [0, 14], [0, 15], [0, 18],
    [1, 25], [3, 4],  [3, 6],  [3, 19], [4, 16],
    [5, 23], [6, 7],  [6, 17], [7, 8],  [8, 9],
    [8, 24], [9, 10], [10,11], [11,12], [12,13],
    [12,21], [21,22], [19,20],
  ];

  // Build geographic grid: every 15° lat × 15° lon
  // This becomes the structured "world grid" visible as flat map
  const GRID_LAT_STEP = 15;
  const GRID_LON_STEP = 15;
  const GRID_LATS = [];
  const GRID_LONS = [];
  for (let lat = -75; lat <= 75; lat += GRID_LAT_STEP) GRID_LATS.push(lat);
  for (let lon = -180; lon < 180; lon += GRID_LON_STEP) GRID_LONS.push(lon);
  // GRID_LATS.length = 11, GRID_LONS.length = 24 → 264 grid nodes

  const GRID_NODES = [];
  GRID_LATS.forEach(lat => GRID_LONS.forEach(lon => GRID_NODES.push([lat, lon])));

  // Grid connections: adjacent lat-lon cells (forms the world map mesh)
  const GRID_CONNECTIONS = [];
  const nLat = GRID_LATS.length;
  const nLon = GRID_LONS.length;
  for (let li = 0; li < nLat; li++) {
    for (let lo = 0; lo < nLon; lo++) {
      const idx     = NETWORK_NODES.length + li * nLon + lo;
      const rightLo = (lo + 1) % nLon;
      const rightIdx = NETWORK_NODES.length + li * nLon + rightLo;
      GRID_CONNECTIONS.push([idx, rightIdx]);           // horizontal ring
      if (li + 1 < nLat) {
        const upIdx = NETWORK_NODES.length + (li + 1) * nLon + lo;
        GRID_CONNECTIONS.push([idx, upIdx]);            // vertical
      }
    }
  }
  // All connection pairs combined
  const ALL_CONNECTIONS = [
    ...NODE_CONNECTIONS,
    ...GRID_CONNECTIONS,
  ];

  // Perimeter connections: only the outer border of the lat/lon grid.
  // Top row + bottom row (horizontal) + left column + right column (vertical).
  // These live at the screen edges and never cross through the headline area.
  const PERIMETER_CONNECTIONS = [];
  for (let li = 0; li < nLat; li++) {
    for (let lo = 0; lo < nLon; lo++) {
      const idx    = NETWORK_NODES.length + li * nLon + lo;
      const isTop  = li === nLat - 1;
      const isBot  = li === 0;
      const isLeft = lo === 0;
      const isRight = lo === nLon - 1;

      // Top / bottom horizontal segments (exclude the lon wrap-around seam)
      if ((isTop || isBot) && lo < nLon - 1) {
        PERIMETER_CONNECTIONS.push([idx, NETWORK_NODES.length + li * nLon + (lo + 1)]);
      }
      // Left / right vertical segments
      if ((isLeft || isRight) && li < nLat - 1) {
        PERIMETER_CONNECTIONS.push([idx, NETWORK_NODES.length + (li + 1) * nLon + lo]);
      }
    }
  }

  // Module-level callback — set by initFaceModel(), consumed by initGlobeScroll()
  let setFaceDissolve = null;

  // ============================================
  // Globe Animation Class
  // ============================================
  class GlobeAnimation {
    constructor(canvas) {
      this.canvas = canvas;
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.scrollProgress = 0;
      this.scrollY = 0;
      this.isInitialized = false;
      this.animationId = null;

      if (prefersReducedMotion) {
        this.createStaticFallback();
        return;
      }

      this.init();
    }

    createStaticFallback() {
      // Static gradient background for reduced motion
      this.canvas.style.background = 'radial-gradient(ellipse at center, rgba(255,45,45,0.1) 0%, transparent 50%)';
    }

    init() {
      // Scene
      this.scene = new THREE.Scene();

      // Camera
      this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 0.1, 1000);
      this.camera.position.z = 7;  // further back — globe reads as background

      // Renderer
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: !isMobile,
        alpha: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(this.width, this.height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      // Compute geographic node positions (no particle dots)
      this.initNodePositions();

      // Flat network overlay — lines only, fades/transforms as globe forms
      this.createFlatConnections();

      // Outer perimeter border — top/bottom rows + left/right columns of lat/lon grid
      this.createPerimeterConnections();

      // Regular interior lat/lon grid (consistent 15° lattice, no irregular lines)
      this.createGridInteriorLines();

      // Dynamic nearest-neighbour connections (NETWORK_NODES only, scroll-driven)
      this.createNetworkConnections();

      // Create globe structure (hidden initially)
      this.createGlobeStructure();

      // Create connection arcs
      this.createArcs();

      // Create ping points
      this.createPings();

      // Start animation
      this.animate();

      // Handle resize
      window.addEventListener('resize', () => this.onResize());

      this.isInitialized = true;

      if (typeof window.onGlobeReady === 'function') window.onGlobeReady(this.scene);
    }

    initNodePositions() {
      // Compute flat + globe positions for all geographic nodes
      const allNodes = [...NETWORK_NODES, ...GRID_NODES];
      this.nodeCount = allNodes.length; // 26 + 264 = 290

      this.flatPositions    = new Float32Array(this.nodeCount * 3);
      this.globePositions   = new Float32Array(this.nodeCount * 3);
      this.currentPositions = new Float32Array(this.nodeCount * 3);

      const r = CONFIG.globe.radius;
      allNodes.forEach(([lat, lon], i) => {
        const i3 = i * 3;
        const fp = geoToFlat(lat, lon);

        // Flat positions
        this.flatPositions[i3]     = fp[0];
        this.flatPositions[i3 + 1] = fp[1];
        this.flatPositions[i3 + 2] = 0;

        // Globe positions — correct lat/lon → sphere mapping
        const phi   = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        this.globePositions[i3]     = -r * Math.sin(phi) * Math.cos(theta);
        this.globePositions[i3 + 1] =  r * Math.cos(phi);
        this.globePositions[i3 + 2] =  r * Math.sin(phi) * Math.sin(theta);

        // Start at flat
        this.currentPositions[i3]     = fp[0];
        this.currentPositions[i3 + 1] = fp[1];
        this.currentPositions[i3 + 2] = 0;
      });

      // Precompute per-node crumple delays.
      // Top of the map (high Y) collapses first → delay ≈ 0.
      // Bottom (low Y) is last → delay ≈ 0.55 (fraction of phase-1 progress).
      this.crumpleDelays = new Float32Array(this.nodeCount);
      for (let i = 0; i < this.nodeCount; i++) {
        const fy    = this.flatPositions[i * 3 + 1];
        const normY = Math.max(0, Math.min(1, (fy + 2.9) / 5.8)); // 0=bottom, 1=top
        this.crumpleDelays[i] = (1 - normY) * 0.55;
      }

      // All-node dots (city + grid) — hidden at rest, appear during crumple
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(this.currentPositions, 3));
      this.nodePoints   = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0x1c1c1c, size: 0.06, transparent: true, opacity: 0, sizeAttenuation: true,
      }));
      this.nodesPosAttr = geo.attributes.position;
      this.scene.add(this.nodePoints);

      // Grid-intersection dots — GRID_NODES only, visible at rest, aligned with
      // gridInteriorLines. These ARE the panel grid dots. Fade out as crumple starts.
      const gridStart   = NETWORK_NODES.length;
      const gridCount   = GRID_NODES.length; // 264 (11 lat × 24 lon)
      const gridDotPos  = new Float32Array(gridCount * 3);
      for (let i = 0; i < gridCount; i++) {
        const src = (gridStart + i) * 3;
        gridDotPos[i*3]   = this.flatPositions[src];
        gridDotPos[i*3+1] = this.flatPositions[src + 1];
        gridDotPos[i*3+2] = this.flatPositions[src + 2];
      }
      const gridDotGeo  = new THREE.BufferGeometry();
      gridDotGeo.setAttribute('position', new THREE.BufferAttribute(gridDotPos, 3));
      this.gridDots     = new THREE.Points(gridDotGeo, new THREE.PointsMaterial({
        color: 0x1c1c1c, size: 0.058, transparent: true, opacity: 0.30, sizeAttenuation: true,
      }));
      this.gridDotAttr  = gridDotGeo.attributes.position;
      this.scene.add(this.gridDots);
    }

    createFlatConnections() {
      // Use only the intentional city-to-city connections (NODE_CONNECTIONS).
      // GRID_CONNECTIONS (the geographic lat/lon mesh) is excluded here —
      // it projects as a large irregular rectangle that fights the CSS grid.
      const PAIRS = NODE_CONNECTIONS;
      const totalConnections = PAIRS.length;
      const verts = new Float32Array(totalConnections * 2 * 3);

      // Initialise with flat positions
      PAIRS.forEach(([a, b], ci) => {
        const vi = ci * 6;
        verts[vi]     = this.flatPositions[a * 3];
        verts[vi + 1] = this.flatPositions[a * 3 + 1];
        verts[vi + 2] = this.flatPositions[a * 3 + 2];
        verts[vi + 3] = this.flatPositions[b * 3];
        verts[vi + 4] = this.flatPositions[b * 3 + 1];
        verts[vi + 5] = this.flatPositions[b * 3 + 2];
      });

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));

      const mat = new THREE.LineBasicMaterial({
        color: 0x1c1c1c,
        transparent: true,
        opacity: 0,
      });

      this.flatConnections    = new THREE.LineSegments(geo, mat);
      this.connectionPairs    = PAIRS; // keep reference for per-frame updates
      this.scene.add(this.flatConnections);
    }

    createPerimeterConnections() {
      const PAIRS = PERIMETER_CONNECTIONS;
      const verts = new Float32Array(PAIRS.length * 2 * 3);

      PAIRS.forEach(([a, b], ci) => {
        const vi = ci * 6;
        verts[vi]     = this.flatPositions[a * 3];
        verts[vi + 1] = this.flatPositions[a * 3 + 1];
        verts[vi + 2] = this.flatPositions[a * 3 + 2];
        verts[vi + 3] = this.flatPositions[b * 3];
        verts[vi + 4] = this.flatPositions[b * 3 + 1];
        verts[vi + 5] = this.flatPositions[b * 3 + 2];
      });

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));

      const mat = new THREE.LineBasicMaterial({
        color: 0x1c1c1c,
        transparent: true,
        opacity: 0.30,
      });

      this.perimeterLines = new THREE.LineSegments(geo, mat);
      this.perimeterPairs = PAIRS;
      this.scene.add(this.perimeterLines);
    }

    createGridInteriorLines() {
      // The full lat/lon interior mesh — regular 15° grid lattice.
      // Gives a consistent, disciplined grid pattern with no irregular lines.
      const PAIRS = GRID_CONNECTIONS;
      const verts = new Float32Array(PAIRS.length * 2 * 3);

      PAIRS.forEach(([a, b], ci) => {
        const vi = ci * 6;
        verts[vi]     = this.flatPositions[a * 3];
        verts[vi + 1] = this.flatPositions[a * 3 + 1];
        verts[vi + 2] = this.flatPositions[a * 3 + 2];
        verts[vi + 3] = this.flatPositions[b * 3];
        verts[vi + 4] = this.flatPositions[b * 3 + 1];
        verts[vi + 5] = this.flatPositions[b * 3 + 2];
      });

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));

      const mat = new THREE.LineBasicMaterial({
        color: 0x1c1c1c,
        transparent: true,
        opacity: 0.24,  // clearly visible regular grid at rest
      });

      this.gridInteriorLines = new THREE.LineSegments(geo, mat);
      this.gridInteriorPairs = PAIRS;
      this.scene.add(this.gridInteriorLines);
    }

    createNetworkConnections() {
      // Dynamic nearest-neighbour connections among the 26 NETWORK_NODES only
      // Max pairs: 26 * 25 / 2 = 325
      const MAX_PAIRS = 325;
      const verts = new Float32Array(MAX_PAIRS * 2 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geo.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({
        color: 0x1c1c1c,
        transparent: true,
        opacity: 0.0,
      });
      this.networkLines = new THREE.LineSegments(geo, mat);
      this.scene.add(this.networkLines);
    }

    updateNetworkConnections(progress) {
      if (!this.networkLines) return;
      const n   = NETWORK_NODES.length; // 26
      const cur = this.currentPositions;
      // Threshold widens as scroll progresses so network density increases
      const threshold = 1.0 + progress * 0.9;
      const posArr = this.networkLines.geometry.attributes.position.array;
      let lineIdx = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const i3 = i * 3, j3 = j * 3;
          const dx = cur[i3]   - cur[j3];
          const dy = cur[i3+1] - cur[j3+1];
          const dz = cur[i3+2] - cur[j3+2];
          if (Math.sqrt(dx*dx + dy*dy + dz*dz) < threshold) {
            const vi = lineIdx * 6;
            posArr[vi]   = cur[i3];   posArr[vi+1] = cur[i3+1]; posArr[vi+2] = cur[i3+2];
            posArr[vi+3] = cur[j3];   posArr[vi+4] = cur[j3+1]; posArr[vi+5] = cur[j3+2];
            lineIdx++;
          }
        }
      }
      this.networkLines.geometry.attributes.position.needsUpdate = true;
      this.networkLines.geometry.setDrawRange(0, lineIdx * 2);
      this.networkLines.material.opacity = Math.min(progress * 2, 1) * 0.65;
    }

    createGlobeStructure() {
      // Create wireframe globe
      const geometry = new THREE.IcosahedronGeometry(CONFIG.globe.radius, 2);
      const material = new THREE.MeshBasicMaterial({
        color: 0x181818,
        wireframe: true,
        transparent: true,
        opacity: 0
      });

      this.globeWireframe = new THREE.Mesh(geometry, material);
      this.scene.add(this.globeWireframe);

      // Create outer ring
      const ringGeometry = new THREE.RingGeometry(CONFIG.globe.radius * 1.3, CONFIG.globe.radius * 1.35, 64);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x181818,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });

      this.ring = new THREE.Mesh(ringGeometry, ringMaterial);
      this.ring.rotation.x = Math.PI / 2;
      this.scene.add(this.ring);
    }

    createArcs() {
      // Create connection arcs between points on the globe
      this.arcs = [];
      const arcCount = isMobile ? 3 : 6;

      for (let i = 0; i < arcCount; i++) {
        const startPhi = Math.random() * Math.PI;
        const startTheta = Math.random() * Math.PI * 2;
        const endPhi = Math.random() * Math.PI;
        const endTheta = Math.random() * Math.PI * 2;

        const start = new THREE.Vector3(
          CONFIG.globe.radius * Math.sin(startPhi) * Math.cos(startTheta),
          CONFIG.globe.radius * Math.sin(startPhi) * Math.sin(startTheta),
          CONFIG.globe.radius * Math.cos(startPhi)
        );

        const end = new THREE.Vector3(
          CONFIG.globe.radius * Math.sin(endPhi) * Math.cos(endTheta),
          CONFIG.globe.radius * Math.sin(endPhi) * Math.sin(endTheta),
          CONFIG.globe.radius * Math.cos(endPhi)
        );

        const mid = start.clone().add(end).multiplyScalar(0.5);
        mid.normalize().multiplyScalar(CONFIG.globe.radius * 1.5);

        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const points = curve.getPoints(50);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: 0x181818,
          transparent: true,
          opacity: 0
        });

        const arc = new THREE.Line(geometry, material);
        this.arcs.push(arc);
        this.scene.add(arc);
      }
    }

    createPings() {
      // Create animated ping points on globe
      this.pings = [];
      const pingCount = isMobile ? 3 : 5;

      for (let i = 0; i < pingCount; i++) {
        const phi = Math.random() * Math.PI;
        const theta = Math.random() * Math.PI * 2;

        const position = new THREE.Vector3(
          CONFIG.globe.radius * Math.sin(phi) * Math.cos(theta),
          CONFIG.globe.radius * Math.sin(phi) * Math.sin(theta),
          CONFIG.globe.radius * Math.cos(phi)
        );

        const geometry = new THREE.SphereGeometry(0.03, 8, 8);
        const material = new THREE.MeshBasicMaterial({
          color: 0x181818,
          transparent: true,
          opacity: 0
        });

        const ping = new THREE.Mesh(geometry, material);
        ping.position.copy(position);
        ping.userData = { phase: Math.random() * Math.PI * 2 };
        this.pings.push(ping);
        this.scene.add(ping);
      }
    }

    updateTransformation(progress) {
      // ── Two-phase crumple: banded collapse → explode to globe ───────
      // Phase 1 (0→0.4): rows collapse top-first; all converge to PEAK_Y.
      // Phase 2 (0.4→1): mass explodes from peak outward to globe positions.
      const ss     = t => t * t * (3 - 2 * t);
      const cur    = this.currentPositions;
      const PEAK_Y = -1.2; // world-Y all nodes converge to at crumple peak

      for (let i = 0; i < this.nodeCount; i++) {
        const i3 = i * 3;
        const fx = this.flatPositions[i3],   fy = this.flatPositions[i3 + 1];
        const gx = this.globePositions[i3],  gy = this.globePositions[i3 + 1], gz = this.globePositions[i3 + 2];

        if (progress <= 0.4) {
          // Top rows collapse first; each band's local progress is delayed by
          // its normalised Y position so the map "tears from the top down".
          const phaseT = progress / 0.4;
          const delay  = this.crumpleDelays[i];
          const rawT   = Math.max(0, Math.min(1, (phaseT - delay) / (1.0 - delay + 0.001)));
          const localT = ss(rawT);

          cur[i3]     = fx * (1 - localT);                    // X collapses toward 0
          cur[i3 + 1] = fy + (PEAK_Y - fy) * localT;          // Y drops to peak
          cur[i3 + 2] = Math.sin(fx * 2.1 + fy * 1.8) * localT * 0.68; // Z ripple — deeper crease
        } else {
          // Explode from crumple peak to globe positions
          const t = ss((progress - 0.4) / 0.6);
          cur[i3]     = gx * t;
          cur[i3 + 1] = PEAK_Y + (gy - PEAK_Y) * t;
          cur[i3 + 2] = gz * t;
        }
      }

      // Camera zoom: pull in at crumple peak, ease back for globe reveal
      const camBase = 7.0, camClose = 4.8, camGlobe = 6.2;
      if (progress <= 0.4) {
        this.camera.position.z = camBase  + (camClose - camBase)  * ss(progress / 0.4);
      } else {
        this.camera.position.z = camClose + (camGlobe - camClose) * ss((progress - 0.4) / 0.6);
      }

      // Sync visible node dot positions
      if (this.nodesPosAttr) {
        this.nodesPosAttr.needsUpdate = true;
      }

      // Grid-intersection dots: follow crumple, fade out before layout breaks
      if (this.gridDots && this.gridDotAttr) {
        const gda       = this.gridDotAttr.array;
        const gridStart = NETWORK_NODES.length;
        const gridCount = GRID_NODES.length;
        for (let i = 0; i < gridCount; i++) {
          const src   = (gridStart + i) * 3;
          gda[i*3]   = cur[src];
          gda[i*3+1] = cur[src + 1];
          gda[i*3+2] = cur[src + 2];
        }
        this.gridDotAttr.needsUpdate = true;
        // Visible at rest (0.32), fade to 0 by progress=0.35
        const dotAlpha = Math.max(0, 0.32 - progress * (0.32 / 0.35));
        this.gridDots.material.opacity = dotAlpha;
        this.gridDots.visible = dotAlpha > 0.005;
      }

      // Dynamic nearest-neighbour connections — density grows with scroll
      this.updateNetworkConnections(progress);

      // All-node dots: invisible at rest, fade in as crumple begins, settle on globe
      if (this.nodePoints) {
        if (progress <= 0.4) {
          this.nodePoints.material.opacity = (progress / 0.4) * 0.48;
        } else {
          this.nodePoints.material.opacity = 0.48 + ((progress - 0.4) / 0.6) * 0.22;
        }
      }

      // City-to-city diagonal connection lines are hidden entirely.
      // They appear as irregular stray strokes during the crumple and add visual noise.
      if (this.flatConnections) this.flatConnections.visible = false;

      // Perimeter outline follows node positions — outer border only, fades with crumple
      if (this.perimeterLines && this.perimeterPairs) {
        const permAttr = this.perimeterLines.geometry.attributes.position;
        const permArr  = permAttr.array;

        this.perimeterPairs.forEach(([a, b], ci) => {
          const vi = ci * 6;
          permArr[vi]     = cur[a * 3];
          permArr[vi + 1] = cur[a * 3 + 1];
          permArr[vi + 2] = cur[a * 3 + 2];
          permArr[vi + 3] = cur[b * 3];
          permArr[vi + 4] = cur[b * 3 + 1];
          permArr[vi + 5] = cur[b * 3 + 2];
        });
        permAttr.needsUpdate = true;

        let permAlpha;
        if (progress <= 0.4) {
          permAlpha = 0.24 * (1 - (progress / 0.4) * 0.5); // 0.24 → 0.12
        } else {
          permAlpha = Math.max(0, 1 - (progress - 0.4) / 0.6) * 0.12;
        }
        this.perimeterLines.material.opacity = permAlpha;
        this.perimeterLines.visible = permAlpha > 0.005;
      }

      // Interior grid lattice — regular 15° lat/lon mesh, follows crumple
      if (this.gridInteriorLines && this.gridInteriorPairs) {
        const gAttr = this.gridInteriorLines.geometry.attributes.position;
        const gArr  = gAttr.array;

        this.gridInteriorPairs.forEach(([a, b], ci) => {
          const vi = ci * 6;
          gArr[vi]     = cur[a * 3];
          gArr[vi + 1] = cur[a * 3 + 1];
          gArr[vi + 2] = cur[a * 3 + 2];
          gArr[vi + 3] = cur[b * 3];
          gArr[vi + 4] = cur[b * 3 + 1];
          gArr[vi + 5] = cur[b * 3 + 2];
        });
        gAttr.needsUpdate = true;

        // Grid lines: clearly visible at rest, intensify during crumple, fade on globe
        let gridAlpha;
        if (progress <= 0.4) {
          gridAlpha = 0.16 + (progress / 0.4) * 0.10; // 0.16 → 0.26
        } else {
          gridAlpha = Math.max(0, 1 - (progress - 0.4) / 0.6) * 0.26;
        }
        this.gridInteriorLines.material.opacity = gridAlpha;
        this.gridInteriorLines.visible = gridAlpha > 0.003;
      }

      // Globe wireframe + ring — strong enough to be felt through transparent later sections,
      // naturally blocked by the near-solid threat panel (0.97 bg, no backdrop-filter)
      const globeP = Math.max(0, (progress - 0.4) / 0.6);
      this.globeWireframe.material.opacity = globeP * 0.88;
      this.ring.material.opacity           = globeP * 0.56;

      this.arcs.forEach(arc => {
        arc.material.opacity = Math.max(0, (globeP - 0.3) * 1.4) * 0.72;
      });
      this.pings.forEach(ping => {
        ping.material.opacity = Math.max(0, (globeP - 0.15) * 1.5) * 0.82;
      });
    }

    setScrollProgress(progress) {
      this.scrollProgress = Math.max(0, Math.min(1, progress));
    }

    setScrollY(y) {
      this.scrollY = y || 0;
    }

    animate() {
      this.animationId = requestAnimationFrame(() => this.animate());

      const time = Date.now() * 0.001;
      const sp   = this.scrollProgress;

      // Update node positions + connection lines + element opacities
      this.updateTransformation(sp);

      // Rotation: flat network/grid NEVER rotates.
      // Globe rotation is entirely scroll-driven — ramps in as globe forms (sp > 0.4)
      // and continues spinning as user scrolls further down the page.
      const globeSp  = Math.max(0, (sp - 0.4) / 0.6);
      const globeRot = this.scrollY * 0.0022 * globeSp;

      this.globeWireframe.rotation.y                          = globeRot;
      if (this.nodePoints)     this.nodePoints.rotation.y     = 0;
      if (this.networkLines)   this.networkLines.rotation.y   = 0;
      if (this.flatConnections) this.flatConnections.rotation.y = 0;
      if (this.perimeterLines) this.perimeterLines.rotation.y  = 0;

      // Ping pulse
      this.pings.forEach(ping => {
        const scale = 1 + Math.sin(time * 2 + ping.userData.phase) * 0.3;
        ping.scale.setScalar(scale);
      });

      // Subtle camera drift — only when globe is forming/formed
      this.camera.position.x = Math.sin(time * 0.1) * 0.2 * sp;
      this.camera.position.y = Math.cos(time * 0.1) * 0.1 * sp;
      this.camera.lookAt(0, 0, 0);

      this.renderer.render(this.scene, this.camera);
    }

    onResize() {
      this.width = window.innerWidth;
      this.height = window.innerHeight;

      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(this.width, this.height);
    }

    destroy() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
      }
      if (this.renderer) {
        this.renderer.dispose();
      }
    }
  }

  // ============================================
  // Heading Decrypt — scramble-reveal effect
  // Mirrors the splash TextScramble but works on any heading element.
  // ============================================
  class HeadingDecrypt {
    constructor(el) {
      this.el           = el;
      this.originalHTML = el.innerHTML;
      const nonSpaces   = el.textContent.replace(/\s+/g, '').length;
      this.dur          = Math.max(350, Math.min(850, nonSpaces * 32));
      this._playing     = false;
    }

    // Immediately replace element content with scrambled characters.
    // Call before making the element visible so the first frame is never the final text.
    _preScramble() {
      const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
      let html = '';
      this.el.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          Array.from(node.textContent).forEach(c => {
            html += c.trim() === ''
              ? c
              : `<span class="hd-scr">${CHARS[Math.floor(Math.random() * CHARS.length)]}</span>`;
          });
        } else {
          html += node.outerHTML || '';
        }
      });
      this.el.innerHTML = html;
    }

    play(delay = 0) {
      if (this._playing) return;
      this._playing = true;
      setTimeout(() => this._run(), delay);
    }

    _run() {
      const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
      const el    = this.el;

      // Always parse from the saved original HTML, not the current DOM.
      // This is critical when _preScramble() has already rewritten el.innerHTML —
      // the current DOM contains only <span> elements and has no text nodes,
      // causing allChars to be empty and the animation to skip immediately to final text.
      const tmp = document.createElement('div');
      tmp.innerHTML = this.originalHTML;

      // Parse child nodes into segments — preserves <br>, <span> etc. in place.
      // Segments: { type:'text', chars:[] } or { type:'node', raw:string }
      const segments = [];
      tmp.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          segments.push({ type: 'text', chars: Array.from(node.textContent) });
        } else {
          segments.push({ type: 'node', raw: node.outerHTML || '' });
        }
      });

      // Collect all non-space text positions in order
      const allChars = []; // { si, ci, char }
      segments.forEach((seg, si) => {
        if (seg.type === 'text') {
          seg.chars.forEach((c, ci) => {
            if (c.trim() !== '') allChars.push({ si, ci, char: c });
          });
        }
      });
      const nChars = allChars.length;

      // Randomise reveal order
      const order = Array.from({ length: nChars }, (_, i) => i);
      for (let i = nChars - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }

      // Per-char resolve timestamps spread linearly over dur
      const t0           = performance.now();
      const dur          = this.dur;
      const resolveTimes = order.map((_, idx) => (idx / nChars) * dur);

      // Display buffers — one array of chars per text segment
      const display  = segments.map(seg =>
        seg.type === 'text'
          ? seg.chars.map(c => c.trim() === '' ? c : CHARS[Math.floor(Math.random() * CHARS.length)])
          : null
      );
      const revealed = segments.map(seg =>
        seg.type === 'text' ? new Uint8Array(seg.chars.length) : null
      );

      let nextReveal = 0, lastScramble = 0;
      const SCRAMBLE_INTERVAL = window.innerWidth < 768 ? 110 : 80;

      const frame = (ts) => {
        const elapsed = ts - t0;

        // Reveal chars whose time has come
        while (nextReveal < nChars && elapsed >= resolveTimes[nextReveal]) {
          const { si, ci, char } = allChars[order[nextReveal]];
          revealed[si][ci] = 1;
          display[si][ci]  = char;
          nextReveal++;
        }

        // Scramble unrevealed chars at fixed cadence
        if (ts - lastScramble >= SCRAMBLE_INTERVAL) {
          for (let i = nextReveal; i < nChars; i++) {
            const { si, ci } = allChars[order[i]];
            display[si][ci] = CHARS[Math.floor(Math.random() * CHARS.length)];
          }
          lastScramble = ts;
        }

        // Build HTML — structural nodes (br, span) pass through untouched
        let html = '';
        segments.forEach((seg, si) => {
          if (seg.type === 'node') {
            html += seg.raw;
          } else {
            seg.chars.forEach((c, ci) => {
              if (c.trim() === '') {
                html += c;
              } else if (revealed[si][ci]) {
                html += display[si][ci];
              } else {
                html += `<span class="hd-scr">${display[si][ci]}</span>`;
              }
            });
          }
        });
        el.innerHTML = html;

        if (nextReveal < nChars || elapsed < dur + 80) {
          requestAnimationFrame(frame);
        } else {
          el.innerHTML = this.originalHTML;
        }
      };

      requestAnimationFrame(frame);
    }
  }

  // ============================================
  // GSAP Animations
  // ============================================
  function initGSAPAnimations() {
    gsap.registerPlugin(ScrollTrigger);

    // Hero elements held hidden until Activate fires gl:activated event.
    // No y-offset — text stays in its natural position to prevent layout jump.
    gsap.set('.hero-scroll', { opacity: 0 });

    function revealHeroContent() {
      // hero-title and hero-subtitle are revealed by initHeadingDecrypt (scramble → resolve).
      // Only reveal the scroll indicator here.
      gsap.to('.hero-scroll', { opacity: 1, duration: 1, ease: 'power2.out', delay: 1.5 });
    }

    // Safety timer: fires gl:activated if neither transition.js nor splash.js
    // dispatches it within 1200ms.
    //
    // CRITICAL: only arm this when the splash has already been dismissed in a
    // previous load (gl-activated is set).  When the splash IS currently showing
    // (first visit — gl-activated not yet in sessionStorage), splash.js owns the
    // dispatch and fires it at t≈1750ms after the button click.  Arming the timer
    // here would fire gl:activated at 1200ms — while the hero is still hidden
    // behind the splash — consuming every { once:true } listener before the splash
    // sequence completes, so the hero appears already-resolved when revealed.
    const splashAlreadyDone = sessionStorage.getItem('gl-activated') === '1';
    const safetyTimer = splashAlreadyDone
      ? setTimeout(() => window.dispatchEvent(new Event('gl:activated')), 1200)
      : null;
    window.addEventListener('gl:activated', () => {
      if (safetyTimer) clearTimeout(safetyTimer);
      revealHeroContent();
    }, { once: true });

    // ── Palantir-style section reveals: smooth slide-up, no blur ───────
    // Exclude .section-header — those are handled by the cascade below
    const reveals = document.querySelectorAll('.reveal:not(.section-header)');
    reveals.forEach(el => {
      gsap.fromTo(el,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.70,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            toggleActions: 'play none none none'
          }
        }
      );
    });

    // Section labels + titles: staggered cascade within each section header
    const sectionHeaders = document.querySelectorAll('.section-header');
    sectionHeaders.forEach(header => {
      const lines = header.querySelectorAll('.section-label, .section-title, .section-desc');
      if (!lines.length) return;
      // Make parent container immediately visible (it's a layout wrapper, not an animated element)
      gsap.set(header, { opacity: 1, y: 0 });
      gsap.fromTo(lines,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.65,
          stagger: 0.09,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: header,
            start: 'top 90%',
            toggleActions: 'play none none none'
          }
        }
      );
    });

    // Pillar cards: staggered sweep
    const pillarsGrid = document.getElementById('pillarsGrid');
    if (pillarsGrid) {
      const pillars = pillarsGrid.querySelectorAll('.pillar');
      gsap.fromTo(pillars,
        { opacity: 0, y: 28 },
        {
          opacity: 1,
          y: 0,
          duration: 0.82,
          stagger: 0.12,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: pillarsGrid,
            start: 'top 78%',
            toggleActions: 'play none none none'
          }
        }
      );
    }


    // Stats counter animation
    const stats = document.querySelectorAll('.stat-value[data-value]');
    stats.forEach(stat => {
      const value = parseInt(stat.dataset.value);
      const suffix = stat.textContent.includes('$') ? '$' : '';
      const postfix = stat.textContent.includes('%') ? '%' : 'B+';

      ScrollTrigger.create({
        trigger: stat,
        start: 'top 90%',
        onEnter: () => {
          gsap.to({ val: 0 }, {
            val: value,
            duration: 2,
            ease: 'power2.out',
            onUpdate: function() {
              stat.textContent = suffix + Math.round(this.targets()[0].val) + postfix;
            }
          });
        },
        once: true
      });
    });
  }

  // ============================================
  // Heading Decrypt — init (fires scramble when headings become visible)
  // ============================================
  // ── HeroScramble — port of splash TextScramble ───────────────────────────
  // Element starts empty so the very first painted frame is scrambled chars.
  // settled[] tracks chars whose reveal animation has completed — they get
  // class ht-done (static) instead of ht-rev so re-render ticks never
  // re-fire the CSS animation on already-resolved characters.
  class HeroScramble {
    constructor(el, text) {
      this.el      = el;
      this.text    = text;
      this.settled = new Array(text.length).fill(false);
      const CHARS  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*/-+';
      this._rand   = () => CHARS[Math.floor(Math.random() * CHARS.length)];
    }

    start(delay, dur, onComplete) {
      setTimeout(() => {
        const text     = this.text;
        const settled  = this.settled;
        const chars    = text.split('').map(c => (c === ' ' || c === '\n') ? c : this._rand());
        const revealed = text.split('').map(c => c === ' ' || c === '\n');

        this._render(text, chars, revealed, settled);

        const nonSpaces = text.split('').filter(c => c !== ' ' && c !== '\n').length;
        let nsIdx = 0;

        text.split('').forEach((char, i) => {
          if (char === ' ' || char === '\n') return;
          const t = (nsIdx / nonSpaces) * dur;
          nsIdx++;
          setTimeout(() => {
            revealed[i] = true;
            chars[i]    = char;
            this._render(text, chars, revealed, settled);
            // Lock to ht-done after CSS animation completes (0.22s + one tick buffer)
            setTimeout(() => { settled[i] = true; }, 290);
            if (revealed.every(Boolean)) onComplete && onComplete();
          }, t);
        });

        // 72ms tick — deliberate cadence, not frantic flicker; each char feels
        // like it's cycling through candidates before locking in
        const tickId = setInterval(() => {
          let dirty = false;
          text.split('').forEach((char, i) => {
            if (!revealed[i] && char !== ' ' && char !== '\n') {
              chars[i] = this._rand();
              dirty = true;
            }
          });
          if (dirty) this._render(text, chars, revealed, settled);
        }, 72);

        setTimeout(() => clearInterval(tickId), dur + 300);
      }, delay);
    }

    _render(text, chars, revealed, settled) {
      this.el.innerHTML = text.split('').map((char, i) => {
        if (char === '\n') return '<br>';
        if (char === ' ')  return ' ';
        if (settled[i])    return `<span class="ht-done">${char}</span>`;
        if (revealed[i])   return `<span class="ht-rev">${char}</span>`;
        return `<span class="ht-scr">${chars[i]}</span>`;
      }).join('');
    }
  }

  function initHeadingDecrypt() {
    const heroText     = document.getElementById('heroText');
    const heroTitle    = document.getElementById('heroTitle');
    const heroSubtitle = document.getElementById('heroSubtitle');

    if (prefersReducedMotion) {
      if (heroText)     { heroText.style.opacity = '1'; heroText.style.transform = 'none'; }
      if (heroTitle)    heroTitle.innerHTML     = 'PRIVATE SECURITY<br>& INTELLIGENCE<br>CORPORATION';
      if (heroSubtitle) heroSubtitle.innerHTML = 'YOU DON\'T KNOW<br>WHAT YOU DON\'T KNOW.';
      return;
    }

    if (heroTitle || heroSubtitle) {
      window.addEventListener('gl:activated', () => {

        // ── Reset any stale state from a previous activation or bfcache restore ──
        if (heroText) {
          heroText.classList.remove('hero-text-entered');
          void heroText.offsetWidth; // force reflow so transition re-arms
        }
        if (heroTitle)    heroTitle.innerHTML    = '';
        if (heroSubtitle) heroSubtitle.innerHTML = '';

        // Float the whole text block up — starts 28px below, transitions to natural position
        if (heroText) setTimeout(() => heroText.classList.add('hero-text-entered'), 40);

        // Title: 1600ms to match splash pacing
        if (heroTitle) {
          new HeroScramble(heroTitle, 'PRIVATE SECURITY\n& INTELLIGENCE\nCORPORATION').start(0, 1600);
        }

        // Subtitle: starts AFTER title fully resolves (title ends at 1600ms)
        // + a short 150ms pause, then reveals quickly (800ms). Still
        // strictly sequential — no overlap with the headline's scramble,
        // but the gap is tight so the composition lands fast.
        if (heroSubtitle) {
          new HeroScramble(heroSubtitle, 'YOU DON\'T KNOW\nWHAT YOU DON\'T KNOW.').start(1750, 800);
        }

      }, { once: true });
    }

    // Section headers: label + title staggered together
    document.querySelectorAll('.section-header').forEach(header => {
      const targets = Array.from(header.querySelectorAll('.section-label, h2.section-title'));
      if (!targets.length) return;
      ScrollTrigger.create({
        trigger: header,
        start: 'top 80%',
        once: true,
        onEnter: () => targets.forEach((el, i) => new HeadingDecrypt(el).play(i * 75))
      });
    });

    // Pillar titles: stagger matches GSAP card stagger (140ms)
    const pillarsGrid = document.getElementById('pillarsGrid');
    if (pillarsGrid) {
      const pillarTitles = pillarsGrid.querySelectorAll('h3.pillar-title');
      ScrollTrigger.create({
        trigger: pillarsGrid,
        start: 'top 78%',
        once: true,
        onEnter: () => pillarTitles.forEach((el, i) => new HeadingDecrypt(el).play(i * 140))
      });
    }

    // Timeline titles: each fires individually as it scrolls in
    document.querySelectorAll('h3.timeline-title').forEach(el => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 85%',
        once: true,
        onEnter: () => new HeadingDecrypt(el).play()
      });
    });

    // Reaper title (contains <span>REAPER</span> — originalHTML is saved and restored)
    const reaperTitle = document.querySelector('h2.reaper-title');
    if (reaperTitle) {
      ScrollTrigger.create({
        trigger: reaperTitle,
        start: 'top 80%',
        once: true,
        onEnter: () => new HeadingDecrypt(reaperTitle).play()
      });
    }
  }

  // ============================================
  // Timeline Animation
  // ============================================
  function initTimeline() {
    const timeline = document.getElementById('timeline');
    const progress = document.getElementById('timelineProgress');
    const items = document.querySelectorAll('.timeline-item');

    if (!timeline || !progress || items.length === 0) return;

    ScrollTrigger.create({
      trigger: timeline,
      start: 'top 85%',
      end: 'bottom 25%',
      onUpdate: (self) => {
        const progressHeight = self.progress * 100;
        progress.style.height = `${progressHeight}%`;

        /* Activate items based on progress — but never UN-activate.
           Earlier code removed `.active` whenever progress dropped
           below the threshold, which made items 4 (Rapid Response)
           and 5 (Mitigation & Reporting) flicker on scroll-back-up
           and animate inconsistently versus items 1–3. Now once an
           item has been revealed it stays revealed; the progress bar
           height is the only thing that tracks scroll direction. */
        items.forEach((item, index) => {
          const threshold = (index + 1) / items.length;
          if (self.progress >= threshold - 0.22) {
            item.classList.add('active');
          }
        });
      }
    });
  }

  // ============================================
  // Navigation
  // ============================================
  // Nav glitch hover: CSS split-channel kick + character scramble, clearly visible
  function initNavGlitch() {
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#%';
    document.querySelectorAll('.nav-link').forEach(link => {
      let active = false;
      link.addEventListener('mouseenter', () => {
        if (active) return;
        active = true;
        const original = link.textContent;
        const len = original.length;
        const DUR = 340;
        const t0  = performance.now();

        // CSS kick: digital translate + accent flash, stepped (non-smooth)
        link.classList.add('nav-glitch');
        setTimeout(() => link.classList.remove('nav-glitch'), 220);

        const frame = (ts) => {
          const p = (ts - t0) / DUR;
          if (p >= 1) { link.textContent = original; active = false; return; }
          // First 28%: all chars full scramble. Then reveal left-to-right.
          const revealStart = 0.28;
          let out = '';
          for (let i = 0; i < len; i++) {
            if (original[i] === ' ') { out += ' '; continue; }
            const rp = p < revealStart ? 0 : (p - revealStart) / (1 - revealStart);
            out += rp > (i / len) * 0.85
              ? original[i]
              : (Math.random() < 0.80 ? CHARS[Math.floor(Math.random() * CHARS.length)] : original[i]);
          }
          link.textContent = out;
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    });
  }

  function initNavigation() {
    const nav = document.getElementById('nav');
    const mobileBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const mobileLinks = document.querySelectorAll('.mobile-menu-link');

    initNavGlitch();

    // Scroll effect
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
      const currentScroll = window.scrollY;

      if (currentScroll > 50) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }

      lastScroll = currentScroll;
    });

    // Mobile menu
    function toggleMobileMenu() {
      mobileMenu.classList.toggle('open');
      mobileOverlay.classList.toggle('open');
      document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
    }

    mobileBtn?.addEventListener('click', toggleMobileMenu);
    mobileOverlay?.addEventListener('click', toggleMobileMenu);
    mobileLinks.forEach(link => {
      link.addEventListener('click', toggleMobileMenu);
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href === '#') return;

        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          const offset = nav.offsetHeight;
          const top = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      });
    });
  }

  // ============================================
  // Contact Form
  // ============================================
  function initContactForm() {
    const form = document.getElementById('contactForm');
    const response = document.getElementById('formResponse');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const btn = form.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = 'Processing...';
      btn.disabled = true;

      // Simulate form submission
      await new Promise(resolve => setTimeout(resolve, 1500));

      response.innerHTML = `
        <div style="padding: 1rem; background: rgba(0, 255, 136, 0.1); border: 1px solid var(--success); margin-bottom: 1rem; text-align: center;">
          <div style="color: var(--success); margin-bottom: 0.5rem;">Request Received</div>
          <div style="font-size: 0.875rem; color: var(--text-muted);">Our security team will contact you within 24 hours.</div>
        </div>
      `;

      btn.textContent = originalText;
      btn.disabled = false;
      form.reset();

      // Clear response after 5 seconds
      setTimeout(() => {
        response.innerHTML = '';
      }, 5000);
    });
  }

  // ============================================
  // Globe Scroll Integration
  // ============================================
  function initGlobeScroll(globe) {
    if (!globe || !globe.isInitialized) return;

    // Grid → crumple → globe: starts immediately on first scroll, 1200px total
    ScrollTrigger.create({
      trigger: '.hero',
      start: 'top top',
      end: '+=1200',
      scrub: 1.2,
      onUpdate: (self) => {
        globe.setScrollProgress(self.progress);
      }
    });

    // Scroll-driven globe rotation — continues through all sections
    window.addEventListener('scroll', () => {
      globe.setScrollY(window.scrollY);
    }, { passive: true });

    // Fade scroll indicator quickly
    ScrollTrigger.create({
      trigger: '.hero',
      start: 'top top',
      end: '+=180',
      scrub: true,
      onUpdate: (self) => {
        const heroScroll = document.getElementById('heroScroll');
        if (heroScroll) heroScroll.style.opacity = 1 - self.progress;
      }
    });

    // Head disintegration — scroll-linked, fully reversible
    ScrollTrigger.create({
      trigger: '.hero',
      start: 'top top',
      end: '+=600',
      scrub: 1.0,
      onUpdate: (self) => {
        if (setFaceDissolve) setFaceDissolve(self.progress);
      }
    });
  }

  // ============================================
  // Corner Coordinate Readouts
  // ============================================
  function initCornerReadouts() {
    const elDate = document.getElementById('coord-date');
    const elTime = document.getElementById('coord-time');
    const elLat  = document.getElementById('coord-lat');
    const elLng  = document.getElementById('coord-lng');
    const elAlt  = document.getElementById('coord-alt');
    const elHdop = document.getElementById('coord-hdop');
    const elSig  = document.getElementById('coord-sig');

    // Groom Lake base coordinates
    const baseLat = 37.2399;
    const baseLng = -115.8111;
    const baseAlt = 4409;

    function toDegreesMinutesSeconds(decimal, isLat) {
      const abs = Math.abs(decimal);
      const deg = Math.floor(abs);
      const minFull = (abs - deg) * 60;
      const min = Math.floor(minFull);
      const sec = ((minFull - min) * 60).toFixed(1);
      const dir = isLat ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
      return `${deg}\u00b0${String(min).padStart(2,'0')}'${String(sec).padStart(4,'0')}"${dir}`;
    }

    function padTwo(n) { return String(n).padStart(2, '0'); }

    function tick() {
      const now = new Date();
      const y = now.getUTCFullYear();
      const mo = padTwo(now.getUTCMonth() + 1);
      const d  = padTwo(now.getUTCDate());
      const h  = padTwo(now.getUTCHours());
      const mi = padTwo(now.getUTCMinutes());
      const s  = padTwo(now.getUTCSeconds());

      if (elDate) elDate.textContent = `${y}-${mo}-${d}Z`;
      if (elTime) elTime.textContent = `${h}:${mi}:${s} UTC`;

      // Slight coordinate drift to simulate GPS movement
      const drift = 0.0002;
      const lat = baseLat + (Math.sin(Date.now() / 14000) * drift);
      const lng = baseLng + (Math.cos(Date.now() / 18000) * drift);
      const alt = baseAlt + Math.round(Math.sin(Date.now() / 9000) * 3);

      if (elLat) elLat.textContent = toDegreesMinutesSeconds(lat, true);
      if (elLng) elLng.textContent = toDegreesMinutesSeconds(lng, false);
      if (elAlt) elAlt.textContent = `ALT ${alt}M`;

      // Fluctuating HDOP
      const hdop = (0.75 + Math.abs(Math.sin(Date.now() / 22000)) * 0.25).toFixed(2);
      if (elHdop) elHdop.textContent = `HDOP ${hdop}`;

      // Signal bar animation
      const sigBars = Math.floor(7 + Math.sin(Date.now() / 5000) * 2);
      const filled = '\u2588'.repeat(Math.min(sigBars, 10));
      const empty  = '\u2591'.repeat(Math.max(10 - sigBars, 0));
      if (elSig) elSig.textContent = `SIG ${filled}${empty}`;
    }

    tick();
    setInterval(tick, 1000);
  }

  // ============================================
  // Side Network Monitors
  // Live drifting nodes + connecting lines in the left/right edge strips
  // ============================================
  function initSideNetworks() {
    if (prefersReducedMotion) return;

    ['side-net-left', 'side-net-right'].forEach(id => {
      const canvas = document.getElementById(id);
      if (!canvas) return;

      const W = 110;
      let H   = window.innerHeight;
      canvas.width  = W;
      canvas.height = H;

      const ctx = canvas.getContext('2d');

      // 10 drifting nodes per strip
      const nodes = Array.from({ length: 10 }, () => ({
        x:  Math.random() * W,
        y:  Math.random() * H,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.30,
        r:  1.4 + Math.random() * 1.4,
      }));

      function tick() {
        ctx.clearRect(0, 0, W, H);

        // Move nodes, bounce off edges
        nodes.forEach(n => {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > W) { n.vx *= -1; n.x = Math.max(0, Math.min(W, n.x)); }
          if (n.y < 0 || n.y > H) { n.vy *= -1; n.y = Math.max(0, Math.min(H, n.y)); }
        });

        // Connection lines between nearby nodes
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx   = nodes[i].x - nodes[j].x;
            const dy   = nodes[i].y - nodes[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 110) {
              ctx.strokeStyle = `rgba(17,26,17,${0.18 * (1 - dist / 110)})`;
              ctx.lineWidth   = 0.7;
              ctx.beginPath();
              ctx.moveTo(nodes[i].x, nodes[i].y);
              ctx.lineTo(nodes[j].x, nodes[j].y);
              ctx.stroke();
            }
          }
        }

        // Node dots
        nodes.forEach(n => {
          ctx.fillStyle = 'rgba(17,26,17,0.30)';
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fill();
        });

        requestAnimationFrame(tick);
      }

      tick();

      window.addEventListener('resize', () => {
        H = window.innerHeight;
        canvas.height = H;
      });
    });
  }

  // ============================================
  // Stagger Groups — parent-triggered, sequential card reveals
  // Any element with class="stagger-group" gets its direct children
  // animated in sequence as the container scrolls into view.
  // ============================================
  function initStaggerGroups() {
    document.querySelectorAll('.stagger-group').forEach(group => {
      const items = Array.from(group.children);
      if (!items.length) return;

      // Set initial state (override any CSS that might interfere)
      gsap.set(items, { opacity: 0, y: 20 });

      gsap.to(items, {
        opacity: 1,
        y: 0,
        duration: 0.62,
        stagger: 0.09,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: group,
          start: 'top 88%',
          toggleActions: 'play none none none'
        }
      });
    });
  }

  // ============================================
  // Face Model — Three.js GLB on hero right column
  // Includes scroll-linked particle dissolve (reversible).
  // ============================================
  function initFaceModel() {
    if (prefersReducedMotion) return;
    if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') return;

    const canvas = document.getElementById('faceCanvas');
    if (!canvas) return;

    const W = canvas.offsetWidth  || 400;
    const H = canvas.offsetHeight || 500;
    canvas.width  = W;
    canvas.height = H;

    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(34, W / H, 0.1, 100);
    camera.position.set(0, 0.4, 6.0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    // Lighting — kept intentionally low to produce a darker, matte gray result
    scene.add(new THREE.AmbientLight(0xaab8aa, 0.55));
    const key  = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xcccccc, 0.18);
    fill.position.set(-3, -1, 2);
    scene.add(fill);

    // ── Scanner corner frame — 2D overlay canvas ─────────────────────────
    const wrap = canvas.parentElement;
    if (wrap && !wrap.style.position) wrap.style.position = 'relative';

    const ov    = document.createElement('canvas');
    ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;opacity:0;transition:opacity 0.9s ease';
    wrap.appendChild(ov);
    const ovCtx = ov.getContext('2d');

    // Activate: fade overlay in, then reveal telemetry after head has settled
    let telemVisible = false;
    let telemT0      = null;
    window.addEventListener('gl:activated', () => {
      setTimeout(() => { ov.style.opacity = '1'; }, 600);
      setTimeout(() => { telemVisible = true; }, 1600);
    }, { once: true });

    // ── Telemetry readouts ────────────────────────────────────────────────
    // Two fields positioned at the TOP of the scanner frame, not near the head.
    const TELEM = [
      { label: 'ID',     side: 'L', vs: ['07A3','07A3','07A4','07A2','07A3'], ci: 0 },
      { label: 'VECTOR', side: 'R', vs: ['83.2','83.5','83.1','83.4','83.2'], ci: 0 },
    ];
    const telemNextT  = TELEM.map(() => 1.5 + Math.random() * 1.5);
    const telemFlickT = TELEM.map(() => -999);

    function drawOverlay() {
      const cw = wrap.offsetWidth;
      const ch = wrap.offsetHeight;
      if (!cw || !ch) { requestAnimationFrame(drawOverlay); return; }

      if (ov.width !== cw || ov.height !== ch) {
        ov.width  = cw;
        ov.height = ch;
      }

      ovCtx.clearRect(0, 0, cw, ch);

      const isNarrow = cw < 420;
      // Narrower viewports need proportionally MORE padding so the
      // scanner brackets sit clearly around the head, not on top of it.
      const pad  = Math.round(cw * (isNarrow ? 0.14 : 0.10));
      const padT = Math.round(ch * (isNarrow ? 0.08 : 0.05));
      const padB = Math.round(ch * 0.04);
      const fx   = pad;
      const fy   = padT;
      const fw   = cw - pad * 2;
      const fh   = ch - padT - padB;
      const arm  = Math.round(Math.min(fw, fh) * (isNarrow ? 0.16 : 0.12));
      const now  = performance.now() * 0.001;

      // ── Corner brackets ───────────────────────────────────────────────
      const pulse = 0.82 + Math.sin(now * 0.88) * 0.03;
      ovCtx.strokeStyle = `rgba(10, 28, 10, ${pulse.toFixed(3)})`;
      ovCtx.lineWidth   = 1.5;
      ovCtx.lineCap     = 'square';
      ovCtx.lineJoin    = 'miter';

      ovCtx.beginPath();
      ovCtx.moveTo(fx,           fy + arm);
      ovCtx.lineTo(fx,           fy);
      ovCtx.lineTo(fx + arm,     fy);
      ovCtx.stroke();

      ovCtx.beginPath();
      ovCtx.moveTo(fx + fw - arm, fy);
      ovCtx.lineTo(fx + fw,       fy);
      ovCtx.lineTo(fx + fw,       fy + arm);
      ovCtx.stroke();

      ovCtx.beginPath();
      ovCtx.moveTo(fx,           fy + fh - arm);
      ovCtx.lineTo(fx,           fy + fh);
      ovCtx.lineTo(fx + arm,     fy + fh);
      ovCtx.stroke();

      ovCtx.beginPath();
      ovCtx.moveTo(fx + fw - arm, fy + fh);
      ovCtx.lineTo(fx + fw,       fy + fh);
      ovCtx.lineTo(fx + fw,       fy + fh - arm);
      ovCtx.stroke();

      // ── Telemetry readouts — top of frame, inside brackets ────────────
      if (telemVisible) {
        if (telemT0 === null) telemT0 = now;
        const et = now - telemT0;

        // Slightly larger text on narrow viewports so the readouts are
        // readable; generous vertical gap so they sit clear of both the
        // top bracket AND the head itself.
        ovCtx.font         = (isNarrow ? '9px' : '8px') + ' "JetBrains Mono", monospace';
        ovCtx.textBaseline = 'middle';

        // Vertical position: pushed well below the bracket arm so the
        // telemetry has daylight between it and the head beneath.
        const py = fy + arm + (isNarrow ? 20 : 10);

        TELEM.forEach((f, i) => {
          if (et >= telemNextT[i]) {
            f.ci           = (f.ci + 1) % f.vs.length;
            telemFlickT[i] = et;
            telemNextT[i]  = et + 1.0 + Math.random() * 1.0;
          }

          const fadeIn = Math.min(1, et / 1.4);
          const flick  = (et - telemFlickT[i]) < 0.18 ? 0.12 : 0;
          const op     = (0.60 + flick) * fadeIn;

          const txt = `${f.label}: ${f.vs[f.ci]}`;

          ovCtx.fillStyle = `rgba(255,45,45,${op.toFixed(3)})`;
          if (f.side === 'L') {
            ovCtx.textAlign = 'left';
            ovCtx.fillText(txt, fx + arm + 6, py);
          } else {
            ovCtx.textAlign = 'right';
            ovCtx.fillText(txt, fx + fw - arm - 6, py);
          }
        });
      }

      requestAnimationFrame(drawOverlay);
    }
    drawOverlay();

    // ── Load face model ───────────────────────────────────────────────────
    let faceGroup     = null;
    let faceMaterials = [];
    let basePosition  = null;
    const loader      = new THREE.GLTFLoader();

    loader.load('/models/face.glb', (gltf) => {
      faceGroup = gltf.scene;

      // Normalize to 2.6 units tall, centered
      const box    = new THREE.Box3().setFromObject(faceGroup);
      const size   = box.getSize(new THREE.Vector3());
      const scale  = 2.6 / (size.y || size.x || 1);
      faceGroup.scale.setScalar(scale);
      const center = box.getCenter(new THREE.Vector3());
      faceGroup.position.copy(center.multiplyScalar(-scale));
      basePosition = faceGroup.position.clone();

      const meshNodes = [];
      faceGroup.traverse(child => {
        if (child.isMesh)                    meshNodes.push(child);
        if (child.isPoints || child.isSprite) child.visible = false;
      });
      meshNodes.forEach(child => {
        // Pass 1 — solid fill in bg color. Writes depth so back-face wireframe
        // lines behind the surface are occluded in Pass 2.
        const fillMat  = new THREE.MeshBasicMaterial({
          color: 0xc8d4c4, transparent: true, opacity: 1, depthWrite: true,
        });
        const fillMesh = child.clone();
        fillMesh.material  = fillMat;
        fillMesh.renderOrder = 0;
        child.parent.add(fillMesh);
        faceMaterials.push(fillMat);

        // Pass 2 — wireframe on top. Depth-tested against Pass 1 fill.
        const wireMat = new THREE.MeshBasicMaterial({
          color: 0x111111, wireframe: true, transparent: true, opacity: 1, depthWrite: false,
        });
        child.material   = wireMat;
        child.renderOrder = 1;
        faceMaterials.push(wireMat);
      });

      scene.add(faceGroup);
    });

    // ── setFaceDissolve — exposed to initGlobeScroll ──────────────────────
    setFaceDissolve = function(p) {
      if (!faceGroup) return;
      const eased = p < 0.5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2;
      faceMaterials.forEach(m => { m.opacity = 1 - eased; });
    };

    // ── Render loop ───────────────────────────────────────────────────────
    const ENTER_DUR        = 1.4;
    const easeOut5         = p => 1 - Math.pow(1 - p, 5);
    let   loadTime         = null;
    let   headEntranceReady = false;

    window.addEventListener('gl:activated', () => { headEntranceReady = true; }, { once: true });

    function animate() {
      requestAnimationFrame(animate);
      const t = performance.now() * 0.001;

      if (faceGroup) {
        if (headEntranceReady && loadTime === null) loadTime = t;

        if (loadTime === null) {
          faceGroup.position.y = (basePosition ? basePosition.y : 0) - 1.2;
          faceGroup.rotation.y = 0;
          faceGroup.rotation.x = 0;
        } else {
          const elapsed = t - loadTime;

          if (elapsed < ENTER_DUR) {
            const p = easeOut5(elapsed / ENTER_DUR);
            faceGroup.position.y = (basePosition ? basePosition.y : 0) - 1.2 * (1 - p);
            faceGroup.rotation.y = elapsed * 0.35 * p;
            faceGroup.rotation.x = 0;
          } else {
            if (basePosition) faceGroup.position.y = basePosition.y;
            faceGroup.rotation.y = elapsed * 0.35;
            faceGroup.rotation.x = Math.sin(t * 0.15) * 0.04;
          }
        }
      }

      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
      const W2 = canvas.offsetWidth;
      const H2 = canvas.offsetHeight;
      if (!W2 || !H2) return;
      canvas.width  = W2;
      canvas.height = H2;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    });
  }

  // ============================================
  // Initialize Everything
  // ============================================
  // Panel Frame — removed per design update (rectangle outline around hero content).
  function initPanelFrame() {}

  // ============================================
  // Page Scroll Progress Bar
  // ============================================
  function initPageProgress() {
    const fill = document.getElementById('pp-fill');
    const pip  = document.getElementById('pp-pip');
    if (!fill) return;

    function update() {
      const scrollTop  = window.scrollY;
      const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
      fill.style.height = pct + '%';
      if (pip) pip.style.top = pct + '%';
    }

    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  // ============================================
  function init() {
    // Initialize globe
    const canvas = document.getElementById('heroCanvas');
    let globe = null;

    if (canvas && typeof THREE !== 'undefined') {
      globe = new GlobeAnimation(canvas);
    }

    // Initialize GSAP animations
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      initGSAPAnimations();
      initStaggerGroups();
      initTimeline();
      initGlobeScroll(globe);
      initHeadingDecrypt();
    }

    // Initialize face model on hero right column
    initFaceModel();

    // Initialize other components
    initNavigation();
    initPanelFrame();
    initContactForm();
    initCornerReadouts();
    initPageProgress();
    initLogoTickerTap();
    // initSideNetworks(); — replaced by initConstellationNetworks() in overlays.js

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      globe?.destroy();
    });
  }

  // ============================================
  // Logo ticker — acronym tap-reveal (mobile/tablet)
  // ============================================
  // On touch devices, :hover doesn't trigger reliably. Each logo item
  // carries `tabindex="0"` so it CAN receive focus, but iOS Safari often
  // refuses to focus <span> elements on tap. We toggle a `.hl-logo-tapped`
  // / `.ab-logo-tapped` class on touch so the full-name label reveals.
  // Tapping another item or outside dismisses. Desktop hover is untouched.
  function initLogoTickerTap() {
    const items = document.querySelectorAll('.hl-logo-item, .ab-logo-item');
    if (!items.length) return;

    const canHover = window.matchMedia('(hover: hover)').matches;
    if (canHover) return; // desktop uses :hover, no JS needed

    const cls = (el) =>
      el.classList.contains('hl-logo-item') ? 'hl-logo-tapped' : 'ab-logo-tapped';

    items.forEach((item) => {
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const tapCls = cls(item);
        const wasOpen = item.classList.contains(tapCls);
        // Clear siblings of same family
        document
          .querySelectorAll('.hl-logo-tapped, .ab-logo-tapped')
          .forEach((n) => n.classList.remove('hl-logo-tapped', 'ab-logo-tapped'));
        if (!wasOpen) item.classList.add(tapCls);
      });
    });

    // Tap elsewhere dismisses the reveal
    document.addEventListener('click', () => {
      document
        .querySelectorAll('.hl-logo-tapped, .ab-logo-tapped')
        .forEach((n) => n.classList.remove('hl-logo-tapped', 'ab-logo-tapped'));
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
