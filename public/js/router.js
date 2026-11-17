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
  const items = [['home', 'Home', '#/'], ['search', 'Explore', '#/explore'], ...(me ? [['bell', 'Notifications', '#/notifications'], ['mail', 'Messages', '#/messages'], ['lists', 'Lists', '#/lists']] : []), ['users', 'Communities', '#/communities'], ['mark', 'Bookmarks', '#/bookmarks'], ['user', 'Profile', prof], ...(me ? [['chart', 'Analytics', '#/analytics'], ['sliders', 'Settings', '#/settings']] : []), ...(me?.admin || me?.mod ? [['shield', 'Admin', '#/admin']] : [])];
  const prim = ['#/', '#/explore', '#/notifications', '#/messages', prof].filter(Boolean); MORE = items.filter((i) => !prim.includes(i[2]));
  const link = ([i, t, hr], big) => `<a href="${hr || '#/'}" ${hr ? '' : 'data-need'} class="${big ? 'flex items-center gap-4 p-3 text-xl' : 'p-2.5'} rounded-full hover:bg-zinc-900 ${cur === hr ? 'font-bold' : 'text-zinc-400'}"><span class="relative">${ic(i, big ? '!h-7 !w-7' : '!h-6 !w-6')}${badge(hr)}</span>${big ? `<span class="hidden xl:inline">${t}</span>` : ''}</a>`;
  const dprim = ['#/', '#/explore', '#/notifications', '#/messages', '#/lists', '#/bookmarks', '#/communities', prof]; DMORE = items.filter((i) => !dprim.includes(i[2]));
  $('#nav').innerHTML = items.filter((i) => dprim.includes(i[2])).map((i) => link(i, 1)).join('') + (DMORE.length ? `<button data-more="desk" aria-label="More" class="flex items-center gap-4 rounded-full p-3 text-xl text-zinc-400 hover:bg-zinc-900">${ic('menu', '!h-7 !w-7')}<span class="hidden xl:inline">More</span></button>` : '');
  $('#tabs').innerHTML = items.filter((i) => prim.includes(i[2])).map((i) => link(i)).join('') + `<button data-more aria-label="More" class="rounded-full p-2.5 text-zinc-400 hover:bg-zinc-900">${ic('menu', '!h-6 !w-6')}</button>`;
  $('#acct').innerHTML = me ? `<div class="flex items-center gap-3 rounded-full p-2 hover:bg-zinc-900">${av(me)}<div class="hidden min-w-0 flex-1 leading-tight xl:block"><div class="truncate font-bold">${esc(me.name)}</div><div class="truncate text-sm text-zinc-500">@${esc(me.username)}</div></div><button data-out class="hidden text-sm text-zinc-500 hover:text-zinc-100 xl:block">Log out</button></div>` : '<button data-login class="rounded-full bg-sky-500 px-5 py-2 font-bold text-white">Log in</button>';
}

addEventListener('hashchange', () => { chrome(); route(); });

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    if ('more' in d) return openDlg(`<div class="p-2">${(d.more === 'desk' ? DMORE : MORE).map(([i, t, hr]) => `<a href="${hr || '#/'}" ${hr ? '' : 'data-need'} class="flex items-center gap-4 rounded-xl px-4 py-3 text-lg font-semibold hover:bg-zinc-900">${ic(i, '!h-6 !w-6')}${t}</a>`).join('')}</div>`);
  }
  return NEXT;
});
