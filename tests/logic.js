// Pure-logic tests. Functions are pulled straight out of the source files, so there is no copy to drift out of date.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), net = require('net');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'), client = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const need = (src, s) => { const i = src.indexOf(s); if (i < 0) throw new Error(`test anchor not found: ${s}`); return i; };
const slice = (src, from, to) => { const a = need(src, from); return src.slice(a, need(src.slice(a), to) + a); };
const line = (src, from) => { const a = need(src, from); return src.slice(a, src.indexOf('\n', a)); };
const load = (code, names, ctx = {}) => { const sb = { crypto, net, Buffer, URL, ...ctx }; vm.createContext(sb); vm.runInContext(code + `\n;globalThis.__o={${names.join(',')}};`, sb); return sb.__o; };
let fails = 0, total = 0;
const eq = (n, g, e) => { total++; if (JSON.stringify(g) !== JSON.stringify(e)) { fails++; console.log('  FAIL', n, JSON.stringify(g), 'expected', JSON.stringify(e)); } };

// link-preview SSRF guard
const { isPrivateIp } = load(slice(server, 'const isPrivateIp', 'async function safeGet'), ['isPrivateIp']);
for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '172.31.255.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) eq('private ' + ip, isPrivateIp(ip), true);
for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700::1111']) eq('public ' + ip, isPrivateIp(ip), false);

// TOTP against RFC 4226 / 6238 vectors
const t = load(slice(server, 'const sha = (x)', '// Repeated wrong passwords'), ['sha', 'safeEq', 'b32enc', 'b32dec', 'hotp', 'totpOk']);
const secret = t.b32enc(Buffer.from('12345678901234567890'));
eq('base32', secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'].forEach((v, i) => eq('HOTP ' + i, t.hotp(secret, i), v));
eq('TOTP 59s', t.hotp(secret, 1), '287082'); eq('TOTP 1111111109', t.hotp(secret, Math.floor(1111111109 / 30)), '081804'); eq('TOTP 1234567890', t.hotp(secret, Math.floor(1234567890 / 30)), '005924');
const now = Math.floor(Date.now() / 30000);
eq('current window', t.totpOk(secret, t.hotp(secret, now)), true); eq('previous window', t.totpOk(secret, t.hotp(secret, now - 1)), true); eq('2 windows old', t.totpOk(secret, t.hotp(secret, now - 2)), false);
eq('letters rejected', t.totpOk(secret, 'abcdef'), false); eq('short code rejected', t.totpOk(secret, '12345'), false); eq('sha256', t.sha('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

// direct messages: unread, requests, visibility
const dm = load([line(server, 'const has = (a, id) =>'), line(server, 'const pub = '), slice(server, 'const readOf = ', 'async function markRead'), slice(server, 'const convShape = ', 'async function myConv'), slice(server, '// is this chat visible to me', "app.get('/api/conversations', auth")].join('\n'), ['convShape', 'convVisible']);
const me = { id: 'A' }, U = (id, n) => ({ _id: id, id, name: n, username: n.toLowerCase() }), T = (n) => new Date(2026, 0, 1, 12, n);
const c = { id: 'c1', group: false, members: [U('A', 'Ann'), U('B', 'Bob')], reads: [{ u: 'A', at: T(1) }], lastAt: T(5), lastFrom: 'B', lastText: 'hi' };
eq('dm unread', dm.convShape(c, me).unread, true); c.reads = [{ u: 'A', at: T(6) }]; eq('dm read clears unread', dm.convShape(c, me).unread, false);
c.lastFrom = 'A'; c.reads = [{ u: 'A', at: T(1) }]; eq('own message not unread', dm.convShape(c, me).unread, false);
c.lastFrom = 'B'; c.requestFor = 'A'; eq('request for me', dm.convShape(c, me).request, true); c.requestFor = 'B'; eq('pending for sender', dm.convShape(c, me).pending, true);
const g = { id: 'g', group: true, members: [U('A', 'Ann'), U('B', 'Bob'), U('C', 'Cy')], reads: [], lastAt: T(2), lastFrom: 'B' };
eq('group auto name', dm.convShape(g, me).name, 'Bob, Cy'); g.name = 'Crew'; eq('group custom name', dm.convShape(g, me).name, 'Crew');
eq('blocked hides 1:1', dm.convVisible({ group: false, members: [U('A', 'Ann'), U('B', 'Bob')], reads: [], lastAt: T(2) }, me, new Set(['B'])), false);
eq('blocked member does not hide a group', dm.convVisible({ group: true, members: [U('A', 'Ann'), U('B', 'Bob')], reads: [], lastAt: T(2) }, me, new Set(['B'])), true);
const cl = { group: false, members: [U('A', 'Ann'), U('C', 'Cy')], reads: [{ u: 'A', at: T(3), clr: T(3) }], lastAt: T(2) };
eq('cleared chat hidden', dm.convVisible(cl, me, new Set()), false); cl.lastAt = T(9); eq('new message revives it', dm.convVisible(cl, me, new Set()), true);

// topics and community notes
const tp = load(slice(server, 'const TOPICS = [', '// Request-to-join communities') + '\nconst NOTE_MIN = 5;\n' + line(server, 'const noteScore = '), ['topicsOf', 'noteScore']);
eq('topic by word', tp.topicsOf('Just shipped a new JavaScript library'), ['technology']); eq('topic by hashtag', tp.topicsOf('great #football match tonight'), ['sports']);
eq('no substring matches', tp.topicsOf('smartphone fantastic'), []); eq('topics capped at 3', tp.topicsOf('football music game science art food travel').length, 3);
const R = (...v) => ({ ratings: v.map((x, i) => ({ u: i, v: x })) });
eq('note needs enough ratings', tp.noteScore(R(2, 2, 2, 2)).status, 'proposed'); eq('5 helpful -> shown', tp.noteScore(R(2, 2, 2, 2, 2)).status, 'helpful');
eq('"somewhat" alone is not enough', tp.noteScore(R(1, 1, 1, 1, 1)).status, 'proposed'); eq('mostly unhelpful', tp.noteScore(R(0, 0, 0, 0, 2)).status, 'unhelpful');

// client helpers: URL linkifier, muted words, count formatting
const esc = (x) => (x || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const { urlify } = load(slice(client, 'const urlify', 'const linkify'), ['urlify']);
const lk = urlify(esc('see https://example.com/a?x=1&y=2, and (https://foo.dev/bar). <script>alert(1)</script>'));
eq('urlify links + trims punctuation', lk.includes('href="https://example.com/a?x=1&amp;y=2"') && lk.includes('href="https://foo.dev/bar"') && !lk.includes('<script>'), true);
const mc = { me: { id: 'me', mutedWords: ['spoiler', '#election', 'c++', 'bad news'] } }, mw = load(slice(client, "let _mw = '', _mr = [];", '// ---------- settings ----------'), ['muted'], mc);
const P = (text, id = 'o') => ({ text, author: { id } });
eq('muted word', mw.muted(P('big spoiler ahead')), true); eq('muted not inside other words', mw.muted(P('spoilerfree')), false); eq('muted hashtag', mw.muted(P('on #election tonight')), true);
eq('muted special chars', mw.muted(P('I love c++')), true); eq('muted phrase', mw.muted(P('some bad news')), true); eq('own posts never muted', mw.muted(P('spoiler', 'me')), false);
const { fmt } = load(slice(client, 'function fmt(n) {', '\n}\n') + '\n}', ['fmt']);
eq('fmt 371100', fmt(371100), '371K'); eq('fmt 37100', fmt(37100), '37.1K'); eq('fmt 1787778', fmt(1787778), '1.8M'); eq('fmt 999', fmt(999), '999'); eq('fmt rounds into next unit', fmt(999500), '1M'); eq('fmt 12M', fmt(12000000), '12M');

console.log(fails ? `${fails} of ${total} FAILED` : `all ${total} logic checks passed`);
process.exit(fails ? 1 : 0);
