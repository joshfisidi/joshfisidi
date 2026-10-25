// Interface: the portal menu over two canvases (far system underneath, wormhole on top), and the STORY sequence.
import { STORY, PALETTES, DEFAULT_PALETTE } from "./config.js";
import { createRenderer } from "./wormhole.js";
import { createSpace } from "./space.js";

const POINTER_PX = 6;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const $ = (id) => document.getElementById(id);
const canvas = $("field"), spaceCanvas = $("space");
const nav = $("portal"), story = $("story-room"), storyText = $("story-text"), storyTitle = $("story-title");
const sw = $("motion"), orbitsSw = $("orbits"), readout = $("readout");
const links = [...nav.querySelectorAll("a")];
const storyLink = nav.querySelector('a[href="#story"]');
const rm = matchMedia("(prefers-reduced-motion: reduce)");

let renderer = null, space = null, failed = null, spaceFailed = false;
let pref = store.get("wh.motion");
if (!["system", "on", "off"].includes(pref)) pref = "system";
let palKey = store.get("wh.palette");
if (!PALETTES[palKey]) palKey = DEFAULT_PALETTE;
let orbitsOn = store.get("wh.orbits") !== "off";

// wormhole aperture state, tracked here so a sequence interrupted halfway can resume from where it was
const wh = { close: 0, x: 0, y: 0, warp: 0 };
function setWH(o) {
  Object.assign(wh, o);
  renderer?.setClose(wh.close);
  renderer?.setCenter(wh.x, wh.y);
  renderer?.setWarp(wh.warp);
}

// portal -> entering -> story -> leaving -> portal
let phase = "portal";
const motionOn = () => pref === "on" || (pref === "system" && !rm.matches);
const spaceWanted = () => phase === "portal" || phase === "leaving";

function updateReadout() {
  if (failed && spaceFailed) { readout.textContent = failed; return; }
  const parts = [];
  if (renderer) {
    const s = renderer.stats();
    parts.push(`WebGL2 · ${s.quality} · ${s.dpr.toFixed(2)}× · ${s.running ? `${s.fps || "–"} fps` : "motion off"}`);
  } else {
    parts.push(failed || "Starting renderer");
  }
  if (space) {
    const s = space.stats();
    parts.push(`N-body · ${s.bodies} bodies${s.running ? ` · t+${Math.floor(s.t)}s` : ""}`);
  } else if (spaceFailed) {
    parts.push("system unavailable");
  }
  readout.textContent = parts.join("  ·  ");
}

function syncMotion() {
  const on = motionOn() && !document.hidden;
  sw.setAttribute("aria-checked", String(motionOn()));
  if (!motionOn()) { renderer?.setPointer(0, 0); space?.setPointer(0, 0); }
  renderer?.setRunning(on);
  space?.setRunning(on && spaceWanted());
  updateReadout();
}

sw.addEventListener("click", () => {
  const next = !motionOn();
  pref = next === !rm.matches ? "system" : next ? "on" : "off";   // matching the OS means "follow the OS"
  store.set("wh.motion", pref);
  syncMotion();
});
rm.addEventListener("change", syncMotion);
document.addEventListener("visibilitychange", syncMotion);

function syncOrbits() {
  orbitsSw.setAttribute("aria-checked", String(orbitsOn));
  space?.setTrails(orbitsOn);
}
orbitsSw.addEventListener("click", () => {
  orbitsOn = !orbitsOn;
  store.set("wh.orbits", orbitsOn ? "on" : "off");
  syncOrbits();
});
syncOrbits();

function applyPalette(key) {
  palKey = key;
  const p = PALETTES[key], s = document.documentElement.style;
  s.setProperty("--bg", p.bg);
  s.setProperty("--a", p.a);
  s.setProperty("--b", p.b);
  s.setProperty("--c", p.c);
  $("pal-" + key).checked = true;
  renderer?.setPalette(p);
  space?.setBackground(p.bg);
}
document.querySelectorAll('input[name="palette"]').forEach((input) => {
  input.addEventListener("change", () => { applyPalette(input.value); store.set("wh.palette", input.value); });
});
applyPalette(palKey);

// band from the measured size of the menu in the opening, clamped to 5–16 % of the short side
function updateBand() {
  if (!renderer || phase !== "portal") return;
  const w = canvas.clientWidth, h = canvas.clientHeight, S = Math.min(w, h);
  const fit = Math.min(w - nav.offsetWidth, h - nav.offsetHeight) / 2 - 24;
  renderer.setBand(Math.min(0.16 * S, Math.max(Math.max(18, 0.05 * S), fit)));
}

const ro = new ResizeObserver(() => {
  renderer?.resize(canvas.clientWidth, canvas.clientHeight);
  space?.resize(spaceCanvas.clientWidth, spaceCanvas.clientHeight);
  updateBand();
});
[canvas, nav].forEach((el) => ro.observe(el));

addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || !motionOn()) return;
  const px = -(e.clientX / innerWidth - 0.5) * 2 * POINTER_PX, py = (e.clientY / innerHeight - 0.5) * 2 * POINTER_PX;
  renderer?.setPointer(px, py);
  space?.setPointer(px, py);
}, { passive: true });
document.documentElement.addEventListener("pointerleave", () => { renderer?.setPointer(0, 0); space?.setPointer(0, 0); });

/* ---------- story: typed text ---------- */
const storySr = $("story-sr");
const typing = { segs: [], times: [], total: 0, t0: 0, raf: 0, shown: 0, cur: 0, follow: true, caret: null };

function buildStory() {
  storyText.replaceChildren();
  storySr.replaceChildren();
  const T = typing;
  T.segs = []; T.times = []; T.shown = 0; T.cur = 0; T.follow = true;
  let n = 0, clock = 0;
  for (const para of STORY) {
    const p = document.createElement("p");
    storyText.append(p);
    storySr.append(Object.assign(document.createElement("p"), { textContent: para.replaceAll("**", "") }));
    para.split("**").forEach((text, i) => {
      if (!text) return;
      const el = document.createElement(i % 2 ? "strong" : "span");
      p.append(el);
      T.segs.push({ el, p, text, start: n, shown: 0 });
      for (const ch of text) {
        clock += 6 + (ch === "," || ch === ";" ? 35 : ch === "." || ch === "!" || ch === "?" || ch === ":" || ch === "—" ? 90 : 0);
        T.times.push(clock);
        n++;
      }
    });
    clock += 300;   // beat between paragraphs
    T.times[n - 1] = clock;
  }
  T.total = clock;
  T.caret = Object.assign(document.createElement("span"), { className: "caret" });
  T.caret.setAttribute("aria-hidden", "true");
}

function paint(count) {
  const T = typing;
  while (T.cur < T.segs.length) {
    const s = T.segs[T.cur];
    const len = [...s.text].length;
    const want = Math.max(0, Math.min(len, count - s.start));
    if (want !== s.shown) {
      s.el.textContent = [...s.text].slice(0, want).join("");
      s.shown = want;
    }
    if (want < len) { s.p.append(T.caret); break; }
    T.cur++;
  }
  if (T.follow) storyText.scrollTop = storyText.scrollHeight;
}

function stopTyping() { cancelAnimationFrame(typing.raf); typing.raf = 0; }

function finishTyping() {
  stopTyping();
  paint(typing.times.length);
  typing.caret?.remove();
  story.classList.add("is-done");
}

function startTyping() {
  const T = typing;
  stopTyping();
  buildStory();
  story.classList.remove("is-done");
  T.t0 = performance.now();
  const tick = (now) => {
    const el = now - T.t0;
    if (el >= T.total) { finishTyping(); return; }
    let lo = T.shown;
    while (lo < T.times.length && T.times[lo] <= el) lo++;   // times ascend: resume from the last position
    T.shown = lo;
    paint(lo);
    T.raf = requestAnimationFrame(tick);
  };
  T.raf = requestAnimationFrame(tick);
}

storyText.addEventListener("click", () => { if (typing.raf) finishTyping(); });
storyText.addEventListener("wheel", () => { typing.follow = false; }, { passive: true });
storyText.addEventListener("touchmove", () => { typing.follow = false; }, { passive: true });

/* ---------- story: sequence ---------- */
const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  smooth: (t) => t * t * (3 - 2 * t),
};
let run = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (ms, fn, id) => new Promise((resolve) => {
  const t0 = performance.now();
  const step = (now) => {
    if (id !== run) return resolve(false);
    const t = Math.min(1, (now - t0) / ms);
    fn(t);
    t < 1 ? requestAnimationFrame(step) : resolve(true);
  };
  requestAnimationFrame(step);
});

// top-down order: the five links, then the divider that sits above STORY
const cascadeTargets = () => {
  const lis = [...nav.querySelectorAll(".portal-list > li")];
  return [...lis.slice(0, -1), lis.at(-1).querySelector(".portal-divider")];
};

function resetPortal() {
  for (const el of [...cascadeTargets(), storyLink]) {
    el.getAnimations().forEach((a) => a.cancel());
    el.style.transform = el.style.opacity = el.style.filter = el.style.willChange = "";
  }
}

function showStoryPanel(animate) {
  nav.hidden = true;
  story.hidden = false;
  story.classList.remove("is-done");
  if (animate) story.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 500, easing: "ease-out" });
  storyTitle.focus({ preventScroll: true });
}

function settleClosed() {
  setWH({ close: 1, x: 0, y: 0, warp: 0.35 });
  space?.setRunning(false);
}

async function enterStory({ instant = false } = {}) {
  if (phase === "entering" || phase === "story") return;
  const id = ++run;
  phase = "entering";
  const animate = !instant && motionOn() && !!renderer;

  if (!animate) {
    settleClosed();
    showStoryPanel(false);
    phase = "story";
    if (motionOn()) startTyping(); else { buildStory(); finishTyping(); }
    return;
  }

  // 1. the other options fade out, top down, a few milliseconds apart
  const fades = cascadeTargets().map((el, i) => el.animate(
    [{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(5px)" }],
    { duration: 170, delay: i * 65, easing: "ease-out", fill: "forwards" }));
  storyLink.style.pointerEvents = "none";
  await sleep(300);
  if (id !== run) return;

  // 2. STORY curves up the z axis and shoots into the stars; the opening shrinks and follows it
  const W = innerWidth, H = innerHeight;
  const r = storyLink.getBoundingClientRect();
  const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
  const x1 = W * 0.5, y1 = H * 0.3;                 // vanishing point of the flight
  const cx = x0 + W * 0.2, cy = y0 - H * 0.34;      // bend of the path
  storyLink.style.willChange = "transform, opacity, filter";
  const done = await frames(1750, (t) => {
    const e = ease.inOut(t);
    const k = 1 - e;
    const x = k * k * x0 + 2 * k * e * cx + e * e * x1;
    const y = k * k * y0 + 2 * k * e * cy + e * e * y1;
    const s = 1 / (1 + 15 * Math.pow(e, 2.1));
    storyLink.style.transform = `translate(${x - x0}px, ${y - y0}px) perspective(700px) rotateX(${55 * e}deg) scale(${s})`;
    storyLink.style.opacity = String(1 - ease.smooth(Math.max(0, (t - 0.82) / 0.18)));
    storyLink.style.filter = `brightness(${1 + 1.6 * e}) drop-shadow(0 0 ${0.6 * e}em rgba(255,150,130,.9))`;
    setWH({ x: x - W / 2, y: -(y - H / 2), close: ease.smooth(Math.min(1, e * 1.04)), warp: 0.9 * ease.smooth(t) });
  }, id);
  if (!done) return;
  space?.setRunning(false);
  fades.forEach((a) => a.cancel());

  // 3. the vortex fills the screen: its centre eases back and the tunnel streams past
  const c0 = [x1 - W / 2, -(y1 - H / 2)];
  if (!await frames(750, (t) => {
    const e = ease.inOut(t);
    setWH({ x: c0[0] * (1 - e), y: c0[1] * (1 - e), warp: 0.9 - 0.55 * ease.out(t) });
  }, id)) return;
  settleClosed();

  // 4. the story arrives and is typed
  showStoryPanel(true);
  phase = "story";
  await sleep(350);
  if (id === run && phase === "story") startTyping();
}

async function leaveStory() {
  if (phase !== "story" && phase !== "entering") return;
  const id = ++run;
  const wasEntering = phase === "entering";
  phase = "leaving";
  stopTyping();
  const animate = motionOn() && !!renderer;

  const reveal = () => {
    resetPortal();
    storyLink.style.pointerEvents = "";
    story.hidden = true;
    nav.hidden = false;
  };

  if (!animate) {
    reveal();
    setWH({ close: 0, x: 0, y: 0, warp: 0 });
    phase = "portal";
    syncMotion(); updateBand();
    storyLink.focus({ preventScroll: true });
    return;
  }

  if (!wasEntering) {
    await story.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-in", fill: "forwards" }).finished.catch(() => {});
    if (id !== run) return;
  }
  reveal();
  story.getAnimations().forEach((a) => a.cancel());
  syncMotion();
  const items = cascadeTargets();
  items.forEach((el, i) => el.animate([{ opacity: 0, filter: "blur(5px)" }, { opacity: 1, filter: "blur(0px)" }],
    { duration: 260, delay: 450 + i * 65, easing: "ease-out", fill: "backwards" }));
  storyLink.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 450 + items.length * 65, easing: "ease-out", fill: "backwards" });

  const from = { ...wh };
  const ok = await frames(1150, (t) => {
    const e = ease.inOut(t);
    setWH({ close: from.close * (1 - e), x: from.x * (1 - e), y: from.y * (1 - e), warp: from.warp * (1 - ease.out(t)) });
  }, id);
  if (!ok) return;
  setWH({ close: 0, x: 0, y: 0, warp: 0 });
  phase = "portal";
  syncMotion();
  updateBand();
  storyLink.focus({ preventScroll: true });
}

storyLink.addEventListener("click", (e) => {
  e.preventDefault();
  if (phase !== "portal") return;
  renderer?.kick();
  history.pushState(null, "", "#story");
  enterStory();
});
addEventListener("hashchange", () => {
  if (location.hash === "#story") enterStory();
  else leaveStory();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (phase === "story" || phase === "entering")) { location.hash = ""; return; }
  if ((e.key === " " || e.key === "Enter") && phase === "story" && typing.raf && e.target === document.body) { e.preventDefault(); finishTyping(); return; }
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && phase === "portal") {
    const i = links.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    links[(i + (e.key === "ArrowDown" ? 1 : links.length - 1)) % links.length].focus();
  }
});

// coming straight to /#story: no departure, straight into the tunnel
const startInStory = location.hash === "#story";
if (startInStory) { nav.hidden = true; story.hidden = false; }

/* ---------- graphics start after the menu has painted ---------- */
async function init() {
  try {
    renderer = createRenderer(canvas, {
      onFirstFrame() { canvas.classList.add("is-live"); },
      onFailure(kind) {
        canvas.classList.remove("is-live");
        failed = kind === "lost" ? "GPU context lost · static backdrop" : "Renderer failed · static backdrop";
        updateReadout();
      },
      onRestore() { failed = null; updateReadout(); },
      onStats: updateReadout,
    });
  } catch (err) {
    console.warn(err);
    renderer = null;
  }
  if (!renderer) {
    canvas.hidden = true;
    failed = "No WebGL2 · static backdrop";
  } else {
    renderer.setPalette(PALETTES[palKey]);
    renderer.resize(canvas.clientWidth, canvas.clientHeight);
    updateBand();
  }
  setWH({});   // push the tracked aperture state into the renderer
  if (startInStory) enterStory({ instant: true });
  syncMotion();

  try {
    space = await createSpace(spaceCanvas, {
      onFirstFrame() { spaceCanvas.classList.add("is-live"); },
      onStats: updateReadout,
    });
    space.setBackground(PALETTES[palKey].bg);
    space.setTrails(orbitsOn);
    space.resize(spaceCanvas.clientWidth, spaceCanvas.clientHeight);
  } catch (err) {
    console.warn(err);
    space = null;
    spaceFailed = true;
    spaceCanvas.hidden = true;
  }
  syncMotion();
}
let started = false;
const start = () => { if (!started) { started = true; init(); } };
requestAnimationFrame(() => setTimeout(start, 0));
setTimeout(start, 400);   // a tab opened in the background never gets a frame; do not wait for one
