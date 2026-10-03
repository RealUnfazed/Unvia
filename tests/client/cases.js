// ================= TESTS (run in the same scope as the app script) =================
const results = []; const ok = (name, cond, extra = '') => results.push([name, !!cond, extra]);
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };
El.prototype.insertAdjacentHTML = function (pos, html) { this.innerHTML += html; };
const all = (el) => (el.innerHTML || '') + [...el._q.values()].map(all).join('');
const bad = (name, html) => { const m = html.match(/undefined|NaN|\[object |null</); ok(name + ': renders clean', !m && html.length > 40, m ? 'found ' + m[0] : 'len=' + html.length); };
const ISO = new Date().toISOString(), days = (n) => Array.from({ length: n }, (_, i) => ({ day: `2026-01-${String(i + 1).padStart(2, '0')}`, n: (i * 7) % 11 }));
const U = (id, name, x = {}) => ({ id, username: name.toLowerCase(), name, bio: '', avatar: null, banner: null, badge: '', admin: false, pinned: null, protected: false, ...x });
const post = (id = 'p1', x = {}) => ({ id, text: 'Hello #tech world', media: null, images: [], at: ISO, author: U('u2', 'Bob', { badge: 'verified', protected: true }), edited: false, replyLimit: 'all', canReply: true, poll: null, scheduled: false, preview: null, views: 1234, community: { id: 'c1', name: 'Devs' }, note: { text: 'Some context', source: 'https://example.com/a' }, likes: 5, liked: false, reposts: 2, reposted: false, replies: 1, reply: false, bookmarked: true, saves: 3, quoted: null, repostBy: null, feedAt: ISO, ...x });
const meU = { ...U('u1', 'Alice', { admin: true, badge: 'owner' }), mutedWords: [], email: 'a@b.co', emailVerified: true, pendingEmail: null, twofa: false, requests: 2, location: 'Baku', website: '', birthday: '', birthdayVisible: 'none' };
const LIST = { id: 'l1', name: 'My <b>list</b>', description: 'd', private: true, owner: U('u1', 'Alice'), members: 1, subs: 0, mine: true, subscribed: false, pinned: true };
const COMM = { id: 'c1', name: 'Devs', description: 'desc', rules: ['Be kind'], joinMode: 'request', members: 3, canSee: true, requested: false, requests: 1, role: 'owner' };
const CONV = { id: 'conv1', group: false, name: 'Bob', members: [U('u1', 'Alice'), U('u2', 'Bob')], others: [U('u2', 'Bob')], owner: null, lastText: 'hi', lastAt: ISO, lastFromMe: false, unread: true, request: false, pending: false };
MOCK.push(
  ['GET', /^\/api\/me$/, { user: meU }], ['GET', /^\/api\/me\/relations/, { blocked: [U('u3', 'Cy')], muted: [] }],
  ['GET', /^\/api\/lists\/pinned/, [{ id: 'l1', name: 'My <b>list</b>' }]],
  ['GET', /^\/api\/lists\/l1/, { list: LIST, members: [{ ...U('u2', 'Bob'), isFollowing: false }] }],
  ['GET', /^\/api\/lists$/, { owned: [LIST], subscribed: [], discover: [{ ...LIST, id: 'l2', mine: false, owner: U('u2', 'Bob') }] }],
  ['GET', /^\/api\/users\/bob\/list-memberships/, [{ id: 'l1', name: 'My list', private: false, has: true }]],
  ['GET', /^\/api\/communities\/c1\/requests/, [U('u4', 'Dee')]],
  ['GET', /^\/api\/communities\/c1/, { community: COMM, members: [{ ...U('u1', 'Alice'), role: 'owner' }, { ...U('u2', 'Bob'), role: 'member' }] }],
  ['GET', /^\/api\/communities\/c9/, { community: { ...COMM, id: 'c9', canSee: false, role: null, joinMode: 'request' }, members: [] }],
  ['GET', /^\/api\/communities$/, { mine: [COMM], discover: [{ ...COMM, id: 'c2', role: null, joinMode: 'open' }] }],
  ['GET', /^\/api\/folders\?post=/, [{ id: 'f1', name: 'Read later', count: 2, has: true }]],
  ['GET', /^\/api\/folders/, [{ id: 'f1', name: 'Read <i>later</i>', count: 2 }]],
  ['GET', /^\/api\/posts\/p1\/analytics/, { views: 1234, likes: 5, reposts: 2, quotes: 1, replies: 1, saves: 3, engagements: 12, rate: 1, votes: null, daily: days(14) }],
  ['GET', /^\/api\/posts\/p1\/notes/, { notes: [{ id: 'n1', text: 'Needs context', source: 'https://s.com/x', status: 'proposed', total: 2, mine: false, myRating: -1, at: ISO }, { id: 'n2', text: 'Mine', source: '', status: 'helpful', total: 6, mine: true, myRating: -1, at: ISO }] }],
  ['GET', /^\/api\/posts\/p1$/, { post: post(), parent: null, replies: [post('p2', { author: U('u5', 'Eve'), community: null, note: null })] }],
  ['GET', /^\/api\/posts\/refresh/, []], ['GET', /^\/api\/posts\?/, [post('p1'), post('p3', { community: null, note: null, views: 0 })]],
  ['GET', /^\/api\/explore/, { posts: [post()], tags: [{ tag: 'js', count: 3, people: 2 }], topics: [{ slug: 'technology', name: 'Technology', emoji: '💻', count: 5 }] }],
  ['GET', /^\/api\/analytics/, { posts: 3, views: 5000, likes: 40, reposts: 9, replies: 4, saves: 2, followers: 12000, daily: days(28), top: [{ id: 'p1', text: 'Top post', at: ISO, views: 900, likes: 5, reposts: 2, replies: 1, saves: 0 }] }],
  ['GET', /^\/api\/users\/bob\/followers/, [{ ...U('u2', 'Bob'), isFollowing: false }]],
  ['GET', /^\/api\/users\/bob$/, { ...U('u2', 'Bob', { badge: 'verified', protected: true }), joined: ISO, following: 3, followers: 1200, posts: 5, isFollowing: false, blocked: false, muted: false, blockedBy: false, requested: true, canSee: true, location: 'Baku', website: 'https://example.com/', born: 'March 4' }],
  ['GET', /^\/api\/notifications\/count/, { unread: 2 }], ['GET', /^\/api\/messages\/unread/, { unread: 1, requests: 1 }],
  ['GET', /^\/api\/notifications/, [{ id: 'x1', type: 'like', read: false, at: ISO, from: U('u2', 'Bob'), post: { id: 'p1', text: 'hi', media: false } }, { id: 'x2', type: 'note', read: true, at: ISO, from: { id: '', name: 'Community Notes', username: '' }, post: { id: 'p1', text: 'hi', media: false } }, { id: 'x3', type: 'request', read: true, at: ISO, from: U('u4', 'Dee'), post: null }]],
  ['GET', /^\/api\/conversations\/conv1/, { conv: CONV, messages: [{ id: 'm1', from: 'u2', text: 'hi', image: null, deleted: false, at: ISO }, { id: 'm2', from: 'u1', text: 'yo', image: null, deleted: false, at: ISO }], reads: [{ u: 'u2', at: ISO }], more: false }],
  ['GET', /^\/api\/conversations/, [CONV]], ['GET', /^\/api\/drafts/, [{ id: 'd1', text: 'draft', at: ISO }]], ['GET', /^\/api\/scheduled/, [{ id: 's1', text: 'later', at: ISO }]],
  ['GET', /^\/api\/follow-requests/, [U('u4', 'Dee')]], ['GET', /^\/api\/suggest/, [U('u6', 'Fay')]], ['GET', /^\/api\/trends/, [{ tag: 'js', count: 2 }]],
  ['GET', /^\/api\/admin\/overview/, { users: 3, posts: 9, openReports: 0, recent: [{ ...U('u2', 'Bob'), banned: false }], reports: [] }], ['GET', /^\/api\/admin\/fake\/active/, { users: [], posts: [] }],
  ['POST', /^\/api\/communities\/c1\/join/, { joined: false, requested: true }], ['POST', /^\/api\/communities$/, { id: 'c1' }], ['POST', /^\/api\/lists$/, { id: 'l9' }], ['POST', /^\/api\/folders$/, { id: 'f9' }],
);
const run = async (name, fn, feedToo = true) => {
  const v = new El(), pg = {};
  try { await fn(v, pg); await flush();  if (feedToo) { IO.all.slice(-6).forEach((cb) => { try { cb([{ isIntersecting: true, target: new El() }]); } catch {} }); await flush(); } bad(name, all(v)); }
  catch (e) { ok(name + ': no crash', false, e.stack.split('\n').slice(0, 3).join(' | ')); }
  return v;
};
const clickEl = (dataset, o = {}) => { const t = { dataset, tagName: o.tag || 'BUTTON', classList: { contains: () => false }, getAttribute: () => null, ...(o.extra || {}),
  closest(sel) { const m = { 'button,a': t, '.pg': o.page, article: o.art, '.cmp': o.cmp, '[data-pid]': o.pid, '.notes': o.notes, '[data-uid]': o.row, '[data-fr]': o.fr, '[data-pollbox]': o.pollbox }; return m[sel] ?? null; } }; return t; };
const fire = async (target) => { for (const fn of listeners.click) await fn({ target, preventDefault() {} }); await flush(); };
const runTimers = async () => { _timeouts.splice(0).forEach((f) => { try { f(); } catch (e) { ok('timer crash', false, e.message); } }); await flush(); };
const doSubmit = async (f) => { f.classList ||= { contains: () => false }; f.querySelector ||= () => new El(); f.reset ||= () => {}; for (const fn of listeners.submit) await fn({ target: f, preventDefault() {} }); await flush(); };

(async () => {
  const _t = toast; toast = (m, e) => { if (e) console.log('  TOAST(error):', m); return _t(m, e); };
  me = meU; token = 't'; PL = [{ id: 'l1', name: 'My <b>list</b>' }];
  chrome(); const nav = $('#nav').innerHTML, tabs = $('#tabs').innerHTML;
  ok('nav has new entries', ['Explore', 'Lists', 'Communities', 'Analytics', 'Messages'].every((x) => nav.includes(x)));
  ok('mobile tabs: primary + More', tabs.includes('data-more') && tabs.includes('#/explore') && !tabs.includes('#/lists'));
  // ---- card ----
  const c = card(post()); bad('card', c);
  ok('card shows views, community label, note, verified+lock', c.includes('data-act="views"') && c.includes('Devs') && c.includes('Readers added context') && c.includes('Protected account'));
  ok('card escapes user text', !card(post('px', { text: '<script>x</script>' })).includes('<script>x'));
  ok('views formatted', c.includes('1.2K'));
  // ---- pages ----
  const home_ = await run('home', (v, pg) => home(v, pg)); ok('home: pinned list tab is escaped', !all(home_).includes('<b>list</b>') && all(home_).includes('&lt;b&gt;list'));
  await run('explore', (v, pg) => explore(v, pg)); await run('topic page', (v) => topicPage(v, 'technology'));
  await run('analytics page', (v, pg) => analyticsPage(v, pg)); await run('lists page', (v, pg) => listsPage(v, pg));
  const lp = await run('list page', (v, pg) => listPage(v, 'l1', pg)); ok('list name escaped', !all(lp).includes('<b>list</b>'));
  await run('communities page', (v, pg) => communitiesPage(v, pg)); await run('community page (owner)', (v, pg) => communityPage(v, 'c1', pg));
  const cp = await run('community page (private, no access)', (v, pg) => communityPage(v, 'c9', pg)); ok('private community shows notice', all(cp).includes('private'));
  const bp = await run('bookmarks page', (v, pg) => bookmarksPage(v, pg)); ok('folder name escaped', !all(bp).includes('<i>later</i>'));
  await run('thread (notes)', (v, pg) => thread(v, 'p1', pg)); await run('profile', (v, pg) => profile(v, 'bob', pg)); await run('followers', (v, pg) => people(v, 'bob', 'followers', pg));
  await run('notifications', (v, pg) => notifications(v, pg)); await run('messages', (v, pg) => messages(v, pg)); await run('chat', (v, pg) => chat(v, 'conv1', pg));
  await run('drafts', (v, pg) => drafts(v, pg)); await run('settings', (v) => settings(v)); await run('follow requests', (v, pg) => followRequests(v, pg));
  await run('forgot', (v) => forgotPage(v), false); await run('reset', (v) => resetPage(v, 'tok'), false); await run('verify', (v) => verifyPage(v, 'tok'), false); await run('admin', (v) => admin(v));
  const nr = await run('notifications', (v, pg) => notifications(v, pg)); ok('community-note notification is anonymous', all(nr).includes('Readers added context to your post') && !all(nr).includes('Community Notes</a>'));

  // ---- handlers ----
  CALLS.length = 0;
  await fire(clickEl({ more: '' })); ok('More menu lists the rest', dlg.innerHTML.includes('Lists') && dlg.innerHTML.includes('Analytics') && !dlg.innerHTML.includes('Explore'));
  const ex = new El(); await explore(ex, {}); await flush(); await fire(clickEl({ extab: 'trending' }, { page: ex })); ok('explore: Trending tab renders hashtags', all(ex).includes('#js'));
  const art = { dataset: { id: 'p1' } };
  await fire(clickEl({ act: 'views' }, { art })); ok('views click (admin) loads analytics dialog', CALLS.includes('GET /api/posts/p1/analytics') && dlg.innerHTML.includes('Post analytics') && dlg.innerHTML.includes('engagement rate'));
  await fire(clickEl({ act: 'more' }, { art })); ok('post menu: analytics + note + folder items', ['View analytics', 'Add a community note', 'Move to folder'].every((x) => dlg.innerHTML.includes(x)));
  await fire(clickEl({ m: 'note' }, { pid: { dataset: { pid: 'p1' } } })); await runTimers(); ok('note dialog opens', dlg.innerHTML.includes('Add a community note') && dlg.innerHTML.includes('id="ntf"'));
  await fire(clickEl({ m: 'folder' }, { pid: { dataset: { pid: 'p1' } } })); await runTimers(); ok('folder dialog opens with checkbox', CALLS.includes('GET /api/folders?post=p1') && dlg.innerHTML.includes('data-fotoggle="f1"'));
  const notesPage = new El(); await loadNotes(notesPage, 'p1'); const box = notesPage.querySelector('.notes'); box.closest = () => notesPage; box.dataset.pid = 'p1';
  ok('notes render: rate buttons for others, delete for own', all(notesPage).includes('data-rate="2"') && all(notesPage).includes('data-ndel="n2"'));
  CALLS.length = 0; await fire(clickEl({ rate: '2', nid: 'n1' }, { notes: box })); ok('rating a note posts and reloads', CALLS.includes('POST /api/notes/n1/rate') && CALLS.includes('GET /api/posts/p1/notes'));
  await fire(clickEl({ repuser: 'u2', un: 'bob', muted: '0', blocked: '0' })); ok('profile menu has lists entry', dlg.innerHTML.includes('Add or remove from Lists'));
  CALLS.length = 0; await fire(clickEl({ um: 'lists', un: 'bob', uid2: 'u2' })); await runTimers(); ok('lists dialog loads memberships', CALLS.includes('GET /api/users/bob/list-memberships') && dlg.innerHTML.includes('data-lmtoggle="l1"'));
  CALLS.length = 0; for (const fn of listeners.change) await fn({ target: { dataset: { lmtoggle: 'l1', un: 'bob' }, checked: true, closest: () => null, classList: { contains: () => false }, type: 'checkbox' } }); await flush(); ok('list checkbox toggles membership', CALLS.includes('POST /api/lists/l1/members/bob'));
  CALLS.length = 0; for (const fn of listeners.change) await fn({ target: { dataset: { fotoggle: 'f1', pid: 'p1' }, checked: true, closest: () => null, classList: { contains: () => false }, type: 'checkbox' } }); await flush(); ok('folder checkbox toggles', CALLS.includes('POST /api/folders/f1/posts/p1'));
  await fire(clickEl({ newlist: '' })); ok('new list dialog', dlg.innerHTML.includes('Create a list') && dlg.innerHTML.includes('id="nlf"'));
  CALLS.length = 0; await doSubmit({ id: 'nlf', dataset: { un: '' }, _fields: { name: 'News', description: 'x', private: 'on' } }); ok('creating a list posts it', CALLS.includes('POST /api/lists'));
  await fire(clickEl({ newcomm: '' })); ok('new community dialog', dlg.innerHTML.includes('Create a community'));
  CALLS.length = 0; await doSubmit({ id: 'ncf', dataset: {}, _fields: { name: 'Devs2', description: 'd', joinMode: 'open', rules: 'a\nb' } }); ok('creating a community posts it', CALLS.includes('POST /api/communities'));
  location.hash = '#/'; const cpg = new El(); await communityPage(cpg, 'c1', {}); await flush();
  CALLS.length = 0; await fire(clickEl({ cjoin: '' }, { page: cpg })); ok('join posts to the community', CALLS.includes('POST /api/communities/c1/join'));
  CALLS.length = 0; await fire(clickEl({ cmact: 'remove', cmu: 'bob' }, { page: cpg })); ok('mod remove member + reload', CALLS.includes('POST /api/communities/c1/members/bob/remove') && CALLS.includes('GET /api/communities/c1'));
  CALLS.length = 0; await fire(clickEl({ cmact: 'approve', cmu: 'dee' }, { page: cpg })); ok('approve join request', CALLS.includes('POST /api/communities/c1/requests/dee/approve'));
  await fire(clickEl({ cedit: '' }, { page: cpg })); ok('manage community dialog (with delete)', dlg.innerHTML.includes('Manage community') && dlg.innerHTML.includes('data-cdel="c1"'));
  const bpg = new El(); await bookmarksPage(bpg, {}); await flush();
  CALLS.length = 0; await fire(clickEl({ bfold: 'f1' }, { page: bpg })); IO.all.slice(-2).forEach((cb) => { try { cb([{ isIntersecting: true, target: new El() }]); } catch {} }); await flush(); ok('folder chip switches feed', CALLS.some((c) => c.includes('feed=folder:f1')));
  CALLS.length = 0; await fire(clickEl({ bfold: '' }, { page: bpg })); IO.all.slice(-2).forEach((cb) => { try { cb([{ isIntersecting: true, target: new El() }]); } catch {} }); await flush(); ok('"All" chip (empty value) switches back', CALLS.some((c) => c.includes('feed=bookmarks')));
  CALLS.length = 0; await doSubmit({ id: 'nff', dataset: { pid: 'p1' }, _fields: { name: 'Later' } }); ok('new folder from post dialog adds the post', CALLS.includes('POST /api/folders') && CALLS.includes('POST /api/folders/f9/posts/p1'));
  const lpage = new El(); await listPage(lpage, 'l1', {}); await flush();
  CALLS.length = 0; await fire(clickEl({ lmrm: 'bob' }, { page: lpage })); ok('owner removes list member', CALLS.includes('POST /api/lists/l1/members/bob') && CALLS.includes('GET /api/lists/l1'));
  CALLS.length = 0; await fire(clickEl({ lpin: '' }, { page: lpage })); ok('pin list to Home refreshes pinned tabs', CALLS.includes('POST /api/lists/l1/pin') && CALLS.includes('GET /api/lists/pinned'));
  CALLS.length = 0; await doSubmit({ id: 'ntf', dataset: { id: 'p1' }, _fields: { text: 'a long enough note text here', source: '' } }); ok('submitting a note posts it', CALLS.includes('POST /api/posts/p1/notes'));
  CALLS.length = 0; await fire(clickEl({ backfill: '' })); ok('admin backfill button posts', CALLS.includes('POST /api/admin/backfill-topics'));
  // composer in a community carries the community id
  const cmp = composer('', '', '', '', 'c1'); ok('community composer has data-community', cmp.includes('data-community="c1"'));

  const fails = results.filter((r) => !r[1]);
  console.log(`${results.length - fails.length}/${results.length} checks passed`);
  fails.forEach(([n, , e]) => console.log('  FAIL:', n, e || ''));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS ERROR', e.stack); process.exit(2); });
