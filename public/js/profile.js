// Profile pages, tabs and follower/following lists.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

const PT = [['user', 'Posts'], ['replies', 'Replies'], ['media', 'Media'], ['likes', 'Likes']];

const PE = { user: 'No posts yet.', replies: 'No replies yet.', media: 'No photos or GIFs yet.', likes: 'Posts you like will show up here.' };

const ptabs = (uid, on) => `<div class="flex border-b border-zinc-800">${PT.filter(([k]) => k !== 'likes' || me?.id === uid).map(([k, l]) => `<button data-ptab="${k}" class="relative flex-1 py-4 text-[15px] hover:bg-zinc-900 ${on === k ? 'font-bold' : 'text-zinc-500'}">${l}${on === k ? '<i class="absolute bottom-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-sky-500"></i>' : ''}</button>`).join('')}</div>`;

const ctl = (u) => me?.id === u.id ? '<button data-edit class="rounded-full border border-zinc-600 px-4 py-1.5 font-bold hover:bg-zinc-900">Edit profile</button>'
  : `<div class="flex gap-2">${u.blockedBy || u.blocked ? '' : `<button data-dm="${esc(u.username)}" aria-label="Message" class="rounded-full border border-zinc-600 p-2 hover:bg-zinc-900">${ic('mail')}</button>`}<button data-repuser="${u.id}" data-un="${esc(u.username)}" data-muted="${u.muted ? 1 : 0}" data-blocked="${u.blocked ? 1 : 0}" class="rounded-full border border-zinc-600 p-2 hover:bg-zinc-900">${ic('more')}</button>${u.blockedBy ? '' : u.blocked ? `<button data-block="${esc(u.username)}" class="rounded-full bg-red-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-red-500">Blocked</button>` : fbtn(u.username, u.isFollowing, u.requested)}</div>`;

async function profile(v, name, pg) {
  let u; try { u = await api('/users/' + name); } catch { return (v.innerHTML = head('Profile') + '<p class="p-10 text-center text-zinc-500">This account doesn’t exist.</p>'); }
  const h = hue(u.username); v.dataset.user = u.username; v.dataset.uid = u.id;
  v.innerHTML = head(esc(u.name), `<span data-stat="posts" data-val="${u.posts}">${fmt(u.posts)}</span> posts`) + `<div class="h-36 sm:h-48" style="background:${u.banner ? `url(${esc(u.banner)}) center/cover` : `linear-gradient(120deg,hsl(${h} 50% 25%),hsl(${(h + 60) % 360} 55% 14%))`}"></div>
  <div class="px-4 pb-3"><div class="-mt-14 flex items-end justify-between">${av(u, 'h-28 w-28 border-4 border-black text-4xl')}<div data-followbox>${ctl(u)}</div></div>
  <h2 class="mt-2 text-xl font-extrabold">${esc(u.name)}${bdg(u)}</h2><div class="text-zinc-500">@${esc(u.username)}</div>
  ${u.bio ? `<p class="mt-3 whitespace-pre-wrap">${linkify(u.bio)}</p>` : ''}
  ${u.location || u.website || u.born ? `<p class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">${u.location ? `<span>📍 ${esc(u.location)}</span>` : ''}${u.website ? `<a href="${esc(u.website)}" target="_blank" rel="noopener noreferrer nofollow ugc" class="text-sky-500 hover:underline">🔗 ${esc(u.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : ''}${u.born ? `<span>🎂 Born ${esc(u.born)}</span>` : ''}</p>` : ''}
  <p class="mt-3 text-sm text-zinc-500">Joined ${new Date(u.joined).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
  <p class="mt-2 text-sm"><a href="#/u/${esc(u.username)}/following" class="hover:underline"><b data-stat="following" data-val="${u.following}">${fmt(u.following)}</b> <span class="text-zinc-500">Following</span></a> &nbsp; <a href="#/u/${esc(u.username)}/followers" class="hover:underline"><b data-stat="followers" data-val="${u.followers}">${fmt(u.followers)}</b> <span class="text-zinc-500">Followers</span></a></p></div>`
  + (u.suspended ? `<div class="border-t border-zinc-800 p-10 text-center"><p class="text-lg font-bold">Account suspended</p><p class="mt-1 text-zinc-500">@${esc(u.username)} was suspended for breaking the rules.</p></div>` : !u.canSee && !u.blockedBy ? `<div class="border-t border-zinc-800 p-10 text-center"><p class="text-lg font-bold">These posts are protected</p><p class="mt-1 text-zinc-500">Only approved followers can see @${esc(u.username)}’s posts.</p></div>` : u.blockedBy ? `<div class="border-t border-zinc-800 p-10 text-center text-zinc-500">@${esc(u.username)} blocked you. You can’t follow them or see their posts.</div>` : `<div class="ptabs">${ptabs(u.id, 'user')}</div><div class="f"></div>`);
  const f = v.querySelector('.f');
  if (f) feed(f, 'feed=user:' + u.username, PE.user);
  // Live-refreshes stats in place (animated count) instead of leaving numbers frozen at first load — covers real changes and gradual fake boosts alike.
  pg.refresh = async () => {
    try {
      const nu = await api('/users/' + name);
      animateCount(v.querySelector('[data-stat=posts]'), nu.posts);
      animateCount(v.querySelector('[data-stat=following]'), nu.following);
      animateCount(v.querySelector('[data-stat=followers]'), nu.followers);
      if (me?.id !== nu.id && !nu.blockedBy) v.querySelector('[data-followbox]').innerHTML = ctl(nu);
    } catch {}
    if (f) refreshVisible(f);
  };
}

// Followers / Following lists
async function people(v, name, kind, pg) {
  const tabs = ['followers', 'following'].map((k) => `<a href="#/u/${esc(name)}/${k}" class="relative flex-1 py-4 text-center text-[15px] hover:bg-zinc-900 ${kind === k ? 'font-bold' : 'text-zinc-500'}">${k[0].toUpperCase() + k.slice(1)}${kind === k ? '<i class="absolute bottom-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-sky-500"></i>' : ''}</a>`).join('');
  v.innerHTML = head('@' + esc(name)) + `<div class="flex border-b border-zinc-800">${tabs}</div><div class="ul">${skel}</div>`;
  const l = v.querySelector('.ul'); let sig = null;
  const load = async () => {
    try {
      const us = await api(`/users/${name}/${kind}`), nsig = us.map((x) => x.id + x.isFollowing).join();
      if (nsig === sig) return; sig = nsig;
      l.innerHTML = us.length ? us.map(urow).join('') : `<p class="p-10 text-center text-zinc-500">${kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</p>`;
    } catch (x) { l.innerHTML = `<p class="p-8 text-center text-red-400">${esc(x.message)}</p>`; }
  };
  await load(); pg.refresh = load;
}

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    if (d.repuser) {
      if (!me) return openAuth();
      const un = d.un; return openDlg(`<div class="p-2">${[['lists', 'Add or remove from Lists'], ['mute', d.muted === '1' ? `Unmute @${un}` : `Mute @${un}`], ['block', d.blocked === '1' ? `Unblock @${un}` : `Block @${un}`], ['report', `Report @${un}`]].map(([m, t]) => `<button data-um="${m}" data-un="${un}" data-uid2="${d.repuser}" class="block w-full rounded-xl px-4 py-3 text-left font-semibold hover:bg-zinc-900 ${m === 'mute' || m === 'block' ? 'text-red-400' : ''}">${t}</button>`).join('')}</div>`);
    }
    if (d.um) { dlg.close(); if (d.um === 'report') return setTimeout(() => reportDlg('user', d.uid2), 250);
      if (d.um === 'lists') return setTimeout(() => listsDlg(d.un), 250); return relate(d.um, d.un); }
    if (d.block) return relate('block', d.block);
    if (d.ptab) { const v = b.closest('.pg'); v.querySelector('.ptabs').innerHTML = ptabs(v.dataset.uid, d.ptab); const f = v.querySelector('.f'); f.innerHTML = ''; return feed(f, `feed=${d.ptab}:${v.dataset.user}`, PE[d.ptab]); }
  }
  return NEXT;
});

// Form submits
SUBMIT.push(async ({ e, f, body }) => {
  {
    if (f.id === 'ef') { me = (await api('/me', { method: 'PATCH', body: new FormData(f) })).user; localStorage.me = JSON.stringify(me); dlg.close(); chrome(); Object.keys(pages).forEach(drop); cur = null; route(); toast('Profile saved'); }
  }
  return NEXT;
});
