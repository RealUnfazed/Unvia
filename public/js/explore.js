// Explore, topics and search.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

async function search(v, q, pg) {
  v.innerHTML = `<div class="sticky top-0 z-10 bg-black/80 p-3 backdrop-blur"><input class="sq w-full rounded-full bg-zinc-900 px-5 py-3 outline-none ring-1 ring-transparent transition focus:ring-sky-500" placeholder="Search people and posts" value="${esc(q)}"></div><div class="r"></div>`;
  const r = v.querySelector('.r'); if (!q) return (r.innerHTML = '<p class="p-10 text-center text-zinc-500">Search people, posts and #hashtags.</p>');
  r.innerHTML = skel;
  try {
    const d = await api('/search?q=' + encodeURIComponent(q));
    r.innerHTML = (d.users.length ? '<h2 class="px-4 pt-3 text-xl font-extrabold">People</h2>' + d.users.map(urow).join('') + '<div class="border-b border-zinc-800"></div>' : '') + d.posts.filter((p) => !muted(p)).map(card).join('') + (d.users.length || d.posts.length ? '' : `<p class="p-10 text-center text-zinc-500">No results for “${esc(q)}”.</p>`);
    pg.refresh = () => refreshVisible(r);
  } catch (x) { r.innerHTML = `<p class="p-8 text-center text-red-400">${esc(x.message)}</p>`; }
}

const TP = { technology: ['💻', 'Technology'], sports: ['⚽', 'Sports'], music: ['🎵', 'Music'], gaming: ['🎮', 'Gaming'], science: ['🔬', 'Science'], art: ['🎨', 'Art & design'], food: ['🍕', 'Food'], travel: ['✈️', 'Travel'], news: ['📰', 'News & politics'], entertainment: ['🎬', 'Movies & TV'], business: ['📈', 'Business & finance'], health: ['💪', 'Health & fitness'], humor: ['😂', 'Humor'] };

async function explore(v, pg) {
  let tabE = 'foryou', data = null;
  v.innerHTML = `<div class="sticky top-0 z-10 bg-black/80 backdrop-blur"><div class="p-3"><input class="sq w-full rounded-full bg-zinc-900 px-5 py-3 outline-none ring-1 ring-transparent transition focus:ring-sky-500" placeholder="Search"></div><div class="extabs flex border-b border-zinc-800"></div></div><div class="exb">${skel}</div>`;
  const body = v.querySelector('.exb');
  const tabs = () => { v.querySelector('.extabs').innerHTML = [['foryou', 'For you'], ['trending', 'Trending'], ['topics', 'Topics']].map(([k, l]) => `<button data-extab="${k}" class="relative flex-1 py-3.5 text-[15px] hover:bg-zinc-900 ${tabE === k ? 'font-bold' : 'text-zinc-500'}">${l}${tabE === k ? '<i class="absolute bottom-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-sky-500"></i>' : ''}</button>`).join(''); };
  const draw = () => {
    tabs();
    if (!data) return;
    if (tabE === 'foryou') { const ps = data.posts.filter((p) => !muted(p)); body.innerHTML = ps.length ? ps.map(card).join('') : '<p class="p-10 text-center text-zinc-500">Nothing is trending yet. Posts that get likes, reposts and replies show up here.</p>'; }
    else if (tabE === 'trending') body.innerHTML = data.tags.length ? data.tags.map((t, i) => `<a href="#/search/%23${esc(t.tag)}" class="block px-4 py-3 transition-colors hover:bg-white/[.04]"><div class="text-xs text-zinc-500">Trending #${i + 1}</div><div class="font-bold">#${esc(t.tag)}</div><div class="text-xs text-zinc-500">${fmt(t.count)} post${t.count === 1 ? '' : 's'} · ${fmt(t.people)} ${t.people === 1 ? 'person' : 'people'}</div></a>`).join('') : '<p class="p-10 text-center text-zinc-500">No hashtags are trending yet.</p>';
    else body.innerHTML = `<div class="grid grid-cols-2 gap-2 p-3">${data.topics.map((t) => `<a href="#/topic/${t.slug}" class="rounded-2xl border border-zinc-800 p-4 transition-colors hover:bg-zinc-900"><div class="text-2xl">${t.emoji}</div><div class="mt-1 font-bold">${esc(t.name)}</div><div class="text-xs text-zinc-500">${fmt(t.count)} post${t.count === 1 ? '' : 's'} this week</div></a>`).join('')}</div>`;
  };
  v._exTab = (k) => { tabE = k; draw(); };
  try { data = await api('/explore'); draw(); } catch (x) { body.innerHTML = `<p class="p-8 text-center text-red-400">${esc(x.message)}</p>`; }
  pg.refresh = () => tabE === 'foryou' && refreshVisible(body);
}

function topicPage(v, slug) {
  const [em, name] = TP[slug] || ['#', slug];
  v.innerHTML = head(`${em} ${esc(name)}`, 'Latest posts') + '<div class="f"></div>';
  feed(v.querySelector('.f'), 'feed=topic:' + encodeURIComponent(slug), `No ${esc(name)} posts yet.`);
}

document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.target.id === 'sq' || e.target.classList.contains('sq')) && e.target.value.trim()) location.hash = '#/search/' + encodeURIComponent(e.target.value.trim()); });

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    if (d.extab) return b.closest('.pg')._exTab(d.extab);
  }
  return NEXT;
});
