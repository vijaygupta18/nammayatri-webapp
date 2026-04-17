/* Three.js hero — premium ride-hailing wireframe.
 * Single-accent palette: white, dim, amber. WebGL via window.THREE only.
 * Renders only if #three-hero and window.THREE are present. */
(function () {
  'use strict';
  const container = document.getElementById('three-hero');
  if (!container || !window.THREE) return;

  const THREE = window.THREE;
  const W = () => container.clientWidth;
  const H = () => container.clientHeight;

  const ACCENT = 0xFCC32C;
  const themeColors = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return { INK: dark ? 0xF2F3F7 : 0x15181E, DIM: dark ? 0x2A2E39 : 0xCBCFD8 };
  };
  let { INK: WHITE, DIM } = themeColors();
  const themedMats = [];
  const regInk = m => { m._role = 'ink'; themedMats.push(m); return m; };
  const regDim = m => { m._role = 'dim'; themedMats.push(m); return m; };
  window.addEventListener('ny:theme', () => {
    const c = themeColors(); WHITE = c.INK; DIM = c.DIM;
    themedMats.forEach(m => m.color.setHex(m._role === 'ink' ? c.INK : c.DIM));
  });

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 200);
  camera.position.set(0, 1.9, 9);
  camera.lookAt(0, 0.6, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W(), H());
  container.appendChild(renderer.domElement);

  // --- Infinite perspective floor (GridHelper) ---
  const grid = new THREE.GridHelper(60, 60, DIM, DIM);
  regDim(grid.material);
  grid.material.transparent = true;
  grid.material.opacity = 0.32;
  grid.position.y = -1.2;
  scene.add(grid);

  // --- Horizon line ---
  const horizonGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-30, -1.2, -24),
    new THREE.Vector3( 30, -1.2, -24),
  ]);
  const horizonMat = regInk(new THREE.LineBasicMaterial({ color: WHITE, transparent: true, opacity: 0.30 }));
  scene.add(new THREE.Line(horizonGeom, horizonMat));

  // --- Stylised auto-rickshaw wireframe ---
  const vehicle = new THREE.Group();
  vehicle.position.y = 0.1;

  const lineMat     = regInk(new THREE.LineBasicMaterial({ color: WHITE,  transparent: true, opacity: 0.92 }));
  const lineAccent  = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 1.0 });
  const wheelMat    = regInk(new THREE.LineBasicMaterial({ color: WHITE,  transparent: true, opacity: 0.85 }));

  // Lower body — cuboid
  const bodyGeom = new THREE.BoxGeometry(2.6, 0.9, 1.4);
  const body = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeom), lineMat);
  body.position.y = 0.2;
  vehicle.add(body);

  // Cabin — tapered cuboid (using BoxGeometry scaled top via manual geometry)
  // Approximate taper by offsetting top vertices of a BoxGeometry.
  const cabinGeom = new THREE.BoxGeometry(1.8, 1.0, 1.2);
  {
    const pos = cabinGeom.attributes.position;
    // Top (y == +0.5) vertices get pulled inward on x and z for a tapered cabin
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0.4) {
        pos.setX(i, pos.getX(i) * 0.62);
        pos.setZ(i, pos.getZ(i) * 0.78);
      }
    }
    pos.needsUpdate = true;
    cabinGeom.computeBoundingBox();
  }
  const cabin = new THREE.LineSegments(new THREE.EdgesGeometry(cabinGeom), lineMat);
  cabin.position.y = 1.15;
  cabin.position.x = 0.15;
  vehicle.add(cabin);

  // Front light — tiny amber dot
  const frontLightGeom = new THREE.SphereGeometry(0.08, 16, 16);
  const frontLight = new THREE.Mesh(frontLightGeom, new THREE.MeshBasicMaterial({ color: ACCENT }));
  frontLight.position.set(1.35, 0.25, 0);
  vehicle.add(frontLight);

  // Two wheels — tori
  const wheelGeom = new THREE.TorusGeometry(0.42, 0.09, 12, 32);
  const wheelL = new THREE.LineSegments(new THREE.EdgesGeometry(wheelGeom), wheelMat);
  wheelL.rotation.y = Math.PI / 2;
  wheelL.position.set(-0.85, -0.35, 0.78);
  vehicle.add(wheelL);
  const wheelR = wheelL.clone();
  wheelR.position.z = -0.78;
  vehicle.add(wheelR);

  // Front single wheel (auto-rickshaw style)
  const wheelF = new THREE.LineSegments(new THREE.EdgesGeometry(wheelGeom), wheelMat);
  wheelF.rotation.y = Math.PI / 2;
  wheelF.position.set(1.15, -0.35, 0);
  vehicle.add(wheelF);

  // Subtle accent chassis stripe — thin line along the body waist
  const stripeGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1.3, 0.25, 0.71),
    new THREE.Vector3( 1.3, 0.25, 0.71),
  ]);
  vehicle.add(new THREE.Line(stripeGeom, lineAccent));
  const stripeGeom2 = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1.3, 0.25, -0.71),
    new THREE.Vector3( 1.3, 0.25, -0.71),
  ]);
  vehicle.add(new THREE.Line(stripeGeom2, lineAccent));

  scene.add(vehicle);

  // --- Orbiting amber satellite ---
  const sat = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 16),
    new THREE.MeshBasicMaterial({ color: ACCENT })
  );
  scene.add(sat);

  // --- 10–12 tiny amber vertex points that blink ---
  const BLINK_N = 11;
  const blinkPositions = new Float32Array(BLINK_N * 3);
  const blinkPhases = new Float32Array(BLINK_N);
  for (let i = 0; i < BLINK_N; i++) {
    const a = (i / BLINK_N) * Math.PI * 2;
    const r = 2.6 + Math.random() * 0.8;
    blinkPositions[i * 3 + 0] = Math.cos(a) * r;
    blinkPositions[i * 3 + 1] = -0.4 + Math.random() * 1.6;
    blinkPositions[i * 3 + 2] = Math.sin(a) * r;
    blinkPhases[i] = Math.random() * Math.PI * 2;
  }
  const blinkGeom = new THREE.BufferGeometry();
  blinkGeom.setAttribute('position', new THREE.Float32BufferAttribute(blinkPositions, 3));
  const blinkMat = new THREE.PointsMaterial({ color: ACCENT, size: 4, sizeAttenuation: false, transparent: true, opacity: 1 });
  const blinks = new THREE.Points(blinkGeom, blinkMat);
  scene.add(blinks);

  // --- Interaction: parallax on pointer ---
  let px = 0, py = 0;
  container.addEventListener('pointermove', (e) => {
    const r = container.getBoundingClientRect();
    px = (e.clientX - r.left) / r.width - 0.5;
    py = (e.clientY - r.top)  / r.height - 0.5;
  });
  container.addEventListener('pointerleave', () => { px = 0; py = 0; });

  // --- Resize ---
  const onResize = () => {
    renderer.setSize(W(), H());
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  // --- Animate (slow ambient drift) ---
  const clock = new THREE.Clock();
  let rafId = 0;
  function tick() {
    const t = clock.getElapsedTime();

    // parallax camera
    camera.position.x += (px * 1.8 - camera.position.x) * 0.04;
    camera.position.y += (1.9 - py * 1.1 - camera.position.y) * 0.04;
    camera.lookAt(0, 0.6, 0);

    // slow ambient drift: gentle yaw + subtle bob
    vehicle.rotation.y = Math.sin(t * 0.22) * 0.55;
    vehicle.position.y = 0.1 + Math.sin(t * 0.9) * 0.04;

    // wheels spin when yaw indicates forward-ish motion
    const spin = t * 2.6;
    wheelL.rotation.x = spin;
    wheelR.rotation.x = spin;
    wheelF.rotation.x = spin;

    // amber satellite orbits the vehicle
    const r = 2.8;
    sat.position.x = Math.cos(t * 0.55) * r;
    sat.position.z = Math.sin(t * 0.55) * r;
    sat.position.y = 0.7 + Math.sin(t * 2.0) * 0.35;

    // blink vertex points
    const col = blinkMat;
    col.opacity = 0.55 + Math.sin(t * 3.1) * 0.35;

    // animate blink sizes via material — blink by toggling opacity per-point is not trivial;
    // keep material opacity pulsing for an even, premium shimmer.
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }
  tick();

  window.addEventListener('beforeunload', () => cancelAnimationFrame(rafId));
})();
