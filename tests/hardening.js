// Production-readiness checks: rate limiter, moderation rules, push helpers, the service worker, and the build/PWA setup.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const server = read('server.js'), html = read('public/index.html');
const need = (src, s) => { const i = src.indexOf(s); if (i < 0) throw new Error(`test anchor not found: ${s}`); return i; };
const slice = (src, from, to) => { const a = need(src, from); return src.slice(a, need(src.slice(a), to) + a); };
const line = (src, from) => { const a = need(src, from); return src.slice(a, src.indexOf('\n', a)); };
const load = (code, names, ctx = {}) => { const sb = { URL, ...ctx }; vm.createContext(sb); vm.runInContext(code + `\n;globalThis.__o={${names.join(',')}};`, sb); return sb.__o; };
let fails = 0, total = 0;
const eq = (n, g, e) => { total++; if (JSON.stringify(g) !== JSON.stringify(e)) { fails++; console.log('  FAIL', n, JSON.stringify(g), 'expected', JSON.stringify(e)); } };

(async () => {
  // ---- rate limiter ----
  const rl = load(slice(server, 'const clientIp = ', 'const dbStore') + '\n' + line(server, 'const mem = new Map()') + '\n' + line(server, 'const memAllow = '), ['clientIp', 'hit', 'memAllow']);
  const mkStore = () => { const m = new Map(); return async (id) => { m.set(id, (m.get(id) || 0) + 1); return m.get(id); }; };
  const rule = { name: 't', max: 3, sec: 60 }, st = mkStore(), t0 = 1000000000000, res = [];
  for (let i = 0; i < 4; i++) res.push(await rl.hit(st, rule, 'ip1', t0));
  eq('first 3 requests allowed', res.slice(0, 3).map((x) => x.ok), [true, true, true]); eq('4th blocked', res[3].ok, false);
  eq('retry-after is within the window', res[3].retry >= 1 && res[3].retry <= 60, true);
  eq('other client is independent', (await rl.hit(st, rule, 'ip2', t0)).ok, true);
  eq('next window starts fresh', (await rl.hit(st, rule, 'ip1', t0 + 61000)).ok, true);
  eq('other rule is independent', (await rl.hit(st, { name: 'u', max: 3, sec: 60 }, 'ip1', t0)).ok, true);
  eq('ip from x-forwarded-for (first entry)', rl.clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, socket: {} }), '1.2.3.4');
  eq('platform header wins', rl.clientIp({ headers: { 'x-vercel-forwarded-for': '9.9.9.9', 'x-forwarded-for': '1.2.3.4' }, socket: {} }), '9.9.9.9');
  eq('falls back to socket', rl.clientIp({ headers: {}, socket: { remoteAddress: '::1' } }), '::1'); eq('unknown when nothing', rl.clientIp({ headers: {}, socket: {} }), 'unknown');
  eq('in-memory burst guard', [1, 2, 3, 4].map(() => rl.memAllow('8.8.8.8', 3)), [true, true, true, false]);
  const { RULES } = load(slice(server, 'const RULES = [', 'const mem = new Map()'), ['RULES']);
  const which = (m, p) => RULES.filter(([mm, re]) => mm === m && re.test(p)).map((r) => r[2]), oid = 'a'.repeat(24);
  eq('login limited', which('POST', '/api/auth/login'), ['login']); eq('likes limited', which('POST', `/api/posts/${oid}/like`), ['react']); eq('posting limited', which('POST', '/api/posts'), ['post']);
  eq('DMs limited', which('POST', `/api/conversations/${oid}/messages`), ['dm']); eq('export limited', which('GET', '/api/me/export'), ['export']); eq('views limited', which('POST', '/api/views'), ['views']);
  eq('feeds are not rule-limited', which('GET', '/api/posts'), []); eq('profile reads are not rule-limited', which('GET', '/api/users/bob'), []);

  // ---- moderation ----
  const { wordRe } = load(line(server, 'const wordRe = '), ['wordRe']);
  const re = wordRe(['bad', 'c++', 'a.b']);
  eq('blocked word hit', re.test('so bad!'), true); eq('no substring hit', re.test('badge'), false); eq('special characters are literal', re.test('I use c++ daily'), true); eq('dot is not a wildcard', re.test('axb'), false); eq('empty list matches nothing', wordRe([]), null);
  const mod = load(line(server, 'const isSuspended') + '\n' + line(server, 'const canActOn'), ['isSuspended', 'canActOn']), now = new Date(), future = new Date(Date.now() + 864e5), past = new Date(Date.now() - 864e5);
  eq('banned is suspended', mod.isSuspended({ banned: true }), true); eq('timed suspension active', mod.isSuspended({ suspendedUntil: future }), true);
  eq('expired suspension is over', mod.isSuspended({ suspendedUntil: past }), false); eq('normal account', mod.isSuspended({}), false);
  const owner = { id: 'o', admin: true }, moderator = { id: 'm', mod: true }, user = { id: 'u' };
  eq('mod can act on a user', mod.canActOn(moderator, user), true); eq('nobody acts on themselves', mod.canActOn(moderator, moderator), false);
  eq('nobody acts on the owner', mod.canActOn(moderator, owner) || mod.canActOn(owner, owner), false); eq('mod cannot act on another mod', mod.canActOn(moderator, { id: 'm2', mod: true }), false);
  eq('owner can act on a mod', mod.canActOn(owner, moderator), true);

  // ---- push helpers ----
  const push = load(slice(server, 'const IMPORTANT', 'async function pushTo'), ['pushAllowed', 'snip', 'pushText']);
  eq('"important" skips likes', push.pushAllowed('important', 'like'), false); eq('"important" keeps replies and DMs', [push.pushAllowed('important', 'reply'), push.pushAllowed('important', 'dm')], [true, true]);
  eq('"all" sends likes', push.pushAllowed('all', 'like'), true); eq('follow text', push.pushText('follow', 'Bob', ''), ['Bob followed you', '']);
  eq('note text is anonymous', push.pushText('note', 'Bob', 'ctx')[0], 'Readers added context to your post'); eq('unknown type', push.pushText('nope', 'Bob', ''), undefined);
  const long = push.snip('x'.repeat(300)); eq('snippet is trimmed to 100', [long.length, long.endsWith('…')], [100, true]); eq('whitespace collapsed', push.snip('a \n\n  b'), 'a b');

  // ---- service worker ----
  const swSrc = read('public/sw.js');
  const runSw = (openClients) => {
    const handlers = {}, shown = [], opened = [], ctx = { URL, self: { location: { origin: 'https://x.test' }, skipWaiting() {}, addEventListener: (t, fn) => (handlers[t] = fn), registration: { showNotification: async (title, o) => shown.push([title, o]) }, clients: { claim: async () => {}, matchAll: async () => openClients, openWindow: async (u) => opened.push(u) } } };
    vm.createContext(ctx); vm.runInContext(swSrc, ctx); return { handlers, shown, opened };
  };
  const ev = (extra) => { const ps = []; return { ps, waitUntil: (p) => ps.push(p), ...extra }; };
  let sw = runSw([]), e = ev({ data: { json: () => ({ title: 'Bob', body: 'hi', url: '/#/messages/9', tag: 'dm:9' }) } }); sw.handlers.push(e); await Promise.all(e.ps);
  eq('push shows a notification', [sw.shown.length, sw.shown[0][0], sw.shown[0][1].body, sw.shown[0][1].data.url, sw.shown[0][1].renotify], [1, 'Bob', 'hi', '/#/messages/9', true]);
  sw = runSw([{ visibilityState: 'visible', focused: true }]); e = ev({ data: { json: () => ({ title: 'x' }) } }); sw.handlers.push(e); await Promise.all(e.ps); eq('no popup while the app is open and focused', sw.shown.length, 0);
  sw = runSw([{ visibilityState: 'hidden', focused: false }]); e = ev({ data: { json: () => ({ title: 'x' }) } }); sw.handlers.push(e); await Promise.all(e.ps); eq('popup when the app is in the background', sw.shown.length, 1);
  sw = runSw([]); e = ev({ data: { json: () => { throw new Error('not json'); } } }); sw.handlers.push(e); await Promise.all(e.ps); eq('bad payload falls back to a default title', sw.shown[0][0], 'Unvia');
  let focused = 0, navigated = ''; sw = runSw([{ url: 'https://x.test/#/', focus: async () => focused++, navigate: async (u) => (navigated = u) }]);
  e = ev({ notification: { close() {}, data: { url: '/#/p/7' } } }); sw.handlers.notificationclick(e); await Promise.all(e.ps); eq('tap focuses the open window and navigates', [focused, navigated], [1, 'https://x.test/#/p/7']);
  sw = runSw([]); e = ev({ notification: { close() {}, data: { url: '/#/p/7' } } }); sw.handlers.notificationclick(e); await Promise.all(e.ps); eq('tap opens a window when none is open', sw.opened, ['https://x.test/#/p/7']);
  sw = runSw([{ url: 'https://evil.test/', focus: async () => {} }]); e = ev({ notification: { close() {}, data: { url: 'https://evil.test/phish' } } }); sw.handlers.notificationclick(e); await Promise.all(e.ps);
  eq('a tap never reuses a window from another site', sw.opened.length, 1);

  // ---- build + PWA setup ----
  const pkg = JSON.parse(read('package.json')), man = JSON.parse(read('public/manifest.webmanifest')), vc = JSON.parse(read('vercel.json'));
  eq('css build script', /tailwindcss .*src\/input\.css.*public\/tailwind\.css.*--minify/.test(pkg.scripts['build:css']), true);
  eq('tailwind pinned to v3 (matches the old CDN look)', /^~?3\.4/.test(pkg.devDependencies.tailwindcss), true); eq('web-push is optional', !!pkg.optionalDependencies['web-push'] && !pkg.dependencies['web-push'], true);
  eq('native builds compile css first', [pkg.scripts.android, pkg.scripts.ios].every((s) => s.startsWith('npm run build:css')), true);
  eq('vercel builds css', [vc.buildCommand, vc.outputDirectory], ['npm run build:css', 'public']); eq('service worker is never cached', JSON.stringify(vc.headers).includes('no-cache') && JSON.stringify(vc.headers).includes('/sw.js'), true);
  eq('tailwind scans the app html', read('tailwind.config.js').includes("./public/**/*.html"), true); eq('css entry has the three layers', ['base', 'components', 'utilities'].every((l) => read('src/input.css').includes(`@tailwind ${l};`)), true);
  eq('compiled css is git-ignored (built on deploy)', read('.gitignore').includes('public/tailwind.css'), true);
  eq('html uses the compiled css with a CDN fallback', html.includes('href="/tailwind.css"') && html.includes("addEventListener('error'") && html.includes('cdn.tailwindcss.com'), true);
  eq('html links the manifest and touch icon', html.includes('rel="manifest"') && html.includes('rel="apple-touch-icon"'), true);
  const png = (f) => { const b = fs.readFileSync(path.join(root, 'public', f)); return [b.subarray(1, 4).toString(), b.readUInt32BE(16), b.readUInt32BE(20)]; };
  for (const i of man.icons) eq('icon ' + i.src, png(i.src.slice(1)), ['PNG', ...i.sizes.split('x').map(Number)]);
  eq('touch icon is 180px', png('apple-touch-icon.png'), ['PNG', 180, 180]); eq('manifest basics', [man.display, man.start_url, man.icons.some((i) => i.purpose === 'maskable')], ['standalone', '/', true]);
  eq('server refuses the default secret in production', server.includes('JWT_SECRET must be set') && server.includes('X-Content-Type-Options'), true);
  console.log(fails ? `${fails} of ${total} FAILED` : `all ${total} hardening checks passed`); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('ERROR', e.stack); process.exit(2); });
