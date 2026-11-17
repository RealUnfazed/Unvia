// Account and per-post analytics.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

const barsSvg = (days) => { const max = Math.max(1, ...days.map((d) => d.n)), w = 100 / days.length; return `<svg viewBox="0 0 100 40" preserveAspectRatio="none" class="h-28 w-full">${days.map((d, i) => `<rect x="${i * w + w * 0.15}" y="${40 - (d.n / max) * 38}" width="${w * 0.7}" height="${Math.max((d.n / max) * 38, d.n ? 0.8 : 0.3)}" rx="0.6" class="fill-sky-500"><title>${d.day}: ${d.n} views</title></rect>`).join('')}</svg><div class="mt-1 flex justify-between text-xs text-zinc-500"><span>${days[0].day.slice(5)}</span><span>${days.at(-1).day.slice(5)}</span></div>`; };

async function analyticsPage(v, pg) {
  if (!me) return void (v.innerHTML = head('Analytics', '', false) + guest());
  v.innerHTML = head('Analytics', 'Your posts', false) + skel;
  const load = async () => {
    try {
      const d = await api('/analytics');
      v.innerHTML = head('Analytics', 'Your posts', false) + `<div class="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">${[['Followers', d.followers], ['Posts', d.posts], ['Views', d.views], ['Likes', d.likes], ['Reposts', d.reposts], ['Replies', d.replies], ['Saves', d.saves]].map(([t, n]) => `<div class="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4"><div class="text-2xl font-extrabold">${fmt(n)}</div><div class="text-xs text-zinc-500">${t}</div></div>`).join('')}</div>
        <section class="border-t border-zinc-800 p-4"><h2 class="font-bold">Views, last 28 days</h2><div class="mt-2">${barsSvg(d.daily)}</div><p class="mt-1 text-xs text-zinc-500">Counts people other than you viewing your posts. Totals above include everything to date.</p></section>
        <section class="border-t border-zinc-800"><h2 class="px-4 pt-4 font-bold">Top posts by views</h2>${d.top.length ? d.top.map((p) => `<a href="#/p/${p.id}" class="block border-b border-zinc-800 px-4 py-3 hover:bg-white/[.03]"><p class="truncate">${esc(p.text) || '<span class="text-zinc-500">(media)</span>'}</p><p class="mt-1 text-xs text-zinc-500">${fmt(p.views)} views · ${fmt(p.likes)} likes · ${fmt(p.reposts)} reposts · ${fmt(p.replies)} replies</p></a>`).join('') : '<p class="p-6 text-zinc-500">Post something to see how it does.</p>'}</section>`;
    } catch (x) { v.innerHTML = head('Analytics', '', false) + `<p class="p-8 text-center text-red-400">${esc(x.message)}</p>`; }
  };
  await load(); pg.refresh = load;
}

async function showAnalytics(id) {
  try {
    const d = await api(`/posts/${id}/analytics`);
    openDlg(`<div class="space-y-3 p-6"><h2 class="text-xl font-extrabold">Post analytics</h2><div class="grid grid-cols-3 gap-2 text-center">${[['Views', d.views], ['Likes', d.likes], ['Reposts', d.reposts], ['Quotes', d.quotes], ['Replies', d.replies], ['Saves', d.saves]].map(([t, n]) => `<div class="rounded-xl border border-zinc-800 p-2"><div class="text-lg font-extrabold">${fmt(n)}</div><div class="text-xs text-zinc-500">${t}</div></div>`).join('')}</div><p class="text-sm"><b>${d.rate}%</b> <span class="text-zinc-500">engagement rate (${fmt(d.engagements)} engagements ÷ ${fmt(d.views)} views)</span>${d.votes != null ? ` · <b>${fmt(d.votes)}</b> <span class="text-zinc-500">poll votes</span>` : ''}</p><div>${barsSvg(d.daily)}</div></div>`);
  } catch (x) { toast(x.message, 1); }
}
