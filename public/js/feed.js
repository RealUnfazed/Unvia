// Infinite-scroll feeds and the Home page.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

function feed(el, qs, empty) {
  if (el.nextElementSibling?.classList.contains('sent')) el.nextElementSibling.remove();
  const fid = (el._fid = {}); // switching profile tabs invalidates any in-flight load
  let before = '', done = false, busy = false;
  const s = document.createElement('div'); s.className = 'sent min-h-[6rem]'; s.innerHTML = skel; el.after(s);
  const more = async () => {
    if (busy || done) return; busy = true; if (before) s.innerHTML = skel;
    try {
      const ps = await api(`/posts?${qs}${before ? '&before=' + encodeURIComponent(before) : ''}`);
      if (el._fid !== fid) return;
      const shown = ps.filter((p) => !muted(p));
      el.insertAdjacentHTML('beforeend', shown.map(card).join(''));
      if (ps.length < 20) { done = true; s.innerHTML = el.children.length ? '' : `<p class="p-10 text-center text-zinc-500">${empty}</p>`; } else { before = ps.at(-1).feedAt; s.innerHTML = ''; if (!shown.length) { busy = false; return more(); } }
    } catch (x) { done = true; s.innerHTML = `<p class="p-8 text-center text-red-400">${esc(x.message)}</p>`; }
    busy = false;
  };
  new IntersectionObserver((e) => e[0].isIntersecting && more(), { rootMargin: '600px' }).observe(s);
}

function home(v, pg) {
  v.innerHTML = `<div class="sticky top-0 z-10 bg-black/80 backdrop-blur"><div class="flex overflow-x-auto border-b border-zinc-800">${[['all', 'For you'], ['following', 'Following'], ...PL.map((l) => ['list:' + l.id, l.name])].map(([t, l]) => `<button data-tab="${t}" class="relative flex-1 whitespace-nowrap px-4 py-4 text-[15px] hover:bg-zinc-900 ${tab === t ? 'font-bold' : 'text-zinc-500'}">${esc(l)}${tab === t ? '<i class="absolute bottom-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-full bg-sky-500"></i>' : ''}</button>`).join('')}</div></div>${me ? `<div class="hidden border-b border-zinc-800 sm:block">${composer()}</div>` : ''}<div class="f"></div>`;
  const f = v.querySelector('.f');
  feed(f, 'feed=' + tab, tab === 'following' ? 'Follow people to fill this timeline.' : tab.startsWith('list:') ? 'No posts from this list yet.' : 'No posts yet. Write the first one.');
  if (pg) pg.refresh = () => refreshVisible(f);
}
