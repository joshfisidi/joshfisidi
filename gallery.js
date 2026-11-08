const gallery = document.querySelector('.portrait-gallery');
const frame = gallery.querySelector('.portrait-frame');
const wide = matchMedia('(min-width: 1200px) and (min-height: 650px)');
const mobile = matchMedia('(max-width: 767px), (max-width: 950px) and (pointer: coarse)');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const mobilePortrait = ['portraits-v1/08', 'Josh in sunglasses and a red jacket under warm light'];
const portraits = [
  ['portraits-v1/04', 'Seated studio portrait of Josh'],
  ['portraits-v2/08', 'Josh in red light wearing headphones', '38% center'],
  mobilePortrait,
  ['portraits-v1/01', 'Josh in a black coat by a doorway', '75% center'],
  ['portraits-v1/02', 'Josh outside in the snow'],
  ['portraits-v1/03', 'Josh reflected in a storefront window'],
  ['portraits-v1/05', 'Josh resting his head on his hand'],
  ['portraits-v1/06', 'Josh wearing round sunglasses'],
  ['portraits-v1/07', 'Josh seated in his music studio'],
  ['portraits-v1/09', 'Josh in orange sunglasses beside a teddy bear'],
  ['portraits-v1/10', 'Josh in a light coat'],
  ['portraits-v2/01', 'Close portrait with red sketch lines'],
  ['portraits-v2/02', 'Josh in a black hoodie'],
  ['portraits-v2/03', 'Josh wearing headphones under cool light'],
  ['portraits-v2/04', 'Side portrait with green headphones'],
  ['portraits-v2/05', 'Josh in a pink shirt beside a guitar', '34% center'],
  ['portraits-v2/06', 'Josh holding the edge of his hood', '42% center'],
  ['portraits-v2/07', 'Elevator mirror portrait in a yellow sweater', '34% center'],
  ['portraits-v2/09', 'Josh in a dark coat with a pendant'],
  ['portraits-v2/10', 'An older photograph with a yellow and black shirt'],
];
let index = 0;
let mobileMode;
let timer;
let prefetchTimer;
let revision = 0;
let pending;
const visible = () => (wide.matches || mobile.matches) && !document.hidden;
const wrap = (i) => (i + portraits.length) % portraits.length;

function load(i) {
  if (pending?.index === i) return pending.image;
  const [path, alt, position] = portraits[i];
  const image = new Image();
  image.alt = alt;
  image.decoding = 'async';
  image.fetchPriority = 'low';
  if (position) image.style.objectPosition = position;
  image.src = `${gallery.dataset.source}/${path}.webp`;
  pending = { index: i, image: image.decode().then(() => image, () => null) };
  return pending.image;
}

function schedule() {
  clearTimeout(timer);
  clearTimeout(prefetchTimer);
  if (!visible() || mobile.matches || motion.matches || navigator.connection?.saveData) return;
  const next = wrap(index + 1);
  prefetchTimer = setTimeout(() => { if (visible()) load(next); }, 4800);
  timer = setTimeout(() => show(next), 6500);
}

// The two complementary masks transfer one cell at a time across a repeating tile.
const thresholds = [0, 12, 3, 15, 8, 4, 11, 7, 2, 14, 1, 13, 10, 6, 9, 5];
let dissolveFrames;
function ditherFrames() {
  return Array.from({ length: 17 }, (_, level) => {
    const mask = (incoming) => {
      const cells = thresholds.map((threshold, i) => (threshold < level) === incoming
        ? `<rect x="${i % 4}" y="${Math.floor(i / 4)}" width="1" height="1"/>`
        : '').join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4" shape-rendering="crispEdges">${cells}</svg>`;
      return { maskImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, easing: 'steps(1, end)' };
    };
    return { enter: mask(true), exit: mask(false) };
  });
}

function reveal(image) {
  const outgoing = frame.firstElementChild;
  const incoming = document.createElement('div');
  incoming.className = 'portrait-layer';
  incoming.append(image);
  if (!outgoing || mobile.matches || motion.matches) {
    frame.replaceChildren(incoming);
    return;
  }
  outgoing.setAttribute('aria-hidden', 'true');
  frame.append(incoming);
  const timing = { duration: 840, fill: 'both' };
  dissolveFrames ??= ditherFrames();
  const exit = outgoing.animate(dissolveFrames.map(step => step.exit), timing);
  const enter = incoming.animate(dissolveFrames.map(step => step.enter), timing);
  enter.finished.then(() => {
    outgoing.remove();
    enter.cancel();
    exit.cancel();
  });
}

async function show(next) {
  if (!visible()) return;
  clearTimeout(timer);
  clearTimeout(prefetchTimer);
  const ticket = ++revision;
  index = next;
  const image = await load(next);
  if (ticket !== revision || !visible()) return;
  if (image) {
    reveal(image);
  } else {
    pending = null;
  }
  schedule();
}

function sync() {
  if (visible() && (mobileMode !== mobile.matches || !frame.firstChild)) {
    mobileMode = mobile.matches;
    show(mobileMode ? portraits.indexOf(mobilePortrait) : 0);
    return;
  }
  schedule();
}

motion.addEventListener('change', sync);
wide.addEventListener('change', sync);
mobile.addEventListener('change', sync);
document.addEventListener('visibilitychange', sync);
sync();
