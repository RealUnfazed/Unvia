// Right-hand sidebar widgets (who to follow, trends).
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

async function sugg() {
  try {
    const us = await api('/suggest');
    $('#sug').innerHTML = us.length ? `<div class="rounded-2xl border border-zinc-800 bg-zinc-950/60"><h2 class="px-4 py-3 text-xl font-extrabold">Who to follow</h2>${us.map(urow).join('')}</div>` : '';
  } catch {}
}

async function trend() {
  try {
    const t = await api('/trends');
    $('#trend').innerHTML = `<div class="rounded-2xl border border-zinc-800 bg-zinc-950/60"><h2 class="px-4 py-3 text-xl font-extrabold">What’s happening</h2>${t.length ? t.map((x, i) => `<a href="#/search/%23${esc(x.tag)}" class="block px-4 py-3 hover:bg-white/[.04]"><div class="text-xs text-zinc-500">Trending #${i + 1}</div><div class="font-bold">#${esc(x.tag)}</div><div class="text-xs text-zinc-500">${x.count} post${x.count > 1 ? 's' : ''}</div></a>`).join('') : '<p class="px-4 pb-4 text-sm text-zinc-500">Nothing trending yet. Add a #hashtag to your next post.</p>'}</div>`;
  } catch {}
}
