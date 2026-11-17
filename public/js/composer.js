// The composer: images, polls, emoji, @mentions, GIF picker, scheduling, drafts-on-close, posting.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

const RL = { '': '🌐 Everyone can reply', following: '👥 Accounts you follow can reply', mentioned: '@ Only mentioned accounts can reply' };

const EMO = {
  Smileys: '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😛 😜 🤪 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😓 🤗 🤔 🤭 🤫 😶 😐 😑 😬 🙄 😯 😮 😲 🥱 😴 🤤 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒'.split(' '),
  Gestures: '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖖 👋 🤝 👏 🙌 👐 🙏 💪 🫶 👀 🧠'.split(' '),
  'Hearts & symbols': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 💕 💞 💓 💗 💖 💘 💝 ✨ ⭐ 🌟 💫 🔥 💯 ✅ ❌ ⚡ 💥 🎉 🎊'.split(' '),
  'Nature & food': '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦄 🐝 🦋 🌸 🌹 🌻 🌈 ☀️ 🌙 ⛅ ❄️ 🍎 🍕 🍔 🍟 🌮 🍣 🍩 🍪 🎂 🍫 ☕ 🍺 🍷'.split(' '),
  Objects: '⚽ 🏀 🏈 🎮 🎧 🎵 🎬 📷 💻 📱 💡 📚 ✈️ 🚗 🚀 🏠 🎁 💰 🔑 ⏰ 🌍'.split(' '),
};

const emoHTML = () => Object.entries(EMO).map(([k, l]) => `<div class="px-1 pt-1 text-xs font-bold text-zinc-500">${k}</div><div class="flex flex-wrap">${l.map((e) => `<button type="button" data-e="${e}" class="h-9 w-9 rounded-lg text-xl hover:bg-zinc-800">${e}</button>`).join('')}</div>`).join('');

function renderPv(c) {
  const pv = c.querySelector('.pv'), files = c._files || [], gif = c.dataset.gif;
  const items = gif ? [{ src: gif, k: 'gif' }] : files.map((f, i) => ({ src: f.url, k: i }));
  c.querySelector('[data-sens]')?.classList.toggle('hidden', !items.length);
  pv.className = `pv mb-2 grid gap-2 ${items.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}${items.length ? '' : ' hidden'}`;
  pv.innerHTML = items.map((it) => `<div class="drop relative"><img src="${esc(it.src)}" class="w-full rounded-2xl object-cover ${items.length > 1 ? 'h-40' : 'max-h-72'}"><button type="button" data-rmimg="${it.k}" aria-label="Remove" class="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-[rgba(0,0,0,.7)] text-white hover:bg-[#000]">✕</button></div>`).join('');
}

function togglePoll(c, on = !c.dataset.pollon) {
  const pl = c.querySelector('.pl'); if (!pl) return;
  c.dataset.pollon = on ? '1' : ''; pl.classList.toggle('hidden', !on);
  if (on) { (c._files || []).forEach((f) => URL.revokeObjectURL(f.url)); c._files = []; delete c.dataset.gif; renderPv(c); }
  else { pl.querySelectorAll('[data-po]').forEach((i, n) => { i.value = ''; if (n > 1) i.classList.add('hidden'); }); pl.querySelector('[data-poadd]').classList.remove('hidden'); }
}

function resetComposer(c) {
  c.querySelector('textarea').value = ''; c.querySelector('.ct').textContent = 280;
  (c._files || []).forEach((f) => URL.revokeObjectURL(f.url)); c._files = []; delete c.dataset.gif; renderPv(c); togglePoll(c, false);
  const s = c.querySelector('.sch'); if (s) { s.classList.add('hidden'); s.querySelector('input').value = ''; }
  delete c.dataset.sens; c.querySelector('[data-sens]')?.classList.remove('text-amber-400', 'font-bold'); c.querySelector('.emo').classList.add('hidden'); c.querySelector('.sub').textContent = c.dataset.parent ? 'Reply' : 'Post';
  c.dataset.rl = ''; const rb = c.querySelector('[data-rlbtn]'); if (rb) rb.textContent = RL[''];
}

// Shrinks big photos in the browser so 4 of them fit under the host's request-size limit.
async function compress(f) {
  if (f.type === 'image/gif' || f.size < 700 * 1024) return f;
  try {
    const bm = await createImageBitmap(f), k = Math.min(1, 1600 / Math.max(bm.width, bm.height)), cv = document.createElement('canvas');
    cv.width = Math.round(bm.width * k); cv.height = Math.round(bm.height * k);
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bm, 0, 0, cv.width, cv.height);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < f.size ? new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f;
  } catch { return f; }
}

function pickMention(c, un) {
  const ta = c.querySelector('textarea'), pos = ta.selectionStart, before = ta.value.slice(0, pos).replace(/@(\w{1,15})$/, '@' + un + ' ');
  ta.value = before + ta.value.slice(pos); ta.selectionStart = ta.selectionEnd = before.length; c.querySelector('.mn').classList.add('hidden'); ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
}

const composer = (parent = '', quote = '', text = '', draft = '', community = '') => `<div class="cmp flex gap-3 p-4" data-parent="${parent}" data-quote="${quote}" data-draft="${draft}" data-community="${community}" data-rl="">${av(me)}<div class="relative min-w-0 flex-1">
  <textarea maxlength="280" rows="2" placeholder="${parent ? 'Post your reply' : quote ? 'Add a comment' : "What's happening?"}" class="w-full resize-none bg-transparent text-xl outline-none placeholder:text-zinc-500">${esc(text)}</textarea>
  <div class="mn absolute left-0 z-30 hidden w-64 overflow-hidden rounded-xl border border-zinc-800 bg-black shadow-xl"></div>
  <div class="pv mb-2 hidden"></div>
  ${parent ? '' : `<div class="pl mb-2 hidden space-y-2 rounded-2xl border border-zinc-800 p-3">${[1, 2, 3, 4].map((n) => `<input data-po maxlength="25" placeholder="Choice ${n}${n > 2 ? ' (optional)' : ''}" class="${inp} ${n > 2 ? 'hidden' : ''}">`).join('')}<div class="flex flex-wrap items-center justify-between gap-2 text-sm"><button type="button" data-poadd class="font-semibold text-sky-500 hover:text-sky-400">+ Add a choice</button><select data-pomin class="rounded bg-zinc-900 px-2 py-1 outline-none"><option value="60">1 hour</option><option value="1440" selected>1 day</option><option value="4320">3 days</option><option value="10080">7 days</option></select><button type="button" data-porm class="text-red-400 hover:text-red-300">Remove poll</button></div></div>`}
  ${quote && P[quote] ? quoteEmbed({ ...P[quote], id: '' }).replace('type="button" data-qlink=""', 'type="button" tabindex="-1"') : ''}
  <div class="emo mb-2 hidden max-h-48 overflow-y-auto rounded-2xl border border-zinc-800 p-2"></div>
  ${parent || quote ? '' : '<div class="sch mb-2 hidden"><div class="flex items-center gap-2 text-sm text-zinc-400"><span>Send on</span><input type="datetime-local" data-sched class="rounded bg-zinc-900 px-2 py-1 outline-none"></div></div>'}
  ${parent ? '' : `<button type="button" data-rlbtn class="mb-2 block text-sm font-semibold text-sky-500 hover:text-sky-400">${RL['']}</button>`}
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-800 pt-3 text-sm font-semibold text-sky-500">
    <label class="cursor-pointer hover:text-sky-400">Photo<input type="file" accept="image/*" multiple class="hidden"></label>
    <button type="button" data-gifopen class="rounded border border-sky-500 px-1.5 text-xs font-bold hover:bg-sky-500/10">GIF</button>
    ${parent ? '' : '<button type="button" data-pollbtn class="hover:text-sky-400">Poll</button>'}
    <button type="button" data-sens class="hidden hover:text-sky-400">Sensitive</button>
    <button type="button" data-emo class="text-base leading-none" aria-label="Emoji">😀</button>
    ${parent || quote ? '' : '<button type="button" data-schbtn class="hover:text-sky-400">Schedule</button>'}
    ${parent ? '' : '<button type="button" data-drafts class="text-zinc-400 hover:text-zinc-200">Drafts</button>'}
    <span class="ml-auto flex items-center gap-3"><span class="ct font-normal text-zinc-500">${280 - text.length}</span><button class="sub rounded-full bg-sky-500 px-5 py-1.5 font-bold text-white disabled:opacity-50">${parent ? 'Reply' : 'Post'}</button></span>
  </div></div></div>`;

async function gifs(q = '') {
  $('#gg').innerHTML = skel;
  try { const g = await api('/gifs?q=' + encodeURIComponent(q)); $('#gg').innerHTML = g.length ? g.map((x) => `<img src="${esc(x)}" data-gif="${esc(x)}" class="mb-2 w-full cursor-pointer rounded-lg transition hover:scale-[1.02] hover:opacity-90">`).join('') : '<p class="p-6 text-zinc-500">No GIFs found. Is GIPHY_API_KEY set on the server?</p>'; }
  catch (x) { $('#gg').innerHTML = `<p class="p-6 text-red-400">${esc(x.message)}</p>`; }
}

async function submit(c) {
  const b = c.querySelector('.sub'), ta = c.querySelector('textarea'), pid = c.dataset.parent, qid = c.dataset.quote, fd = new FormData(), files = c._files || [];
  fd.append('text', ta.value); if (pid) fd.append('parent', pid); if (qid) fd.append('quote', qid); if (c.dataset.community) fd.append('community', c.dataset.community);
  files.forEach((f) => fd.append('image', f.file));
  if (!files.length && c.dataset.gif) fd.append('gif', c.dataset.gif);
  if (c.dataset.pollon) fd.append('poll', JSON.stringify({ options: [...c.querySelectorAll('[data-po]')].map((i) => i.value.trim()).filter(Boolean), minutes: c.querySelector('[data-pomin]').value }));
  const sch = c.querySelector('[data-sched]')?.value; if (sch) fd.append('schedule', new Date(sch).toISOString());
  if (c.dataset.rl) fd.append('replyLimit', c.dataset.rl);
  if (c.dataset.sens && (files.length || c.dataset.gif)) fd.append('sensitive', '1');
  b.disabled = true;
  try {
    const p = await api('/posts', { method: 'POST', body: fd }), inDlg = !!c.closest('dialog');
    c.dataset.sent = '1'; if (c.dataset.draft) api('/drafts/' + c.dataset.draft, { method: 'DELETE' }).catch(() => {});
    resetComposer(c);
    if (inDlg) dlg.close();
    if (p.scheduled) return void toast('Scheduled for ' + new Date(p.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
    Object.keys(pages).forEach((k) => k !== cur && k !== '#/' && drop(k));
    if (pid) {
      if (P[pid]) { P[pid].replies++; rerender(pid); }
      const tc = inDlg ? document.querySelector(`.pg:not([hidden]) .cmp[data-parent="${pid}"]`) : c;
      if (tc) { tc.closest('.pg').querySelector('.nr')?.remove(); ins(tc.parentElement, 'afterend', card(p)); }
    } else { const f = c.dataset.community ? c.closest('.pg')?.querySelector('.f') : pages['#/']?.el.querySelector('.f'); if (f) ins(f, 'afterbegin', card(p)); }
    if (qid && P[qid]) { P[qid].reposts++; rerender(qid); }
    toast(pid ? 'Your reply was sent' : 'Your post was sent'); trend();
  } catch (x) { toast(x.message, 1); }
  finally { b.disabled = false; }
}

let mnT;

document.addEventListener('input', (e) => {
  const c = e.target.closest('.cmp'); if (!c) return;
  if (e.target.tagName === 'TEXTAREA') {
    const ta = e.target, n = 280 - ta.value.length, ct = c.querySelector('.ct'), box = c.querySelector('.mn');
    ct.textContent = n; ct.classList.toggle('text-red-400', n < 20);
    const m = ta.value.slice(0, ta.selectionStart).match(/(^|\s)@(\w{1,15})$/); clearTimeout(mnT);
    if (!m) return box.classList.add('hidden');
    mnT = setTimeout(async () => {
      try { const us = await api('/mentions?q=' + m[2]); box.innerHTML = us.map((u, i) => `<button type="button" data-mn="${esc(u.username)}" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-900 ${i ? '' : 'bg-zinc-900'}">${dot(u)}<span class="min-w-0 truncate"><b>${esc(u.name)}</b> <span class="text-zinc-500">@${esc(u.username)}</span></span></button>`).join(''); box.classList.toggle('hidden', !us.length); } catch {}
    }, 150);
  }
  if (e.target.matches('[data-sched]')) c.querySelector('.sub').textContent = e.target.value ? 'Schedule' : 'Post';
});

document.addEventListener('change', async (e) => {
  const c = e.target.closest('.cmp'); if (!c || e.target.type !== 'file') return;
  const list = [...e.target.files].filter((f) => f.type.startsWith('image/')); e.target.value = '';
  if (!list.length) return;
  togglePoll(c, false); delete c.dataset.gif; c._files = c._files || [];
  for (const f of list) {
    if (c._files.length >= 4) { toast('You can add up to 4 images', 1); break; }
    const file = await compress(f); c._files.push({ file, url: URL.createObjectURL(file) });
  }
  renderPv(c);
});

let gtm; document.addEventListener('input', (e) => { if (e.target.id === 'gq') { clearTimeout(gtm); gtm = setTimeout(() => gifs(e.target.value), 400); } });

document.addEventListener('keydown', (e) => { // arrow/enter/tab/esc through @mention suggestions
  const c = e.target.closest?.('.cmp'), box = c?.querySelector('.mn');
  if (!box || box.classList.contains('hidden') || e.target.tagName !== 'TEXTAREA') return;
  const items = [...box.children]; let i = items.findIndex((x) => x.classList.contains('bg-zinc-900'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[i]?.classList.remove('bg-zinc-900'); i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[i].classList.add('bg-zinc-900'); }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(c, items[Math.max(i, 0)].dataset.mn); }
  else if (e.key === 'Escape') { e.preventDefault(); box.classList.add('hidden'); }
});

// Closing the composer dialog with unsent text keeps it as a draft
dlg.addEventListener('close', () => {
  const c = dlg.querySelector('.cmp'); if (!c || !me || c.dataset.sent || c.dataset.parent || c.dataset.quote) return;
  const t = c.querySelector('textarea').value.trim(), id = c.dataset.draft; if (!t) return;
  c.dataset.sent = '1';
  api(id ? '/drafts/' + id : '/drafts', { method: id ? 'PUT' : 'POST', body: JSON.stringify({ text: t }) }).then(() => toast('Saved to drafts')).catch(() => {});
});

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    const gi = e.target.closest('img[data-gif]');
    if (gi) { gt.dataset.gif = gi.dataset.gif; (gt._files || []).forEach((f) => URL.revokeObjectURL(f.url)); gt._files = []; togglePoll(gt, false); renderPv(gt); return gd.close(); }
    if ('gifopen' in d) { gt = b.closest('.cmp'); gd.showModal(); return gifs(); }
    if (d.rmimg !== undefined) { const c = b.closest('.cmp'); if (d.rmimg === 'gif') delete c.dataset.gif; else { const [f] = c._files.splice(+d.rmimg, 1); URL.revokeObjectURL(f.url); } return renderPv(c); }
    if (d.mn) return pickMention(b.closest('.cmp'), d.mn);
    if (d.e) { const ta = b.closest('.cmp').querySelector('textarea'); if (ta.value.length + d.e.length > 280) return; ta.setRangeText(d.e, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); return ta.focus(); }
    if ('emo' in d) { const em = b.closest('.cmp').querySelector('.emo'); if (!em.innerHTML) em.innerHTML = emoHTML(); return em.classList.toggle('hidden'); }
    if ('pollbtn' in d) return togglePoll(b.closest('.cmp'));
    if ('porm' in d) return togglePoll(b.closest('.cmp'), false);
    if ('poadd' in d) { const hid = [...b.closest('.cmp').querySelectorAll('[data-po].hidden')]; hid[0]?.classList.remove('hidden'); if (hid.length <= 1) b.classList.add('hidden'); return; }
    if ('schbtn' in d) {
      const c = b.closest('.cmp'), s = c.querySelector('.sch'), i = s.querySelector('input'); s.classList.toggle('hidden');
      if (s.classList.contains('hidden')) { i.value = ''; c.querySelector('.sub').textContent = 'Post'; }
      else { i.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000 + 3600e3).toISOString().slice(0, 16); c.querySelector('.sub').textContent = 'Schedule'; }
      return;
    }
    if ('rlbtn' in d) { const c = b.closest('.cmp'), o = ['', 'following', 'mentioned'], nx = o[(o.indexOf(c.dataset.rl) + 1) % 3]; c.dataset.rl = nx; b.textContent = RL[nx]; return; }
    if ('sens' in d) { const c = b.closest('.cmp'); c.dataset.sens = c.dataset.sens ? '' : '1'; b.classList.toggle('text-amber-400', !!c.dataset.sens); b.classList.toggle('font-bold', !!c.dataset.sens); return; }
    if (b?.classList.contains('sub')) return submit(b.closest('.cmp'));
  }
  return NEXT;
});
