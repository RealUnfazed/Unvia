// Email through Resend.

// Email via Resend's HTTP API. Without RESEND_API_KEY the message is logged instead (and the owner can use admin reset links).
const mailReady = () => !!process.env.RESEND_API_KEY;

async function sendMail(to, subject, text, html) {
  if (!mailReady()) { console.log(`[mail not configured] To: ${to}\nSubject: ${subject}\n${text}`); return false; }
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.MAIL_FROM || 'Unvia <onboarding@resend.dev>', to: [to], subject, text, html }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) console.log('[mail failed]', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) { console.log('[mail error]', e.message); return false; }
}

const mailHtml = (title, body, link, cta) => `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px"><h2>${title}</h2><p>${body}</p><p><a href="${link}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700">${cta}</a></p><p style="color:#71717a;font-size:13px">If the button doesn’t work, paste this into your browser:<br>${link}</p></div>`;

const APP = (req) => process.env.APP_URL || `${/^(localhost|127\.)/.test(req.headers.host || '') ? 'http' : 'https'}://${req.headers.host}`;

module.exports = { APP, mailHtml, mailReady, sendMail };
