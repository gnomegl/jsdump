(function () {
  'use strict';

  // Mobile gate uses viewport width via matchMedia — same source of
  // truth as CSS media queries, so the JS and CSS can never disagree.
  // No user-agent / device detection — works consistently in real
  // browsers, DevTools device presets, and iframe-based simulators.
  var MOBILE_MQ = window.matchMedia('(max-width: 767px)');
  if (!MOBILE_MQ.matches) return;
  if (sessionStorage.getItem('gl-activated') === '1') return;

  var canvas = document.getElementById('splash-head-mobile');
  if (!canvas) return;

  // Extra safety: if the CSS has hidden the mobile head canvas (e.g.
  // the viewport resized across the 768px threshold before init ran),
  // abort — we should never initialise a hidden animation.
  if (getComputedStyle(canvas).display === 'none') return;

  var _initAttempts = 0;
  function init() {
    // Retry if THREE / GLTFLoader haven't loaded yet. Telegram's WebView
    // (and some Android in-app browsers) often parses scripts slower than
    // Safari/Chrome — bumping this poll window from ~4s to ~12s catches
    // those slow-load cases. If the libraries truly never arrive (offline
    // / blocked CDN), we give up gracefully and reveal the empty canvas
    // slot so no broken-looking blank square lingers.
    if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
      if (_initAttempts++ < 120) {  // up to ~12s of polling
        setTimeout(init, 100);
      } else {
        canvas.classList.add('visible');
      }
      return;
    }

    // Renderer sized to match the CSS 60vw square
    // Match CSS width (65vw) so the WebGL backbuffer matches the on-screen
    // canvas — avoids a blurry scaled texture on high-DPR screens.
    var size = Math.round(window.innerWidth * 0.65);
    var dpr  = Math.min(window.devicePixelRatio || 1, 2);

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    } catch (err) {
      console.warn('[splash-head] WebGL init failed:', err);
      canvas.classList.add('visible');
      return;
    }
    renderer.setPixelRatio(dpr);
    renderer.setSize(size, size, false); // false = keep CSS dimensions, only set buffer
    renderer.setClearColor(0x000000, 0);

    var scene  = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.1, 6);

    var clock   = new THREE.Clock();
    var raf     = null;
    var baseY   = 0;
    var modelLoaded = false;

    // Load face model and set up two-pass wireframe (same pattern as main.js)
    var loader = new THREE.GLTFLoader();

    // Safety: if the model hasn't arrived after 12s (slow network / TG
    // WebView / 404), mark the canvas visible so no blank square lingers.
    // The splash composition will just skip the head visual rather than
    // wait forever. 12s matches the script-poll window above so the
    // failure modes are symmetric.
    var loadTimeoutId = setTimeout(function () {
      if (!modelLoaded) {
        console.warn('[splash-head] face.glb load timed out — revealing empty canvas slot');
        canvas.classList.add('visible');
      }
    }, 12000);

    loader.load('/models/face.glb', function (gltf) {
      modelLoaded = true;
      clearTimeout(loadTimeoutId);
      var group = gltf.scene;

      // Fit to ~2.4 units tall
      var box  = new THREE.Box3().setFromObject(group);
      var size3 = new THREE.Vector3();
      box.getSize(size3);
      var maxDim = Math.max(size3.x, size3.y, size3.z);
      var scale  = 2.4 / maxDim;
      group.scale.setScalar(scale);

      // Center the group
      var center = new THREE.Vector3();
      box.getCenter(center);
      group.position.set(
        -center.x * scale,
        -center.y * scale,
        -center.z * scale
      );
      baseY = group.position.y;

      // Slight fixed tilt — contemplative downward gaze
      group.rotation.x = -0.12;

      // Two-pass hidden-line removal: fill mesh writes depth, wireframe respects it
      var meshNodes = [];
      group.traverse(function (child) {
        if (child.isMesh)                   meshNodes.push(child);
        if (child.isPoints || child.isSprite) child.visible = false;
      });

      meshNodes.forEach(function (child) {
        // Pass 1 — fill mesh in background color, writes depth buffer
        var fillMat  = new THREE.MeshBasicMaterial({
          color: 0xc8d4c4, transparent: true, opacity: 1, depthWrite: true,
        });
        var fillMesh = child.clone();
        fillMesh.material   = fillMat;
        fillMesh.renderOrder = 0;
        child.parent.add(fillMesh);

        // Pass 2 — wireframe on top, reads depth, no back-face bleed
        var wireMat = new THREE.MeshBasicMaterial({
          color: 0x111111, wireframe: true, transparent: true,
          opacity: 0.72, depthWrite: false,
        });
        child.material   = wireMat;
        child.renderOrder = 1;
      });

      scene.add(group);

      // Fade canvas in after model is ready
      canvas.classList.add('visible');

      function animate() {
        raf = requestAnimationFrame(animate);
        var t = clock.getElapsedTime();

        // Slow continuous Y rotation + gentle float
        group.rotation.y  = t * 0.22;
        group.position.y  = baseY + Math.sin(t * 0.6) * 0.055;

        renderer.render(scene, camera);
      }
      animate();
    },
    undefined,
    function onLoadError(err) {
      // 404 / network failure / parse failure — don't leave the canvas
      // invisible (which looks like a broken splash). Make it visible so
      // any CSS fallback fills the slot; the composition can breathe.
      console.warn('[splash-head] face.glb load failed:', err);
      clearTimeout(loadTimeoutId);
      canvas.classList.add('visible');
    });

    // Clean up when the splash is dismissed
    function onActivated() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      // Small delay so the canvas fades with the splash overlay
      setTimeout(function () { renderer.dispose(); }, 1500);
    }
    window.addEventListener('gl:activated', onActivated, { once: true });
  }

  // Runs after all scripts (Three.js + GLTFLoader) have loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
