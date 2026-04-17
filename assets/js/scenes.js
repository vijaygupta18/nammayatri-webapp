/* NammaYatri · Per-page Three.js scenes — futuristic v2.
 *
 * Markup:  <div data-scene="NAME" class="scene-bg"></div>
 * Scenes:
 *   'hero'      — orbiting rickshaw w/ particles, trails, skyline
 *   'driving'   — infinite road, light trail, reflected wet asphalt
 *   'lineup'    — fleet on a scanline stage with spotlights
 *   'pulse'     — top-down beacon with radar rings + ambient dust
 *   'arriving'  — rickshaw decelerating into a glowing waypoint
 *   'celebrate' — parked rickshaw with amber confetti fountain
 *   'handshake' — two rickshaws linked by a spark-bridge
 *   'vault'     — rotating hexagonal capsule with particle swirl
 *
 * Each scene is self-contained and gracefully no-ops without THREE.
 */
(function () {
  'use strict';
  const nodes = document.querySelectorAll('[data-scene]');
  if (!nodes.length || !window.THREE) return;
  const THREE = window.THREE;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ACCENT    = 0xFCC32C;
  const ACCENT_HI = 0xFFE98A;
  const ACCENT_LO = 0xB97F0A;

  function themeColors() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      INK:  dark ? 0xF2F3F7 : 0x15181E,
      DIM:  dark ? 0x2A2E39 : 0xD8DBE2,
      FOG:  dark ? 0x0A0B0F : 0xF7F7F3,
      SKY:  dark ? 0x11141B : 0xEEEEF2,
      ACCENT,
    };
  }
  let { INK, DIM, FOG, SKY } = themeColors();

  const themedMaterials = [];
  function registerInk(m)  { m._themeRole = 'ink';  themedMaterials.push(m); return m; }
  function registerDim(m)  { m._themeRole = 'dim';  themedMaterials.push(m); return m; }
  function registerSky(m)  { m._themeRole = 'sky';  themedMaterials.push(m); return m; }

  // Shared soft glow texture for all additive sprites
  const softTexture = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.00, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,230,130,0.9)');
    grad.addColorStop(0.50, 'rgba(252,195,44,0.35)');
    grad.addColorStop(1.00, 'rgba(252,195,44,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  })();

  window.addEventListener('ny:theme', () => {
    const c = themeColors();
    INK = c.INK; DIM = c.DIM; FOG = c.FOG; SKY = c.SKY;
    themedMaterials.forEach(m => {
      if (m._themeRole === 'ink') m.color.setHex(c.INK);
      if (m._themeRole === 'dim') m.color.setHex(c.DIM);
      if (m._themeRole === 'sky') m.color.setHex(c.SKY);
    });
    // Fogs get updated per-scene via the re-render loop; just store latest.
    document.querySelectorAll('[data-scene]').forEach(el => {
      if (el._scene && el._scene.fog) el._scene.fog.color.setHex(c.FOG);
    });
  });

  nodes.forEach(el => {
    const kind = el.getAttribute('data-scene');
    const builder = SCENES[kind] || SCENES.hero;
    builder(el);
  });

  /* -------------------- shared helpers -------------------- */
  function makeRenderer(el) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    return renderer;
  }
  function resize(renderer, camera, el) {
    const onR = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onR);
    return onR;
  }

  function glowSprite(scale = 1, opacity = 0.9, color = ACCENT) {
    const mat = new THREE.SpriteMaterial({
      map: softTexture, color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(scale, scale, 1);
    return sp;
  }

  function buildRickshaw() {
    const g = new THREE.Group();
    const lineMat    = registerInk(new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.92 }));
    const accentMat  = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 1.0 });

    const bodyGeom = new THREE.BoxGeometry(2.4, 0.8, 1.3);
    const body = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeom), lineMat);
    body.position.y = 0.2;
    g.add(body);

    const cabinGeom = new THREE.BoxGeometry(1.7, 1.0, 1.15);
    for (let i = 0; i < cabinGeom.attributes.position.count; i++) {
      const y = cabinGeom.attributes.position.getY(i);
      if (y > 0.4) {
        cabinGeom.attributes.position.setX(i, cabinGeom.attributes.position.getX(i) * 0.58);
        cabinGeom.attributes.position.setZ(i, cabinGeom.attributes.position.getZ(i) * 0.78);
      }
    }
    cabinGeom.attributes.position.needsUpdate = true;
    const cabin = new THREE.LineSegments(new THREE.EdgesGeometry(cabinGeom), lineMat);
    cabin.position.set(0.18, 1.1, 0);
    g.add(cabin);

    // headlight core + glow
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), new THREE.MeshBasicMaterial({ color: ACCENT_HI }));
    core.position.set(1.3, 0.25, 0);
    g.add(core);
    const glow = glowSprite(0.9, 1.0, ACCENT);
    glow.position.copy(core.position);
    g.add(glow);

    // accent waist stripes
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
      [new THREE.Vector3(-1.2, 0.22,  0.66), new THREE.Vector3( 1.2, 0.22,  0.66)]), accentMat));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
      [new THREE.Vector3(-1.2, 0.22, -0.66), new THREE.Vector3( 1.2, 0.22, -0.66)]), accentMat));

    const wGeom = new THREE.TorusGeometry(0.4, 0.08, 10, 28);
    const mkWheel = () => {
      const w = new THREE.LineSegments(new THREE.EdgesGeometry(wGeom), lineMat);
      w.rotation.y = Math.PI / 2; return w;
    };
    const wL = mkWheel(); wL.position.set(-0.8, -0.3,  0.72); g.add(wL);
    const wR = mkWheel(); wR.position.set(-0.8, -0.3, -0.72); g.add(wR);
    const wF = mkWheel(); wF.position.set( 1.05, -0.3,  0);    g.add(wF);

    g.userData.wheels = [wL, wR, wF];
    g.userData.glow = glow;
    return g;
  }

  function addGridFloor(scene) {
    const grid = new THREE.GridHelper(60, 60, DIM, DIM);
    registerDim(grid.material);
    grid.material.transparent = true;
    grid.material.opacity = 0.32;
    grid.position.y = -1.2;
    scene.add(grid);
    return grid;
  }
  function addHorizon(scene) {
    const line = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-30, -1.2, -24), new THREE.Vector3(30, -1.2, -24),
    ]);
    scene.add(new THREE.Line(line, registerInk(new THREE.LineBasicMaterial({
      color: INK, transparent: true, opacity: 0.30,
    }))));
  }
  function addParticleField(scene, count = 120, spread = { xz: 10, y: 4 }) {
    const n = reduced ? Math.floor(count * 0.3) : count;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * spread.xz;
      pos[i * 3 + 0] = Math.cos(a) * r;
      pos[i * 3 + 1] = -0.8 + Math.random() * spread.y;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: ACCENT, map: softTexture,
      size: 0.2, sizeAttenuation: true,
      transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geom, mat);
    scene.add(points);
    return { points, geom, mat, count: n };
  }
  function enableFog(scene, near = 8, far = 30) {
    scene.fog = new THREE.Fog(FOG, near, far);
  }

  const SCENES = {};

  /* -------- hero (landing fallback, also used on profile) -------- */
  SCENES.hero = (el) => {
    const scene = new THREE.Scene();
    el._scene = scene;
    enableFog(scene, 10, 34);
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 1.9, 9); camera.lookAt(0, 0.6, 0);
    const renderer = makeRenderer(el);

    addGridFloor(scene); addHorizon(scene);
    const particles = addParticleField(scene, 120, { xz: 10, y: 4 });

    const rick = buildRickshaw();
    rick.position.y = 0.1;
    scene.add(rick);

    const sat = glowSprite(0.8, 1, ACCENT);
    scene.add(sat);
    const satCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 16, 16),
      new THREE.MeshBasicMaterial({ color: ACCENT_HI })
    );
    scene.add(satCore);

    resize(renderer, camera, el);
    let px = 0, py = 0;
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      px = (e.clientX - r.left) / r.width - 0.5;
      py = (e.clientY - r.top)  / r.height - 0.5;
    });
    el.addEventListener('pointerleave', () => { px = 0; py = 0; });

    const clock = new THREE.Clock();
    (function tick() {
      const t = clock.getElapsedTime();
      camera.position.x += (px * 1.8 - camera.position.x) * 0.04;
      camera.position.y += (1.9 - py * 1.1 - camera.position.y) * 0.04;
      camera.lookAt(0, 0.6, 0);
      rick.rotation.y = Math.sin(t * 0.22) * 0.55;
      rick.position.y = 0.1 + Math.sin(t * 0.9) * 0.04;
      rick.userData.wheels.forEach(w => w.rotation.x = t * 2.6);
      const rad = 2.8;
      const sx = Math.cos(t * 0.55) * rad, sy = 0.7 + Math.sin(t * 2) * 0.35, sz = Math.sin(t * 0.55) * rad;
      sat.position.set(sx, sy, sz); satCore.position.set(sx, sy, sz);
      particles.mat.opacity = 0.45 + Math.sin(t * 0.9) * 0.2;
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

  /* -------- driving: rickshaw on infinite road (login) -------- */
  SCENES.driving = (el) => {
    const scene = new THREE.Scene();
    el._scene = scene;
    enableFog(scene, 6, 28);
    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 2.4, 6.5); camera.lookAt(0, 0.8, 0);
    const renderer = makeRenderer(el);

    const grid = new THREE.GridHelper(100, 100, DIM, DIM);
    grid.material.transparent = true; grid.material.opacity = 0.35;
    registerDim(grid.material);
    grid.position.y = -0.6;
    scene.add(grid);

    // Dashed amber centre-line (dashed material requires computeLineDistances)
    const roadMat = new THREE.LineDashedMaterial({ color: ACCENT, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.9 });
    const roadGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.59, -40), new THREE.Vector3(0, -0.59, 40)]);
    const road = new THREE.Line(roadGeom, roadMat);
    road.computeLineDistances();
    scene.add(road);

    const edgeMat = registerInk(new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5 }));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-3, -0.59, -40), new THREE.Vector3(-3, -0.59, 40)]), edgeMat));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3( 3, -0.59, -40), new THREE.Vector3( 3, -0.59, 40)]), edgeMat));

    // Side street-lights: amber glow sprites
    const lights = [];
    for (let i = 0; i < 8; i++) {
      const z = -40 + i * 10;
      const Lsp = glowSprite(1.3, 0.7, ACCENT);
      Lsp.position.set(-4.2, 0.6, z); scene.add(Lsp); lights.push(Lsp);
      const Rsp = glowSprite(1.3, 0.7, ACCENT);
      Rsp.position.set( 4.2, 0.6, z); scene.add(Rsp); lights.push(Rsp);
    }

    const rick = buildRickshaw();
    rick.scale.setScalar(0.85);
    rick.position.set(0, 0, 1.2);
    rick.rotation.y = Math.PI; // face camera
    scene.add(rick);

    // Motion streaks under the vehicle (tail)
    const streakGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -0.55, 2), new THREE.Vector3(0, -0.55, 12),
    ]);
    const streakMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.65,
      blending: THREE.AdditiveBlending, depthWrite: false });
    const streak = new THREE.Line(streakGeom, streakMat);
    scene.add(streak);

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick() {
      const t = clock.getElapsedTime();
      grid.position.z = (t * 3) % 2;
      rick.position.y = Math.sin(t * 6) * 0.04;
      rick.rotation.z = Math.sin(t * 3) * 0.02;
      rick.userData.wheels.forEach(w => w.rotation.x = -t * 9);
      streakMat.opacity = 0.5 + Math.sin(t * 6) * 0.15;
      lights.forEach((l, i) => {
        l.position.z = (-40 + i * 5 + (t * 3) % 80) - 40;
        l.material.opacity = 0.55 + Math.sin(t * 2 + i) * 0.25;
      });
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

  /* -------- lineup: fleet of rickshaws on a scanline stage -------- */
  SCENES.lineup = (el) => {
    const scene = new THREE.Scene();
    el._scene = scene;
    enableFog(scene, 10, 30);
    const camera = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 2.2, 10); camera.lookAt(0, 0.6, 0);
    const renderer = makeRenderer(el);

    addGridFloor(scene); addHorizon(scene);
    addParticleField(scene, 90, { xz: 8, y: 3 });

    const fleet = new THREE.Group();
    scene.add(fleet);
    const COUNT = 5;
    for (let i = 0; i < COUNT; i++) {
      const r = buildRickshaw();
      r.scale.setScalar(0.55);
      r.position.x = (i - (COUNT - 1) / 2) * 2.3;
      r.rotation.y = -Math.PI / 2;
      r.userData.phase = i * 0.4;
      fleet.add(r);
      // soft spotlight under each
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(0.7, 32),
        new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(r.position.x, -1.19, 0);
      scene.add(pad);
    }

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick() {
      const t = clock.getElapsedTime();
      fleet.children.forEach((r, i) => {
        r.position.y = Math.sin(t * 1.6 + r.userData.phase) * 0.06;
        r.userData.wheels.forEach(w => w.rotation.x = t * (1.4 + i * 0.15));
      });
      fleet.rotation.y = Math.sin(t * 0.2) * 0.08;
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

  /* -------- pulse: top-down radar with dust (home) -------- */
  SCENES.pulse = (el) => {
    const scene = new THREE.Scene();
    el._scene = scene;
    enableFog(scene, 4, 18);
    const camera = new THREE.PerspectiveCamera(36, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 8, 0.01); camera.lookAt(0, 0, 0);
    const renderer = makeRenderer(el);

    const grid = new THREE.GridHelper(60, 30, DIM, DIM);
    grid.material.transparent = true; grid.material.opacity = 0.35;
    registerDim(grid.material);
    scene.add(grid);

    // Subtle dust
    const N = reduced ? 30 : 80;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = Math.random() * 0.3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    const dustGeom = new THREE.BufferGeometry();
    dustGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: ACCENT, map: softTexture,
      size: 0.25, sizeAttenuation: true,
      transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    scene.add(new THREE.Points(dustGeom, dustMat));

    // Pin (amber dot + glow halo)
    const pinCore = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20), new THREE.MeshBasicMaterial({ color: ACCENT }));
    pinCore.rotation.x = Math.PI / 2;
    scene.add(pinCore);
    const pinHalo = glowSprite(1.6, 0.85, ACCENT);
    scene.add(pinHalo);

    // Radar rings
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const geom = new THREE.RingGeometry(0.15, 0.17, 64);
      const mat  = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false });
      const ring = new THREE.Mesh(geom, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.userData.offset = i / 3;
      scene.add(ring);
      rings.push(ring);
    }

    const rick = buildRickshaw();
    rick.scale.setScalar(0.35);
    rick.position.y = 0.01;
    scene.add(rick);

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick() {
      const t = clock.getElapsedTime();
      rings.forEach(r => {
        const phase = ((t * 0.5 + r.userData.offset) % 1);
        const scale = 0.6 + phase * 8;
        r.scale.setScalar(scale);
        r.material.opacity = (1 - phase) * 0.55;
      });
      const rad = 2.2;
      rick.position.x = Math.cos(t * 0.6) * rad;
      rick.position.z = Math.sin(t * 0.6) * rad;
      rick.rotation.y = -t * 0.6 - Math.PI / 2;
      rick.userData.wheels.forEach(w => w.rotation.x = t * 3);
      pinHalo.material.opacity = 0.75 + Math.sin(t * 3) * 0.2;
      dustMat.opacity = 0.4 + Math.sin(t * 1.1) * 0.2;
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

  /* -------- arriving: rickshaw decelerating into a pin -------- */
  SCENES.arriving = (el) => {
    const scene = new THREE.Scene();
    el._scene = scene;
    enableFog(scene, 6, 24);
    const camera = new THREE.PerspectiveCamera(44, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 2, 8); camera.lookAt(0, 0.4, 0);
    const renderer = makeRenderer(el);

    addGridFloor(scene); addHorizon(scene);

    // Destination pin (cone + glow halo)
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 16), new THREE.MeshBasicMaterial({ color: ACCENT }));
    pin.position.set(3.5, 0, 0);
    scene.add(pin);
    const pinGlow = glowSprite(2.2, 0.75, ACCENT);
    pinGlow.position.set(3.5, 0.2, 0);
    scene.add(pinGlow);
    const pinRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.02, 8, 48),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55 }),
    );
    pinRing.rotation.x = Math.PI / 2;
    pinRing.position.set(3.5, -0.1, 0);
    scene.add(pinRing);

    const rick = buildRickshaw();
    rick.scale.setScalar(0.7);
    scene.add(rick);

    // Light trail
    const TR = 40;
    const tPos = new Float32Array(TR * 3);
    const tCol = new Float32Array(TR * 3);
    for (let i = 0; i < TR; i++) {
      tCol[i * 3] = 252 / 255; tCol[i * 3 + 1] = 195 / 255; tCol[i * 3 + 2] = 44 / 255;
    }
    const tGeom = new THREE.BufferGeometry();
    tGeom.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    tGeom.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
    const tMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const tLine = new THREE.Line(tGeom, tMat);
    scene.add(tLine);
    const trailBuf = new Array(TR).fill(null).map(() => new THREE.Vector3());

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick() {
      const t = clock.getElapsedTime();
      const phase = (t * 0.3) % 1;
      rick.position.x = -5 + phase * 8.5;
      rick.rotation.y = Math.PI / 2;
      rick.position.y = Math.sin(t * 6) * 0.03;
      rick.userData.wheels.forEach(w => w.rotation.x = -t * 9);

      const s = 1 + Math.sin(t * 3) * 0.15;
      pinRing.scale.setScalar(s);
      pinRing.material.opacity = 0.6 - (s - 1) * 2;
      pinGlow.material.opacity = 0.6 + Math.sin(t * 4) * 0.25;

      // Light trail rolls behind rickshaw
      for (let i = TR - 1; i > 0; i--) trailBuf[i].copy(trailBuf[i - 1]);
      trailBuf[0].set(rick.position.x - 0.9, 0.2, 0);
      for (let i = 0; i < TR; i++) {
        tPos[i * 3 + 0] = trailBuf[i].x;
        tPos[i * 3 + 1] = trailBuf[i].y;
        tPos[i * 3 + 2] = trailBuf[i].z;
        const f = 1 - i / TR;
        tCol[i * 3 + 0] = (252 / 255) * f;
        tCol[i * 3 + 1] = (195 / 255) * f;
        tCol[i * 3 + 2] = (44 / 255) * f;
      }
      tGeom.attributes.position.needsUpdate = true;
      tGeom.attributes.color.needsUpdate = true;

      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

  /* -------- celebrate: parked rickshaw, amber confetti fountain -------- */
  SCENES.celebrate = (el) => {
    const scene = new THREE.Scene();
    el._scene = scene;
    enableFog(scene, 10, 30);
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 2.2, 8); camera.lookAt(0, 0.7, 0);
    const renderer = makeRenderer(el);

    addGridFloor(scene); addHorizon(scene);

    const rick = buildRickshaw();
    rick.rotation.y = Math.PI / 6;
    rick.position.y = 0.1;
    scene.add(rick);

    const COUNT = reduced ? 60 : 180;
    const positions = new Float32Array(COUNT * 3);
    const velocity = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = 2 + Math.random() * 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 3;
      velocity[i * 3 + 0] = (Math.random() - 0.5) * 0.02;
      velocity[i * 3 + 1] = -0.01 - Math.random() * 0.02;
      velocity[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const confetti = new THREE.Points(geom, new THREE.PointsMaterial({
      color: ACCENT, map: softTexture, size: 0.25, sizeAttenuation: true,
      transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(confetti);

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick() {
      const t = clock.getElapsedTime();
      rick.position.y = 0.1 + Math.sin(t * 1.2) * 0.04;
      rick.userData.wheels.forEach(w => w.rotation.x = t * 0.5);
      for (let i = 0; i < COUNT; i++) {
        positions[i * 3 + 0] += velocity[i * 3 + 0];
        positions[i * 3 + 1] += velocity[i * 3 + 1];
        positions[i * 3 + 2] += velocity[i * 3 + 2];
        if (positions[i * 3 + 1] < -1) {
          positions[i * 3 + 0] = (Math.random() - 0.5) * 8;
          positions[i * 3 + 1] = 4 + Math.random();
          positions[i * 3 + 2] = (Math.random() - 0.5) * 3;
        }
      }
      geom.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

  /* -------- handshake: two rickshaws linked with a spark bridge -------- */
  SCENES.handshake = (el) => {
    const scene = new THREE.Scene();
    el._scene = scene;
    enableFog(scene, 10, 30);
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 2, 8); camera.lookAt(0, 0.6, 0);
    const renderer = makeRenderer(el);
    addGridFloor(scene); addHorizon(scene);
    addParticleField(scene, 80, { xz: 7, y: 3 });

    const A = buildRickshaw(); A.position.x = -2.4; A.rotation.y = Math.PI / 2; scene.add(A);
    const B = buildRickshaw(); B.position.x =  2.4; B.rotation.y = -Math.PI / 2; scene.add(B);

    // Animated spark arc
    const SEG = 60;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-1.2, 0.8, 0),
      new THREE.Vector3(0, 2.0, 0),
      new THREE.Vector3(1.2, 0.8, 0),
    );
    const pts = curve.getPoints(SEG);
    const arcGeom = new THREE.BufferGeometry().setFromPoints(pts);
    const arc = new THREE.Line(arcGeom, new THREE.LineBasicMaterial({
      color: ACCENT, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(arc);

    // Traveling spark along the arc
    const spark = glowSprite(0.7, 1, ACCENT);
    scene.add(spark);

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick() {
      const t = clock.getElapsedTime();
      A.position.y = Math.sin(t * 1.4) * 0.05;
      B.position.y = Math.sin(t * 1.4 + 1) * 0.05;
      arc.material.opacity = 0.6 + Math.sin(t * 2) * 0.35;
      const u = (t * 0.5) % 1;
      const p = curve.getPoint(u);
      spark.position.copy(p);
      spark.material.opacity = 0.8 + Math.sin(t * 8) * 0.2;
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

  /* -------- vault: rotating hex capsule + swirling particles (otp) -------- */
  SCENES.vault = (el) => {
    const scene = new THREE.Scene();
    el._scene = scene;
    enableFog(scene, 6, 18);
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 0.5, 6); camera.lookAt(0, 0.2, 0);
    const renderer = makeRenderer(el);

    const hexMat    = registerInk(new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.55 }));
    const accentMat = new THREE.LineBasicMaterial({ color: ACCENT });

    const outer = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(1.6, 1.6, 0.4, 6)), hexMat);
    outer.rotation.x = Math.PI / 2; outer.rotation.z = Math.PI / 6;
    scene.add(outer);
    const mid = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 6)), accentMat);
    mid.rotation.x = Math.PI / 2;
    scene.add(mid);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: ACCENT, wireframe: true }));
    scene.add(core);
    const coreGlow = glowSprite(1.8, 0.7, ACCENT);
    scene.add(coreGlow);

    // Swirling particle dust
    const N = reduced ? 40 : 120;
    const pos = new Float32Array(N * 3);
    const ang = new Float32Array(N);
    const rad = new Float32Array(N);
    const height = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      ang[i] = Math.random() * Math.PI * 2;
      rad[i] = 1.8 + Math.random() * 0.8;
      height[i] = -0.6 + Math.random() * 1.2;
      pos[i * 3 + 0] = Math.cos(ang[i]) * rad[i];
      pos[i * 3 + 1] = height[i];
      pos[i * 3 + 2] = Math.sin(ang[i]) * rad[i];
    }
    const pGeom = new THREE.BufferGeometry();
    pGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pMat = new THREE.PointsMaterial({
      color: ACCENT, map: softTexture, size: 0.2, sizeAttenuation: true,
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const swarm = new THREE.Points(pGeom, pMat);
    scene.add(swarm);

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick() {
      const t = clock.getElapsedTime();
      outer.rotation.y =  t * 0.4;
      mid.rotation.y   = -t * 0.6;
      core.rotation.x = t * 0.8; core.rotation.y = t * 1.3;
      coreGlow.material.opacity = 0.6 + Math.sin(t * 3) * 0.25;
      for (let i = 0; i < N; i++) {
        ang[i] += 0.008;
        height[i] += Math.sin(t * 0.6 + i) * 0.0008;
        pos[i * 3 + 0] = Math.cos(ang[i]) * rad[i];
        pos[i * 3 + 1] = height[i];
        pos[i * 3 + 2] = Math.sin(ang[i]) * rad[i];
      }
      pGeom.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

})();
