// Content, palettes and the planetary system. Everything tunable lives here.

export const ROOMS = [
  {
    key: "music", label: "MUSIC",
    desc: "Records, live sets and unfinished sketches.",
    links: [
      { label: "BLIRCE · the music DAO", href: "https://blirce.vercel.app" },
      { label: "SoundCloud · The Most", href: "https://soundcloud.com/yashguma/the-most" },
    ],
  },
  {
    key: "apps", label: "APPS",
    desc: "Small tools built to be used every day.",
    links: [
      { label: "PIJIN · built-in agentic chrome messenger", href: "https://pijin.xyz" },
      { label: "NEBULA", href: "https://xnebula.vercel.app" },
      { label: "POLYDEX · control your AI agents from your phone", href: "https://github.com/joshfisidi/polydex" },
      { label: "CLERGY · Rust", href: "https://github.com/joshfisidi/clergy" },
    ],
  },
  { key: "games", label: "GAMES", desc: "Playable things, finished and otherwise.", links: [] },
  { key: "design", label: "DESIGN", desc: "Identity, interface and print work.", links: [] },
  { key: "books", label: "BOOKS", desc: "Writing in long form.", links: [] },
  {
    key: "story", label: "STORY",
    desc: "Who is behind all of this, and why.",
    lines: [
      "Build trade infra. Immutable apps and games.",
      "1000 years compressed into 100.",
      "Reality is computable. Code was discovered, not invented.",
      "Build blindly until you see.",
    ],
    links: [
      { label: "GitHub · @joshfisidi", href: "https://github.com/joshfisidi" },
      { label: "X · @joshfisidi", href: "https://x.com/joshfisidi" },
      { label: "Anime list · fisidi", href: "https://myanimelist.net/profile/fisidi" },
    ],
  },
];

// css custom properties + shader colours. Default is deep red.
export const PALETTES = {
  crimson: { bg: "#060103", a: "#3a040d", b: "#e8322c", c: "#8a0a1f" },
  oxblood: { bg: "#040102", a: "#240308", b: "#c42535", c: "#580813" },
  ember:   { bg: "#0a0504", a: "#6e1608", b: "#ffa05a", c: "#d4301e" },
};
export const DEFAULT_PALETTE = "crimson";

// ---- the far system -------------------------------------------------------------------------
// Distances (scene units) are compressed, radii inflated; periods are NOT set by hand: they follow from the
// gravity of the Sun via Kepler III using the reference planet below. Masses are real ratios to the Sun.
// spin is the rotation period in Earth days (negative = retrograde); 1 Earth day = dayLength seconds of real time.
export const SYSTEM = {
  seed: 7,
  refA: 150,            // Earth's semi-major axis
  refPeriod: 120,       // Earth's year, in seconds of simulated time
  dayLength: 18,        // seconds per Earth day
  sun: { radius: 58, spin: 25.4 },
  planets: [
    { id: "mercury", a: 70,  e: 0.206, inc: 7.0,  mass: 1.66e-7, radius: 5.3,  tilt: 0.03,  spin: 58.6,  phase: 0.6 },
    { id: "venus",   a: 105, e: 0.007, inc: 3.4,  mass: 2.45e-6, radius: 11.6,  tilt: 177.4, spin: -243,  phase: 3.9 },
    { id: "earth",   a: 150, e: 0.017, inc: 0.0,  mass: 3.0e-6,  radius: 12.3,  tilt: 23.4,  spin: 1,     phase: 2.0 },
    { id: "mars",    a: 200, e: 0.093, inc: 1.85, mass: 3.2e-7,  radius: 7.2,  tilt: 25.2,  spin: 1.03,  phase: 5.2 },
    { id: "jupiter", a: 270, e: 0.049, inc: 1.3,  mass: 9.5e-4,  radius: 33,   tilt: 3.1,   spin: 0.414, phase: 4.4 },
    { id: "saturn",  a: 330, e: 0.057, inc: 2.5,  mass: 2.86e-4, radius: 27.5,   tilt: 0,     spin: 0.444, phase: 1.1 },
    { id: "uranus",  a: 375, e: 0.046, inc: 0.77, mass: 4.4e-5,  radius: 15.8, tilt: 97.8,  spin: -0.718, phase: 5.9 },
    { id: "neptune", a: 410, e: 0.009, inc: 1.77, mass: 5.15e-5, radius: 15.2,   tilt: 28.3,  spin: 0.671, phase: 3.0 },
  ],
  moon: { a: 27, inc: 5.1, radius: 3.0, periodsPerYear: 13.37 },
  // where the system sits relative to the camera: depth far down -z, plane tipped toward the viewer
  distance: 900,
  offset: [200, 55],
  tilt: 36,     // degrees between the orbital normal and the view axis (0 = face-on, 90 = edge-on)
  roll: -14,
};
