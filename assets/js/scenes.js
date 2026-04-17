/* Per-page Three.js scene loader.
 *
 * Markup:  <div data-scene="NAME" class="scene-bg"></div>
 * Scenes:
 *   'hero'      — orbiting rickshaw (landing)
 *   'driving'   — rickshaw driving along a curved road, parallax
 *   'lineup'    — a fleet of rickshaws scrolling past (estimates)
 *   'pulse'     — top-down beacon + rippling radar (home, search)
 *   'arriving'  — rickshaw decelerating into a destination marker (tracking)
 *   'celebrate' — confetti + parked rickshaw + star trail (rate/receipt)
 *   'handshake' — two rickshaws nose-to-nose (referral)
 *   'vault'     — secure hexagonal capsule (otp)
 *
 * Each scene runs independently; only one per page. Gracefully no-ops
 * without THREE available.
 */
(function () {
  'use strict';
  const nodes = document.querySelectorAll('[data-scene]');
  if (!nodes.length || !window.THREE) return;
  const THREE = window.THREE;

  const ACCENT = 0xFCC32C;
  function themeColors() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      INK:  dark ? 0xF2F3F7 : 0x15181E,
      DIM:  dark ? 0x2A2E39 : 0xD8DBE2,       // much lighter on light theme so scenes aren't black
      ACCENT,
    };
  }
  let { INK, DIM } = themeColors();
  // Track all materials we want to re-theme on theme change.
  const themedMaterials = [];
  function registerInk(m)  { m._themeRole = 'ink';  themedMaterials.push(m); return m; }
  function registerDim(m)  { m._themeRole = 'dim';  themedMaterials.push(m); return m; }
  window.addEventListener('ny:theme', () => {
    const c = themeColors(); INK = c.INK; DIM = c.DIM;
    themedMaterials.forEach(m => {
      if (m._themeRole === 'ink') m.color.setHex(c.INK);
      if (m._themeRole === 'dim') m.color.setHex(c.DIM);
    });
  });

  nodes.forEach(el => {
    const kind = el.getAttribute('data-scene');
    const builder = SCENES[kind] || SCENES.hero;
    builder(el);
  });

  /* ---------------- Reusable builders ---------------- */
  function makeRenderer(el) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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
  // A stylised auto-rickshaw (reused across scenes)
  function buildRickshaw() {
    const g = new THREE.Group();
    const lineMat    = registerInk(new THREE.LineBasicMaterial({ color: INK,  transparent: true, opacity: 0.92 }));
    const accentMat  = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 1.0 });

    // Lower body — cuboid
    const body = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.4, 0.8, 1.3)), lineMat);
    body.position.y = 0.2;
    g.add(body);

    // Tapered cabin
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

    // Amber headlight
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), new THREE.MeshBasicMaterial({ color: ACCENT }));
    light.position.set(1.3, 0.25, 0);
    g.add(light);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.22 }));
    halo.position.copy(light.position);
    g.add(halo);

    // Wheels
    const wGeom = new THREE.TorusGeometry(0.4, 0.08, 10, 28);
    const mkWheel = () => {
      const w = new THREE.LineSegments(new THREE.EdgesGeometry(wGeom), lineMat);
      w.rotation.y = Math.PI / 2; return w;
    };
    const wL = mkWheel(); wL.position.set(-0.8, -0.3, 0.72); g.add(wL);
    const wR = mkWheel(); wR.position.set(-0.8, -0.3, -0.72); g.add(wR);
    const wF = mkWheel(); wF.position.set(1.05, -0.3, 0); g.add(wF);

    // Chassis stripe (amber waist)
    g.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.2, 0.22, 0.66), new THREE.Vector3(1.2, 0.22, 0.66)]),
      accentMat
    ));
    g.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.2, 0.22, -0.66), new THREE.Vector3(1.2, 0.22, -0.66)]),
      accentMat
    ));

    g.userData.wheels = [wL, wR, wF];
    return g;
  }

  function addGridFloor(scene) {
    const grid = new THREE.GridHelper(60, 60, DIM, DIM);
    grid.material._themeRole = 'dim'; themedMaterials.push(grid.material);
    grid.material.transparent = true;
    grid.material.opacity = 0.32;
    grid.position.y = -1.2;
    scene.add(grid);
  }
  function addHorizon(scene) {
    const line = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-30, -1.2, -24), new THREE.Vector3(30, -1.2, -24)]);
    scene.add(new THREE.Line(line, registerInk(new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.30 }))));
  }

  const SCENES = {};

  /* hero: orbiting rickshaw + amber satellite — same feel as the landing */
  SCENES.hero = (el) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 1.9, 9); camera.lookAt(0, 0.6, 0);
    const renderer = makeRenderer(el);
    addGridFloor(scene); addHorizon(scene);
    const rick = buildRickshaw(); rick.position.y = 0.1; scene.add(rick);
    const sat = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), new THREE.MeshBasicMaterial({ color: ACCENT })); scene.add(sat);
    resize(renderer, camera, el);
    let px=0, py=0;
    el.addEventListener('pointermove', e => { const r=el.getBoundingClientRect(); px=(e.clientX-r.left)/r.width-0.5; py=(e.clientY-r.top)/r.height-0.5; });
    el.addEventListener('pointerleave', () => { px=0; py=0; });
    const clock = new THREE.Clock();
    (function tick(){
      const t = clock.getElapsedTime();
      camera.position.x += (px*1.8 - camera.position.x) * 0.04;
      camera.position.y += (1.9 - py*1.1 - camera.position.y) * 0.04;
      camera.lookAt(0, 0.6, 0);
      rick.rotation.y = Math.sin(t*0.22)*0.55;
      rick.position.y = 0.1 + Math.sin(t*0.9)*0.04;
      rick.userData.wheels.forEach(w => w.rotation.x = t*2.6);
      sat.position.set(Math.cos(t*0.55)*2.8, 0.7 + Math.sin(t*2)*0.35, Math.sin(t*0.55)*2.8);
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

  /* driving: a looping road where the rickshaw drives toward the viewer */
  SCENES.driving = (el) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 2.4, 6.5); camera.lookAt(0, 0.8, 0);
    const renderer = makeRenderer(el);

    // Infinite scrolling road grid — animate position Z
    const grid = new THREE.GridHelper(100, 100, DIM, DIM);
    grid.material.transparent = true; grid.material.opacity = 0.38;
    grid.material._themeRole = 'dim'; themedMaterials.push(grid.material);
    grid.position.y = -0.6;
    scene.add(grid);

    // Road centre line (dashed amber)
    const roadMat = new THREE.LineDashedMaterial({ color: ACCENT, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.85 });
    const roadGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,-0.59,-40), new THREE.Vector3(0,-0.59,40)]);
    const road = new THREE.Line(roadGeom, roadMat);
    road.computeLineDistances();
    scene.add(road);

    // Road edge lines
    const edgeMat = registerInk(new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5 }));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-3,-0.59,-40), new THREE.Vector3(-3,-0.59,40)]), edgeMat));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(3,-0.59,-40), new THREE.Vector3(3,-0.59,40)]), edgeMat));

    const rick = buildRickshaw();
    rick.scale.setScalar(0.85);
    rick.position.set(0, 0, 1.2);
    rick.rotation.y = Math.PI; // face camera
    scene.add(rick);

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick(){
      const t = clock.getElapsedTime();
      grid.position.z = (t * 3) % 2; // scroll the floor grid to fake motion
      rick.position.y = Math.sin(t*6) * 0.04; // bump
      rick.rotation.z = Math.sin(t*3) * 0.02; // lean
      rick.userData.wheels.forEach(w => w.rotation.x = -t * 9);
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

  /* lineup: several rickshaws lined up; user picks one (estimates) */
  SCENES.lineup = (el) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 2.2, 10); camera.lookAt(0, 0.6, 0);
    const renderer = makeRenderer(el);
    addGridFloor(scene); addHorizon(scene);

    const fleet = new THREE.Group();
    scene.add(fleet);
    const COUNT = 5;
    for (let i = 0; i < COUNT; i++) {
      const r = buildRickshaw();
      r.scale.setScalar(0.55);
      r.position.x = (i - (COUNT - 1) / 2) * 2.3;
      r.position.y = 0;
      r.rotation.y = -Math.PI / 2;
      r.userData.phase = i * 0.4;
      fleet.add(r);
    }

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick(){
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

  /* pulse: top-down beacon with rippling amber rings (home) */
  SCENES.pulse = (el) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 8, 0.01); camera.lookAt(0, 0, 0);
    const renderer = makeRenderer(el);

    // Subtle grid
    const grid = new THREE.GridHelper(60, 30, DIM, DIM);
    grid.material.transparent = true; grid.material.opacity = 0.35;
    grid.material._themeRole = 'dim'; themedMaterials.push(grid.material);
    scene.add(grid);

    // Pin (amber dot)
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20), new THREE.MeshBasicMaterial({ color: ACCENT }));
    pin.rotation.x = Math.PI / 2;
    scene.add(pin);

    // Radar rings
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const geom = new THREE.RingGeometry(0.15, 0.16, 64);
      const mat  = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(geom, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.userData.offset = i / 3;
      scene.add(ring);
      rings.push(ring);
    }

    // Orbit rickshaw in top-down view
    const rick = buildRickshaw();
    rick.scale.setScalar(0.35);
    rick.position.y = 0.01;
    scene.add(rick);

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick(){
      const t = clock.getElapsedTime();
      rings.forEach(r => {
        const phase = ((t * 0.5 + r.userData.offset) % 1);
        const scale = 0.6 + phase * 8;
        r.scale.setScalar(scale);
        r.material.opacity = (1 - phase) * 0.55;
      });
      const radius = 2.2;
      rick.position.x = Math.cos(t * 0.6) * radius;
      rick.position.z = Math.sin(t * 0.6) * radius;
      rick.rotation.y = -t * 0.6 - Math.PI / 2;
      rick.userData.wheels.forEach(w => w.rotation.x = t * 3);
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

  /* arriving: rickshaw decelerating toward a destination pin (ride) */
  SCENES.arriving = (el) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 2, 8); camera.lookAt(0, 0.4, 0);
    const renderer = makeRenderer(el);
    addGridFloor(scene); addHorizon(scene);

    // Destination pin on the right
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 16), new THREE.MeshBasicMaterial({ color: ACCENT }));
    pin.position.set(3.5, 0, 0);
    scene.add(pin);
    const pinRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 8, 48), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55 }));
    pinRing.rotation.x = Math.PI / 2;
    pinRing.position.copy(pin.position);
    pinRing.position.y = -0.1;
    scene.add(pinRing);

    const rick = buildRickshaw();
    rick.scale.setScalar(0.7);
    scene.add(rick);

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick(){
      const t = clock.getElapsedTime();
      const phase = (t * 0.3) % 1;       // 0 → 1 loop
      rick.position.x = -5 + phase * 8.5; // drive left → right
      rick.rotation.y = Math.PI / 2;
      rick.position.y = Math.sin(t*6) * 0.03;
      rick.userData.wheels.forEach(w => w.rotation.x = -t * 9);
      // pin pulse
      const s = 1 + Math.sin(t*3) * 0.15;
      pinRing.scale.setScalar(s);
      pinRing.material.opacity = 0.6 - (s - 1) * 2;
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

  /* celebrate: parked rickshaw + amber confetti (rate/receipt) */
  SCENES.celebrate = (el) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 2.2, 8); camera.lookAt(0, 0.7, 0);
    const renderer = makeRenderer(el);
    addGridFloor(scene); addHorizon(scene);

    const rick = buildRickshaw();
    rick.rotation.y = Math.PI / 6;
    rick.position.y = 0.1;
    scene.add(rick);

    // Confetti: points drifting down
    const COUNT = 140;
    const positions = new Float32Array(COUNT * 3);
    const velocity = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i*3 + 0] = (Math.random() - 0.5) * 8;
      positions[i*3 + 1] = 2 + Math.random() * 4;
      positions[i*3 + 2] = (Math.random() - 0.5) * 3;
      velocity[i*3 + 0] = (Math.random() - 0.5) * 0.02;
      velocity[i*3 + 1] = -0.01 - Math.random() * 0.02;
      velocity[i*3 + 2] = (Math.random() - 0.5) * 0.02;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const confetti = new THREE.Points(geom, new THREE.PointsMaterial({ color: ACCENT, size: 3, sizeAttenuation: false }));
    scene.add(confetti);

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick(){
      const t = clock.getElapsedTime();
      rick.position.y = 0.1 + Math.sin(t * 1.2) * 0.04;
      rick.userData.wheels.forEach(w => w.rotation.x = t * 0.5);
      for (let i = 0; i < COUNT; i++) {
        positions[i*3 + 0] += velocity[i*3 + 0];
        positions[i*3 + 1] += velocity[i*3 + 1];
        positions[i*3 + 2] += velocity[i*3 + 2];
        if (positions[i*3 + 1] < -1) {
          positions[i*3 + 0] = (Math.random() - 0.5) * 8;
          positions[i*3 + 1] = 4 + Math.random();
          positions[i*3 + 2] = (Math.random() - 0.5) * 3;
        }
      }
      geom.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

  /* handshake: two rickshaws facing each other (referral) */
  SCENES.handshake = (el) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 2, 8); camera.lookAt(0, 0.6, 0);
    const renderer = makeRenderer(el);
    addGridFloor(scene); addHorizon(scene);

    const A = buildRickshaw();
    A.position.x = -2.4; A.rotation.y = Math.PI / 2;
    const B = buildRickshaw();
    B.position.x = 2.4;  B.rotation.y = -Math.PI / 2;
    scene.add(A); scene.add(B);

    // A linking amber arc between them
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-1.2, 0.8, 0),
      new THREE.Vector3(0, 2.0, 0),
      new THREE.Vector3(1.2, 0.8, 0),
    );
    const pts = curve.getPoints(40);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9 }));
    scene.add(line);

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick(){
      const t = clock.getElapsedTime();
      A.position.y = Math.sin(t * 1.4) * 0.05;
      B.position.y = Math.sin(t * 1.4 + 1) * 0.05;
      line.material.opacity = 0.6 + Math.sin(t * 2) * 0.35;
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

  /* vault: rotating hexagonal lock (otp) */
  SCENES.vault = (el) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 200);
    camera.position.set(0, 0.5, 6); camera.lookAt(0, 0.2, 0);
    const renderer = makeRenderer(el);

    const hexMat    = registerInk(new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5 }));
    const accentMat = new THREE.LineBasicMaterial({ color: ACCENT });

    const outer = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(1.6, 1.6, 0.4, 6)), hexMat);
    outer.rotation.x = Math.PI / 2; outer.rotation.z = Math.PI / 6;
    scene.add(outer);
    const mid = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 6)), accentMat);
    mid.rotation.x = Math.PI / 2;
    scene.add(mid);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: ACCENT, wireframe: true }));
    scene.add(core);

    resize(renderer, camera, el);
    const clock = new THREE.Clock();
    (function tick(){
      const t = clock.getElapsedTime();
      outer.rotation.y = t * 0.4;
      mid.rotation.y = -t * 0.6;
      core.rotation.x = t * 0.8;
      core.rotation.y = t * 1.3;
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    })();
  };

})();
