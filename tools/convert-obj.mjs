// Converts PlanetsOBJ.obj into compact binaries for the site.
// All ten spheres share one topology and orientation except Saturn (tilt baked in), so one shared sphere is written (checked against the rest) plus Saturn and its ring.
// usage: node tools/convert-obj.mjs path/to/PlanetsOBJ.obj assets/meshes
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const [src, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const v = [], vt = [], vn = [];
const objects = {};
let cur = null;
for (const line of readFileSync(src, "utf8").split("\n")) {
  const p = line.split(/\s+/);
  if (p[0] === "v") v.push(p.slice(1, 4).map(Number));
  else if (p[0] === "vt") vt.push(p.slice(1, 3).map(Number));
  else if (p[0] === "vn") vn.push(p.slice(1, 4).map(Number));
  else if (p[0] === "o") objects[(cur = p[1])] = [];
  else if (p[0] === "f") objects[cur].push(p.slice(1).map((t) => t.split("/").map(Number)));
}

function build(name, around) {
  const map = new Map(), pos = [], uv = [], nor = [], idx = [];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of objects[name]) for (const [a] of f) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k], v[a - 1][k]); hi[k] = Math.max(hi[k], v[a - 1][k]);
  }
  const c = around || lo.map((x, k) => (x + hi[k]) / 2);
  const vert = (t) => {
    const key = t.join("/");
    if (!map.has(key)) {
      map.set(key, pos.length / 3);
      pos.push(...v[t[0] - 1].map((x, k) => x - c[k]));
      uv.push(...(vt[t[1] - 1] || [0, 0]));
      nor.push(...(vn[t[2] - 1] || [0, 1, 0]));
    }
    return map.get(key);
  };
  for (const f of objects[name]) for (let i = 1; i + 1 < f.length; i++) idx.push(vert(f[0]), vert(f[i]), vert(f[i + 1]));
  return { pos, uv, nor, idx, center: c };
}

function write(file, m) {
  const n = m.pos.length / 3;
  const head = new Uint32Array([n, m.idx.length]);
  const body = [head, new Float32Array(m.pos), new Float32Array(m.nor), new Float32Array(m.uv), new Uint16Array(m.idx)];
  writeFileSync(`${outDir}/${file}`, Buffer.concat(body.map((a) => Buffer.from(a.buffer))));
  console.log(file, n, "verts", m.idx.length / 3, "tris");
}

const sphere = build("Earth_Sphere.002");
for (const name of Object.keys(objects).filter((k) => k.includes("Sphere"))) {
  const s = build(name);
  let worst = 0;
  for (let i = 0; i < sphere.pos.length; i++) worst = Math.max(worst, Math.abs(s.pos[i] - sphere.pos[i]));
  for (let i = 0; i < sphere.uv.length; i++) worst = Math.max(worst, Math.abs(s.uv[i] - sphere.uv[i]));
  console.log(name.padEnd(22), "max diff vs Earth", worst.toExponential(2), "tri idx equal", s.idx.length === sphere.idx.length && s.idx.every((x, i) => x === sphere.idx[i]));
}
write("sphere.bin", sphere);
// Saturn's mesh is the shared sphere rotated by its axial tilt. Recover that rotation from two matching
// vertices (same topology => same indices), verify it against every vertex, and store it as a quaternion.
const saturn = build("Saturn_Sphere.006");
const pole = sphere.pos.reduce((best, _, i) => (i % 3 === 1 && sphere.pos[i] > sphere.pos[best * 3 + 1] ? (i - 1) / 3 : best), 0);
let eq = 0;
for (let i = 0; i < sphere.pos.length / 3; i++) if (Math.abs(sphere.pos[i * 3 + 1]) < 1e-3 && Math.abs(sphere.pos[i * 3] - 1) < 1e-3) { eq = i; break; }
const vec = (m, i) => [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
const frame = (m) => {
  const y = unit(vec(m, pole));
  const e = vec(m, eq);
  const x = unit(e.map((c, k) => c - dot(e, y) * y[k]));
  return [x, y, cross(x, y)];
};
const A = frame(sphere), B = frame(saturn);
const R = [0, 1, 2].map((r) => [0, 1, 2].map((c) => A.reduce((sum, a, k) => sum + B[k][r] * a[c], 0)));   // R = B * A^T
let err = 0;
for (let i = 0; i < sphere.pos.length / 3; i++) {
  const p = vec(sphere, i), q = vec(saturn, i);
  for (let r = 0; r < 3; r++) err = Math.max(err, Math.abs(R[r][0] * p[0] + R[r][1] * p[1] + R[r][2] * p[2] - q[r]));
}
const tr = R[0][0] + R[1][1] + R[2][2];
const w = Math.sqrt(Math.max(0, 1 + tr)) / 2;
const quat = [(R[2][1] - R[1][2]) / (4 * w), (R[0][2] - R[2][0]) / (4 * w), (R[1][0] - R[0][1]) / (4 * w), w];
console.log("saturn tilt quat", quat.map((x) => +x.toFixed(6)), "max vertex error", err.toExponential(2),
  "axial tilt deg", (Math.acos(unit(vec(saturn, pole))[1]) * 180 / Math.PI).toFixed(2));
writeFileSync(`${outDir}/meta.json`, JSON.stringify({ saturnQuat: quat.map((x) => +x.toFixed(6)) }));
const ring = build("Ring_Circle.001", saturn.center);
write("ring.bin", ring);
