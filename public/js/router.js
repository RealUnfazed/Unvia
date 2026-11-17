// Navigation: routes, left menu, tab bar, refresh polling.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

function route() {
  const h = location.hash || '#/', [, a, b, c] = h.slice(1).split('/');
  if (cur && pages[cur]) { pages[cur].y = scrollY; pages[cur].el.hidden = true; }
  let pg = pages[h];
  if (!pg) { // pages stay alive once opened, so going back is instant and keeps your scroll position
    const v = document.createElement('div'); v.className = 'pg'; $('#view').append(v); pg = pages[h] = { el: v, y: 0 };
    if (a === 'u') (c === 'followers' || c === 'following' ? people(v, b, c, pg) : profile(v, b, pg));
    else if (a === 'notifications') notifications(v, pg);
    else if (a === 'messages') (b ? chat(v, b, pg) : messages(v, pg));
    else if (a === 'drafts') drafts(v, pg);
    else if (a === 'explore') explore(v, pg);
    else if (a === 'topic') topicPage(v, b);
    else if (a === 'analytics') analyticsPage(v, pg);
    else if (a === 'lists') listsPage(v, pg);
    else if (a === 'list') listPage(v, b, pg);
    else if (a === 'communities') communitiesPage(v, pg);
    else if (a === 'c') communityPage(v, b, pg);
    else if (a === 'forgot') forgotPage(v);
    else if (a === 'reset') resetPage(v, b);
    else if (a === 'verify') verifyPage(v, b);
    else if (a === 'follow-requests') followRequests(v, pg);
    else if (a === 'p') thread(v, b, pg);
    else if (a === 'settings') settings(v);
    else if (a === 'admin') admin(v);
    else if (a === 'search') search(v, decodeURIComponent(b || ''), pg);
    else if (a === 'bookmarks') bookmarksPage(v, pg);
    else home(v, pg);
  }
  pg.el.hidden = false; cur = h; scrollTo(0, pg.y); pg.onShow?.(); document.body.classList.toggle('in-dm', a === 'messages');
  clearInterval(poll); pg.refresh?.(); poll = setInterval(() => pages[cur]?.refresh?.(), pg.fast || 5000); // open chats poll faster
}

addEventListener('visibilitychange', () => !document.hidden && pages[cur]?.refresh?.());

function chrome() {
  const cur = location.hash || '#/', prof = me ? '#/u/' + me.username : '';
  // Same order as X. Signed-out visitors only get what works without an account.
  const items = me ? [['home', 'Home', '#/'], ['search', 'Explore', '#/explore'], ['bell', 'Notifications', '#/notifications'], ['mail', 'Messages', '#/messages'], ['lists', 'Lists', '#/lists'], ['mark', 'Bookmarks', '#/bookmarks'], ['users', 'Communities', '#/communities'], ['user', 'Profile', prof]]
    : [['home', 'Home', '#/'], ['search', 'Explore', '#/explore'], ['users', 'Communities', '#/communities']];
  DMORE = me ? [['chart', 'Analytics', '#/analytics'], ['edit', 'Drafts', '#/drafts'], ['sliders', 'Settings', '#/settings'], ...(me.admin || me.mod ? [['shield', 'Admin', '#/admin']] : [])] : [];
  const tabIds = ['#/', '#/explore', '#/notifications', '#/messages', prof].filter(Boolean); MORE = [...items, ...DMORE].filter((i) => !tabIds.includes(i[2]));
  const nv = ([i, t, hr]) => `<a href="${hr}" class="nv rounded-full text-zinc-100 hover:bg-zinc-900${cur === hr ? ' on' : ''}"><span class="relative">${ic(i)}${badge(hr)}</span><span class="hidden xl:inline">${t}</span></a>`;
  const tab = ([i, t, hr]) => `<a href="${hr}" aria-label="${t}" class="rounded-full p-2.5 hover:bg-zinc-900 ${cur === hr ? 'font-bold' : 'text-zinc-400'}"><span class="relative">${ic(i, '!h-6 !w-6')}${badge(hr)}</span></a>`;
  $('#nav').innerHTML = items.map(nv).join('') + (DMORE.length ? `<button data-more="desk" aria-label="More" class="nv rounded-full text-zinc-100 hover:bg-zinc-900">${ic('menu')}<span class="hidden xl:inline">More</span></button>` : '');
  $('#tabs').innerHTML = me ? items.filter((i) => tabIds.includes(i[2])).map(tab).join('') + `<button data-more aria-label="More" class="rounded-full p-2.5 text-zinc-400 hover:bg-zinc-900">${ic('menu', '!h-6 !w-6')}</button>`
    : items.map(tab).join('') + `<button data-login aria-label="Log in" class="rounded-full p-2.5 text-sky-400 hover:bg-zinc-900">${ic('login', '!h-6 !w-6')}</button>`;
  document.querySelectorAll('[data-compose]').forEach((b) => b.classList.toggle('!hidden', !me));
  $('#acct').innerHTML = me
    ? `<button data-acct aria-label="Account menu" class="flex w-full items-center justify-center gap-3 rounded-full p-2 text-left hover:bg-zinc-900 xl:justify-start">${av(me)}<span class="hidden min-w-0 flex-1 leading-tight xl:block"><span class="block truncate font-bold">${esc(me.name)}</span><span class="block truncate text-sm text-zinc-500">@${esc(me.username)}</span></span><span class="hidden text-zinc-500 xl:block">${ic('more')}</span></button>`
    : `<div class="flex flex-col items-center gap-2 xl:items-stretch"><button data-login aria-label="Log in or sign up" class="grid h-12 w-12 place-items-center rounded-full bg-sky-500 text-white hover:bg-sky-400 xl:hidden">${ic('login', '!h-6 !w-6')}</button><div class="hidden flex-col gap-2 xl:flex"><button data-login class="rounded-full border border-zinc-700 py-2.5 font-bold text-sky-400 hover:bg-sky-500/10">Log in</button><button data-login="reg" class="rounded-full bg-sky-500 py-2.5 font-bold text-white hover:bg-sky-400">Sign up</button></div></div>`;
}

// Small menu beside the sidebar (More, account). Opens upward from its button like X; a click anywhere else, Escape or navigating closes it.
function popMenu(btn, html) {
  const old = document.getElementById('mpop'), key = btn.dataset.acct !== undefined ? 'acct' : 'more';
  if (old) { old.remove(); if (old.dataset.owner === key) return; }
  const r = btn.getBoundingClientRect?.() || { left: 8, bottom: innerHeight }, m = document.createElement('div');
  m.id = 'mpop'; m.dataset.owner = key; m.innerHTML = html;
  m.className = 'fixed z-40 w-72 overflow-y-auto rounded-2xl border border-zinc-800 bg-black py-2 shadow-2xl shadow-black';
  m.style.left = Math.max(8, r.left) + 'px'; m.style.bottom = Math.max(8, innerHeight - r.bottom) + 'px'; m.style.maxHeight = Math.max(160, r.bottom - 8) + 'px';
  document.body.append(m);
}
document.addEventListener('click', (e) => { if (document.getElementById('mpop') && !e.target.closest?.('[data-more="desk"],[data-acct]')) setTimeout(() => document.getElementById('mpop')?.remove()); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('mpop')?.remove(); });
addEventListener('resize', () => document.getElementById('mpop')?.remove());

addEventListener('hashchange', () => { document.getElementById('mpop')?.remove(); chrome(); route(); });

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    const mi = ([i, t, hr]) => `<a href="${hr}" class="flex items-center gap-4 px-4 py-3 text-lg font-semibold hover:bg-zinc-900">${ic(i, '!h-6 !w-6')}${t}</a>`;
    if ('acct' in d) return popMenu(b, mi(['sliders', 'Settings', '#/settings']) + `<button data-out class="flex w-full items-center gap-4 px-4 py-3 text-left text-lg font-semibold hover:bg-zinc-900">${ic('back', '!h-6 !w-6')}Log out @${esc(me.username)}</button>`);
    if (d.more === 'desk') return popMenu(b, DMORE.map(mi).join(''));
    if ('more' in d) return openDlg(`<div class="p-2">${MORE.map(mi).join('')}</div>`);
  }
  return NEXT;
});
