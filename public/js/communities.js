// Communities.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

const ccrow = (c) => `<a href="#/c/${c.id}" class="flex items-center gap-3 border-b border-zinc-800 px-4 py-3 transition-colors hover:bg-white/[.03]"><span class="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-xl font-bold text-white" style="background:hsl(${hue(c.name)} 55% 42%)">${esc((c.name[0] || '?').toUpperCase())}</span><span class="min-w-0 flex-1 leading-tight"><span class="flex items-center gap-1 font-bold"><span class="truncate">${esc(c.name)}</span>${c.joinMode === 'request' ? LOCK : ''}</span><span class="block truncate text-sm text-zinc-500">${fmt(c.members)} member${c.members === 1 ? '' : 's'}${c.description ? ' · ' + esc(c.description) : ''}</span></span>${c.role ? `<span class="rounded-full border border-zinc-600 px-2 py-0.5 text-xs">${c.role}</span>` : ''}</a>`;

async function communitiesPage(v, pg) {
  v.innerHTML = `<div class="sticky top-0 z-10 bg-black/80 backdrop-blur"><div class="flex items-center justify-between px-4 py-2"><h1 class="text-xl font-bold">Communities</h1>${me ? `<button data-newcomm aria-label="New community" class="rounded-full p-2 hover:bg-zinc-900">${ic('edit', '!h-5 !w-5')}</button>` : ''}</div></div><div class="cb">${skel}</div>`;
  const load = async () => {
    try {
      const d = await api('/communities'), sig = JSON.stringify(d); if (sig === v._sig) return; v._sig = sig;
      v.querySelector('.cb').innerHTML = (d.mine.length ? '<h2 class="px-4 pt-3 text-lg font-extrabold">Your communities</h2>' + d.mine.map(ccrow).join('') : '') + '<h2 class="px-4 pt-3 text-lg font-extrabold">Discover</h2>' + (d.discover.length ? d.discover.map(ccrow).join('') : '<p class="p-8 text-center text-zinc-500">No communities to discover yet. Start one with the pencil button.</p>');
    } catch (x) { v.querySelector('.cb').innerHTML = `<p class="p-8 text-center text-red-400">${esc(x.message)}</p>`; }
  };
  await load(); pg.refresh = load;
}

async function communityPage(v, id, pg) {
  let tabC = 'posts', d;
  try { d = await api('/communities/' + id); } catch { return void (v.innerHTML = head('Community') + '<p class="p-10 text-center text-zinc-500">This community isn’t available.</p>'); }
  const c = d.community, mod = c.role === 'owner' || c.role === 'mod', hh = hue(c.name); v._c = c;
  const joinBtn = () => (c.role === 'owner' ? `<button data-cedit class="${btnO}">Manage</button>` : c.role ? `<button data-cleave class="${btnO}">Joined</button>` : c.requested ? `<button data-cjoin class="${btnO}">Requested</button>` : `<button data-cjoin class="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-black hover:bg-zinc-200">${c.joinMode === 'request' ? 'Request to join' : 'Join'}</button>`);
  v.innerHTML = head(esc(c.name), `${fmt(c.members)} member${c.members === 1 ? '' : 's'}`) + `<div class="h-24" style="background:linear-gradient(120deg,hsl(${hh} 50% 25%),hsl(${(hh + 60) % 360} 55% 14%))"></div><div class="px-4 py-3"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><h2 class="flex items-center gap-1 text-xl font-extrabold"><span class="truncate">${esc(c.name)}</span>${c.joinMode === 'request' ? LOCK : ''}</h2>${c.description ? `<p class="mt-1 text-[15px]">${esc(c.description)}</p>` : ''}</div><div class="shrink-0">${me ? joinBtn() : '<button data-login class="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-black">Join</button>'}</div></div></div><div class="ctabs flex border-b border-zinc-800"></div><div class="cbody"></div>`;
  const body = v.querySelector('.cbody');
  const memRow = (u) => `<div class="flex items-center gap-2 px-4 py-3">${av(u)}<a href="#/u/${esc(u.username)}" class="min-w-0 flex-1 leading-tight"><div class="truncate font-bold hover:underline">${esc(u.name)}${bdg(u)}</div><div class="truncate text-sm text-zinc-500">@${esc(u.username)}${u.role !== 'member' ? ' · ' + u.role : ''}</div></a>${mod && u.role !== 'owner' && (c.role === 'owner' || u.role === 'member') ? `<button data-cmact="remove" data-cmu="${esc(u.username)}" class="rounded-full border border-zinc-600 px-3 py-1 text-xs hover:bg-zinc-900">Remove</button>` : ''}${c.role === 'owner' && u.role !== 'owner' ? `<button data-cmact="mod" data-cmu="${esc(u.username)}" class="rounded-full border border-zinc-600 px-3 py-1 text-xs hover:bg-zinc-900">${u.role === 'mod' ? 'Remove mod' : 'Make mod'}</button>` : ''}</div>`;
  const draw = async () => {
    v.querySelector('.ctabs').innerHTML = [['posts', 'Posts'], ['about', 'About'], ['members', 'Members' + (c.requests ? ` (${c.requests})` : '')]].map(([k, l]) => `<button data-ctab="${k}" class="relative flex-1 py-3 text-[15px] hover:bg-zinc-900 ${tabC === k ? 'font-bold' : 'text-zinc-500'}">${l}${tabC === k ? '<i class="absolute bottom-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-sky-500"></i>' : ''}</button>`).join('');
    const priv = `<div class="p-10 text-center"><p class="text-lg font-bold">This community is private</p><p class="mt-1 text-zinc-500">Request to join to see its posts and members.</p></div>`;
    if (tabC === 'about') body.innerHTML = `<div class="space-y-4 p-4"><div><h3 class="font-bold">About</h3><p class="mt-1 text-zinc-400">${esc(c.description) || 'No description yet.'}</p></div><div><h3 class="font-bold">Rules</h3>${c.rules.length ? `<ol class="mt-1 list-decimal space-y-1 pl-5 text-zinc-400">${c.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>` : '<p class="mt-1 text-zinc-500">No rules set.</p>'}</div><p class="text-sm text-zinc-500">${c.joinMode === 'request' ? 'Members join by request and are approved by moderators.' : 'Anyone can join.'}</p></div>`;
    else if (!c.canSee) body.innerHTML = priv;
    else if (tabC === 'posts') { body.innerHTML = (c.role ? `<div class="border-b border-zinc-800">${composer('', '', '', '', c.id)}</div>` : `<div class="border-b border-zinc-800 p-4 text-sm text-zinc-500">${me ? 'Join this community to post and reply.' : 'Log in and join to post.'}</div>`) + '<div class="f"></div>'; feed(body.querySelector('.f'), 'feed=community:' + id, 'No posts here yet.'); }
    else {
      let reqs = ''; if (mod && c.requests) { try { const rq = await api(`/communities/${id}/requests`); reqs = `<h3 class="px-4 pt-3 font-bold">Join requests</h3>${rq.map((u) => `<div class="flex items-center gap-2 px-4 py-3">${av(u)}<a href="#/u/${esc(u.username)}" class="min-w-0 flex-1 truncate font-bold hover:underline">${esc(u.name)}</a><button data-cmact="approve" data-cmu="${esc(u.username)}" class="rounded-full bg-sky-500 px-3 py-1 text-xs font-bold text-white">Approve</button><button data-cmact="deny" data-cmu="${esc(u.username)}" class="rounded-full border border-zinc-600 px-3 py-1 text-xs hover:bg-zinc-900">Deny</button></div>`).join('')}<h3 class="px-4 pt-3 font-bold">Members</h3>`; } catch {} }
      body.innerHTML = reqs + d.members.map(memRow).join('');
    }
  };
  v._cTab = (k) => { tabC = k; draw(); };
  v._cReload = async () => { d = await api('/communities/' + id); Object.assign(c, d.community); draw(); };
  v._cid = id; await draw(); pg.refresh = () => tabC === 'posts' && c.canSee && refreshVisible(body.querySelector('.f'));
}

const commForm = (c = {}) => `<form id="${c.id ? 'cef' : 'ncf'}" data-id="${c.id || ''}" class="space-y-3 p-6"><h2 class="text-2xl font-extrabold">${c.id ? 'Manage community' : 'Create a community'}</h2>${c.id ? '' : `<input name="name" required minlength="3" maxlength="40" placeholder="Community name" class="${inp}">`}<textarea name="description" maxlength="300" rows="3" placeholder="What is this community about?" class="${inp}">${esc(c.description)}</textarea><label class="block text-sm text-zinc-400">Who can join<select name="joinMode" class="${inp} mt-1"><option value="open" ${c.joinMode !== 'request' ? 'selected' : ''}>Anyone can join and see posts</option><option value="request" ${c.joinMode === 'request' ? 'selected' : ''}>Approval required (posts are private)</option></select></label><label class="block text-sm text-zinc-400">Rules (one per line, up to 8)<textarea name="rules" rows="4" class="${inp} mt-1" placeholder="Be kind&#10;No spam">${esc((c.rules || []).join('\n'))}</textarea></label><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-sky-500 py-2.5 font-bold text-white">${c.id ? 'Save' : 'Create'}</button>${c.id ? `<button type="button" data-cdel="${c.id}" class="w-full rounded-full border border-red-500 py-2.5 font-bold text-red-400 hover:bg-red-500/10">Delete community</button>` : ''}</form>`;

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    // communities
    if (d.ctab) return b.closest('.pg')._cTab(d.ctab);
    if ('newcomm' in d) return openDlg(commForm());
    if ('cedit' in d) return openDlg(commForm(b.closest('.pg')._c));
    if (d.cdel) { if (!confirm('Delete this community and all of its posts? This can’t be undone.')) return; await api('/communities/' + d.cdel, { method: 'DELETE' }); dlg.close(); Object.keys(pages).filter((k) => k.startsWith('#/c')).forEach(drop); location.hash = '#/communities'; return toast('Community deleted'); }
    if ('cjoin' in d) { const v = b.closest('.pg'), r = await api(`/communities/${v._cid}/join`, { method: 'POST' }); ['#/communities', '#/c/' + v._cid].forEach(drop); cur = null; route(); return toast(r.joined ? 'Joined' : r.requested ? 'Request sent' : 'Request cancelled'); }
    if ('cleave' in d) { if (!confirm('Leave this community?')) return; const v = b.closest('.pg'); await api(`/communities/${v._cid}/leave`, { method: 'POST' }); ['#/communities', '#/c/' + v._cid].forEach(drop); cur = null; route(); return toast('You left the community'); }
    if (d.cmact) {
      const v = b.closest('.pg'), id = v._cid, u = d.cmu;
      if (d.cmact === 'remove') await api(`/communities/${id}/members/${u}/remove`, { method: 'POST' });
      else if (d.cmact === 'mod') await api(`/communities/${id}/mods/${u}`, { method: 'POST' });
      else await api(`/communities/${id}/requests/${u}/${d.cmact}`, { method: 'POST' });
      toast('Done'); return v._cReload();
    }
  }
  return NEXT;
});

// Form submits
SUBMIT.push(async ({ e, f, body }) => {
  {
    if (f.id === 'ncf') { const x = Object.fromEntries(new FormData(f)), r = await api('/communities', { method: 'POST', body: JSON.stringify({ name: x.name, description: x.description, joinMode: x.joinMode, rules: (x.rules || '').split('\n') }) }); dlg.close(); drop('#/communities'); location.hash = '#/c/' + r.id; }
    if (f.id === 'cef') { const x = Object.fromEntries(new FormData(f)); await api('/communities/' + f.dataset.id, { method: 'PATCH', body: JSON.stringify({ description: x.description, joinMode: x.joinMode, rules: (x.rules || '').split('\n') }) }); dlg.close(); ['#/communities', '#/c/' + f.dataset.id].forEach(drop); cur = null; route(); toast('Community updated'); }
  }
  return NEXT;
});
