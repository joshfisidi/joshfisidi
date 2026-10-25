// The far system: the Sun and eight planets plus the Moon, using the meshes converted from PlanetsOBJ.obj,
// moved by the N-body engine in physics.js and seen from a long way down -z, behind the wormhole.
import * as THREE from "../vendor/three.module.min.js";
import { buildSystem } from "./physics.js";
import { SYSTEM } from "./config.js";

const TAU = Math.PI * 2;
const TIME_SCALE = 1;
const SUBSTEP = 0.02;
const TRAIL_POINTS = 220;
const FOV = 38;
const T = (f) => `assets/textures/${f}`;

async function loadMesh(file) {
  const buf = await (await fetch(`assets/meshes/${file}`)).arrayBuffer();
  const [n, ni] = new Uint32Array(buf, 0, 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buf, 8, n * 3), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(buf, 8 + n * 12, n * 3), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(buf, 8 + n * 24, n * 2), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, 8 + n * 32, ni), 1));
  return g;
}

function glowTexture(stops) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ATMOSPHERE_VS = `
varying vec3 vN;
void main() {
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const ATMOSPHERE_FS = `
uniform vec3 uColor;
uniform vec3 uSun;     // view-space direction to the Sun
uniform float uPower;
uniform float uGain;
varying vec3 vN;
void main() {
  // back faces of a shell just outside the planet: 0 at the shell's silhouette, brightest at the planet's limb
  float rim = pow(clamp(-vN.z, 0.0, 1.0), uPower);
  float lit = smoothstep(-0.35, 0.55, dot(vN, uSun));
  gl_FragColor = vec4(uColor * rim * uGain * mix(0.04, 1.0, lit), 1.0);
}`;

export async function createSpace(canvas, hooks = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#070204");
  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 6000);

  // ---- assets -------------------------------------------------------------------------------
  const loader = new THREE.TextureLoader();
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // one retry, then a flat stand-in: a single failed texture must not take the whole system down
  const tex = (f, color = true) => loader.loadAsync(T(f)).catch(() => loader.loadAsync(T(f))).catch(() => {
    console.warn("texture failed:", f);
    const t = new THREE.DataTexture(new Uint8Array([128, 112, 106, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  }).then((t) => {
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = maxAniso;
    return t;
  });
  const names = ["mercury", "venus_surface", "venus_atmosphere", "earth_day", "earth_night", "earth_clouds", "mars",
    "jupiter", "saturn", "uranus", "neptune", "moon", "sun"];
  const [geo, ringGeo, meta, normalMap, specMap, ringTex, ...maps] = await Promise.all([
    loadMesh("sphere.bin"), loadMesh("ring.bin"), fetch("assets/meshes/meta.json").then((r) => r.json()),
    tex("earth_normal.jpg", false), tex("earth_spec.jpg", false), tex("saturn_ring.png"),
    ...names.map((n) => tex(n + ".jpg")),
  ]);
  const M = Object.fromEntries(names.map((n, i) => [n, maps[i]]));

  // the point on the sphere that sits at UV (0.5, 0.5): the face a tidally locked moon keeps toward its planet
  const uvA = geo.getAttribute("uv"), posA = geo.getAttribute("position");
  let nearest = 0, best = 1e9;
  for (let i = 0; i < uvA.count; i++) {
    const d = (uvA.getX(i) - 0.5) ** 2 + (uvA.getY(i) - 0.5) ** 2;
    if (d < best) { best = d; nearest = i; }
  }
  const nearSide = new THREE.Vector3().fromBufferAttribute(posA, nearest).normalize();

  // ---- starfield: a shell of points far behind everything, slowly turning ----------------------
  const STAR_COUNT = 2600;
  const starPos = new Float32Array(STAR_COUNT * 3), starCol = new Float32Array(STAR_COUNT * 3), starSeed = new Float32Array(STAR_COUNT * 2);
  for (let i = 0; i < STAR_COUNT; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * TAU, r = Math.sqrt(1 - u * u);
    starPos.set([r * Math.cos(th) * 4200, u * 4200, r * Math.sin(th) * 4200], i * 3);
    const m = Math.random() ** 6;                          // power law: many faint, few bright
    const t = Math.random();
    const tint = t < 0.3 ? [0.75, 0.82, 1] : t < 0.8 ? [1, 0.97, 0.93] : [1, 0.78, 0.6];
    starCol.set(tint.map((c) => c * (0.25 + 0.75 * m)), i * 3);
    starSeed.set([m, Math.random() * TAU], i * 2);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
  starGeo.setAttribute("seed", new THREE.BufferAttribute(starSeed, 2));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
    vertexShader: `
      attribute vec3 color; attribute vec2 seed;
      uniform float uTime; uniform float uScale;
      varying vec3 vCol; varying float vTw;
      void main() {
        vCol = color;
        vTw = 0.8 + 0.2 * sin(uTime * (0.8 + seed.x * 3.0) + seed.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (1.3 + 3.2 * seed.x) * uScale;
      }`,
    fragmentShader: `
      varying vec3 vCol; varying float vTw;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        gl_FragColor = vec4(vCol * vTw * a * a, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -10;
  stars.frustumCulled = false;
  scene.add(stars);

  // ---- physics ------------------------------------------------------------------------------
  const world = buildSystem(SYSTEM);
  const { sim, sun: sunBody, moon } = world;

  // ---- scene graph --------------------------------------------------------------------------
  const system = new THREE.Group();
  scene.add(system);
  const sunWorld = new THREE.Vector3();

  const sunLight = new THREE.PointLight(0xfff0e0, Math.PI * 1.15, 0, 0);
  system.add(sunLight);
  scene.add(new THREE.AmbientLight(0x6a2028, 0.8));

  const sunMat = new THREE.MeshBasicMaterial({ map: M.sun, color: 0xffd2b8 });
  const sunMesh = new THREE.Mesh(geo, sunMat);
  sunMesh.scale.setScalar(SYSTEM.sun.radius);
  system.add(sunMesh);
  const corona = glowTexture([[0, "rgba(255,210,170,0.95)"], [0.18, "rgba(255,120,70,0.5)"], [0.45, "rgba(190,30,25,0.16)"], [1, "rgba(90,0,0,0)"]]);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: corona, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(SYSTEM.sun.radius * 9);
  glow.renderOrder = 5;
  system.add(glow);

  const sunDirView = new THREE.Vector3();   // Earth-centred, for the night-side lights
  const rims = [];                          // atmosphere shells, each lit from its own planet's side
  const atmosphere = (parentMesh, color, scale, power, gain, pivot) => {
    const dir = new THREE.Vector3();
    rims.push({ dir, pivot });
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uSun: { value: dir }, uPower: { value: power }, uGain: { value: gain } },
      vertexShader: ATMOSPHERE_VS, fragmentShader: ATMOSPHERE_FS,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    m.scale.setScalar(scale);
    parentMesh.add(m);
    return m;
  };

  const lambert = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, ...extra });
  const bodies = [];   // { cfg, body, pivot, mesh, spin }

  const earthUniforms = { uSunView: { value: sunDirView } };
  function earthMaterial() {
    const mat = new THREE.MeshPhongMaterial({
      map: M.earth_day, normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
      specularMap: specMap, specular: new THREE.Color(0x5a4a48), shininess: 38,
      emissiveMap: M.earth_night, emissive: new THREE.Color(0xffd9a8),
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSunView = earthUniforms.uSunView;
      sh.fragmentShader = sh.fragmentShader
        .replace("void main() {", "uniform vec3 uSunView;\nvoid main() {")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance *= smoothstep(0.1, -0.25, dot(normal, uSunView));");
    };
    return mat;
  }

  const saturnQ = new THREE.Quaternion(...meta.saturnQuat);
  const sunSpinRate = TAU / (SYSTEM.sun.spin * SYSTEM.dayLength);

  for (const cfg of SYSTEM.planets) {
    const body = world.planets[cfg.id];
    const pivot = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.z = (cfg.tilt * Math.PI) / 180;
    pivot.add(tilt);
    system.add(pivot);

    let material;
    switch (cfg.id) {
      case "earth": material = earthMaterial(); break;
      case "venus": material = lambert(M.venus_surface); break;
      default: material = lambert(M[cfg.id]);
    }
    const mesh = new THREE.Mesh(geo, material);
    mesh.scale.setScalar(cfg.radius);
    tilt.add(mesh);
    const entry = { cfg, body, pivot, tilt, mesh, angle: 0, rate: TAU / (cfg.spin * SYSTEM.dayLength), extras: {} };

    if (cfg.id === "earth") {
      const clouds = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, alphaMap: M.earth_clouds, transparent: true, opacity: 0.92, depthWrite: false }));
      clouds.scale.setScalar(cfg.radius * 1.012);
      tilt.add(clouds);
      entry.extras.clouds = clouds;
      atmosphere(tilt, 0x5f9bff, cfg.radius * 1.2, 2.4, 2.2, pivot);
    }
    if (cfg.id === "venus") {
      const haze = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: M.venus_atmosphere, transparent: true, opacity: 0.86, depthWrite: false }));
      haze.scale.setScalar(cfg.radius * 1.014);
      tilt.add(haze);
      entry.extras.haze = haze;
      atmosphere(tilt, 0xffb86a, cfg.radius * 1.16, 2.4, 1.6, pivot);
    }
    if (cfg.id === "mars") atmosphere(tilt, 0xff8a5a, cfg.radius * 1.14, 2.6, 0.9, pivot);
    if (cfg.id === "uranus") atmosphere(tilt, 0x9fe8ee, cfg.radius * 1.14, 2.4, 1.1, pivot);
    if (cfg.id === "neptune") atmosphere(tilt, 0x4f7bff, cfg.radius * 1.14, 2.4, 1.3, pivot);
    if (cfg.id === "saturn") {
      // the OBJ carries Saturn's axial tilt in its vertices: apply the same rotation to the shared sphere,
      // keep the ring (authored in that frame) fixed, and spin the globe about its tilted pole
      entry.pole = new THREE.Vector3(0, 1, 0).applyQuaternion(saturnQ);
      tilt.rotation.set(0, 0, 0);
      const rg = ringGeo.clone();
      const rp = rg.getAttribute("position"), ruv = rg.getAttribute("uv");
      const inner = 1.2467, outer = 2.2441;   // ring radii in Saturn radii, from the OBJ
      for (let i = 0; i < rp.count; i++) {
        const r = Math.hypot(rp.getX(i), rp.getY(i), rp.getZ(i));
        ruv.setXY(i, (r - inner) / (outer - inner), 0.5);
      }
      const ring = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, emissive: 0x1a0a08 }));
      ring.scale.setScalar(cfg.radius);
      ring.renderOrder = 2;
      tilt.add(ring);
    }
    bodies.push(entry);
  }

  const earthEntry = bodies.find((b) => b.cfg.id === "earth");
  const moonMesh = new THREE.Mesh(geo, lambert(M.moon));
  moonMesh.scale.setScalar(SYSTEM.moon.radius);
  system.add(moonMesh);

  // ---- orbit trails: the paths the bodies actually take --------------------------------------
  const trails = [];
  const trailGroup = new THREE.Group();
  system.add(trailGroup);
  const trailTargets = [...bodies.map((b) => ({ id: b.cfg.id, get: () => b.body.p, period: SYSTEM.refPeriod * (b.cfg.a / SYSTEM.refA) ** 1.5 }))];
  for (const tt of trailTargets) {
    const pos = new Float32Array(TRAIL_POINTS * 3), col = new Float32Array(TRAIL_POINTS * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(col, 4));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    line.frustumCulled = false;
    trailGroup.add(line);
    const p0 = tt.get();
    for (let i = 0; i < TRAIL_POINTS; i++) { pos.set([p0[0], p0[1], p0[2]], i * 3); }
    trails.push({ ...tt, pos, col, line, head: 0, filled: 0, every: tt.period / (TRAIL_POINTS - 6), since: 0 });
  }

  function pushTrail(tr) {
    // ring buffer -> ordered copy so the line always runs oldest -> newest
    const p = tr.get();
    tr.ring ??= Array.from({ length: TRAIL_POINTS }, () => [p[0], p[1], p[2]]);
    tr.ring[tr.head] = [p[0], p[1], p[2]];
    tr.head = (tr.head + 1) % TRAIL_POINTS;
    tr.filled = Math.min(TRAIL_POINTS, tr.filled + 1);
  }
  function writeTrail(tr, headPos) {
    const n = TRAIL_POINTS;
    for (let i = 0; i < n; i++) {
      const src = tr.ring[(tr.head + i) % n];
      const last = i === n - 1;
      const q = last ? headPos : src;
      tr.pos[i * 3] = q[0]; tr.pos[i * 3 + 1] = q[1]; tr.pos[i * 3 + 2] = q[2];
      const age = i / (n - 1);
      const a = Math.max(0, age) ** 2 * 0.5 * (i >= n - tr.filled ? 1 : 0);
      tr.col[i * 4] = 1; tr.col[i * 4 + 1] = 0.55; tr.col[i * 4 + 2] = 0.5; tr.col[i * 4 + 3] = a;
    }
    tr.line.geometry.attributes.position.needsUpdate = true;
    tr.line.geometry.attributes.color.needsUpdate = true;
  }
  let showTrails = true;
  trailGroup.visible = showTrails;
  for (const tr of trails) pushTrail(tr);   // seed

  // ---- framing --------------------------------------------------------------------------------
  const pointer = [0, 0], pointerNow = [0, 0];
  const tiltRad = ((90 - SYSTEM.tilt) * Math.PI) / 180;
  system.rotation.set(tiltRad, 0, (SYSTEM.roll * Math.PI) / 180, "XYZ");
  camera.position.set(0, 0, 0);

  let cssW = 1, cssH = 1, dpr = Math.min(window.devicePixelRatio || 1, 1.5), qScale = 1;
  const extent = Math.max(...SYSTEM.planets.map((p) => p.a * (1 + p.e))) + 40;
  let distance = SYSTEM.distance;

  function layout() {
    const aspect = cssW / cssH, tanH = Math.tan((FOV * Math.PI) / 360);
    // keep the outer orbits on screen in portrait by backing the whole system off
    distance = Math.max(SYSTEM.distance, (extent * 0.62) / (aspect * tanH));
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const k = aspect < 1 ? 0.35 : 1;
    system.position.set(SYSTEM.offset[0] * k, SYSTEM.offset[1], -distance);
  }

  function setSize() {
    const pr = Math.max(0.5, dpr * qScale);
    renderer.setPixelRatio(pr);
    starMat.uniforms.uScale.value = pr;
    renderer.setSize(cssW, cssH, false);
  }

  // ---- state & loop ---------------------------------------------------------------------------
  let running = false, wantRun = false, boost = 0, raf = 0, last = 0, acc = 0, simT = 0, first = false;
  let fpsT = 0, fpsN = 0, fps = 0, slowT = 0, slowN = 0, calm = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), qSpin = new THREE.Quaternion();

  function syncScene(dtSim) {
    const sp = sunBody.p;
    sunMesh.position.set(sp[0], sp[1], sp[2]);
    glow.position.copy(sunMesh.position);
    sunLight.position.copy(sunMesh.position);
    sunMesh.rotation.y += sunSpinRate * dtSim;
    glow.material.opacity = 0.94 + 0.06 * Math.sin(simT * 1.7);

    system.updateMatrixWorld(true);
    sunWorld.setFromMatrixPosition(sunMesh.matrixWorld);

    for (const e of bodies) {
      const p = e.body.p;
      e.pivot.position.set(p[0], p[1], p[2]);
      e.angle += e.rate * dtSim;
      if (e.cfg.id === "saturn") {
        qSpin.setFromAxisAngle(e.pole, e.angle);
        e.mesh.quaternion.copy(qSpin).multiply(saturnQ);
      } else {
        e.mesh.rotation.y = e.angle;
      }
      if (e.extras.clouds) e.extras.clouds.rotation.y = e.angle * 1.08 + 0.4;
      if (e.extras.haze) e.extras.haze.rotation.y = -e.angle * 60;   // the real cloud deck super-rotates, ~60x the surface
    }

    const mw = moon.world;
    moonMesh.position.set(mw[0], mw[1], mw[2]);
    tmp.set(-moon.r[0], -moon.r[1], -moon.r[2]).normalize();           // towards Earth
    moonMesh.quaternion.setFromUnitVectors(nearSide, tmp);
  }

  function updateLightUniforms() {
    camera.updateMatrixWorld();
    // Earth-centred view-space direction to the Sun for the night-side lights and the atmosphere rims
    const ep = earthEntry.pivot.getWorldPosition(tmp2);
    sunDirView.copy(sunWorld).sub(ep).normalize().transformDirection(camera.matrixWorldInverse);
    for (const r of rims) r.dir.copy(sunWorld).sub(r.pivot.getWorldPosition(tmp)).normalize().transformDirection(camera.matrixWorldInverse);
  }

  function updateTrails(dtSim) {
    for (const tr of trails) {
      tr.since += dtSim;
      while (tr.since >= tr.every) { tr.since -= tr.every; pushTrail(tr); }
      writeTrail(tr, tr.get());
    }
  }

  function render() {
    camera.position.x += (pointer[0] - camera.position.x) * 0.05;
    camera.position.y += (pointer[1] - camera.position.y) * 0.05;
    renderer.render(scene, camera);
    if (!first) { first = true; hooks.onFirstFrame?.(); }
  }

  function advance(dtReal) {
    boost *= Math.exp(-dtReal * 1.8);
    const speed = TIME_SCALE * (1 + 4 * boost);
    const dtSim = dtReal * speed;
    acc += dtSim;
    let n = 0;
    while (acc >= SUBSTEP && n++ < 600) { sim.step(SUBSTEP); moon.step(SUBSTEP); acc -= SUBSTEP; }
    if (n >= 600) acc = 0;
    simT += dtSim;
    starMat.uniforms.uTime.value += dtReal;
    stars.rotation.y += dtReal * 0.004;
    stars.rotation.x += dtReal * 0.0007;
    syncScene(dtSim);
    updateLightUniforms();
    if (showTrails) updateTrails(dtSim);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!last) last = now;
    const raw = now - last;
    if (raw < 14) return;                      // cap at ~60 fps on 120/144 Hz panels
    last = now;
    advance(Math.min(raw / 1000, 1 / 15));
    render();

    fpsN++;
    if (!fpsT) fpsT = now;
    if (now - fpsT >= 1000) { fps = Math.round((fpsN * 1000) / (now - fpsT)); fpsN = 0; fpsT = now; hooks.onStats?.(); }

    // resolution backs off if frames run long, and creeps back only after a long calm
    slowT += raw; slowN++;
    if (slowT >= 2000) {
      const avg = slowT / slowN;
      if (avg > 24 && qScale > 0.55) { qScale = Math.max(0.55, qScale * 0.82); setSize(); calm = 0; }
      else if (avg < 18 && qScale < 1) { calm += slowT; if (calm > 20000) { qScale = Math.min(1, qScale / 0.82); setSize(); calm = 0; } }
      slowT = slowN = 0;
    }
  }

  // prime the scene so the first frame already shows the system in place
  layout();
  syncScene(0);
  updateLightUniforms();
  writeTrails();
  function writeTrails() { for (const tr of trails) writeTrail(tr, tr.get()); }

  return {
    resize(w, h) { cssW = Math.max(1, w); cssH = Math.max(1, h); setSize(); layout(); syncScene(0); updateLightUniforms(); if (!running) render(); },
    setBackground(hex) { scene.background.set(hex); if (!running) render(); },
    setPointer(x, y) { pointer[0] = x * 3.2; pointer[1] = -y * 3.2; if (!running) { camera.position.set(pointer[0], pointer[1], 0); render(); } },
    setTrails(on) { showTrails = on; trailGroup.visible = on; if (!running) render(); },
    setRunning(on) {
      wantRun = on;
      if (on === running) return;
      running = on;
      if (on) { last = 0; fpsT = fpsN = 0; raf = requestAnimationFrame(frame); }
      else { cancelAnimationFrame(raf); raf = 0; fps = 0; render(); }
      hooks.onStats?.();
    },
    kick() { if (running) boost = 1; },
    stats() { return { fps, running, bodies: sim.bodies.length + 1, t: simT, scale: qScale }; },
    render() { render(); },
    inspect: { camera, system, bodies, moonMesh, advance },   // handles for debugging in the console
    dispose() { cancelAnimationFrame(raf); renderer.dispose(); },
  };
}
