// Login tokens, two-factor codes, lockout.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const { User } = require('../models');

// `sv` (session version) is bumped on password change / reset / 2FA changes / "log out everywhere", which invalidates older tokens.
const sign = (u) => jwt.sign({ id: u.id, sv: u.sv || 0 }, JWT_SECRET, { expiresIn: '30d' });

const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');

const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// TOTP (RFC 6238) with Node's crypto, so no extra dependency
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const b32enc = (buf) => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };

const b32dec = (str) => { let bits = ''; for (const c of str.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(c); if (v >= 0) bits += v.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };

const hotp = (secret, counter) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter)); const h = crypto.createHmac('sha1', b32dec(secret)).update(b).digest(), o = h[19] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };

const totpOk = (secret, code) => /^\d{6}$/.test(String(code).trim()) && [-1, 0, 1].some((d) => safeEq(hotp(secret, Math.floor(Date.now() / 30000) + d), String(code).trim()));

// Repeated wrong passwords/codes lock the account for 15 minutes (per-IP limits come in the production phase)
async function failLogin(u) { const n = (u.fails || 0) + 1; await User.updateOne({ _id: u._id }, n >= 10 ? { fails: 0, lockUntil: new Date(Date.now() + 15 * 60000) } : { fails: n }); }

const okLogin = async (u) => { if (u.fails || u.lockUntil) await User.updateOne({ _id: u._id }, { $unset: { fails: 1, lockUntil: 1 } }); };

async function useSecondFactor(u, raw) { // authenticator code, or a one-time backup code
  const code = String(raw || '').trim();
  if (/^\d{6}$/.test(code)) return totpOk(u.twofa.secret, code);
  const h = sha(code.replace(/[^a-f0-9]/gi, '').toLowerCase());
  return (await User.updateOne({ _id: u._id, 'twofa.backup': h }, { $pull: { 'twofa.backup': h } })).modifiedCount === 1;
}

module.exports = { B32, b32dec, b32enc, failLogin, hotp, okLogin, safeEq, sha, sign, totpOk, useSecondFactor };
