// Drafts and scheduled posts.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

const DR = {};

async function drafts(v, pg) {
  if (!me) return void (v.innerHTML = head('Drafts & scheduled') + guest());
  v.innerHTML = head('Drafts & scheduled') + `<div class="dl">${skel}</div>`;
  const l = v.querySelector('.dl'); let sig = null;
  const when = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const load = async () => {
    try {
      const [sc, dr] = await Promise.all([api('/scheduled'), api('/drafts')]), nsig = JSON.stringify([sc.map((x) => x.id + x.at), dr.map((x) => x.id + x.text)]);
      if (nsig === sig) return; sig = nsig; dr.forEach((d) => (DR[d.id] = d));
      l.innerHTML = '<h2 class="px-4 pt-4 text-xl font-extrabold">Scheduled</h2>' + (sc.length ? sc.map((x) => `<div class="border-b border-zinc-800 p-4"><div class="mb-1 text-xs font-bold text-sky-400">Sends ${when(x.at)}</div><p class="whitespace-pre-wrap break-words">${esc(x.text) || '<span class="text-zinc-500">(image)</span>'}</p><div class="mt-3 flex gap-2"><button data-pubnow="${x.id}" class="rounded-full bg-sky-500 px-4 py-1 text-sm font-bold text-white">Post now</button><button data-delsch="${x.id}" class="rounded-full border border-zinc-600 px-4 py-1 text-sm hover:bg-zinc-900">Delete</button></div></div>`).join('') : '<p class="p-6 text-zinc-500">No scheduled posts. Use “Schedule” when composing.</p>')
        + '<h2 class="px-4 pt-4 text-xl font-extrabold">Drafts</h2>' + (dr.length ? dr.map((x) => `<div class="border-b border-zinc-800 p-4"><div class="mb-1 text-xs text-zinc-500">Saved ${when(x.at)}</div><p class="whitespace-pre-wrap break-words">${esc(x.text)}</p><div class="mt-3 flex gap-2"><button data-dredit="${x.id}" class="rounded-full bg-white px-4 py-1 text-sm font-bold text-black">Edit</button><button data-drdel="${x.id}" class="rounded-full border border-zinc-600 px-4 py-1 text-sm hover:bg-zinc-900">Delete</button></div></div>`).join('') : '<p class="p-6 text-zinc-500">No drafts. Close the composer with text in it and it’s saved here.</p>');
    } catch (x) { l.innerHTML = `<p class="p-8 text-center text-red-400">${esc(x.message)}</p>`; }
  };
  await load(); pg.refresh = load;
}

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    if ('drafts' in d) { if (dlg.open) dlg.close(); return void (location.hash = '#/drafts'); }
    if (d.dredit) return openDlg(`<div class="p-2">${composer('', '', DR[d.dredit].text, d.dredit)}</div>`);
    if (d.drdel) { await api('/drafts/' + d.drdel, { method: 'DELETE' }); toast('Draft deleted'); return pages[cur]?.refresh?.(); }
    if (d.pubnow) { await api(`/posts/${d.pubnow}/publish`, { method: 'POST' }); drop('#/'); toast('Posted'); return pages[cur]?.refresh?.(); }
    if (d.delsch) { if (!confirm('Delete this scheduled post?')) return; await api('/posts/' + d.delsch, { method: 'DELETE' }); toast('Scheduled post deleted'); return pages[cur]?.refresh?.(); }
  }
  return NEXT;
});
