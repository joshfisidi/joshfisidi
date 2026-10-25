// Newtonian N-body: velocity Verlet, O(n^2) pairwise gravity. Kepler's laws are not scripted; they fall out of this.
// Units are scene units and simulated seconds with G = 1.

const TAU = Math.PI * 2;

export class NBody {
  constructor(G = 1) {
    this.G = G;
    this.bodies = [];
    this.t = 0;
  }

  add({ id, m, p, v }) {
    const b = { id, m, p: Float64Array.from(p), v: Float64Array.from(v), a: new Float64Array(3) };
    this.bodies.push(b);
    return b;
  }

  accelerate() {
    const bs = this.bodies, G = this.G;
    for (const b of bs) b.a.fill(0);
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const A = bs[i], B = bs[j];
        const dx = B.p[0] - A.p[0], dy = B.p[1] - A.p[1], dz = B.p[2] - A.p[2];
        const r2 = dx * dx + dy * dy + dz * dz + 1e-6;
        const k = G / (r2 * Math.sqrt(r2));
        A.a[0] += k * B.m * dx; A.a[1] += k * B.m * dy; A.a[2] += k * B.m * dz;
        B.a[0] -= k * A.m * dx; B.a[1] -= k * A.m * dy; B.a[2] -= k * A.m * dz;
      }
    }
  }

  step(dt) {
    const bs = this.bodies, h = 0.5 * dt;
    for (const b of bs) {
      for (let k = 0; k < 3; k++) { b.v[k] += b.a[k] * h; b.p[k] += b.v[k] * dt; }
    }
    this.accelerate();
    for (const b of bs) for (let k = 0; k < 3; k++) b.v[k] += b.a[k] * h;
    this.t += dt;
  }

  energy() {
    let e = 0;
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      const A = bs[i];
      e += 0.5 * A.m * (A.v[0] ** 2 + A.v[1] ** 2 + A.v[2] ** 2);
      for (let j = i + 1; j < bs.length; j++) {
        const B = bs[j];
        e -= (this.G * A.m * B.m) / Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1], B.p[2] - A.p[2]);
      }
    }
    return e;
  }

  momentum() {
    const P = [0, 0, 0];
    for (const b of this.bodies) for (let k = 0; k < 3; k++) P[k] += b.m * b.v[k];
    return P;
  }
}

// A satellite integrated in its parent's frame (patched two-body: the parent's gravity only, leapfrog).
// The Sun's tide on the Moon is ignored; scene distances are compressed far beyond the real Earth-Moon / Sun ratio.
export class Satellite {
  constructor(parent, gm, r, v) {
    this.parent = parent;
    this.gm = gm;
    this.r = Float64Array.from(r);
    this.v = Float64Array.from(v);
    this.a = new Float64Array(3);
    this.pull();
  }

  pull() {
    const r = this.r, d = Math.hypot(r[0], r[1], r[2]), k = -this.gm / (d * d * d);
    this.a[0] = k * r[0]; this.a[1] = k * r[1]; this.a[2] = k * r[2];
  }

  step(dt) {
    const h = 0.5 * dt;
    for (let k = 0; k < 3; k++) { this.v[k] += this.a[k] * h; this.r[k] += this.v[k] * dt; }
    this.pull();
    for (let k = 0; k < 3; k++) this.v[k] += this.a[k] * h;
  }

  get world() {
    const p = this.parent.p;
    return [p[0] + this.r[0], p[1] + this.r[1], p[2] + this.r[2]];
  }
}

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// rotate v about unit axis by angle (Rodrigues)
function rotate(v, axis, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
  const cx = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]];
  return [0, 1, 2].map((k) => v[k] * c + cx[k] * s + axis[k] * d * (1 - c));
}

// Sun at the origin, each planet launched from aphelion of its own inclined ellipse with the
// vis-viva speed; then the whole system is shifted into the barycentre frame so it does not drift.
export function buildSystem(cfg) {
  const rng = mulberry32(cfg.seed);
  const sim = new NBody(1);
  const GM = (TAU * TAU * cfg.refA ** 3) / cfg.refPeriod ** 2;   // Kepler III for the reference planet
  const sunMass = GM;                                               // G = 1
  const sun = sim.add({ id: "sun", m: sunMass, p: [0, 0, 0], v: [0, 0, 0] });
  const planets = {};

  for (const pl of cfg.planets) {
    const phi = pl.phase ?? rng() * TAU;
    const node = rng() * TAU;
    const inc = ((pl.inc || 0) * Math.PI) / 180;
    const ra = pl.a * (1 + pl.e);
    const va = Math.sqrt(((GM + pl.mass * sunMass) / pl.a) * ((1 - pl.e) / (1 + pl.e)));
    let p = [ra * Math.cos(phi), 0, ra * Math.sin(phi)];
    let v = [va * Math.sin(phi), 0, -va * Math.cos(phi)];
    const nodeAxis = [Math.cos(node), 0, Math.sin(node)];
    p = rotate(p, nodeAxis, inc);
    v = rotate(v, nodeAxis, inc);
    planets[pl.id] = sim.add({ id: pl.id, m: pl.mass * sunMass, p, v });
  }

  // zero total momentum by giving the Sun the opposite recoil
  const P = sim.momentum();
  for (let k = 0; k < 3; k++) sun.v[k] -= P[k] / sunMass;
  sim.accelerate();

  let moon = null;
  if (cfg.moon) {
    const m = cfg.moon, earth = planets.earth;
    const T = cfg.refPeriod / m.periodsPerYear;
    const gm = (TAU * TAU * m.a ** 3) / T ** 2;
    const inc = (m.inc * Math.PI) / 180;
    let r = [m.a, 0, 0], v = [0, 0, -Math.sqrt(gm / m.a)];
    r = rotate(r, [0, 0, 1], inc);
    v = rotate(v, [0, 0, 1], inc);
    const ev = earth.v;
    moon = new Satellite(earth, gm, r, v);
    moon.period = T;
  }
  return { sim, sun, planets, moon, GM };
}
