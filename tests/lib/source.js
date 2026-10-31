// Helpers for tests that pull a function or constant out of the real source files, so there is no copy to drift out of date.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
// every server file joined together, for "does the code mention X" checks
const serverSrc = () => ['server.js', ...walk('server')].map(read).join('\n');
// One complete top-level statement that starts with `anchor`: it runs until the next line that starts at column 0
// with something other than a closing bracket.
function stmt(src, anchor) {
  const a = src.indexOf(anchor);
  if (a < 0) throw new Error(`test anchor not found: ${anchor}`);
  const lines = src.slice(src.lastIndexOf('\n', a) + 1).split('\n'), out = [lines[0]];
  for (let i = 1; i < lines.length && (!lines[i] || /^[\s})\].]/.test(lines[i])); i++) out.push(lines[i]);
  return out.join('\n').trimEnd();
}
module.exports = { root, read, walk, serverSrc, stmt };
