// Shared building blocks: icons, avatars, badges, buttons, dialogs, user rows.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

const I = { login: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3', reply: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', repost: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3', heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z', mark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z', home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10', user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', back: 'M19 12H5M12 19l-7-7 7-7', bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0', pin: 'M12 17v5M9 3h6l-1 7 3 3v2H7v-2l3-3z', mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6', edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z', send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z', image: 'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21', lists: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75', chart: 'M18 20V10M12 20V4M6 20v-6', views: 'M18 20V10M12 20V4M6 20v-6', folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z', menu: 'M3 12h18M3 6h18M3 18h18', more: 'M5 12h.01M12 12h.01M19 12h.01', sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6', shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6' };

const ic = (n, c = '', fill = false) => `<svg viewBox="0 0 24 24" class="h-[18px] w-[18px] ${c}" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${I[n]}"/></svg>`;

const av = (u, c = 'h-10 w-10') => `<a href="#/u/${esc(u?.username)}" class="${c} grid shrink-0 place-items-center rounded-full font-bold text-white" style="background:hsl(${hue(u?.username)} 55% 42%)">${u?.avatar ? `<img src="${esc(u.avatar)}" class="h-full w-full rounded-full object-cover">` : esc((u?.name || '?')[0].toUpperCase())}</a>`;

const fbtn = (u, on, req) => `<button data-follow="${esc(u)}" class="rounded-full px-4 py-1.5 text-sm font-bold ${on || req ? 'border border-zinc-600 text-zinc-100 hover:border-red-500 hover:text-red-500' : 'bg-white text-black hover:bg-zinc-200'}">${on ? 'Following' : req ? 'Requested' : 'Follow'}</button>`;

const btn = (act, n, h, on = '', fill = false) => `<button data-act="${act}" class="flex min-w-0 max-w-full items-center justify-self-start gap-1 rounded-full p-1.5 relative ${h} ${h.replace('text-', 'bg-')}/10 ${on || ''}">${ic({ like: 'heart', bookmark: 'mark', del: 'trash' }[act] || act, '', fill)}${n ? `<span class="cnt min-w-0 truncate text-[13px]" data-val="${n}">${fmt(n)}</span>` : ''}</button>`;

const guest = () => '<div class="p-10 text-center"><p class="mb-4 text-zinc-400">Log in to see this.</p><button data-login class="rounded-full bg-sky-500 px-6 py-2 font-bold text-white">Log in</button></div>';

const dot = (u, c = 'h-7 w-7 text-xs') => `<span class="${c} grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-white" style="background:hsl(${hue(u?.username)} 55% 42%)">${u?.avatar ? `<img src="${esc(u.avatar)}" class="h-full w-full object-cover">` : esc((u?.name || '?')[0].toUpperCase())}</span>`;

const inp = 'w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-sky-500';

const openDlg = (h) => { dlg.innerHTML = h; if (!dlg.open) dlg.showModal(); };

const openAuth = () => openDlg(`<form id="af" class="space-y-3 p-6"><h2 class="text-2xl font-extrabold">${reg ? 'Create your account' : 'Log in to Unvia'}</h2>
  <input name="username" required autocapitalize="none" placeholder="Username" class="${inp}">${reg ? `<input name="name" placeholder="Display name" class="${inp}">` : ''}
  <input name="password" type="password" required minlength="8" placeholder="Password (8+ characters)" class="${inp}"><p class="err text-sm text-red-400"></p>
  <button class="w-full rounded-full bg-sky-500 py-2.5 font-bold text-white">${reg ? 'Create account' : 'Log in'}</button>
  ${reg ? '' : '<button type="button" data-forgot class="block text-sm text-zinc-500 hover:underline">Forgot password?</button>'}<button type="button" data-sw class="text-sm text-sky-400">${reg ? 'Have an account? Log in' : 'New here? Create an account'}</button></form>`);

const urow = (u) => `<div class="flex items-center gap-3 px-4 py-3">${av(u)}<a href="#/u/${esc(u.username)}" class="min-w-0 flex-1 leading-tight"><div class="truncate font-bold hover:underline">${esc(u.name)}${bdg(u)}</div><div class="truncate text-sm text-zinc-500">@${esc(u.username)}</div></a>${me?.id === u.id ? '' : fbtn(u.username, !!u.isFollowing)}</div>`;

const BC = { verified: ['#1d9bf0', 'Verified'], business: ['#e8b923', 'Verified business'], government: ['#8b98a5', 'Government'], owner: ['url(#og)', 'Platform owner'] };

const LOCK = '<svg viewBox="0 0 24 24" class="ml-1 inline-block h-[15px] w-[15px] shrink-0 align-[-2px] text-zinc-500" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><title>Protected account</title><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

const bdg = (u) => bdg0(u) + (u?.protected ? LOCK : '');

const bdg0 = (u) => { const b = BC[u?.badge]; return b ? `<svg viewBox="0 0 24 24" class="ml-1 inline-block h-[18px] w-[18px] shrink-0 align-[-3px]" fill="${b[0]}"><title>${b[1]}</title><path d="M12 1l2.6 2.1 3.3-.3 1.2 3.1 3 1.4-.7 3.3 1.5 2.9-2.4 2.3-.4 3.3-3.3.7L12 22l-2.8-2.1-3.3-.7-.4-3.3L3 13.6l1.5-2.9-.7-3.3 3-1.4 1.2-3.1 3.3.3z"/><path d="M8 12.5l2.7 2.7L16 9.5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''; };

const reportDlg = (kind, id) => openDlg(`<div class="p-4"><h2 class="mb-2 text-xl font-extrabold">Report ${kind}</h2><p class="mb-2 text-sm text-zinc-500">What’s going on?</p>${['Spam', 'Abuse or harassment', 'Hate or discrimination', 'Violence or threats', 'Misinformation', 'Something else'].map((r) => `<button data-rep="${r}" data-k="${kind}" data-t="${id}" class="block w-full rounded-xl px-4 py-3 text-left hover:bg-zinc-900">${r}</button>`).join('')}</div>`);

const swt = (on, attr) => `<button ${attr} role="switch" aria-checked="${on}" class="relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-sky-500' : 'bg-zinc-800'}"><i class="absolute top-0.5 h-6 w-6 rounded-full bg-[#fff] shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}"></i></button>`;

const sec = (t, inner, d = '') => `<section class="border-b border-zinc-800 p-4"><h2 class="text-lg font-bold">${t}</h2>${d ? `<p class="mt-1 text-sm text-zinc-500">${d}</p>` : ''}<div class="mt-3 space-y-3">${inner}</div></section>`;

const btnO = 'rounded-full border border-zinc-600 px-4 py-1.5 text-sm font-bold hover:bg-zinc-900';
