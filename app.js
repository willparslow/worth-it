import * as cfg from './firebase-config.js';
const { firebaseConfig, FIREBASE_VERSION } = cfg;

/* ------------------------------------------------------------------ *
 *  Worth It: a gym tracker that shows what each session really costs.
 *  Each person has ONE private Firestore document (users/{uid}) with
 *  their settings, workout types and sessions. Firestore's offline cache
 *  keeps it working with no signal; changes sync when signal returns.
 *  New people need a single-use invite link from someone already using it.
 *  With no Firebase config (or ?demo in the address) it runs in demo
 *  mode: saved on this phone only.
 * ------------------------------------------------------------------ */

const DEL = Symbol('delete');
const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const sheetEl = document.getElementById('sheet');
const celEl = document.getElementById('cel');

let store = null;      // demo or firebase store
let S = null;          // this person's document
let meta = {};         // { fromCache, pending }
let unsub = null;
let me = null;         // { uid, email, name, photo }
let saveError = null;
let onboarding = null; // { screen: 'signin'|'loading'|'invited'|'need'|'message', ... } while not in the app
let renderLater = false;

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

const ui = {
  tab: ['home', 'plan', 'me'].includes(ls.get('wi.tab')) ? ls.get('wi.tab') : 'home',
  sheet: null,
  planMonth: null,
  sound: ls.get('wi.sound') !== '0',
  invites: null,
};

/* ---------------- icons ---------------- */
const ICONS = {
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  legs: '<path d="M9 3v7l-2 11M15 3v7l2 11M9 10h6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8"/>',
  star: '<path d="M12 3l2.2 5.2L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.8-.8z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  run: '<path d="M3 17h15a3 3 0 0 0 3-3c0-1-1-1.5-2-1.7L14 11l-2-4-4 1v3l-5 2z"/><path d="M3 20h18"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l2 7M13 6h3"/>',
  swim: '<path d="M2 17c2 0 2-1.5 4-1.5S8 17 10 17s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><circle cx="16" cy="6" r="2"/><path d="M5 13l5-4 3 3 3-2"/>',
  yoga: '<circle cx="12" cy="5" r="2"/><path d="M12 8v6M5 11l7 3 7-3M7 20l5-6 5 6"/>',
  flame: '<path d="M12 21c4 0 7-2.7 7-6.5 0-4-3-6-4-9-1 2-2 3-3.5 3.5C11 6 10.5 4.5 11 3c-3 2-6 5.5-6 10.5C5 18.3 8 21 12 21z"/>',
};
const ICON_NAMES = Object.keys(ICONS);
const UI = {
  tick: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  down: '<path d="M7 7l10 10M17 9v8H9"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>',
  bin: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.6 0-2.7.9-2.7 2s1 1.6 2.7 2c1.7.4 2.7 1 2.7 2.1s-1.2 1.9-2.7 1.9c-1.2 0-2.1-.4-2.6-1.3M12 6.5V8M12 16v1.5"/>',
};
const svg = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const icon = (name) => svg(ICONS[name] || ICONS.star);
const GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>';

/* ---------------- workout types ---------------- */
const COLORS = ['#FF9F43', '#6F93FF', '#F57AB6', '#B497FF', '#4FD1A5', '#FFD43B', '#FF7A7A', '#5CC8FF', '#A3E635', '#E0A6FF'];
const DEFAULT_TYPES = {
  arms: { name: 'Arms', color: '#FF9F43', icon: 'dumbbell', order: 0 },
  legs: { name: 'Legs', color: '#6F93FF', icon: 'legs', order: 1 },
  core: { name: 'Core', color: '#F57AB6', icon: 'target', order: 2 },
  full: { name: 'Full body', color: '#B497FF', icon: 'star', order: 3, covers: ['arms', 'legs', 'core'] },
};
const activeTypes = () => Object.entries(S.types).filter(([, t]) => !t.archived)
  .map(([id, t]) => ({ id, ...t })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const typeOf = (id) => S.types[id] || { name: 'Workout', color: '#CFC4F2', icon: 'star' };
const typeNames = (types) => types.map((t) => typeOf(t).name).join(' + ');
const sessionLabel = (types) => types.length > 1 ? 'Multiple' : typeOf(types[0]).name;
/** A swatch for a set of workout types: one colour, or a split of several */
function fillFor(types) {
  const cols = [...new Set(types.map((t) => typeOf(t).color))];
  if (!cols.length) return '#CFC4F2';
  if (cols.length === 1) return cols[0];
  const step = 360 / cols.length;
  return `conic-gradient(${cols.map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`).join(', ')})`;
}
const MULTI_FILL = 'conic-gradient(#FF9F43 0deg 120deg, #6F93FF 120deg 240deg, #F57AB6 240deg 360deg)';
/** A pale version of a colour (for selected tiles) */
function soft(hex, amt = 0.32) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c * amt + 255 * (1 - amt));
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

/* ---------------- helpers ---------------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rid = () => Math.random().toString(36).slice(2, 8);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || 'Friend';
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const monthOf = (k) => k.slice(0, 7);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const daysInMonth = (mk) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const monthName = (mk) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long' }); };
const monthYear = (mk) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };
const shiftMonth = (mk, n) => { const [y, m] = mk.split('-').map(Number); return dayKey(new Date(y, m - 1 + n, 1)).slice(0, 7); };
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5);
const today = () => dayKey();
const thisMonth = () => today().slice(0, 7);
function prettyDay(k) {
  const diff = daysBetween(k, today());
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return parseDay(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function agoText(days) {
  if (days == null) return 'Not yet';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function money(n) {
  if (n == null || !isFinite(n)) return '–';
  const r = Math.round(n * 100) / 100;
  return (S?.currency || '£') + (Number.isInteger(r) ? r : r.toFixed(2));
}
const parseMoney = (v) => { const n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return isFinite(n) ? Math.round(n * 100) / 100 : null; };

function toast(msg, ms = 2400) {
  const t = document.getElementById('toast');
  t.innerHTML = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}
function setPath(obj, path, v) {
  const parts = path.split('.');
  let o = obj;
  for (const p of parts.slice(0, -1)) o = (o[p] && typeof o[p] === 'object') ? o[p] : (o[p] = {});
  const last = parts.at(-1);
  if (v === DEL) delete o[last]; else o[last] = v;
}
function makeCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => A[b % A.length]).join('');
}
const appErr = (msg) => Object.assign(new Error(msg), { friendly: true });

function newUser(person, code) {
  return {
    name: person.name, email: person.email || '', createdAt: Date.now(), createdDay: today(), joinedWith: code || '',
    weeklyGoal: 3, dayPass: null, currency: '£', costs: {}, setupDone: false,
    types: JSON.parse(JSON.stringify(DEFAULT_TYPES)), sessions: {},
  };
}

/* ---------------- stores ---------------- */
function demoStore() {
  const K = 'wi.demo.doc', KI = 'wi.demo.invites';
  let doc = null, invites = {};
  try { doc = JSON.parse(ls.get(K) || 'null'); invites = JSON.parse(ls.get(KI) || '{}'); } catch {}
  let signed = ls.get('wi.demo.in') === '1';
  let cb = null, authCb = null;
  const person = { uid: 'demo', email: 'demo@example.com', name: 'Friend', photo: null };
  const save = () => { ls.set(K, JSON.stringify(doc)); ls.set(KI, JSON.stringify(invites)); };
  const emit = () => cb?.(doc ? JSON.parse(JSON.stringify(doc)) : null, { fromCache: false, pending: false });
  if (new URLSearchParams(location.search).has('sample')) { doc = sampleDoc(person); signed = true; ls.set('wi.demo.in', '1'); save(); }
  return {
    kind: 'demo',
    me: () => signed ? person : null,
    onAuth(fn) { authCb = fn; setTimeout(() => fn(signed ? person : null), 0); },
    async google() { signed = true; ls.set('wi.demo.in', '1'); authCb?.(person); },
    async signOut() { signed = false; ls.set('wi.demo.in', '0'); authCb?.(null); },
    start(fn) { cb = fn; setTimeout(emit, 0); return () => { cb = null; }; },
    update(changes) { if (!doc) return; for (const [p, v] of Object.entries(changes)) setPath(doc, p, v); save(); setTimeout(emit, 0); },
    async createAccount(code) { doc = newUser(person, code); save(); setTimeout(emit, 0); },
    async getInvite(code) { return invites[code] || null; },
    async makeInvite(code) { invites[code] = { by: 'demo', byName: S.name, createdAt: Date.now(), usedBy: null }; save(); },
    async myInvites() { return Object.entries(invites).map(([code, v]) => ({ code, ...v })); },
    async cancelInvite(code) { delete invites[code]; save(); },
  };
}
/** Made-up history for trying the app out (?demo&sample) */
function sampleDoc(person) {
  const d = newUser(person, '');
  d.name = 'Tessa'; d.setupDone = true; d.dayPass = 8;
  d.costs[thisMonth()] = 45;
  d.createdDay = dayKey(addDays(new Date(), -70));
  const pattern = [['legs'], ['arms'], ['core'], ['arms', 'core'], ['legs'], ['full'], ['arms']];
  let k = 0;
  for (let i = 70; i >= 1; i--) {
    const day = addDays(new Date(), -i);
    if ([1, 4, 6].includes(day.getDay()) && Math.random() > 0.15) d.sessions[rid() + rid()] = { day: dayKey(day), types: pattern[k++ % pattern.length], at: day.getTime() + 18 * 36e5 };
  }
  return d;
}

async function firebaseStore() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [fbApp, fs, fa] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
    import(`${base}/firebase-auth.js`),
  ]);
  const fapp = fbApp.initializeApp(firebaseConfig);
  const db = fs.initializeFirestore(fapp, {
    // Single-tab mode with forced ownership: the open app always owns the offline cache and sends its own
    // changes (multi-tab mode can leave writes queued behind a suspended copy of the page on iPhone).
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentSingleTabManager({ forceOwnership: true }) }),
  });
  const auth = fa.getAuth(fapp);
  const meNow = () => {
    const u = auth.currentUser; if (!u) return null;
    const email = (u.email || '').toLowerCase();
    return { uid: u.uid, email, name: firstName(u.displayName || email.split('@')[0]), photo: u.photoURL || null };
  };
  const U = () => fs.doc(db, 'users', auth.currentUser.uid);
  const INV = (code) => fs.doc(db, 'invites', code);
  const toFs = (changes) => {
    const out = {};
    for (const [p, v] of Object.entries(changes)) out[p] = v === DEL ? fs.deleteField() : v;
    return out;
  };
  return {
    kind: 'firebase',
    me: meNow,
    onAuth: (fn) => fa.onAuthStateChanged(auth, fn),
    async google() {
      const provider = new fa.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      // Popup only: the redirect flow breaks on iPhones when the app isn't hosted on Firebase's own domain
      await fa.signInWithPopup(auth, provider);
    },
    signOut: () => fa.signOut(auth),
    start(fn, onErr) {
      return fs.onSnapshot(U(), { includeMetadataChanges: true }, (snap) => {
        fn(snap.exists() ? snap.data() : null, { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });
      }, onErr);
    },
    // Not awaited: with no signal Firestore applies the change on the phone at once and sends it later.
    update(changes) {
      fs.updateDoc(U(), toFs(changes)).then(() => { if (saveError) { saveError = null; render(); } }).catch((e) => {
        console.error('Save failed', e);
        saveError = e.code || e.message; render();
      });
    },
    /** Make this person's space. Needs signal: a transaction checks and uses up the invite on the server. */
    async createAccount(code) {
      const person = meNow();
      await fs.runTransaction(db, async (tx) => {
        const u = await tx.get(U());
        if (u.exists()) return;
        if (code) {
          const c = await tx.get(INV(code));
          if (!c.exists()) throw appErr('That invite code isn’t right. Check it with whoever sent it.');
          if (c.data().usedBy) throw appErr('That invite has already been used. Ask for a fresh one.');
          tx.update(INV(code), { usedBy: person.uid, usedByName: person.name, usedAt: Date.now() });
        }
        tx.set(U(), newUser(person, code));
      });
    },
    async getInvite(code) { const s = await fs.getDoc(INV(code)); return s.exists() ? s.data() : null; },
    async makeInvite(code) { await fs.setDoc(INV(code), { by: auth.currentUser.uid, byName: S.name, createdAt: Date.now(), usedBy: null }); },
    async myInvites() {
      const r = await fs.getDocs(fs.query(fs.collection(db, 'invites'), fs.where('by', '==', auth.currentUser.uid)));
      return r.docs.map((d) => ({ code: d.id, ...d.data() }));
    },
    cancelInvite: (code) => fs.deleteDoc(INV(code)),
  };
}

/* ---------------- derived data ---------------- */
function normalize(d) {
  d.sessions ||= {}; d.costs ||= {};
  if (!d.types || !Object.keys(d.types).length) d.types = JSON.parse(JSON.stringify(DEFAULT_TYPES));
  d.weeklyGoal = clamp(Math.round(Number(d.weeklyGoal) || 3), 1, 14);
  d.currency ||= '£';
  d.name ||= me?.name || 'Friend';
  return d;
}
function sessionList() {
  return Object.entries(S.sessions).map(([id, s]) => ({ id, ...s }))
    .filter((s) => typeof s.day === 'string' && Array.isArray(s.types))
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : (b.at || 0) - (a.at || 0)));
}
const inMonth = (mk) => sessionList().filter((s) => monthOf(s.day) === mk);
const onDay = (k) => sessionList().filter((s) => s.day === k).reverse();
function inWeek(monday) {
  const a = dayKey(monday), b = dayKey(addDays(monday, 6));
  return sessionList().filter((s) => s.day >= a && s.day <= b);
}
/** The membership cost for a month: the latest amount set on or before it */
function costFor(mk) {
  const keys = Object.keys(S.costs).filter((k) => Number(S.costs[k]) > 0).sort();
  if (!keys.length) return null;
  let v = S.costs[keys[0]];
  for (const k of keys) if (k <= mk) v = S.costs[k];
  return Number(v);
}
/** The first day that counts for a month: the 1st, or the day you joined if that was later */
const firstCountedDay = (mk) => (S.createdDay && monthOf(S.createdDay) === mk) ? Number(S.createdDay.slice(8)) : 1;
const monthGoal = (mk) => Math.max(1, Math.round(S.weeklyGoal * (daysInMonth(mk) - firstCountedDay(mk) + 1) / 7));
/** Weeks in a row the goal was met, counting back from the week starting `monday` */
function streakFrom(monday, extra = 0) {
  let k = 0, mon = monday, first = true;
  const start = S.createdDay || '2000-01-01';
  while (dayKey(addDays(mon, 6)) >= start) {
    const n = inWeek(mon).length + (first ? extra : 0);
    if (n < S.weeklyGoal) break;
    k++; first = false; mon = addDays(mon, -7);
  }
  return k;
}
function currentStreak() {
  const mon = mondayOf(new Date());
  const now = inWeek(mon).length >= S.weeklyGoal;
  return now ? streakFrom(mon) : streakFrom(addDays(mon, -7));
}
/** When a workout type was last trained (Full body counts for arms, legs and core) */
function lastTrained(typeId) {
  const coveredBy = Object.entries(S.types).filter(([, t]) => t.covers?.includes(typeId)).map(([id]) => id);
  const s = sessionList().find((x) => x.types.includes(typeId) || x.types.some((t) => coveredBy.includes(t)));
  return s ? s.day : null;
}
function suggestion() {
  const cands = activeTypes().filter((t) => !t.covers?.length);
  if (!cands.length) return null;
  const scored = cands.map((t) => { const last = lastTrained(t.id); return { ...t, last, days: last ? daysBetween(last, today()) : null }; });
  const never = scored.find((t) => t.days == null);
  if (never) return never;
  return scored.sort((a, b) => b.days - a.days)[0];
}

/* ---------------- sound and buzz ---------------- */
let actx = null;
function cheer(tier = 1) {
  try { navigator.vibrate?.(tier > 1 ? [40, 60, 40, 60, 80] : [30, 40, 30]); } catch {}
  if (!ui.sound) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const notes = tier >= 3 ? [523, 659, 784, 1047, 1319, 1568] : tier === 2 ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      const t = actx.currentTime + i * 0.09;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (i === notes.length - 1 ? 0.6 : 0.2));
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.7);
    });
  } catch {}
}

/* ---------------- the praise ---------------- */
const HEADLINES = ['Absolute machine!', 'Look at you go!', 'Unstoppable!', 'Legend behaviour!', 'Smashed it!', 'Gym hero!', 'Get in!', 'Beast mode!', 'Superstar!', 'Strong work!', 'Iconic!', 'Nailed it!', 'You’re on fire!', 'Powerhouse!'];
const GOAL_HEADLINES = ['Goal smashed!', 'Weekly goal: done!', 'You did it!', 'Target hit!'];
const MESSAGES = [
  (n, t) => `${t} done. ${n}, you’re unstoppable.`,
  (n) => `${n}, your future self says thank you.`,
  (n) => `Another one in the bank, ${n}.`,
  (n) => `${n}, that’s what commitment looks like.`,
  (n) => `The gym’s lucky to have you, ${n}.`,
  (n, t) => `${t}? Sorted. ${n}, you’re on fire.`,
  (n) => `${n}, you showed up. That’s the hardest bit.`,
  (n) => `Proud of you, ${n}. Seriously.`,
  (n, t) => `${t} ticked off. Stronger every time, ${n}.`,
  (n) => `${n}, you make this look easy.`,
];
const BUTTONS = ['Yes I am', 'I know', 'Too easy', 'Let’s go!', 'Thanks, I’m brilliant', 'Keep it coming'];
const MILESTONES = [10, 25, 50, 75, 100, 150, 200, 250, 300, 365, 400, 500, 600, 700, 800, 900, 1000];

function logSession(types, day) {
  const mk = monthOf(day);
  const before = inMonth(mk).length;
  const c = costFor(mk);
  const mon = mondayOf(parseDay(day));
  const wk = inWeek(mon).length + 1;
  const total = sessionList().length + 1;
  const goal = S.weeklyGoal;
  update({ [`sessions.${rid()}${rid()}`]: { day, types, at: Date.now() } });

  const n = before + 1;
  const name = S.name;
  const tText = typeNames(types);
  let tier = 1;
  let headline = pick(HEADLINES);
  let msg = pick(MESSAGES)(name, tText);
  const badges = [];
  const isThisWeek = dayKey(mon) === dayKey(mondayOf(new Date()));

  if (n === 1) { headline = pick(['First of the month!', `Hello ${monthName(mk)}!`]); msg = `Fresh month, fresh start. ${name}, you’re off the mark.`; tier = 2; }
  if (wk === goal) {
    const streak = streakFrom(addDays(mon, -7)) + 1;
    headline = pick(GOAL_HEADLINES); tier = Math.max(tier, 2);
    badges.push({ icon: ICONS.star, t: 'Weekly goal smashed', s: streak > 1 ? `${wk} of ${goal} that week, and ${streak} weeks in a row` : `${wk} of ${goal}${isThisWeek ? ' this week' : ' that week'}. Brilliant.` });
  } else if (wk > goal) {
    badges.push({ icon: ICONS.flame, t: 'Bonus session!', s: `${wk} ${isThisWeek ? 'this' : 'that'} week and the goal was ${goal}. Overachiever.` });
  } else if (isThisWeek && goal - wk === 1) {
    badges.push({ icon: UI.arrow, t: 'One more for your weekly goal', s: `${wk} of ${goal} this week` });
  } else if (isThisWeek) {
    badges.push({ icon: UI.arrow, t: `${wk} of ${goal} this week`, s: `${goal - wk} more to hit your goal` });
  }
  if (c && S.dayPass > 0) {
    const was = before ? c / before : Infinity, now = c / n;
    if (was >= S.dayPass && now < S.dayPass) {
      tier = Math.max(tier, 2);
      badges.unshift({ icon: UI.coin, t: 'Officially worth it', s: `Each session now costs less than a ${money(S.dayPass)} day pass` });
    }
  }
  if (MILESTONES.includes(total)) {
    tier = 3; headline = `${total} sessions!`;
    msg = `${name}, that’s ${total} times you’ve turned up. Incredible.`;
    badges.unshift({ icon: UI.trophy, t: 'All-time milestone', s: `${total} sessions since you started` });
  }

  let cost = '';
  if (c) {
    const now = c / n;
    let sub;
    if (S.dayPass > 0) {
      if (now < S.dayPass) sub = `<span class="good">That’s ${money(S.dayPass - now)} less than a day pass. Worth it!</span>`;
      else { const need = Math.floor(c / S.dayPass) + 1 - n; sub = `<span class="meh">${plural(need, 'more session')} and it’s cheaper than a day pass.</span>`; }
    } else sub = `<span class="good">Next one drops it to ${money(c / (n + 1))}.</span>`;
    cost = before
      ? `<div class="costcard"><span class="k">Each session now costs</span><div class="from-to"><s>${money(c / before)}</s>${svg(UI.arrow).replace('<svg', '<svg class="arrow"')}<b>${money(now)}</b></div>${sub}</div>`
      : `<div class="costcard"><span class="k">First session of ${esc(monthName(mk))}</span><div class="from-to"><b>${money(now)}</b></div><span class="meh">Every visit from here makes each one cheaper.</span></div>`;
  }
  celebrate({ tier, kick: `Session ${n} of ${monthName(mk)}`, headline, msg, cost, badges: badges.slice(0, 2) });
}

function celebrate({ tier, kick, headline, msg, cost, badges }) {
  const colors = ['#C8F560', '#FFD43B', '#FFFFFF', '#6F93FF', '#FF9F43', '#F57AB6', '#4FD1A5'];
  const count = tier >= 3 ? 150 : tier === 2 ? 90 : 50;
  let bits = '';
  for (let i = 0; i < count; i++) {
    const dur = rnd(2.2, 4.2), delay = rnd(0, tier >= 3 ? 2.5 : 1.2);
    bits += `<i class="${Math.random() < 0.3 ? 'r' : ''}" style="left:${rnd(-2, 100).toFixed(1)}%;background:${pick(colors)};animation-duration:${dur.toFixed(2)}s;animation-delay:${delay.toFixed(2)}s;--dx:${rnd(-80, 80).toFixed(0)}px;--rot:${rnd(200, 900).toFixed(0)}deg"></i>`;
  }
  celEl.innerHTML = `<div class="cel tier${tier}" role="dialog" aria-modal="true" aria-labelledby="cel-h">
    <div class="confetti" aria-hidden="true">${bits}</div>
    <div class="inner">
      <div class="trophy">${svg(tier >= 3 ? UI.trophy : tier === 2 ? ICONS.star : UI.trophy)}</div>
      <span class="kick">${esc(kick)}</span>
      <h2 id="cel-h">${esc(headline)}</h2>
      <p class="msg">${esc(msg)}</p>
      ${cost}
      ${badges.map((b) => `<div class="badge"><span class="bi">${svg(b.icon)}</span><div><b>${esc(b.t)}</b><span>${esc(b.s)}</span></div></div>`).join('')}
      <div class="spacer"></div>
      <button type="button" class="go white" data-action="close-cel">${esc(pick(BUTTONS))}</button>
    </div></div>`;
  document.getElementById('toast').classList.remove('show');
  cheer(tier);
  celEl.querySelector('.go')?.focus({ preventScroll: true });
}
const closeCel = () => { celEl.innerHTML = ''; };

/* ---------------- views ---------------- */
function syncBadge() {
  if (store?.kind === 'demo') return '<span class="sync demo">Demo · this phone only</span>';
  if (saveError) return `<span class="sync error">Not saved: ${esc(saveError)}</span>`;
  if (!navigator.onLine || meta.fromCache) return '<span class="sync offline">Offline · saved on phone</span>';
  if (meta.pending) return '<span class="sync pending">Saving…</span>';
  return '<span class="sync">Synced ✓</span>';
}
function header() {
  const h = new Date().getHours();
  const metGoal = inWeek(mondayOf(new Date())).length >= S.weeklyGoal;
  const hello = metGoal ? `${esc(S.name)}, you legend` : `${h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'}, ${esc(S.name)}`;
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<header class="top"><div><div class="date">${date}</div><h1>${hello}</h1></div>${syncBadge()}</header>`;
}

function homeView() {
  const mk = thisMonth();
  const n = inMonth(mk).length;
  const c = costFor(mk);
  const per = c && n ? c / n : null;

  let hero;
  if (!c) {
    hero = `<div class="hero"><span class="label">${esc(monthName(mk))} so far</span>
      <div class="big"><b class="smaller">${plural(n, 'session')}</b></div>
      <span class="sum">Add what you pay each month to see what every session costs.</span>
      <button type="button" class="setcost" data-action="tab" data-tab="me">Add your membership cost</button></div>`;
  } else if (!n) {
    hero = `<div class="hero"><span class="label">${esc(monthName(mk))} so far</span>
      <div class="big"><b class="smaller">${money(c)}</b><span>paid, no sessions yet</span></div>
      <span class="sum">Every visit makes each session cheaper.</span>
      <div class="nudge">${svg(UI.down)}Go once and it’s ${money(c)}. Twice: ${money(c / 2)}</div></div>`;
  } else {
    let worth = '';
    if (S.dayPass > 0) {
      worth = per < S.dayPass
        ? `<div class="nudge gold">${svg(UI.coin)}Worth it! ${money(S.dayPass - per)} cheaper than a day pass</div>`
        : `<div class="nudge gold">${svg(UI.coin)}${plural(Math.floor(c / S.dayPass) + 1 - n, 'more session')} to beat a ${money(S.dayPass)} day pass</div>`;
    }
    hero = `<div class="hero"><span class="label">${esc(monthName(mk))} so far</span>
      <div class="big"><b>${money(per)}</b><span>per session</span></div>
      <span class="sum">${money(c)} a month ÷ ${plural(n, 'session')}</span>
      <div class="nudge">${svg(UI.down)}One more and it drops to ${money(c / (n + 1))}</div>${worth}</div>`;
  }

  // This week
  const mon = mondayOf(new Date());
  const tk = today();
  const goal = S.weeklyGoal;
  const wk = inWeek(mon).length;
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const days = letters.map((l, i) => {
    const k = dayKey(addDays(mon, i));
    const ss = onDay(k);
    const types = [...new Set(ss.flatMap((s) => s.types))];
    const isToday = k === tk, future = k > tk;
    const dot = ss.length
      ? `<div class="dot on" style="background:${fillFor(types)}">${svg(UI.tick)}${ss.length > 1 ? `<span class="times">×${ss.length}</span>` : ''}</div>`
      : `<div class="dot${future ? ' future' : ''}"></div>`;
    const lbl = ss.length ? (types.length > 1 ? 'Mix' : typeOf(types[0]).name) : (isToday ? 'Today' : '');
    return `<div class="day${isToday ? ' today' : ''}" aria-label="${parseDay(k).toLocaleDateString('en-GB', { weekday: 'long' })}: ${ss.length ? esc(typeNames(types)) : 'no session'}"><span class="dl" aria-hidden="true">${l}</span>${dot}<span class="dn" aria-hidden="true">${esc(lbl) || '&nbsp;'}</span></div>`;
  }).join('');
  const streak = currentStreak();
  let weekMsg;
  if (!wk) weekMsg = 'Fresh week. Let’s get the first one in!';
  else if (wk < goal) weekMsg = goal - wk === 1 ? 'One more and you’ve smashed your weekly goal.' : `${goal - wk} more to hit your goal. You’ve got this.`;
  else if (wk === goal) weekMsg = 'Weekly goal smashed! Anything else is a bonus.';
  else weekMsg = `Goal smashed, plus ${plural(wk - goal, 'bonus session')}!`;
  if (streak >= 2) weekMsg += ` ${streak} weeks in a row.`;

  // This month
  const mg = monthGoal(mk);
  const first = firstCountedDay(mk);
  const counted = new Date().getDate() - first + 1, span = daysInMonth(mk) - first + 1;
  const expected = Math.floor(mg * counted / span);
  let pace;
  if (n >= mg) pace = '<span class="tag good">Goal reached!</span>';
  else if (n > expected) pace = '<span class="tag good">Ahead of pace</span>';
  else if (n === expected) pace = '<span class="tag good">On pace</span>';
  else pace = `<span class="tag muted">Catch-up time</span>`;

  const todays = onDay(tk);
  const been = todays.length
    ? `<p class="went-today">Been today: ${esc(typeNames([...new Set(todays.flatMap((s) => s.types))]))}. Go you!</p>` : '';

  return `<main class="view">
    ${hero}
    <section class="card" aria-label="This week">
      <div class="card-head"><h2>This week</h2><span class="tag${wk >= goal ? ' good' : ''}">${wk} of ${goal}</span></div>
      <div class="week">${days}</div>
      <p class="note">${weekMsg}</p>
    </section>
    <section class="card" aria-label="This month">
      <div class="card-head"><h2>This month</h2>${pace}</div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${mg}" aria-valuenow="${n}"><i style="width:${Math.min(100, (n / mg) * 100).toFixed(1)}%"></i><span class="pace" style="left:calc(${Math.min(100, (expected / mg) * 100).toFixed(1)}% - 1.5px)"></span></div>
      <p class="note">${n} of ${plural(mg, 'session')} · goal is ${goal} a week</p>
    </section>
    ${been}
    <button type="button" class="go" data-action="open-log">${svg(UI.tick)}${todays.length ? 'Went again? Tick it off' : 'I went! Tick it off'}</button>
  </main>`;
}

function planView() {
  const tk = today();
  const mk = ui.planMonth || thisMonth();
  const sess = inMonth(mk);
  const n = sess.length;
  const c = costFor(mk);
  const firstMonth = [S.createdDay, ...sessionList().map((s) => s.day)].filter(Boolean).sort()[0]?.slice(0, 7) || thisMonth();

  // Up next
  let next = '';
  const sug = suggestion();
  if (sug) {
    const wentToday = onDay(tk).length > 0;
    let line;
    if (sug.days == null) line = `You’ve not logged ${esc(sug.name.toLowerCase())} yet. Fancy it?`;
    else if (sug.days === 0) line = 'You’ve trained everything today. Rest up, superstar.';
    else line = `${plural(sug.days, 'day')} since your last ${esc(sug.name.toLowerCase())} session.`;
    next = `<div class="upnext" style="background:${sug.color}"><span class="ico">${icon(sug.icon)}</span><div>
      <div class="k">${wentToday ? 'Next time?' : 'Up next?'}</div><div class="t">${esc(sug.name)} day</div><div class="s">${line}</div></div></div>`;
  }

  // Mix
  const types = activeTypes();
  const rows = types.map((t) => {
    const cnt = sess.filter((s) => s.types.includes(t.id)).length;
    const last = lastTrained(t.id);
    const dots = cnt ? Array.from({ length: Math.min(cnt, 8) }, () => `<i style="background:${t.color}"></i>`).join('') + (cnt > 8 ? `<em>+${cnt - 8}</em>` : '') : '<em>None yet</em>';
    return `<span class="n">${esc(t.name)}</span><div class="dots" aria-label="${plural(cnt, 'session')}">${dots}</div><span class="l">${last ? esc(agoText(daysBetween(last, tk))) : '–'}</span>`;
  }).join('');
  const multi = sess.filter((s) => s.types.length > 1).length;
  const multiRow = multi ? `<span class="n">Multiple</span><div class="dots">${Array.from({ length: Math.min(multi, 8) }, () => `<i style="background:${MULTI_FILL}"></i>`).join('')}${multi > 8 ? `<em>+${multi - 8}</em>` : ''}</div><span class="l"></span>` : '';

  // Calendar
  const [y, m] = mk.split('-').map(Number);
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="h" aria-hidden="true">${d}</span>`).join('');
  for (let i = 0; i < offset; i++) cells += '<span class="c blank"></span>';
  for (let d = 1; d <= daysInMonth(mk); d++) {
    const k = `${mk}-${pad(d)}`;
    const ss = onDay(k);
    const ts = [...new Set(ss.flatMap((s) => s.types))];
    const cls = ['c', k === tk ? 'today' : '', k > tk ? 'future' : ''].filter(Boolean).join(' ');
    const style = ss.length ? ` style="background:${fillFor(ts)}"` : '';
    cells += `<span class="${cls}"${style}${ss.length ? ` aria-label="${d}: ${esc(typeNames(ts))}"` : ''}>${d}${ss.length > 1 ? `<span class="x2">×${ss.length}</span>` : ''}</span>`;
  }
  const legend = types.map((t) => `<span><i style="background:${t.color}"></i>${esc(t.name)}</span>`).join('') + `<span><i style="background:${MULTI_FILL}"></i>Multiple</span>`;

  const list = sess.length
    ? sess.map((s) => `<button type="button" class="srow" data-action="session" data-id="${esc(s.id)}">
        <span class="sw" style="background:${fillFor(s.types)}">${s.types.length === 1 ? icon(typeOf(s.types[0]).icon) : ''}</span>
        <span class="tx"><b>${esc(typeNames(s.types))}</b><span>${esc(prettyDay(s.day))}</span></span>${svg(UI.bin).replace('<svg', '<svg class="bin"')}</button>`).join('')
    : `<p class="empty">No sessions logged in ${esc(monthName(mk))}.</p>`;

  const goal = monthGoal(mk);
  return `<main class="view">
    <h1 class="sr">Plan</h1>
    ${next}
    <section class="card" aria-label="Month">
      <div class="monthnav">
        <button type="button" class="iconbtn" data-action="month" data-dir="-1" aria-label="Previous month" ${mk <= firstMonth ? 'disabled' : ''}>${svg(UI.left)}</button>
        <h2>${esc(mk === thisMonth() ? monthName(mk) : monthYear(mk))}</h2>
        <button type="button" class="iconbtn" data-action="month" data-dir="1" aria-label="Next month" ${mk >= thisMonth() ? 'disabled' : ''}>${svg(UI.right)}</button>
      </div>
      <div class="monthsum">
        <div><b>${n}</b><span>${n === 1 ? 'session' : 'sessions'} of ${goal}</span></div>
        <div><b>${c && n ? money(c / n) : c ? money(c) : '–'}</b><span>${c && n ? 'per session' : c ? 'paid' : 'no cost set'}</span></div>
      </div>
      <div class="cal">${cells}</div>
      <div class="legend">${legend}</div>
    </section>
    <section class="card" aria-label="Mix">
      <div class="card-head"><h2>${esc(monthName(mk))} mix</h2><span class="tag muted">last trained</span></div>
      <div class="mix">${rows}${multiRow}</div>
    </section>
    <section class="card" aria-label="Sessions">
      <div class="card-head"><h2>Sessions</h2><span class="tag muted">tap to remove</span></div>
      <div class="sessions">${list}</div>
    </section>
  </main>`;
}

function meView() {
  const total = sessionList().length;
  const since = S.createdDay ? monthYear(S.createdDay.slice(0, 7)) : '';
  const cost = costFor(thisMonth());
  const photo = me?.photo ? `<img src="${esc(me.photo)}" alt="" referrerpolicy="no-referrer">` : esc(S.name.slice(0, 1).toUpperCase());
  const types = activeTypes();
  const inv = ui.invites;
  let invites = '<p class="small">Each link works once and gives them their own private space.</p>';
  if (inv) {
    const open = inv.filter((i) => !i.usedBy).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const joined = inv.filter((i) => i.usedBy).length;
    invites = open.map((i) => `<div class="invite-row"><code>${esc(i.code)}</code><button type="button" data-action="share-invite" data-code="${esc(i.code)}">Share</button><button type="button" data-action="cancel-invite" data-code="${esc(i.code)}">Cancel</button></div>`).join('')
      + `<p class="small">${joined ? `${plural(joined, 'friend has', 'friends have')} joined from your invites.` : 'Each link works once and gives them their own private space.'}</p>`;
  }
  return `<main class="view">
    <div class="me-head"><span class="avatar">${photo}</span><div><div class="nm">${esc(S.name)}</div><div class="sub">${plural(total, 'session')}${since ? ` since ${esc(since)}` : ''}</div></div></div>

    <section class="card settings" aria-label="Settings">
      <label class="set"><span class="lbl"><b>Membership</b><span>What you pay each month</span></span>
        <span class="money">${esc(S.currency)}<input type="text" inputmode="decimal" data-field="cost" value="${cost != null ? esc(cost.toFixed(2)) : ''}" placeholder="0.00" aria-label="Monthly cost"></span></label>
      <div class="set"><span class="lbl"><b>Weekly goal</b><span>Sessions a week</span></span>
        <span class="stepper"><button type="button" data-action="goal" data-d="-1" aria-label="One fewer" ${S.weeklyGoal <= 1 ? 'disabled' : ''}>−</button><b aria-live="polite">${S.weeklyGoal}</b><button type="button" class="plus" data-action="goal" data-d="1" aria-label="One more" ${S.weeklyGoal >= 14 ? 'disabled' : ''}>+</button></span></div>
      <label class="set"><span class="lbl"><b>Day pass price</b><span>Optional: your worth-it line</span></span>
        <span class="money">${esc(S.currency)}<input type="text" inputmode="decimal" data-field="dayPass" value="${S.dayPass > 0 ? esc(Number(S.dayPass).toFixed(2)) : ''}" placeholder="–" aria-label="Day pass price"></span></label>
      <label class="set"><span class="lbl"><b>Currency</b></span>
        <select class="pick" data-field="currency" aria-label="Currency">${['£', '€', '$'].map((x) => `<option${x === S.currency ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
    </section>

    <section class="card" aria-label="Your workouts">
      <div class="card-head"><h2>Your workouts</h2><button type="button" class="link" data-action="open-types">Edit</button></div>
      <div class="chips">${types.map((t) => `<span class="chip"><i style="background:${t.color}">${icon(t.icon)}</i>${esc(t.name)}</span>`).join('')}</div>
      <button type="button" class="btn wide" data-action="new-type">${svg(UI.plus)}Add a workout</button>
    </section>

    <section class="card buddy" aria-label="Invite a friend">
      <h2>Bring a gym buddy</h2>
      <p>They get their own private Worth It. Nobody sees anyone else’s sessions.</p>
      <button type="button" class="btn lime" data-action="invite">${svg(UI.share)}Share an invite link</button>
      ${invites}
    </section>

    <section class="card listcard" aria-label="More">
      <button type="button" data-action="rename">Your name <span class="tag muted">${esc(S.name)}</span></button>
      <button type="button" data-action="sound" role="switch" aria-checked="${ui.sound}">Sounds and buzz <span class="switch" aria-hidden="true" aria-checked="${ui.sound}"></span></button>
      <button type="button" data-action="backup">Download a backup</button>
      <button type="button" data-action="sign-out">Sign out</button>
    </section>
    <p class="foot">${store.kind === 'demo' ? 'Demo mode: saved on this phone only' : `Signed in as ${esc(me?.email || '')}`}</p>
  </main>`;
}

/* ---------------- sheets ---------------- */
function sheetHTML() {
  const s = ui.sheet;
  if (!s) return '';
  let body = '';
  if (s.type === 'log') {
    const tk = today(), yk = dayKey(addDays(new Date(), -1));
    const tiles = activeTypes().map((t) => {
      const on = s.picked.includes(t.id);
      const last = lastTrained(t.id);
      const lastTxt = last ? `Last: ${agoText(daysBetween(last, tk))}` : (t.covers?.length ? 'Everything at once' : 'Not done yet');
      return `<button type="button" class="tile" data-action="pick" data-id="${esc(t.id)}" aria-pressed="${on}" style="${on ? `background:${soft(t.color)}` : ''}">
        <span class="ck">${svg(UI.tick)}</span><span class="ti" style="background:${t.color}">${icon(t.icon)}</span><b>${esc(t.name)}</b><span class="last">${esc(lastTxt)}</span></button>`;
    }).join('');
    const combo = s.picked.length > 1 ? `<div class="combo">${svg(ICONS.star)}${esc(typeNames(s.picked))}: saved as a multiple session</div>` : '';
    const other = s.day !== tk && s.day !== yk;
    body = `<h2 id="sheet-h">${esc(s.title)}</h2><p class="lead">Pick one, or tap a few for a mixed session.</p>
      <div class="tiles">${tiles}<button type="button" class="tile add" data-action="new-type" data-back="log"><span class="ti">${svg(UI.plus)}</span><b>New workout</b></button></div>
      ${combo}
      <span class="k">When</span>
      <div class="when">
        <button type="button" data-action="day" data-day="${tk}" aria-pressed="${s.day === tk}">Today</button>
        <button type="button" data-action="day" data-day="${yk}" aria-pressed="${s.day === yk}">Yesterday</button>
        <label aria-pressed="${other}">${other ? esc(prettyDay(s.day)) : 'Pick a day'}<input type="date" data-field="logday" max="${tk}" value="${esc(s.day)}" aria-label="Pick a day"></label>
      </div>
      <button type="button" class="go" data-action="save-log" ${s.picked.length ? '' : 'disabled'}>Log it!</button>`;
  } else if (s.type === 'type') {
    const editing = !!s.id;
    body = `<h2 id="sheet-h">${editing ? 'Edit workout' : 'New workout'}</h2>
      <label class="k" for="type-name">Name</label>
      <input id="type-name" class="text-in" data-field="typename" maxlength="24" value="${esc(s.name)}" placeholder="e.g. Cardio, Spin, Yoga" autocomplete="off">
      <span class="k">Colour</span>
      <div class="swatches">${COLORS.map((c) => `<button type="button" class="swatch" data-action="type-color" data-c="${c}" aria-pressed="${c === s.color}" aria-label="Colour ${c}" style="background:${c}"></button>`).join('')}</div>
      <span class="k">Icon</span>
      <div class="icons">${ICON_NAMES.map((n) => `<button type="button" data-action="type-icon" data-i="${n}" aria-pressed="${n === s.icon}" aria-label="${n}" style="${n === s.icon ? `background:${soft(s.color)}` : ''}">${icon(n)}</button>`).join('')}</div>
      <button type="button" class="go" data-action="save-type">${editing ? 'Save' : 'Add it'}</button>
      ${editing ? '<button type="button" class="btn danger wide" data-action="remove-type">Remove this workout</button>' : ''}
      <button type="button" class="link" data-action="${s.back ? 'back-sheet' : 'close-sheet'}">Cancel</button>`;
  } else if (s.type === 'types') {
    body = `<h2 id="sheet-h">Your workouts</h2><p class="lead">Rename, recolour or remove them. Past sessions are never lost.</p>
      <div class="typelist">${activeTypes().map((t) => `<div class="trow"><span class="ti" style="background:${t.color}">${icon(t.icon)}</span><b>${esc(t.name)}</b><button type="button" data-action="edit-type" data-id="${esc(t.id)}">Edit</button></div>`).join('')}</div>
      <button type="button" class="btn wide" data-action="new-type" data-back="types">${svg(UI.plus)}Add a workout</button>
      <button type="button" class="go dark" data-action="close-sheet">Done</button>`;
  } else if (s.type === 'session') {
    const x = S.sessions[s.id];
    if (!x) { ui.sheet = null; return ''; }
    body = `<h2 id="sheet-h">Remove this session?</h2><p class="lead">${esc(typeNames(x.types))} · ${esc(prettyDay(x.day))}</p>
      <div class="row"><button type="button" class="btn" data-action="close-sheet">Keep it</button><button type="button" class="btn dark" data-action="delete-session">Remove it</button></div>`;
  } else if (s.type === 'rename') {
    body = `<h2 id="sheet-h">What should we call you?</h2>
      <input class="text-in" data-field="newname" maxlength="24" value="${esc(s.name)}" autocomplete="given-name" aria-label="Your name">
      <button type="button" class="go" data-action="save-name">Save</button>`;
  } else if (s.type === 'confirm') {
    body = `<h2 id="sheet-h">${esc(s.title)}</h2><p class="lead">${esc(s.text)}</p>
      <div class="row"><button type="button" class="btn" data-action="close-sheet">Cancel</button><button type="button" class="btn dark" data-action="confirm-ok">${esc(s.ok)}</button></div>`;
  }
  return `<div class="scrim${s.enter ? ' enter' : ''}" data-action="close-sheet"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="sheet-h" data-action="noop"><div class="grab"></div>${body}</div></div>`;
}
function openSheet(s) { s.enter = !ui.sheet; ui.sheet = s; sheetEl.innerHTML = sheetHTML(); ui.sheet && (ui.sheet.enter = false); }
function refreshSheet() { const top = sheetEl.querySelector('.panel')?.scrollTop; sheetEl.innerHTML = sheetHTML(); if (top) sheetEl.querySelector('.panel').scrollTop = top; }
function closeSheet() { ui.sheet = null; sheetEl.innerHTML = ''; }

/* ---------------- onboarding screens ---------------- */
function renderOnboarding() {
  tabbar.hidden = true; app.classList.add('bare');
  const o = onboarding;
  const shell = (inner) => `<div class="welcome"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>${inner}</div>`;
  const logo = `<div class="logo">${icon('dumbbell')}</div>`;
  if (o.screen === 'loading') { app.innerHTML = '<div class="splash"><div class="spinner"></div><p>Warming up…</p></div>'; return; }
  if (o.screen === 'signin') {
    const invited = !!ls.get('wi.invite');
    app.innerHTML = shell(`${logo}
      <h1>Worth It</h1>
      <p class="pitch">Every session you go, your gym membership gets cheaper. Let’s make it worth it.</p>
      <ul><li><i style="background:#C8F560"></i>See what each session really costs</li><li><i style="background:#FF9F43"></i>Set a weekly goal and smash it</li><li><i style="background:#F57AB6"></i>Know what to train next</li></ul>
      <div class="bottom">
        ${o.msg ? `<p class="err">${esc(o.msg)}</p>` : ''}
        <button type="button" class="google" data-action="google">${GOOGLE_G}Continue with Google</button>
        <p class="fine">${invited ? 'You’ve got an invite! Sign in to claim it.' : 'New here? You’ll need an invite link from a friend.'}</p>
      </div>`);
    return;
  }
  if (o.screen === 'invited') {
    app.innerHTML = shell(`${logo}
      <h1 class="mid">${esc(o.byName || 'A friend')} invited you!</h1>
      <p class="pitch">Your own private gym tracker. Nobody else sees your sessions.</p>
      <div class="bottom">
        ${o.msg ? `<p class="err">${esc(o.msg)}</p>` : ''}
        <button type="button" class="google" data-action="join" data-code="${esc(o.code)}" ${o.busy ? 'disabled' : ''}>${o.busy ? 'Setting you up…' : 'Join Worth It'}</button>
        <button type="button" class="link" data-action="sign-out">Not ${esc(me?.email || 'you')}? Sign out</button>
      </div>`);
    return;
  }
  if (o.screen === 'need') {
    app.innerHTML = shell(`${logo}
      <h1 class="mid">You need an invite</h1>
      <p class="pitch">Worth It is invite only. Ask a friend who uses it to send you an invite link, or type their code here.</p>
      <div class="bottom">
        ${o.msg ? `<p class="err">${esc(o.msg)}</p>` : ''}
        <input class="text-in" data-field="code" maxlength="20" placeholder="Invite code" autocomplete="off" autocapitalize="characters" aria-label="Invite code" value="${esc(o.code || '')}">
        <button type="button" class="google" data-action="join-typed" ${o.busy ? 'disabled' : ''}>${o.busy ? 'Checking…' : 'Join'}</button>
        <button type="button" class="link" data-action="sign-out">Signed in as ${esc(me?.email || '')}. Sign out</button>
      </div>`);
    return;
  }
  if (o.screen === 'message') {
    app.innerHTML = shell(`${logo}<h1 class="mid">${esc(o.title)}</h1><p class="pitch">${esc(o.text)}</p>
      <div class="bottom"><button type="button" class="google" data-action="reload">Try again</button>
      ${me ? '<button type="button" class="link" data-action="sign-out">Sign out</button>' : ''}</div>`);
  }
}
function renderSetup() {
  tabbar.hidden = true; app.classList.add('bare');
  const st = ui.setup ||= { cost: '', goal: 3, dayPass: '', currency: '£' };
  app.innerHTML = `<div class="welcome"><span class="blob b1"></span><span class="blob b3"></span>
    <div class="logo">${icon('dumbbell')}</div>
    <h1 class="mid">Hey ${esc(S.name)}! Let’s set you up</h1>
    <p class="pitch">Two quick things and you’re in. You can change these any time.</p>
    <div class="setup">
      <label class="set"><span class="lbl"><b>Membership</b><span>What you pay each month</span></span>
        <span class="money"><select class="pick" data-field="setup-currency" aria-label="Currency" style="background:transparent;padding:0 2px">${['£', '€', '$'].map((x) => `<option${x === st.currency ? ' selected' : ''}>${x}</option>`).join('')}</select><input type="text" inputmode="decimal" data-field="setup-cost" value="${esc(st.cost)}" placeholder="0.00" aria-label="Monthly cost"></span></label>
      <div class="set"><span class="lbl"><b>Weekly goal</b><span>Sessions a week</span></span>
        <span class="stepper"><button type="button" data-action="setup-goal" data-d="-1" aria-label="One fewer" ${st.goal <= 1 ? 'disabled' : ''}>−</button><b aria-live="polite">${st.goal}</b><button type="button" class="plus" data-action="setup-goal" data-d="1" aria-label="One more" ${st.goal >= 14 ? 'disabled' : ''}>+</button></span></div>
      <label class="set"><span class="lbl"><b>Day pass price</b><span>Optional: what one visit costs without a membership</span></span>
        <span class="money">${esc(st.currency)}<input type="text" inputmode="decimal" data-field="setup-daypass" value="${esc(st.dayPass)}" placeholder="–" aria-label="Day pass price"></span></label>
    </div>
    <div class="bottom"><button type="button" class="google" data-action="finish-setup">Let’s go!</button></div>
  </div>`;
}

/* ---------------- render ---------------- */
function render() {
  if (onboarding) return renderOnboarding();
  if (!S) return;
  if (!S.setupDone) return renderSetup();
  // Don't wipe what someone's typing; catch up when they leave the box
  const a = document.activeElement;
  if (a && app.contains(a) && a.matches('input, select')) { renderLater = true; return; }
  renderLater = false;
  tabbar.hidden = false; app.classList.remove('bare');
  for (const b of tabbar.querySelectorAll('button')) b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false');
  const view = ui.tab === 'plan' ? planView() : ui.tab === 'me' ? meView() : homeView();
  app.innerHTML = header() + view;
}
document.addEventListener('focusout', () => { if (renderLater) setTimeout(() => { if (renderLater) render(); }, 0); });

function update(changes) { store.update(changes); }

/* ---------------- actions ---------------- */
let confirmFn = null;
const LOG_TITLES = ['Nice one! What did you train?', 'Yes! What did you work on?', 'Get in! What was it today?', 'Love that. What did you train?'];

const actions = {
  noop() {},
  tab(el) {
    ui.tab = el.dataset.tab; ls.set('wi.tab', ui.tab);
    if (ui.tab === 'plan') ui.planMonth = thisMonth();
    if (ui.tab === 'me') loadInvites();
    render(); window.scrollTo(0, 0);
  },
  'open-log'() { openSheet({ type: 'log', picked: [], day: today(), title: pick(LOG_TITLES) }); },
  pick(el) {
    const id = el.dataset.id, p = ui.sheet.picked;
    ui.sheet.picked = p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
    refreshSheet();
  },
  day(el) { ui.sheet.day = el.dataset.day; refreshSheet(); },
  'save-log'() {
    const s = ui.sheet;
    if (!s?.picked.length) return;
    const types = activeTypes().map((t) => t.id).filter((id) => s.picked.includes(id));
    closeSheet();
    logSession(types, s.day);
  },
  'close-cel'() { closeCel(); },
  'close-sheet'(el, e) { if (e.target === el || el.tagName === 'BUTTON') closeSheet(); },
  'back-sheet'() { const b = ui.sheet?.backTo; if (b) { ui.sheet = b; refreshSheet(); } else closeSheet(); },

  /* workouts */
  'new-type'(el) {
    const used = new Set(Object.values(S.types).filter((t) => !t.archived).map((t) => t.color));
    const s = { type: 'type', id: null, name: '', color: COLORS.find((c) => !used.has(c)) || pick(COLORS), icon: 'flame', back: el.dataset.back || null, backTo: el.dataset.back ? ui.sheet : null };
    openSheet(s);
    setTimeout(() => document.getElementById('type-name')?.focus(), 50);
  },
  'open-types'() { openSheet({ type: 'types' }); },
  'edit-type'(el) {
    const t = S.types[el.dataset.id]; if (!t) return;
    openSheet({ type: 'type', id: el.dataset.id, name: t.name, color: t.color, icon: t.icon, back: 'types', backTo: ui.sheet });
  },
  'type-color'(el) { ui.sheet.color = el.dataset.c; refreshSheet(); },
  'type-icon'(el) { ui.sheet.icon = el.dataset.i; refreshSheet(); },
  'save-type'() {
    const s = ui.sheet;
    const name = s.name.trim().slice(0, 24);
    if (!name) { toast('Give it a name first'); document.getElementById('type-name')?.focus(); return; }
    let id = s.id;
    if (id) update({ [`types.${id}.name`]: name, [`types.${id}.color`]: s.color, [`types.${id}.icon`]: s.icon });
    else {
      id = 't' + rid();
      const order = Math.max(0, ...Object.values(S.types).map((t) => t.order ?? 0)) + 1;
      update({ [`types.${id}`]: { name, color: s.color, icon: s.icon, order } });
      toast(`<b>${esc(name)}</b> added. Get it done!`);
    }
    // Keep things snappy: show the change before the save comes back
    S.types[id] = { ...(S.types[id] || {}), name, color: s.color, icon: s.icon, order: S.types[id]?.order ?? 99 };
    if (s.backTo) {
      ui.sheet = s.backTo;
      if (s.back === 'log' && !ui.sheet.picked.includes(id)) ui.sheet.picked.push(id);
      refreshSheet();
    } else closeSheet();
    render();
  },
  'remove-type'() {
    const s = ui.sheet; const t = S.types[s.id]; if (!t) return;
    if (activeTypes().length <= 1) { toast('You need at least one workout'); return; }
    const used = sessionList().some((x) => x.types.includes(s.id));
    if (used) { update({ [`types.${s.id}.archived`]: true }); S.types[s.id].archived = true; }
    else { update({ [`types.${s.id}`]: DEL }); delete S.types[s.id]; }
    toast(used ? `${esc(t.name)} removed. Past sessions keep it.` : `${esc(t.name)} removed`);
    if (s.backTo) { ui.sheet = s.backTo; refreshSheet(); } else closeSheet();
    render();
  },

  /* plan */
  month(el) { ui.planMonth = shiftMonth(ui.planMonth || thisMonth(), Number(el.dataset.dir)); render(); },
  session(el) { openSheet({ type: 'session', id: el.dataset.id }); },
  'delete-session'() { const id = ui.sheet.id; closeSheet(); update({ [`sessions.${id}`]: DEL }); toast('Session removed'); },

  /* me */
  goal(el) {
    const g = clamp(S.weeklyGoal + Number(el.dataset.d), 1, 14);
    if (g === S.weeklyGoal) return;
    S.weeklyGoal = g; update({ weeklyGoal: g }); render();
  },
  rename() { openSheet({ type: 'rename', name: S.name }); },
  'save-name'() {
    const v = (ui.sheet.name || '').trim().slice(0, 24);
    if (!v) return toast('Type a name first');
    S.name = v; update({ name: v }); closeSheet(); render(); toast(`Hello, ${esc(v)}!`);
  },
  sound() { ui.sound = !ui.sound; ls.set('wi.sound', ui.sound ? '1' : '0'); render(); if (ui.sound) cheer(1); },
  backup() {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), ...S }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `worth-it-backup-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  'sign-out'() {
    openSheet({ type: 'confirm', title: 'Sign out?', text: 'Your sessions stay safe in your account. Sign back in with the same Google account to see them.', ok: 'Sign out' });
    confirmFn = () => store.signOut();
  },
  'confirm-ok'() { const fn = confirmFn; confirmFn = null; closeSheet(); fn?.(); },
  async invite(el) {
    if (store.kind !== 'demo' && !navigator.onLine) return toast('You’ll need signal to make an invite');
    el.disabled = true;
    try {
      const code = makeCode();
      await store.makeInvite(code);
      ui.invites = [...(ui.invites || []), { code, by: me.uid, createdAt: Date.now(), usedBy: null }];
      render();
      await shareInvite(code);
    } catch (e) {
      console.error(e); toast(`Couldn’t make an invite: ${esc(e.code || e.message)}`, 4000);
    } finally { el.disabled = false; }
  },
  'share-invite'(el) { shareInvite(el.dataset.code); },
  async 'cancel-invite'(el) {
    const code = el.dataset.code;
    try { await store.cancelInvite(code); ui.invites = (ui.invites || []).filter((i) => i.code !== code); render(); toast('Invite cancelled'); }
    catch (e) { toast(`Couldn’t cancel: ${esc(e.code || e.message)}`); }
  },

  /* setup */
  'setup-goal'(el) { ui.setup.goal = clamp(ui.setup.goal + Number(el.dataset.d), 1, 14); renderSetup(); },
  'finish-setup'() {
    const st = ui.setup;
    const cost = parseMoney(st.cost);
    if (!cost || cost <= 0) { toast('Pop in what you pay each month'); app.querySelector('[data-field="setup-cost"]')?.focus(); return; }
    const dp = parseMoney(st.dayPass);
    update({ [`costs.${thisMonth()}`]: cost, weeklyGoal: st.goal, dayPass: dp > 0 ? dp : null, currency: st.currency, setupDone: true });
    ui.setup = null;
    celebrate({ tier: 2, kick: 'Welcome to Worth It', headline: `You’re in, ${S.name}!`, msg: `Goal: ${plural(st.goal, 'session')} a week. Every visit makes your ${st.currency}${Number.isInteger(cost) ? cost : cost.toFixed(2)} go further.`, cost: '', badges: [] });
  },

  /* sign in and joining */
  async google() {
    try { await store.google(); }
    catch (e) {
      const msg = friendlyAuth(e);
      if (msg) { onboarding = { screen: 'signin', msg }; render(); }
    }
  },
  async join(el) { await joinWith(el.dataset.code); },
  async 'join-typed'() {
    const code = (onboarding.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) { onboarding.msg = 'Type the invite code first.'; return render(); }
    await joinWith(code);
  },
  reload() { location.reload(); },
};

async function shareInvite(code) {
  const url = `${location.origin}${location.pathname}?invite=${code}`;
  const text = `${S.name} has invited you to Worth It, the gym tracker that makes every session count. Your invite code is ${code}.`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Join me on Worth It', text, url }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Invite link copied. Paste it in a message!'); }
  catch { prompt('Copy this invite link:', url); }
}
async function loadInvites() {
  if (store.kind !== 'demo' && !navigator.onLine) return;
  try { ui.invites = await store.myInvites(); if (ui.tab === 'me') render(); } catch (e) { console.warn('invites', e); }
}

function friendlyAuth(e) {
  const c = e?.code || '';
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return '';
  if (c === 'auth/network-request-failed') return 'No signal. Try again when you’re connected.';
  if (c === 'auth/popup-blocked') return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.';
  if (c === 'auth/unauthorized-domain') return 'This web address isn’t on Firebase’s list of authorised domains yet (see SETUP.md, step 3).';
  if (c === 'auth/operation-not-allowed') return 'Google sign-in isn’t switched on in Firebase yet (see SETUP.md, step 1).';
  return `Couldn’t sign in: ${c || e?.message || 'unknown error'}`;
}

async function joinWith(code) {
  if (store.kind !== 'demo' && !navigator.onLine) { onboarding.msg = 'You’ll need signal to join. Try again when you’re connected.'; return render(); }
  onboarding.busy = true; onboarding.msg = ''; render();
  try {
    await store.createAccount(code);
    ls.del('wi.invite');
    onboarding = null;
    startData();
  } catch (e) {
    console.error(e);
    onboarding.busy = false;
    onboarding.msg = e.friendly ? e.message : e.code === 'permission-denied' ? 'That invite code isn’t right, or it’s already been used.' : `Couldn’t join: ${e.code || e.message}`;
    if (onboarding.screen === 'invited') onboarding = { screen: 'need', code, msg: onboarding.msg };
    render();
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) fn(el, e);
});
document.addEventListener('input', (e) => {
  const f = e.target.dataset?.field;
  if (f === 'typename' && ui.sheet) ui.sheet.name = e.target.value;
  else if (f === 'newname' && ui.sheet) ui.sheet.name = e.target.value;
  else if (f === 'code' && onboarding) onboarding.code = e.target.value;
  else if (f === 'setup-cost') ui.setup.cost = e.target.value;
  else if (f === 'setup-daypass') ui.setup.dayPass = e.target.value;
});
document.addEventListener('change', (e) => {
  const t = e.target, f = t.dataset?.field;
  if (!f || !S) return;
  if (f === 'cost') {
    const v = parseMoney(t.value);
    if (!v || v <= 0) { toast('That doesn’t look like an amount'); t.value = costFor(thisMonth())?.toFixed(2) || ''; return; }
    if (v === costFor(thisMonth())) return;
    S.costs[thisMonth()] = v; update({ [`costs.${thisMonth()}`]: v });
    toast(`Saved. ${money(v)} a month from ${monthName(thisMonth())}`);
  } else if (f === 'dayPass') {
    const v = parseMoney(t.value);
    S.dayPass = v > 0 ? v : null; update({ dayPass: S.dayPass });
    toast(S.dayPass ? `Worth-it line set at ${money(S.dayPass)}` : 'Day pass price cleared');
  } else if (f === 'currency') {
    S.currency = t.value; update({ currency: t.value }); t.blur(); render();
  } else if (f === 'setup-currency') {
    ui.setup.currency = t.value; renderSetup();
  } else if (f === 'logday' && ui.sheet?.type === 'log') {
    if (t.value && t.value <= today()) { ui.sheet.day = t.value; refreshSheet(); }
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (celEl.innerHTML) closeCel(); else if (ui.sheet) closeSheet(); }
  if (e.key === 'Enter' && e.target.matches?.('[data-field="typename"]')) actions['save-type']();
  if (e.key === 'Enter' && e.target.matches?.('[data-field="newname"]')) actions['save-name']();
  if (e.key === 'Enter' && e.target.matches?.('[data-field="code"]')) actions['join-typed']();
});
window.addEventListener('online', () => { render(); });
window.addEventListener('offline', () => { render(); });

/* ---------------- data ---------------- */
function stopData() { unsub?.(); unsub = null; S = null; closeSheet(); closeCel(); }
function startData() {
  unsub?.();
  onboarding = { screen: 'loading' }; render();
  let waited = null;
  unsub = store.start((data, m) => {
    meta = m;
    if (!data) {
      if (m.fromCache) {
        // Not on this phone yet: wait for the server, unless there's no signal at all
        if (!navigator.onLine) { onboarding = { screen: 'message', title: 'Needs signal', text: 'The first time you open Worth It on a phone it needs signal to fetch your account. After that it works anywhere.' }; render(); }
        return;
      }
      S = null;
      if (!waited) { waited = true; findAccount(); }
      return;
    }
    S = normalize(data);
    onboarding = null;
    render();
  }, (err) => {
    console.error(err);
    onboarding = { screen: 'message', title: 'Couldn’t open your space', text: err.code === 'permission-denied' ? 'Firebase refused. Check the database rules have been published (SETUP.md, step 1).' : (err.message || String(err)) };
    render();
  });
}
/** No account yet: use an invite if there is one, else see if this is the owner, else ask for an invite */
async function findAccount() {
  const code = ls.get('wi.invite');
  if (code) {
    try {
      const inv = await store.getInvite(code);
      if (inv && !inv.usedBy) { onboarding = { screen: 'invited', code, byName: inv.byName }; return render(); }
      ls.del('wi.invite');
      onboarding = { screen: 'need', msg: inv ? 'That invite has already been used. Ask for a fresh one.' : 'That invite link isn’t right. Check it with whoever sent it.' };
      return render();
    } catch (e) { console.warn(e); }
  }
  // The owner (ADMIN_EMAIL in the rules) can start without an invite. Everyone else is refused.
  try { await store.createAccount(null); onboarding = null; return; }
  catch (e) { if (e.code !== 'permission-denied') console.warn(e); }
  onboarding = { screen: 'need' }; render();
}

/* ---------------- boot ---------------- */
async function boot() {
  const params = new URLSearchParams(location.search);
  const invite = (params.get('invite') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (invite) {
    ls.set('wi.invite', invite);
    params.delete('invite');
    history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''));
  }
  if (!firebaseConfig || params.has('demo')) store = demoStore();
  else {
    try { store = await firebaseStore(); }
    catch (e) {
      console.error(e);
      onboarding = { screen: 'message', title: 'Couldn’t start', text: 'The very first time it opens on a phone, the app needs signal to download what it needs for offline use. Try again with signal.' };
      return render();
    }
  }
  store.onAuth((user) => {
    if (user) { me = store.me(); startData(); }
    else { stopData(); me = null; onboarding = { screen: 'signin' }; render(); }
  });
}

/* ---------------- updates ----------------
 * When a new version is published, the service worker downloads it in the background
 * and we show a banner with a Reload button. */
function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
  const el = document.createElement('div');
  el.id = 'update-banner';
  el.innerHTML = '<span><b>Update ready</b>A new version of Worth It has downloaded.</span><button type="button">Reload</button>';
  el.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(el);
}
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdateBanner(); });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {}); });
  }).catch(() => {});
}
// A new day (or week) while the app sits open: refresh the dates
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S) render(); });
boot();
