/* NammaYatri · Three.js hero — futuristic v2.
 * Premium cinematic rickshaw scene: fog, particles, light-trail, skyline silhouette,
 * emissive glow via additive sprites, auto-drift camera with pointer parallax, reflection-lite.
 * Single-accent amber palette preserved; renders only if #three-hero and window.THREE exist.
 */
(function () {
  'use strict';
  const container = document.getElementById('three-hero');
  if (!container || !window.THREE) return;

  const THREE = window.THREE;
  const W = () => container.clientWidth;
  const H = () => container.clientHeight;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ACCENT = 0xFCC32C;
  const ACCENT_HI = 0xFFE98A;
  const ACCENT_LO = 0xB97F0A;

  function themeColors() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      INK:  dark ? 0xF2F3F7 : 0x15181E,
      DIM:  dark ? 0x2A2E39 : 0xCBCFD8,
      FOG:  dark ? 0x0A0B0F : 0xF7F7F3,
      SKY:  dark ? 0x11141B : 0xEEEEF2,
    };
  }
  let { INK, DIM, FOG, SKY } = themeColors();

  // Theme-tracked materials
  const themed = [];
  const regInk  = m => { m._role = 'ink';  themed.push(m); return m; };
  const regDim  = m => { m._role = 'dim';  themed.push(m); return m; };
  const regSky  = m => { m._role = 'sky';  themed.push(m); return m; };

  /* --------------------- Scene ---------------------- */
  const scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.Fog(FOG, 9, 34);

  const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 200);
  const CAM_DEFAULT = new THREE.Vector3(0, 1.9, 9);
  camera.position.copy(CAM_DEFAULT);
  camera.lookAt(0, 0.6, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W(), H());
  renderer.sortObjects = true;
  container.appendChild(renderer.domElement);

  /* ----- Soft radial sprite (used for glow dots, trails, halos) ----- */
  const softSpriteCanvas = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,230,130,0.9)');
    grad.addColorStop(0.5, 'rgba(252,195,44,0.35)');
    grad.addColorStop(1.0, 'rgba(252,195,44,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return c;
  })();
  const softTexture = new THREE.CanvasTexture(softSpriteCanvas);
  softTexture.needsUpdate = true;

  /* --------------------- Ground (perspective grid) ---------------------- */
  const grid = new THREE.GridHelper(80, 80, DIM, DIM);
  regDim(grid.material);
  grid.material.transparent = true;
  grid.material.opacity = 0.3;
  grid.position.y = -1.2;
  scene.add(grid);

  // Concentric amber rings under vehicle (scanner look)
  const ringGroup = new THREE.Group();
  ringGroup.position.y = -1.18;
  for (let i = 0; i < 4; i++) {
    const rInner = 1.4 + i * 1.2;
    const rOuter = rInner + 0.03;
    const g = new THREE.RingGeometry(rInner, rOuter, 128);
    const m = new THREE.MeshBasicMaterial({
      color: ACCENT, transparent: true, opacity: 0.35 - i * 0.06, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(g, m);
    ring.rotation.x = -Math.PI / 2;
    ring.userData.baseOpacity = m.opacity;
    ring.userData.phase = i * 0.25;
    ringGroup.add(ring);
  }
  scene.add(ringGroup);

  /* --------------------- Horizon + skyline ---------------------- */
  const horizonLine = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-40, -1.2, -26),
    new THREE.Vector3( 40, -1.2, -26),
  ]);
  scene.add(new THREE.Line(horizonLine,
    regInk(new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.24 }))));

  // Procedural skyline silhouette (random building rectangles).
  const skylineGroup = new THREE.Group();
  skylineGroup.position.set(0, -1.2, -25);
  {
    const skyMat = regSky(new THREE.MeshBasicMaterial({ color: SKY, transparent: true, opacity: 0.85 }));
    const accentDotMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 1 });
    const seed = [0.4, 1.1, 2.3, 0.8, 1.6, 2.0, 1.2, 0.9, 1.8, 0.6, 1.3, 2.5, 0.7, 1.0, 1.4, 0.9, 2.1, 0.5, 1.7, 1.1];
    let x = -28;
    for (let i = 0; i < seed.length; i++) {
      const h = seed[i];
      const w = 1.4 + (i % 3) * 0.4;
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.6), skyMat);
      building.position.set(x + w / 2, h / 2, 0);
      skylineGroup.add(building);
      // random amber window dot
      if (Math.random() > 0.5) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), accentDotMat);
        dot.position.set(x + w / 2 + (Math.random() - 0.5) * 0.4, h * 0.6, 0.32);
        skylineGroup.add(dot);
      }
      x += w + 0.15;
    }
  }
  scene.add(skylineGroup);

  /* --------------------- Rickshaw (wireframe + emissive accents) ---------------------- */
  const vehicle = new THREE.Group();
  vehicle.position.y = 0.1;

  const lineMat   = regInk(new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.95 }));
  const lineAcc   = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 1 });
  const wheelMat  = regInk(new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.85 }));

  // Lower body
  const bodyGeom = new THREE.BoxGeometry(2.6, 0.9, 1.4);
  const body = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeom), lineMat);
  body.position.y = 0.2;
  vehicle.add(body);

  // Tapered cabin
  const cabinGeom = new THREE.BoxGeometry(1.8, 1.0, 1.2);
  {
    const pos = cabinGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0.4) {
        pos.setX(i, pos.getX(i) * 0.62);
        pos.setZ(i, pos.getZ(i) * 0.78);
      }
    }
    pos.needsUpdate = true;
  }
  const cabin = new THREE.LineSegments(new THREE.EdgesGeometry(cabinGeom), lineMat);
  cabin.position.set(0.15, 1.15, 0);
  vehicle.add(cabin);

  // Accent stripes
  const stripeSrc = [
    [-1.3, 0.25,  0.71,  1.3, 0.25,  0.71],
    [-1.3, 0.25, -0.71,  1.3, 0.25, -0.71],
    [-1.2, 0.82,  0.40,  1.0, 0.82,  0.40],   // extra top stripe
    [-1.2, 0.82, -0.40,  1.0, 0.82, -0.40],
  ];
  stripeSrc.forEach(p => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p[0], p[1], p[2]), new THREE.Vector3(p[3], p[4], p[5])]);
    vehicle.add(new THREE.Line(g, lineAcc));
  });

  // Wheels (3 — auto-rickshaw style)
  const wGeom = new THREE.TorusGeometry(0.42, 0.09, 12, 32);
  function makeWheel() {
    const w = new THREE.LineSegments(new THREE.EdgesGeometry(wGeom), wheelMat);
    w.rotation.y = Math.PI / 2;
    return w;
  }
  const wL = makeWheel(); wL.position.set(-0.85, -0.35,  0.78); vehicle.add(wL);
  const wR = makeWheel(); wR.position.set(-0.85, -0.35, -0.78); vehicle.add(wR);
  const wF = makeWheel(); wF.position.set( 1.15, -0.35,  0);    vehicle.add(wF);

  // Headlight: point mesh + glow sprite
  const headlightCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 16, 16),
    new THREE.MeshBasicMaterial({ color: ACCENT_HI })
  );
  headlightCore.position.set(1.35, 0.28, 0);
  vehicle.add(headlightCore);

  const glowSpriteMat = new THREE.SpriteMaterial({
    map: softTexture, color: ACCENT, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const headlightGlow = new THREE.Sprite(glowSpriteMat.clone());
  headlightGlow.position.copy(headlightCore.position);
  headlightGlow.scale.set(1.1, 1.1, 1);
  vehicle.add(headlightGlow);

  // Headlight cone (volumetric-ish)
  const coneGeom = new THREE.ConeGeometry(0.55, 2.5, 32, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.14, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const headlightCone = new THREE.Mesh(coneGeom, coneMat);
  headlightCone.rotation.z = -Math.PI / 2;
  headlightCone.position.set(2.4, 0.28, 0);
  vehicle.add(headlightCone);

  // Rear ambient glow (tail)
  const tail = new THREE.Sprite(glowSpriteMat.clone());
  tail.material.color.setHex(ACCENT_LO);
  tail.material.opacity = 0.6;
  tail.position.set(-1.4, 0.3, 0);
  tail.scale.set(0.6, 0.6, 1);
  vehicle.add(tail);

  scene.add(vehicle);

  /* --------------------- Orbiting amber satellite + trail ---------------------- */
  const satCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 16),
    new THREE.MeshBasicMaterial({ color: ACCENT_HI })
  );
  scene.add(satCore);
  const satGlow = new THREE.Sprite(glowSpriteMat.clone());
  satGlow.scale.set(0.9, 0.9, 1);
  scene.add(satGlow);

  // Trail: BufferGeometry with 60 points (rolling buffer)
  const TRAIL_LEN = 70;
  const trailPositions = new Float32Array(TRAIL_LEN * 3);
  const trailColors = new Float32Array(TRAIL_LEN * 3);
  for (let i = 0; i < TRAIL_LEN; i++) {
    trailColors[i * 3] = 252 / 255;
    trailColors[i * 3 + 1] = 195 / 255;
    trailColors[i * 3 + 2] = 44 / 255;
  }
  const trailGeom = new THREE.BufferGeometry();
  trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeom.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trailMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const trail = new THREE.Line(trailGeom, trailMat);
  scene.add(trail);

  /* --------------------- Floating amber particle field ---------------------- */
  const PARTICLE_N = reduced ? 40 : 180;
  const particlePositions = new Float32Array(PARTICLE_N * 3);
  const particleSizes = new Float32Array(PARTICLE_N);
  const particlePhases = new Float32Array(PARTICLE_N);
  for (let i = 0; i < PARTICLE_N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 9;
    particlePositions[i * 3 + 0] = Math.cos(a) * r + (Math.random() - 0.5) * 2;
    particlePositions[i * 3 + 1] = -0.9 + Math.random() * 4.2;
    particlePositions[i * 3 + 2] = Math.sin(a) * r + (Math.random() - 0.5) * 2;
    particleSizes[i] = 0.6 + Math.random() * 1.4;
    particlePhases[i] = Math.random() * Math.PI * 2;
  }
  const particleGeom = new THREE.BufferGeometry();
  particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeom.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));
  const particleMat = new THREE.PointsMaterial({
    color: ACCENT, map: softTexture,
    size: 0.22, sizeAttenuation: true,
    transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const particles = new THREE.Points(particleGeom, particleMat);
  scene.add(particles);

  // Subtle starlight layer (far, small)
  const STAR_N = reduced ? 0 : 90;
  if (STAR_N > 0) {
    const starPos = new Float32Array(STAR_N * 3);
    for (let i = 0; i < STAR_N; i++) {
      starPos[i * 3 + 0] = (Math.random() - 0.5) * 40;
      starPos[i * 3 + 1] = 2 + Math.random() * 6;
      starPos[i * 3 + 2] = -10 - Math.random() * 14;
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: ACCENT, size: 3, sizeAttenuation: false,
      transparent: true, opacity: 0.6, depthWrite: false,
    });
    scene.add(new THREE.Points(starGeom, starMat));
  }

  /* --------------------- Ground reflection ghost (simple, no mirror render) ---------------------- */
  const ghost = new THREE.Group();
  ghost.position.y = -2.5;
  ghost.scale.y = -1;
  ghost.traverse = () => {};
  // Build a dim duplicate of vehicle using wireframe material
  const ghostMat = regDim(new THREE.LineBasicMaterial({ color: DIM, transparent: true, opacity: 0.12 }));
  const ghostBody = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeom), ghostMat);
  ghostBody.position.y = 0.2;
  ghost.add(ghostBody);
  const ghostCabin = new THREE.LineSegments(new THREE.EdgesGeometry(cabinGeom), ghostMat);
  ghostCabin.position.set(0.15, 1.15, 0);
  ghost.add(ghostCabin);
  scene.add(ghost);

  /* --------------------- Pointer parallax ---------------------- */
  let px = 0, py = 0;
  container.addEventListener('pointermove', (e) => {
    const r = container.getBoundingClientRect();
    px = (e.clientX - r.left) / r.width - 0.5;
    py = (e.clientY - r.top) / r.height - 0.5;
  });
  container.addEventListener('pointerleave', () => { px = 0; py = 0; });

  /* --------------------- Resize ---------------------- */
  const onResize = () => {
    renderer.setSize(W(), H());
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  /* --------------------- Theme sync ---------------------- */
  window.addEventListener('ny:theme', () => {
    const c = themeColors();
    INK = c.INK; DIM = c.DIM; FOG = c.FOG; SKY = c.SKY;
    themed.forEach(m => {
      if (m._role === 'ink') m.color.setHex(c.INK);
      if (m._role === 'dim') m.color.setHex(c.DIM);
      if (m._role === 'sky') m.color.setHex(c.SKY);
    });
    scene.fog.color.setHex(c.FOG);
  });

  /* --------------------- Animate ---------------------- */
  const clock = new THREE.Clock();
  let rafId = 0;
  let satTrail = new Array(TRAIL_LEN).fill(null).map(() => new THREE.Vector3());
  satTrail.forEach(v => v.set(0, 1, 0));

  function tick() {
    const t = clock.getElapsedTime();

    // Camera parallax + slow auto-drift
    const driftX = Math.sin(t * 0.08) * 0.25;
    const driftY = Math.cos(t * 0.11) * 0.15;
    const camTX = px * 1.8 + driftX;
    const camTY = 1.9 - py * 1.1 + driftY;
    camera.position.x += (camTX - camera.position.x) * 0.04;
    camera.position.y += (camTY - camera.position.y) * 0.04;
    camera.position.z = 9 + Math.sin(t * 0.07) * 0.35;
    camera.lookAt(0, 0.6, 0);

    // Vehicle gentle yaw + bob
    vehicle.rotation.y = Math.sin(t * 0.22) * 0.55;
    vehicle.position.y = 0.1 + Math.sin(t * 0.9) * 0.04;

    // Wheels spin
    const spin = t * 2.6;
    wL.rotation.x = spin; wR.rotation.x = spin; wF.rotation.x = spin;

    // Headlight cone orientation follows vehicle yaw
    const yaw = vehicle.rotation.y;
    headlightCone.position.set(
      vehicle.position.x + Math.cos(yaw) * 2.4,
      0.28,
      vehicle.position.z + Math.sin(yaw) * -2.4
    );
    headlightCone.rotation.y = -yaw;
    headlightCone.rotation.z = -Math.PI / 2;
    coneMat.opacity = 0.10 + Math.sin(t * 2.1) * 0.04;
    glowSpriteMat.opacity = 0.9 + Math.sin(t * 4) * 0.1;

    // Amber satellite orbiting
    const r = 2.9;
    const phase = t * 0.55;
    satCore.position.set(Math.cos(phase) * r, 0.7 + Math.sin(t * 2.0) * 0.35, Math.sin(phase) * r);
    satGlow.position.copy(satCore.position);

    // Trail buffer: rolling
    for (let i = TRAIL_LEN - 1; i > 0; i--) satTrail[i].copy(satTrail[i - 1]);
    satTrail[0].copy(satCore.position);
    for (let i = 0; i < TRAIL_LEN; i++) {
      trailPositions[i * 3 + 0] = satTrail[i].x;
      trailPositions[i * 3 + 1] = satTrail[i].y;
      trailPositions[i * 3 + 2] = satTrail[i].z;
      const f = 1 - i / TRAIL_LEN;
      trailColors[i * 3 + 0] = (252 / 255) * f;
      trailColors[i * 3 + 1] = (195 / 255) * f;
      trailColors[i * 3 + 2] = (44 / 255) * f;
    }
    trailGeom.attributes.position.needsUpdate = true;
    trailGeom.attributes.color.needsUpdate = true;

    // Particles gentle drift + blink
    for (let i = 0; i < PARTICLE_N; i++) {
      particlePositions[i * 3 + 1] += Math.sin(t * 0.5 + particlePhases[i]) * 0.003;
    }
    particleGeom.attributes.position.needsUpdate = true;
    particleMat.opacity = 0.6 + Math.sin(t * 1.4) * 0.2;

    // Ground rings pulse
    ringGroup.children.forEach((ring, i) => {
      const p = (t * 0.45 + ring.userData.phase) % 1;
      ring.material.opacity = (1 - p) * 0.45 - i * 0.02;
      if (ring.material.opacity < 0) ring.material.opacity = 0;
    });

    // Skyline gentle sway
    skylineGroup.rotation.y = Math.sin(t * 0.08) * 0.01;

    // Ghost tracks vehicle (negative Y for mirror effect)
    ghost.position.x = vehicle.position.x;
    ghost.position.z = vehicle.position.z;
    ghost.rotation.y = vehicle.rotation.y;

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }
  tick();

  window.addEventListener('beforeunload', () => cancelAnimationFrame(rafId));
})();
