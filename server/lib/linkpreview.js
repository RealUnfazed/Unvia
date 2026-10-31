// Link preview cards (SSRF-safe fetching).
const dns = require('dns').promises;
const net = require('net');

const isPrivateIp = (ip) => {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::' || /^f[cd]/.test(l) || /^fe[89ab]/.test(l)) return true;
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivateIp(m[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
};

async function safeGet(url, hops = 0) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || (u.port && !['80', '443'].includes(u.port))) throw new Error('bad url');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((x) => isPrivateIp(x.address))) throw new Error('blocked');
  const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(2500), headers: { 'user-agent': 'UnviaBot/1.0 (link preview)', accept: 'text/html' } });
  const loc = r.headers.get('location');
  if (r.status >= 300 && r.status < 400 && loc && hops < 3) return safeGet(new URL(loc, u).href, hops + 1);
  return { r, url: u.href };
}

async function fetchPreview(url) {
  const { r, url: finalUrl } = await safeGet(url);
  if (!r.ok || !r.body || !(r.headers.get('content-type') || '').includes('text/html')) return undefined;
  const reader = r.body.getReader(), dec = new TextDecoder(); let html = '', size = 0;
  while (size < 300000) { const { done, value } = await reader.read(); if (done) break; size += value.length; html += dec.decode(value, { stream: true }); if (/<\/head>/i.test(html)) break; }
  reader.cancel().catch(() => {});
  const ent = (t) => (t || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  const meta = (k) => { const t = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, 'i')); const c = t && t[0].match(/content=["']([^"']*)["']/i); return c ? ent(c[1]) : ''; };
  const title = meta('og:title') || meta('twitter:title') || ent((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]);
  if (!title) return undefined;
  let image = meta('og:image') || meta('twitter:image');
  try { image = image ? new URL(image, finalUrl).href : ''; if (!/^https?:/.test(image)) image = ''; } catch { image = ''; }
  return { url, title: title.slice(0, 120), description: (meta('og:description') || meta('description')).slice(0, 200), image, site: (meta('og:site_name') || new URL(finalUrl).hostname.replace(/^www\./, '')).slice(0, 60) };
}

async function linkPreview(text) {
  const m = (text || '').match(/https?:\/\/[^\s<>"']+/i); if (!m) return undefined;
  try { return await Promise.race([fetchPreview(m[0].replace(/[.,!?;:)\]]+$/, '')), new Promise((r) => setTimeout(() => r(undefined), 3500))]); } catch { return undefined; }
}

module.exports = { fetchPreview, isPrivateIp, linkPreview, safeGet };
