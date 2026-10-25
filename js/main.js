// Interface: hash-routed rooms over two canvases (far system underneath, wormhole on top).
import { ROOMS, PALETTES, DEFAULT_PALETTE } from "./config.js";
import { createRenderer } from "./wormhole.js";
import { createSpace } from "./space.js";

const POINTER_PX = 6;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const $ = (id) => document.getElementById(id);
const canvas = $("field"), spaceCanvas = $("space");
const nav = $("portal"), room = $("room"), sw = $("motion"), orbitsSw = $("orbits"), readout = $("readout");
const links = [...nav.querySelectorAll("a")];
const rm = matchMedia("(prefers-reduced-motion: reduce)");

let renderer = null, space = null, failed = null, spaceFailed = false;
let pref = store.get("wh.motion");
if (!["system", "on", "off"].includes(pref)) pref = "system";
let palKey = store.get("wh.palette");
if (!PALETTES[palKey]) palKey = DEFAULT_PALETTE;
let orbitsOn = store.get("wh.orbits") !== "off";

const motionOn = () => pref === "on" || (pref === "system" && !rm.matches);

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
  const on = motionOn();
  sw.setAttribute("aria-checked", String(on));
  if (!on) { renderer?.setPointer(0, 0); space?.setPointer(0, 0); }
  renderer?.setRunning(on && !document.hidden);
  space?.setRunning(on && !document.hidden);
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

// band from the measured size of whatever sits in the opening, clamped to 5–16 % of the short side
function updateBand() {
  if (!renderer) return;
  const el = room.hidden ? nav : room;
  const w = canvas.clientWidth, h = canvas.clientHeight, S = Math.min(w, h);
  const fit = Math.min(w - el.offsetWidth, h - el.offsetHeight) / 2 - 24;
  renderer.setBand(Math.min(0.16 * S, Math.max(Math.max(18, 0.05 * S), fit)));
}

const ro = new ResizeObserver(() => {
  renderer?.resize(canvas.clientWidth, canvas.clientHeight);
  space?.resize(spaceCanvas.clientWidth, spaceCanvas.clientHeight);
  updateBand();
});
[canvas, nav, room].forEach((el) => ro.observe(el));

addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || !motionOn()) return;
  const px = -(e.clientX / innerWidth - 0.5) * 2 * POINTER_PX, py = (e.clientY / innerHeight - 0.5) * 2 * POINTER_PX;
  renderer?.setPointer(px, py);
  space?.setPointer(px, py);
}, { passive: true });
document.documentElement.addEventListener("pointerleave", () => { renderer?.setPointer(0, 0); space?.setPointer(0, 0); });

/* ---------- routing (hash rooms; links stay real anchors) ---------- */
const roomLinks = $("room-links"), roomLines = $("room-lines"), roomNote = $("room-note");
let lastKey = null;

function route(fromUser) {
  const key = location.hash.slice(1);
  const i = ROOMS.findIndex((r) => r.key === key);
  if (i < 0) {
    room.hidden = true;
    nav.hidden = false;
    document.title = "Josh Fisidi";
    if (fromUser && lastKey) links.find((a) => a.hash === "#" + lastKey)?.focus();
    lastKey = null;
  } else {
    const r = ROOMS[i];
    const next = ROOMS[(i + 1) % ROOMS.length];
    $("room-pos").textContent = String(i + 1).padStart(2, "0");
    $("room-title").textContent = r.label;
    $("room-desc").textContent = r.desc;
    $("room-next").href = "#" + next.key;
    $("room-next").textContent = next.label + " →";

    roomLines.replaceChildren(...(r.lines || []).map((t) => Object.assign(document.createElement("li"), { textContent: t })));
    roomLines.hidden = !r.lines?.length;
    roomLinks.replaceChildren(...(r.links || []).map((l) => {
      const li = document.createElement("li");
      const a = Object.assign(document.createElement("a"), { href: l.href, textContent: l.label, target: "_blank", rel: "noopener noreferrer" });
      li.append(a);
      return li;
    }));
    roomLinks.hidden = !r.links?.length;
    roomNote.hidden = !!r.links?.length;

    nav.hidden = true;
    room.hidden = false;
    document.title = `${r.label[0]}${r.label.slice(1).toLowerCase()} · Josh Fisidi`;
    lastKey = r.key;
    if (fromUser) $("room-title").focus();
  }
  updateBand();
}
addEventListener("hashchange", () => route(true));

// click feedback runs alongside navigation, never in front of it
document.addEventListener("click", (e) => {
  if (e.target.closest?.('a[href^="#"]')) { renderer?.kick(); space?.kick(); }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !room.hidden) { location.hash = ""; return; }
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !nav.hidden) {
    const i = links.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    links[(i + (e.key === "ArrowDown" ? 1 : links.length - 1)) % links.length].focus();
  }
});

route(false);

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
