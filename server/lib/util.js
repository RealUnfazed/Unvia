// Small shared helpers.

const has = (a, id) => a.some((x) => String(x) === String(id));

// Interpolates a fake count between startVal and target as `now` moves from startAt to endAt; no background job needed.
function fakeVal(f) {
  if (!f || !f.target) return 0;
  if (f.mode !== 'gradual') return f.target;
  const now = Date.now(), s = +new Date(f.startAt), e = +new Date(f.endAt);
  if (!s || !e || now >= e) return f.target;
  if (now <= s) return f.startVal || 0;
  return Math.round((f.startVal || 0) + (f.target - (f.startVal || 0)) * (now - s) / (e - s));
}

// Posts scheduled to appear later (fake replies spread over time) are hidden from lists until their moment arrives.
const visible = () => ({ $or: [{ visibleAt: null }, { visibleAt: { $exists: false } }, { visibleAt: { $lte: new Date() } }] });

const OID = /^[a-f0-9]{24}$/;

const oid = (x) => String(x?._id ?? x);

module.exports = { OID, fakeVal, has, oid, visible };
