// Interface: the portal menu over two canvases (far system underneath, wormhole on top), and the STORY sequence.
import { STORY, PALETTES, DEFAULT_PALETTE } from "./config.js";
import { createRenderer } from "./wormhole.js";
import { createSpace } from "./space.js";

const POINTER_PX = 6;
const rootStyle = document.documentElement.style;

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

// the portrait takes whatever room is free above the menu; it steps aside on short screens
function updateAvatar() {
  const free = (canvas.clientHeight - nav.offsetHeight) / 2 - 44;
  const size = Math.min(168, free, canvas.clientWidth * 0.3);
  nav.classList.toggle("no-avatar", size < 64);
  if (size >= 64) nav.style.setProperty("--av", `${Math.round(size)}px`);
}

// band from the measured size of the menu in the opening, clamped to 5–16 % of the short side
function updateBand() {
  updateAvatar();
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
  rootStyle.setProperty("--mx", (-px / POINTER_PX).toFixed(3));
  rootStyle.setProperty("--my", (py / POINTER_PX).toFixed(3));
}, { passive: true });
document.documentElement.addEventListener("pointerleave", () => {
  renderer?.setPointer(0, 0); space?.setPointer(0, 0);
  rootStyle.setProperty("--mx", "0"); rootStyle.setProperty("--my", "0");
});

/* ---------- story: the text crawls up and away, like an opening crawl ---------- */
const storySr = $("story-sr"), storyView = $("story-view"), storyHint = $("story-hint");
const CRAWL_SPEED = 11;   // px per second along the tilted plane
const crawl = { raf: 0, y: 0, last: 0, paused: false };

function buildStory() {
  storyText.replaceChildren();
  storySr.replaceChildren();
  for (const para of STORY) {
    const p = document.createElement("p");
    para.split("**").forEach((text, i) => {
      if (text) p.append(Object.assign(document.createElement(i % 2 ? "strong" : "span"), { textContent: text }));
    });
    storyText.append(p);
    storySr.append(Object.assign(document.createElement("p"), { textContent: para.replaceAll("**", "") }));
  }
}

// y is the text's offset from the bottom of the view; it starts just below and ends once the last line has gone
const crawlStart = () => storyView.clientHeight;
const crawlEnd = () => -storyText.offsetHeight - storyView.clientHeight * 0.4;
function placeCrawl() { storyText.style.transform = `rotateX(24deg) translateY(${crawl.y}px)`; }

function stopCrawl() { cancelAnimationFrame(crawl.raf); crawl.raf = 0; }

function startCrawl() {
  stopCrawl();
  buildStory();
  story.classList.add("is-crawl");
  crawl.y = crawlStart();
  crawl.paused = false;
  crawl.last = performance.now();
  storyHint.textContent = "Tap to pause";
  placeCrawl();
  const tick = (now) => {
    const dt = Math.min(0.1, (now - crawl.last) / 1000);
    crawl.last = now;
    if (!crawl.paused) {
      crawl.y -= dt * CRAWL_SPEED;
      if (crawl.y < crawlEnd()) crawl.y = crawlStart();   // run it again from the bottom
      placeCrawl();
    }
    crawl.raf = requestAnimationFrame(tick);
  };
  crawl.raf = requestAnimationFrame(tick);
}

function showStatic() {
  stopCrawl();
  buildStory();
  story.classList.remove("is-crawl");
  storyText.style.transform = "";
  storyHint.textContent = "";
}

function togglePause() {
  if (!crawl.raf) return;
  crawl.paused = !crawl.paused;
  storyHint.textContent = crawl.paused ? "Tap to resume" : "Tap to pause";
}
function scrub(dy) {
  if (!crawl.raf) return;
  crawl.y = Math.min(crawlStart(), Math.max(crawlEnd(), crawl.y - dy));
  placeCrawl();
}

storyView.addEventListener("click", togglePause);
storyView.addEventListener("wheel", (e) => { if (crawl.raf) { e.preventDefault(); scrub(e.deltaY * 0.5); } }, { passive: false });
let touchY = null;
storyView.addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; }, { passive: true });
storyView.addEventListener("touchmove", (e) => {
  if (touchY == null || !crawl.raf) return;
  e.preventDefault();
  scrub(touchY - e.touches[0].clientY);
  touchY = e.touches[0].clientY;
}, { passive: false });

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

// top-down order: the portrait, the five links, then the divider that sits above STORY
const cascadeTargets = () => {
  const lis = [...nav.querySelectorAll(".portal-list > li")];
  return [nav.querySelector(".avatar"), ...lis.slice(0, -1), lis.at(-1).querySelector(".portal-divider")];
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
  if (animate) story.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1100, easing: "ease-out" });
  storyTitle.focus({ preventScroll: true });
}

const CLOSED = { close: 1, x: 0, y: 0, warp: 0 };
function settleClosed() {
  setWH(CLOSED);
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
    if (motionOn()) startCrawl(); else showStatic();
    return;
  }

  // 1. the other options fade out, top down
  const fades = cascadeTargets().map((el, i) => el.animate(
    [{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(5px)" }],
    { duration: 380, delay: i * 80, easing: "ease-out", fill: "forwards" }));
  storyLink.style.pointerEvents = "none";
  await sleep(450);
  if (id !== run) return;

  // 2. STORY drifts back along -x and away into depth while the opening closes slowly around the centre
  const W = innerWidth;
  storyLink.style.willChange = "transform, opacity, filter";
  const from = { ...wh };
  const done = await frames(2600, (t) => {
    const e = ease.inOut(t);
    storyLink.style.transform = `perspective(900px) translate3d(${-0.45 * W * e}px, 0, ${-1400 * e}px) rotateY(${28 * e}deg)`;
    storyLink.style.opacity = String(1 - ease.smooth(Math.min(1, t / 0.9)));
    storyLink.style.filter = `blur(${2 * e}px)`;
    setWH({ x: from.x * (1 - e), y: from.y * (1 - e), close: ease.smooth(t), warp: CLOSED.warp * ease.smooth(t) });
  }, id);
  if (!done) return;
  fades.forEach((a) => a.cancel());
  settleClosed();

  // 3. black falls and the story crawls up
  showStoryPanel(true);
  phase = "story";
  startCrawl();
}

async function leaveStory() {
  if (phase !== "story" && phase !== "entering") return;
  const id = ++run;
  const wasEntering = phase === "entering";
  phase = "leaving";
  stopCrawl();
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
    await story.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, easing: "ease-in", fill: "forwards" }).finished.catch(() => {});
    if (id !== run) return;
  }
  reveal();
  story.getAnimations().forEach((a) => a.cancel());
  syncMotion();
  const items = cascadeTargets();
  items.forEach((el, i) => el.animate([{ opacity: 0, filter: "blur(5px)" }, { opacity: 1, filter: "blur(0px)" }],
    { duration: 420, delay: 900 + i * 80, easing: "ease-out", fill: "backwards" }));
  storyLink.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 900 + items.length * 80, easing: "ease-out", fill: "backwards" });

  const from = { ...wh };
  const ok = await frames(1800, (t) => {
    const e = ease.inOut(t);
    setWH({ close: from.close * (1 - e), x: from.x * (1 - e), y: from.y * (1 - e), warp: from.warp * (1 - e) });
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
  history.pushState(null, "", "#story");
  enterStory();
});
addEventListener("hashchange", () => {
  if (location.hash === "#story") enterStory();
  else leaveStory();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (phase === "story" || phase === "entering")) { location.hash = ""; return; }
  if (e.key === " " && phase === "story" && crawl.raf && !e.target.closest?.("a, button, input")) { e.preventDefault(); togglePause(); return; }
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
