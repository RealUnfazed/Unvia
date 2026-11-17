// The click and submit dispatchers: they run each feature's registered handlers until one handles the event.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

// Core handler, runs before every feature's: close an open dialog when a link inside it is clicked.
CLICK.push(async ({ e, b, d, art }) => {
  {
    if (dlg.open && b?.tagName === 'A' && dlg.contains(b)) dlg.close(); // links inside dialogs navigate and close them
  }
  return NEXT;
});

// ---- click dispatcher ----
document.addEventListener('click', async (e) => {
  const nl = e.target.closest('[data-nlink]'); if (nl && !e.target.closest('a,button')) return void (location.hash = nl.dataset.nlink);
  const cl = e.target.closest('[data-clink]'); if (cl && !e.target.closest('a,button')) return void (location.hash = '#/messages/' + cl.dataset.clink);
  const mb = e.target.closest('[data-mbub]'); if (mb && !e.target.closest('a,button')) return void mb.parentElement.querySelector('.macts')?.classList.toggle('hidden');
  const b = e.target.closest('button,a'), art = e.target.closest('article'), d = b?.dataset || {};
  if (e.target === dlg) return dlg.close();
  if (e.target === gd) return gd.close();
  try {
    for (const handle of CLICK) { if ((await handle({ e, b, d, art })) !== NEXT) return; }
  } catch (x) { toast(x.message, 1); }
});

// ---- submit dispatcher ----
document.addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target, body = JSON.stringify(Object.fromEntries(new FormData(f)));
  if (f.classList.contains('dmf')) return void sendDm(f);
  try {
    for (const handle of SUBMIT) { if ((await handle({ e, f, body })) !== NEXT) return; }
  } catch (x) { f.querySelector('.err').textContent = x.message; }
});
