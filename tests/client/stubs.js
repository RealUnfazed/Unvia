// ---- minimal browser stubs ----
const NOP = function () {};
const KNOWN_NULL = ['nextElementSibling','previousElementSibling','parentElement','parentNode','lastElementChild','firstElementChild','form','nextSibling'];
class El {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.dataset = {}; this.style = {}; this._q = new Map(); this.children = []; this.files = [];
    this.innerHTML = ''; this.textContent = ''; this.value = ''; this.hidden = false; this.checked = false; this.open = false; this.disabled = false;
    this.scrollHeight = 0; this.offsetHeight = 0; this.selectionStart = 0; this.selectionEnd = 0; this.className = '';
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    return new Proxy(this, {
      get: (t, k) => (k in t ? t[k] : k === 'then' || KNOWN_NULL.includes(k) ? (k === 'then' ? undefined : null) : typeof k === 'symbol' ? undefined : (t[k] = function () { return new El(); })),
      set: (t, k, v) => ((t[k] = v), true),
    });
  }
  querySelector(s) { if (!this._q.has(s)) this._q.set(s, new El()); return this._q.get(s); }
  querySelectorAll() { return []; }
  closest() { return null; }
  addEventListener() {}
  contains() { return false; }
}
const listeners = {};
const document = new El('document');
document.documentElement = new El('html'); document.body = new El('body'); document.head = new El('head');
document.createElement = (t) => new El(t); document.hidden = false;
document.addEventListener = (t, fn) => (listeners[t] ||= []).push(fn);
const win = globalThis; globalThis.window = win; globalThis.document = document;
const mkStore = () => ({ removeItem(k) { delete this[k]; }, clear() { for (const k of Object.keys(this)) if (typeof this[k] !== 'function') delete this[k]; } });
globalThis.localStorage = mkStore(); globalThis.sessionStorage = mkStore();
globalThis.location = { hash: '#/', reload() {}, href: 'http://localhost/#/' };
globalThis.history = { length: 2, back() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
class IO { constructor(cb) { IO.all.push(cb); } observe() {} disconnect() {} } IO.all = []; globalThis.IntersectionObserver = IO; globalThis.MutationObserver = IO;
globalThis.scrollTo = NOP; globalThis.scrollY = 0; globalThis.innerHeight = 800; globalThis.requestAnimationFrame = NOP; globalThis.cancelAnimationFrame = NOP;
globalThis.setInterval = () => 0; globalThis.clearInterval = NOP; globalThis.addEventListener = NOP;
globalThis.confirm = () => true; globalThis.prompt = () => 'Renamed'; globalThis.alert = NOP;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const _timeouts = []; globalThis.setTimeout = (fn) => { _timeouts.push(fn); return 0; }; globalThis.clearTimeout = NOP;
// FormData that also accepts our fake forms
const RealFD = FormData;
globalThis.FormData = class extends RealFD { constructor(f) { super(); if (f && f._fields) for (const [k, v] of Object.entries(f._fields)) this.append(k, v); } };
globalThis.createImageBitmap = async () => ({ width: 10, height: 10 });
globalThis.QRCode = class { constructor() {} }; globalThis.QRCode.CorrectLevel = { M: 1 };
// fetch mock: filled by the test file
globalThis.MOCK = []; globalThis.CALLS = [];
globalThis.fetch = async (url, o = {}) => {
  const u = String(url).replace(/^https?:\/\/[^/]+/, ''), method = (o.method || 'GET').toUpperCase();
  CALLS.push(method + ' ' + u);
  for (const [m, re, data] of MOCK) if ((m === '*' || m === method) && re.test(u)) { const d = typeof data === 'function' ? data(u, o) : data; return { ok: true, status: 200, json: async () => d }; }
  return { ok: true, status: 200, json: async () => ({}) };
};
process.on('unhandledRejection', (e) => { console.log('UNHANDLED:', e.message); console.log('last calls:', CALLS.slice(-6)); console.log('hash:', location.hash); process.exit(3); });
