const gallery = document.querySelector('.portrait-gallery');
const frame = gallery.querySelector('.portrait-frame');
const layer = document.createElement('div');
const image = new Image();

layer.className = 'portrait-layer';
image.alt = 'Josh in sunglasses and a red jacket under warm light';
image.decoding = 'async';
image.fetchPriority = 'low';
image.addEventListener('load', () => {
  layer.append(image);
  frame.replaceChildren(layer);
}, { once: true });
image.src = `${gallery.dataset.source}/portraits-v1/08.webp`;
