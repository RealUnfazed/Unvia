// Rate-limit counters and rules.
const { Rate } = require('../models');

// Counters live in MongoDB (fixed windows, auto-expiring) because serverless instances share no memory. A cheap in-memory
// guard per instance absorbs bursts first. If the counter store fails, requests are allowed rather than taking the site down.
const clientIp = (req) => String(req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown').slice(0, 64);

async function hit(store, rule, key, now = Date.now()) {
  const win = Math.floor(now / (rule.sec * 1000)), end = (win + 1) * rule.sec * 1000, n = await store(`${rule.name}:${key}:${win}`, new Date(end + 60000));
  return { ok: n <= rule.max, retry: Math.max(1, Math.ceil((end - now) / 1000)), n };
}

const dbStore = async (id, exp) => {
  for (let i = 0; i < 2; i++) { try { return (await Rate.findOneAndUpdate({ _id: id }, { $inc: { n: 1 }, $setOnInsert: { exp } }, { upsert: true, new: true })).n; } catch (e) { if (e.code !== 11000) throw e; } }
  return 1;
};

const RULES = [ // [method, path, name, max requests, window seconds, counted per ip|user]
  ['POST', /^\/api\/auth\/login$/, 'login', 20, 600, 'ip'], ['POST', /^\/api\/auth\/2fa$/, 'tfa', 20, 600, 'ip'], ['POST', /^\/api\/auth\/register$/, 'register', 5, 3600, 'ip'],
  ['POST', /^\/api\/auth\/(forgot|reset)$/, 'recover', 10, 3600, 'ip'], ['POST', /^\/api\/me\/(password|email)$/, 'acct', 10, 3600, 'user'], ['DELETE', /^\/api\/me$/, 'acctdel', 5, 3600, 'user'],
  ['PATCH', /^\/api\/me$/, 'profile', 20, 3600, 'user'], ['GET', /^\/api\/me\/export$/, 'export', 3, 3600, 'user'],
  ['POST', /^\/api\/posts$/, 'post', 40, 600, 'user'], ['POST', /^\/api\/posts\/[a-f0-9]{24}\/(like|repost|bookmark|vote)$/, 'react', 300, 600, 'user'],
  ['POST', /^\/api\/users\/[^/]+\/(follow|block|mute)$/, 'follow', 100, 600, 'user'], ['POST', /^\/api\/posts\/[a-f0-9]{24}\/notes$/, 'note', 20, 3600, 'user'], ['POST', /^\/api\/notes\/[a-f0-9]{24}\/rate$/, 'noterate', 200, 3600, 'user'],
  ['POST', /^\/api\/conversations\/[a-f0-9]{24}\/messages$/, 'dm', 60, 60, 'user'], ['POST', /^\/api\/conversations$/, 'newdm', 20, 3600, 'user'], ['POST', /^\/api\/report$/, 'report', 20, 3600, 'user'],
  ['POST', /^\/api\/(communities|lists)$/, 'create', 10, 3600, 'user'], ['POST', /^\/api\/views$/, 'views', 120, 60, 'ip'],
  ['GET', /^\/api\/(search|mentions|explore|gifs)/, 'search', 90, 60, 'ip'], ['POST', /^\/api\/push\/test$/, 'pushtest', 5, 600, 'user'],
];

const mem = new Map();

const memAllow = (ip, max = 900) => { const now = Date.now(), e = mem.get(ip); if (!e || now - e.t > 60000) { if (mem.size > 5000) mem.clear(); mem.set(ip, { n: 1, t: now }); return true; } return ++e.n <= max; };

const tooMany = (res, s) => res.set('Retry-After', String(s)).status(429).json({ error: `Too many requests. Try again in ${s < 90 ? s + ' seconds' : Math.ceil(s / 60) + ' minutes'}.` });

module.exports = { RULES, clientIp, dbStore, hit, mem, memAllow, tooMany };
