(function () {
'use strict';

/* ---------- helpers ---------- */
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
var nf2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
var inr = function (n) { return '₹' + nf0.format(Math.round(n || 0)); };
var HA = 2.47105;
var DOCS = [['chitta', 'Chitta / Adangal'], ['aadhaar', 'Aadhaar copy'], ['bank', 'Bank passbook'], ['sowing', 'Sowing certificate']];
var STATUS = { docs: 'Papers pending', ready: 'Ready to submit', submitted: 'Submitted', issued: 'Policy issued' };
var EMAIL_DOMAIN = '@selvatraders.app';
var pad = function (n) { return String(n).padStart(2, '0'); };
var ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
var todayStr = function () { return ymd(new Date()); };
var addDays = function (s, n) { var p = s.split('-').map(Number); return ymd(new Date(p[0], p[1] - 1, p[2] + n)); };
var fmtDay = function (s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); };
var fmtTime = function (iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); };
var toAcres = function (v, u) { v = Number(v) || 0; return u === 'Hectare' ? v * HA : u === 'Cent' ? v / 100 : v; };
var code = function (e) { return 'ST-' + String(e.id).slice(-4).toUpperCase(); };
var pl = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
var acresOf = function (e) { return e.acres != null ? e.acres : toAcres(e.land, e.unit); };
var toastT;
function toast(t) { var el = $('#toast'); el.textContent = t; clearTimeout(toastT); toastT = setTimeout(function () { el.textContent = ''; }, 3000); }
function setSeg(root, val) { $$('button', root).forEach(function (b) { b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(b.dataset.v === val)); }); }
function nextStatus(st, docs) { var all = DOCS.every(function (d) { return docs && docs[d[0]]; }); if (st === 'docs' && all) return 'ready'; if (st === 'ready' && !all) return 'docs'; return st; }
function missing(docs) { return DOCS.filter(function (d) { return !(docs && docs[d[0]]); }).map(function (d) { return d[1]; }); }
function copyText(text, done) {
  function fallback() { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(true); } catch (e) { done(false); } document.body.removeChild(ta); }
  try { navigator.clipboard.writeText(text).then(function () { done(true); }, fallback); } catch (e) { fallback(); }
}

/* ---------- state ---------- */
var S = {
  auth: null, db: null, user: null, profile: null, started: false, settingUp: false,
  entries: [], costs: {}, team: [], loaded: false,
  editing: null, confirmDel: null, busy: {}, tab: 'entry', online: navigator.onLine !== false,
  rec: { q: '', period: 'today', date: todayStr(), agent: 'all', status: 'all' },
  sum: { period: 'day', date: todayStr() }
};
var unsubs = [];
var F = { unit: 'Acre', mode: 'Cash', docs: {} };
var C = { unit: 'Acre' };
var isAdmin = function () { return !!(S.profile && S.profile.role === 'admin'); };
var myUid = function () { return S.user ? S.user.uid : null; };

/* ---------- screens ---------- */
function showScreen(name) {
  $('#screen-config').hidden = name !== 'config';
  $('#screen-login').hidden = name !== 'login';
  $('#app').hidden = name !== 'app';
  document.title = 'Selva Traders';
}
function showConfigProblem(msg) { $('#configMsg').textContent = msg; showScreen('config'); }
function toIdEmail(id) { return id.trim().toLowerCase() + EMAIL_DOMAIN; }
function cleanId(id) { return String(id || '').trim().toLowerCase(); }
function idProblem(id) { if (!/^[a-z0-9._-]{3,24}$/.test(id)) return 'The ID must be 3 to 24 letters or numbers. You can use . _ - too. No spaces.'; return ''; }
function authErrText(e) {
  var c = e && e.code;
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-login-credentials') return 'The ID or password is wrong.';
  if (c === 'auth/too-many-requests') return 'Too many tries. Wait a few minutes and try again.';
  if (c === 'auth/network-request-failed') return 'No internet. Connect and try again.';
  if (c === 'auth/email-already-in-use') return 'That ID is already used. Pick another ID.';
  if (c === 'auth/weak-password') return 'The password must be at least 8 characters.';
  if (c === 'auth/operation-not-allowed') return 'Email/Password sign-in is not turned on in Firebase. Follow step 3 in the setup guide.';
  if (c === 'auth/requires-recent-login') return 'Sign out, sign in again, and then change the password.';
  return 'Something went wrong (' + (c || 'unknown') + '). Try again.';
}
function dbErrText(e) {
  var c = e && e.code;
  if (c === 'permission-denied') return 'You are not allowed to do that. Ask the owner.';
  if (c === 'unavailable') return 'No internet. Try again when you are connected.';
  if (c === 'resource-exhausted') return 'Too many changes at once. Wait a moment and try again.';
  return 'Could not save (' + (c || 'unknown') + ').';
}

/* ---------- tabs ---------- */
var TABS = ['entry', 'records', 'summary', 'team', 'tools'];
function showTab(t) {
  if (TABS.indexOf(t) < 0 || (t === 'team' && !isAdmin())) t = 'entry';
  S.tab = t;
  $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + t; });
  $$('.tab').forEach(function (b) { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  window.scrollTo(0, 0);
}
$$('.tab').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab); }); });

/* ---------- sign in / owner setup ---------- */
$$('[data-showpw]').forEach(function (b) {
  b.addEventListener('click', function () { var i = $('#' + b.dataset.showpw); var show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; });
});
function showLogin(msg) {
  showScreen('login');
  $('#loginForm').hidden = false; $('#setupForm').hidden = true; $('#authTitle').textContent = 'Sign in';
  $('#toLogin').hidden = true;
  $('#loginMsg').textContent = msg || '';
  $('#loginBtn').disabled = false;
  checkOwnerExists();
}
function checkOwnerExists() {
  $('#toSetup').hidden = true;
  if (!S.db) return;
  S.db.doc('meta/owner').get().then(function (snap) { if (!snap.exists && !$('#loginForm').hidden) $('#toSetup').hidden = false; }).catch(function () {});
}
$('#toSetup').addEventListener('click', function () {
  $('#loginForm').hidden = true; $('#setupForm').hidden = false; $('#authTitle').textContent = 'Set up the owner account';
  $('#toSetup').hidden = true; $('#toLogin').hidden = false; $('#setupMsg').textContent = '';
});
$('#toLogin').addEventListener('click', function () { showLogin(''); });

$('#loginForm').addEventListener('submit', function (ev) {
  ev.preventDefault();
  var id = cleanId($('#l-id').value), pw = $('#l-pw').value, msg = $('#loginMsg');
  msg.textContent = '';
  if (!id || !pw) { msg.textContent = 'Enter your ID and password.'; return; }
  if (idProblem(id)) { msg.textContent = 'The ID or password is wrong.'; return; }
  var btn = $('#loginBtn'); btn.disabled = true;
  S.auth.signInWithEmailAndPassword(toIdEmail(id), pw).then(function () { $('#l-pw').value = ''; }).catch(function (e) { msg.textContent = authErrText(e); }).then(function () { btn.disabled = false; });
});

$('#setupForm').addEventListener('submit', function (ev) {
  ev.preventDefault();
  var name = $('#o-name').value.replace(/\s+/g, ' ').trim(), id = cleanId($('#o-id').value), pw = $('#o-pw').value, pw2 = $('#o-pw2').value, msg = $('#setupMsg');
  msg.textContent = '';
  if (!name) { msg.textContent = 'Enter your name.'; return; }
  if (idProblem(id)) { msg.textContent = idProblem(id); return; }
  if (pw.length < 8) { msg.textContent = 'The password must be at least 8 characters.'; return; }
  if (pw !== pw2) { msg.textContent = 'The two passwords are not the same.'; return; }
  var btn = $('#setupBtn'); btn.disabled = true; S.settingUp = true;
  var cred;
  S.auth.createUserWithEmailAndPassword(toIdEmail(id), pw).then(function (c) {
    cred = c;
    var uid = c.user.uid, now = new Date().toISOString(), b = S.db.batch();
    b.set(S.db.doc('meta/owner'), { uid: uid, createdAt: now });
    b.set(S.db.doc('users/' + uid), { name: name, loginId: id, role: 'admin', active: true, createdAt: now });
    return b.commit();
  }).then(function () {
    S.settingUp = false; toast('Owner account created');
    $('#o-pw').value = ''; $('#o-pw2').value = '';
    onUser(S.auth.currentUser);
  }).catch(function (e) {
    // Keep settingUp on until the half-made account is removed, so the screen does not jump back to sign-in.
    var done = function () { S.settingUp = false; msg.textContent = (e && e.code && e.code.indexOf('auth/') === 0) ? authErrText(e) : (e && e.code === 'permission-denied' ? 'An owner account already exists. Go back and sign in.' : dbErrText(e)); };
    if (cred && cred.user) { cred.user.delete().catch(function () {}).then(function () { return S.auth.signOut().catch(function () {}); }).then(done); } else done();
  }).then(function () { btn.disabled = false; });
});

$('#signOutBtn').addEventListener('click', function () { S.auth.signOut(); });

function stopListeners() { unsubs.forEach(function (u) { try { u(); } catch (e) {} }); unsubs = []; S.started = false; }
function resetData() { S.entries = []; S.costs = {}; S.team = []; S.loaded = false; S.profile = null; S.editing = null; S.confirmDel = null; }

function onUser(user) {
  if (S.settingUp) return;
  if (user && S.user && S.user.uid === user.uid && unsubs.length) return;   // same person, already running
  stopListeners(); resetData(); S.user = user || null;
  if (!user) { showLogin(S.loginNote || ''); S.loginNote = ''; return; }
  var first = true;
  var unsub = S.db.doc('users/' + user.uid).onSnapshot(function (snap) {
    var d = snap.exists ? snap.data() : null;
    if (!d || d.active !== true) {
      if (snap.metadata.fromCache && !snap.exists) return;   // wait for the server before deciding
      S.loginNote = d ? 'This ID has been turned off. Ask the owner.' : 'This ID has no access. Ask the owner.';
      S.auth.signOut(); return;
    }
    S.profile = d;
    if (first) { first = false; startApp(); } else renderAll();
  }, function (e) {
    S.loginNote = e && e.code === 'permission-denied' ? 'This ID has no access. Ask the owner.' : 'Could not load your account. Check the internet and try again.';
    S.auth.signOut();
  });
  unsubs.push(unsub);
}

/* ---------- data listeners ---------- */
function startApp() {
  S.started = true;
  showScreen('app'); resetForm(); buildDocChips();
  S.rec.agent = 'all'; S.rec.status = 'all'; S.rec.q = ''; $('#r-q').value = ''; $('#r-status').value = 'all';
  $$('.admin-only').forEach(function (el) { if (el.closest('#view-entry')) el.hidden = !isAdmin(); });
  $('#teamTab').hidden = !isAdmin();
  showTab('entry');
  renderAll();
  unsubs.push(S.db.collection('entries').orderBy('createdAt', 'desc').limit(3000).onSnapshot({ includeMetadataChanges: true }, function (snap) {
    S.entries = snap.docs.map(function (d) { var o = Object.assign({}, d.data()); o.id = d.id; o._pending = d.metadata.hasPendingWrites; return o; });
    if (!snap.metadata.fromCache) S.loaded = true;
    renderAll();
  }, function () { S.dbErr = 'Records stopped updating. Close and open the app again.'; renderBanner(); }));
  if (isAdmin()) {
    unsubs.push(S.db.collection('costs').onSnapshot(function (snap) { var m = {}; snap.docs.forEach(function (d) { var b = d.data().bill; if (typeof b === 'number') m[d.id] = b; }); S.costs = m; renderAll(); }, function () {}));
    unsubs.push(S.db.collection('users').onSnapshot(function (snap) { S.team = snap.docs.map(function (d) { var o = Object.assign({}, d.data()); o.uid = d.id; return o; }); renderTeam(); }, function () {}));
  }
}

/* ---------- visible data ---------- */
function vis() { return isAdmin() ? S.entries : S.entries.filter(function (e) { return e.agentUid === myUid(); }); }
function canEdit(e) { return isAdmin() || e.agentUid === myUid(); }
function agentName(e) { return e.agentName || 'Agent'; }

/* ---------- entry form ---------- */
function buildDocChips() { $('#docChips').innerHTML = DOCS.map(function (d) { return '<button type="button" class="chip" data-k="' + d[0] + '" aria-pressed="' + !!F.docs[d[0]] + '">' + esc(d[1]) + '</button>'; }).join(''); updateDocNote(); }
function updateDocNote() { var m = missing(F.docs); $('#docNote').textContent = m.length === 0 ? 'All papers are in. The record will show as Ready to submit.' : m.length + ' still missing: ' + m.join(', ') + '.'; }
$('#docChips').addEventListener('click', function (ev) { var b = ev.target.closest('.chip'); if (!b) return; var k = b.dataset.k; F.docs[k] = !F.docs[k]; b.setAttribute('aria-pressed', String(!!F.docs[k])); updateDocNote(); });
$('#f-unit').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; F.unit = b.dataset.v; setSeg(this, F.unit); updateLandPreview(); });
$('#f-mode').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; F.mode = b.dataset.v; setSeg(this, F.mode); });
function updateLandPreview() { var v = parseFloat($('#f-land').value), el = $('#landPreview'); if (!(v > 0)) { el.textContent = 'Enter the land area to see acres, cents and hectares.'; return; } var a = toAcres(v, F.unit); el.innerHTML = '<b>' + nf2.format(a) + '</b> acres · <b>' + nf0.format(a * 100) + '</b> cents · <b>' + nf2.format(a / HA) + '</b> hectares'; }
function updateMargin() { var c = $('#f-coll').value, b = $('#f-bill').value, el = $('#marginPreview'); if (c === '' || b === '') { el.textContent = 'Enter the bill value to see the margin.'; return; } var m = Number(c) - Number(b); el.innerHTML = 'Margin on this farmer: <b class="' + (m < 0 ? 'profit-neg' : 'profit-pos') + '">' + inr(m) + '</b>'; }
$('#f-land').addEventListener('input', updateLandPreview);
$('#f-coll').addEventListener('input', updateMargin);
$('#f-bill').addEventListener('input', updateMargin);

function readForm() { return { farmer: $('#f-farmer').value.replace(/\s+/g, ' ').trim(), phone: $('#f-phone').value.trim(), village: $('#f-village').value.replace(/\s+/g, ' ').trim(), survey: $('#f-survey').value.trim(), crop: $('#f-crop').value, land: $('#f-land').value, unit: F.unit, collection: $('#f-coll').value, mode: F.mode, bill: $('#f-bill').value, note: $('#f-note').value.trim(), docs: Object.assign({}, F.docs) }; }
function normPhone(p) { var d = p.replace(/\D/g, ''); if (d.length === 12 && d.slice(0, 2) === '91') d = d.slice(2); return d; }
function validate(d) { var e = []; if (!d.farmer) e.push('Enter the farmer name.'); if (!d.village) e.push('Enter the village.'); if (d.phone && !/^[6-9]\d{9}$/.test(normPhone(d.phone))) e.push('Phone number must be 10 digits.'); if (!(parseFloat(d.land) > 0)) e.push('Enter the land area.'); if (d.collection === '' || Number(d.collection) < 0) e.push('Enter the amount collected. Use 0 if nothing is collected yet.'); if (isAdmin() && d.bill !== '' && Number(d.bill) < 0) e.push('Bill value cannot be negative.'); return e; }
function findDup(d) { var f = d.farmer.toLowerCase(), v = d.village.toLowerCase(); return S.entries.find(function (e) { if (S.editing && e.id === S.editing) return false; if (String(e.farmer).toLowerCase() !== f || String(e.village).toLowerCase() !== v) return false; if (d.survey && e.survey && String(e.survey).toLowerCase() !== d.survey.toLowerCase()) return false; return true; }); }
function resetForm() { ['#f-farmer', '#f-phone', '#f-survey', '#f-land', '#f-coll', '#f-bill', '#f-note'].forEach(function (s) { $(s).value = ''; }); F.docs = {}; setSeg($('#f-unit'), F.unit); setSeg($('#f-mode'), F.mode); buildDocChips(); updateLandPreview(); updateMargin(); $('#formMsg').textContent = ''; $('#dupMsg').innerHTML = ''; S.editing = null; renderEditBar(); }
function renderEditBar() { var bar = $('#editBar'); if (!S.editing) { bar.hidden = true; bar.innerHTML = ''; $('#entryTitle').textContent = 'New farmer'; $('#saveBtn').textContent = 'Save farmer'; return; } var e = S.entries.find(function (x) { return x.id === S.editing; }); bar.hidden = false; bar.innerHTML = '<span>Editing ' + esc(e ? code(e) : '') + ' for ' + esc(e ? e.farmer : '') + '.</span><button type="button" class="btn sm" id="cancelEdit">Cancel edit</button>'; $('#entryTitle').textContent = 'Edit farmer'; $('#saveBtn').textContent = 'Save changes'; $('#cancelEdit').addEventListener('click', resetForm); }
function startEdit(id) { var e = S.entries.find(function (x) { return x.id === id; }); if (!e || !canEdit(e)) return; S.editing = id; $('#f-farmer').value = e.farmer || ''; $('#f-phone').value = e.phone || ''; $('#f-village').value = e.village || ''; $('#f-survey').value = e.survey || ''; $('#f-crop').value = e.crop || ''; $('#f-land').value = e.land; F.unit = e.unit || 'Acre'; $('#f-coll').value = e.collection; F.mode = e.mode || 'Cash'; $('#f-bill').value = S.costs[id] != null ? S.costs[id] : ''; $('#f-note').value = e.note || ''; F.docs = Object.assign({}, e.docs || {}); setSeg($('#f-unit'), F.unit); setSeg($('#f-mode'), F.mode); buildDocChips(); updateLandPreview(); updateMargin(); renderEditBar(); $('#formMsg').textContent = ''; $('#dupMsg').innerHTML = ''; showTab('entry'); }

function save(force) {
  var msg = $('#formMsg'), dup = $('#dupMsg'); msg.textContent = ''; dup.innerHTML = '';
  var d = readForm(), errs = validate(d);
  if (errs.length) { msg.innerHTML = errs.map(esc).join('<br>'); return; }
  if (!S.editing && !force) { var x = findDup(d); if (x) { dup.innerHTML = '<span>' + esc(x.farmer) + ' in ' + esc(x.village) + ' is already recorded by ' + esc(agentName(x)) + ' (' + esc(code(x)) + ', ' + esc(fmtDay(x.date)) + ').</span><button type="button" class="btn sm gold" id="dupGo">Save anyway</button>'; $('#dupGo').addEventListener('click', function () { save(true); }); return; } }
  var fields = { farmer: d.farmer, phone: d.phone ? normPhone(d.phone) : '', village: d.village, survey: d.survey, crop: d.crop, land: parseFloat(d.land), unit: d.unit, acres: Math.round(toAcres(d.land, d.unit) * 10000) / 10000, collection: Number(d.collection), mode: d.mode, docs: d.docs, note: d.note };
  var id, wasEdit = !!S.editing, op;
  if (wasEdit) { id = S.editing; var cur = S.entries.find(function (e) { return e.id === id; }); fields.status = nextStatus(cur ? cur.status : 'docs', d.docs); op = S.db.doc('entries/' + id).update(fields); }
  else { var ref = S.db.collection('entries').doc(); id = ref.id; var now = new Date(); fields.status = nextStatus('docs', d.docs); fields.agentUid = myUid(); fields.agentName = S.profile.name; fields.createdAt = now.toISOString(); fields.date = ymd(now); op = ref.set(fields); }
  // The record is stored on the phone straight away and uploads when there is internet.
  op.catch(function (e) { toast(dbErrText(e)); });
  if (isAdmin()) {
    if (d.bill !== '') S.db.doc('costs/' + id).set({ bill: Number(d.bill) }).catch(function (e) { toast(dbErrText(e)); });
    else if (wasEdit && S.costs[id] != null) S.db.doc('costs/' + id).delete().catch(function (e) { toast(dbErrText(e)); });
  }
  var keepV = d.village, keepC = d.crop;
  resetForm();
  if (!wasEdit) { $('#f-village').value = keepV; $('#f-crop').value = keepC; }
  toast(wasEdit ? 'Changes saved' : 'Saved ' + fields.farmer + ', ' + fields.village);
  $('#f-farmer').focus();
}
$('#entryForm').addEventListener('submit', function (ev) { ev.preventDefault(); save(false); });

/* ---------- records ---------- */
function filtered() {
  var r = S.rec, t = todayStr(), w = addDays(t, -6), words = r.q.toLowerCase().split(/\s+/).filter(Boolean);
  return vis().filter(function (e) {
    if (r.period === 'today' && e.date !== t) return false;
    if (r.period === 'week' && e.date < w) return false;
    if (r.period === 'date' && e.date !== r.date) return false;
    if (r.agent !== 'all' && e.agentUid !== r.agent) return false;
    if (r.status !== 'all' && e.status !== r.status) return false;
    if (words.length) { var hay = [e.farmer, e.village, e.survey, e.phone, code(e), e.crop].join(' ').toLowerCase(); if (!words.every(function (x) { return hay.indexOf(x) >= 0; })) return false; }
    return true;
  });
}
function recHTML(e) {
  var bill = S.costs[e.id], hasBill = bill != null, id = esc(e.id), mine = canEdit(e), dis = mine ? '' : ' disabled';
  var chips = DOCS.map(function (d) { return '<button type="button" class="chip sm" data-act="doc" data-k="' + d[0] + '" data-id="' + id + '" aria-pressed="' + !!(e.docs && e.docs[d[0]]) + '"' + dis + '>' + esc(d[1]) + '</button>'; }).join('');
  var opts = Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (k === e.status ? ' selected' : '') + '>' + STATUS[k] + '</option>'; }).join('');
  var sub = [e.village, e.survey ? 'Survey ' + e.survey : '', e.crop].filter(Boolean).map(esc).join(' · ');
  var land = nf2.format(acresOf(e)) + ' acres' + (e.unit && e.unit !== 'Acre' ? ' (' + esc(e.land) + ' ' + esc(e.unit) + ')' : '');
  var phone = e.phone ? '<button type="button" class="btn sm" data-act="copy" data-v="' + esc(e.phone) + '">' + esc(e.phone) + '</button>' : '';
  var statusEl = mine ? '<select class="pill st-' + esc(e.status) + '" data-act="status" data-id="' + id + '" aria-label="Status for ' + esc(e.farmer) + '">' + opts + '</select>' : '<span class="pill st-' + esc(e.status) + '">' + esc(STATUS[e.status] || e.status) + '</span>';
  var adm = '';
  if (isAdmin()) { var m = hasBill ? e.collection - bill : null; adm = '<div class="adm"><span>Bill</span><div class="money"><span>₹</span><input type="number" inputmode="numeric" min="0" step="1" value="' + (hasBill ? esc(bill) : '') + '" data-act="bill" data-id="' + id + '" aria-label="Bill value for ' + esc(e.farmer) + '"></div><span>Margin <b class="num ' + (m != null && m < 0 ? 'profit-neg' : 'profit-pos') + '">' + (m == null ? 'not set' : inr(m)) + '</b></span></div>'; }
  var del = isAdmin() ? (S.confirmDel === e.id ? '<span>Delete this record?</span><button type="button" class="btn sm danger" data-act="delyes" data-id="' + id + '">Delete</button><button type="button" class="btn sm" data-act="delno">Keep</button>' : '<button type="button" class="btn sm" data-act="del" data-id="' + id + '">Delete</button>') : '';
  return '<article class="rec"><div class="r1"><div style="min-width:0"><div class="nm">' + esc(e.farmer) + '</div><div class="sub">' + sub + '</div><div class="sub num">' + land + '</div></div><div class="amt num"><b>' + inr(e.collection) + '</b><small>' + esc(e.mode || '') + '</small></div></div>'
    + '<div class="chips">' + chips + '</div>'
    + '<div class="r3"><div class="acts">' + statusEl + (e._pending ? '<span class="pill sync">Not uploaded yet</span>' : '') + phone + '</div><span class="num">' + esc(agentName(e)) + ' · ' + esc(fmtDay(e.date)) + ', ' + esc(fmtTime(e.createdAt)) + ' · ' + esc(code(e)) + '</span></div>'
    + adm
    + '<div class="acts">' + (mine ? '<button type="button" class="btn sm" data-act="edit" data-id="' + id + '">Edit</button>' : '') + del + '</div></article>';
}
function renderRecords() {
  var list = filtered(), box = $('#recList'), all = vis();
  var today = all.filter(function (e) { return e.date === todayStr(); }).length;
  $('#recCount').textContent = today ? String(today) : '';
  if (!S.loaded && !S.entries.length) { box.innerHTML = '<div class="empty"><p>Loading records</p></div>'; $('#recStrip').textContent = ''; return; }
  if (!all.length) { box.innerHTML = '<div class="empty"><img src="logo.png" alt=""><p>No records yet. Add the first farmer from the New farmer tab.</p><button class="btn primary" type="button" data-act="goentry">Add a farmer</button></div>'; $('#recStrip').textContent = ''; return; }
  var sum = list.reduce(function (a, e) { a.c += e.collection || 0; a.a += acresOf(e); return a; }, { c: 0, a: 0 });
  $('#recStrip').innerHTML = '<b>' + list.length + '</b> ' + (list.length === 1 ? 'farmer' : 'farmers') + ' · <b>' + nf2.format(sum.a) + '</b> acres · <b>' + inr(sum.c) + '</b> collected';
  box.innerHTML = list.length ? list.map(recHTML).join('') : '<div class="empty"><p>No records match these filters.</p></div>';
}
function renderAgentFilter() {
  var sel = $('#r-agent');
  if (!isAdmin()) { sel.hidden = true; S.rec.agent = 'all'; return; }
  sel.hidden = false;
  var seen = {}, opts = '<option value="all">All agents</option>';
  S.entries.forEach(function (e) { if (e.agentUid && !seen[e.agentUid]) { seen[e.agentUid] = 1; opts += '<option value="' + esc(e.agentUid) + '">' + esc(agentName(e)) + '</option>'; } });
  if (sel.dataset.sig !== opts) { sel.innerHTML = opts; sel.dataset.sig = opts; }
  sel.value = seen[S.rec.agent] ? S.rec.agent : 'all'; if (sel.value === 'all') S.rec.agent = 'all';
}
$('#r-q').addEventListener('input', function () { S.rec.q = this.value; renderRecords(); });
$('#r-period').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; S.rec.period = b.dataset.v; syncRecControls(); renderRecords(); });
$('#r-date').addEventListener('change', function () { if (this.value) { S.rec.date = this.value; renderRecords(); } });
$('#r-agent').addEventListener('change', function () { S.rec.agent = this.value; renderRecords(); });
$('#r-status').addEventListener('change', function () { S.rec.status = this.value; renderRecords(); });
function syncRecControls() { setSeg($('#r-period'), S.rec.period); $('#r-date').hidden = S.rec.period !== 'date'; $('#r-date').value = S.rec.date; }

$('#recList').addEventListener('click', function (ev) {
  var b = ev.target.closest('[data-act]'); if (!b) return; var act = b.dataset.act, id = b.dataset.id;
  if (act === 'goentry') { showTab('entry'); return; }
  if (act === 'edit') { startEdit(id); return; }
  if (act === 'del') { S.confirmDel = id; renderRecords(); return; }
  if (act === 'delno') { S.confirmDel = null; renderRecords(); return; }
  if (act === 'delyes') { S.confirmDel = null; S.db.doc('entries/' + id).delete().then(function () { return S.db.doc('costs/' + id).delete(); }).then(function () { toast('Record deleted'); }).catch(function (e) { toast(dbErrText(e)); }); renderRecords(); return; }
  if (act === 'copy') { var v = b.dataset.v; copyText(v, function (ok) { toast(ok ? 'Phone number copied' : v); }); return; }
  if (act === 'doc') { var e = S.entries.find(function (x) { return x.id === id; }); if (!e || !canEdit(e)) return; var k = b.dataset.k, docs = Object.assign({}, e.docs || {}); docs[k] = !docs[k]; S.db.doc('entries/' + id).update({ docs: docs, status: nextStatus(e.status, docs) }).catch(function (er) { toast(dbErrText(er)); }); }
});
$('#recList').addEventListener('change', function (ev) {
  var el = ev.target, act = el.dataset && el.dataset.act, id = el.dataset && el.dataset.id; if (!act) return;
  if (act === 'status') S.db.doc('entries/' + id).update({ status: el.value }).catch(function (e) { toast(dbErrText(e)); });
  if (act === 'bill' && isAdmin()) { if (el.value === '') S.db.doc('costs/' + id).delete().catch(function (e) { toast(dbErrText(e)); }); else S.db.doc('costs/' + id).set({ bill: Math.max(0, Number(el.value)) }).catch(function (e) { toast(dbErrText(e)); }); }
});

/* ---------- csv ---------- */
function cell(v) { var s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
function saveFile(name, text) {
  var Cap = window.Capacitor;
  if (Cap && Cap.isNativePlatform && Cap.isNativePlatform() && Cap.Plugins && Cap.Plugins.Filesystem && Cap.Plugins.Share) {
    return Cap.Plugins.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' }).then(function (r) { return Cap.Plugins.Share.share({ title: name, url: r.uri, dialogTitle: 'Save or send the file' }); });
  }
  var blob = new Blob([text], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  return Promise.resolve();
}
$('#exportBtn').addEventListener('click', function () {
  var list = filtered(); if (!list.length) { toast('Nothing to export for these filters'); return; }
  var head = ['Record ID', 'Date', 'Time', 'Agent', 'Farmer', 'Phone', 'Village', 'Survey / Patta', 'Crop', 'Land', 'Unit', 'Acres', 'Collected (INR)', 'Paid by', 'Papers missing', 'Status', 'Note'];
  if (isAdmin()) head.push('Bill (INR)', 'Margin (INR)');
  var rows = list.map(function (e) { var r = [code(e), e.date, fmtTime(e.createdAt), agentName(e), e.farmer, e.phone, e.village, e.survey, e.crop, e.land, e.unit, acresOf(e), e.collection, e.mode, missing(e.docs).join('; '), STATUS[e.status] || e.status, e.note]; if (isAdmin()) { var b = S.costs[e.id]; r.push(b == null ? '' : b, b == null ? '' : e.collection - b); } return r.map(cell).join(','); });
  var name = 'SelvaTraders_' + (S.rec.period === 'all' ? 'all' : S.rec.period === 'date' ? S.rec.date : S.rec.period === 'week' ? 'last7days' : todayStr()) + '.csv';
  saveFile(name, '﻿' + [head.map(cell).join(',')].concat(rows).join('\n')).then(function () { toast('File ready'); }).catch(function (e) { if (!e || !/cancel/i.test(String(e.message || e))) toast('Could not save the file'); });
});

/* ---------- summary ---------- */
function sumList() { var s = S.sum, t = todayStr(); return vis().filter(function (e) { if (s.period === 'day') return e.date === s.date; if (s.period === 'week') return e.date <= s.date && e.date >= addDays(s.date, -6); return true; }); }
function renderSummary() {
  var s = S.sum, list = sumList(); setSeg($('#s-period'), s.period); $('#s-datebar').hidden = s.period === 'all'; $('#s-date').value = s.date;
  $('#sumTitle').textContent = isAdmin() ? 'Summary' : 'My summary';
  $('#s-prev').textContent = s.period === 'week' ? '‹ Week' : '‹ Prev'; $('#s-next').textContent = s.period === 'week' ? 'Week ›' : 'Next ›';
  $('#sumLabel').textContent = s.period === 'day' ? fmtDay(s.date) : s.period === 'week' ? fmtDay(addDays(s.date, -6)) + ' to ' + fmtDay(s.date) : 'All records';
  var T = { n: 0, a: 0, c: 0, pend: 0, margin: 0, unbilled: 0 }, A = {}, V = {};
  list.forEach(function (e) {
    var a = acresOf(e), c = e.collection || 0, k = e.agentUid || '?', vk = (e.village || '?').trim();
    T.n++; T.a += a; T.c += c; if (e.status === 'docs') T.pend++;
    var b = S.costs[e.id]; if (isAdmin()) { if (b == null) T.unbilled++; else T.margin += c - b; }
    var g = A[k] || (A[k] = { name: agentName(e), n: 0, a: 0, c: 0, cash: 0, upi: 0, pend: 0, margin: 0, billed: 0 });
    g.n++; g.a += a; g.c += c; if (e.mode === 'UPI') g.upi += c; else g.cash += c; if (e.status === 'docs') g.pend++; if (isAdmin() && b != null) { g.billed++; g.margin += c - b; }
    var v = V[vk.toLowerCase()] || (V[vk.toLowerCase()] = { name: vk, n: 0, a: 0, c: 0 }); v.n++; v.a += a; v.c += c;
  });
  if (!S.loaded && !S.entries.length) { $('#sumStats').innerHTML = '<div class="empty" style="grid-column:1/-1"><p>Loading records</p></div>'; $('#sumAgents').innerHTML = ''; $('#sumVillagesCard').hidden = true; return; }
  var st = '<div class="stat"><small>Farmers</small><b>' + T.n + '</b></div><div class="stat"><small>Acres</small><b>' + nf2.format(T.a) + '</b></div><div class="stat"><small>Collected</small><b>' + inr(T.c) + '</b></div><div class="stat"><small>Papers pending</small><b>' + T.pend + '</b></div>';
  if (isAdmin()) st += '<div class="stat gold"><small>Margin</small><b>' + inr(T.margin) + '</b>' + (T.unbilled ? '<small style="text-transform:none;letter-spacing:0">' + T.unbilled + ' without bill value</small>' : '') + '</div>';
  $('#sumStats').innerHTML = st;
  var ag = Object.keys(A).map(function (k) { return A[k]; }).sort(function (x, y) { return y.c - x.c; });
  $('#sumAgents').innerHTML = !isAdmin() ? '' : (ag.length ? '<div class="agents">' + ag.map(function (g) {
    var tot = g.cash + g.upi, cp = tot ? g.cash / tot * 100 : 0;
    return '<div class="agent"><div class="h"><b>' + esc(g.name) + '</b><span class="num">' + pl(g.n, 'farmer') + '</span></div>'
      + '<div class="kv num"><span>Land</span><span>' + nf2.format(g.a) + ' acres</span></div>'
      + '<div class="kv num"><span>Collected</span><b>' + inr(g.c) + '</b></div>'
      + '<div class="bar" aria-hidden="true"><i class="cash" style="width:' + cp + '%"></i><i style="width:' + (tot ? 100 - cp : 0) + '%"></i></div>'
      + '<div class="legend num"><span><i class="cash"></i>Cash ' + inr(g.cash) + '</span><span><i></i>UPI ' + inr(g.upi) + '</span></div>'
      + '<div class="kv num"><span>Papers pending</span><span>' + g.pend + '</span></div>'
      + '<div class="kv num"><span>Margin</span><b class="' + (g.margin < 0 ? 'profit-neg' : 'profit-pos') + '">' + (g.billed ? inr(g.margin) : 'not set') + '</b></div></div>';
  }).join('') + '</div>' : '<section class="card"><div class="empty"><p>No records for this period.</p></div></section>');
  var vs = Object.keys(V).map(function (k) { return V[k]; }).sort(function (x, y) { return y.n - x.n || y.c - x.c; }), max = vs.length ? vs[0].n : 1;
  $('#sumVillagesCard').hidden = !vs.length;
  $('#sumVillages').innerHTML = '<div class="vrow hd"><span>Village</span><span>Farmers</span><span>Acres</span><span>Collected</span></div>' + vs.map(function (v) { return '<div class="vrow"><span class="vn">' + esc(v.name) + '</span><span>' + v.n + '</span><span>' + nf2.format(v.a) + '</span><span>' + inr(v.c) + '</span><div class="vbar"><i style="width:' + (v.n / max * 100) + '%"></i></div></div>'; }).join('');
}
$('#s-period').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; S.sum.period = b.dataset.v; renderSummary(); });
$('#s-date').addEventListener('change', function () { if (this.value) { S.sum.date = this.value; renderSummary(); } });
$('#s-prev').addEventListener('click', function () { S.sum.date = addDays(S.sum.date, S.sum.period === 'week' ? -7 : -1); renderSummary(); });
$('#s-next').addEventListener('click', function () { S.sum.date = addDays(S.sum.date, S.sum.period === 'week' ? 7 : 1); renderSummary(); });
$('#s-today').addEventListener('click', function () { S.sum.date = todayStr(); renderSummary(); });

/* ---------- team (owner) ---------- */
var PW_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
function makePassword() { var out = '', buf = new Uint32Array(8); (window.crypto || window.msCrypto).getRandomValues(buf); for (var i = 0; i < 8; i++) out += PW_CHARS[buf[i] % PW_CHARS.length]; return out; }
function suggestId(name) { var base = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10); if (base.length < 3) base = 'agent'; var taken = S.team.map(function (u) { return u.loginId; }), id; for (var i = 0; i < 30; i++) { id = base + (10 + Math.floor(Math.random() * 90)); if (taken.indexOf(id) < 0) return id; } return base + Date.now().toString().slice(-4); }
var idTouched = false;
function initAgentForm() { idTouched = false; $('#a-name').value = ''; $('#a-id').value = ''; $('#a-pw').value = makePassword(); $('#agentMsg').textContent = ''; }
$('#a-name').addEventListener('input', function () { if (!idTouched) $('#a-id').value = this.value.trim() ? suggestId(this.value) : ''; });
$('#a-id').addEventListener('input', function () { idTouched = true; });
$('#a-regen').addEventListener('click', function () { $('#a-pw').value = makePassword(); });

function secondaryAuth() {
  var existing = firebase.apps.filter(function (a) { return a.name === 'secondary'; })[0];
  var app = existing || firebase.initializeApp(window.FIREBASE_CONFIG, 'secondary');
  return app.auth();
}
$('#agentForm').addEventListener('submit', function (ev) {
  ev.preventDefault();
  if (!isAdmin()) return;
  var name = $('#a-name').value.replace(/\s+/g, ' ').trim(), id = cleanId($('#a-id').value), pw = $('#a-pw').value, msg = $('#agentMsg'); msg.textContent = '';
  $('#credBox').hidden = true;
  if (!name) { msg.textContent = 'Enter the agent name.'; return; }
  if (idProblem(id)) { msg.textContent = idProblem(id); return; }
  if (pw.length < 8) { msg.textContent = 'The password must be at least 8 characters.'; return; }
  var btn = $('#agentBtn'); btn.disabled = true;
  var sa = secondaryAuth(), uid;
  sa.createUserWithEmailAndPassword(toIdEmail(id), pw).then(function (c) {
    uid = c.user.uid;
    return sa.signOut();
  }).then(function () {
    return S.db.doc('users/' + uid).set({ name: name, loginId: id, role: 'agent', active: true, createdAt: new Date().toISOString(), createdBy: myUid() });
  }).then(function () {
    showCredentials(name, id, pw); initAgentForm(); toast('Agent login created');
  }).catch(function (e) {
    msg.textContent = (e && e.code && e.code.indexOf('auth/') === 0) ? authErrText(e) : dbErrText(e);
  }).then(function () { btn.disabled = false; });
});
function showCredentials(name, id, pw) {
  var box = $('#credBox'), text = 'Selva Traders app\nName: ' + name + '\nID: ' + id + '\nPassword: ' + pw;
  box.hidden = false;
  box.innerHTML = '<b>Login for ' + esc(name) + '</b><div class="kv"><span>ID</span><span class="big">' + esc(id) + '</span></div><div class="kv"><span>Password</span><span class="big">' + esc(pw) + '</span></div>'
    + '<p class="note-line">The password is not stored anywhere and cannot be shown again. Copy it now and send it to the agent.</p>'
    + '<div class="row2"><button type="button" class="btn gold" id="credCopy">Copy ID and password</button><button type="button" class="btn" id="credDone">Done</button></div>';
  $('#credCopy').addEventListener('click', function () { copyText(text, function (ok) { toast(ok ? 'Copied. Paste it in WhatsApp.' : 'Could not copy. Write it down.'); }); });
  $('#credDone').addEventListener('click', function () { box.hidden = true; box.innerHTML = ''; });
}
function renderTeam() {
  if (!isAdmin()) return;
  var counts = {}; S.entries.forEach(function (e) { counts[e.agentUid] = (counts[e.agentUid] || 0) + 1; });
  var list = S.team.slice().sort(function (a, b) { return (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1) || String(a.name).localeCompare(String(b.name)); });
  $('#teamList').innerHTML = list.length ? list.map(function (u) {
    var me = u.uid === myUid(), on = u.active === true;
    return '<div class="member' + (on ? '' : ' off') + '"><div style="min-width:0"><div class="nm">' + esc(u.name) + (me ? ' (you)' : '') + '</div><div class="sub num">ID ' + esc(u.loginId) + ' · ' + pl(counts[u.uid] || 0, 'farmer') + '</div></div>'
      + '<div class="acts"><span class="pill ' + (u.role === 'admin' ? 'st-owner' : on ? 'st-issued' : 'st-off') + '">' + (u.role === 'admin' ? 'Owner' : on ? 'On' : 'Off') + '</span>'
      + (me || u.role === 'admin' ? '' : '<button type="button" class="btn sm' + (on ? ' danger' : '') + '" data-tog="' + esc(u.uid) + '" data-on="' + (on ? '0' : '1') + '">' + (on ? 'Turn off' : 'Turn on') + '</button>') + '</div></div>';
  }).join('') : '<div class="empty"><p>No team members yet.</p></div>';
}
$('#teamList').addEventListener('click', function (ev) {
  var b = ev.target.closest('[data-tog]'); if (!b) return;
  S.db.doc('users/' + b.dataset.tog).update({ active: b.dataset.on === '1' }).then(function () { toast(b.dataset.on === '1' ? 'Agent turned on' : 'Agent turned off'); }).catch(function (e) { toast(dbErrText(e)); });
});

/* ---------- tools / account ---------- */
function renderConv() { var v = parseFloat($('#c-val').value), el = $('#convOut'); setSeg($('#c-unit'), C.unit); if (!(v >= 0)) { el.innerHTML = ''; return; } var a = toAcres(v, C.unit); el.innerHTML = '<div><small>Acres</small><b>' + nf2.format(a) + '</b></div><div><small>Cents</small><b>' + nf0.format(a * 100) + '</b></div><div><small>Hectares</small><b>' + nf2.format(a / HA) + '</b></div>'; }
$('#c-val').addEventListener('input', renderConv);
$('#c-unit').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; C.unit = b.dataset.v; renderConv(); });
$('#pwForm').addEventListener('submit', function (ev) {
  ev.preventDefault();
  var old = $('#p-old').value, nw = $('#p-new').value, msg = $('#pwMsg'); msg.textContent = '';
  if (!old) { msg.textContent = 'Enter your current password.'; return; }
  if (nw.length < 8) { msg.textContent = 'The new password must be at least 8 characters.'; return; }
  var u = S.auth.currentUser; if (!u) return;
  var btn = $('#pwBtn'); btn.disabled = true;
  var cred = firebase.auth.EmailAuthProvider.credential(u.email, old);
  u.reauthenticateWithCredential(cred).then(function () { return u.updatePassword(nw); }).then(function () { $('#p-old').value = ''; $('#p-new').value = ''; toast('Password changed'); }).catch(function (e) { msg.textContent = authErrText(e); }).then(function () { btn.disabled = false; });
});

/* ---------- banner, header, today strip ---------- */
function renderBanner() {
  var h = '';
  if (!S.online) h += '<div class="msg warn">No internet. New farmers are saved on this phone and upload when you are online.</div>';
  if (S.dbErr) h += '<div class="msg bad">' + esc(S.dbErr) + '</div>';
  var pend = S.entries.filter(function (e) { return e._pending; }).length;
  if (pend && S.online) h += '<div class="msg info">Uploading ' + pl(pend, 'record') + '</div>';
  $('#banner').innerHTML = h;
}
function renderWho() { var el = $('#whoChip'); if (!S.profile) { el.textContent = ''; return; } el.className = 'who' + (isAdmin() ? ' owner' : ''); el.textContent = S.profile.name + ' · ' + (isAdmin() ? 'Owner' : 'Agent'); $('#acName').textContent = S.profile.name; $('#acId').textContent = S.profile.loginId; }
function renderToday() {
  var t = todayStr(), l = vis().filter(function (e) { return e.date === t; });
  var a = l.reduce(function (x, e) { return x + acresOf(e); }, 0), c = l.reduce(function (x, e) { return x + (e.collection || 0); }, 0);
  $('#todayStrip').innerHTML = (isAdmin() ? 'Today so far: ' : 'Your day so far: ') + '<b>' + l.length + '</b> ' + (l.length === 1 ? 'farmer' : 'farmers') + ' · <b>' + nf2.format(a) + '</b> acres · <b>' + inr(c) + '</b> collected';
  $('#todayChip').textContent = fmtDay(t);
  var vs = {}; S.entries.forEach(function (e) { if (e.village) vs[e.village] = 1; });
  $('#villageList').innerHTML = Object.keys(vs).sort().map(function (v) { return '<option value="' + esc(v) + '">'; }).join('');
}
function renderAll() { if (!S.profile) return; renderBanner(); renderWho(); renderToday(); renderAgentFilter(); renderRecords(); renderSummary(); renderTeam(); }

addEventListener('online', function () { S.online = true; renderBanner(); });
addEventListener('offline', function () { S.online = false; renderBanner(); });

/* ---------- start ---------- */
function boot() {
  setSeg($('#f-unit'), F.unit); setSeg($('#f-mode'), F.mode); syncRecControls(); renderConv(); initAgentForm();
  var cfg = window.FIREBASE_CONFIG;
  if (!window.firebase || !firebase.initializeApp) { showConfigProblem('The Firebase files are missing from the app. Rebuild the APK using the steps in the setup guide (the "Copy Firebase files" step must run).'); return; }
  if (!cfg || /PASTE_/.test(String(cfg.apiKey) + String(cfg.projectId))) { showConfigProblem('The Firebase settings are not filled in. Open www/firebase-config.js, paste your settings, and build the APK again.'); return; }
  try {
    firebase.initializeApp(cfg);
    S.auth = firebase.auth(); S.db = firebase.firestore();
    try { S.db.enablePersistence({ synchronizeTabs: false }).catch(function () {}); } catch (e) {}
  } catch (e) { showConfigProblem('The Firebase settings could not be used. Check that every value in www/firebase-config.js was copied correctly.'); return; }
  showScreen('login');
  S.auth.onAuthStateChanged(function (u) { onUser(u); });
}
boot();
})();
