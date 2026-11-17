// Bookmarks and folders.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

async function bookmarksPage(v, pg) {
  if (!me) return void (v.innerHTML = head('Bookmarks', '', false) + guest());
  let sel = '', folders = [];
  v.innerHTML = head('Bookmarks', '', false) + '<div class="bfs"></div><div class="f"></div>';
  const f = v.querySelector('.f');
  const chips = () => { v.querySelector('.bfs').innerHTML = `<div class="flex gap-2 overflow-x-auto border-b border-zinc-800 px-4 py-3">${[['', 'All'], ...folders.map((x) => [x.id, x.name])].map(([id, n]) => `<button data-bfold="${id}" class="shrink-0 rounded-full border px-4 py-1 text-sm font-semibold ${sel === id ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-zinc-600 hover:bg-zinc-900'}">${esc(n)}</button>`).join('')}<button data-bfnew class="shrink-0 rounded-full border border-dashed border-zinc-600 px-4 py-1 text-sm text-zinc-400 hover:bg-zinc-900">+ New folder</button></div>${sel ? '<div class="flex gap-4 border-b border-zinc-800 px-4 py-2 text-sm"><button data-bfren class="text-sky-400 hover:underline">Rename folder</button><button data-bfdel class="text-red-400 hover:underline">Delete folder</button></div>' : ''}`; };
  const show = () => { chips(); f.innerHTML = ''; feed(f, sel ? 'feed=folder:' + sel : 'feed=bookmarks', sel ? 'This folder is empty. Use “Move to folder” on a bookmarked post.' : 'Save posts to find them here later.'); };
  v._bSel = (id) => { sel = id; show(); }; v._bGet = () => folders.find((x) => x.id === sel);
  v._bReload = async () => { folders = await api('/folders'); if (sel && !folders.some((x) => x.id === sel)) sel = ''; show(); };
  try { folders = await api('/folders'); } catch {}
  show(); pg.refresh = () => refreshVisible(f);
}

async function folderDlg(pid) {
  try {
    const fs = await api('/folders?post=' + pid);
    openDlg(`<div class="p-4"><h2 class="mb-2 text-xl font-extrabold">Move to folder</h2>${fs.length ? fs.map((x) => `<label class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 hover:bg-zinc-900"><input type="checkbox" data-fotoggle="${x.id}" data-pid="${pid}" ${x.has ? 'checked' : ''} class="h-5 w-5 accent-sky-500"><span class="min-w-0 flex-1 truncate font-semibold">${esc(x.name)}</span><span class="text-xs text-zinc-500">${x.count}</span></label>`).join('') : '<p class="px-3 py-4 text-zinc-500">No folders yet.</p>'}<form id="nff" data-pid="${pid}" class="mt-2 flex gap-2"><input name="name" maxlength="30" required placeholder="New folder" class="${inp}"><button class="shrink-0 rounded-full bg-white px-4 font-bold text-black">Create</button></form><p class="err mt-1 text-sm text-red-400"></p></div>`);
  } catch (x) { toast(x.message, 1); }
}

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset?.fotoggle) { try { const r = await api(`/folders/${t.dataset.fotoggle}/posts/${t.dataset.pid}`, { method: 'POST' }); toast(r.in ? 'Added to folder' : 'Removed from folder'); drop('#/bookmarks'); } catch (x) { t.checked = !t.checked; toast(x.message, 1); } }
});

// Click actions
CLICK.push(async ({ e, b, d, art }) => {
  {
    // bookmark folders
    if (d.bfold !== undefined) return b.closest('.pg')._bSel(d.bfold);
    if ('bfnew' in d) return openDlg('<form id="nff" class="space-y-3 p-6"><h2 class="text-2xl font-extrabold">New folder</h2><input name="name" maxlength="30" required placeholder="Folder name" class="' + inp + '"><p class="err text-sm text-red-400"></p><button class="w-full rounded-full bg-sky-500 py-2.5 font-bold text-white">Create</button></form>');
    if ('bfren' in d) { const v = b.closest('.pg'), fo = v._bGet(), n = prompt('Rename folder', fo?.name || ''); if (!n || !n.trim()) return; await api('/folders/' + fo.id, { method: 'PATCH', body: JSON.stringify({ name: n }) }); return v._bReload(); }
    if ('bfdel' in d) { const v = b.closest('.pg'), fo = v._bGet(); if (!confirm('Delete this folder? The posts stay bookmarked.')) return; await api('/folders/' + fo.id, { method: 'DELETE' }); return v._bReload(); }
  }
  return NEXT;
});

// Form submits
SUBMIT.push(async ({ e, f, body }) => {
  {
    if (f.id === 'nff') {
      const r = await api('/folders', { method: 'POST', body });
      if (f.dataset.pid) { await api(`/folders/${r.id}/posts/${f.dataset.pid}`, { method: 'POST' }); drop('#/bookmarks'); toast('Saved to folder'); return void folderDlg(f.dataset.pid); }
      dlg.close(); const bp = pages['#/bookmarks']; if (bp && cur === '#/bookmarks') await bp.el._bReload(); else drop('#/bookmarks');
    }
  }
  return NEXT;
});
