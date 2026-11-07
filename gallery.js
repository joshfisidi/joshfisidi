const gallery = document.querySelector('.portrait-gallery');
const frame = gallery.querySelector('.portrait-frame');
const controls = gallery.querySelector('.portrait-controls');
const count = gallery.querySelector('.portrait-count');
const play = gallery.querySelector('.portrait-play');
const wide = matchMedia('(min-width: 1200px) and (min-height: 650px)');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const portraits = [
  [4, 'Seated studio portrait of Josh'],
  [8, 'Josh in a red jacket under warm light'],
  [1, 'Josh in a black coat by a doorway', '75% center'],
  [2, 'Josh outside in the snow'],
  [3, 'Josh reflected in a storefront window'],
  [5, 'Josh resting his head on his hand'],
  [6, 'Josh wearing round sunglasses'],
  [7, 'Josh seated in his music studio'],
  [9, 'Josh in orange sunglasses beside a teddy bear'],
  [10, 'Josh in a light coat'],
];
let index = 0;
let playing = !motion.matches && !navigator.connection?.saveData;
let timer;
let prefetchTimer;
let revision = 0;
let pending;
const visible = () => wide.matches && !document.hidden;
const wrap = (i) => (i + portraits.length) % portraits.length;
const format = (n) => String(n).padStart(2, '0');

function load(i) {
  if (pending?.index === i) return pending.image;
  const [number, alt, position] = portraits[i];
  const image = new Image();
  image.alt = alt;
  image.decoding = 'async';
  image.fetchPriority = 'low';
  if (position) image.style.objectPosition = position;
  image.src = `${gallery.dataset.source}/${format(number)}.webp`;
  pending = { index: i, image: image.decode().then(() => image, () => null) };
  return pending.image;
}

function schedule() {
  clearTimeout(timer);
  clearTimeout(prefetchTimer);
  play.textContent = playing ? 'Pause' : 'Play';
  if (!visible() || !playing) return;
  const next = wrap(index + 1);
  prefetchTimer = setTimeout(() => { if (visible()) load(next); }, 4800);
  timer = setTimeout(() => show(next), 6500);
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
    frame.replaceChildren(image);
    count.textContent = `${format(next + 1)} / ${portraits.length}`;
  } else {
    pending = null;
  }
  schedule();
}

function sync() {
  if (visible() && !frame.firstChild) show(index);
  else schedule();
}

controls.querySelectorAll('[data-step]').forEach(button => {
  button.addEventListener('click', () => show(wrap(index + Number(button.dataset.step))));
});
play.addEventListener('click', () => { playing = !playing; schedule(); });
motion.addEventListener('change', () => { if (motion.matches) playing = false; schedule(); });
wide.addEventListener('change', sync);
document.addEventListener('visibilitychange', sync);
controls.hidden = false;
sync();
