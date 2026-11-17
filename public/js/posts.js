// The post card: reactions, polls, galleries, previews, notes block, quotes, delete/mute/block, live count updates.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

const left = (t) => { const ms = new Date(t) - Date.now(); if (ms <= 0) return 'Final results'; const m = Math.ceil(ms / 60000); return m < 60 ? `${m}m left` : m < 1440 ? `${Math.ceil(m / 60)}h left` : `${Math.ceil(m / 1440)}d left`; };

const pollInner = (p) => {
  const q = p.poll, show = q.voted >= 0 || q.ended || (me && p.author?.id === me.id);
  return q.options.map((o, i) => {
    const pct = q.total ? Math.round(o.votes / q.total * 100) : 0, mine = q.voted === i;
    return show ? `<div class="relative mt-2 flex h-9 items-center justify-between overflow-hidden rounded-lg bg-zinc-900 px-3 text-sm"><i class="bar absolute inset-y-0 left-0 rounded-lg ${mine ? 'bg-sky-500/50' : 'bg-zinc-700/70'}" style="width:${pct}%"></i><span class="relative truncate ${mine ? 'font-bold' : ''}">${esc(o.text)}${mine ? ' ✓' : ''}</span><span class="relative ml-2 shrink-0">${pct}%</span></div>`
      : `<button type="button" data-vote="${i}" class="mt-2 block h-9 w-full rounded-full border border-sky-500 px-3 text-sm font-bold text-sky-400 transition-colors hover:bg-sky-500/10">${esc(o.text)}</button>`;
  }).join('') + `<div class="mt-2 text-xs text-zinc-500">${fmt(q.total)} vote${q.total === 1 ? '' : 's'} · ${left(q.endsAt)}</div>`;
};

const pollBlock = (p) => (p.poll ? `<div data-pollbox class="mt-3">${pollInner(p)}</div>` : '');

const REV = new Set(); // posts whose sensitive media you chose to show

const gallery = (p) => { const g = gallery0(p); return g && p.sensitive && !REV.has(p.id) ? `<div class="relative mt-3 overflow-hidden rounded-2xl">${g.replace('class="mt-3 grid', 'class="grid')}<div class="absolute inset-0 z-10 grid place-items-center bg-[rgba(0,0,0,.45)] backdrop-blur-2xl"><button type="button" data-reveal class="rounded-full bg-[rgba(0,0,0,.75)] px-4 py-2 text-sm font-bold text-white">Sensitive media · Show</button></div></div>` : g; };

const gallery0 = (p) => {
  const im = p.images?.length ? p.images : p.media ? [p.media] : [], n = im.length; if (!n) return '';
  return `<div class="mt-3 grid gap-0.5 overflow-hidden rounded-2xl border border-zinc-800 ${n > 1 ? 'h-72 grid-cols-2' : ''} ${n > 2 ? 'grid-rows-2' : ''}">${im.map((u, i) => `<button type="button" data-img="${esc(u)}" class="block overflow-hidden ${n === 3 && i === 0 ? 'row-span-2' : ''}"><img src="${esc(u)}" loading="lazy" class="w-full object-cover ${n > 1 ? 'h-full' : 'max-h-[510px]'}"></button>`).join('')}</div>`;
};

const previewCard = (pv) => (pv ? `<a href="${esc(pv.url)}" target="_blank" rel="noopener noreferrer nofollow" class="mt-3 block overflow-hidden rounded-2xl border border-zinc-800 transition-colors hover:bg-white/[.04]">${pv.image ? `<img src="${esc(pv.image)}" loading="lazy" class="max-h-64 w-full object-cover" onerror="this.remove()">` : ''}<div class="p-3"><div class="truncate text-xs text-zinc-500">${esc(pv.site)}</div><div class="line-clamp-2 font-semibold">${esc(pv.title)}</div>${pv.description ? `<div class="line-clamp-2 text-sm text-zinc-500">${esc(pv.description)}</div>` : ''}</div></a>` : '');

const replyMsg = (p) => (p.replyLimit === 'following' ? `Only accounts @${p.author?.username} follows can reply` : 'Only people mentioned in this post can reply');

const noteBlock = (p) => (p.note ? `<div class="mt-3 rounded-2xl border border-zinc-800 p-3 text-sm"><div class="mb-1 flex items-center gap-1.5 font-bold">${ic('shield', '!h-4 !w-4 text-sky-500')}Readers added context</div><p class="whitespace-pre-wrap break-words">${esc(p.note.text)}</p>${p.note.source ? `<a href="${esc(p.note.source)}" target="_blank" rel="noopener noreferrer nofollow" class="mt-1 block truncate text-sky-500 hover:underline">${esc(p.note.source.replace(/^https?:\/\//, ''))}</a>` : ''}</div>` : '');

const quoteEmbed = (q) => q.deleted
  ? '<div class="mt-3 rounded-2xl border border-zinc-800 p-3 text-sm text-zinc-500">This post was deleted.</div>'
  : `<button type="button" data-qlink="${q.id}" class="mt-3 block w-full rounded-2xl border border-zinc-800 p-3 text-left transition-colors hover:bg-white/[.04]"><div class="flex items-center gap-1 text-sm"><b class="truncate">${esc(q.author?.name)}</b>${bdg(q.author)}<span class="truncate text-zinc-500">@${esc(q.author?.username)} · ${ago(q.at)}</span></div>${q.text ? `<p class="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-[15px]">${esc(q.text)}</p>` : ''}${q.media ? `<img src="${esc(q.media)}" loading="lazy" class="mt-2 max-h-64 w-full rounded-xl object-cover">` : ''}</button>`;

const card = (p) => { P[p.id] = p; const a = p.author || {}; return `<article data-id="${p.id}" class="cursor-pointer border-b border-zinc-800 px-4 pb-1 pt-3 transition-colors hover:bg-white/[.03]">
  ${p.pinned ? `<div class="mb-1 ml-12 flex items-center gap-2 text-xs font-bold text-zinc-500">${ic('pin', '!h-3.5 !w-3.5')}Pinned</div>` : ''}
  ${p.repostBy ? `<div class="mb-1 ml-12 flex items-center gap-2 text-xs font-bold text-zinc-500">${ic('repost', '!h-3.5 !w-3.5')}${esc(p.repostBy.name)} reposted</div>` : ''}
  ${p.community ? `<div class="mb-1 ml-12 flex items-center gap-2 text-xs font-bold text-zinc-500">${ic('users', '!h-3.5 !w-3.5')}<a href="#/c/${p.community.id}" class="hover:underline">${esc(p.community.name)}</a></div>` : ''}
  <div class="flex gap-3">${av(a)}<div class="min-w-0 flex-1">
    <div class="flex items-center gap-1 text-[15px]"><a href="#/u/${esc(a.username)}" class="truncate font-bold hover:underline">${esc(a.name)}${bdg(a)}</a><span class="truncate text-zinc-500">@${esc(a.username)} · ${ago(p.at)}${p.edited ? ' · Edited' : ''}</span><span class="-mr-2 ml-auto shrink-0">${btn('more', '', 'hover:text-sky-500')}</span></div>
    <p class="whitespace-pre-wrap break-words text-[15px]">${linkify(p.text)}</p>
    ${gallery(p)}${pollBlock(p)}${previewCard(p.preview)}
    ${p.quoted ? quoteEmbed(p.quoted) : ''}${noteBlock(p)}
    <div class="-ml-1.5 mt-1 grid max-w-md grid-cols-5 text-sm text-zinc-500">
      ${btn('reply', p.replies, 'hover:text-sky-500', p.canReply === false && 'opacity-40')}${btn('repost', p.reposts, 'hover:text-emerald-500', p.reposted && 'text-emerald-500')}
      ${btn('like', p.likes, 'hover:text-pink-600', p.liked && 'text-pink-600', p.liked)}${btn('views', p.views, 'hover:text-sky-500')}${btn('bookmark', p.saves || '', 'hover:text-sky-500', p.bookmarked && 'text-sky-500', p.bookmarked)}
    </div></div></div></article>`; };

const rerender = (id) => { document.querySelectorAll(`article[data-id="${id}"]`).forEach((a) => (a.outerHTML = card(P[id]))); document.querySelectorAll(`article[data-id="${id}"]`).forEach((a) => a.classList.add('flash')); };

// Passive updates (other people's activity, gradual fake boosts) roll the numbers in place instead of replacing the whole card.
function syncCounts(p) {
  document.querySelectorAll(`article[data-id="${p.id}"]`).forEach((art) => {
    if (p.poll) { const pe = art.querySelector('[data-pollbox]'); if (pe) pe.innerHTML = pollInner(p); }
    [['reply', p.replies], ['repost', p.reposts], ['like', p.likes], ['bookmark', p.saves], ['views', p.views]].forEach(([act, n]) => {
      const b = art.querySelector(`[data-act="${act}"]`); if (!b) return;
      let cnt = b.querySelector('.cnt');
      if (n) { if (!cnt) { b.insertAdjacentHTML('beforeend', '<span class="cnt min-w-0 truncate text-[13px]" data-val="0"></span>'); cnt = b.querySelector('.cnt'); } animateCount(cnt, n); }
      else cnt?.remove();
    });
    [['like', 'liked', 'text-pink-600', true], ['repost', 'reposted', 'text-emerald-500', false], ['bookmark', 'bookmarked', 'text-sky-500', true]].forEach(([act, key, cls, fill]) => {
      const b = art.querySelector(`[data-act="${act}"]`); if (!b) return;
      b.classList.toggle(cls, !!p[key]);
      if (fill) b.querySelector('svg')?.setAttribute('fill', p[key] ? 'currentColor' : 'none');
    });
  });
}

// Silently refetches just the posts currently on screen in a feed/search/bookmarks list and updates their counts in place — no reorder, no scroll jump.
async function refreshVisible(el) {
  const ids = [...(el?.querySelectorAll('article[data-id]') || [])].map((a) => a.dataset.id);
  if (!ids.length) return;
  try { (await api('/posts/refresh?ids=' + ids.join(','))).forEach((p) => { const o = P[p.id] || {}; P[p.id] = { ...p, pinned: o.pinned, repostBy: o.repostBy }; syncCounts(P[p.id]); }); } catch {}
}

async function relate(kind, username) {
  try {
    const r = await api(`/users/${username}/${kind}`, { method: 'POST' }), on = r.muted ?? r.blocked;
    Object.keys(pages).forEach(drop); cur = null; route(); sugg();
    toast(`${on ? (kind === 'mute' ? 'Muted' : 'Blocked') : (kind === 'mute' ? 'Unmuted' : 'Unblocked')} @${username}`);
  } catch (x) { toast(x.message, 1); }
}

async function del(id) { if (!confirm('Delete this post?')) return; try { await api('/posts/' + id, { method: 'DELETE' }); document.querySelectorAll(`article[data-id="${id}"]`).forEach((a) => collapse(a)); toast('Post deleted'); } catch (x) { toast(x.message, 1); } }

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    if (d.qlink) return void (location.hash = '#/p/' + d.qlink);
    if (d.img) return openDlg(`<img src="${esc(d.img)}" class="max-h-[85vh] w-full object-contain">`);
    if (d.vote !== undefined) {
      if (!me) return openAuth();
      const id = art.dataset.id, p = P[id], i = +d.vote, box = b.closest('[data-pollbox]');
      if (!p?.poll || p.poll.voted >= 0 || p.poll.ended) return;
      p.poll.options[i].votes++; p.poll.total++; p.poll.voted = i; box.innerHTML = pollInner(p);
      try { p.poll = (await api(`/posts/${id}/vote`, { method: 'POST', body: JSON.stringify({ option: i }) })).poll; box.innerHTML = pollInner(p); }
      catch (x) { p.poll.options[i].votes--; p.poll.total--; p.poll.voted = -1; box.innerHTML = pollInner(p); toast(x.message, 1); }
      return;
    }
    if (d.rq) {
      const id = b.closest('[data-pid]').dataset.pid, p = P[id];
      if (d.rq === 'quote') return openDlg(`<div class="p-2">${composer('', id)}</div>`);
      dlg.close(); p.reposted = !p.reposted; p.reposts += p.reposted ? 1 : -1; rerender(id);
      if (p.reposted) document.querySelectorAll(`article[data-id="${id}"] [data-act="repost"]`).forEach((x) => x.classList.add('a-repost'));
      return api(`/posts/${id}/repost`, { method: 'POST' });
    }
    if (d.m) { const id = b.closest('[data-pid]').dataset.pid; dlg.close(); if (d.m === 'copy') { navigator.clipboard?.writeText(location.href.split('#')[0] + '#/p/' + id); return toast('Link copied'); } if (d.m === 'report') return setTimeout(() => reportDlg('post', id), 250);
      if (d.m === 'analytics') return setTimeout(() => showAnalytics(id), 250);
      if (d.m === 'note') return setTimeout(() => noteDlg(id), 250);
      if (d.m === 'folder') return setTimeout(() => folderDlg(id), 250);
      if (d.m === 'edit') return setTimeout(() => openDlg(`<form id="edf" data-id="${id}" class="space-y-3 p-4"><h2 class="text-xl font-extrabold">Edit post</h2><textarea name="text" maxlength="280" rows="4" class="${inp}">${esc(P[id].text)}</textarea><p class="err text-sm text-red-400"></p><div class="flex justify-end"><button class="rounded-full bg-white px-5 py-2 font-bold text-black">Save</button></div></form>`), 250);
      if (d.m === 'pin') { const r = await api('/posts/' + id + '/pin', { method: 'POST' }); me.pinned = r.pinned ? id : null; localStorage.me = JSON.stringify(me); toast(r.pinned ? 'Pinned to your profile' : 'Unpinned'); const k = '#/u/' + me.username; drop(k); if (cur === k) { cur = null; route(); } return; }
      if (d.m === 'muteu' || d.m === 'blocku') return relate(d.m === 'muteu' ? 'mute' : 'block', P[id].author.username);
      return del(id); }
    if (d.rep) { await api('/report', { method: 'POST', body: JSON.stringify({ kind: d.k, target: d.t, reason: d.rep }) }); dlg.close(); return toast('Thanks, we’ll review your report'); }
    if ('reveal' in d) { REV.add(art?.dataset.id); return void b.parentElement.remove(); }
  }
  return NEXT;
});

// Form submits
SUBMIT.push(async ({ e, f, body }) => {
  {
    if (f.id === 'edf') { const id = f.dataset.id, o = P[id], np = await api('/posts/' + id, { method: 'PATCH', body }); P[id] = { ...np, pinned: o.pinned, repostBy: o.repostBy }; dlg.close(); rerender(id); toast('Post updated'); }
  }
  return NEXT;
});
