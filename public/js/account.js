// Password reset, email verification, follow requests.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

function forgotPage(v) {
  v.innerHTML = head('Reset your password') + `<form id="fgf" class="space-y-3 p-6"><p class="text-sm text-zinc-400">Enter your username, or the verified email on your account, and we’ll send you a reset link.</p><input name="identifier" required autocapitalize="none" placeholder="Username or email" class="${inp}"><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-sky-500 py-2.5 font-bold text-white">Send reset link</button><p class="text-xs text-zinc-500">Only accounts with a verified email can use this. If yours doesn’t have one, ask the site owner for a reset link.</p></form>`;
}

function resetPage(v, token) {
  v.innerHTML = head('Choose a new password') + `<form id="rsf" data-token="${esc(token)}" class="space-y-3 p-6"><input name="password" type="password" required minlength="8" placeholder="New password (8+ characters)" class="${inp}"><input name="confirm" type="password" required minlength="8" placeholder="Confirm new password" class="${inp}"><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-sky-500 py-2.5 font-bold text-white">Update password</button></form>`;
}

async function verifyPage(v, token) {
  v.innerHTML = head('Confirm email') + '<p class="p-10 text-center text-zinc-400">Confirming…</p>';
  try {
    const d = await api('/auth/verify', { method: 'POST', body: JSON.stringify({ token }) });
    if (me) { me.email = d.email; me.emailVerified = true; me.pendingEmail = null; localStorage.me = JSON.stringify(me); }
    v.innerHTML = head('Confirm email') + `<div class="p-10 text-center"><p class="text-xl font-bold">Email confirmed ✓</p><p class="mt-2 text-zinc-400">${esc(d.email)} is verified. You can use it to reset your password.</p><a href="#/" class="mt-4 inline-block rounded-full bg-sky-500 px-6 py-2 font-bold text-white">Back to Unvia</a></div>`;
  } catch (x) { v.innerHTML = head('Confirm email') + `<p class="p-10 text-center text-red-400">${esc(x.message)}</p>`; }
}

async function followRequests(v, pg) {
  if (!me) return void (v.innerHTML = head('Follow requests') + guest());
  v.innerHTML = head('Follow requests') + `<div class="rl">${skel}</div>`;
  const l = v.querySelector('.rl'); let sig = null;
  const load = async () => {
    try {
      const us = await api('/follow-requests'), nsig = us.map((u) => u.id).join(); if (nsig === sig) return; sig = nsig;
      l.innerHTML = us.length ? us.map((u) => `<div class="flex items-center gap-2 px-4 py-3" data-fr="${esc(u.username)}">${av(u)}<a href="#/u/${esc(u.username)}" class="min-w-0 flex-1 leading-tight"><div class="truncate font-bold hover:underline">${esc(u.name)}${bdg(u)}</div><div class="truncate text-sm text-zinc-500">@${esc(u.username)}</div></a><button data-fract="approve" data-fru="${esc(u.username)}" class="rounded-full bg-sky-500 px-4 py-1.5 text-sm font-bold text-white hover:bg-sky-400">Approve</button><button data-fract="deny" data-fru="${esc(u.username)}" class="${btnO}">Deny</button></div>`).join('') : '<p class="p-10 text-center text-zinc-500">No pending follow requests.</p>';
    } catch (x) { l.innerHTML = `<p class="p-8 text-center text-red-400">${esc(x.message)}</p>`; }
  };
  await load(); pg.refresh = load;
}

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    if ('forgot' in d) { dlg.close(); return void (location.hash = '#/forgot'); }
    if (d.fract) { await api(`/follow-requests/${d.fru}/${d.fract}`, { method: 'POST' }); collapse(b.closest('[data-fr]')); return toast(d.fract === 'approve' ? 'Approved' : 'Request denied'); }
  }
  return NEXT;
});

// Form submits
SUBMIT.push(async ({ e, f, body }) => {
  {
    if (f.id === 'af') { const d = await api('/auth/' + (reg ? 'register' : 'login'), { method: 'POST', body }); if (d.needs2fa) return void openDlg(`<form id="tf" data-ticket="${esc(d.ticket)}" class="space-y-3 p-6"><h2 class="text-2xl font-extrabold">Two-factor authentication</h2><p class="text-sm text-zinc-400">Enter the 6-digit code from your authenticator app, or one of your backup codes.</p><input name="code" required autocomplete="one-time-code" placeholder="123456" class="${inp} text-center text-xl tracking-widest"><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-sky-500 py-2.5 font-bold text-white">Verify</button></form>`); localStorage.token = d.token; localStorage.me = JSON.stringify(d.user); location.reload(); }
    if (f.id === 'tf') { const d = await api('/auth/2fa', { method: 'POST', body: JSON.stringify({ ticket: f.dataset.ticket, code: f.code.value }) }); localStorage.token = d.token; localStorage.me = JSON.stringify(d.user); location.reload(); }
    if (f.id === 'fgf') { await api('/auth/forgot', { method: 'POST', body }); f.innerHTML = '<p class="py-6 text-center">If that account has a verified email, a reset link is on its way. It’s valid for 1 hour.</p>'; }
    if (f.id === 'rsf') {
      const x = Object.fromEntries(new FormData(f)); if (x.password !== x.confirm) throw new Error('Passwords don’t match');
      await api('/auth/reset', { method: 'POST', body: JSON.stringify({ token: f.dataset.token, password: x.password }) });
      f.innerHTML = '<div class="py-6 text-center"><p class="text-xl font-bold">Password updated ✓</p><p class="mt-1 text-zinc-400">You can log in with your new password now.</p><button type="button" data-login class="mt-4 rounded-full bg-sky-500 px-6 py-2 font-bold text-white">Log in</button></div>';
    }
  }
  return NEXT;
});
