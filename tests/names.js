// Catches "X is not defined" and imports of things a file does not export, without running any route.
// (Splitting a big file into modules once left routes calling functions they never imported; every route that used one answered 500.)
// Uses the parser built into Node (needs the --expose-internals flag, which this file adds itself). Skips quietly if that parser is missing.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
let acorn, walk;
try { acorn = require('internal/deps/acorn/acorn/dist/acorn'); walk = require('internal/deps/acorn/acorn-walk/dist/walk'); } catch {
  if (process.env.NAMES_CHILD) { console.log('skipped: this Node version has no built-in parser'); process.exit(0); }
  process.exit(spawnSync(process.execPath, ['--expose-internals', __filename], { stdio: 'inherit', env: { ...process.env, NAMES_CHILD: '1' } }).status ?? 1);
}
const ROOT = path.join(__dirname, '..');
const JS = 'Object Array String Number Boolean Symbol BigInt Function Promise JSON Math Date RegExp Error TypeError RangeError SyntaxError Set Map WeakMap WeakSet Reflect Proxy Intl parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape undefined NaN Infinity globalThis arguments Uint8Array ArrayBuffer atob btoa structuredClone queueMicrotask setTimeout clearTimeout setInterval clearInterval URL URLSearchParams AbortController AbortSignal TextEncoder TextDecoder fetch FormData Blob console'.split(' ');
const NODE = new Set([...JS, ...'require module exports process Buffer __dirname __filename setImmediate'.split(' ')]);
const BROWSER = new Set([...JS, ...'window document location localStorage sessionStorage navigator history Event CustomEvent File FileReader Image confirm prompt alert requestAnimationFrame cancelAnimationFrame scrollTo scrollY scrollX innerHeight innerWidth matchMedia IntersectionObserver MutationObserver ResizeObserver createImageBitmap performance Notification PushManager Capacitor QRCode getComputedStyle HTMLElement Node DOMParser addEventListener removeEventListener crypto screen self open'.split(' ')]);
const parse = (src) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
const bind = (n, out) => { if (!n) return; if (n.type === 'Identifier') out.add(n.name); else if (n.type === 'ObjectPattern') n.properties.forEach((p) => bind(p.type === 'RestElement' ? p.argument : p.value, out)); else if (n.type === 'ArrayPattern') n.elements.forEach((e) => bind(e, out)); else if (n.type === 'AssignmentPattern') bind(n.left, out); else if (n.type === 'RestElement') bind(n.argument, out); };
function analyse(src) {
  const ast = parse(src), declared = new Set(), refs = new Set(), requires = [];
  walk.full(ast, (n) => {
    if (n.type === 'VariableDeclarator') { bind(n.id, declared); const c = n.init; if (c?.type === 'CallExpression' && c.callee.name === 'require' && String(c.arguments[0]?.value).startsWith('.') && n.id.type === 'ObjectPattern') requires.push({ spec: c.arguments[0].value, names: n.id.properties.map((p) => p.key?.name).filter(Boolean) }); }
    if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) declared.add(n.id.name);
    if (/Function/.test(n.type)) { if (n.id) declared.add(n.id.name); n.params.forEach((p) => bind(p, declared)); }
    if (n.type === 'CatchClause') bind(n.param, declared);
  });
  walk.ancestor(ast, { Identifier(n, _, anc) {
    const p = anc[anc.length - 2];
    if ((p?.type === 'MemberExpression' && p.property === n && !p.computed) || (p?.type === 'Property' && p.key === n && !p.computed && !p.shorthand)) return;
    if ((['MethodDefinition', 'PropertyDefinition'].includes(p?.type) && p.key === n) || ['LabeledStatement', 'BreakStatement', 'ContinueStatement'].includes(p?.type)) return;
    refs.add(n.name);
  } });
  return { ast, declared, refs, requires };
}
function exportsOf(file) {
  let names = null; walk.full(parse(fs.readFileSync(file, 'utf8')), (n) => {
    if (n.type !== 'AssignmentExpression' || n.left.type !== 'MemberExpression') return;
    const l = n.left;
    if (l.object.name === 'module' && l.property.name === 'exports') names = n.right.type === 'ObjectExpression' ? new Set(n.right.properties.map((p) => p.key?.name).filter(Boolean)) : 'any';
    else if (l.object.name === 'exports') { if (names !== 'any') (names ||= new Set()).add(l.property.name); }
  });
  return names;
}
const list = (d, out = []) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? list(p, out) : f.endsWith('.js') && out.push(p); } return out; };
const rel = (f) => path.relative(ROOT, f); let problems = 0, checked = 0;
const server = [path.join(ROOT, 'server.js'), ...list(path.join(ROOT, 'server')), ...list(path.join(ROOT, 'api'))];
for (const f of server) {
  checked++; const { declared, refs, requires } = analyse(fs.readFileSync(f, 'utf8'));
  const unknown = [...refs].filter((r) => !declared.has(r) && !NODE.has(r));
  if (unknown.length) { problems++; console.log(`  ${rel(f)} uses names that are never defined or imported: ${unknown.join(', ')}`); }
  for (const r of requires) {
    const base = path.resolve(path.dirname(f), r.spec), target = [base + '.js', path.join(base, 'index.js'), base].find((x) => fs.existsSync(x) && fs.statSync(x).isFile());
    if (!target) { problems++; console.log(`  ${rel(f)} requires ${r.spec}, which does not exist`); continue; }
    const ex = exportsOf(target); if (!ex || ex === 'any') continue;
    const missing = r.names.filter((n) => !ex.has(n)); if (missing.length) { problems++; console.log(`  ${rel(f)} imports ${missing.join(', ')} from ${r.spec}, which does not export ${missing.length > 1 ? 'them' : 'it'}`); }
  }
}
// The client files share one global scope (they load in the order index.html lists them), so check them as one program.
const order = [...fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8').matchAll(/<script src="\/(js\/[\w-]+\.js)"><\/script>/g)].map((m) => 'public/' + m[1]);
const clientDecl = new Set(), clientRefs = new Map();
for (const f of order) { checked++; const a = analyse(fs.readFileSync(path.join(ROOT, f), 'utf8')); a.declared.forEach((d) => clientDecl.add(d)); a.refs.forEach((r) => !clientRefs.has(r) && clientRefs.set(r, f)); }
for (const [r, f] of clientRefs) if (!clientDecl.has(r) && !BROWSER.has(r)) { problems++; console.log(`  ${f} uses ${r}, which no client file defines`); }
console.log(problems ? `${problems} problem(s) in ${checked} files` : `all ${checked} server and client files: every name is defined and every import is exported`);
process.exit(problems ? 1 : 0);
