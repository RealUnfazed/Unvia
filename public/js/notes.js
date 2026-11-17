// Community Notes.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

const noteRow = (n) => `<div class="mt-2 rounded-xl border border-zinc-800 p-3 text-sm"><div class="mb-1 text-xs ${n.status === 'helpful' ? 'font-bold text-emerald-400' : 'text-zinc-500'}">${n.status === 'helpful' ? 'Rated helpful · shown on the post' : n.status === 'unhelpful' ? 'Rated not helpful' : `Needs more ratings · ${n.total} so far`}</div><p class="whitespace-pre-wrap break-words">${esc(n.text)}</p>${n.source ? `<a href="${esc(n.source)}" target="_blank" rel="noopener noreferrer nofollow" class="mt-1 block truncate text-sky-500 hover:underline">${esc(n.source.replace(/^https?:\/\//, ''))}</a>` : ''}${me && !n.mine && n.status !== 'unhelpful' ? `<div class="mt-2 flex flex-wrap gap-2">${[[2, 'Helpful'], [1, 'Somewhat helpful'], [0, 'Not helpful']].map(([k, l]) => `<button data-rate="${k}" data-nid="${n.id}" class="rounded-full px-3 py-1 text-xs font-bold ${n.myRating === k ? 'bg-sky-500 text-white' : 'border border-zinc-600 hover:bg-zinc-900'}">${l}</button>`).join('')}</div>` : ''}${n.mine ? `<div class="mt-2 text-xs text-zinc-500">Your note · <button data-ndel="${n.id}" class="text-red-400 hover:text-red-300">Delete</button></div>` : ''}</div>`;

async function loadNotes(v, id) {
  const box = v.querySelector('.notes'); if (!box) return; box.dataset.pid = id;
  try { const { notes } = await api(`/posts/${id}/notes`); box.innerHTML = notes.length ? `<div class="border-b border-zinc-800 p-4"><div class="flex items-center gap-1.5 font-bold">${ic('shield', '!h-4 !w-4 text-sky-500')}Community Notes</div>${notes.map(noteRow).join('')}</div>` : ''; } catch {}
}

const noteDlg = (id) => openDlg(`<form id="ntf" data-id="${id}" class="space-y-3 p-6"><h2 class="text-xl font-extrabold">Add a community note</h2><p class="text-sm text-zinc-400">Explain what’s missing or misleading. Be neutral and specific, and link a source if you can. Other people rate it, and it only appears on the post if enough of them find it helpful.</p><textarea name="text" required minlength="20" maxlength="500" rows="4" placeholder="Context people should know…" class="${inp}"></textarea><input name="source" maxlength="300" placeholder="Source link (optional)" class="${inp}"><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-sky-500 py-2.5 font-bold text-white">Submit note</button></form>`);

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    if (d.rate !== undefined) { await api(`/notes/${d.nid}/rate`, { method: 'POST', body: JSON.stringify({ v: +d.rate }) }); const box = b.closest('.notes'); return loadNotes(box.closest('.pg'), box.dataset.pid); }
    if (d.ndel) { if (!confirm('Delete your note?')) return; await api('/notes/' + d.ndel, { method: 'DELETE' }); const box = b.closest('.notes'); return loadNotes(box.closest('.pg'), box.dataset.pid); }
  }
  return NEXT;
});

// Form submits
SUBMIT.push(async ({ e, f, body }) => {
  {
    if (f.id === 'ntf') { await api(`/posts/${f.dataset.id}/notes`, { method: 'POST', body }); dlg.close(); toast('Note submitted. Others will rate it.'); const el = pages[cur]?.el; if (el?.querySelector('.notes')) loadNotes(el, f.dataset.id); }
  }
  return NEXT;
});
