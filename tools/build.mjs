import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'portal.js', 'gallery.js', 'robots.txt', '404.html', '_headers']) {
  await copyFile(file, `dist/${file}`);
}
