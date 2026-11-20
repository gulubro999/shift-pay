(function () {
  'use strict';

  /* ---------- constants ---------- */
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MON_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const SHIFTS = {
    day:     { label: 'Day Shift',     short: 'DAY',   dot: 'bg-[#059669]' },
    evening: { label: 'Evening Shift', short: 'EVE',   dot: 'bg-[#f59e0b]' },
    night:   { label: 'Night Shift',   short: 'NIGHT', dot: 'bg-[#4f46e5]' },
    absent:  { label: 'Absent',        short: 'ABS',   dot: 'bg-[#e11d48]' }
  };
  const ORDER = ['day', 'evening', 'night', 'absent'];
  const LS_KEY = 'spp_cache_v1';

  // True only inside the Android app built with Capacitor. In a normal browser it is false.
  const CAP = window.Capacitor;
  const IS_NATIVE = !!(CAP && typeof CAP.isNativePlatform === 'function' && CAP.isNativePlatform());

  const B_PRIMARY = 'bg-[#4f46e5] hover:bg-[#4338ca] active:scale-95 transition text-white text-[13px] font-extrabold px-4 py-3 rounded-2xl';
  const B_GHOST = 'bg-slate-100 hover:bg-slate-200 active:scale-95 transition text-slate-700 text-[13px] font-extrabold px-4 py-3 rounded-2xl';
  const B_DANGER = 'bg-[#e11d48] hover:bg-[#be123c] active:scale-95 transition text-white text-[13px] font-extrabold px-4 py-3 rounded-2xl';
  const B_CLOSE = 'w-9 h-9 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold text-sm transition';

  /* ---------- state ---------- */
  const state = {
    companies: {},
    view: 'home',
    cid: null,
    y: new Date().getFullYear(),
    m: new Date().getMonth(),
    brush: 'popup',
    installEvt: null
  };
  let modalCtx = null;
  let modalAt = 0;

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const num = (v) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? Math.min(n, 1e9) : 0; };
  const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymKey = (y, m) => y + '-' + pad2(m + 1);
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'company';

  /* ---------- motion helpers ---------- */
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Restart a CSS animation class on an element, and drop the class once it finishes.
  function replay(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    const done = (e) => {
      if (e.target !== el) return;
      el.classList.remove(cls);
      el.removeEventListener('animationend', done);
    };
    el.addEventListener('animationend', done);
  }

  // Count a number up or down to its new value. snap = whole numbers while moving.
  function tween(el, to, fmtFn, snap) {
    cancelAnimationFrame(el._raf);
    const from = typeof el._cur === 'number' ? el._cur : to;
    if (REDUCED || document.hidden || from === to) { el._cur = to; el.textContent = fmtFn(to); return; }
    const t0 = performance.now(), dur = 340;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      if (k >= 1) { el._cur = to; el.textContent = fmtFn(to); return; }
      const v = from + (to - from) * (1 - Math.pow(1 - k, 3));
      el._cur = v;
      el.textContent = fmtFn(snap ? Math.round(v) : v);
      el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    clearTimeout(toast.t);
    clearTimeout(toast.t2);
    t.classList.remove('out');
    t.hidden = false;
    toast.t = setTimeout(() => {
      t.classList.add('out');
      toast.t2 = setTimeout(() => { t.hidden = true; t.classList.remove('out'); }, REDUCED ? 0 : 200);
    }, 2600);
  }

  /* ---------- data model ---------- */
  function normalize(raw, id) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const c = {
      id: String(id || raw.id || newId()).replace(/[^A-Za-z0-9_\-.:@+~]/g, '_').slice(0, 100),
      name: String(raw.name || 'Company').slice(0, 60),
      createdAt: Number(raw.createdAt) || Date.now(),
      months: {}
    };
    const ms = raw.months && typeof raw.months === 'object' ? raw.months : {};
    Object.keys(ms).forEach((k) => {
      if (!/^\d{4}-\d{2}$/.test(k)) return;
      const m = ms[k] || {};
      const out = { s: {}, n: {}, p: {} };
      const s = m.s || {}, n = m.n || {}, p = m.p || {};
      Object.keys(s).forEach((d) => { if (/^\d{1,2}$/.test(d) && SHIFTS[s[d]]) out.s[d] = s[d]; });
      Object.keys(n).forEach((d) => { if (/^\d{1,2}$/.test(d) && typeof n[d] === 'string' && n[d].trim()) out.n[d] = n[d].slice(0, 300); });
      ['inHand', 'pf', 'esic', 'food'].forEach((f) => { const v = Number(p[f]); if (isFinite(v) && v > 0) out.p[f] = Math.min(v, 1e9); });
      c.months[k] = out;
    });
    return c;
  }

  const curCompany = () => state.companies[state.cid];

  function monthData(create, c, y, m) {
    c = c || curCompany();
    if (!c) return null;
    const k = ymKey(y == null ? state.y : y, m == null ? state.m : m);
    if (!c.months[k]) {
      if (!create) return null;
      c.months[k] = { s: {}, n: {}, p: {} };
    }
    return c.months[k];
  }

  function calcStats(c, y, m) {
    const md = monthData(false, c, y, m);
    const days = daysInMonth(y, m);
    const r = { d: 0, e: 0, n: 0, a: 0, present: 0, days: days, pct: 0 };
    if (md) {
      Object.keys(md.s).forEach((k) => {
        if (+k < 1 || +k > days) return;
        const v = md.s[k];
        if (v === 'day') r.d++;
        else if (v === 'evening') r.e++;
        else if (v === 'night') r.n++;
        else if (v === 'absent') r.a++;
      });
    }
    r.present = r.d + r.e + r.n;
    r.pct = days ? (r.present / days) * 100 : 0;
    return r;
  }

  function calcPay(c, y, m) {
    const md = monthData(false, c, y, m);
    const p = (md && md.p) || {};
    const inHand = num(p.inHand), pf = num(p.pf), esic = num(p.esic), food = num(p.food);
    const gross = inHand + pf + esic + food;
    const st = calcStats(c, y, m);
    return {
      inHand, pf, esic, food, gross, present: st.present,
      perDay: st.present > 0 ? gross / st.present : 0,
      share: gross > 0 ? (inHand / gross) * 100 : 0
    };
  }

  /* ---------- sync indicator ---------- */
  const DOT = {
    ready: 'bg-emerald-500 animate-pulse',
    saving: 'bg-amber-500 animate-pulse',
    saved: 'bg-emerald-500',
    local: 'bg-slate-400',
    error: 'bg-rose-500'
  };
  function setSync(kind, text) {
    $('syncDot').className = 'w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-300 ' + (DOT[kind] || DOT.local);
    $('syncStatusText').textContent = text;
  }

  /* ---------- persistence (this device only) ---------- */
  function saveLocal() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ companies: state.companies }));
      return true;
    } catch (e) {
      return false;
    }
  }
  function readLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return {};
      const o = JSON.parse(raw);
      const out = {};
      Object.values((o && o.companies) || {}).forEach((x) => { const c = normalize(x, x && x.id); out[c.id] = c; });
      return out;
    } catch (e) { return {}; }
  }

  let savedT = null;
  function touch() {
    clearTimeout(savedT);
    if (saveLocal()) {
      setSync('saved', 'Saved ✓');
      savedT = setTimeout(() => setSync('ready', 'Saved on this device'), 1800);
    } else {
      setSync('error', 'Could not save on this device');
      toast('Storage is full or blocked. Download a backup so you do not lose your data.');
    }
  }

  /* ---------- modal ---------- */
  let closeT = null;
  function openModal(inner) {
    modalAt = Date.now();
    clearTimeout(closeT);
    $('modalRoot').innerHTML = '<div class="sheet-backdrop" data-act="backdrop"><div class="sheet" role="dialog" aria-modal="true" tabindex="-1">' + inner + '</div></div>';
    document.body.classList.add('modal-open');
    const sh = $('modalRoot').querySelector('.sheet');
    if (sh) { try { sh.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  function closeModal() {
    const root = $('modalRoot');
    const bd = root.firstElementChild;
    document.body.classList.remove('modal-open');
    modalCtx = null;
    clearTimeout(closeT);
    if (!bd || REDUCED) { root.innerHTML = ''; return; }
    bd.classList.add('closing');
    closeT = setTimeout(() => { root.innerHTML = ''; }, 190);
  }
  const sheetHead = (kicker, title) =>
    '<div class="flex items-start justify-between gap-3">' +
      '<div class="min-w-0"><p class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">' + esc(kicker) + '</p>' +
      '<h3 class="text-[20px] font-extrabold text-[#0f172a] leading-snug break-words">' + esc(title) + '</h3></div>' +
      '<button type="button" data-act="closeModal" aria-label="Close" class="' + B_CLOSE + '">✕</button>' +
    '</div>';

  /* ---------- rendering: home ---------- */
  function renderHome() {
    const list = Object.values(state.companies).sort((a, b) => a.createdAt - b.createdAt);
    const box = $('companyListContainer');
    if (!list.length) {
      box.innerHTML =
        '<div class="bg-white border-2 border-dashed border-slate-200 rounded-[24px] p-6 text-center">' +
          '<div class="text-4xl mb-2">🗂️</div>' +
          '<h3 class="text-[#0f172a] font-extrabold text-[16px]">No companies yet</h3>' +
          '<p class="text-slate-500 text-[13px] leading-relaxed mt-1.5">Add the company you work for, then mark your shift for each day. Your full monthly salary is calculated for you.</p>' +
          '<div class="flex flex-col gap-2.5 mt-4">' +
            '<button type="button" data-act="addCompany" class="' + B_PRIMARY + '">+ Add your first company</button>' +
            '<button type="button" data-act="loadDemo" class="' + B_GHOST + '">Try it with demo data</button>' +
          '</div>' +
        '</div>';
      return;
    }
    const t = new Date();
    box.innerHTML = list.map((c) => {
      const st = calcStats(c, t.getFullYear(), t.getMonth());
      const pay = calcPay(c, t.getFullYear(), t.getMonth());
      return '<div class="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden' + (c.id === state.fresh ? ' card-in' : '') + '">' +
        '<button type="button" data-act="openCompany" data-id="' + esc(c.id) + '" class="w-full text-left p-4 flex items-center gap-3.5 hover:bg-slate-50 active:bg-slate-50 transition">' +
          '<span class="w-12 h-12 rounded-2xl bg-[#0f172a] text-[#10b981] flex items-center justify-center text-xl font-extrabold shrink-0">' + esc(c.name.trim().charAt(0).toUpperCase() || '?') + '</span>' +
          '<span class="min-w-0 flex-1">' +
            '<span class="block text-[#0f172a] font-extrabold text-[16px] truncate">' + esc(c.name) + '</span>' +
            '<span class="block text-slate-500 text-xs mt-0.5">' + MON[t.getMonth()] + ' ' + t.getFullYear() + ' summary</span>' +
          '</span>' +
          '<span class="text-slate-300 text-2xl leading-none">›</span>' +
        '</button>' +
        '<div class="grid grid-cols-3 border-t border-slate-100 text-center">' +
          '<div class="py-2.5"><p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">Present</p><p class="text-[#047857] font-extrabold text-[15px] tnum">' + st.present + '</p></div>' +
          '<div class="py-2.5 border-x border-slate-100"><p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">Absent</p><p class="text-[#be123c] font-extrabold text-[15px] tnum">' + st.a + '</p></div>' +
          '<div class="py-2.5"><p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">Gross</p><p class="text-[#0f172a] font-extrabold text-[15px] tnum">' + (pay.gross ? fmt(pay.gross) : '—') + '</p></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 border-t border-slate-100">' +
          '<button type="button" data-act="renameCompany" data-id="' + esc(c.id) + '" class="py-2.5 text-[12px] font-bold text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition">Rename</button>' +
          '<button type="button" data-act="deleteCompany" data-id="' + esc(c.id) + '" class="py-2.5 text-[12px] font-bold text-slate-500 hover:text-rose-600 hover:bg-slate-50 border-l border-slate-100 transition">Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');
    state.fresh = null;
  }

  /* ---------- rendering: detail ---------- */
  function renderBrush() {
    ['popup', 'cycle', 'day', 'evening', 'night', 'absent'].forEach((k) => {
      const b = $('mode-' + k);
      if (!b) return;
      const on = state.brush === k;
      b.classList.toggle('bg-[#0f172a]', on);
      b.classList.toggle('text-white', on);
      b.classList.toggle('border-[#0f172a]', on);
      b.classList.toggle('bg-white', !on);
      b.classList.toggle('text-slate-700', !on);
      b.classList.toggle('border-slate-200', !on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    let hint;
    if (state.brush === 'popup') hint = 'Tap any date to mark a shift or add a note.';
    else if (state.brush === 'cycle') hint = 'Each tap changes the shift: Day → Eve → Night → Absent → empty. Press and hold a date to add a note.';
    else hint = SHIFTS[state.brush].label + ' mode: tap dates to apply it, tap again to remove it. Press and hold a date to add a note.';
    $('brushHintText').textContent = hint;
  }

  const emptyMonth = () => monthData(false) || { s: {}, n: {}, p: {} };

  function cellInfo(d, md) {
    const t = new Date();
    const thisMonth = state.y === t.getFullYear() && state.m === t.getMonth();
    const first = new Date(state.y, state.m, 1).getDay();
    const sh = md.s[d];
    const note = md.n[d];
    const dow = (first + d - 1) % 7;
    return {
      cls: 'cal-cell ' + (sh ? 'sh-' + sh : 'sh-none' + (dow === 0 ? ' sun' : '')) + (thisMonth && d === t.getDate() ? ' is-today' : ''),
      label: d + ' ' + MON[state.m] + ', ' + (sh ? SHIFTS[sh].label : 'no shift') + (note ? ', has a note' : ''),
      inner: '<span class="cal-num">' + d + '</span><span class="cal-tag">' + (sh ? SHIFTS[sh].short : '') + '</span>' + (note ? '<span class="note-dot"></span>' : '')
    };
  }

  function renderCalendar(slide) {
    const md = emptyMonth();
    const first = new Date(state.y, state.m, 1).getDay();
    const n = daysInMonth(state.y, state.m);
    let h = '';
    for (let i = 0; i < first; i++) h += '<div class="cal-empty"></div>';
    for (let d = 1; d <= n; d++) {
      const c = cellInfo(d, md);
      h += '<button type="button" class="' + c.cls + '" data-act="cell" data-day="' + d + '" aria-label="' + esc(c.label) + '">' + c.inner + '</button>';
    }
    const tail = (7 - ((first + n) % 7)) % 7;
    for (let i = 0; i < tail; i++) h += '<div class="cal-empty"></div>';
    $('calendarGrid').innerHTML = h;
    if (slide) replay($('calendarGrid'), slide);
  }

  // Update one cell in place so its colour fades to the new shift instead of snapping.
  function updateCell(day, pop) {
    const btn = $('calendarGrid').querySelector('[data-day="' + day + '"]');
    if (!btn) { renderCalendar(); return; }
    const c = cellInfo(day, emptyMonth());
    btn.className = c.cls;
    btn.setAttribute('aria-label', c.label);
    btn.innerHTML = c.inner;
    if (pop) replay(btn, 'pop');
  }

  function afterCellChange(day) {
    updateCell(day, true);
    renderStats();
    renderCalc();
  }

  function renderStats() {
    const c = curCompany();
    const s = calcStats(c, state.y, state.m);
    tween($('attendancePercentBadge'), s.pct, (v) => v.toFixed(1) + '%', false);
    tween($('statTotalPresent'), s.present, String, true);
    tween($('statTotalAbsent'), s.a, String, true);
    $('statShiftBreakdown').textContent = 'D:' + s.d + ' • E:' + s.e + ' • N:' + s.n;
    $('statMonthDays').textContent = s.days;
  }

  function renderCalc() {
    const c = curCompany();
    const p = calcPay(c, state.y, state.m);
    $('calcCardSubtitle').textContent = c.name + ' • ' + MON[state.m].toUpperCase() + ' ' + state.y;
    $('calcInHand').textContent = fmt(p.inHand);
    $('calcPF').textContent = fmt(p.pf);
    $('calcESIC').textContent = fmt(p.esic);
    $('calcFood').textContent = fmt(p.food);
    tween($('calcTotal'), p.gross, fmt, true);
    $('calcPerDay').textContent = p.present > 0 && p.gross > 0 ? fmt(Math.round(p.perDay)) : '—';
    $('calcShare').textContent = p.gross > 0 ? p.share.toFixed(1) + '%' : '—';
  }

  function loadPayrollInputs() {
    const md = monthData(false);
    const p = (md && md.p) || {};
    $('inputInHand').value = p.inHand ? p.inHand : '';
    $('inputPF').value = p.pf ? p.pf : '';
    $('inputESIC').value = p.esic ? p.esic : '';
    $('inputFood').value = p.food ? p.food : '';
  }

  function renderDetail(opts) {
    const c = curCompany();
    if (!c) return;
    $('detailCompanyName').textContent = c.name;
    $('calendarMonthTitle').textContent = (MON[state.m] + ' ' + state.y).toUpperCase();
    renderBrush();
    renderCalendar(opts && opts.slide);
    renderStats();
    renderCalc();
    if (opts && opts.reloadInputs) loadPayrollInputs();
  }

  let lastView = null;
  function render() {
    if (state.view === 'detail' && !curCompany()) { state.view = 'home'; state.cid = null; }
    $('homeView').hidden = state.view !== 'home';
    $('detailView').hidden = state.view !== 'detail';
    if (state.view === 'home') renderHome();
    else renderDetail();
    if (lastView !== state.view) {
      lastView = state.view;
      replay($(state.view === 'home' ? 'homeView' : 'detailView'), 'view-in');
    }
  }

  /* ---------- mutations ---------- */
  function setShift(day, shift) {
    const c = curCompany();
    const md = monthData(true);
    if (shift) md.s[day] = shift; else delete md.s[day];
    touch(c.id);
  }
  function setNote(day, text) {
    const c = curCompany();
    const md = monthData(true);
    text = String(text || '').trim().slice(0, 300);
    if (text) md.n[day] = text; else delete md.n[day];
    touch(c.id);
  }
  function refreshMonth() { renderCalendar(); renderStats(); renderCalc(); }

  function onCell(day) {
    if (state.brush === 'popup') { openDayModal(day); return; }
    const md = monthData(false);
    const cur = md ? md.s[day] : null;
    let next;
    if (state.brush === 'cycle') {
      const i = cur ? ORDER.indexOf(cur) : -1;
      next = i === ORDER.length - 1 ? null : ORDER[i + 1];
    } else {
      next = cur === state.brush ? null : state.brush;
    }
    setShift(day, next);
    afterCellChange(day);
  }

  function handlePayrollInput() {
    const c = curCompany();
    if (!c) return;
    const md = monthData(true);
    const p = {};
    const a = num($('inputInHand').value), b = num($('inputPF').value), e = num($('inputESIC').value), f = num($('inputFood').value);
    if (a) p.inHand = a;
    if (b) p.pf = b;
    if (e) p.esic = e;
    if (f) p.food = f;
    md.p = p;
    touch(c.id);
    renderCalc();
  }

  /* ---------- modals ---------- */
  function openDayModal(day) {
    const md = monthData(false);
    const cur = md ? md.s[day] : null;
    const note = md ? md.n[day] || '' : '';
    const d = new Date(state.y, state.m, day);
    modalCtx = { day: day };
    openModal(
      sheetHead('Mark shift', DOW[d.getDay()] + ', ' + day + ' ' + MON[state.m] + ' ' + state.y) +
      '<div class="grid grid-cols-2 gap-2.5 mt-4">' +
        ORDER.map((k) =>
          '<button type="button" data-act="pickShift" data-shift="' + k + '" class="flex items-center gap-2.5 px-3.5 py-3.5 rounded-2xl border text-left text-[13px] font-extrabold text-slate-800 active:scale-95 transition ' +
          (cur === k ? 'border-[#0f172a] bg-slate-50 ring-2 ring-[#0f172a]' : 'border-slate-200 bg-white hover:bg-slate-50') + '">' +
          '<span class="w-4 h-4 rounded-full shrink-0 ' + SHIFTS[k].dot + '"></span>' + SHIFTS[k].label + '</button>'
        ).join('') +
      '</div>' +
      '<label for="dayNote" class="block text-[#1e293b] text-xs font-extrabold mt-4 mb-1.5">Note (optional)</label>' +
      '<textarea id="dayNote" rows="3" maxlength="300" placeholder="e.g. 2 hours overtime, replacement duty…"></textarea>' +
      '<div class="grid grid-cols-2 gap-2.5 mt-4">' +
        '<button type="button" data-act="clearShift" class="' + B_GHOST + '">Remove shift</button>' +
        '<button type="button" data-act="saveNote" class="' + B_PRIMARY + '">Save note</button>' +
      '</div>'
    );
    $('dayNote').value = note;
  }

  function renderMonthPicker() {
    const mp = modalCtx;
    $('modalRoot').querySelector('.sheet').innerHTML =
      sheetHead('Jump to', 'Choose month and year') +
      '<div class="flex items-center justify-between mt-4 bg-slate-50 rounded-2xl p-1.5">' +
        '<button type="button" data-act="mpYear" data-d="-1" aria-label="Previous year" class="w-11 h-11 rounded-xl bg-white border border-slate-200 font-extrabold text-slate-700 active:scale-95 transition">◀</button>' +
        '<span class="text-[20px] font-extrabold text-[#0f172a] tnum">' + mp.y + '</span>' +
        '<button type="button" data-act="mpYear" data-d="1" aria-label="Next year" class="w-11 h-11 rounded-xl bg-white border border-slate-200 font-extrabold text-slate-700 active:scale-95 transition">▶</button>' +
      '</div>' +
      '<div class="grid grid-cols-3 gap-2.5 mt-3.5">' +
        MON.map((nm, i) => {
          const on = mp.y === state.y && i === state.m;
          return '<button type="button" data-act="mpPick" data-m="' + i + '" class="py-3 rounded-2xl text-[13px] font-extrabold border active:scale-95 transition ' +
            (on ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50') + '">' + nm + '</button>';
        }).join('') +
      '</div>' +
      '<button type="button" data-act="mpToday" class="' + B_GHOST + ' w-full mt-3.5">This month</button>';
  }

  function openCompanyModal(id) {
    const c = id ? state.companies[id] : null;
    modalCtx = { id: id || null };
    openModal(
      sheetHead(c ? 'Rename' : 'New company', c ? 'Company name' : 'Add company') +
      '<label for="companyNameInput" class="block text-[#1e293b] text-xs font-extrabold mt-4 mb-1.5">Company name</label>' +
      '<input type="text" id="companyNameInput" maxlength="40" autocomplete="off" placeholder="e.g. Loyal Security" />' +
      '<div class="grid grid-cols-2 gap-2.5 mt-4">' +
        '<button type="button" data-act="closeModal" class="' + B_GHOST + '">Cancel</button>' +
        '<button type="button" data-act="saveCompany" class="' + B_PRIMARY + '">' + (c ? 'Save' : 'Add company') + '</button>' +
      '</div>'
    );
    const inp = $('companyNameInput');
    inp.value = c ? c.name : '';
    try { inp.focus(); } catch (e) { /* ignore */ }
  }

  function openConfirm(kicker, title, body, yesLabel, yesAct, yesClass) {
    openModal(
      sheetHead(kicker, title) +
      '<p class="text-slate-600 text-[13.5px] leading-relaxed mt-3">' + body + '</p>' +
      '<div class="grid grid-cols-2 gap-2.5 mt-4">' +
        '<button type="button" data-act="closeModal" class="' + B_GHOST + '">Cancel</button>' +
        '<button type="button" data-act="' + yesAct + '" class="' + yesClass + '">' + yesLabel + '</button>' +
      '</div>'
    );
  }

  function openHelp() {
    const where = 'Your data is saved on this phone only and works without internet. If you uninstall the app or clear its data, it is lost, so use Download Backup every now and then.';
    const step = (n, t) => '<li class="flex gap-3"><span class="w-6 h-6 rounded-full bg-[#eef2ff] text-[#4f46e5] text-[12px] font-extrabold flex items-center justify-center shrink-0">' + n + '</span><span class="text-[13px] text-slate-700 leading-relaxed">' + t + '</span></li>';
    openModal(
      sheetHead('Quick guide', 'How to Use') +
      '<ol class="space-y-3 mt-4">' +
        step(1, 'Tap <b>Add New Company</b> and enter the name of your job. You can add more than one company.') +
        step(2, 'Open a company. Choose a <b>Mode</b> at the top: <b>Tap &amp; Pick</b> (tap a date, then choose the shift), <b>Fast Cycle</b> (each tap changes the shift), or Day / Eve / Night / Absent to paint dates directly.') +
        step(3, '<b>Press and hold</b> a date to add a note (for example overtime). Dates with a note show a small dot.') +
        step(4, 'Fill in <b>In-Hand, PF, ESIC and Mess</b> below. The sum of these is your <b>Total Gross Salary</b>. Your earnings per present day are shown too.') +
        step(5, 'Open the <b>Salary Slip</b> to see the full month summary, then save or copy it.') +
      '</ol>' +
      '<p class="text-[12px] text-slate-500 leading-relaxed mt-4 pt-3 border-t border-slate-100">' + where + '</p>' +
      '<button type="button" data-act="closeModal" class="' + B_PRIMARY + ' w-full mt-3">Got it</button>'
    );
  }

  /* ---------- slip ---------- */
  function slipData() {
    const c = curCompany();
    return { c: c, st: calcStats(c, state.y, state.m), pay: calcPay(c, state.y, state.m), label: MON_FULL[state.m] + ' ' + state.y };
  }
  function slipText() {
    const s = slipData();
    return [
      'SALARY SLIP',
      'Company: ' + s.c.name,
      'Month: ' + s.label,
      '',
      'ATTENDANCE',
      'Present: ' + s.st.present + ' (Day ' + s.st.d + ', Evening ' + s.st.e + ', Night ' + s.st.n + ')',
      'Absent: ' + s.st.a,
      'Month days: ' + s.st.days + ' | Attendance: ' + s.st.pct.toFixed(1) + '%',
      '',
      'EARNINGS',
      'In-Hand Salary: ' + fmt(s.pay.inHand),
      'PF Deposited: ' + fmt(s.pay.pf),
      'ESIC Deducted: ' + fmt(s.pay.esic),
      'Mess / Food: ' + fmt(s.pay.food),
      'Total Gross Salary: ' + fmt(s.pay.gross),
      'Per present day: ' + (s.pay.present > 0 && s.pay.gross > 0 ? fmt(Math.round(s.pay.perDay)) : '-')
    ].join('\n');
  }
  function slipHtml() {
    const s = slipData();
    const row = (a, b, strong) => '<tr' + (strong ? ' class="t"' : '') + '><td>' + esc(a) + '</td><td class="r">' + esc(b) + '</td></tr>';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Salary Slip</title>' +
      '<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f1f5f9;margin:0;padding:24px;color:#0f172a}' +
      '.slip{max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px}' +
      'h1{font-size:20px;margin:0 0 2px}p{margin:0 0 16px;color:#64748b;font-size:13px}h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:18px 0 6px}' +
      'table{width:100%;border-collapse:collapse;font-size:14px}td{padding:7px 0;border-bottom:1px solid #f1f5f9}.r{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}' +
      '.t td{border-top:2px solid #0f172a;border-bottom:0;font-weight:800;font-size:16px;padding-top:10px}</style></head><body><div class="slip">' +
      '<h1>Salary Slip</h1><p>' + esc(s.c.name) + ' &middot; ' + esc(s.label) + '</p>' +
      '<h2>Attendance</h2><table>' +
        row('Present', s.st.present + ' (D ' + s.st.d + ' / E ' + s.st.e + ' / N ' + s.st.n + ')') +
        row('Absent', String(s.st.a)) +
        row('Month days', String(s.st.days)) +
        row('Attendance', s.st.pct.toFixed(1) + '%') +
      '</table><h2>Earnings</h2><table>' +
        row('In-Hand Salary', fmt(s.pay.inHand)) +
        row('PF Deposited', fmt(s.pay.pf)) +
        row('ESIC Deducted', fmt(s.pay.esic)) +
        row('Mess / Food', fmt(s.pay.food)) +
        row('Total Gross Salary', fmt(s.pay.gross), true) +
        row('Per present day', s.pay.present > 0 && s.pay.gross > 0 ? fmt(Math.round(s.pay.perDay)) : '-') +
      '</table></div></body></html>';
  }
  function openSlip() {
    const s = slipData();
    const line = (a, b) => '<div class="flex justify-between gap-3 py-1.5 text-[13px]"><span class="text-slate-500">' + esc(a) + '</span><span class="font-extrabold text-[#0f172a] tnum text-right">' + esc(b) + '</span></div>';
    openModal(
      sheetHead('Salary Slip', s.c.name + ' • ' + s.label) +
      '<div id="printableSlipArea" class="mt-4 rounded-2xl border border-slate-200 p-4">' +
        '<p class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Attendance</p>' +
        line('Present', s.st.present + ' (D ' + s.st.d + ' / E ' + s.st.e + ' / N ' + s.st.n + ')') +
        line('Absent', String(s.st.a)) +
        line('Month days', s.st.days + ' • ' + s.st.pct.toFixed(1) + '%') +
        '<p class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mt-3.5 mb-1">Earnings</p>' +
        line('In-Hand Salary', fmt(s.pay.inHand)) +
        line('PF Deposited', fmt(s.pay.pf)) +
        line('ESIC Deducted', fmt(s.pay.esic)) +
        line('Mess / Food', fmt(s.pay.food)) +
        '<div class="flex justify-between items-end gap-3 mt-2 pt-3 border-t-2 border-[#0f172a]"><span class="text-[13px] font-extrabold">Total Gross Salary</span><span class="text-[22px] leading-none font-extrabold text-[#047857] tnum">' + fmt(s.pay.gross) + '</span></div>' +
        (s.pay.present > 0 && s.pay.gross > 0 ? '<p class="text-[12px] text-slate-500 mt-2">Per present day: <b class="text-slate-700">' + fmt(Math.round(s.pay.perDay)) + '</b></p>' : '') +
      '</div>' +
      '<div class="grid grid-cols-2 gap-2.5 mt-4">' +
        '<button type="button" data-act="slipSave" class="' + B_PRIMARY + '">Save slip</button>' +
        '<button type="button" data-act="slipCopy" class="' + B_GHOST + '">Copy text</button>' +
      '</div>'
    );
  }

  /* ---------- backup / restore ---------- */
  function buildBackup() {
    return JSON.stringify({
      app: 'shift-payroll',
      version: 1,
      exportedAt: new Date().toISOString(),
      companies: Object.values(state.companies)
    }, null, 2);
  }

  // Inside the Android app: write the file to the app's cache, then open the phone's share
  // sheet so the user can save it to Files / Drive or send it on WhatsApp.
  async function saveNative(filename, data) {
    const P = (CAP && CAP.Plugins) || {};
    if (!P.Filesystem || !P.Share) throw new Error('Native file plugins are missing');
    const res = await P.Filesystem.writeFile({ path: filename, data: data, directory: 'CACHE', encoding: 'utf8' });
    try {
      await P.Share.share({ title: filename, dialogTitle: 'Save or send ' + filename, url: res.uri });
    } catch (e) {
      // Closing the share sheet without choosing anything is not an error.
      if (/cancel/i.test(String((e && e.message) || e))) return true;
      throw e;
    }
    return true;
  }

  // Saves a file. In the Android app it opens the share sheet; in a browser it downloads
  // the file to the phone's Downloads folder.
  async function saveFile(filename, data, mime, okMsg) {
    if (IS_NATIVE) {
      try { return await saveNative(filename, data); } catch (e) { return false; }
    }
    try {
      const url = URL.createObjectURL(new Blob([data], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast(okMsg);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function downloadBackup() {
    if (!Object.keys(state.companies).length) { toast('Add a company first to create a backup'); return; }
    const ok = await saveFile('shift-payroll-backup-' + todayStr() + '.json', buildBackup(), 'application/json', 'Backup downloaded ✓');
    if (!ok) { toast('Could not save the file. Use backup text instead.'); openBackupText(); }
  }

  function copyFrom(id) {
    const ta = $(id);
    if (!ta) return;
    const done = () => toast('Copied ✓');
    const fallback = () => { try { ta.focus(); ta.select(); } catch (e) { /* ignore */ } toast('Text selected, now copy it'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }

  function openBackupText() {
    modalCtx = { kind: 'backupText' };
    const has = Object.keys(state.companies).length > 0;
    openModal(
      sheetHead('Backup text', 'Copy or paste') +
      (has
        ? '<p class="text-[12.5px] text-slate-500 leading-relaxed mt-3">This is your full backup as text. Copy it and save it in Notes or WhatsApp.</p>' +
          '<textarea id="backupOut" rows="4" readonly class="mt-2 text-[11px]"></textarea>' +
          '<button type="button" data-act="copyBackup" class="' + B_GHOST + ' w-full mt-2.5">Copy backup text</button>'
        : '<p class="text-[12.5px] text-slate-500 leading-relaxed mt-3">There is no company to back up yet.</p>') +
      '<p class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mt-5 mb-1.5">Restore from backup</p>' +
      '<textarea id="backupIn" rows="3" placeholder="Paste your copied backup text here" class="text-[11px]"></textarea>' +
      '<button type="button" data-act="restoreFromText" class="' + B_PRIMARY + ' w-full mt-2.5">Restore from this text</button>'
    );
    if (has) $('backupOut').value = buildBackup();
  }

  function parseRestore(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { toast('This is not a valid backup'); return; }
    const list = Array.isArray(o) ? o : (o && Array.isArray(o.companies) ? o.companies : null);
    const items = (list || []).filter((x) => x && typeof x === 'object').map((x) => normalize(x, x.id));
    if (!items.length) { toast('No companies found in this backup'); return; }
    modalCtx = { restore: items };
    openConfirm(
      'Restore', items.length + (items.length === 1 ? ' company found' : ' companies found'),
      items.map((c) => '<b>' + esc(c.name) + '</b>').join(', ') + '. If any of these companies already exist, their data will be replaced by the backup. Your other companies stay as they are.',
      'Restore', 'confirmRestore', B_PRIMARY
    );
  }

  /* ---------- demo data ---------- */
  function loadDemo() {
    const t = new Date();
    const c = normalize({ name: 'Demo Company', createdAt: Date.now() }, newId());
    const pat = ['day', 'day', 'evening', 'evening', 'night', 'night', 'absent'];
    const fill = (y, m, upto) => {
      const md = { s: {}, n: {}, p: {} };
      for (let d = 1; d <= upto; d++) md.s[d] = pat[(d - 1) % pat.length];
      c.months[ymKey(y, m)] = md;
      return md;
    };
    let py = t.getFullYear(), pm = t.getMonth() - 1;
    if (pm < 0) { pm = 11; py--; }
    const prev = fill(py, pm, daysInMonth(py, pm));
    prev.n[5] = '2 hours overtime';
    prev.n[12] = 'Replacement duty';
    prev.p = { inHand: 22500, pf: 2400, esic: 169, food: 1800 };
    fill(t.getFullYear(), t.getMonth(), t.getDate());
    state.companies[c.id] = c;
    touch(c.id);
    state.cid = c.id;
    state.view = 'detail';
    state.y = py;
    state.m = pm;
    render();
    loadPayrollInputs();
    window.scrollTo(0, 0);
    toast('Demo data loaded. Delete it and add your own company.');
  }

  /* ---------- actions ---------- */
  const actions = {
    help: openHelp,
    install: async () => {
      const e = state.installEvt;
      if (!e) return;
      state.installEvt = null;
      $('installBtn').hidden = true;
      try { e.prompt(); await e.userChoice; } catch (err) { /* ignore */ }
    },
    addCompany: () => openCompanyModal(null),
    renameCompany: (el) => openCompanyModal(el.dataset.id),
    saveCompany: () => {
      const name = $('companyNameInput').value.trim();
      if (!name) { toast('Enter a company name'); return; }
      const id = modalCtx && modalCtx.id;
      if (id && state.companies[id]) {
        state.companies[id].name = name;
        touch(id);
        closeModal();
        render();
        toast('Name updated ✓');
      } else {
        const c = normalize({ name: name, createdAt: Date.now() }, newId());
        state.companies[c.id] = c;
        state.fresh = c.id;
        touch(c.id);
        closeModal();
        render();
        toast('Company added ✓');
      }
    },
    deleteCompany: (el) => {
      const c = state.companies[el.dataset.id];
      if (!c) return;
      modalCtx = { id: c.id };
      openConfirm('Delete company', c.name,
        'All attendance and salary data for this company will be deleted permanently. Remember to use <b>Download Backup</b> first.',
        'Yes, delete', 'confirmDelete', B_DANGER);
    },
    confirmDelete: () => {
      const id = modalCtx && modalCtx.id;
      if (!id) return;
      delete state.companies[id];
      touch(id);
      closeModal();
      render();
      toast('Company deleted');
    },
    openCompany: (el) => {
      if (!state.companies[el.dataset.id]) return;
      const t = new Date();
      state.cid = el.dataset.id;
      state.view = 'detail';
      state.y = t.getFullYear();
      state.m = t.getMonth();
      render();
      loadPayrollInputs();
      window.scrollTo(0, 0);
    },
    goHome: () => { state.view = 'home'; state.cid = null; render(); window.scrollTo(0, 0); },
    prevMonth: () => { state.m--; if (state.m < 0) { state.m = 11; state.y--; } renderDetail({ reloadInputs: true, slide: 'slide-prev' }); },
    nextMonth: () => { state.m++; if (state.m > 11) { state.m = 0; state.y++; } renderDetail({ reloadInputs: true, slide: 'slide-next' }); },
    monthPicker: () => { modalCtx = { y: state.y }; openModal(''); renderMonthPicker(); },
    mpYear: (el) => { modalCtx.y = Math.max(2000, Math.min(2100, modalCtx.y + (+el.dataset.d))); renderMonthPicker(); },
    mpPick: (el) => {
      const old = state.y * 12 + state.m;
      state.y = modalCtx.y;
      state.m = +el.dataset.m;
      closeModal();
      renderDetail({ reloadInputs: true, slide: state.y * 12 + state.m >= old ? 'slide-next' : 'slide-prev' });
    },
    mpToday: () => {
      const old = state.y * 12 + state.m;
      const t = new Date();
      state.y = t.getFullYear();
      state.m = t.getMonth();
      closeModal();
      renderDetail({ reloadInputs: true, slide: state.y * 12 + state.m >= old ? 'slide-next' : 'slide-prev' });
    },
    brush: (el) => { state.brush = el.dataset.mode; renderBrush(); },
    cell: (el) => {
      if (cellState.fired) { cellState.fired = false; return; }
      onCell(+el.dataset.day);
    },
    pickShift: (el) => {
      const day = modalCtx.day;
      const note = $('dayNote').value;
      setShift(day, el.dataset.shift);
      setNote(day, note);
      closeModal();
      afterCellChange(day);
    },
    clearShift: () => {
      const day = modalCtx.day;
      const note = $('dayNote').value;
      setShift(day, null);
      setNote(day, note);
      closeModal();
      afterCellChange(day);
    },
    saveNote: () => {
      const day = modalCtx.day;
      setNote(day, $('dayNote').value);
      closeModal();
      afterCellChange(day);
      toast('Note saved ✓');
    },
    clearMonth: () => {
      const c = curCompany();
      if (!c) return;
      openConfirm('Clear month', MON_FULL[state.m] + ' ' + state.y,
        'All shifts, notes and salary entries for this month will be removed. Other months are not affected.',
        'Yes, clear', 'confirmClearMonth', B_DANGER);
    },
    confirmClearMonth: () => {
      const c = curCompany();
      if (!c) return;
      delete c.months[ymKey(state.y, state.m)];
      touch(c.id);
      closeModal();
      renderDetail({ reloadInputs: true });
      toast('Month cleared');
    },
    openSlip: openSlip,
    slipSave: async () => {
      const s = slipData();
      const ok = await saveFile('salary-slip-' + slug(s.c.name) + '-' + ymKey(state.y, state.m) + '.html', slipHtml(), 'text/html', 'Slip downloaded ✓');
      if (!ok) toast('Could not create the slip file. Try "Copy text" instead.');
    },
    slipCopy: () => {
      const ta = document.createElement('textarea');
      ta.id = 'slipTmp';
      ta.value = slipText();
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      const done = () => { toast('Slip text copied ✓'); ta.remove(); };
      const fail = () => { try { ta.select(); } catch (e) { /* ignore */ } toast('Copy failed. Please note the slip down manually.'); ta.remove(); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, fail);
        else fail();
      } catch (e) { fail(); }
    },
    downloadBackup: downloadBackup,
    restoreBackup: () => $('restoreFileInput').click(),
    backupText: openBackupText,
    copyBackup: () => copyFrom('backupOut'),
    restoreFromText: () => {
      const v = $('backupIn').value.trim();
      if (!v) { toast('Paste your backup text first'); return; }
      parseRestore(v);
    },
    confirmRestore: () => {
      const items = modalCtx && modalCtx.restore;
      if (!items) return;
      items.forEach((c) => { state.companies[c.id] = c; touch(c.id); });
      closeModal();
      render();
      toast(items.length + (items.length === 1 ? ' company restored ✓' : ' companies restored ✓'));
    },
    loadDemo: loadDemo,
    closeModal: closeModal,
    backdrop: (el, e) => {
      if (e.target !== el) return;
      if (Date.now() - modalAt < 450) return;
      closeModal();
    }
  };

  /* ---------- events ---------- */
  const cellState = { t: null, fired: false, x: 0, y: 0 };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el, e);
  });

  document.addEventListener('input', (e) => {
    const id = e.target && e.target.id;
    if (id === 'inputInHand' || id === 'inputPF' || id === 'inputESIC' || id === 'inputFood') handlePayrollInput();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('modalRoot').firstChild) { closeModal(); return; }
    if (e.key === 'Enter' && e.target && e.target.id === 'companyNameInput') { e.preventDefault(); actions.saveCompany(); }
  });

  $('restoreFileInput').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => parseRestore(String(r.result));
    r.onerror = () => toast('Could not read the file');
    r.readAsText(f);
  });

  (function bindLongPress() {
    const grid = $('calendarGrid');
    grid.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-day]');
      if (!el) return;
      cellState.fired = false;
      cellState.x = e.clientX;
      cellState.y = e.clientY;
      clearTimeout(cellState.t);
      cellState.t = setTimeout(() => {
        cellState.fired = true;
        try { if (navigator.vibrate) navigator.vibrate(15); } catch (err) { /* ignore */ }
        openDayModal(+el.dataset.day);
      }, 480);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => grid.addEventListener(ev, () => clearTimeout(cellState.t)));
    grid.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - cellState.x) > 10 || Math.abs(e.clientY - cellState.y) > 10) clearTimeout(cellState.t);
    });
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
  })();

  /* ---------- boot ---------- */
  state.companies = readLocal();
  setSync('ready', 'Saved on this device');
  render();

  // Ask the browser to keep our data even when the phone is low on space.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }

  // Keep a second open window in step with changes made in the first.
  window.addEventListener('storage', (e) => {
    if (e.key !== LS_KEY || $('modalRoot').firstChild) return;
    state.companies = readLocal();
    render();
  });

  // "Install app" button, shown only while the browser says the app can be installed.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installEvt = e;
    $('installBtn').hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    state.installEvt = null;
    $('installBtn').hidden = true;
    toast('App installed ✓');
  });

  // Phone's back button inside the Android app: close a popup first, then go back to the
  // company list, and only then leave the app.
  if (IS_NATIVE && CAP.Plugins && CAP.Plugins.App && typeof CAP.Plugins.App.addListener === 'function') {
    CAP.Plugins.App.addListener('backButton', () => {
      if ($('modalRoot').firstChild) { closeModal(); return; }
      if (state.view === 'detail') { actions.goHome(); return; }
      if (typeof CAP.Plugins.App.exitApp === 'function') CAP.Plugins.App.exitApp();
    });
  }

  // Offline support for the browser version. Needs https (or localhost), so it is skipped
  // when opened as a plain file. The Android app already contains all its files, so it
  // never registers one (a cached copy could hide an app update).
  if (!IS_NATIVE && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* ignore */ }); });
  }
})();
