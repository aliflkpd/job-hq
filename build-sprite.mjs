import fs from 'node:fs'; import path from 'node:path';
const dir = 'node_modules/@phosphor-icons/core/assets/regular';
const files = [];
(function w(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? w(p) : /\.js$/.test(p) && files.push(p); } })('public/js');
const names = new Set();
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/'([a-z]+(?:-[a-z]+)*)'/g)) if (fs.existsSync(`${dir}/${m[1]}.svg`)) names.add(m[1]);
['house', 'kanban', 'magnifying-glass', 'address-book', 'chart-bar', 'arrows-clockwise', 'keyboard', 'warning', 'check', 'x', 'caret-right', 'caret-left', 'list-bullets', 'squares-four', 'clock', 'calendar-blank', 'paper-plane-tilt', 'target', 'globe', 'tray', 'sliders-horizontal', 'funnel'].forEach((n) => fs.existsSync(`${dir}/${n}.svg`) && names.add(n));
let out = '<svg xmlns="http://www.w3.org/2000/svg">';
for (const n of [...names].sort()) {
  const s = fs.readFileSync(`${dir}/${n}.svg`, 'utf8');
  const vb = /viewBox="([^"]+)"/.exec(s)[1];
  const inner = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  out += `<symbol id="i-${n}" viewBox="${vb}" fill="currentColor">${inner}</symbol>`;
}
fs.writeFileSync('public/sprite.svg', out + '</svg>');
console.log(names.size, [...names].join(' '));
