// Two-factor setup dialogs.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

// two-factor setup: QR code (library loaded only when needed) + manual key
let qrP; const loadQR = () => (qrP ||= new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = ok; s.onerror = () => { qrP = null; no(); }; document.head.append(s); }));

async function tfaStep2(r) {
  openDlg(`<form id="t2f" class="space-y-3 p-6"><h2 class="text-2xl font-extrabold">Set up authenticator</h2><p class="text-sm text-zinc-400">Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password…), then enter the 6-digit code it shows.</p><div class="qr mx-auto grid h-[184px] w-[184px] place-items-center rounded-lg bg-[#fff] p-1 text-center text-xs text-zinc-500">Loading…</div><p class="text-center text-xs text-zinc-500">Can’t scan? Enter this key manually:<br><code class="select-all break-all font-mono text-sm text-zinc-100">${esc(r.secret)}</code></p><input name="code" required inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" class="${inp} text-center text-xl tracking-widest"><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-sky-500 py-2.5 font-bold text-white">Turn on</button></form>`);
  try { await loadQR(); const el = dlg.querySelector('.qr'); el.textContent = ''; new QRCode(el, { text: r.uri, width: 176, height: 176, correctLevel: QRCode.CorrectLevel.M }); }
  catch { const el = dlg.querySelector('.qr'); if (el) el.textContent = 'QR unavailable. Use the key below.'; }
}

let CODES = [];

const codesDlg = (codes) => { CODES = codes; openDlg(`<div class="space-y-3 p-6"><h2 class="text-2xl font-extrabold">Save your backup codes</h2><p class="text-sm text-zinc-400">If you lose your phone, each code works once to log in. They won’t be shown again.</p><div class="grid grid-cols-2 gap-2 rounded-xl bg-zinc-900 p-3 font-mono text-sm">${codes.map((c) => `<span>${c}</span>`).join('')}</div><div class="flex gap-2"><button data-copycodes class="flex-1 rounded-full border border-zinc-600 py-2 font-bold hover:bg-zinc-900">Copy</button><button data-codesdone class="flex-1 rounded-full bg-sky-500 py-2 font-bold text-white">I’ve saved them</button></div></div>`); };

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    if (d.tfa === 'on') return openDlg(`<form id="t1f" class="space-y-3 p-6"><h2 class="text-2xl font-extrabold">Turn on two-factor</h2><p class="text-sm text-zinc-400">Confirm your password to start setup.</p><input name="password" type="password" required placeholder="Password" class="${inp}"><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-sky-500 py-2.5 font-bold text-white">Continue</button></form>`);
    if (d.tfa === 'off') return openDlg(`<form id="t3f" class="space-y-3 p-6"><h2 class="text-2xl font-extrabold">Turn off two-factor</h2><input name="password" type="password" required placeholder="Password" class="${inp}"><input name="code" required autocomplete="one-time-code" placeholder="Authenticator or backup code" class="${inp}"><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-red-600 py-2.5 font-bold text-white">Turn off</button></form>`);
    if ('copycodes' in d) { navigator.clipboard?.writeText(CODES.join('\n')); return toast('Copied'); }
    if ('codesdone' in d) return dlg.close();
  }
  return NEXT;
});

// Form submits
SUBMIT.push(async ({ e, f, body }) => {
  {
    if (f.id === 't1f') { return void tfaStep2(await api('/me/2fa/setup', { method: 'POST', body })); }
    if (f.id === 't2f') { const d = await api('/me/2fa/enable', { method: 'POST', body }); token = localStorage.token = d.token; settings(pages['#/settings'].el, true); codesDlg(d.backup); }
    if (f.id === 't3f') { const d = await api('/me/2fa/disable', { method: 'POST', body }); token = localStorage.token = d.token; dlg.close(); toast('Two-factor turned off'); settings(pages['#/settings'].el, true); }
  }
  return NEXT;
});
