// The wormhole: one fullscreen fragment shader. Adapted from the Viewport Wormhole spec; the throat is now transparent.
// Tunnel palette comes from config.js.

/* ---------- config ---------- */
const TIERS = {
  high:   { dpr: 1.5, px: 2.0e6, oct: 4, frameMs: 1000 / 60 },
  medium: { dpr: 1.0, px: 1.0e6, oct: 3, frameMs: 1000 / 60 },
  low:    { dpr: 1.0, px: 0.5e6, oct: 2, frameMs: 1000 / 30 },
};
const ORDER = ["low", "medium", "high"];
const TRAVEL = 0.02;   // phase / s: the shader multiplies it by up to 8, so keep it slow
const SPIN = 1 / 90;   // one full turn per 90 s
const DRIFT_X = 3.0e-4, DRIFT_Y = 1.2e-4;   // phase / s => far layer ~1.3 px/s, near ~12 px/s

export const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

/* ---------- shaders ---------- */
const VS = `#version 300 es
void main() {
vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
uniform vec2 uScale;     // drawing-buffer px per CSS px (x, y)
uniform vec2 uView;      // CSS px
uniform float uBand;     // CSS px
uniform float uClose;    // 0 open .. 1 the opening has closed and the tunnel fills the screen
uniform vec2 uCenter;    // CSS px offset of the opening's centre (x right, y up)
uniform vec2 uPointer;   // CSS px field offset
uniform float uTravel;   // [0,1) phase
uniform float uSpin;     // [0,1) phase
uniform float uOct;
uniform vec2 uDrift;     // [0,1) star drift phases (x, y)
uniform vec3 uBg, uA, uB, uC;
out vec4 outColor;

const float TAU = 6.283185307;

float sdRoundRect(vec2 p, vec2 b, float r) {
vec2 q = abs(p) - b + r;
return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float hash(vec3 p) {
p = fract(p * vec3(0.1031, 0.1030, 0.0973));
p += dot(p, p.yxz + 33.33);
return fract((p.x + p.y) * p.z);
}

// value noise, periodic in z with integer period => phase wrap 1 -> 0 is invisible
float pnoise(vec3 p, float period) {
vec3 i = floor(p);
vec3 f = fract(p);
f = f * f * (3.0 - 2.0 * f);
float z0 = mod(i.z, period);
float z1 = mod(i.z + 1.0, period);
vec2 e = vec2(1.0, 0.0);
float n000 = hash(vec3(i.xy, z0)),         n100 = hash(vec3(i.xy + e.xy, z0));
float n010 = hash(vec3(i.xy + e.yx, z0)),  n110 = hash(vec3(i.xy + e.xx, z0));
float n001 = hash(vec3(i.xy, z1)),         n101 = hash(vec3(i.xy + e.xy, z1));
float n011 = hash(vec3(i.xy + e.yx, z1)),  n111 = hash(vec3(i.xy + e.xx, z1));
return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
           mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

float fbm(vec3 p, float period) {
float sum = 0.0, amp = 0.5, norm = 0.0;
for (int k = 0; k < 4; k++) {
  if (float(k) >= uOct) break;
  sum += amp * pnoise(p, period);
  norm += amp;
  p = vec3(mat2(0.8, -0.6, 0.6, 0.8) * p.xy * 2.03, p.z * 2.0);
  period *= 2.0;
  amp *= 0.5;
}
return sum / norm;
}

// one star per occupied cell, centre kept off the cell edge so no neighbour lookups are needed.
// ids wrap at 128 cells; drift shifts are whole multiples of 128 cells, so the phase wrap is invisible.
vec3 starLayer(vec2 p, float cell, float density, float seed) {
vec2 g = p / cell;
vec2 id = mod(floor(g), 128.0);
if (hash(vec3(id, seed)) > density) return vec3(0.0);
vec2 c = vec2(hash(vec3(id, seed + 1.0)), hash(vec3(id, seed + 2.0))) * 0.7 + 0.15;
vec2 dp = (fract(g) - c) * cell;
float m = hash(vec3(id, seed + 3.0));
float t = hash(vec3(id, seed + 4.0));
float b = 0.10 + 1.6 * pow(m, 9.0);                          // power law: many faint, few bright
float sig = max(0.5 + 0.6 * pow(m, 5.0), 0.7 / uScale.x);    // never thinner than ~0.7 buffer px
float r2 = dot(dp, dp);
float core = exp(-r2 / (2.0 * sig * sig));
float halo = 0.05 * step(0.6, m) * exp(-r2 / (18.0 * sig * sig));
float tw = 0.86 + 0.14 * sin(TAU * (uTravel * (3.0 + floor(t * 6.0)) + t));
vec3 tint = mix(vec3(0.70, 0.80, 1.00), vec3(1.00, 0.97, 0.93), smoothstep(0.15, 0.45, t));
tint = mix(tint, vec3(1.00, 0.80, 0.60), smoothstep(0.82, 0.95, t));  // blue-white / white / warm
return tint * b * tw * (core + halo);
}

// three depths: farther layers are denser, dimmer, slower and follow the pointer less
vec3 stars(vec2 q) {
vec3 s = 0.75 * starLayer(q + uDrift * 4352.0  - uPointer * 0.25, 34.0, 0.55, 11.0);  // 128*34*1
s +=            starLayer(q + uDrift * 13312.0 - uPointer * 0.50, 52.0, 0.42, 23.0);  // 128*52*2
if (uOct >= 3.0)
  s += 1.15 *   starLayer(q + uDrift * 40960.0 - uPointer * 0.80, 80.0, 0.38, 37.0);  // 128*80*4
return s;
}

void main() {
vec2 q = gl_FragCoord.xy / uScale - 0.5 * uView - uCenter;
vec2 inner = mix(max(0.5 * uView - uBand, vec2(4.0)), vec2(2.0), uClose);
float radius = min(uBand * 1.25, min(inner.x, inner.y) * 0.5);

// 1. cheap mask first: the opening gets only the starfield, no tunnel noise
float d = sdRoundRect(q, inner, radius);
// the opening is transparent: only stars sit over the far system behind this canvas
if (d <= 0.0 && uClose < 0.995) {
  vec3 st = 1.0 - exp(-stars(q) * 1.35);
  outColor = vec4(st, max(max(st.r, st.g), st.b));   // valid premultiplied colour: alpha never below the brightest channel
  return;
}

// 2. tunnel coordinates (field shifted by pointer, mask stays fixed)
vec2 qf = q - uPointer;
float u = max(sdRoundRect(qf, inner, radius), 0.0) / uBand;   // 0 throat .. ~1 screen edge
float z = 1.0 / (u + 0.16);                                    // perspective depth

float th = atan(qf.y / inner.y, qf.x / inner.x) + TAU * uSpin + 0.45 * z;
th += 0.08 * sin(z * 2.6 + TAU * uTravel * 3.0);
vec2 ring = vec2(cos(th), sin(th));                            // seamless angular coordinate

// 3. surface detail
float neb = fbm(vec3(ring * 1.7, z * 1.15 + uTravel * 8.0), 8.0);
float hue = pnoise(vec3(ring * 0.9 + 3.1, z * 0.35 + uTravel * 2.0), 2.0);

float f1 = pnoise(vec3(ring * 4.2, z * 0.55 + uTravel * 4.0), 4.0);
float f2 = pnoise(vec3(ring * 7.5 + 11.0, z * 0.8 + uTravel * 6.0), 6.0);
float fil = pow(1.0 - abs(2.0 * f1 - 1.0), 10.0) + 0.55 * pow(1.0 - abs(2.0 * f2 - 1.0), 14.0);

float a = fract(th / TAU) * 96.0;
float rnd = hash(vec3(floor(a), 7.0, 3.0));
float lane = 1.0 - smoothstep(0.0, 0.16, abs(fract(a) - 0.5));
float s = fract(z * 0.5 + uTravel * 6.0 + rnd * 13.0);
float streak = step(0.9, rnd) * lane * smoothstep(0.84, 0.95, s) * (1.0 - smoothstep(0.95, 1.0, s));

// 4. compose: feathered from the throat, restrained glow
float mask = smoothstep(0.0, 0.32, u);
float body = mask * (0.55 + 0.45 * smoothstep(0.1, 0.9, u));
vec3 L = vec3(0.0);
L += mix(uA, uC, smoothstep(0.25, 0.75, hue)) * smoothstep(0.32, 0.9, neb) * 0.9 * body;
L += mix(uB, uC, hue) * fil * 0.55 * body;
L += mix(uB, vec3(1.0), 0.35) * streak * 0.9 * mask;
L += uB * 0.22 * exp(-pow((u - 0.035) / 0.014, 2.0));         // thin rim at the opening
L += uA * 0.12 * mask;                                          // depth haze
if (u < 0.32) L += stars(q) * (1.0 - mask);                     // stars continue under the feather

// premultiplied: the tunnel's own background colour only counts where it is opaque (alpha = mask)
vec3 col = (1.0 - exp(-L * 1.35)) + uBg * mask;
col += (hash(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0 * mask;  // dither against banding
col = max(col, 0.0);
outColor = vec4(col, clamp(max(mask, max(max(col.r, col.g), col.b)), 0.0, 1.0));
}`;

/* ---------- renderer ---------- */
export function createRenderer(canvas, hooks) {
  const gl = canvas.getContext("webgl2", {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    powerPreference: "high-performance", preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  let prog = null, vao = null;
  const U = {};
  let cssW = 1, cssH = 1, band = 80, quality = "medium", pal = null;
  let travel = 0, spin = 0, boost = 0, warp = 0, close = 0;
  const center = [0, 0];
  const drift = [0, 0];
  const pT = [0, 0], pC = [0, 0];
  let running = false, wantRun = false, lost = false, first = false, raf = 0;
  let lastRaf = 0, lastDraw = 0, refreshMs = 1000 / 60, n = 0;
  let win = { t: 0, frames: 0, miss: 0 }, stable = 0, stableNeed = 8000;
  let draws = 0, secT = 0, fps = 0;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(log || "shader compile failed");
    }
    return s;
  }

  function build() {
    const vs = shader(gl.VERTEX_SHADER, VS);
    const fs = shader(gl.FRAGMENT_SHADER, FS);
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(gl.getProgramInfoLog(prog) || "program link failed");
    }
    for (const k of ["uScale", "uView", "uBand", "uClose", "uCenter", "uPointer", "uTravel", "uSpin", "uOct", "uDrift", "uBg", "uA", "uB", "uC"]) {
      U[k] = gl.getUniformLocation(prog, k);
    }
    vao = gl.createVertexArray();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  function draw() {
    if (lost || !pal) return;
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(U.uScale, gl.drawingBufferWidth / cssW, gl.drawingBufferHeight / cssH);
    gl.uniform2f(U.uView, cssW, cssH);
    gl.uniform1f(U.uBand, band);
    gl.uniform1f(U.uClose, close);
    gl.uniform2f(U.uCenter, center[0], center[1]);
    gl.uniform2f(U.uPointer, pC[0], pC[1]);
    gl.uniform1f(U.uTravel, travel);
    gl.uniform1f(U.uSpin, spin);
    gl.uniform1f(U.uOct, TIERS[quality].oct);
    gl.uniform2f(U.uDrift, drift[0], drift[1]);
    gl.uniform3fv(U.uBg, pal.bg);
    gl.uniform3fv(U.uA, pal.a);
    gl.uniform3fv(U.uB, pal.b);
    gl.uniform3fv(U.uC, pal.c);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!first) { first = true; hooks.onFirstFrame?.(); }
  }

  function applySize() {
    const t = TIERS[quality];
    const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, t.dpr, Math.sqrt(t.px / Math.max(1, cssW * cssH))));
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      draw();                                   // never leave a cleared buffer on screen
    } else if (!running) {
      draw();
    }
  }

  function setQuality(q) {
    if (q === quality) return;
    quality = q;
    applySize();
    hooks.onStats?.();
  }

  // adaptive tier: drop after a bad 2 s window, climb only after a long clean run (backs off on each drop)
  function monitor(elapsed, expected) {
    win.t += elapsed;
    win.frames++;
    if (elapsed > expected * 1.6) win.miss++;
    if (win.t < 2000) return;
    const r = win.miss / win.frames;
    const i = ORDER.indexOf(quality);
    if (r > 0.2 && i > 0) {
      setQuality(ORDER[i - 1]);
      stable = 0;
      stableNeed = Math.min(stableNeed * 2, 120000);
    } else if (r < 0.03) {
      stable += win.t;
      if (stable >= stableNeed && i < ORDER.length - 1) { setQuality(ORDER[i + 1]); stable = 0; }
    } else {
      stable = 0;
    }
    win = { t: 0, frames: 0, miss: 0 };
  }

  function step(dt) {
    boost *= Math.exp(-dt * 1.8);
    const fast = 1 + 0.4 * boost + 0.5 * warp;
    travel = (travel + dt * TRAVEL * fast) % 1;   // float64 phases, wrapped
    spin = (spin + dt * SPIN * (1 + 0.2 * boost + 0.5 * warp)) % 1;
    drift[0] = (drift[0] + dt * DRIFT_X * fast) % 1;
    drift[1] = (drift[1] + dt * DRIFT_Y * fast) % 1;
    const k = 1 - Math.exp(-dt * 3);
    pC[0] += (pT[0] - pC[0]) * k;
    pC[1] += (pT[1] - pC[1]) * k;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (lastRaf) {
      const raw = now - lastRaf;
      if (raw > 4 && raw < 100) {
        refreshMs = raw < refreshMs ? refreshMs + (raw - refreshMs) * 0.1 : refreshMs * 1.002;
      }
    }
    lastRaf = now;
    const skip = Math.max(1, Math.round(TIERS[quality].frameMs / refreshMs));  // integer divisor: even pacing at 120/144 Hz
    if (++n % skip) return;
    const expected = skip * refreshMs;
    const elapsed = lastDraw ? now - lastDraw : expected;
    lastDraw = now;
    monitor(elapsed, expected);
    step(Math.min(elapsed / 1000, 1 / 15));                   // clamp: tab return / jank never jumps
    draw();
    draws++;
    if (!secT) secT = now;
    if (now - secT >= 1000) {
      fps = Math.round((draws * 1000) / (now - secT));
      draws = 0;
      secT = now;
      hooks.onStats?.();
    }
  }

  function setRunning(on) {
    wantRun = on;
    on = on && !lost;
    if (on === running) return;
    running = on;
    if (on) {
      lastRaf = lastDraw = n = draws = secT = 0;
      win = { t: 0, frames: 0, miss: 0 };
      raf = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(raf);
      raf = 0;
      fps = 0;
      draw();
    }
    hooks.onStats?.();
  }

  function onLost(e) {
    e.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    raf = 0;
    running = false;
    hooks.onFailure?.("lost");
  }
  function onRestored() {
    try {
      build();
      lost = false;
      first = false;
      canvas.width = canvas.height = 0;     // force realloc + draw
      applySize();
      setRunning(wantRun);
      hooks.onRestore?.();
    } catch (err) {
      console.warn(err);
      hooks.onFailure?.("restore");
    }
  }

  build();
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  return {
    resize(w, h) { cssW = Math.max(1, w); cssH = Math.max(1, h); applySize(); },
    setBand(px) { if (Math.abs(px - band) > 0.5) { band = px; if (!running) draw(); } },
    setPointer(x, y) { pT[0] = x; pT[1] = y; if (!running) { pC[0] = x; pC[1] = y; } },
    setPalette(p) { pal = { bg: rgb(p.bg), a: rgb(p.a), b: rgb(p.b), c: rgb(p.c) }; if (!running) draw(); },
    setRunning,
    kick() { if (running) boost = 1; },
    // story flight: aperture closes (0..1), its centre follows the text (CSS px, y up), and the tunnel streams faster
    setClose(c) { close = c; if (!running) draw(); },
    setCenter(x, y) { center[0] = x; center[1] = y; if (!running) draw(); },
    setWarp(w) { warp = w; },
    stats() { return { quality, dpr: gl.drawingBufferWidth / cssW, fps, running }; },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      gl.deleteProgram(prog);
      gl.deleteVertexArray(vao);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

