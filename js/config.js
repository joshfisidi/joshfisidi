// Content, palettes and the planetary system. Everything tunable lives here.

// The five other portal items link straight out (see index.html). STORY is internal: it plays the wormhole
// sequence and types this text.
// **bold** marks emphasis. One entry per paragraph.
export const STORY = [
  "Born in Guyana, shaped by the vibrant culture of Trinidad, and raised into adulthood in Toronto, Canada, Joshua Gomes developed an unconventional perspective on the world. Moving between countries, cultures, and circumstances taught Josh to adapt early, think independently, and see possibilities where others saw limitations.",
  "Driven by an insatiable curiosity, Joshua pursued knowledge beyond traditional classrooms, teaching himself software engineering, artificial intelligence, blockchain technology, music production, and the architecture of complex systems. For Josh, creativity and engineering were never separate disciplines\u2014they were different expressions of the same instinct: **to turn imagination into something real.**",
  "The journey came with considerable adversity. Chronic illness, financial uncertainty, and personal setbacks repeatedly challenged Josh's ambitions, but never extinguished the determination to build. Each obstacle became another problem to understand, another system to navigate, another reason to pursue independence.",
  "Today, Joshua is the founder of **Fisidi Inc.**, an evolving technology and creative enterprise connecting software, intelligent systems, finance, gaming, and digital entertainment. Behind these ventures lies a larger strategy: building the infrastructure and capital necessary to pursue scientific discovery, human longevity, and technologies capable of transforming lives.",
  "**Joshua isn't pursuing success merely to participate in the world as it exists. Josh is building toward the ability to change what the world can become.**",
  "From a young immigrant discovering new possibilities to an independent inventor pursuing ambitions that span industries and generations, Joshua's story remains unfinished.",
  "**The defining achievement isn't behind Josh. It's what everything so far has been preparing Josh to create.**",
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
