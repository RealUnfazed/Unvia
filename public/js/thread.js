// A single post with its replies.
// Plain script: all files in public/js share one global scope and load in the order listed in index.html.

async function thread(v, id, pg) {
  v.innerHTML = head('Post');
  try {
    const d = await api('/posts/' + id);
    v.insertAdjacentHTML('beforeend', (d.parent ? card(d.parent) : '') + card(d.post) + '<div class="notes"></div>' + (me ? (d.post.canReply === false ? `<div class="border-b border-zinc-800 p-4 text-sm text-zinc-500">${replyMsg(d.post)}</div>` : `<div class="border-b border-zinc-800">${composer(d.post.id)}</div>`) : '') + d.replies.filter((r) => !muted(r)).map(card).join('') + (d.replies.length ? '' : '<p class="nr p-10 text-center text-zinc-500">No replies yet.</p>'));
    loadNotes(v, d.post.id);
    // Live-refreshes this post's (and its parent's) like/repost/save/reply counts, and reveals any scheduled fake replies as they become visible.
    pg.refresh = async () => {
      try {
        const nd = await api('/posts/' + id);
        if (nd.parent) { P[nd.parent.id] = nd.parent; syncCounts(nd.parent); }
        P[nd.post.id] = nd.post; syncCounts(nd.post);
        if (nd.replies.length > d.replies.length) {
          v.querySelector('.nr')?.remove();
          nd.replies.slice(d.replies.length).forEach((r) => { if (muted(r)) return; P[r.id] = r; v.insertAdjacentHTML('beforeend', card(r)); v.lastElementChild.classList.add('drop'); });
          d.replies = nd.replies;
        }
      } catch {}
    };
  } catch { v.insertAdjacentHTML('beforeend', '<p class="p-10 text-center text-zinc-500">This post doesn’t exist.</p>'); }
}
