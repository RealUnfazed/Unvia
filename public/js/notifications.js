// The notifications inbox and the unread badges.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

// Notifications
const NT = { like: ['heart', 'text-pink-500', 'liked your post'], repost: ['repost', 'text-emerald-500', 'reposted your post'], reply: ['reply', 'text-sky-500', 'replied to your post'], quote: ['repost', 'text-emerald-500', 'quoted your post'], mention: ['reply', 'text-sky-500', 'mentioned you'], follow: ['user', 'text-sky-500', 'followed you'], note: ['shield', 'text-sky-500', 'Readers added context to your post'], request: ['user', 'text-sky-500', 'requested to follow you'], accepted: ['user', 'text-sky-500', 'accepted your follow request'] };

const nrow = (n) => { const [i, c, t] = NT[n.type] || NT.mention; return `<div data-nlink="${n.type === 'request' ? '#/follow-requests' : n.post ? '#/p/' + n.post.id : '#/u/' + esc(n.from.username)}" class="flex cursor-pointer gap-3 border-b border-zinc-800 px-4 py-3 transition-colors hover:bg-white/[.03] ${n.read ? '' : 'bg-sky-500/[.07]'}"><div class="w-8 shrink-0 pt-1 ${c}">${ic(i, '!h-6 !w-6', n.type === 'like')}</div><div class="min-w-0 flex-1">${n.type === 'note' ? '' : av(n.from, 'h-8 w-8 text-sm')}<p class="${n.type === 'note' ? '' : 'mt-2 '}text-[15px]">${n.type === 'note' ? '' : `<a href="#/u/${esc(n.from.username)}" class="font-bold hover:underline">${esc(n.from.name)}</a>${bdg(n.from)} `}${t}</p>${n.post?.text ? `<p class="mt-1 line-clamp-3 text-sm text-zinc-500">${esc(n.post.text)}</p>` : n.post?.media ? '<p class="mt-1 text-sm text-zinc-500">[image]</p>' : ''}<div class="mt-1 text-xs text-zinc-600">${ago(n.at)}</div></div></div>`; };

async function notifications(v, pg) {
  if (!me) return void (v.innerHTML = head('Notifications', '', false) + guest());
  v.innerHTML = head('Notifications', '', false) + `<div class="nl">${skel}</div>`;
  const l = v.querySelector('.nl'); let sig = null;
  const load = async () => {
    try {
      const ns = await api('/notifications'), nsig = ns.map((n) => n.id + n.read).join();
      if (nsig !== sig) { sig = nsig; l.innerHTML = ns.length ? ns.map(nrow).join('') : '<p class="p-10 text-center text-zinc-500">Nothing yet. Likes, reposts, replies, mentions and new followers show up here.</p>'; }
      if (ns.some((n) => !n.read)) { await api('/notifications/read', { method: 'POST' }); if (unread) { unread = 0; chrome(); } }
    } catch (x) { if (sig === null) l.innerHTML = `<p class="p-8 text-center text-red-400">${esc(x.message)}</p>`; }
  };
  await load(); pg.refresh = load;
}

const badge = (h) => { const n = h === '#/notifications' ? unread : h === '#/messages' ? dmUnread : 0; return n ? `<i class="absolute -right-2 -top-2 grid min-w-[18px] place-items-center rounded-full bg-sky-500 px-1 text-[11px] font-bold not-italic leading-[18px] text-white">${n > 99 ? '99+' : n}</i>` : ''; };

async function pollUnread() {
  if (!token) return;
  try {
    const [n, d] = await Promise.all([api('/notifications/count'), api('/messages/unread')]), dm = d.unread + d.requests;
    if (n.unread !== unread || dm !== dmUnread) { unread = n.unread; dmUnread = dm; chrome(); }
  } catch {}
}
