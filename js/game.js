// ==================== حارس تحميل الأسئلة (سيناريو عطل: ملف الأسئلة ما حملش) ====================
// لو data/questions.js فشل (نسبة ضعيفة على GitHub Pages: كاش قديم/نسبة شبكة)
// اللعبة كانت هتقف بصمت في نص الكود — دلوقتي بنورّي رسالة واضحة ونوقف الآمن.
if (typeof MAIN_QUESTIONS === 'undefined' || typeof GENIUS_QUESTIONS === 'undefined') {
  (function questionsLoadFail() {
    try {
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;inset:auto 12px 12px 12px;z-index:99999;'
        + 'background:#1a0b0b;color:#ffd7d7;border:3px solid #ff2e88;'
        + 'font-family:Cairo,Tahoma,sans-serif;font-size:15px;font-weight:700;'
        + 'padding:14px;border-radius:4px;text-align:center;line-height:1.8;';
      banner.textContent = '⚠️ حصل عطل في تحميل ملف الأسئلة — حدّث الصفحة (اسحب لتحديث أو دوس F5) ولو تكررت استنى دقيقة وجرّب تاني.';
      (document.body || document.documentElement).appendChild(banner);
    } catch (e) {}
  })();
  throw new Error('questions.js did not load — game halted safely');
}

// ==================== INK SETTLE ====================
function inkSettle(el) {
  if (!el) return;
  el.classList.remove('ink-settle', 'ink-settled');
  void el.offsetHeight;
  el.classList.add('ink-settle');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add('ink-settled');
    });
  });
}

// ==================== TIME OF DAY ====================
(function applyTimeOfDay() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 11) return;           // صباح — default
  if (hour >= 11 && hour < 17) document.body.classList.add('time-afternoon');
  else if (hour >= 17 && hour < 20) document.body.classList.add('time-evening');
  else document.body.classList.add('time-night'); // 20-6
})();

// ==================== POINTS CONFIG ====================
// ⚡ نظام النقاط الجديد:
// الأسئلة العادية: صح في التلت الأول من الوقت = 15 · التاني = 10 · التالت = 5 · غلط = 0
// جولة المخاطرة: صح = 20 · غلط = -12 (التخمين العشوائي متوسطه سالب — اللي ياخد المخاطرة وهو واثق يكسب)
const GAME_POINTS = {
  mainFast: 15,      // صح في التلت الأول من الوقت
  mainMid: 10,       // صح في التلت الثاني
  mainSlow: 5,       // صح في التلت الأخير
  bonusCorrect: 20,  // جولة المخاطرة — إجابة صح
  bonusPenalty: 12,  // جولة المخاطرة — إجابة غلط
  appealPenalty: 10  // عقوبة الغلط/الوقت خلص بعد الوقت الزايد
};

// ثوابت الخصائص: ثمن لمبة صاحب الصالة + الثواني اللي بيضيفها الوقت الزايد
const LAMP_COST = 15;
const APPEAL_BONUS_TIME = 10;

// لحظة أول اختيار للاعب — بتتثبت قبل كارت التثبيت عشان وقت التثبيت ما يحاسبش على اللاعب
let answerPickedAt = 0;

// ⚡ نقاط السرعة: التلت بيتحسب على وقت السؤال نفسه
// (لو اللاعب خد وقت زايد +10 ثواني — التلت بيتحسب على الوقت الممتد عشان ما يعاقبش مرتين)
function speedTierPoints() {
  const q = getCurrentQuestion();
  const limit = (q && q.time) ? q.time : QUESTION_TIME;
  const total = state.appealUsed ? limit + APPEAL_BONUS_TIME : limit;
  const pickMs = answerPickedAt || Date.now();
  const used = Math.max(0, (pickMs - questionStartTime) / 1000);
  if (used <= total / 3) return GAME_POINTS.mainFast;
  if (used <= (2 * total) / 3) return GAME_POINTS.mainMid;
  return GAME_POINTS.mainSlow;
}

// وسم النقاط الطاير حسب التلت — بيخلي اللاعب شايف سرعته أحسبها إزاي
function speedTierTag(points) {
  if (points >= GAME_POINTS.mainFast) return '⚡ إجابة برق';
  if (points >= GAME_POINTS.mainMid) return '⏱️ في الموعد';
  return '🕯️ آخر التلت';
}

// ==================== SAFE STORAGE ====================
// كل وصول للتخزين المحلي بيمر من الـ helpers دي — المتصفحات اللي بتقفل
// localStorage (الوضع الخاص/حجب الكوكيز) ما بتبوظش اللعبة كلها (Task 31)
function storeGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storeSet(key, val) {
  try { localStorage.setItem(key, val); } catch (e) {}
}
function storeDel(key) {
  try { localStorage.removeItem(key); } catch (e) {}
}

// ==================== الذاكرة الاحتياطية — قفل الدخلة (Task 34 · المستوى 1) ====================
// الدخلة الواحدة في الجولة محفوظة في localStorage بس — اللي بيمسح بيانات الموقع
// بيرجع يلعب من الأول كأنه جديد. الحل من غير سيرفر: تسجيل الجولة بيتكتب كمان في
// 3 مخازن احتياطية (كوكيز + IndexedDB + Cache API) وكل نسخة فيها بصمة الموسم.
// لو localStorage اتفضى والنسخ لسه فاكرة نفس الموسم — القفل بيرجع يتركب لوحده.
// بصراحة كاملة: «Clear site data» الكامل بيمسح كل المخازن مرة واحدة — ده قفل ضد
// العبث مش ضد القرصنة، ودي أقصى حاجة ينفعها موقع ثابت من غير backend.

const MEM_COOKIE = 'atariMem';
const MEM_IDB_NAME = 'atariGuardDB';
const MEM_IDB_STORE = 'mem';
const MEM_IDB_KEY = 'seasonReg';
const MEM_CACHE_NAME = 'atari-guard-v1';
const MEM_CACHE_URL = '/__atari_mem__';

// نقية للاختبارات: حمولة المارايا = بصمة الموسم | اسم اللاعب (مشفر عشان | جوه الاسم ما تكسرش)
function buildMemPayload(seasonHash, name) {
  const h = String(seasonHash || '');
  if (!/^\d{1,15}$/.test(h)) return '';
  const n = normalizeNamePure(name || '');
  if (!n) return '';
  return h + '|' + encodeURIComponent(n);
}

// نقية للاختبارات: قراءة بحرص — أي حمولة مش مفهومة = مفيش ذاكرة
function parseMemPayload(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const parts = raw.split('|');
  if (parts.length !== 2) return null;
  if (!/^\d{1,15}$/.test(parts[0])) return null;
  let n = '';
  try { n = decodeURIComponent(parts[1]); } catch (e) { return null; }
  n = normalizeNamePure(n);
  if (!n) return null;
  return { hash: parts[0], name: n };
}

// نقية للاختبارات: قرار الاسترجاع — القفل بيرجع بس لو المارايا فاكرة نفس الموسم الحالي
function backupLockDecision(mem, curHash) {
  if (!mem || !mem.hash || !mem.name) return null;
  if (String(mem.hash) !== String(curHash)) return null;
  return mem.name;
}

// نقية للاختبارات: مساحة تخزين صغيرة جداً = أغلب الظن وضع مؤقت (تخفي كروم)
function quotaLooksEphemeral(quota) {
  if (typeof quota !== 'number' || !isFinite(quota) || quota <= 0) return false;
  return quota < 300 * 1024 * 1024;
}

// نقية للاختبارات: سباق مع الوقت — مخزن عاير ما يعلّقش الإقلاع للأبد
function promiseTimeout(p, ms, fallback) {
  return new Promise(function (resolve) {
    let done = false;
    const t = setTimeout(function () { if (!done) { done = true; resolve(fallback); } }, ms);
    Promise.resolve(p).then(function (v) {
      if (!done) { done = true; clearTimeout(t); resolve(v); }
    }).catch(function () {
      if (!done) { done = true; clearTimeout(t); resolve(fallback); }
    });
  });
}

// فتح قاعدة المارايا — مفيش indexedDB = null والنداء بيتعامل معاه كفشل عادي
function idbOpenSafe() {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const req = indexedDB.open(MEM_IDB_NAME, 1);
    req.onupgradeneeded = function () {
      try { req.result.createObjectStore(MEM_IDB_STORE); } catch (e) {}
    };
    return req;
  } catch (e) { return null; }
}

// مارايا التخزين — كل واحدة معزولة، وفشلها المتوقع جزء من التصميم
const MEM_MIRRORS = [
  {
    id: 'cookie',
    get: function () {
      if (typeof document === 'undefined') return Promise.resolve(null);
      try {
        const m = document.cookie.match(new RegExp('(?:^|; )' + MEM_COOKIE + '=([^;]*)'));
        return Promise.resolve(m ? decodeURIComponent(m[1]) : null);
      } catch (e) { return Promise.resolve(null); }
    },
    set: function (payload) {
      try {
        document.cookie = MEM_COOKIE + '=' + encodeURIComponent(payload) + '; Path=/; Max-Age=31536000; SameSite=Lax';
        return Promise.resolve(true);
      } catch (e) { return Promise.resolve(false); }
    },
    del: function () {
      try {
        document.cookie = MEM_COOKIE + '=; Path=/; Max-Age=0; SameSite=Lax';
        return Promise.resolve(true);
      } catch (e) { return Promise.resolve(false); }
    }
  },
  {
    id: 'idb',
    get: function () {
      return new Promise(function (resolve) {
        const req = idbOpenSafe();
        if (!req) return resolve(null);
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
        req.onsuccess = function () {
          const db = req.result;
          try {
            const tx = db.transaction(MEM_IDB_STORE, 'readonly');
            const r = tx.objectStore(MEM_IDB_STORE).get(MEM_IDB_KEY);
            r.onsuccess = function () { resolve(r.result == null ? null : String(r.result)); };
            r.onerror = function () { resolve(null); };
            tx.oncomplete = function () { try { db.close(); } catch (e) {} };
          } catch (e) { resolve(null); try { db.close(); } catch (e2) {} }
        };
      });
    },
    set: function (payload) {
      return new Promise(function (resolve) {
        const req = idbOpenSafe();
        if (!req) return resolve(false);
        req.onerror = function () { resolve(false); };
        req.onblocked = function () { resolve(false); };
        req.onsuccess = function () {
          const db = req.result;
          try {
            const tx = db.transaction(MEM_IDB_STORE, 'readwrite');
            tx.objectStore(MEM_IDB_STORE).put(payload, MEM_IDB_KEY);
            tx.oncomplete = function () { try { db.close(); } catch (e) {} resolve(true); };
            tx.onerror = function () { try { db.close(); } catch (e2) {} resolve(false); };
          } catch (e) { resolve(false); try { db.close(); } catch (e2) {} }
        };
      });
    },
    del: function () {
      return new Promise(function (resolve) {
        const req = idbOpenSafe();
        if (!req) return resolve(false);
        req.onerror = function () { resolve(false); };
        req.onblocked = function () { resolve(false); };
        req.onsuccess = function () {
          const db = req.result;
          try {
            const tx = db.transaction(MEM_IDB_STORE, 'readwrite');
            tx.objectStore(MEM_IDB_STORE).delete(MEM_IDB_KEY);
            tx.oncomplete = function () { try { db.close(); } catch (e) {} resolve(true); };
            tx.onerror = function () { try { db.close(); } catch (e2) {} resolve(false); };
          } catch (e) { resolve(false); try { db.close(); } catch (e2) {} }
        };
      });
    }
  },
  {
    id: 'cache',
    get: function () {
      if (typeof caches === 'undefined') return Promise.resolve(null);
      try {
        return caches.open(MEM_CACHE_NAME)
          .then(function (c) { return c.match(MEM_CACHE_URL).then(function (r) { return r ? r.text() : null; }); })
          .catch(function () { return null; });
      } catch (e) { return Promise.resolve(null); }
    },
    set: function (payload) {
      if (typeof caches === 'undefined') return Promise.resolve(false);
      try {
        return caches.open(MEM_CACHE_NAME)
          .then(function (c) { return c.put(MEM_CACHE_URL, new Response(payload)); })
          .then(function () { return true; })
          .catch(function () { return false; });
      } catch (e) { return Promise.resolve(false); }
    },
    del: function () {
      if (typeof caches === 'undefined') return Promise.resolve(false);
      try {
        return caches.open(MEM_CACHE_NAME)
          .then(function (c) { return c.delete(MEM_CACHE_URL); })
          .catch(function () { return false; });
      } catch (e) { return Promise.resolve(false); }
    }
  }
];

// الكتابة في كل المارايا — فشل واحدة ما بيقفلش الباقي
function writeMemoryMirror(payload, mirrors) {
  if (!payload) return Promise.resolve(false);
  const list = Array.isArray(mirrors) ? mirrors : MEM_MIRRORS;
  const calls = list.map(function (m) {
    try {
      return Promise.resolve(m.set(payload)).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  });
  return Promise.all(calls).then(function (res) {
    return res.some(function (v) { return v === true; });
  });
}

// القراءة من كل المارايا — أول ذاكرة سليمة بتكسب
function readMemoryBackup(mirrors) {
  const list = Array.isArray(mirrors) ? mirrors : MEM_MIRRORS;
  const calls = list.map(function (m) {
    try {
      return Promise.resolve(m.get()).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  });
  return Promise.all(calls).then(function (raws) {
    for (let i = 0; i < raws.length; i++) {
      const mem = parseMemPayload(raws[i]);
      if (mem) return mem;
    }
    return null;
  });
}

// مسح كل المارايا — بيترنادى من حراسة الموسم وقت جولة جديدة
function wipeMemoryBackups(mirrors) {
  const list = Array.isArray(mirrors) ? mirrors : MEM_MIRRORS;
  const calls = list.map(function (m) {
    try {
      return Promise.resolve(m.del()).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  });
  return Promise.all(calls).then(function () { return true; });
}

// رجوع القفل من المارايا — لو localStorage اتضاف والنسخ لسه فاكرة نفس الموسم
function restoreRegistrationFromBackup() {
  let cur;
  try { cur = computeSeasonHash(); } catch (e) { return Promise.resolve(false); }
  return promiseTimeout(readMemoryBackup(), 1500, null).then(function (mem) {
    const name = backupLockDecision(mem, cur);
    if (!name) return false;
    storeSet(REG_KEY, name);                       // القفل بيرجع لمكانه الأصلي
    writeMemoryMirror(buildMemPayload(cur, name)); // المخازن الناقصة بتتكمل لوحدها
    showEntryLocked();
    return true;
  }).catch(function () { return false; });
}

// كشف الوضع بلا ذاكرة (تخفي/حجب تخزين) — تحذير بس من غير حجب، عشان ما نبوظش
// تجربة لاعب جديد شغال على جهاز مساحته قليلة
function showMemNote() {
  const el = document.createElement('div');
  el.className = 'mem-note';
  el.innerHTML = '<strong>👁️ وضع بلا ذاكرة</strong><span>المتصفح في وضع التخفي أو بيقفل التخزين — اللعبة هتشتغل عادي بس الدخلة مش هتتحفظ والريكورد هيتنسى أول ما تقفل.</span>';
  document.body.appendChild(el);
  setTimeout(function () { el.classList.add('on'); }, 80);
  setTimeout(function () {
    el.classList.remove('on');
    setTimeout(function () { el.remove(); }, 600);
  }, 6400);
}

function memProbe() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) return;
    navigator.storage.estimate().then(function (est) {
      if (est && quotaLooksEphemeral(est.quota)) showMemNote();
    }).catch(function () {});
  } catch (e) {}
}

// ==================== STATE ====================
const state = {
  playerName: '',
  playerAvatar: '',
  playerPhoto: '',
  playerSignature: '',
  mainScore: 0,
  bonusScore: 0,
  totalScore: 0,
  correctCount: 0,
  wrongCount: 0,
  maxStreak: 0,
  currentStreak: 0,
  answerTimes: [],
  hasFifty: true,
  hasBribe: true,
  hasWasta: true,
  isMuted: storeGet('diwanMuted') === 'true',
  bonusCurrentQ: 0,
  bonusCorrect: 0,
  bonusWrong: 0,
  bonusPlayed: false,
  appealUsed: false,
  docsState: {},
  docProgress: {},
  docCorrectCounts: {},
  earnedCards: [],
  activeSetId: null,
};

// ==================== LOCALSTORAGE PERSISTENCE ====================
const STORAGE_KEY = 'diwanGameState';
// مفتاح خفيف منفصل: لحظة المؤقت الحالية (بتتكتب كل ثانية) — عشان تجميد واستكمال الوقت
// لو اللاعب خرج من المرحلة أو عمل ريفريش، بيرجع يلاقي نفس الثواني المتبقية مش وقت كامل من الأول
const DOC_TIME_KEY = 'diwanDocTime';
// سجل اللاعبين: كل لاعب ليه دخلة واحدة في الجولة (بيتسجل أول ما الكأس تتعرض)
// بيتصفّر مع الجولة الجديدة (حراسة الموسم) — يعني كل جولة أسئلة جديدة = فرصة جديدة
const REG_KEY = 'diwanRegisteredName';

const SAVEABLE_KEYS = [
  'playerName','playerAvatar','playerPhoto','playerSignature',
  'mainScore','bonusScore','totalScore','correctCount','wrongCount',
  'maxStreak','currentStreak','answerTimes',
  'hasFifty','hasBribe','hasWasta',
  'bonusPlayed','bonusCorrect','bonusWrong',
  'docsState','docProgress','docCorrectCounts',
  'earnedCards','activeSetId','certRefId'
];

function saveState() {
  const data = {};
  for (const k of SAVEABLE_KEYS) {
    data[k] = state[k];
  }
  storeSet(STORAGE_KEY, JSON.stringify(data));
}

// نقية للاختبارات: تعقيم بيانات الحفظ الراجعة من التخزين — التخزين مصدر غير موثوق
// (JSON سليم بس حقول فاسدة: أرقام نصية، كائنات بقت strings، مصفوفات بقت كائنات…)
// أي حقل مش بشكله بيرجع للقيمة الافتراضية الآمنة بدل ما يبوظ اللعبة بعدين.
function sanitizeStatePure(data) {
  const d = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
  const num = (v, fb) => { const n = Number(v); return (isFinite(n) ? n : fb); };
  const str = (v, fb) => (typeof v === 'string' ? v : fb);
  const bool = (v) => !!v;
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  const out = {};
  out.playerName = str(d.playerName, '');
  out.playerAvatar = str(d.playerAvatar, '');
  out.playerPhoto = str(d.playerPhoto, '');
  out.playerSignature = str(d.playerSignature, '');
  out.mainScore = num(d.mainScore, 0);
  out.bonusScore = num(d.bonusScore, 0);
  out.totalScore = num(d.totalScore, 0);
  out.correctCount = num(d.correctCount, 0);
  out.wrongCount = num(d.wrongCount, 0);
  out.maxStreak = num(d.maxStreak, 0);
  out.currentStreak = num(d.currentStreak, 0);
  out.answerTimes = arr(d.answerTimes).map(v => num(v, 0));
  out.hasFifty = bool(d.hasFifty);
  out.hasBribe = bool(d.hasBribe);
  out.hasWasta = bool(d.hasWasta);
  out.bonusPlayed = bool(d.bonusPlayed);
  out.bonusCorrect = num(d.bonusCorrect, 0);
  out.bonusWrong = num(d.bonusWrong, 0);
  out.docsState = obj(d.docsState);
  out.docProgress = obj(d.docProgress);
  out.docCorrectCounts = obj(d.docCorrectCounts);
  out.earnedCards = arr(d.earnedCards).filter(c => c && typeof c === 'object');
  out.activeSetId = str(d.activeSetId, null);
  out.certRefId = str(d.certRefId, null);
  return out;
}

function loadState() {
  const raw = storeGet(STORAGE_KEY);
  if (!raw) return false;
  let data = null;
  try { data = JSON.parse(raw); } catch (e) { return false; }
  if (!data || typeof data !== 'object') return false;
  const safe = sanitizeStatePure(data);
  for (const k of SAVEABLE_KEYS) {
    if (safe[k] !== undefined) state[k] = safe[k];
  }
  return true;
}

function clearSavedState() {
  storeDel(STORAGE_KEY);
  storeDel(DOC_TIME_KEY);
}

// نقية للاختبارات: توحيد الاسم — مسافات زايدة ومسافات مكررة بتتشال عشان "أحمد " = "أحمد"
function normalizeNamePure(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

// نقية للاختبارات: ثواني الاستكمال — المتبقي المحفوظ مش بيتعدّى وقت السؤال الأصلي
// (لو اتسجل وقت بعد وقت زايد والوقت الزايد اتلغى، القفعة بتحمي من وقت زيادة)
function resumeSecondsPure(savedT, questionTime, appealBonus) {
  const s = Number(savedT);
  if (!isFinite(s) || s <= 0) return questionTime;
  return Math.min(s, questionTime + (appealBonus || 0));
}

// كتابة/مسح لحظة المؤقت — بيتكتب كل ثانية والمؤقت شغال، وبيمسح أول ما السؤال يخلص
function saveDocTimeSnapshot() {
  if (!currentDocSetId || !currentDocQuestions.length) return;
  storeSet(DOC_TIME_KEY, JSON.stringify({
    setId: currentDocSetId,
    idx: currentDocQuestionIdx,
    t: timeLeft,
    appeal: !!state.appealUsed
  }));
}

function clearDocTimeSnapshot() {
  storeDel(DOC_TIME_KEY);
}

// استرجاع لحظة المؤقت لو المرحلة اتفتح تاني على نفس السؤال — جوهر قاعدة تجميد واستكمال
function applyDocTimeSnapshot() {
  const raw = storeGet(DOC_TIME_KEY);
  if (!raw) return false;
  const snap = parseDocSnapshotPure(raw);
  if (!snap || snap.setId !== currentDocSetId || snap.idx !== currentDocQuestionIdx) return false;
  const cap = resumeSecondsPure(snap.t, questionTimeLimit(), snap.appeal ? APPEAL_BONUS_TIME : 0);
  timeLeft = cap;
  state.appealUsed = !!snap.appeal;
  clearDocTimeSnapshot();
  return true;
}

// نقية للاختبارات: قراءة لحظة المؤقت المخزنة — بترجع لقطة سليمة بس أو null
// (JSON بايظ / حقول ناقصة / ثواني فاسدة = مفيش استكمال — ده بيحمي من أي تلاعب بالتخزين)
function parseDocSnapshotPure(raw) {
  try {
    const snap = JSON.parse(raw);
    if (!snap || typeof snap !== 'object') return null;
    if (typeof snap.setId !== 'string' || !snap.setId) return null;
    const idx = Number(snap.idx);
    if (!isFinite(idx) || idx < 0) return null;
    const t = Number(snap.t);
    if (!isFinite(t) || t <= 0) return null;
    return { setId: snap.setId, idx: Math.floor(idx), t: t, appeal: !!snap.appeal };
  } catch (e) { return null; }
}

// نقية للاختبارات: فهرس استكمال آمن داخل المرحلة — بره الحدود = مفيش استكمال (-1)
function resumeIdxPure(idx, len) {
  const i = Math.floor(Number(idx));
  if (!isFinite(i) || i < 0) return -1;
  if (!isFinite(len) || len <= 0) return -1;
  if (i >= len) return -1; // اللقطة بتصفّر أول ما المرحلة يخلص — فهرس بره الحدود = لقطة قديمة فاسدة
  return i;
}

function getDocTimeSnapshot() {
  return parseDocSnapshotPure(storeGet(DOC_TIME_KEY));
}

// قاعدة الدخلة الواحدة (Task 24): لو التاب اتقفل وسط سؤال — الرجوع بيفتح نفس السؤال
// لوحده من غير لمسة، والمؤقت بيكمل من نفس الثانية (اتجمّد وهو غايب). يعني مفيش
// أي طريق ترجع بيها للصالة من جوه المرحلة قبل ما تجاوب.
function resumeDocFromSnapshot() {
  const snap = getDocTimeSnapshot();
  if (!snap) return false;
  const set = allQuestionSets.find(s => s.setId === snap.setId);
  if (!set || !set.questions.length) return false;
  const idx = resumeIdxPure(snap.idx, set.questions.length);
  if (idx < 0) { clearDocTimeSnapshot(); return false; }
  state.activeSetId = snap.setId;
  state.docsState[snap.setId] = 'inProgress';
  switchScreen('screenEntry', 'screenGame');
  loadDocQuestion(snap.setId, idx);
  return true;
}

// ==================== QUESTIONS (مستخرجة من data/questions.js) ====================
const mainQuestions = MAIN_QUESTIONS;

// جولة المخاطرة = 🎯 تحدي العباقرة — 7 أسئلة مركبة ثابتة من ملف البيانات
// كل سؤال ليه دقيقة ونصف (حقل time: 90) واجابة تفصيلية بتظهر آخر الجولة
const bonusQuestions = GENIUS_QUESTIONS;

// ==================== SOUND SYSTEM ====================
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(fn) {
  if (state.isMuted) return;
  try {
    const ctx = getAudioCtx();
    // الموبايل: القفل/الخروج من التطبيق بيوقّف الـ AudioContext — من غير resume الصوت بيموت لحد ريفريش (Task 36)
    if (ctx.state === 'suspended') ctx.resume();
    fn(ctx);
  } catch(e) {}
}

// رجعة اللعبة من الخلفية: بنصحّي السياق فورًا (لو المتصفح اسمح — غير كده أول دوسة هتصحّيه) (Task 36)
document.addEventListener('visibilitychange', () => {
  try {
    if (!document.hidden && audioCtx && audioCtx.state === 'suspended' && !state.isMuted) {
      audioCtx.resume().catch(() => {});
    }
  } catch (e) {}
});

const Sound = {
  // نقرة أركيد 8-bit — كل زرار في اللعبة بيتنادى بيها (Task 28)
  penTap() {
    playSound(ctx => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(990, ctx.currentTime + 0.045);
      gain.gain.value = 0.12;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.08);
    });
  },

  // ضربة القناص — لفحة نويز بتمنسح الإجابات الغلط
  sniperSwoosh() {
    playSound(ctx => {
      const dur = 0.3;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(800, ctx.currentTime);
      bp.frequency.exponentialRampToValueAtTime(2800, ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.value = 0.1;
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.connect(bp).connect(g).connect(ctx.destination);
      src.start(); src.stop(ctx.currentTime + dur);
    });
  },

  // لمبة صاحب الصالة — نغمتين نيون صافيتين (دقة تشغيل اللمبة)
  lampDing() {
    playSound(ctx => {
      const t = ctx.currentTime;
      [2150, 2650].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + i * 0.11);
        g.gain.exponentialRampToValueAtTime(0.045, t + i * 0.11 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.11 + 0.22);
        o.connect(g).connect(ctx.destination);
        o.start(t + i * 0.11); o.stop(t + i * 0.11 + 0.25);
      });
    });
  },

  stamp(type) {
    playSound(ctx => {
      const bufSize = ctx.sampleRate * 0.15;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.2;
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      noise.connect(noiseGain).connect(ctx.destination);
      noise.start(); noise.stop(ctx.currentTime + 0.15);

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = type === 'success' ? 120 : 90;
      oscGain.gain.value = 0.4;
      oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(oscGain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    });
  },

  paperRustle() {
    playSound(ctx => {
      const bufSize = ctx.sampleRate * 0.3;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3000;
      const gain = ctx.createGain();
      gain.gain.value = 0.08;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      noise.connect(hp).connect(gain).connect(ctx.destination);
      noise.start(); noise.stop(ctx.currentTime + 0.3);
    });
  },

  tick() {
    playSound(ctx => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 1200;
      gain.gain.value = 0.1;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.04);
    });
  },

  unroll() {
    playSound(ctx => {
      const bufSize = ctx.sampleRate * 0.6;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1000;
      bp.Q.value = 0.5;
      bp.frequency.linearRampToValueAtTime(4000, ctx.currentTime + 0.6);
      const gain = ctx.createGain();
      gain.gain.value = 0.12;
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      noise.connect(bp).connect(gain).connect(ctx.destination);
      noise.start(); noise.stop(ctx.currentTime + 0.6);
    });
  },

  // إجابة صح — أربيجيو صاعد كلاسيكي (Task 28 أركيد)
  correct() {
    playSound(ctx => {
      const t = ctx.currentTime;
      [[659, 0], [784, 0.08], [1047, 0.16]].forEach(n => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t + n[1]);
        g.gain.exponentialRampToValueAtTime(0.11, t + n[1] + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, t + n[1] + 0.16);
        o.connect(g).connect(ctx.destination);
        o.start(t + n[1]); o.stop(t + n[1] + 0.18);
      });
    });
  },

  // إجابة غلط — هبوط ثقيل محبط (بالعافية)
  wrong() {
    playSound(ctx => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(220, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(82, ctx.currentTime + 0.32);
      g.gain.value = 0.16;
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.34);
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.36);
    });
  },

  // عملة الأتاري — نغمة العملة الشهيرة عند البداية
  coin() {
    playSound(ctx => {
      const t = ctx.currentTime;
      [[988, 0, 0.08], [1319, 0.09, 0.38]].forEach(n => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t + n[1]);
        g.gain.exponentialRampToValueAtTime(0.12, t + n[1] + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, t + n[1] + n[2]);
        o.connect(g).connect(ctx.destination);
        o.start(t + n[1]); o.stop(t + n[1] + n[2] + 0.04);
      });
    });
  },

  // فانفار الكأس — لحظة الفوز الكاملة
  fanfare() {
    playSound(ctx => {
      const t = ctx.currentTime;
      [[523, 0, 0.14], [659, 0.14, 0.14], [784, 0.28, 0.14], [1047, 0.42, 0.5]].forEach(n => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t + n[1]);
        g.gain.exponentialRampToValueAtTime(0.12, t + n[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + n[1] + n[2]);
        o.connect(g).connect(ctx.destination);
        o.start(t + n[1]); o.stop(t + n[1] + n[2] + 0.05);
      });
    });
  },

  // باور أب — سويب صاعد سريع (واسطة/قناص/لمبة)
  powerup() {
    playSound(ctx => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(330, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.22);
      g.gain.value = 0.1;
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.26);
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.28);
    });
  },

  // لفحة البوم — ضربة قصيرة قوية لما الستريك يوصل مرحلة (Task 29)
  // طبقتين: همهمة منخفضة بتنزل بسرعة + نفخة نويز قصيرة (إحساس اللفحة)
  boom() {
    playSound(ctx => {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.28);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.32);
      const len = Math.floor(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const ng = ctx.createGain();
      ng.gain.value = 0.1;
      noise.connect(ng).connect(ctx.destination);
      noise.start(t); noise.stop(t + 0.12);
    });
  }
};

// ==================== MUTE ====================
// الكتم بقى على مستوى الـ AudioContext نفسه (suspend) — بيقطع أي صوت فورًا:
// المؤثرات + أصوات الخصائص، ومش بيسيب حاجة تكمّل في الخلفية أبدًا
function applyMuteIcon() {
  const btn = document.getElementById('muteBtn');
  if (btn) btn.textContent = state.isMuted ? '🔇' : '🔊';
}

function showAudioNote(msg) {
  const el = document.createElement('div');
  el.className = 'season-note audio-note';
  el.innerHTML = '<span>' + msg + '</span>';
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 60);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 600);
  }, 1900);
}

function toggleMute() {
  state.isMuted = !state.isMuted;
  storeSet('diwanMuted', state.isMuted);
  applyMuteIcon();
  try {
    if (state.isMuted) {
      if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
    } else {
      // الوقت الزايد جوه الكليك نفسه — ده اللي بيفتح الصوت على iOS
      getAudioCtx().resume();
    }
  } catch (e) {}
  showAudioNote(state.isMuted ? '🔇 اتكتم الصوت' : '🔊 الصوت اشتغل');
}
applyMuteIcon();

// ==================== SCREEN TRANSITIONS ====================
function switchScreen(from, to) {
  const fromEl = document.getElementById(from);
  const toEl = document.getElementById(to);
  fromEl.classList.add('fade-out');
  setTimeout(() => {
    // قاعدة أمان: شاشة واحدة فعالة في نفس اللحظة — أي شاشة تانية لسه فعالة
    // بتتقفل كمان (كان بيحصل تعارض لما from مش هي فعلاً الشاشة المفتوحة،
    // زي "شوف كأسك" بعد الاستعادة: الصالة فضل فعال جنب الكأس)
    document.querySelectorAll('.screen.active').forEach(el => {
      el.classList.remove('active', 'fade-out');
      el.style.display = 'none';
    });
    fromEl.classList.remove('active', 'fade-out');
    fromEl.style.display = 'none';
    toEl.style.display = '';
    toEl.classList.remove('fade-out');
    toEl.classList.add('active');
  }, 350);
}


// ==================== DESK HUB (Prompts 1 & 2) ====================

// ==================== EXPANDABLE NAMING (Prompt 3) ====================
// CATEGORY_META و DESK_CATEGORIES مستخرجة إلى data/questions.js

// All question sets — array of set objects (Prompt 3)
// Each set has: category, setNumber, displayName (auto-built), questions
const allQuestionSets = [];

function buildDisplayName(category, setNumber) {
  return CATEGORY_META[category].displayName + ' ' + setNumber;
}

function getNextSetNumber(category) {
  const existing = allQuestionSets.filter(s => s.category === category);
  if (existing.length === 0) return 1;
  return Math.max(...existing.map(s => s.setNumber)) + 1;
}

function addQuestionSet(category, questions) {
  const num = getNextSetNumber(category);
  const set = {
    category: category,
    setNumber: num,
    displayName: buildDisplayName(category, num),
    questions: questions,
    colorClass: CATEGORY_META[category].colorClass,
    setId: category + '-' + num
  };
  allQuestionSets.push(set);
  // Initialize state for the new set
  state.docsState[set.setId] = 'empty';
  state.docProgress[set.setId] = 0;
  return set;
}

// Initialize with current questions split by category
addQuestionSet('culture', mainQuestions.filter(q => q.cat === 'culture'));
addQuestionSet('sport', mainQuestions.filter(q => q.cat === 'sport'));
addQuestionSet('logic', mainQuestions.filter(q => q.cat === 'logic'));

// Get the active (oldest non-done) set for a category
function getActiveSetForCategory(category) {
  // Find oldest non-done set
  const sets = allQuestionSets.filter(s => s.category === category);
  for (const set of sets) {
    const sKey = set.setId;
    if (!state.docsState[sKey] || state.docsState[sKey] !== 'done') {
      return set;
    }
  }
  // All done — return the latest set (for "done" display)
  return sets[sets.length - 1];
}

// ===== منطق الإنجاز: المراحل الفاضية (اللي مستنية أسئلتها من المراحل الجاية) متتحسبش =====
function categoryDone(cat) {
  const active = getActiveSetForCategory(cat);
  if (!active || active.questions.length === 0) return true; // مرحلة مقفولة = مش محلوب عليها
  return state.docsState[active.setId] === 'done';
}

function allDocsDone() {
  return DESK_CATEGORIES.every(categoryDone);
}

// Document states — keyed by setId (e.g. "culture-1")
// state.activeSetId/earnedCards/docCorrectCounts معرّفة في state من الأول

// رقم مرحلة رسمي بأرقام هندية — لمصة أركيد
function fileSerial(i) {
  const ar = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
  return 'مرحلة رقم ' + ar(41 + i * 7) + ' — ' + ar(2026);
}

// ==================== كروت المراحل البكسلية (Task 28) ====================
// وش الكارت بقى رسمة SVG بكسلية بأركان حادة — نفس روح شاشات الأتاري القديمة.
// مفيش فلاتر ولا تدرجات معقدة — مربعات crispEdges بس، سريعة ونضيفة.
const FOLDER_PALETTES = {
  'cat-culture': { base:'#00E5FF', dark:'#00809A', flap:'#33ECFF', edge:'#053B47', hi:'#A5F8FF' },
  'cat-sport':   { base:'#FF2E88', dark:'#A80E56', flap:'#FF5CA3', edge:'#4A0528', hi:'#FFB1D6' },
  'cat-logic':   { base:'#22FF88', dark:'#0E9E52', flap:'#5CFFAC', edge:'#05402A', hi:'#B4FFDA' }
};

function folderArtSVG(cls, i) {
  const P = FOLDER_PALETTES[cls] || FOLDER_PALETTES['cat-culture'];
  const uid = 'f' + i; // معرّفات فريدة لكل كارت — الأنماط مش بتتشارك
  return '<svg class="folder-art" viewBox="0 0 460 300" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" shape-rendering="crispEdges">'
    + '<defs>'
    // شبكة بكسل داكنة فوق الشاشة — إحساس CRT
    + '<pattern id="' + uid + 'g" width="23" height="23" patternUnits="userSpaceOnUse">'
    + '<rect width="23" height="23" fill="rgba(5,5,16,.18)"/>'
    + '</pattern>'
    // نقط بكسل فاتحة متفرقة — لمعة شاشة
    + '<pattern id="' + uid + 'd" width="92" height="92" patternUnits="userSpaceOnUse">'
    + '<rect width="9" height="9" fill="' + P.hi + '" opacity=".20"/>'
    + '</pattern>'
    + '</defs>'
    // جسم الكارت الداكن
    + '<rect x="0" y="0" width="460" height="300" fill="#12122B"/>'
    // صفوف بكسل علوية وسفلية — إطار بلون الفئة
    + '<rect x="0" y="0" width="460" height="16" fill="' + P.dark + '"/>'
    + '<rect x="0" y="284" width="460" height="16" fill="' + P.dark + '"/>'
    + '<rect x="22" y="5" width="30" height="6" fill="' + P.hi + '"/>'
    + '<rect x="60" y="5" width="12" height="6" fill="' + P.hi + '"/>'
    + '<rect x="392" y="289" width="34" height="6" fill="' + P.hi + '"/>'
    + '<rect x="434" y="289" width="10" height="6" fill="' + P.hi + '"/>'
    // شاشة اللعب الملونة بلون الفئة
    + '<rect x="40" y="42" width="380" height="216" fill="' + P.base + '"/>'
    + '<rect x="40" y="42" width="380" height="10" fill="' + P.flap + '"/>'
    + '<rect x="40" y="248" width="380" height="10" fill="' + P.edge + '"/>'
    + '<rect x="40" y="42" width="14" height="216" fill="' + P.flap + '" opacity=".5"/>'
    + '<rect x="406" y="42" width="14" height="216" fill="' + P.edge + '" opacity=".5"/>'
    // سكان-لاينز + لمعة جوه الشاشة
    + '<rect x="40" y="42" width="380" height="216" fill="url(#' + uid + 'g)"/>'
    + '<rect x="40" y="42" width="380" height="216" fill="url(#' + uid + 'd)"/>'
    // مثلث PLAY بكسلي في النص — علامة "اضغط وابدأ"
    + '<g fill="' + P.edge + '">'
    + '<rect x="206" y="116" width="12" height="68"/>'
    + '<rect x="218" y="128" width="12" height="56"/>'
    + '<rect x="230" y="140" width="12" height="44"/>'
    + '<rect x="242" y="152" width="12" height="32"/>'
    + '<rect x="254" y="164" width="12" height="20"/>'
    + '</g>'
    // أركان بكسل فاتحة — لمسة التوهج
    + '<rect x="52" y="54" width="24" height="10" fill="' + P.hi + '"/>'
    + '<rect x="52" y="64" width="10" height="10" fill="' + P.hi + '"/>'
    + '<rect x="384" y="236" width="24" height="10" fill="' + P.hi + '"/>'
    + '<rect x="398" y="226" width="10" height="10" fill="' + P.hi + '"/>'
    + '</svg>';
}

// توزيع المراحل على الصالة — مروحة راقدة على الديسكتوب، على الفون: صفّة متعرجة
// المراحل أصغر وعايشة جوه المشهد على جريد الصالة) — Task 26
function deskIsPortrait() {
  return !!(window.matchMedia && window.matchMedia('(max-width: 540px) and (orientation: portrait)').matches);
}
function deskOffsetsPure(portrait, i) {
  if (portrait) {
    // صفّة متعرجة: كل كارت جنب الشغال اللي فوقيه بشيبر — يمين وشمال بالتناوب
    // والمسافة الأوسع (28px) بتفضح المشهد بين المراحل بدل ما تتغطى عليه
    const lefts = ['46%', '59%', '42%'];
    return { left: lefts[i] || '50%', bottom: 'calc(14px + ' + (2 - i) + ' * (var(--dossier-h) + 28px))' };
  }
  const fan = [
    { left: 'calc(50% + var(--fan-a))', bottom: '24px' },
    { left: 'calc(50% + var(--fan-b))', bottom: '18px' },
    { left: 'calc(50% + var(--fan-c))', bottom: '12px' }
  ];
  return fan[i] || fan[2];
}
function deskRotationPure(portrait, i) {
  // البورتريه: ميلان واضح للكارت — الديسكتوب زي ما هو
  const fan = [-6, 2, 5], stack = [-4.5, 3.2, -2];
  return (portrait ? stack : fan)[i] || 0;
}

// إعادة توزيع المراحل لو الاتجاه اتقلب وهو واقف على الصالة
let lastDeskLayout = null;
window.addEventListener('resize', (function () {
  let t = null;
  return function () {
    clearTimeout(t);
    t = setTimeout(function () {
      const desk = document.getElementById('screenDesk');
      if (!desk || !desk.classList.contains('active')) return;
      const portrait = deskIsPortrait();
      if (portrait !== lastDeskLayout) showDeskHub();
    }, 160);
  };
})());

// ==================== SHOW DESK HUB ====================
function showDeskHub() {
  // Update subtitle
  const subtitle = document.getElementById('deskSubtitle');
  if (allDocsDone()) {
    subtitle.textContent = 'خلصت كل المراحل — أسطورة!';
  } else {
    subtitle.textContent = state.playerName + '، اختار مرحلة والعب!';
  }

  const stack = document.getElementById('dossierStack');
  stack.innerHTML = '';

  // توزيع المراحل: مروحة على الديسكتوب / رصّة عمودية على فون البورتريه (Task 25)
  const portraitDesk = deskIsPortrait();
  lastDeskLayout = portraitDesk;

  DESK_CATEGORIES.forEach((cat, i) => {
    const set = getActiveSetForCategory(cat);
    if (!set) return;
    const docState = state.docsState[set.setId] || 'empty';
    // كارت مستني أسئلته من التحديثات الجاية — بيتعرض مقفول بوسم قريباً
    const isEmpty = set.questions.length === 0;
    const rot = deskRotationPure(portraitDesk, i);

    const dossier = document.createElement('div');
    dossier.className = 'dossier ' + set.colorClass;
    if (isEmpty) dossier.classList.add('dossier-locked');
    if (docState === 'inProgress') dossier.classList.add('in-progress');
    if (docState === 'done') dossier.classList.add('doc-done');
    dossier.id = 'dossier-' + set.setId;
    dossier.style.setProperty('--dossier-rot', rot + 'deg');

    // توزيع المراحل (Task 27 كوميك): المراحل بقت جريد flow طبيعي — مفيش أي
    // مواقع inline، والميلان بيتحكم فيه --dossier-rot من فوق.
    // deskOffsetsPure فضلت معرفة كمرجع مختبر، بس مش بتتطبق على الـ DOM.

    // جسم المرحلة (الميلان والرفع للشاشة كلها CSS على العنصر ده)
    const body = document.createElement('div');
    body.className = 'dossier-body';

    // ورق المرحلة باين من الجهة المفتوحة
    const papers = document.createElement('div');
    papers.className = 'file-papers';
    body.appendChild(papers);

    // وش المرحلة: الرسمة البكسلية بلون الفئة + الرقم التسلسلي (Task 28)
    const cover = document.createElement('div');
    cover.className = 'dossier-cover';
    cover.id = 'dossierCover-' + set.setId;
    // وش المرحلة: رسمة بكسل بلون الفئة — شاشة أتاري بمثلث Play (Task 28)
    cover.innerHTML = folderArtSVG(set.colorClass, i) + '<div class="file-serial">' + fileSerial(i) + '</div>';

    if (isEmpty) {
      // الوسم الوردي — المرحلة مقفولة لحد ما أسئلتها توصل
      const soon = document.createElement('div');
      soon.className = 'soon-tag';
      soon.textContent = 'قريباً';
      cover.appendChild(soon);
    } else if (docState !== 'done') {
      // الختمة الشمعية قاعدة على عقدة الخيط
      const seal = document.createElement('div');
      seal.className = 'wax-seal';
      seal.id = 'waxSeal-' + set.setId;
      const sealIcon = document.createElement('span');
      sealIcon.className = 'wax-seal-icon';
      sealIcon.textContent = '★'; // نجمة الأتاري على العملة (Task 28)
      seal.appendChild(sealIcon);
      cover.appendChild(seal);
    } else {
      const doneStamp = document.createElement('div');
      doneStamp.className = 'done-stamp';
      doneStamp.textContent = 'خلصت';
      cover.appendChild(doneStamp);
    }
    body.appendChild(cover);

    // تاب الفئة — لصاقة على كعب المرحلة
    const tab = document.createElement('div');
    tab.className = 'dossier-tab';
    tab.textContent = set.displayName;
    body.appendChild(tab);

    dossier.appendChild(body);

    // دبوس التتبع (جاري) — بره الجسم عشان ميميلش
    const pin = document.createElement('div');
    pin.className = 'dossier-pin';
    pin.textContent = '🕹️';
    dossier.appendChild(pin);

    dossier.onclick = () => handleDossierClick(set.setId);
    stack.appendChild(dossier);

    void dossier.offsetWidth;
    dossier.style.animationDelay = (i * 0.15) + 's';
    dossier.classList.add('drop-in');
  });
}

// ==================== DOSSIER CLICK HANDLER ====================
function handleDossierClick(setId) {
  const docState = state.docsState[setId];
  const set = allQuestionSets.find(s => s.setId === setId);
  // مرحلة مقفولة — لسه أسئلتها جايه في التحديث
  if (!set || set.questions.length === 0) {
    const el = document.getElementById('dossier-' + setId);
    if (el) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); }
    Sound.penTap();
    flashDeskNote('المرحلة دي لسه مقفولة… أسئلتها جايه في التحديث الجاي 😉');
    return;
  }
  if (docState === 'done') {
    // Show the achievement card for review (as specified in Prompt 1)
    const card = state.earnedCards.find(c => c.setId === setId);
    if (card) {
      Sound.penTap();
      showAchievementCard(card);
    } else {
      // Fallback: shake if no card found (shouldn't happen)
      const el = document.getElementById('dossier-' + setId);
      if (el) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); }
    }
    return;
  }
  openDossier(setId);
}

// رسالة سريعة على عنوان الصالة — بتروح لوحدها بعد شوية
let deskNoteTimer = null;
function flashDeskNote(msg) {
  const subtitle = document.getElementById('deskSubtitle');
  if (!subtitle) return;
  clearTimeout(deskNoteTimer);
  subtitle.textContent = msg;
  subtitle.classList.add('desk-note-flash');
  deskNoteTimer = setTimeout(() => {
    subtitle.classList.remove('desk-note-flash');
    subtitle.textContent = allDocsDone()
      ? 'خلصت كل المراحل — أسطورة!'
      : (state.playerName || '') + '، اختار مرحلة والعب!';
  }, 2400);
}

// ==================== OPEN DOSSIER (Prompt 2) ====================
let isOpeningDossier = false;

function openDossier(setId) {
  if (isOpeningDossier) return;
  isOpeningDossier = true;
  state.activeSetId = setId;
  const dossier = document.getElementById('dossier-' + setId);
  const seal = document.getElementById('waxSeal-' + setId);
  const cover = document.getElementById('dossierCover-' + setId);
  
  const startIdx = state.docProgress[setId] || 0;
  const isResume = state.docsState[setId] === 'inProgress';
  
  // Skip animation on resume (MEDIUM FIX M6)
  if (isResume) {
    Sound.penTap();
    switchScreen('screenDesk', 'screenGame');
    state.docsState[setId] = 'inProgress';
    loadDocQuestion(setId, startIdx);
    isOpeningDossier = false;
    return;
  }

  // مرحلة جديدة = واسطة بتتجدد (الاستكمال مش بيجدها)
  state.hasWasta = true;
  saveState();

  Sound.penTap();

  // Step 1: Crack the seal (~200ms)
  if (seal) {
    seal.classList.add('cracking');
    Sound.stamp('error');
  }

  // Step 2: Expand dossier (~400ms after seal starts)
  setTimeout(() => {
    dossier.classList.add('opening');
    Sound.paperRustle();

    // Step 3: Flip cover (~250ms into dossier expand)
    setTimeout(() => {
      if (cover) cover.classList.add('flipping');

      // Step 4: Transition bg + switch screen (~200ms into cover flip)
      const overlay = document.getElementById('deskBgOverlay');
      overlay.classList.add('active');

      setTimeout(() => {
        switchScreen('screenDesk', 'screenGame');
        const startIdx = state.docProgress[setId] || 0;
        state.docsState[setId] = 'inProgress';
        loadDocQuestion(setId, startIdx);

        setTimeout(() => {
          overlay.classList.remove('active');
          dossier.classList.remove('opening');
          if (cover) cover.classList.remove('flipping');
          isOpeningDossier = false;
        }, 350);
      }, 200);
    }, 250);
  }, 200);
}

// ==================== DOC-BASED QUESTION LOADING ====================
let currentDocQuestions = [];
let currentDocQuestionIdx = 0;
let currentDocSetId = null;
let docCorrectCount = 0; // per-document correct tracking

function loadDocQuestion(setId, startIdx) {
  const set = allQuestionSets.find(s => s.setId === setId);
  if (!set) return;
  currentDocQuestions = set.questions;
  currentDocQuestionIdx = startIdx;
  currentDocSetId = setId;
  // Resume correct count from saved state (not zero)
  docCorrectCount = state.docCorrectCounts[setId] || 0;
  // فتح المرحلة من الأول (مش استكمال سؤال جاري) = مفيش وقت متجمّع يتطبق بالغلط
  // applyDocTimeSnapshot بتتحقق بنفسها من تطابق السؤال، وده طبقة أمان زيادة
  state.appealUsed = false;
  loadDocQuestionAt(startIdx);
}

// السؤال الحالي في المرحلة المفتوح — مرجع موحد بدل تكرار الوصول للمصفوفة
// ⚠️ جوهرية للمؤقت: startTimer → questionTimeLimit → getCurrentQuestion
function getCurrentQuestion() {
  return currentDocQuestions[currentDocQuestionIdx];
}

function loadDocQuestionAt(idx) {
  docFeedbackLock = false; // ورقة جديدة = الساحة فتحت تاني (Task 36)
  if (idx >= currentDocQuestions.length) {
    finishDocument(currentDocSetId);
    return;
  }
  currentDocQuestionIdx = idx;
  state.docProgress[currentDocSetId] = idx;

  const q = currentDocQuestions[idx];
  questionStartTime = Date.now();
  answerPickedAt = 0;
  state.appealUsed = false; // كل سؤال بيبدأ من غير وقت زايد — واسترجاع لحظة المؤقت (تحت في startTimer) ممكن يرجّعه لو الوقت الزايد اتعمل قبل الخروج

  const card = document.getElementById('questionCard');
  card.classList.remove('card-slide-in', 'card-slide-out');
  void card.offsetWidth;
  card.classList.add('card-slide-in');
  Sound.paperRustle();

  const badge = document.getElementById('catBadge');
  badge.textContent = q.levelLabel ? q.catLabel + ' · ' + q.levelLabel : q.catLabel;
  badge.className = 'cat-badge cat-' + q.cat;
  // رقم المرحلة — بادج بكسلي فوق الكارت (Task 28)
  const fileRef = document.getElementById('fileRefNum');
  if (fileRef) {
    const activeSet = allQuestionSets.find(s => s.setId === currentDocSetId);
    const foldIdx = activeSet ? DESK_CATEGORIES.indexOf(activeSet.category) : 0;
    fileRef.textContent = fileSerial(foldIdx);
  }
  const qText = document.getElementById('questionText');
  qText.textContent = q.text;
  inkSettle(qText);

  const qType = q.type || 'mcq';
  const optionsGrid = document.getElementById('optionsGrid');
  const orderGrid = document.getElementById('orderGrid');
  const orderSubmitBtn = document.getElementById('orderSubmitBtn');
  const textAnswerWrap = document.getElementById('textAnswerWrap');
  const appealBtn = document.getElementById('appealBtn');

  optionsGrid.style.display = 'none';
  orderGrid.style.display = 'none';
  orderSubmitBtn.style.display = 'none';
  textAnswerWrap.style.display = 'none';
  appealBtn.style.display = 'none';
  orderSubmitBtn.disabled = false;
  textAnswerWrap.querySelector('.text-submit-btn').disabled = false;

  if (qType === 'mcq') {
    optionsGrid.style.display = '';
    createOptionButtons(optionsGrid, q.options, i => selectDocAnswer(i));
    if (q.allowAppeal) appealBtn.style.display = '';
    document.getElementById('btnSniper').disabled = !state.hasFifty;
  } else if (qType === 'order') {
    orderGrid.style.display = '';
    orderSubmitBtn.style.display = '';
    renderOrderQuestion(q);
    document.getElementById('btnSniper').disabled = true;
  } else if (qType === 'text') {
    textAnswerWrap.style.display = '';
    renderTextQuestion();
    if (q.allowAppeal) appealBtn.style.display = '';
    document.getElementById('btnSniper').disabled = true;
  }

  const stamp = document.getElementById('stampOverlay');
  stamp.className = 'stamp-overlay';
  stamp.textContent = '';
  document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('strikethrough', 'witness-selected'));

  witnessActive = false;
  witnessChoice = -1;
  witnessChanged = false;
  clearInterval(witnessTimerId);
  document.getElementById('witnessCard').classList.remove('visible', 'hiding');

  const hintNote = document.getElementById('hintNote');
  hintNote.style.display = 'none';
  hintNote.textContent = '';
  const marginNote = document.getElementById('marginNote');
  marginNote.style.display = 'none';
  marginNote.textContent = '';

  document.getElementById('lampConfirm').classList.remove('visible');
  updateLampButton();
  document.getElementById('btnWasta').disabled = !state.hasWasta;
  showMarginNote(q);
  startTimer();
}

// Answer selection for doc-based questions
function selectDocAnswer(index) {
  closeLampConfirm(); // أي إجابة بتقفل لوحة اللمبة — مفيش تأكيد لمبة على إجابة رايحة جاية
  clearInterval(timerInterval);
  const q = currentDocQuestions[currentDocQuestionIdx];
  if (!answerPickedAt) answerPickedAt = Date.now();

  if (q.witness2 && !witnessChanged && !witnessActive) {
    witnessActive = true;
    witnessChoice = index;
    witnessChanged = false;
    const btns = document.querySelectorAll('#optionsGrid .option-btn');
    btns.forEach(b => { b.disabled = true; b.classList.remove('witness-selected'); });
    btns[index].classList.add('witness-selected');
    document.getElementById('witnessCard').classList.remove('hiding');
    document.getElementById('witnessCard').classList.add('visible');
    witnessTimeLeft = WITNESS_TIME;
    updateWitnessTimerDisplay();
    clearInterval(witnessTimerId);
    witnessTimerId = setInterval(() => {
      witnessTimeLeft--;
      updateWitnessTimerDisplay();
      if (witnessTimeLeft <= 0) { clearInterval(witnessTimerId); confirmWitness(); }
    }, 1000);
    Sound.penTap();
    return;
  }
  resolveDocAnswer(index, witnessActive && !witnessChanged);
}

function resolveDocAnswer(index, withMultiplier) {
  const q = currentDocQuestions[currentDocQuestionIdx];
  const btns = document.querySelectorAll('#optionsGrid .option-btn');
  const isCorrect = index === q.correct;
  btns.forEach(b => { b.disabled = true; b.classList.remove('witness-selected'); });

  if (isCorrect) {
    let points = speedTierPoints();
    if (withMultiplier) points = Math.round(points * 1.5);
    const tag = withMultiplier ? '' : speedTierTag(points);
    btns[index].classList.add('correct');
    if (withMultiplier) showWitnessBonus();
    finishDocAnswer(true, points, tag);
  } else {
    btns[index].classList.add('wrong');
    btns[q.correct].classList.add('correct');
    finishDocAnswer(false, 0);
  }
}

function finishDocAnswer(isCorrect, points, tag) {
  docFeedbackLock = true; // الساحة اتقفلت — مفيش أدوات على سؤال خلصانة (Task 36)
  clearDocTimeSnapshot(); // السؤال خلص — مفيش وقت متجمّع يحتاج استكمال
  const answerTime = (Date.now() - questionStartTime) / 1000;
  state.answerTimes.push(answerTime);
  const q = currentDocQuestions[currentDocQuestionIdx];

  if (isCorrect) {
    state.correctCount++;
    docCorrectCount++;
    // Persist per-doc correct count for resume
    if (currentDocSetId) state.docCorrectCounts[currentDocSetId] = docCorrectCount;
    if (state.appealUsed) points = Math.round(points * 0.7);
    state.mainScore += points;
    state.currentStreak++;
    if (state.currentStreak > state.maxStreak) state.maxStreak = state.currentStreak;
    document.getElementById('streakNum').textContent = state.currentStreak;
    showStampOn('stampOverlay', 'success', 'صح');
    Sound.correct();
    showFloatPoints('+' + points, tag);
    if (state.currentStreak > 0 && state.currentStreak % 3 === 0) showStreakBoom(state.currentStreak);
  } else {
    state.wrongCount++;
    state.currentStreak = 0;
    document.getElementById('streakNum').textContent = state.currentStreak;
    if (state.appealUsed) {
      state.mainScore -= GAME_POINTS.appealPenalty;
      showFloatPoints('-' + GAME_POINTS.appealPenalty);
    }
    showStampOn('stampOverlay', 'error', 'غلط');
    Sound.wrong();
    const card = document.getElementById('questionCard');
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 400);
  }

  witnessActive = false; witnessChoice = -1; witnessChanged = false;
  Sound.penTap();
  updateLampButton();
  saveState();
  advanceToNextQuestion();
}

// ==================== FINISH DOCUMENT (shows achievement card) ====================
function finishDocument(setId) {
  clearInterval(timerInterval);
  clearDocTimeSnapshot(); // المرحلة خلص خلاص
  state.docsState[setId] = 'done';
  
  // Calculate per-document stats
  const set = allQuestionSets.find(s => s.setId === setId);
  const totalQ = currentDocQuestions.length || set.questions.length;
  const docCorrect = docCorrectCount;
  
  // Generate reference number (once per card, persistent)
  const year = new Date().getFullYear();
  const refNum = String(Math.floor(Math.random() * 900) + 100);
  const refId = year + '/' + refNum;
  
  // Generate Arabic date
  const now = new Date();
  const dateStr = now.getDate() + ' ' + MONTHS_AR[now.getMonth()] + ' ' + now.getFullYear();
  
  // Calculate tier based on correct ratio for this document
  const correctRatio = totalQ > 0 ? (docCorrect / totalQ) : 0;
  let tier, tierText;
  if (correctRatio >= 0.9) { tier = 'excellent'; tierText = 'امتياز'; }
  else if (correctRatio >= 0.75) { tier = 'vgood'; tierText = 'جيد جدًا'; }
  else if (correctRatio >= 0.5) { tier = 'acceptable'; tierText = 'مقبول'; }
  else if (correctRatio >= 0.25) { tier = 'weak'; tierText = 'ضعيف'; }
  else { tier = 'rejected'; tierText = 'مرفوض'; }
  
  // Store earned card
  const card = {
    setId: setId,
    displayName: set ? set.displayName : setId,
    correct: docCorrect,
    total: totalQ,
    date: dateStr,
    refId: refId,
    tier: tier,
    tierText: tierText
  };
  state.earnedCards.push(card);
  saveState();
  
  // Clean up doc state
  currentDocQuestions = [];
  currentDocQuestionIdx = 0;

  // الاجابات التفصيلية بتتعرض بعد قفل كارت الإنجاز (آخر المرحلة)
  pendingExplainSetId = setId;

  // Show achievement card
  showAchievementCard(card);
}

function returnToDesk() {
  clearInterval(timerInterval);
  currentDocQuestions = [];
  currentDocQuestionIdx = 0;
  Sound.paperRustle();
  switchScreen('screenGame', 'screenDesk');
  setTimeout(() => showDeskHub(), 400);
}

// ⚠️ exitDocToDesk اتشالت في Task 24 — قاعدة الدخلة الواحدة: مفيش رجوع للصالة
// من جوه المرحلة. الزرار اتشال من HTML والدالة معاها، والاستكمال الوحيد المسموح
// هو resumeDocFromSnapshot (تاب اتقفل بالغلط → نفس السؤال يفتح لوحده).

// ==================== ACHIEVEMENT CARD (Prompt 4) ====================
// مراجعة الاجابات التفصيلية اللي مستنية تتعرض بعد قفل كارت الإنجاز (بعد ما المرحلة تخلص)
let pendingExplainSetId = null;
// المرحلة اللي كارت إنجازه ظاهر دلوقتي (عشان زرار الاجابات التفصيلية)
let currentAchieveSetId = null;

function showAchievementCard(card) {
  Sound.unroll();
  currentAchieveSetId = card.setId || null;
  
  const overlay = document.getElementById('achieveOverlay');
  const stamp = document.getElementById('achieveStamp');
  const content = document.getElementById('achieveContent');
  
  // Reset
  stamp.className = 'achieve-stamp';
  stamp.textContent = '';
  content.classList.remove('revealed');
  
  // Reset sequential reveal on each item
  const items = [
    document.getElementById('achieveDocName'),
    document.getElementById('achieveScoreLine'),
    document.getElementById('achieveDate'),
    document.getElementById('achieveRef')
  ];
  const backBtns = overlay.querySelectorAll('.achieve-back-btn');
  items.forEach(el => { if (el) el.classList.remove('revealed'); });
  backBtns.forEach(b => b.classList.remove('revealed'));
  
  // Fill content
  document.getElementById('achieveDocName').textContent = card.displayName;
  document.getElementById('achieveScoreLine').textContent = card.correct + ' من ' + card.total + ' صحيح';
  document.getElementById('achieveDate').textContent = 'الجولة بتاريخ ' + card.date;
  document.getElementById('achieveRef').textContent = 'رقم المرحلة: ' + card.refId;
  
  // Show overlay (card appears empty first)
  overlay.classList.add('visible');
  
  // After 500ms: stamp drops in
  setTimeout(() => {
    stamp.className = 'achieve-stamp tier-' + card.tier;
    stamp.textContent = card.tierText;
    void stamp.offsetWidth;
    stamp.classList.add('stamp-drop');
    Sound.stamp('success');
    
    // After stamp settles: reveal content container, then items sequentially
    setTimeout(() => {
      content.classList.add('revealed');
      
      // Stagger each item: name → score → date → ref → button
      const staggerDelay = 120; // ms between each item
      items.forEach((el, i) => {
        setTimeout(() => {
          if (el) el.classList.add('revealed');
        }, (i + 1) * staggerDelay);
      });
      // Reveal buttons last (مراجعة الاجابات + رجوع للصالة)
      setTimeout(() => {
        backBtns.forEach(b => b.classList.add('revealed'));
      }, (items.length + 1) * staggerDelay);
    }, 600);
  }, 500);
}

function closeAchievementCard() {
  const overlay = document.getElementById('achieveOverlay');
  overlay.classList.remove('visible');
  Sound.penTap();

  // الاجابات التفصيلية بتظهر لوحدها آخر كل مرحلة خلصانة دلوقتي
  // (مراجعة مرحلة قديمة من الصالة مش بتعرضها تلقائيًا — الزرار موجود في الكارت)
  if (pendingExplainSetId) {
    const setId = pendingExplainSetId;
    pendingExplainSetId = null;
    showDocExplanations(setId, proceedAfterAchievement);
    return;
  }
  proceedAfterAchievement();
}

function proceedAfterAchievement() {
  // Check if all documents done (المراحل الفاضية متتحسبش)
  const allDone = allDocsDone();

  if (allDone) {
    // Show desk first, then envelope appears (Prompt 5)
    const gameScreen = document.getElementById('screenGame');
    if (gameScreen.classList.contains('active')) {
      switchScreen('screenGame', 'screenDesk');
      setTimeout(() => { showDeskHub(); showEnvelope(); }, 400);
    } else {
      showDeskHub();
      setTimeout(() => showEnvelope(), 300);
    }
  } else {
    // Return to desk — determine which screen we came from
    const gameScreen = document.getElementById('screenGame');
    const deskScreen = document.getElementById('screenDesk');
    if (gameScreen.classList.contains('active')) {
      switchScreen('screenGame', 'screenDesk');
      setTimeout(() => showDeskHub(), 400);
    } else if (deskScreen.classList.contains('active')) {
      // Already on desk (reviewing a done dossier) — just refresh once
      setTimeout(() => showDeskHub(), 100);
    } else {
      switchScreen('screenGame', 'screenDesk');
      setTimeout(() => showDeskHub(), 400);
    }
  }
}

// زرار كارت الإنجاز — مراجعة اجابات المرحلة اللي ظاهر دلوقتي أي وقت
function openAchieveExplanations() {
  // المستخدم شافها خلاص — متتعرضش تاني تلقائيًا بعد القفل
  pendingExplainSetId = null;
  if (!currentAchieveSetId) return;
  showDocExplanations(currentAchieveSetId, null);
}

// ==================== الاجابات التفصيلية (آخر كل مرحلة) ====================
let explainAfterFn = null;

function openExplainReview(questions, title, sub, afterFn) {
  const list = document.getElementById('explainList');
  const titleEl = document.getElementById('explainTitle');
  const subEl = document.getElementById('explainSub');
  if (!list || !titleEl || !subEl) return;

  list.innerHTML = '';
  titleEl.textContent = title || '📖 الاجابات التفصيلية';
  subEl.textContent = sub || '';

  questions.forEach((q, i) => {
    const item = document.createElement('div');
    item.className = 'explain-item';

    // نص السؤال
    const qEl = document.createElement('div');
    qEl.className = 'explain-q';
    qEl.textContent = (i + 1) + '. ' + q.text;
    item.appendChild(qEl);

    // الاختيارات — الصح متعلم عليه بالعلمة الخضرا
    const opts = document.createElement('div');
    opts.className = 'explain-opts';
    q.options.forEach((opt, oi) => {
      const o = document.createElement('div');
      o.className = 'explain-opt' + (oi === q.correct ? ' is-correct' : '');
      o.textContent = (oi === q.correct ? '✓ ' : '• ') + opt;
      opts.appendChild(o);
    });
    item.appendChild(opts);

    // الاجابة التفصيلية
    const why = document.createElement('div');
    why.className = 'explain-why';
    const tag = document.createElement('span');
    tag.className = 'explain-why-tag';
    tag.textContent = 'التفصيل:';
    why.appendChild(tag);
    why.appendChild(document.createTextNode(q.explanation || '—'));
    item.appendChild(why);

    list.appendChild(item);
  });

  // رجوع القايمة لأولها كل مرة
  list.scrollTop = 0;
  explainAfterFn = afterFn || null;
  document.getElementById('explainOverlay').classList.add('visible');
  Sound.unroll();
}

function closeExplainReview() {
  document.getElementById('explainOverlay').classList.remove('visible');
  Sound.penTap();
  const fn = explainAfterFn;
  explainAfterFn = null;
  if (typeof fn === 'function') fn();
}

// الاجابات التفصيلية لمرحلة من المراحل (10 أسئلة)
function showDocExplanations(setId, afterFn) {
  const set = allQuestionSets.find(s => s.setId === setId);
  const qs = set ? set.questions : [];
  openExplainReview(qs, '📖 الاجابات التفصيلية', set ? set.displayName : 'المرحلة المكتملة', afterFn);
}

// الاجابات التفصيلية لتحدي العباقرة (7 أسئلة)
function openGeniusExplanations(afterFn) {
  openExplainReview(GENIUS_QUESTIONS, '📖 اجابات تحدي العباقرة', 'جولة المخاطرة — 7 أسئلة مركبة', afterFn);
}



// ==================== EGYPTIAN STAMP ENHANCEMENT (Prompt 6) ====================
function enhanceCertStamp(stampEl) {
  // حلقات مركزة حوالين نص الختم (بديل مبسّط لـ textPath)
  // Add outer ring via outline
  stampEl.style.outline = '2px solid currentColor';
  stampEl.style.outlineOffset = '4px';
  
  // Add inner ring via box-shadow
  const existingShadow = stampEl.style.boxShadow || '';
  stampEl.style.boxShadow = existingShadow + (existingShadow ? ', ' : '') + 'inset 0 0 0 3px currentColor';
}

// ==================== ENVELOPE (Prompt 5) ====================
function showEnvelope() {
  const wrap = document.getElementById('envelopeWrap');
  wrap.classList.add('visible');
  Sound.penTap();
}

function openEnvelope() {
  const envelope = document.getElementById('envelope');
  envelope.classList.add('opening');
  Sound.stamp('error'); // seal crack sound
  
  setTimeout(() => {
    Sound.paperRustle();
    // After envelope opens, go to bonus round
    document.getElementById('envelopeWrap').classList.remove('visible');
    envelope.classList.remove('opening');
    
    // Proceed to bonus round (existing flow)
    switchScreen('screenDesk', 'screenBonus');
  }, 700); // ~600ms for animation + 100ms buffer
}

// ==================== ENCLOSURES / المرفقات (Prompt 5) ====================
function renderEnclosures() {
  const section = document.getElementById('enclosuresSection');
  const row = document.getElementById('enclosuresRow');
  
  if (!state.earnedCards || state.earnedCards.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  row.innerHTML = '';
  
  const rotations = [-3, 2, -1, 4, -2]; // different tilt per card
  
  state.earnedCards.forEach((card, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'enclosure-thumb';
    thumb.style.transform = 'rotate(' + rotations[i % rotations.length] + 'deg)';
    
    const nameEl = document.createElement('div');
    nameEl.className = 'enclosure-thumb-name';
    nameEl.textContent = card.displayName;
    
    const scoreEl = document.createElement('div');
    scoreEl.className = 'enclosure-thumb-score';
    scoreEl.textContent = card.correct + '/' + card.total;
    
    thumb.appendChild(nameEl);
    thumb.appendChild(scoreEl);
    
    thumb.onclick = () => showCardReview(card);
    row.appendChild(thumb);
  });
}

function showCardReview(card) {
  Sound.penTap();
  const overlay = document.getElementById('cardReviewOverlay');
  const content = document.getElementById('cardReviewContent');

  // بيانات الكارت جاية من الحفظ المحلي — بتتعامل كمدخل غير موثوق (escaping — Task 31)
  content.innerHTML = `
    <div class="achieve-card" style="border:3px solid var(--diwan-ink); box-shadow:0 6px 24px rgba(0,0,0,0.2), inset 0 0 0 5px var(--diwan-paper-soft), inset 0 0 0 7px var(--diwan-kraft);">
      <div class="achieve-stamp tier-${escapeHtml(card.tier)} stamp-drop" style="opacity:1;transform:scale(1)rotate(0deg)">${escapeHtml(card.tierText)}</div>
      <div class="card-content revealed">
        <div class="achieve-doc-name revealed">${escapeHtml(card.displayName)}</div>
        <div class="achieve-score-line revealed">${escapeHtml(String(card.correct))} من ${escapeHtml(String(card.total))} صحيح</div>
        <div class="achieve-date revealed">الجولة بتاريخ ${escapeHtml(card.date)}</div>
        <div class="achieve-ref revealed">رقم المرحلة: ${escapeHtml(card.refId)}</div>
        <button class="achieve-back-btn revealed" style="margin-top:18px;" onclick="closeCardReview()">رجوع للكأس</button>
      </div>
    </div>
  `;
  
  overlay.classList.add('visible');
}

function closeCardReview() {
  const overlay = document.getElementById('cardReviewOverlay');
  overlay.classList.remove('visible');
  Sound.penTap();
}

// الصفحة اللي بعد الإجابة — بتتقدّم للسؤال اللي بعده بعد مهلة عرض 1.5 ثانية
function advanceToNextQuestion() {
  // التقدم بيتثبت فورًا لحظة الإجابة مش بعد مهلة العرض — لو التاب اتقفل في النص
  // السؤال اللي خلص مش هيتكرر (دخلة واحدة لكل سؤال — Task 24)
  if (currentDocSetId) {
    state.docProgress[currentDocSetId] = currentDocQuestionIdx + 1;
    saveState();
  }
  setTimeout(() => advanceCard('questionCard', () => loadDocQuestionAt(currentDocQuestionIdx + 1)), 1500);
}


// ==================== ENTRY SCREEN ====================
// سجل اللاعبين: الدخلة مرة واحدة في الجولة — بيتسجل أول ما الكأس تتعرض
// (عند اكتمال الجولة مش عند البداية — عشان لو حد قفل الصفحة بالغلط مايتقفلش بره للأبد)
function getRegisteredName() {
  return normalizeNamePure(storeGet(REG_KEY) || '');
}

function registerPlayerOnce(name) {
  const n = normalizeNamePure(name);
  if (!n) return;
  storeSet(REG_KEY, n);
  // Task 34: التسجيل بيتكتب في المارايا الاحتياطية — مسح localStorage لوحده مبقاش كفاية
  writeMemoryMirror(buildMemPayload(computeSeasonHash(), n));
}

// شاشة الدخول في وضع "مُسجّل": الفورم بيتخفى وكارت القيد بيبان
function showEntryLocked() {
  const reg = getRegisteredName();
  const locked = document.getElementById('entryLocked');
  if (!locked) return;
  document.getElementById('entryLockedName').textContent = reg || '';
  locked.style.display = 'block';
  // بطاقة اللاعب بتتخفي كلها — كارت "إنت داخل" كفاية (Task 28)
  const paper = document.getElementById('entryPaper');
  if (paper) paper.style.display = 'none';
}

// اللاعب المتسجل يقدر يفتح كأسه ويستعرض جولته — من غير دخلة جديدة
function viewRegisteredCertificate() {
  Sound.penTap();
  const ok = loadState();
  // سيناريو عطل: الحفظ المحلي بايظ/اتمسح — الزرار عمره ما بيتشرخ،
  // بنرجّع الاسم من سجل اللاعبين ونعرض الكأس بالدرجات الموجودة (أو صفر)
  if (!ok || !state.playerName) {
    state.playerName = getRegisteredName() || state.playerName || 'لاعب';
  }
  state.totalScore = state.mainScore + state.bonusScore;
  switchScreen('screenEntry', 'screenCert');
  setTimeout(() => renderCertificate(), 400);
}

// ==================== أختام الأقسام — استمارة التوظيف (Task 26) ====================
// 6 أختام حبرية مرسومة SVG بدل رموز اليونيكود العشرة — كل لاعب بياخد ختم قسمه،
// والاسم بيتخزن (مش الرمز) عشان يظهر مقروء في الريكورد والكأس
const AVATAR_STAMPS = [
  { id: 'star',     label: 'نجمة',  icon: '<path d="M32 9 L38.9 24.6 L56 26.2 L43.2 37.4 L47.1 54.2 L32 45.4 L16.9 54.2 L20.8 37.4 L8 26.2 L25.1 24.6 Z" fill="currentColor" stroke="none"/>' },
  { id: 'crescent', label: 'هلال',  icon: '<path d="M44 12 A23 23 0 1 0 44 52 A18 18 0 1 1 44 12 Z" fill="currentColor" stroke="none"/>' },
  { id: 'gear',     label: 'ترس',   icon: '<path d="M32 14 L35.3 21.6 L43 19 L43 27 L50.4 30 L43 33 L43 41 L35.3 38.4 L32 46 L28.7 38.4 L21 41 L21 33 L13.6 30 L21 27 L21 19 L28.7 21.6 Z" fill="currentColor" stroke="none"/><circle cx="32" cy="30" r="4.4" stroke-width="2.6"/>' },
  { id: 'scales',   label: 'ميزان', icon: '<path d="M32 12 V45 M23 46 H41 M13 23 H51" stroke-width="2.6"/><path d="M13 23 L7.5 35 M13 23 L18.5 35 M7.5 35 A5.8 5.8 0 0 0 18.5 35 M51 23 L45.5 35 M51 23 L56.5 35 M45.5 35 A5.8 5.8 0 0 0 56.5 35" stroke-width="2.2"/>' },
  { id: 'key',      label: 'مفتاح', icon: '<circle cx="22.5" cy="24.5" r="8.5" stroke-width="3"/><path d="M28.8 30.8 L50 52 M42.5 44.5 L48.5 38.5 M46.5 50.5 L52.5 44.5" stroke-width="3"/>' },
  { id: 'quill',    label: 'ريشة',  icon: '<path d="M47 10.5 C36 15.5 25 28 20 45 C30.5 40 43 27 47 10.5 Z" fill="currentColor" stroke="none"/><path d="M22 42 L13 53" stroke-width="2.8"/>' }
];

// حلقة ختم مكسورة مرتين — إحساس الطبع الحقيقي بدل الدوايرة الهندسية المثالية
function stampSVG(icon) {
  return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round">'
    + '<circle cx="32" cy="32" r="27" stroke-width="2.5" stroke-dasharray="92 10 58 8"/>'
    + '<circle cx="32" cy="32" r="22.5" stroke-width="1.3" opacity=".5"/>'
    + icon
    + '</g></svg>';
}

const avatarGrid = document.getElementById('avatarGrid');
AVATAR_STAMPS.forEach((stamp, i) => {
  const btn = document.createElement('button');
  btn.className = 'avatar-stamp';
  btn.title = 'ختم ' + stamp.label;
  btn.setAttribute('aria-label', 'ختم ' + stamp.label);
  btn.innerHTML = stampSVG(stamp.icon);
  btn.onclick = () => selectAvatar(i, stamp.label);
  avatarGrid.appendChild(btn);
});

function selectAvatar(index, label) {
  Sound.penTap();
  document.querySelectorAll('.avatar-stamp').forEach((b, i) => {
    b.classList.toggle('selected', i === index);
  });
  state.playerAvatar = label;
  checkEntryForm();
}

document.getElementById('nameInput').addEventListener('input', function() {
  checkEntryForm();
});

// ==================== SIGNATURE CANVAS ====================
(function initSignature() {
  const canvas = document.getElementById('sigCanvas');
  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let hasDrawn = false;
  let lastX = 0, lastY = 0;

  // Ink-colored thin line with round caps
  ctx.strokeStyle = '#26344A';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function startDraw(e) {
    e.preventDefault();
    isDrawing = true;
    hasDrawn = true;
    canvas.classList.add('drawing');
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastX = pos.x;
    lastY = pos.y;
  }

  function endDraw(e) {
    if (!isDrawing) return;
    isDrawing = false;
    canvas.classList.remove('drawing');
    // Store signature
    if (hasDrawn) {
      state.playerSignature = canvas.toDataURL('image/png');
    }
  }

  // Mouse events
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);

  // Touch events
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', endDraw);
})();

function clearSignature() {
  const canvas = document.getElementById('sigCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.playerSignature = '';
  Sound.penTap();
}

function checkEntryForm() {
  const name = document.getElementById('nameInput').value.trim();
  const hasAvatar = !!state.playerAvatar;
  const btn = document.getElementById('submitBtn');
  btn.disabled = !(name && hasAvatar);
  document.getElementById('formGlow').classList.toggle('active', name && hasAvatar);
}

// ==================== PHOTO UPLOAD ====================
// ضغط الصورة قبل التخزين — الصورة الخام (موبايل = 3-8MB) كانت بتتحول data URL
// وبتفوق حصة localStorage فبيفشل الحفظ كله بصمت (التقدم كله مبيتسجلش).
// بنصغّر لأقصى 480px بصيغة JPEG — حجم نهائي عشرات الكيلوبايتات بيعيش بأمان في التخزين.
function compressImageFile(file, onReady, onError) {
  if (!file || !/^image\//.test(file.type || '')) {
    if (onError) onError('الملف ده مش صورة — جرب صورة تاني يا بطل');
    return;
  }
  const reader = new FileReader();
  reader.onload = function (ev) {
    const img = new Image();
    img.onload = function () {
      try {
        const MAX = 480;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        let dataUrl;
        try { dataUrl = cv.toDataURL('image/jpeg', 0.82); }
        catch (e) { dataUrl = ev.target.result; } // فشل نادر — نكمّل بالأصل
        onReady(dataUrl);
      } catch (e) {
        if (onError) onError('حصلت مشكلة في معالجة الصورة — جرب صورة تاني');
      }
    };
    img.onerror = function () {
      if (onError) onError('الصورة دي بايظة — جرب صورة تاني يا بطل');
    };
    img.src = ev.target.result;
  };
  reader.onerror = function () {
    if (onError) onError('الصورة ما اتقريتش — جرب تاني');
  };
  reader.readAsDataURL(file);
}

function showPhotoError(msg) {
  try { alert(msg); } catch (e) {}
}

document.getElementById('photoInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  compressImageFile(file, function(dataUrl) {
    state.playerPhoto = dataUrl;

    const entrySlot = document.getElementById('photoSlot');
    if (entrySlot) {
      entrySlot.innerHTML = `<img src="${dataUrl}" alt="صورة اللاعب">`;
    }

    const certSlot = document.getElementById('certPhotoSlot');
    if (certSlot) {
      certSlot.innerHTML = `<img src="${dataUrl}" alt="صورة اللاعب">`;
    }

    Sound.penTap();
  }, showPhotoError);
  e.target.value = '';
});

function startGame() {
  // قاعدة الأتاري: اللاعب له دخلة واحدة في الجولة — المتسجل بيتردّ فوراً
  if (getRegisteredName()) { showEntryLocked(); return; }
  state.playerName = normalizeNamePure(document.getElementById('nameInput').value.trim());
  state.hasWasta = true; // واسطة جديدة مع كل دخول
  // نقرة العملة — نفس النقرة بتفك قفل الصوت في المتصفح (iOS)
  Sound.coin();
  switchScreen('screenEntry', 'screenDesk');
  setTimeout(() => showDeskHub(), 400);
  saveState();
}

// ==================== GAMEPLAY ENGINE ====================
let timerInterval = null;
let timeLeft = 15;
let questionStartTime = 0;
const QUESTION_TIME = 15;
// ⏱️ وقت السؤال الحالي — بيتغير حسب حقل time في السؤال
// ⚡ سريع = 15-20 ث / ⏱️ متوسط = 30 ث / 🧠 ذكي = 90-120 ث
let currentQuestionTime = QUESTION_TIME;

// زمن السؤال الحالي من بياناته — لو مفيش حقل time يستخدم الافتراضي
function questionTimeLimit() {
  const q = getCurrentQuestion();
  return (q && q.time) ? q.time : QUESTION_TIME;
}

// عرض الوقت: ثواني عادية للقصير، ودقيقة:ثانية للأسئلة الطويلة (1:30 بدل 90)
function formatTimeLeft(t) {
  if (t >= 60) {
    const m = Math.floor(t / 60);
    const s = t % 60;
    return m + ':' + String(s).padStart(2, '0');
  }
  return String(t);
}

function createOptionButtons(gridEl, options, clickHandler) {
  // حروف الاختيارات — أ/ب/ج/د في خانة بكسل جنب كل اختيار (Task 28)
  const LETTERS_AR = ['أ', 'ب', 'ج', 'د', 'هـ'];
  gridEl.innerHTML = '';
  options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    const letter = document.createElement('span');
    letter.className = 'opt-letter';
    letter.textContent = LETTERS_AR[i] || String(i + 1);
    const txt = document.createElement('span');
    txt.className = 'opt-text';
    txt.textContent = opt;
    btn.appendChild(letter);
    btn.appendChild(txt);
    btn.onclick = () => clickHandler(i);
    inkSettle(btn);
    gridEl.appendChild(btn);
  });
}

function startTimer() {
  clearInterval(timerInterval);
  // كل سؤال ليه وقته الخاص — الشمعة بتتولّد من وقت السؤال نفسه
  currentQuestionTime = questionTimeLimit();
  timeLeft = currentQuestionTime;
  // تجميد واستكمال: لو خرجنا من المرحلة (أو الريفريش حصل) وسط السؤال ده — بنكمل بالثواني المتبقية
  // ده بيقفل غش الخروج والدخول اللي كان بيجدد الوقت من الأول
  applyDocTimeSnapshot();
  updateTimerDisplay();
  updateCandleVisual();
  resumeTimer();
}

// مُشغّل الشمعة — نفس نبضة السير بلا إعادة تصفير الثواني
// بتستخدم في بداية السؤال وبعد "أغيّرها" في لحظة الحقيقة (الشمعة بتحرق من فين وقفت)
function resumeTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    updateCandleVisual();
    saveDocTimeSnapshot(); // لحظة مؤقتة كل ثانية — الريفريش أو الخروج مش بيصفّرش الوقت
    if (timeLeft <= 3 && timeLeft > 0) Sound.tick();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      clearDocTimeSnapshot();
      handleTimeout();
    }
  }, 1000);
}

function updateTimerDisplay() { document.getElementById('candleTime').textContent = formatTimeLeft(Math.max(0, timeLeft)); }

// وسم منطقة التلت — أخضر = التلت الأول (+15) · أصفر = التاني (+10) · أحمر = الأخير (+5)
// دالة مشتركة بين شريط المراحل وعداد جولة المخاطرة
function timeZoneClass(pct) {
  if (pct > 0.66) return 'zone-fast';
  if (pct > 0.33) return 'zone-mid';
  return 'zone-slow';
}

function updateCandleVisual() {
  // بعد الوقت الزايد التلت بيتحسب على الوقت الممتد — نفس مرجع حساب النقاط بالظبط
  const total = currentQuestionTime + (state.appealUsed ? APPEAL_BONUS_TIME : 0);
  const pct = Math.min(1, Math.max(0, timeLeft / total));
  const timeEl = document.getElementById('candleTime');
  if (!timeEl) return;
  timeEl.classList.remove('zone-fast', 'zone-mid', 'zone-slow');
  timeEl.classList.add(timeZoneClass(pct));
  // شريط الحبر — بينسحب مع الوقت ويتحول أحمر ويقعد ينبض في التلت الأخير (Task 26)
  const inkFill = document.getElementById('inkFill');
  if (inkFill) {
    inkFill.style.width = (pct * 100).toFixed(1) + '%';
    inkFill.classList.toggle('ink-urgent', pct <= 0.33);
  }
}

function handleTimeout() {
  docFeedbackLock = true; // الساحة اتقفلت — مفيش أدوات على سؤال خلصانة (Task 36)
  closeLampConfirm(); // لوحة اللمبة المفتوحة متتسابش على سؤال خلص وقته
  // Record answer time for badge calculation (MEDIUM FIX)
  state.answerTimes.push((Date.now() - questionStartTime) / 1000);
  
  const q = getCurrentQuestion();
  const qType = q.type || 'mcq';

  // Disable all interactive elements based on question type
  if (qType === 'mcq') {
    const btns = document.querySelectorAll('#optionsGrid .option-btn');
    btns.forEach((b, i) => {
      b.disabled = true;
      if (i === q.correct) b.classList.add('correct');
    });
  } else if (qType === 'order') {
    document.getElementById('orderSubmitBtn').style.display = 'none';
    // Re-order cards to show correct order
    const grid = document.getElementById('orderGrid');
    const cards = grid.querySelectorAll('.order-card');
    state.orderItems = [...q.correctOrder];
    // Re-render cards in correct order
    renderOrderCards();
    const newCards = grid.querySelectorAll('.order-card');
    newCards.forEach(c => {
      c.classList.add('order-correct');
      c.querySelectorAll('.order-arrows button').forEach(b => b.disabled = true);
    });
  } else if (qType === 'text') {
    document.getElementById('textAnswerWrap').style.display = 'none';
    const textInput = document.getElementById('textAnswerInput');
    if (textInput) textInput.disabled = true;
    // Show the first acceptable answer below the question
    if (q.acceptableAnswers && q.acceptableAnswers.length > 0) {
      const answerHint = document.createElement('div');
      answerHint.style.cssText = 'font-family:var(--font-display);font-size:1rem;color:var(--diwan-success);margin-top:12px;opacity:0.8;';
      answerHint.textContent = q.acceptableAnswers[0];
      document.getElementById('questionText').appendChild(answerHint);
    }
  }

  state.wrongCount++;
  state.currentStreak = 0;
  document.getElementById('streakNum').textContent = state.currentStreak;

  // Appeal: double penalty on timeout too
  if (state.appealUsed) {
    state.mainScore -= GAME_POINTS.appealPenalty;
    showFloatPoints('-' + GAME_POINTS.appealPenalty);
  }

  showStampOn('stampOverlay', 'error', 'غلط');
  Sound.wrong();

  const card = document.getElementById('questionCard');
  card.classList.add('shake');
  setTimeout(() => card.classList.remove('shake'), 400);

  updateLampButton();
  saveState(); // نتيجة السؤال اللي خلص بالوقت تتسجل برضه (مثل finishDocAnswer)
  advanceToNextQuestion();
}

// ==================== SECOND WITNESS STATE ====================
let witnessActive = false;      // is the witness card currently shown?
let witnessChoice = -1;         // the index the player first selected
let witnessTimerId = null;      // setInterval id for witness countdown
let witnessTimeLeft = 5;        // 5-second mini timer
let witnessChanged = false;     // did the player use "change" already?
const WITNESS_TIME = 5;

// قفل ساحة الإجابة (Task 36): بيتقد في لحظة الإجابة/المهلة وبيتفتح لما الورقة الجاية تترسم.
// من غيره: دوسة واسطة في مهلة العرض (1.5 ث) بتتحرق الأداة وبتعمل advance مزدوج = سؤال بيتخطى،
// والقناص/اللمبة/الوقت الزايد بتتحرق على سؤال ميت — دوس الإبهام على الموبايل أسرع من المهلة.
let docFeedbackLock = false;

function updateWitnessTimerDisplay() {
  const num = document.getElementById('witnessTimerNum');
  const fill = document.getElementById('witnessTimerFill');
  if (num) num.textContent = Math.max(0, witnessTimeLeft);
  if (fill) fill.style.width = (Math.max(0, witnessTimeLeft) / WITNESS_TIME * 100) + '%';
}

function hideWitnessCard() {
  const card = document.getElementById('witnessCard');
  card.classList.remove('visible');
  card.classList.add('hiding');
  witnessActive = false;
  clearInterval(witnessTimerId);
}

function confirmWitness() {
  if (!witnessActive) return;
  hideWitnessCard();
  resolveDocAnswer(witnessChoice, true);
}

function changeWitness() {
  if (!witnessActive) return;
  witnessChanged = true;
  witnessActive = false;
  clearInterval(witnessTimerId);
  hideWitnessCard();

  // Re-enable option buttons (except the already-selected one stays highlighted)
  const btns = document.querySelectorAll('#optionsGrid .option-btn');
  btns.forEach((b, i) => {
    if (i === witnessChoice) {
      b.classList.remove('witness-selected');
      b.disabled = true; // can't pick the same one again
    } else if (!b.classList.contains('strikethrough')) {
      b.disabled = false; // allow re-selection
    }
  });

  // الشمعة بترجع تحرق من نفس الثانية — أول ما اللاعب ضغط أول اختيار السير اتوقف،
  // و"أغيّرها" مش معناها وقت تفكير لا نهائي (قاعدة تجميد واستكمال — نفس فلسفة الريفريش)
  resumeTimer();

  Sound.penTap();
  // اللاعب هيختار اختيار جديد — selectDocAnswer هتتصرف على طول
  // لأن witnessChanged بقى true فبتروح resolveDocAnswer مباشرة
}

function showWitnessBonus() {
  const el = document.createElement('div');
  el.className = 'witness-bonus';
  el.textContent = '◆ ×1.5';
  const card = document.getElementById('questionCard');
  const rect = card.getBoundingClientRect();
  el.style.left = (rect.left + rect.width / 2 + 30) + 'px';
  el.style.top = (rect.top + rect.height / 2 - 10) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function advanceCard(cardId, nextLoadFn) {
  const card = document.getElementById(cardId);
  card.classList.remove('card-slide-in');
  card.classList.add('card-slide-out');
  Sound.paperRustle();
  setTimeout(() => {
    card.classList.remove('card-slide-out');
    nextLoadFn();
  }, 300);
}

function showStampOn(elementId, type, text) {
  const stamp = document.getElementById(elementId);
  stamp.className = 'stamp-overlay stamp-' + type;
  // الإطار بيلف الكلمة نفسها — span.stamp-text جوه الغلاف (Task 27 كوميك)
  stamp.textContent = '';
  const stampText = document.createElement('span');
  stampText.className = 'stamp-text';
  stampText.textContent = text;
  stamp.appendChild(stampText);
  void stamp.offsetWidth;
  stamp.classList.add('animate');
}

function showFloatPoints(text, tag, anchorEl) {
  const el = document.createElement('div');
  el.className = 'float-points';
  el.textContent = text + (tag ? ' ' + tag : '');
  const card = anchorEl || document.getElementById('questionCard');
  if (!card) return;
  const rect = card.getBoundingClientRect();
  el.style.left = (rect.left + rect.width / 2 - 20) + 'px';
  el.style.top = (rect.top + rect.height / 2) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// ==================== لفحة البوم — ستريك كبير (Task 29) ====================
// كل 3 إجابات صح ورا بعض اللعبة بتفرقع — والنص بيتدرج مع الدرجات

// نقية للاختبارات: بتحدد درجة ونص اللفحة حسب عدد الستريك
// 3 → بوم! · 6 → بوم! بوم! · 9 → سلطان! · 12+ → سلطان بلا منافس!
// غير كده (صفر / مش مضاعف 3 / سالب / مش رقم) → مفيش لفحة (null)
function streakBoomPure(streak) {
  if (typeof streak !== 'number' || !isFinite(streak)) return null;
  if (streak <= 0 || streak % 3 !== 0) return null;
  const level = streak / 3;
  if (level === 1) return { level: 1, text: 'بوم!' };
  if (level === 2) return { level: 2, text: 'بوم! بوم!' };
  if (level === 3) return { level: 3, text: 'سلطان!' };
  return { level: 4, text: 'سلطان بلا منافس!' };
}

function showStreakBoom(streak) {
  const boom = streakBoomPure(streak);
  if (!boom) return;
  Sound.boom();

  const el = document.createElement('div');
  el.className = 'streak-boom';
  el.dataset.level = String(boom.level);

  // شظايا التفقع — 12 قطعة نيون بتترمي من النص
  const bits = document.createElement('div');
  bits.className = 'boom-bits';
  const bitColors = ['var(--yellow)', 'var(--pink)', 'var(--cyan)', 'var(--green)'];
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('i');
    b.className = 'boom-bit';
    const ang = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
    const dist = 70 + Math.random() * 90;
    b.style.setProperty('--bx', Math.round(Math.cos(ang) * dist) + 'px');
    b.style.setProperty('--by', Math.round(Math.sin(ang) * dist) + 'px');
    b.style.background = bitColors[i % bitColors.length];
    b.style.animationDelay = (Math.random() * 0.08) + 's';
    bits.appendChild(b);
  }

  const word = document.createElement('div');
  word.className = 'boom-word';
  word.textContent = boom.text;

  const sub = document.createElement('div');
  sub.className = 'boom-sub';
  sub.textContent = '★ ستريك ' + streak + ' ★';

  el.appendChild(bits);
  el.appendChild(word);
  el.appendChild(sub);
  document.body.appendChild(el);

  // من درجة سلطان وطالع — الشاشة كلها بتتهز لفة
  const scr = document.getElementById('screenGame');
  if (boom.level >= 3 && scr) {
    scr.classList.remove('boom-shake');
    void scr.offsetWidth;
    scr.classList.add('boom-shake');
    setTimeout(() => scr.classList.remove('boom-shake'), 420);
  }

  setTimeout(() => el.remove(), 1100);
}

// نقية للاختبارات: تختار إجابتين غلط (مش الإجابة الصح) من إجمالي الاختيارات
function pickTwoWrong(correct, total) {
  const indices = [];
  for (let i = 0; i < total; i++) if (i !== correct) indices.push(i);
  return shuffleArray(indices).slice(0, 2);
}

function useSniper() {
  if (!state.hasFifty) return;
  if (docFeedbackLock) return; // ساحة الإجابة مقفولة — مفيش قناص على سؤال خلصانة (Task 36)
  if (witnessActive) return; // كارت التثبيت واقف — مفيش قناص دلوقتي (زي باقي الأدوات)
  // 50/50 only works for MCQ questions
  const q = getCurrentQuestion();
  const qType = q.type || 'mcq';
  if (qType !== 'mcq') {
    // Brief shake to indicate not applicable
    const btn = document.getElementById('btnSniper');
    btn.classList.add('shake');
    setTimeout(() => btn.classList.remove('shake'), 400);
    return;
  }
  state.hasFifty = false;
  document.getElementById('btnSniper').disabled = true;
  Sound.penTap();
  saveState();
  const btns = document.querySelectorAll('#optionsGrid .option-btn');
  // طلقة القناص — إجابتين غلط بيتمسحوا في طلقة واحدة
  pickTwoWrong(q.correct, btns.length).forEach(i => {
    btns[i].classList.add('strikethrough');
    btns[i].disabled = true;
  });
  const grid = document.getElementById('optionsGrid');
  grid.classList.remove('sniper-sweep');
  void grid.offsetWidth;
  grid.classList.add('sniper-sweep');
  Sound.sniperSwoosh();
  setTimeout(() => grid.classList.remove('sniper-sweep'), 700);
}

// ==================== واسطة — تعدي السؤال بالسطرة ====================
// بتتتجدد مع كل مرحلة جديدة — تخطي السؤال من غير نقط ولا غلطة والستريك زي ما هو
function useWasta() {
  if (!state.hasWasta) return;
  if (docFeedbackLock) return; // ساحة الإجابة مقفولة — الواسطة في مهلة العرض كانت بتحرق الأداة وتخطّي سؤال زيادة (Task 36)
  if (witnessActive) return; // التثبيت واقف في وشك — مفيش واسطة دلوقتي
  if (currentDocQuestionIdx >= currentDocQuestions.length) return;

  state.hasWasta = false;
  document.getElementById('btnWasta').disabled = true;
  clearInterval(timerInterval);

  // اقفل الكارت على الواسطة — مفيش دوس مكرر بعد ما اتخضت
  document.querySelectorAll('#optionsGrid .option-btn').forEach(b => b.disabled = true);
  const textWrap = document.getElementById('textAnswerWrap');
  if (textWrap) textWrap.querySelectorAll('input,button').forEach(el => el.disabled = true);
  const ordBtn = document.getElementById('orderSubmitBtn');
  if (ordBtn) ordBtn.disabled = true;

  showStampOn('stampOverlay', 'wasta', 'واسطة');
  Sound.powerup();
  Sound.penTap();
  saveState();
  // لقطة مؤقت السؤال المتخطى بتتمسح — السؤال المعدّي بالواسطة ما بيرجعش أبدًا
  // لو التاب اتقفل في نص المهلة (نفس قاعدة دخلة واحدة لكل سؤال — Task 31)
  clearDocTimeSnapshot();
  // ندور ورقة تانية: السؤال اللي بعده من غير حساب — مفيش صح ولا غلط
  advanceToNextQuestion();
}

// ==================== BONUS ROUND ====================
function initBonusStamps() {
  const container = document.getElementById('bonusStamps');
  container.innerHTML = '';
  bonusQuestions.forEach((_, i) => {
    const span = document.createElement('span');
    span.textContent = '●';
    span.id = 'bonusStamp' + i;
    container.appendChild(span);
  });
}

function startBonusPlay() {
  state.bonusPlayed = true;
  Sound.stamp('success');
  document.getElementById('bonusIntro').style.display = 'none';
  document.getElementById('bonusPlay').style.display = 'block';
  state.bonusCurrentQ = 0;
  state.bonusCorrect = 0;
  state.bonusWrong = 0;
  state.bonusScore = 0;
  initBonusStamps();
  loadBonusQuestion(0);
  saveState();
}

function skipBonus() {
  Sound.penTap();
  // مفيش لعب مخاطرة قبل كده = صفر نقاط مخاطرة طبيعي
  // لعبها قبل كده (استكمال أو إعادة) = بنحتفظ بالنتيجة بدل ما نمسحها بالغلط
  if (!state.bonusPlayed) state.bonusScore = 0;
  saveState();
  goToCertificate();
}

function loadBonusQuestion(index) {
  if (index >= bonusQuestions.length) {
    endBonusRound();
    return;
  }
  state.bonusCurrentQ = index;
  const q = bonusQuestions[index];

  const card = document.getElementById('bonusCard');
  card.classList.remove('card-slide-in');
  void card.offsetWidth;
  card.classList.add('card-slide-in');
  Sound.paperRustle();

  const bonusQText = document.getElementById('bonusQText');
  bonusQText.textContent = q.text;
  inkSettle(bonusQText);
  const bonusScoreInd = document.getElementById('bonusScoreInd');
  bonusScoreInd.textContent = state.bonusScore;

  createOptionButtons(document.getElementById('bonusOpts'), q.options, i => selectBonusAnswer(i));

  const stamp = document.getElementById('bonusStamp');
  stamp.className = 'stamp-overlay';
  stamp.textContent = '';
  startBonusTimer();
}

let bonusTimerInterval = null;
let bonusTimeLeft = 15;
let bonusQuestionTime = 15;

function startBonusTimer() {
  clearInterval(bonusTimerInterval);
  // وقت السؤال في جولة المخاطرة = زمنه الأصلي من حقل time (زي المراحل بالظبط)
  const bq = bonusQuestions[state.bonusCurrentQ];
  bonusQuestionTime = (bq && bq.time) ? bq.time : 15;
  bonusTimeLeft = bonusQuestionTime;
  updateBonusTimerDisplay();
  bonusTimerInterval = setInterval(() => {
    bonusTimeLeft--;
    updateBonusTimerDisplay();
    if (bonusTimeLeft <= 3 && bonusTimeLeft > 0) Sound.tick();
    if (bonusTimeLeft <= 0) {
      clearInterval(bonusTimerInterval);
      handleBonusTimeout();
    }
  }, 1000);
}

// عداد جولة المخاطرة بين على الشاشة — نفس شريط التلتات بتاع المراحل
function updateBonusTimerDisplay() {
  const el = document.getElementById('bonusTime');
  if (!el) return;
  el.textContent = formatTimeLeft(Math.max(0, bonusTimeLeft));
  const pct = Math.min(1, Math.max(0, bonusTimeLeft / bonusQuestionTime));
  el.classList.remove('zone-fast', 'zone-mid', 'zone-slow');
  el.classList.add(timeZoneClass(pct));
}

function handleBonusTimeout() {
  state.bonusWrong++;
  state.bonusScore -= GAME_POINTS.bonusPenalty;
  const q = bonusQuestions[state.bonusCurrentQ];

  const stampEl = document.getElementById('bonusStamp' + state.bonusCurrentQ);
  stampEl.classList.add('done', 'wrong-stamp');

  const btns = document.querySelectorAll('#bonusOpts .option-btn');
  btns.forEach((b, i) => {
    b.disabled = true;
    if (i === q.correct) b.classList.add('correct');
  });

  showStampOn('bonusStamp', 'error', 'غلط');
  Sound.stamp('error');
  showFloatPoints('-' + GAME_POINTS.bonusPenalty, '', document.getElementById('bonusCard'));
  updateBonusScoreDisplay('red');
  setTimeout(() => advanceCard('bonusCard', () => loadBonusQuestion(state.bonusCurrentQ + 1)), 1500);
}

function selectBonusAnswer(index) {
  clearInterval(bonusTimerInterval);
  const q = bonusQuestions[state.bonusCurrentQ];
  const btns = document.querySelectorAll('#bonusOpts .option-btn');
  const isCorrect = index === q.correct;

  btns.forEach(b => b.disabled = true);

  if (isCorrect) {
    state.bonusCorrect++;
    state.bonusScore += GAME_POINTS.bonusCorrect;
    btns[index].classList.add('correct');
    showStampOn('bonusStamp', 'success', 'صح');
    Sound.correct();
    showFloatPoints('+' + GAME_POINTS.bonusCorrect, '', document.getElementById('bonusCard'));
    document.getElementById('bonusStamp' + state.bonusCurrentQ).classList.add('done', 'correct-stamp');
  } else {
    state.bonusWrong++;
    state.bonusScore -= GAME_POINTS.bonusPenalty;
    btns[index].classList.add('wrong');
    btns[q.correct].classList.add('correct');
    showStampOn('bonusStamp', 'error', 'غلط');
    Sound.wrong();
    showFloatPoints('-' + GAME_POINTS.bonusPenalty, '', document.getElementById('bonusCard'));
    document.getElementById('bonusStamp' + state.bonusCurrentQ).classList.add('done', 'wrong-stamp');
    
    const card = document.getElementById('bonusCard');
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 400);
  }

  Sound.penTap();
  updateBonusScoreDisplay(isCorrect ? 'green' : 'red');
  setTimeout(() => advanceCard('bonusCard', () => loadBonusQuestion(state.bonusCurrentQ + 1)), 1500);
}

function updateBonusScoreDisplay(color) {
  const ind = document.getElementById('bonusScoreInd');
  ind.textContent = state.bonusScore;
  ind.classList.remove('pulse-green', 'pulse-red');
  void ind.offsetWidth;
  ind.classList.add(color === 'green' ? 'pulse-green' : 'pulse-red');
}

function endBonusRound() {
  clearInterval(bonusTimerInterval);
  document.getElementById('bonusPlay').style.display = 'none';
  document.getElementById('bonusEnd').style.display = 'block';
  animateCounter('bonusFinalScore', state.bonusScore, 800);
  const wrap = document.getElementById('bonusFinalStampWrap');
  if (state.bonusScore > 0) {
    wrap.innerHTML = '<div class="bonus-final-stamp accepted">مقبول</div>';
  } else {
    wrap.innerHTML = '<div class="bonus-final-stamp rejected">مرفوض</div>';
  }

  // الاجابات التفصيلية لتحدي العباقرة بتظهر لوحدها آخر القسم
  // (لو اللاعب مسرحع وضغط شوف الكأس قبلها — منظهرهاش على شاشة الكأس)
  setTimeout(() => {
    const bonusScreen = document.getElementById('screenBonus');
    const endPanel = document.getElementById('bonusEnd');
    if (bonusScreen.classList.contains('active') && endPanel.style.display !== 'none') {
      openGeniusExplanations(null);
    }
  }, 1100);
}

// ==================== DYNAMIC EVALUATION SYSTEM ====================
// EVAL_PHRASES مستخرج إلى data/questions.js

function getEvaluationData(playerScore, maxPossibleScore) {
  let percentage = (playerScore / maxPossibleScore) * 100;
  if (percentage < 0) percentage = 0;
  if (percentage > 100) percentage = 100;

  let tier = '';
  let stampConfig = {};

  if (percentage >= 90) {
    tier = 'excellent';
    stampConfig = { text: 'امتياز', shapeClass: 'stamp-excellent' };
  } else if (percentage >= 75) {
    tier = 'vgood';
    stampConfig = { text: 'جيد جدًا', shapeClass: 'stamp-vgood' };
  } else if (percentage >= 50) {
    tier = 'acceptable';
    stampConfig = { text: 'مقبول', shapeClass: 'stamp-acceptable' };
  } else if (percentage >= 25) {
    tier = 'weak';
    stampConfig = { text: 'ضعيف', shapeClass: 'stamp-weak' };
  } else {
    tier = 'rejected';
    stampConfig = { text: 'مرفوض', shapeClass: 'stamp-rejected' };
  }

  const phrases = EVAL_PHRASES[tier];
  const phrase = phrases[Math.floor(Math.random() * phrases.length)];

  return { percentage, tier, stampConfig, phrase };
}

// ==================== CERTIFICATE ====================
function goToCertificate() {
  Sound.fanfare();
  state.totalScore = state.mainScore + state.bonusScore;
  switchScreen('screenBonus', 'screenCert');
  setTimeout(() => renderCertificate(), 400);
}

function getMaxPossibleScore() {
  let s = mainQuestions.length * GAME_POINTS.mainFast;
  if (state.bonusPlayed) s += bonusQuestions.length * GAME_POINTS.bonusCorrect;
  return s;
}

function renderCertificate() {
  Sound.unroll();
  const container = document.getElementById('certContainer');
  container.classList.add('unroll');

  const certName = document.getElementById('certName');
  certName.textContent = state.playerName;

  // Signature on certificate
  const certSig = document.getElementById('certSig');
  if (state.playerSignature) {
    certSig.src = state.playerSignature;
    certSig.style.display = 'block';
  } else {
    certSig.style.display = 'none';
  }

  if (state.playerPhoto) {
    const slot = document.getElementById('certPhotoSlot');
    slot.innerHTML = `<img src="${escapeHtml(state.playerPhoto)}" alt="صورة اللاعب"><input type="file" id="certPhotoInput" accept="image/*" style="display:none">`;
  }

  let maxPossibleScore = getMaxPossibleScore();

  const evalData = getEvaluationData(state.totalScore, maxPossibleScore);

  // Percentage display
  const certPercent = document.getElementById('certPercent');
  certPercent.textContent = Math.round(evalData.percentage) + '%';

  const certPhrase = document.getElementById('certPhrase');
  certPhrase.textContent = evalData.phrase;

  const stampEl = document.getElementById('certStamp');
  stampEl.className = 'cert-stamp ' + evalData.stampConfig.shapeClass;
  stampEl.textContent = evalData.stampConfig.text;
  stampEl.style.animation = 'none';
  void stampEl.offsetWidth;
  stampEl.style.animation = '';

  animateCounter('certScoreNum', state.totalScore, 1200);

  const badges = calculateBadges(evalData.percentage);
  const row = document.getElementById('badgesRow');
  row.innerHTML = '';
  badges.forEach((badge, i) => {
    const el = document.createElement('span');
    el.className = 'badge';
    el.textContent = badge;
    el.style.animationDelay = (1.8 + i * 0.2) + 's';
    row.appendChild(el);
  });

  // ===== Egyptian Touches (Prompt 6) =====
  
  // 1. دمغة رسمية — official seal with symbolic number
  const damgha = document.getElementById('certDamgha');
  if (damgha) {
    const damghaNum = String(Math.floor(state.totalScore * 1.7 + 42)).slice(0, 3);
    damgha.textContent = damghaNum;
  }
  
  // 2. Signature style — add rotation and wavy underline
  certName.classList.add('signed');
  
  // 3. رقم مرجعي رسمي — official reference number
  const certRefEl = document.getElementById('certRefNumber');
  if (certRefEl) {
    if (!state.certRefId) {
      const yr = new Date().getFullYear();
      const rn = String(Math.floor(Math.random() * 900) + 100);
      state.certRefId = yr + '/' + rn;
    }
    certRefEl.textContent = 'رقم المرحلة: ' + state.certRefId;
  }

  // 3.5 الريكورد المحلي — المقارنة بأحسن نتيجة على الجهاز بتتم أول ما الكأس تظهر
  const recordLine = document.getElementById('certRecordLine');
  if (recordLine) {
    const rec = updateRecord(state.totalScore, state.playerName, state.playerAvatar);
    recordLine.textContent = rec.isNew
      ? '🏆 ريكورد جديد على الجهاز ده — ' + state.totalScore + ' نقطة!'
      : '🏆 الريكورد لسه ثابت: ' + rec.best.score + ' نقطة (' + rec.best.name + ')';
  }

  // 3.6 قيد في سجل اللاعبين — لحظة الكأس = الجولة اكتملت = الدخلة اتحسبت
  // من هنا شاشة الدخول بتقفل للاسم ده لحد ما جولة أسئلة جديدة تبدأ
  registerPlayerOnce(state.playerName);
  
  // 4. Circular stamp with Arabic text (enhance cert-stamp)
  enhanceCertStamp(stampEl);
  
  // ===== المرفقات (Prompt 5) =====
  renderEnclosures();
  
  // Enable share/download buttons only after all animations complete
  enableCertButtonsWhenReady();
}

// Cert-specific photo upload — بنفس ضغط الصورة عشان الحفظ ما يبوظش (نفس سيناريو الدخلة)
document.addEventListener('change', function(e) {
  if (e.target && e.target.id === 'certPhotoInput') {
    const file = e.target.files[0];
    if (!file) return;
    compressImageFile(file, function(dataUrl) {
      state.playerPhoto = dataUrl;
      const slot = document.getElementById('certPhotoSlot');
      slot.innerHTML = `<img src="${dataUrl}" alt="صورة اللاعب"><input type="file" id="certPhotoInput" accept="image/*" style="display:none">`;
    }, showPhotoError);
    e.target.value = '';
  }
});

function calculateBadges(pct) {
  const badges = [];
  const avgTime = state.answerTimes.length > 0
    ? state.answerTimes.reduce((a, b) => a + b, 0) / state.answerTimes.length
    : 999;
  if (avgTime < 5) badges.push('● سريع البديهة');
  if (state.correctCount >= 4) badges.push('◆ عبقري الألغاز');
  if (state.maxStreak >= 3) badges.push('★ ما وقفش');
  if (pct >= 90) badges.push('★ سلطان الأتاري');
  if (state.bonusScore > 0) badges.push('◆ جولة المخاطرة');
  return badges;
}

function animateCounter(elementId, target, duration) {
  const el = document.getElementById(elementId);
  const start = 0;
  const startTime = Date.now();
  function update() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (target - start) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  update();
}

// ==================== SHARE & DOWNLOAD ====================

function shareCert() {
  Sound.penTap();
  let maxPossibleScore = getMaxPossibleScore();
  const evalData = getEvaluationData(state.totalScore, maxPossibleScore);
  const text = `سلطان الأتاري ★ ${state.playerName} حصد ${state.totalScore} نقطة (${Math.round(evalData.percentage)}%) — ${evalData.stampConfig.text} ◆`;
  // سقاطة نصية موحّدة — بتستخدم لو المتصفح مش داعم أو فشل رسم الصورة
  function shareTextFallback() {
    if (navigator.share) {
      navigator.share({ title: 'سلطان الأتاري', text }).catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => alert('تم النسخ!')).catch(() => alert(text));
    } else {
      alert(text);
    }
  }
  if (navigator.share && navigator.canShare) {
    captureCertificate(canvas => {
      canvas.toBlob(blob => {
        // لو فشل تحويل الكأس لصورة (blob فاضي) — منشاركش ملف بايظ، نص الكأس أحسن
        if (!blob) { shareTextFallback(); return; }
        const file = new File([blob], 'sultan-atari-cup.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ title: 'سلطان الأتاري', text, files: [file] }).catch(shareTextFallback);
        } else {
          navigator.share({ title: 'سلطان الأتاري', text }).catch(() => {});
        }
      }, 'image/png');
    });
  } else {
    shareTextFallback();
  }
}

/**
 * Wait for a specific image inside the certificate to fully load.
 * Returns a Promise that resolves when img.complete === true.
 */
function waitForCertPhoto() {
  return new Promise(resolve => {
    const img = document.querySelector('#certPhotoSlot img');
    if (!img || img.complete) { resolve(); return; }
    img.onload = resolve;
    img.onerror = resolve; // proceed even if broken
  });
}

/**
 * Wait for the JS score counter animation to finish.
 * The counter is driven by requestAnimationFrame and takes ~1200ms.
 */
function waitForCounter() {
  return new Promise(resolve => {
    const el = document.getElementById('certScoreNum');
    const targetVal = String(state.totalScore);
    // Check if already at final value
    if (el && el.textContent === targetVal) { resolve(); return; }
    // Poll until the counter reaches its final value (max 3s safety)
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 100;
      if ((el && el.textContent === targetVal) || elapsed > 3000) {
        clearInterval(interval);
        // Force final value
        if (el) el.textContent = targetVal;
        resolve();
      }
    }, 100);
  });
}

function getMaxCertAnimTime() {
  // Safety buffer: wait 3s for all CSS animations + JS counter to complete
  return 3000;
}

/**
 * راسم الكأس على Canvas مباشرة — بديل html2canvas بالكامل.
 * ليه؟ html2canvas كان بيبوظ الحروف العربية (بيفك التشابك) وبيقوي
 * زخرفة الشبكة التقاطعية (opacity override في النسخة المستنسخة).
 * fillText هنا بيستخدم محرك نصوص المتصفح نفسه فالعربية تطلع متصلة
 * صح 100%، والنتيجة ورقة نضيفة من غير أي شبكة.
 */
function drawCertificateCanvas() {
  return new Promise((resolve, reject) => {
    const W = 1240, H = 880, S = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * S;
    canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    ctx.scale(S, S);
    ctx.textAlign = 'center';
    try { ctx.direction = 'rtl'; } catch (e) {}

    const INK = '#EAF4FF', AMBER = '#FFE600', PURPLE = '#B45CFF',
          SUCCESS = '#22FF88', ERROR = '#FF3B5C', BURNT = '#FF9E3D';
    const PAPER_SOFT = '#11112B';
    const DISPLAY = '"Baloo Bhaijaan 2","Aref Ruqaa",serif';
    const BODY = '"Cairo",sans-serif';

    // ===== قراءة بيانات الكأس الجاهزة من الـ DOM (بعد اكتمال الأنيميشن) =====
    const textOf = function (id) { const el = document.getElementById(id); return el ? el.textContent : ''; };
    const stampEl = document.getElementById('certStamp');
    const stampClass = stampEl ? stampEl.className : '';
    const stampText = stampEl ? stampEl.textContent.trim() : '';
    const tierColor = stampClass.indexOf('stamp-excellent') > -1 ? AMBER
                    : stampClass.indexOf('stamp-vgood') > -1 ? SUCCESS
                    : stampClass.indexOf('stamp-acceptable') > -1 ? INK
                    : stampClass.indexOf('stamp-weak') > -1 ? BURNT : ERROR;
    const circleStamp = stampClass.indexOf('stamp-excellent') > -1 || stampClass.indexOf('stamp-vgood') > -1;
    const excellentStamp = stampClass.indexOf('stamp-excellent') > -1;
    const dashedStamp = stampClass.indexOf('stamp-weak') > -1;
    const rejectedStamp = stampClass.indexOf('stamp-rejected') > -1;
    const badges = Array.prototype.map.call(document.querySelectorAll('#badgesRow .badge'), function (b) { return b.textContent.trim(); });
    const refText = textOf('certRefNumber');
    const damghaNum = textOf('certDamgha');
    const encSec = document.getElementById('enclosuresSection');
    const encCount = document.querySelectorAll('#enclosuresRow > *').length;
    const sigEl = document.getElementById('certSig');
    const photoEl = document.querySelector('#certPhotoSlot img');

    const loadImg = function (src) {
      return new Promise(function (res) {
        if (!src) { res(null); return; }
        const im = new Image();
        im.onload = function () { res(im); };
        im.onerror = function () { res(null); };
        im.src = src;
      });
    };

    Promise.all([
      photoEl ? loadImg(photoEl.src) : Promise.resolve(null),
      (sigEl && sigEl.style.display !== 'none' && sigEl.src) ? loadImg(sigEl.src) : Promise.resolve(null)
    ]).then(function (inputs) {
      try {
        const photo = inputs[0], sig = inputs[1];

        // ===== الخلفية الداكنة + شبكة بكسل خفيفة (Task 28 أركيد) =====
        ctx.fillStyle = PAPER_SOFT;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,.045)';
        for (let gx = 0; gx < W; gx += 23) { ctx.fillRect(gx, 0, 3, H); }
        for (let gy = 0; gy < H; gy += 23) { ctx.fillRect(0, gy, W, 3); }

        // ===== البرواز المزدوج (سيان نيون + بنفسجي) بأركان حادة =====
        ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 4;
        rr(ctx, 14.5, 14.5, W - 29, H - 29, 0); ctx.stroke();
        ctx.strokeStyle = PURPLE; ctx.lineWidth = 2;
        rr(ctx, 26.5, 26.5, W - 53, H - 53, 0); ctx.stroke();
        ctx.fillStyle = '#00E5FF';
        [[26.5, 26.5], [W - 26.5, 26.5], [26.5, H - 26.5], [W - 26.5, H - 26.5]]
          .forEach(function (c) { diamond(ctx, c[0], c[1], 6); });

        const CX = 495;   // مركز عمود النصوص
        const RCX = 1042; // مركز عمود الصورة (يمين في الـRTL)

        // ===== الصورة الشخصية =====
        ctx.save();
        rr(ctx, RCX - 88, 78, 176, 200, 14);
        ctx.fillStyle = 'rgba(23,23,53,.9)';
        ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        if (photo) {
          ctx.save();
          rr(ctx, RCX - 85, 81, 170, 194, 11); ctx.clip();
          const pr2 = photo.width / photo.height, boxR = 170 / 194;
          let pw, ph;
          if (pr2 > boxR) { ph = 194; pw = 194 * pr2; } else { pw = 170; ph = 170 / pr2; }
          ctx.drawImage(photo, RCX - pw / 2, 81 + (194 - ph) / 2, pw, ph);
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(154,163,208,.35)';
          ctx.font = '700 64px ' + BODY;
          ctx.fillText('\u25CF', RCX, 196);
        }
        ctx.restore();

        // ===== التوقيع تحت الصورة =====
        if (sig) {
          const maxW = 170, maxH = 72;
          const sr = sig.width / sig.height;
          let sw = maxW, sh = maxW / sr;
          if (sh > maxH) { sh = maxH; sw = maxH * sr; }
          ctx.drawImage(sig, RCX - sw / 2, 292 + (maxH - sh) / 2, sw, sh);
          ctx.strokeStyle = 'rgba(154,163,208,.5)'; ctx.lineWidth = 1.5;
          line(ctx, RCX - 85, 380, RCX + 85, 380);
        }

        // ===== ختم السلطان =====
        if (damghaNum) {
          ctx.strokeStyle = AMBER; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(RCX, 466, 50, 0, Math.PI * 2); ctx.stroke();
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(RCX, 466, 43, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = AMBER;
          ctx.font = '800 32px ' + DISPLAY;
          ctx.fillText(damghaNum, RCX, 477);
          ctx.fillStyle = 'rgba(154,163,208,.6)';
          ctx.font = '600 13px ' + BODY;
          ctx.fillText('ختم السلطان', RCX, 540);
        }

        // ===== عمود النصوص =====
        // 1) السطر التمهيدي
        ctx.fillStyle = 'rgba(154,163,208,.75)';
        ctx.font = '600 27px ' + BODY;
        ctx.fillText('كأس الأتاري ★', CX, 100);

        // 2) العنوان الكبير
        ctx.fillStyle = INK;
        ctx.font = '800 50px ' + DISPLAY;
        ctx.fillText('نتائج الجولة النهائية', CX, 160);

        // فاصل دهبي بمعين
        ctx.strokeStyle = AMBER; ctx.lineWidth = 2.5;
        line(ctx, CX - 80, 186, CX + 80, 186);
        ctx.fillStyle = AMBER;
        diamond(ctx, CX, 186, 5);

        // 3) الاسم بتوقيع مائل وخط موجي
        const playerName = state.playerName || 'لاعب مجهول';
        ctx.save();
        ctx.translate(CX, 240);
        ctx.rotate(-1.5 * Math.PI / 180);
        ctx.fillStyle = BURNT;
        ctx.font = '700 44px ' + DISPLAY;
        ctx.fillText(playerName, 0, 0);
        const nw = ctx.measureText(playerName).width;
        ctx.strokeStyle = AMBER; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = -nw / 2; x < nw / 2 - 7; x += 14) {
          ctx.moveTo(x, 12);
          ctx.quadraticCurveTo(x + 3.5, 17, x + 7, 12);
          ctx.quadraticCurveTo(x + 10.5, 7, x + 14, 12);
        }
        ctx.stroke();
        ctx.restore();

        // 4) النتيجة الكبيرة
        const scoreNum = textOf('certScoreNum') || String(state.totalScore);
        ctx.fillStyle = AMBER;
        ctx.font = '800 72px ' + DISPLAY;
        ctx.fillText(scoreNum, CX, 332);
        ctx.fillStyle = 'rgba(154,163,208,.7)';
        ctx.font = '600 24px ' + BODY;
        ctx.fillText('نقطة', CX, 366);
        const pct = textOf('certPercent');
        if (pct) {
          ctx.fillStyle = INK;
          ctx.font = '700 28px ' + BODY;
          ctx.fillText(pct, CX, 404);
        }

        // 5) عبارة التقييم (بتتقسم أسطر لو طويلة)
        const phrase = textOf('certPhrase');
        if (phrase) {
          ctx.fillStyle = 'rgba(154,163,208,.85)';
          ctx.font = '500 23px ' + BODY;
          const lines = wrapText(ctx, phrase, 830).slice(0, 2);
          lines.forEach(function (ln, i) { ctx.fillText(ln, CX, 442 + i * 34); });
        }

        // 6) ختم التقدير — بنفس شكل الختم الحقيقي (دائري/مستطيل + شطب للمرفوض)
        if (stampText) {
          ctx.save();
          ctx.translate(CX, 545);
          ctx.rotate(-7 * Math.PI / 180);
          ctx.strokeStyle = tierColor;
          ctx.fillStyle = tierColor;
          if (circleStamp) {
            const R = excellentStamp ? 57 : 54;
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
            if (excellentStamp) {
              ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
              ctx.beginPath(); ctx.arc(0, 0, R + 7, 0, Math.PI * 2); ctx.stroke();
              ctx.setLineDash([]);
              ctx.beginPath(); ctx.arc(0, 0, R - 7, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.font = '700 30px ' + DISPLAY;
            ctx.fillText(stampText, 0, 11);
          } else {
            ctx.lineWidth = 3;
            if (dashedStamp) ctx.setLineDash([7, 5]);
            rr(ctx, -68, -34, 136, 68, 6); ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = '700 30px ' + DISPLAY;
            ctx.fillText(stampText, 0, 11);
            if (rejectedStamp) {
              ctx.strokeStyle = ERROR; ctx.lineWidth = 3.5;
              line(ctx, -82, 0, 82, 0);
            }
          }
          ctx.restore();
        }

        // 7) الأوسمة (صف أو اتنين حسب العرض)
        let y = 612;
        if (badges.length) {
          ctx.font = '600 17px ' + BODY;
          const pillH = 34, gap = 10, maxRowW = 850;
          const rows = [[]];
          let acc = 0;
          badges.forEach(function (b) {
            const w = ctx.measureText(b).width + 28;
            if (acc + w > maxRowW && rows[rows.length - 1].length) { rows.push([]); acc = 0; }
            rows[rows.length - 1].push([b, w]);
            acc += w + gap;
          });
          rows.forEach(function (row) {
            const rowW = row.reduce(function (s, p) { return s + p[1] + gap; }, -gap);
            let x = CX - rowW / 2;
            row.forEach(function (p) {
              rr(ctx, x, y - pillH + 8, p[1], pillH, pillH / 2);
              ctx.fillStyle = 'rgba(29,29,69,.92)'; ctx.fill();
              ctx.strokeStyle = 'rgba(154,163,208,.25)'; ctx.lineWidth = 1; ctx.stroke();
              ctx.fillStyle = INK;
              ctx.fillText(p[0], x + p[1] / 2, y + 11);
              x += p[1] + gap;
            });
            y += pillH + 8;
          });
        }

        // 8) سطر المرفقات
        if (encSec && encSec.style.display !== 'none' && encCount > 0) {
          ctx.fillStyle = 'rgba(154,163,208,.7)';
          ctx.font = '600 21px ' + BODY;
          ctx.fillText('الأوسمة: ' + encCount + (encCount === 1 ? ' وسام' : ' أوسمة'), CX, y + 24);
          y += 36;
        }

        // 9) الرقم المرجعي
        if (refText) {
          ctx.fillStyle = 'rgba(154,163,208,.55)';
          ctx.font = '500 19px ' + BODY;
          ctx.fillText(refText, CX, H - 52);
        }

        resolve(canvas);
      } catch (err) { reject(err); }
    }).catch(reject);
  });
}

// ===== أدوات رسم مساعدة =====
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function diamond(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y);
  ctx.closePath(); ctx.fill();
}
function wrapText(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  words.forEach(function (w) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = t;
  });
  if (cur) lines.push(cur);
  return lines;
}

/**
 * نقطة الالتقاط الموحدة (تحميل + مشاركة) — نفس واجهة النسخة القديمة
 * بس من غير html2canvas: بتستنى الخطوط والعداد والصورة وبعدين ترسم.
 */
function captureCertificate(callback) {
  const shareBtn = document.querySelector('.cert-btn-share');
  const downloadBtn = document.querySelector('.cert-btn-download');
  shareBtn.disabled = true;
  downloadBtn.disabled = true;
  const origShare = shareBtn.textContent;
  const origDownload = downloadBtn.textContent;
  shareBtn.textContent = 'بيتجهز...';
  downloadBtn.textContent = 'بيتجهز...';

  function resetBtns() {
    shareBtn.disabled = false;
    downloadBtn.disabled = false;
    shareBtn.textContent = origShare;
    downloadBtn.textContent = origDownload;
  }

  document.fonts.ready
    .then(function () { return waitForCertPhoto(); })
    .then(function () { return waitForCounter(); })
    .then(function () { return drawCertificateCanvas(); })
    .then(function (canvas) { resetBtns(); callback(canvas); })
    .catch(function (err) {
      console.error('Capture error:', err);
      resetBtns();
    });
}

// زرار الرجوع للصالة بعد استلام الكأس
function returnToDeskFromCert() {
  Sound.paperRustle();
  switchScreen('screenCert', 'screenDesk');
  setTimeout(function () { showDeskHub(); }, 400);
}

function downloadCert() {
  Sound.penTap();
  captureCertificate(canvas => {
    const link = document.createElement('a');
    link.download = 'sultan-atari-cup.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

/**
 * After renderCertificate(), enable buttons only after all animations finish.
 * This implements requirement #2: track animation end times.
 */
function enableCertButtonsWhenReady() {
  const shareBtn = document.querySelector('.cert-btn-share');
  const downloadBtn = document.querySelector('.cert-btn-download');

  // Disable until animations finish
  shareBtn.disabled = true;
  downloadBtn.disabled = true;

  // Wait for fonts first, then CSS animations, then JS counter
  document.fonts.ready.then(() => {
    const waitMs = getMaxCertAnimTime();
    setTimeout(() => {
      // Also wait for the JS counter to finish
      waitForCounter().then(() => {
        shareBtn.disabled = false;
        downloadBtn.disabled = false;
      });
    }, waitMs);
  });
}

// ==================== PROMPT 5: ORDER & TEXT QUESTION TYPES ====================

state.orderItems = []; // current order of items (indices into correctOrder)

function renderOrderQuestion(q) {
  const grid = document.getElementById('orderGrid');
  grid.innerHTML = '';
  // خلط بنسخة جديدة — ولو الخلط طلع بالترتيب الصح بالصدفة بنقلبه تاني
  // (سؤال بيفتح وهو محلول جاهز = مفيش — Task 31)
  state.orderItems = shuffledOrderPure(q.correctOrder);
  renderOrderCards();
}

function renderOrderCards() {
  const grid = document.getElementById('orderGrid');
  grid.innerHTML = '';
  state.orderItems.forEach((text, i) => {
    const card = document.createElement('div');
    card.className = 'order-card';

    const arrowsDiv = document.createElement('div');
    arrowsDiv.className = 'order-arrows';
    const upBtn = document.createElement('button');
    upBtn.textContent = '▲';
    upBtn.disabled = (i === 0);
    upBtn.onclick = () => moveOrderCard(i, -1);
    const downBtn = document.createElement('button');
    downBtn.textContent = '▼';
    downBtn.disabled = (i === state.orderItems.length - 1);
    downBtn.onclick = () => moveOrderCard(i, 1);
    arrowsDiv.appendChild(upBtn);
    arrowsDiv.appendChild(downBtn);

    const textSpan = document.createElement('span');
    textSpan.className = 'order-text';
    textSpan.textContent = text;

    const posSpan = document.createElement('span');
    posSpan.className = 'order-pos';
    posSpan.textContent = (i + 1);

    card.appendChild(arrowsDiv);
    card.appendChild(textSpan);
    card.appendChild(posSpan);
    grid.appendChild(card);
  });
}

function moveOrderCard(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.orderItems.length) return;
  [state.orderItems[index], state.orderItems[newIndex]] = [state.orderItems[newIndex], state.orderItems[index]];
  Sound.penTap();
  renderOrderCards();
}

function submitOrderAnswer() {
  closeLampConfirm(); // لوحة اللمبة متتسابش مفتوحة في سؤال الترتيب بعد الإرسال
  clearInterval(timerInterval);
  const q = currentDocQuestions[currentDocQuestionIdx];

  // Hide submit button
  document.getElementById('orderSubmitBtn').style.display = 'none';

  // Check each card against correctOrder
  const cards = document.querySelectorAll('#orderGrid .order-card');
  let correctCount = 0;
  state.orderItems.forEach((text, i) => {
    if (text === q.correctOrder[i]) {
      correctCount++;
      cards[i].classList.add('order-correct');
    } else {
      cards[i].classList.add('order-wrong');
      // Show correct position number
      const posEl = cards[i].querySelector('.order-pos');
      if (posEl) {
        const correctIdx = q.correctOrder.indexOf(text);
        posEl.textContent = (correctIdx + 1);
      }
    }
    // Disable arrows
    const arrows = cards[i].querySelectorAll('.order-arrows button');
    arrows.forEach(b => b.disabled = true);
  });

  if (correctCount === q.correctOrder.length) {
    const fullPts = speedTierPoints();
    finishDocAnswer(true, fullPts, speedTierTag(fullPts));
  } else if (correctCount > 0) {
    const base = speedTierPoints();
    const points = Math.round(base * (correctCount / q.correctOrder.length));
    finishDocAnswer(true, points, speedTierTag(base));
  } else {
    finishDocAnswer(false, 0);
  }
}

function renderTextQuestion() {
  const input = document.getElementById('textAnswerInput');
  input.value = '';
  input.disabled = false;
  setTimeout(() => input.focus(), 300);
}

function submitTextAnswer() {
  const input = document.getElementById('textAnswerInput');
  if (!input.value.trim()) {
    // Brief shake to indicate empty input
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 400);
    return;
  }
  closeLampConfirm(); // لوحة اللمبة متتسابش مفتوحة بعد إرسال الإجابة
  clearInterval(timerInterval);
  const q = currentDocQuestions[currentDocQuestionIdx];

  // Hide text input
  document.getElementById('textAnswerWrap').style.display = 'none';

  const isCorrect = checkTextAnswer(input.value.trim(), q.acceptableAnswers);

  if (isCorrect) {
    const pts = speedTierPoints();
    finishDocAnswer(true, pts, speedTierTag(pts));
  } else {
    finishDocAnswer(false, 0);
  }
}

function checkTextAnswer(userAnswer, acceptableAnswers) {
  if (!userAnswer || !Array.isArray(acceptableAnswers)) return false;
  const normalized = userAnswer.trim().toLowerCase();
  for (const ans of acceptableAnswers) {
    const normAns = ans.trim().toLowerCase();
    if (normalized === normAns) return true;
    // Levenshtein tolerance for words > 4 chars
    if (normAns.length > 4 && normalized.length > 4) {
      if (levenshtein(normalized, normAns) <= 1) return true;
    }
  }
  return false;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i-1] === b[j-1]) {
        dp[i][j] = dp[i-1][j-1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
      }
    }
  }
  return dp[m][n];
}

// ==================== الريكورد المحلي (ماكينة واحدة = ريكورد واحد — Task 33) ====================
// القاعة اتلغت: أصحابك بيتبادلوا الكأس في الجروبات — دي المنافسة الحقيقية.
// زي ماكينات الأتاري الحقيقية: الجهاز الواحد بيفتخر بريكورد واحد بس.
const RECORD_KEY = 'atariRecordScore';

// نقية للاختبارات: الريكورد بيفضل للأعلى — تعادل أو أقل = القديم يفضل
function recordPure(oldRec, entry) {
  const o = (oldRec && typeof oldRec.score === 'number' && isFinite(oldRec.score)) ? oldRec : null;
  const n = (entry && typeof entry.score === 'number' && isFinite(entry.score)) ? entry : null;
  if (!n) return { best: o, isNew: false };
  if (!o || n.score > o.score) return { best: n, isNew: true };
  return { best: o, isNew: false };
}

function loadRecord() {
  try { return JSON.parse(storeGet(RECORD_KEY) || 'null'); } catch (e) { return null; }
}

function updateRecord(score, name, avatar) {
  const entry = {
    score: score,
    name: normalizeNamePure(name) || 'لاعب مجهول',
    avatar: avatar || '◆',
    date: arabicToday()
  };
  const res = recordPure(loadRecord(), entry);
  storeSet(RECORD_KEY, JSON.stringify(res.best));
  return res;
}

// ==================== شاشة الجذب — سطر الريكورد على الغلاف (Task 29 → 33) ====================
// ستايل ATTRACT MODE: الماكينة الواقفة بتعرض ريكوردها عشان تجذب — سطر واحد بس
function renderAttractMode() {
  const box = document.getElementById('attractRows');
  if (!box) return;
  const rec = loadRecord();
  if (rec && rec.score > 0) {
    box.innerHTML = '<div class="attract-record">'
      + '<span class="at-record-score">' + Number(rec.score) + '</span>'
      + '<span class="at-record-name">' + escapeHtml(rec.name) + '</span>'
      + '</div>';
  } else {
    box.innerHTML = '<div class="attract-empty">مفيش ريكورد على الجهاز ده… كون انت الأول!</div>';
  }
}

function arabicToday() {
  const now = new Date();
  return now.getDate() + ' ' + MONTHS_AR[now.getMonth()] + ' ' + now.getFullYear();
}

// الشهور العربية — مستخدمة في تاريخ كارت الإنجاز والريكورد
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// خلط فيشر-يتس — نسخة جديدة من غير تغيير الأصل (طلقة القناص + ترتيب)
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// خلط ترتيب مش مطابق للأصل — سؤال الترتيب عمره ما بيفتح وهو محلول بالصدفة
// (نقية للاختبارات: تبديل صحيح للعناصر + مضمون مش مطابق للترتيب الصح — Task 31)
function shuffledOrderPure(order) {
  const src = Array.isArray(order) ? order : [];
  if (src.length < 2) return [...src];
  let items = shuffleArray(src);
  let tries = 0;
  const same = () => items.every((v, i) => v === src[i]);
  while (same() && tries < 8) { items = shuffleArray(src); tries++; }
  if (same()) items = [...src.slice(1), src[0]]; // تدوير واحد يكسر التطابق مضمون (عناصر فريدة)
  return items;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// ==================== PROMPT 6: BRIBE POWER-UP ====================

function updateLampButton() {
  const btn = document.getElementById('btnLamp');
  if (!btn) return;
  if (!state.hasBribe || state.mainScore < LAMP_COST) {
    btn.disabled = true;
  } else {
    btn.disabled = false;
  }
}

function useLamp() {
  if (!state.hasBribe) return;
  if (docFeedbackLock) return; // ساحة الإجابة مقفولة — مفيش لمبة تتدفع على سؤال خلصانة (Task 36)
  if (witnessActive) return;
  // حراسة النقاط — الزرار معطّل تحت 15 في الواجهة، وده قفل إضافي لو حصل سباق
  if (state.mainScore < LAMP_COST) return;
  Sound.penTap();
  // Show confirmation overlay
  document.getElementById('lampConfirm').classList.add('visible');
}

function confirmLamp() {
  if (!state.hasBribe) return;
  // Guard: check score is still sufficient (may have changed while dialog was open)
  if (state.mainScore < LAMP_COST) {
    cancelLamp();
    return;
  }
  state.hasBribe = false;
  document.getElementById('btnLamp').disabled = true;
  document.getElementById('lampConfirm').classList.remove('visible');

  // خصم ثمن اللمبة
  state.mainScore -= LAMP_COST;

  // Show hint from current question — صاحب الصالة شعّل اللمبة وورّيك الطريق
  const q = currentDocQuestions[currentDocQuestionIdx];
  if (q.hint) {
    const hintNote = document.getElementById('hintNote');
    hintNote.textContent = '◆ صاحب الصالة همسلك: ' + q.hint;
    hintNote.style.display = '';
  } else {
    const hintNote = document.getElementById('hintNote');
    hintNote.textContent = '◆ صاحب الصالة: معلش يا باشا، السؤال ده مالوش تلميح… اللمبة دي على حسابي 💡';
    hintNote.style.display = '';
  }
  Sound.lampDing();
  updateLampButton();
  saveState();
}

function cancelLamp() {
  closeLampConfirm();
  Sound.penTap();
}

// قفل لوحة تأكيد اللمبة — بتتقفل مع أي نهاية سؤال (إجابة/مهلة) عشان متفضلش
// مفتوحة على سؤال خلصانة والتأكيد بعدها بيحرق اللمبة والنقط على الفاضي
function closeLampConfirm() {
  const el = document.getElementById('lampConfirm');
  if (el) el.classList.remove('visible');
}

// ==================== PROMPT 7: APPEAL SYSTEM ====================

function useAppeal() {
  if (state.appealUsed) return;
  if (docFeedbackLock) return; // ساحة الإجابة مقفولة — الوقت الزايد على سؤال ميت بيتبهدل (Task 36)
  if (witnessActive) return;
  state.appealUsed = true;
  Sound.penTap();

  // تمديد المؤقت — وبتعدها التلتات بتتحسب على الوقت الممتد
  timeLeft += APPEAL_BONUS_TIME;
  updateTimerDisplay();
  updateCandleVisual();
  saveDocTimeSnapshot(); // الثواني الممتدة تتسجل — الاستكمال ياخد بالحق

  // Hide the appeal button
  document.getElementById('appealBtn').style.display = 'none';
  saveState();
}

// ==================== PROMPT 9: MARGIN NOTES ====================

// MARGIN_NOTES مستخرج إلى data/questions.js

const usedMarginNotes = new Set();

function showMarginNote(q) {
  // الحواشي الهامشية على الأسئلة الصعبة بس — 🧠 ذكي (أو أي سؤال متعلّم difficulty: 'hard' مستقبلاً)
  const isHard = q.difficulty === 'hard' || q.levelLabel === '🧠 ذكي';
  if (!isHard) return;
  // 40% chance
  if (Math.random() > 0.4) return;
  
  // Pick a note that hasn't been used — بالفهرس مباشرة (أدق وأسرع من indexOf)
  const availIdx = [];
  for (let i = 0; i < MARGIN_NOTES.length; i++) {
    if (!usedMarginNotes.has(i)) availIdx.push(i);
  }
  if (availIdx.length === 0) return;
  const originalIdx = availIdx[Math.floor(Math.random() * availIdx.length)];
  usedMarginNotes.add(originalIdx);
  const noteText = MARGIN_NOTES[originalIdx];
  
  const marginNote = document.getElementById('marginNote');
  marginNote.textContent = noteText;
  
  // Random rotation between -3 and 3 degrees
  const rot = (Math.random() * 6 - 3).toFixed(1);
  marginNote.style.transform = 'rotate(' + rot + 'deg)';
  
  // Position on random side with varied top offset to avoid overlapping option buttons
  const topOffset = 12 + Math.floor(Math.random() * 30);
  marginNote.style.bottom = topOffset + 'px';
  if (Math.random() > 0.5) {
    marginNote.style.left = 'auto';
    marginNote.style.right = '8px';
  } else {
    marginNote.style.right = 'auto';
    marginNote.style.left = '8px';
  }
  
  marginNote.style.display = '';
}

// ==================== حراسة الموسم (جولة جديدة = تصفير أوتوماتيكي) ====================
// أي تعديل في ملف الأسئلة بيغيّر بصمة المحتوى — ولما البصمة تختلف اللعبة بتصفّر
// الريكورد والحفظ لوحدها وتبلش جولة جديدة. يعني تجديد الأسئلة كل فترة
// محتاج بس تعديل data/questions.js — من غير أي أزرار ولا إعدادات.
const SEASON_KEY = 'diwanSeasonHash';
let seasonJustReset = false;

function computeSeasonHash() {
  const src = JSON.stringify(MAIN_QUESTIONS) + '::' + JSON.stringify(GENIUS_QUESTIONS);
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

(function seasonGuard() {
  const cur = computeSeasonHash();
  const prev = storeGet(SEASON_KEY);
  if (prev === cur) return;
  if (prev === null) { storeSet(SEASON_KEY, cur); return; } // أول تشغيل — من غير تصفير ولا إشعار
  storeSet(SEASON_KEY, cur);
  storeDel(RECORD_KEY);  // الريكورد المحلي — جولة جديدة = منافسة نضيفة على أسئلة جديدة
  storeDel(STORAGE_KEY); // الحفظ القديم — المراحل ترجع فاضية
  storeDel(REG_KEY);     // سجل اللاعبين بيتصفّر برضه — كل جولة = دخلة جديدة للكل
  wipeMemoryBackups();   // Task 34: المارايا الاحتياطية بتنسى الجولة القديمة — وإلا هتقفل جولة جديدة غلط
  clearDocTimeSnapshot();               // أي وقت متجمّع من الجولة القديمة مالوش لازمة
  seasonJustReset = true;
})();

// إشعار "جولة جديدة" — بيظهر مرة واحدة بعد التصفير
function showSeasonNote() {
  if (!seasonJustReset) return;
  seasonJustReset = false;
  const el = document.createElement('div');
  el.className = 'season-note';
  el.innerHTML = '<strong>🔔 جولة جديدة بدأت!</strong><span>الأسئلة اتغيّرت — الريكورد اتصفّر والمراحل رجعت فاضية. بالتوفيق يا بطل ✨</span>';
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 80);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 600);
  }, 5400);
}

// ==================== RESTORE SAVED STATE ON LOAD ====================
(function restoreOnLoad() {
  const reg = getRegisteredName();
  const hasSaved = storeGet(STORAGE_KEY);

  // لاعب متسجل؟ الدخلة اتستهلكت — بيرجع للصالة على طول من غير سؤال الاستكمال
  if (reg) {
    showEntryLocked();
    // Task 34: سد الثغرات — مارايا ناقصة (لاعب قديم أول ترقية) بتتكمل لوحدها
    writeMemoryMirror(buildMemPayload(computeSeasonHash(), reg));
    if (hasSaved) {
      loadState();
      applyMuteIcon();
      if (state.playerName) {
        state.activeSetId = null;
        state.appealUsed = false;
        // الدخلة الواحدة: لو التاب اتقفل وسط سؤال — نفس السؤال بيفتح لوحده (Task 24)
        if (resumeDocFromSnapshot()) return;
        switchScreen('screenEntry', 'screenDesk');
        setTimeout(() => showDeskHub(), 200);
      }
    }
    return;
  }

  // Task 34: مفيش تسجيل محلي؟ المارايا الاحتياطية بتفاوت — لو فاكرة نفس الموسم
  // القفل بيرجع يتركب لوحده، ولو لأ يبقى اللاعب ده جديد بجد
  restoreRegistrationFromBackup().then(function (restored) {
    if (restored) return;
    if (!hasSaved) return;
    if (!confirm('هل تريد استمرار اللعب من حيث توقفت؟')) {
      clearSavedState();
      return;
    }
    loadState();
    // Restore muted icon
    applyMuteIcon();
    // Jump to desk screen directly
    if (state.playerName) {
      state.activeSetId = null;
      state.appealUsed = false;
      // نفس القاعدة لللاعب اللي لسه مسجلش: السؤال الشغال بيرجع يفتح لوحده
      if (resumeDocFromSnapshot()) return;
      switchScreen('screenEntry', 'screenDesk');
      setTimeout(() => showDeskHub(), 200);
    }
  });
})();

renderAttractMode();

// إشعار الجولة الجديدة (لو حصل تصفير موسم)
setTimeout(showSeasonNote, 900);

// Task 34: فحص الوضع بلا ذاكرة — تحذير خفيف بس لو المتصفح مش بيتذكر
setTimeout(memProbe, 400);
