// Direct messages: inbox, chat, new-message dialog.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

const cav = (c, cls = 'h-12 w-12 text-lg') => (c.group ? `<span class="${cls} grid shrink-0 place-items-center rounded-full bg-zinc-800">👥</span>` : dot(c.others[0] || {}, cls));

const crow = (c) => `<div data-clink="${c.id}" class="flex cursor-pointer gap-3 border-b border-zinc-800 px-4 py-3 transition-colors hover:bg-white/[.03]">${cav(c)}<div class="min-w-0 flex-1"><div class="flex items-baseline gap-1"><b class="truncate">${esc(c.name)}</b>${c.group ? '' : bdg(c.others[0])}<span class="shrink-0 truncate text-sm text-zinc-500">${c.group ? '' : '@' + esc(c.others[0]?.username) + ' · '}${ago(c.lastAt)}</span></div><p class="truncate text-[15px] ${c.unread ? 'font-bold text-zinc-100' : 'text-zinc-500'}">${c.lastFromMe ? 'You: ' : ''}${esc(c.lastText)}</p></div>${c.unread ? '<i class="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500"></i>' : ''}</div>`;

async function messages(v, pg) {
  if (!me) return void (v.innerHTML = head('Messages', '', false) + guest());
  let box = 'inbox', sig = null, reqN = 0;
  v.innerHTML = `<div class="sticky top-0 z-10 bg-black/80 backdrop-blur"><div class="flex items-center justify-between px-4 py-2"><h1 class="text-xl font-bold">Messages</h1><button data-newdm aria-label="New message" class="rounded-full p-2 hover:bg-zinc-900">${ic('edit', '!h-5 !w-5')}</button></div><div class="dmtabs flex border-b border-zinc-800"></div></div><div class="cl">${skel}</div>`;
  const tabs = () => { v.querySelector('.dmtabs').innerHTML = [['inbox', 'Messages'], ['requests', 'Requests' + (reqN ? ` (${reqN})` : '')]].map(([k, l]) => `<button data-dmbox="${k}" class="relative flex-1 py-3 text-[15px] hover:bg-zinc-900 ${box === k ? 'font-bold' : 'text-zinc-500'}">${l}${box === k ? '<i class="absolute bottom-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-sky-500"></i>' : ''}</button>`).join(''); };
  const load = async (force) => {
    try {
      const [cs, u] = await Promise.all([api('/conversations?box=' + box), api('/messages/unread')]); reqN = u.requests;
      const nsig = box + reqN + JSON.stringify(cs.map((c) => [c.id, c.lastAt, c.unread, c.name]));
      if (nsig === sig && !force) return; sig = nsig; tabs();
      v.querySelector('.cl').innerHTML = cs.length ? cs.map(crow).join('') : `<p class="p-10 text-center text-zinc-500">${box === 'requests' ? 'No message requests.' : 'No messages yet. Tap the pencil to start a conversation.'}</p>`;
    } catch (x) { v.querySelector('.cl').innerHTML = `<p class="p-8 text-center text-red-400">${esc(x.message)}</p>`; }
  };
  v._setBox = (bx) => { box = bx; sig = null; v.querySelector('.cl').innerHTML = skel; load(true); };
  tabs(); await load(true); pg.refresh = () => load(false);
}

const mrow = (m, i, a, c) => {
  const mine = m.from === me.id, prev = a[i - 1], next = a[i + 1], gap = (x, y) => Math.abs(new Date(x.at) - new Date(y.at)) > 5 * 60000;
  const first = !prev || prev.from !== m.from || gap(prev, m), last = !next || next.from !== m.from || gap(m, next), who = c.members.find((u) => u.id === m.from);
  const sep = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString() ? `<div class="mt-4 text-center text-xs text-zinc-600">${dayLbl(m.at)}</div>` : '';
  const bub = m.deleted ? '<span class="italic text-zinc-500">This message was deleted</span>' : `${m.image ? `<button type="button" data-img="${esc(m.image)}" class="block"><img src="${esc(m.image)}" loading="lazy" class="max-h-64 max-w-full rounded-xl object-cover"></button>` : ''}${m.text ? `<div class="whitespace-pre-wrap break-words ${m.image ? 'mt-1' : ''}">${linkify(m.text)}</div>` : ''}`;
  return `${sep}<div class="msg flex items-end gap-2 ${mine ? 'justify-end' : ''} ${first ? 'mt-3' : 'mt-0.5'} ${m.pending ? 'opacity-60' : ''}">${!mine && c.group ? (last ? dot(who || {}, 'h-7 w-7 text-xs') : '<span class="w-7 shrink-0"></span>') : ''}<div class="flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}">${!mine && c.group && first ? `<span class="mb-0.5 text-xs text-zinc-500">${esc(who?.name)}</span>` : ''}<div data-mbub="${m.id}" class="rounded-2xl px-3 py-2 text-[15px] ${m.deleted ? 'border border-zinc-800' : mine ? 'rounded-br-md bg-sky-600 text-white' : 'rounded-bl-md bg-zinc-800'} ${m.failed ? 'ring-1 ring-red-500' : ''}">${bub}</div>${mine && !m.deleted && !m.pending && !m.failed ? `<div class="macts mt-1 hidden text-xs"><button data-mdel="${m.id}" class="text-red-400 hover:text-red-300">Delete</button></div>` : ''}${last ? `<span class="mt-0.5 text-[11px] text-zinc-600">${m.failed ? 'Not sent' : hm(m.at)}</span>` : ''}</div></div>`;
};

async function chat(v, id, pg) {
  pg.fast = 2500;
  v.innerHTML = `<div class="sticky top-0 z-10 flex items-center gap-3 bg-black/80 px-3 py-2 backdrop-blur"><button data-back class="rounded-full p-2 hover:bg-zinc-900">${ic('back')}</button><div class="chh flex min-w-0 flex-1 items-center gap-3"></div><button data-cmenu aria-label="Conversation menu" class="rounded-full p-2 hover:bg-zinc-900">${ic('more')}</button></div><div class="ml px-3 pb-3">${skel}</div><div class="seen px-4 pb-2 text-right text-xs text-zinc-500"></div><div class="dmfoot border-t border-zinc-800 bg-black"></div>`;
  const st = (v._chat = { id, conv: null, msgs: [], reads: [], more: false, sending: 0, sig: '' }), ml = v.querySelector('.ml');
  const nearBottom = () => innerHeight + scrollY >= document.body.scrollHeight - 160, toBottom = () => scrollTo(0, document.body.scrollHeight);
  const seenTxt = () => { // read receipt under your latest message, only if it is the last one in the chat
    const real = st.msgs.filter((m) => !m.pending && !m.failed), last = real.at(-1);
    if (!last || last.from !== me.id || last.deleted) return '';
    const n = st.reads.filter((r) => r.u !== me.id && new Date(r.at) >= new Date(last.at)).length;
    return st.conv.group ? (n ? `Seen by ${n}` : 'Sent') : n ? 'Seen' : 'Sent';
  };
  const sigOf = () => JSON.stringify([st.msgs.map((m) => m.id + m.deleted + m.failed + m.pending), st.conv && seenTxt(), st.conv?.request, st.conv?.pending, st.more]);
  st.render = (stick) => {
    const c = st.conv, bottom = stick ?? nearBottom();
    ml.innerHTML = (st.more ? '<div class="py-2 text-center"><button data-dmmore class="text-sm font-semibold text-sky-500 hover:text-sky-400">Load earlier messages</button></div>' : '') + (st.msgs.length ? st.msgs.map((m, i) => mrow(m, i, st.msgs, c)).join('') : `<p class="p-10 text-center text-zinc-500">${c.pending || c.request ? '' : 'Say hello 👋'}</p>`);
    v.querySelector('.seen').textContent = seenTxt(); st.sig = sigOf(); if (bottom) toBottom();
  };
  st.footer = () => {
    const c = st.conv, f = v.querySelector('.dmfoot');
    if (c.request) return void (f.innerHTML = `<div class="p-4 text-center"><p class="mb-3 text-sm text-zinc-400">${esc(c.name)} wants to message you. They won’t see that you’ve read this until you accept.</p><div class="flex justify-center gap-3"><button data-dmacc class="rounded-full bg-sky-500 px-5 py-2 font-bold text-white hover:bg-sky-400">Accept</button><button data-dmdec class="rounded-full border border-zinc-600 px-5 py-2 font-bold hover:bg-zinc-900">Delete</button></div></div>`);
    if (f.querySelector('form')) return void (f.querySelector('.note').textContent = c.pending ? 'Message request sent. You can send up to 3 messages until they accept.' : '');
    f.innerHTML = `<div class="note px-4 pt-2 text-center text-xs text-zinc-500">${c.pending ? 'Message request sent. You can send up to 3 messages until they accept.' : ''}</div><div class="pvw hidden px-3 pt-2"></div><form class="dmf flex items-end gap-2 p-3"><label class="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-sky-500 hover:bg-zinc-900" aria-label="Add photo">${ic('image', '!h-5 !w-5')}<input type="file" accept="image/*" class="dmfile hidden"></label><textarea class="dmta max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl bg-zinc-900 px-4 py-2 outline-none placeholder:text-zinc-500" rows="1" maxlength="1000" placeholder="Start a new message"></textarea><button aria-label="Send" class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-500 text-white hover:bg-sky-400 disabled:opacity-50">${ic('send', '!h-5 !w-5')}</button></form>`;
  };
  const header = () => {
    const c = st.conv, o = c.others[0] || {};
    v.querySelector('.chh').innerHTML = c.group ? `<span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-800">👥</span><div class="min-w-0 leading-tight"><div class="truncate font-bold">${esc(c.name)}</div><div class="text-xs text-zinc-500">${c.members.length} members</div></div>` : `${dot(o, 'h-9 w-9 text-sm')}<a href="#/u/${esc(o.username)}" class="min-w-0 leading-tight"><div class="truncate font-bold hover:underline">${esc(c.name)}${bdg(o)}</div><div class="truncate text-xs text-zinc-500">@${esc(o.username)}</div></a>`;
  };
  const fetchWin = (extra = '') => api(`/conversations/${id}?read=${document.hidden ? 0 : 1}${extra}`);
  const apply = (d, first) => { // server window replaces the tail; older loaded messages and unsent ones are kept
    st.conv = d.conv; st.reads = d.reads;
    const f0 = d.messages[0]?.at, older = st.msgs.filter((m) => !m.pending && !m.failed && f0 && m.at < f0), unsent = st.msgs.filter((m) => m.pending || m.failed);
    st.msgs = [...older, ...d.messages, ...unsent]; if (first) st.more = d.more;
  };
  v._loadMore = async () => {
    const oldest = st.msgs.find((m) => !m.pending && !m.failed); if (!oldest) return;
    try { const d = await api(`/conversations/${id}?before=${encodeURIComponent(oldest.at)}`), h0 = document.body.scrollHeight; st.msgs = [...d.messages, ...st.msgs]; st.more = d.more; st.render(false); scrollTo(0, scrollY + document.body.scrollHeight - h0); } catch (x) { toast(x.message, 1); }
  };
  pg.onShow = () => { if (st.conv) toBottom(); };
  try { const d = await fetchWin(); apply(d, true); header(); st.footer(); st.render(true); if (d.conv.unread) pollUnread(); }
  catch { ml.innerHTML = '<p class="p-10 text-center text-zinc-500">This conversation isn’t available.</p>'; return; }
  pg.refresh = async () => {
    if (st.sending) return;
    try {
      const d = await fetchWin(), was = st.sig; apply(d); st.footer();
      if (sigOf() !== was) st.render(); if (d.conv.unread) pollUnread();
    } catch {}
  };
}

async function sendDm(f) {
  const v = f.closest('.pg'), st = v._chat, ta = f.querySelector('textarea'), text = ta.value.trim(), file = f._file;
  if (!text && !file) return;
  const tmp = { id: 'tmp' + Date.now(), from: me.id, text, image: file ? URL.createObjectURL(file) : null, at: new Date().toISOString(), pending: true };
  st.msgs.push(tmp); ta.value = ''; ta.style.height = ''; f._file = null; const pv = v.querySelector('.pvw'); pv.classList.add('hidden'); pv.innerHTML = ''; st.render(true);
  const fd = new FormData(); fd.append('text', text); if (file) fd.append('image', file);
  st.sending++;
  try {
    const m = await api(`/conversations/${st.id}/messages`, { method: 'POST', body: fd });
    st.msgs = st.msgs.filter((x) => x.id !== tmp.id && x.id !== m.id); st.msgs.push(m);
    if (st.conv.request) { st.conv.request = false; st.footer(); } // replying to a request accepts it
    st.render(true);
  } catch (x) { tmp.pending = false; tmp.failed = true; st.render(true); toast(x.message, 1); if (!ta.value) ta.value = text; }
  finally { st.sending--; }
}

let NM = [], nmT;

function openNewDm() {
  NM = [];
  openDlg(`<div class="space-y-3 p-4"><h2 class="text-xl font-extrabold">New message</h2><input class="nmq ${inp}" placeholder="Search people by username" autocomplete="off" autocapitalize="none"><div class="nmsel flex flex-wrap gap-2"></div><div class="nmres max-h-60 overflow-y-auto"></div><input class="nmname hidden ${inp}" maxlength="50" placeholder="Group name (optional)"><p class="err text-sm text-red-400"></p><button data-nmgo disabled class="w-full rounded-full bg-sky-500 py-2.5 font-bold text-white disabled:opacity-50">Chat</button></div>`);
  setTimeout(() => dlg.querySelector('.nmq')?.focus(), 60);
}

const nmDraw = () => {
  dlg.querySelector('.nmsel').innerHTML = NM.map((u) => `<button type="button" data-nmrm="${esc(u.username)}" class="rounded-full bg-sky-500/20 px-3 py-1 text-sm hover:bg-sky-500/30">${esc(u.name)} ✕</button>`).join('');
  dlg.querySelector('.nmname').classList.toggle('hidden', NM.length < 2);
  const go = dlg.querySelector('[data-nmgo]'); go.disabled = !NM.length; go.textContent = NM.length > 1 ? 'Create group' : 'Chat';
};

document.addEventListener('keydown', (e) => { // Enter sends a message on desktop; Shift+Enter or a phone keyboard adds a new line
  if (e.key === 'Enter' && !e.shiftKey && e.target.classList?.contains('dmta') && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); e.target.form.requestSubmit(); }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.classList?.contains('dmta')) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 128) + 'px'; }
  if (t.classList?.contains('nmq')) {
    clearTimeout(nmT); const q = t.value.trim().replace(/^@/, ''), res = dlg.querySelector('.nmres'); if (!q) return void (res.innerHTML = '');
    nmT = setTimeout(async () => {
      try {
        const us = (await api('/mentions?q=' + encodeURIComponent(q))).filter((u) => u.id !== me.id && !NM.some((x) => x.username === u.username));
        res.innerHTML = us.length ? us.map((u) => `<button type="button" data-nmpick="${esc(u.username)}" data-nmname="${esc(u.name)}" class="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-zinc-900">${dot(u, 'h-9 w-9 text-sm')}<span class="min-w-0 truncate"><b>${esc(u.name)}</b>${bdg(u)} <span class="text-zinc-500">@${esc(u.username)}</span></span></button>`).join('') : '<p class="px-2 py-3 text-sm text-zinc-500">No matching accounts.</p>';
      } catch {}
    }, 200);
  }
});

document.addEventListener('change', async (e) => {
  if (!e.target.classList?.contains('dmfile')) return;
  const f = e.target.closest('form'), file = e.target.files[0]; e.target.value = '';
  if (!file || !file.type.startsWith('image/')) return;
  f._file = await compress(file);
  const pv = f.closest('.pg').querySelector('.pvw'); pv.classList.remove('hidden');
  pv.innerHTML = `<div class="relative inline-block"><img src="${URL.createObjectURL(f._file)}" class="h-24 rounded-xl object-cover"><button type="button" data-dmrm aria-label="Remove photo" class="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-[rgba(0,0,0,.7)] text-xs text-white">✕</button></div>`;
});

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    if ('newdm' in d) return openNewDm();
    if (d.nmpick) { NM.push({ username: d.nmpick, name: d.nmname }); dlg.querySelector('.nmq').value = ''; dlg.querySelector('.nmres').innerHTML = ''; return nmDraw(); }
    if (d.nmrm) { NM = NM.filter((u) => u.username !== d.nmrm); return nmDraw(); }
    if ('nmgo' in d) {
      const err = dlg.querySelector('.err'); err.textContent = ''; b.disabled = true;
      try { const r = await api('/conversations', { method: 'POST', body: JSON.stringify({ usernames: NM.map((u) => u.username), name: dlg.querySelector('.nmname').value }) }); dlg.close(); location.hash = '#/messages/' + r.id; }
      catch (x) { err.textContent = x.message; b.disabled = false; }
      return;
    }
    if (d.dm) { if (!me) return openAuth(); const r = await api('/conversations', { method: 'POST', body: JSON.stringify({ username: d.dm }) }); return void (location.hash = '#/messages/' + r.id); }
    if (d.dmbox) return b.closest('.pg')._setBox(d.dmbox);
    if ('dmmore' in d) return b.closest('.pg')._loadMore();
    if ('dmrm' in d) { const v = b.closest('.pg'); v.querySelector('.dmf')._file = null; const pv = v.querySelector('.pvw'); pv.classList.add('hidden'); pv.innerHTML = ''; return; }
    if ('dmacc' in d) { const st = b.closest('.pg')._chat; await api(`/conversations/${st.id}/accept`, { method: 'POST' }); st.conv.request = false; st.footer(); st.render(false); return pollUnread(); }
    if ('dmdec' in d) { const st = b.closest('.pg')._chat; await api(`/conversations/${st.id}/decline`, { method: 'POST' }); Object.keys(pages).filter((k) => k.startsWith('#/messages')).forEach(drop); location.hash = '#/messages'; toast('Request deleted'); return pollUnread(); }
    if (d.mdel) { const st = b.closest('.pg')._chat; await api('/messages/' + d.mdel, { method: 'DELETE' }); const m = st.msgs.find((x) => x.id === d.mdel); if (m) { m.deleted = true; m.text = ''; m.image = null; } st.render(false); return toast('Message deleted'); }
    if ('cmenu' in d) {
      const c = pages[cur]._chat.conv;
      return openDlg(`<div class="p-2">${c.group ? `<button data-cact="members" class="block w-full rounded-xl px-4 py-3 text-left font-semibold hover:bg-zinc-900">Group members</button><button data-cact="rename" class="block w-full rounded-xl px-4 py-3 text-left font-semibold hover:bg-zinc-900">Rename group</button><button data-cact="del" class="block w-full rounded-xl px-4 py-3 text-left font-semibold text-red-400 hover:bg-zinc-900">Leave group</button>` : `<a href="#/u/${esc(c.others[0]?.username)}" class="block w-full rounded-xl px-4 py-3 text-left font-semibold hover:bg-zinc-900">View profile</a><button data-cact="del" class="block w-full rounded-xl px-4 py-3 text-left font-semibold text-red-400 hover:bg-zinc-900">Delete conversation</button>`}</div>`);
    }
    if (d.cact) {
      const st = pages[cur]._chat, c = st.conv;
      if (d.cact === 'members') return openDlg(`<div class="p-2"><h2 class="px-4 py-2 text-xl font-extrabold">Members</h2>${c.members.map((u) => `<a href="#/u/${esc(u.username)}" class="flex items-center gap-3 rounded-xl px-4 py-2 hover:bg-zinc-900">${dot(u, 'h-9 w-9 text-sm')}<span class="min-w-0 truncate"><b>${esc(u.name)}</b>${bdg(u)} <span class="text-zinc-500">@${esc(u.username)}</span></span></a>`).join('')}</div>`);
      if (d.cact === 'rename') return openDlg(`<form id="rnf" class="space-y-3 p-4"><h2 class="text-xl font-extrabold">Rename group</h2><input name="name" maxlength="50" value="${esc(c.name)}" class="${inp}"><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-white py-2.5 font-bold text-black">Save</button></form>`);
      if (!confirm(c.group ? 'Leave this group?' : 'Delete this conversation? It only clears it for you.')) return;
      dlg.close(); await api('/conversations/' + st.id, { method: 'DELETE' });
      Object.keys(pages).filter((k) => k.startsWith('#/messages')).forEach(drop); location.hash = '#/messages'; toast(c.group ? 'You left the group' : 'Conversation deleted'); return pollUnread();
    }
  }
  return NEXT;
});

// Form submits
SUBMIT.push(async ({ e, f, body }) => {
  {
    if (f.id === 'rnf') { await api('/conversations/' + pages[cur]._chat.id, { method: 'PATCH', body }); dlg.close(); Object.keys(pages).filter((k) => k.startsWith('#/messages')).forEach(drop); cur = null; route(); toast('Group renamed'); }
  }
  return NEXT;
});
