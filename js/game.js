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
  appealPenalty: 10  // عقوبة الغلط/الوقت خلص بعد الاستئناف
};

// ثوابت الخصائص: ثمن شاي الممتحن + الثواني اللي بيضيفها الاستئناف
const BRIBE_COST = 15;
const APPEAL_BONUS_TIME = 10;

// لحظة أول اختيار للاعب — بتتثبت قبل كارت الشاهد عشان وقت التثبيت ما يحاسبش على اللاعب
let answerPickedAt = 0;

// ⚡ نقاط السرعة: التلت بيتحسب على وقت السؤال نفسه
// (لو اللاعب استأنف +10 ثواني — التلت بيتحسب على الوقت الممتد عشان الاستئناف ما يعاقبش مرتين)
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
  isMuted: localStorage.getItem('diwanMuted') === 'true',
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
// لو اللاعب خرج من الملف أو عمل ريفريش، بيرجع يلاقي نفس الثواني المتبقية مش وقت كامل من الأول
const DOC_TIME_KEY = 'diwanDocTime';
// سجل الموظفين: كل موظف ليه دخلة واحدة في الجولة (بيتسجل أول ما الشهادة تتعرض)
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
  try {
    const data = {};
    for (const k of SAVEABLE_KEYS) {
      data[k] = state[k];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return false;
    for (const k of SAVEABLE_KEYS) {
      if (data[k] !== undefined) state[k] = data[k];
    }
    return true;
  } catch (e) {
    return false;
  }
}

function clearSavedState() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(DOC_TIME_KEY);
}

// نقية للاختبارات: توحيد الاسم — مسافات زايدة ومسافات مكررة بتتشال عشان "أحمد " = "أحمد"
function normalizeNamePure(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

// نقية للاختبارات: ثواني الاستكمال — المتبقي المحفوظ مش بيتعدّى وقت السؤال الأصلي
// (لو اتسجل وقت بعد استئناف والاستئناف اتلغى، القفعة بتحمي من وقت زيادة)
function resumeSecondsPure(savedT, questionTime, appealBonus) {
  const s = Number(savedT);
  if (!isFinite(s) || s <= 0) return questionTime;
  return Math.min(s, questionTime + (appealBonus || 0));
}

// كتابة/مسح لحظة المؤقت — بيتكتب كل ثانية والمؤقت شغال، وبيمسح أول ما السؤال يخلص
function saveDocTimeSnapshot() {
  try {
    if (!currentDocSetId || !currentDocQuestions.length) return;
    localStorage.setItem(DOC_TIME_KEY, JSON.stringify({
      setId: currentDocSetId,
      idx: currentDocQuestionIdx,
      t: timeLeft,
      appeal: !!state.appealUsed
    }));
  } catch (e) {}
}

function clearDocTimeSnapshot() {
  try { localStorage.removeItem(DOC_TIME_KEY); } catch (e) {}
}

// استرجاع لحظة المؤقت لو الملف اتفتح تاني على نفس السؤال — جوهر قاعدة تجميد واستكمال
function applyDocTimeSnapshot() {
  try {
    const raw = localStorage.getItem(DOC_TIME_KEY);
    if (!raw) return false;
    const snap = parseDocSnapshotPure(raw);
    if (!snap || snap.setId !== currentDocSetId || snap.idx !== currentDocQuestionIdx) return false;
    const cap = resumeSecondsPure(snap.t, questionTimeLimit(), snap.appeal ? APPEAL_BONUS_TIME : 0);
    timeLeft = cap;
    state.appealUsed = !!snap.appeal;
    clearDocTimeSnapshot();
    return true;
  } catch (e) { return false; }
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

// نقية للاختبارات: فهرس استكمال آمن داخل الملف — بره الحدود = مفيش استكمال (-1)
function resumeIdxPure(idx, len) {
  const i = Math.floor(Number(idx));
  if (!isFinite(i) || i < 0) return -1;
  if (!isFinite(len) || len <= 0) return -1;
  if (i >= len) return -1; // اللقطة بتصفّر أول ما الملف يخلص — فهرس بره الحدود = لقطة قديمة فاسدة
  return i;
}

function getDocTimeSnapshot() {
  try { return parseDocSnapshotPure(localStorage.getItem(DOC_TIME_KEY)); } catch (e) { return null; }
}

// قاعدة الدخلة الواحدة (Task 24): لو التاب اتقفل وسط سؤال — الرجوع بيفتح نفس السؤال
// لوحده من غير لمسة، والمؤقت بيكمل من نفس الثانية (اتجمّد وهو غايب). يعني مفيش
// أي طريق ترجع بيها للمكتب من جوه الملف قبل ما تجاوب.
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
  try { fn(getAudioCtx()); } catch(e) {}
}

const Sound = {
  penTap() {
    playSound(ctx => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 800;
      gain.gain.value = 0.15;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.06);
    });
  },

  // مسحة الفطة — هواء بينضف الإجابات الغلط
  futtaSwoosh() {
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

  // شاي مع الممتحن — دقتين ملعقة على الاستكان
  teaSip() {
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
  }
};

// ==================== MUTE ====================
// الكتم بقى على مستوى الـ AudioContext نفسه (suspend) — بيقطع أي صوت فورًا:
// أجواء + مؤثرات + أصوات الخصائص، ومش بيسيب حاجة تكمّل في الخلفية أبدًا
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
  localStorage.setItem('diwanMuted', state.isMuted);
  applyMuteIcon();
  try {
    if (state.isMuted) {
      if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
    } else {
      // الاستئناف جوه الكليك نفسه — ده اللي بيفتح الصوت على iOS
      getAudioCtx().resume();
    }
  } catch (e) {}
  // مزامنة أجواء المكتب المحيطة مع زرار الكتم
  if (window.Ambience) Ambience.setMuted(state.isMuted);
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
    // زي "شوف شهادتك" بعد الاستعادة: المكتب فضل فعال جنب الشهادة)
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

// ===== منطق الإنجاز: الملفات الفاضية (اللي مستنية أسئلتها من الملفات الجاية) متتحسبش =====
function categoryDone(cat) {
  const active = getActiveSetForCategory(cat);
  if (!active || active.questions.length === 0) return true; // ملف فاضي = مش محلوب عليه
  return state.docsState[active.setId] === 'done';
}

function allDocsDone() {
  return DESK_CATEGORIES.every(categoryDone);
}

// Document states — keyed by setId (e.g. "culture-1")
// state.activeSetId/earnedCards/docCorrectCounts معرّفة في state من الأول

// رقم ملف رسمي بأرقام هندية — لمصة أرشيف مصري
function fileSerial(i) {
  const ar = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
  return 'ملف رقم ' + ar(41 + i * 7) + ' / ' + ar(2026);
}

// ==================== الملفات المرسومة (Task 25) ====================
// وش الملف بقى رسمة SVG حية جوه اللعبة بتندمج مع لوحة المكتب —
// folder-a.png اتشالت (Task 25): كانت صورة كرتون واقعية ملزوقة على رسمة جيبلي
const FOLDER_PALETTES = {
  'cat-culture': { base:'#C08750', dark:'#9A6A3C', flap:'#A9743F', edge:'#7E5430', hi:'#D9A76C' },
  'cat-sport':   { base:'#8CA3BF', dark:'#6D87A6', flap:'#7790AF', edge:'#57708F', hi:'#A8BCD4' },
  'cat-logic':   { base:'#9BB08D', dark:'#7C9470', flap:'#8AA07D', edge:'#5F7755', hi:'#B4C6A6' }
};

function folderArtSVG(cls, i) {
  const P = FOLDER_PALETTES[cls] || FOLDER_PALETTES['cat-culture'];
  const uid = 'f' + i; // معرّفات فريدة لكل ملف — الفلاتر مش بتتشارك
  return '<svg class="folder-art" viewBox="0 0 460 300" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<defs>'
    + '<linearGradient id="' + uid + 'b" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="' + P.hi + '"/><stop offset=".42" stop-color="' + P.base + '"/><stop offset="1" stop-color="' + P.dark + '"/></linearGradient>'
    + '<linearGradient id="' + uid + 'f" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="' + P.flap + '"/><stop offset="1" stop-color="' + P.edge + '"/></linearGradient>'
    + '<filter id="' + uid + 'g" x="0" y="0" width="100%" height="100%">'
    + '<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/>'
    + '<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.55 0.55 0.55 0 0"/>'
    + '</filter>'
    + '</defs>'
    // ===== ورق أبيض طالع من جوه الملف من فوق — إحساس إن الملف مليان أوراق رسمية =====
    + '<g>'
    + '<rect x="30" y="46" width="360" height="66" rx="4" fill="#EFE5CB" stroke="#CDBE96" stroke-width="2" transform="rotate(-1.8 210 79)"/>'
    + '<rect x="54" y="34" width="322" height="68" rx="4" fill="#F7EFDB" stroke="#D8CA9F" stroke-width="2" transform="rotate(1.2 215 68)"/>'
    // سطور طباعة باهتة على أول ورقة
    + '<line x1="96" y1="60" x2="330" y2="55" stroke="#C6B88E" stroke-width="2.4" transform="rotate(1.2 215 68)"/>'
    + '<line x1="108" y1="74" x2="286" y2="71" stroke="#D3C6A0" stroke-width="2" transform="rotate(1.2 215 68)"/>'
    + '</g>'
    // ===== جسم الملف الكرتون — حافة فوق بتاب مرتفع في النص يمين (شكل مجلد حقيقي) =====
    + '<path d="M16,110 Q16,92 33,91 L244,84 L262,52 Q265,45 274,46 L340,50 Q349,51 349,59 L350,78 L428,76 Q445,76 444,92 L446,264 Q446,282 429,283 Q225,292 34,284 Q17,283 16,266 Z" '
    + 'fill="url(#' + uid + 'b)" stroke="' + P.edge + '" stroke-width="3"/>'
    // ظل بسيط تحت حافة التاب — بيفصل التاب عن الجسم
    + '<path d="M244,84 L262,52 Q265,45 274,46 L340,50 Q349,51 349,59 L350,78" fill="none" stroke="rgba(30,14,2,.22)" stroke-width="3.5"/>'
    // سنّة الوش — شريط علوي داخل الملف بلون أغمق (طية الغلاف)
    + '<path d="M18,102 Q230,90 442,92 L441,136 Q230,122 19,140 Z" fill="url(#' + uid + 'f)" opacity=".9"/>'
    + '<path d="M19,140 Q230,122 441,136" fill="none" stroke="rgba(35,20,5,.28)" stroke-width="2.5"/>'
    // لمعات الرسم واهتراء الورق
    + '<path d="M26,104 Q230,93 434,96" fill="none" stroke="rgba(255,242,214,.28)" stroke-width="2.5"/>'
    + '<ellipse cx="70" cy="234" rx="54" ry="26" fill="rgba(255,238,206,.12)"/>'
    + '<ellipse cx="388" cy="110" rx="44" ry="18" fill="rgba(60,32,8,.10)"/>'
    // رقعة الرقم الرسمي (نص file-serial بيقعد عليها)
    + '<rect x="238" y="232" width="200" height="46" rx="8" fill="rgba(255,246,224,.32)"/>'
    // خيط أحمر متربعط على زرار خشب — رسمة إيد بظل مرسوم
    + '<g fill="none" stroke-linecap="round">'
    + '<path d="M206,164 C182,134 278,122 262,162 C256,178 208,186 202,166" stroke="rgba(30,12,4,.20)" stroke-width="6" transform="translate(3,4)"/>'
    + '<path d="M206,164 C182,134 278,122 262,162 C256,178 208,186 202,166" stroke="#A6362A" stroke-width="5"/>'
    + '<path d="M252,166 C276,142 196,130 212,170 C218,186 264,190 268,168" stroke="rgba(30,12,4,.20)" stroke-width="6" transform="translate(3,4)"/>'
    + '<path d="M252,166 C276,142 196,130 212,170 C218,186 264,190 268,168" stroke="#A6362A" stroke-width="5"/>'
    + '<path d="M259,184 C268,200 258,218 244,228" stroke="#A6362A" stroke-width="4.5"/>'
    + '</g>'
    + '<circle cx="232" cy="168" r="17" fill="#8A5A34" stroke="#5E3C20" stroke-width="3"/>'
    + '<circle cx="231" cy="166.5" r="15" fill="none" stroke="rgba(255,240,210,.22)" stroke-width="1.5"/>'
    + '<circle cx="227" cy="164" r="2.6" fill="#3E2A14"/><circle cx="237" cy="172" r="2.6" fill="#3E2A14"/>'
    // حبيبات ورق مرسومة
    + '<rect x="0" y="0" width="460" height="300" filter="url(#' + uid + 'g)" opacity=".16"/>'
    + '</svg>';
}

// توزيع الملفات على المكتب — مروحة راقدة على الديسكتوب، على الفون: صفّة متعرجة
// الملفات أصغر وعايشة جوه المشهد (الشاي والسنب والتليفون باينين حواليها) — Task 26
function deskIsPortrait() {
  return !!(window.matchMedia && window.matchMedia('(max-width: 540px) and (orientation: portrait)').matches);
}
function deskOffsetsPure(portrait, i) {
  if (portrait) {
    // صفّة متعرجة: كل ملف جنب الشغال اللي فوقيه بشيبر — يمين وشمال بالتناوب
    // والمسافة الأوسع (28px) بتفضح المشهد بين الملفات بدل ما تتغطى عليه
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
  // البورتريه: ميلان واضح زي ملف ربضو بإيد موظف — الديسكتوب زي ما هو
  const fan = [-6, 2, 5], stack = [-4.5, 3.2, -2];
  return (portrait ? stack : fan)[i] || 0;
}

// إعادة توزيع الملفات لو الاتجاه اتقلب وهو واقف على المكتب
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
    subtitle.textContent = 'تم إنجاز جميع الملفات';
  } else {
    subtitle.textContent = state.playerName + '، اختر ملف للبدء';
  }

  const stack = document.getElementById('dossierStack');
  stack.innerHTML = '';

  // توزيع الملفات: مروحة على الديسكتوب / رصّة عمودية على فون البورتريه (Task 25)
  const portraitDesk = deskIsPortrait();
  lastDeskLayout = portraitDesk;

  DESK_CATEGORIES.forEach((cat, i) => {
    const set = getActiveSetForCategory(cat);
    if (!set) return;
    const docState = state.docsState[set.setId] || 'empty';
    // ملف مستني أسئلته من الملفات الجاية — بيتعرض مقفول بوسم قريباً
    const isEmpty = set.questions.length === 0;
    const rot = deskRotationPure(portraitDesk, i);

    const dossier = document.createElement('div');
    dossier.className = 'dossier ' + set.colorClass;
    if (isEmpty) dossier.classList.add('dossier-locked');
    if (docState === 'inProgress') dossier.classList.add('in-progress');
    if (docState === 'done') dossier.classList.add('doc-done');
    dossier.id = 'dossier-' + set.setId;
    dossier.style.setProperty('--dossier-rot', rot + 'deg');

    // توزيع الملفات — بيتغير كليًا بين المروحة والرصّة حسب الاتجاه
    const off = deskOffsetsPure(portraitDesk, i);
    dossier.style.left = off.left;
    dossier.style.bottom = off.bottom;

    // جسم الملف (الميلان والرفع للشاشة كلها CSS على العنصر ده)
    const body = document.createElement('div');
    body.className = 'dossier-body';

    // ورق الملف باين من الجهة المفتوحة
    const papers = document.createElement('div');
    papers.className = 'file-papers';
    body.appendChild(papers);

    // وش الملف الكرتون: سطور مطبوعة + رقم رسمي + الخيط الأحمر المربعوط
    const cover = document.createElement('div');
    cover.className = 'dossier-cover';
    cover.id = 'dossierCover-' + set.setId;
    // وش الملف: رسمة SVG حية بلون الفئة — خيط أحمر وزرار خشب وحبيبات ورق (Task 25)
    cover.innerHTML = folderArtSVG(set.colorClass, i) + '<div class="file-serial">' + fileSerial(i) + '</div>';

    if (isEmpty) {
      // الوسم الأحمر — الملف فاضي لحد ما أسئلته توصل
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
      sealIcon.textContent = 'د'; // بصمة ديوان على الختمة (Task 26)
      seal.appendChild(sealIcon);
      cover.appendChild(seal);
    } else {
      const doneStamp = document.createElement('div');
      doneStamp.className = 'done-stamp';
      doneStamp.textContent = 'منجز';
      cover.appendChild(doneStamp);
    }
    body.appendChild(cover);

    // تاب الفئة — لصاقة على كعب الملف
    const tab = document.createElement('div');
    tab.className = 'dossier-tab';
    tab.textContent = set.displayName;
    body.appendChild(tab);

    dossier.appendChild(body);

    // دبوس التتبع (جاري) — بره الجسم عشان ميميلش
    const pin = document.createElement('div');
    pin.className = 'dossier-pin';
    pin.textContent = '📌';
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
  // ملف فاضي — لسه أوراقه جايه في السكة
  if (!set || set.questions.length === 0) {
    const el = document.getElementById('dossier-' + setId);
    if (el) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); }
    Sound.penTap();
    flashDeskNote('الملف ده لسه فاضي… أوراقه جايه في السكة 😉');
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

// رسالة سريعة على عنوان المكتب — بتروح لوحدها بعد شوية
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
      ? 'تم إنجاز جميع الملفات'
      : (state.playerName || '') + '، اختر ملف للبدء';
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

  // ملف جديد = واسطة بتتجدد (الاستكمال مش بيجدها)
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
  // فتح الملف من الأول (مش استكمال سؤال جاري) = مفيش وقت متجمّع يتطبق بالغلط
  // applyDocTimeSnapshot بتتحقق بنفسها من تطابق السؤال، وده طبقة أمان زيادة
  state.appealUsed = false;
  loadDocQuestionAt(startIdx);
}

// السؤال الحالي في الملف المفتوح — مرجع موحد بدل تكرار الوصول للمصفوفة
// ⚠️ جوهرية للمؤقت: startTimer → questionTimeLimit → getCurrentQuestion
function getCurrentQuestion() {
  return currentDocQuestions[currentDocQuestionIdx];
}

function loadDocQuestionAt(idx) {
  if (idx >= currentDocQuestions.length) {
    finishDocument(currentDocSetId);
    return;
  }
  currentDocQuestionIdx = idx;
  state.docProgress[currentDocSetId] = idx;

  const q = currentDocQuestions[idx];
  questionStartTime = Date.now();
  answerPickedAt = 0;
  state.appealUsed = false; // كل سؤال بيبدأ من غير استئناف — واسترجاع لحظة المؤقت (تحت في startTimer) ممكن يرجّعه لو الاستئناف اتعمل قبل الخروج

  const card = document.getElementById('questionCard');
  card.classList.remove('card-slide-in', 'card-slide-out');
  void card.offsetWidth;
  card.classList.add('card-slide-in');
  Sound.paperRustle();

  const badge = document.getElementById('catBadge');
  badge.textContent = q.levelLabel ? q.catLabel + ' · ' + q.levelLabel : q.catLabel;
  badge.className = 'cat-badge cat-' + q.cat;
  // رقم الملف الرسمي — سطر الأرشيف فوق الورقة (Task 26)
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
    document.getElementById('btnFifty').disabled = !state.hasFifty;
  } else if (qType === 'order') {
    orderGrid.style.display = '';
    orderSubmitBtn.style.display = '';
    renderOrderQuestion(q);
    document.getElementById('btnFifty').disabled = true;
  } else if (qType === 'text') {
    textAnswerWrap.style.display = '';
    renderTextQuestion();
    if (q.allowAppeal) appealBtn.style.display = '';
    document.getElementById('btnFifty').disabled = true;
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

  document.getElementById('bribeConfirm').classList.remove('visible');
  updateBribeButton();
  document.getElementById('btnWasta').disabled = !state.hasWasta;
  showMarginNote(q);
  startTimer();
}

// Answer selection for doc-based questions
function selectDocAnswer(index) {
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
    Sound.stamp('success');
    showFloatPoints('+' + points, tag);
    if (state.currentStreak > 0 && state.currentStreak % 3 === 0) showStreakNotif(state.currentStreak);
  } else {
    state.wrongCount++;
    state.currentStreak = 0;
    document.getElementById('streakNum').textContent = state.currentStreak;
    if (state.appealUsed) {
      state.mainScore -= GAME_POINTS.appealPenalty;
      showFloatPoints('-' + GAME_POINTS.appealPenalty);
    }
    showStampOn('stampOverlay', 'error', 'غلط');
    Sound.stamp('error');
    const card = document.getElementById('questionCard');
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 400);
  }

  witnessActive = false; witnessChoice = -1; witnessChanged = false;
  Sound.penTap();
  updateBribeButton();
  saveState();
  advanceToNextQuestion();
}

// ==================== FINISH DOCUMENT (shows achievement card) ====================
function finishDocument(setId) {
  clearInterval(timerInterval);
  clearDocTimeSnapshot(); // الملف خلص خلاص
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

  // الاجابات التفصيلية بتتعرض بعد قفل كارت الإنجاز (آخر الملف)
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

// ⚠️ exitDocToDesk اتشالت في Task 24 — قاعدة الدخلة الواحدة: مفيش رجوع للمكتب
// من جوه الملف. الزرار اتشال من HTML والدالة معاها، والاستكمال الوحيد المسموح
// هو resumeDocFromSnapshot (تاب اتقفل بالغلط → نفس السؤال يفتح لوحده).

// ==================== ACHIEVEMENT CARD (Prompt 4) ====================
// ملف الاجابات التفصيلية اللي مستنية تتعرض بعد قفل كارت الإنجاز (بعد ما الملف يخلص)
let pendingExplainSetId = null;
// الملف اللي كارت إنجازه ظاهر دلوقتي (عشان زرار الاجابات التفصيلية)
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
  document.getElementById('achieveDate').textContent = 'حُرر بتاريخ ' + card.date;
  document.getElementById('achieveRef').textContent = 'رقم الملف: ' + card.refId;
  
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
      // Reveal buttons last (مراجعة الاجابات + رجوع للمكتب)
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

  // الاجابات التفصيلية بتظهر لوحدها آخر كل ملف خلصانه دلوقتي
  // (مراجعة ملف قديم من المكتب مش بتعرضها تلقائيًا — الزرار موجود في الكارت)
  if (pendingExplainSetId) {
    const setId = pendingExplainSetId;
    pendingExplainSetId = null;
    showDocExplanations(setId, proceedAfterAchievement);
    return;
  }
  proceedAfterAchievement();
}

function proceedAfterAchievement() {
  // Check if all documents done (الملفات الفاضية متتحسبش)
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

// زرار كارت الإنجاز — مراجعة اجابات الملف اللي ظاهر دلوقتي أي وقت
function openAchieveExplanations() {
  // المستخدم شافها خلاص — متتعرضش تاني تلقائيًا بعد القفل
  pendingExplainSetId = null;
  if (!currentAchieveSetId) return;
  showDocExplanations(currentAchieveSetId, null);
}

// ==================== الاجابات التفصيلية (آخر كل ملف/قسم) ====================
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

// الاجابات التفصيلية لملف من الملفات (10 أسئلة)
function showDocExplanations(setId, afterFn) {
  const set = allQuestionSets.find(s => s.setId === setId);
  const qs = set ? set.questions : [];
  openExplainReview(qs, '📖 الاجابات التفصيلية', set ? set.displayName : 'الملف المكتمل', afterFn);
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
  
  // Build a mini achievement card for review
  const tierColors = {
    excellent: 'var(--diwan-amber)',
    vgood: 'var(--diwan-success)',
    acceptable: 'var(--diwan-ink)',
    weak: 'var(--diwan-burnt)',
    rejected: 'var(--diwan-error)'
  };
  
  content.innerHTML = `
    <div class="achieve-card" style="border:3px solid var(--diwan-ink); box-shadow:0 6px 24px rgba(0,0,0,0.2), inset 0 0 0 5px var(--diwan-paper-soft), inset 0 0 0 7px var(--diwan-kraft);">
      <div class="achieve-stamp tier-${card.tier} stamp-drop" style="opacity:1;transform:scale(1)rotate(0deg)">${card.tierText}</div>
      <div class="card-content revealed">
        <div class="achieve-doc-name revealed">${card.displayName}</div>
        <div class="achieve-score-line revealed">${card.correct} من ${card.total} صحيح</div>
        <div class="achieve-date revealed">حُرر بتاريخ ${card.date}</div>
        <div class="achieve-ref revealed">رقم الملف: ${card.refId}</div>
        <button class="achieve-back-btn revealed" style="margin-top:18px;" onclick="closeCardReview()">رجوع للشهادة</button>
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
// سجل الموظفين: الدخلة مرة واحدة في الجولة — بيتسجل أول ما الشهادة تتعرض
// (عند اكتمال الجولة مش عند البداية — عشان لو حد قفل الصفحة بالغلط مايتقفلش بره للأبد)
function getRegisteredName() {
  try { return normalizeNamePure(localStorage.getItem(REG_KEY) || ''); } catch (e) { return ''; }
}

function registerEmployeeOnce(name) {
  const n = normalizeNamePure(name);
  if (!n) return;
  try { localStorage.setItem(REG_KEY, n); } catch (e) {}
}

// شاشة الدخول في وضع "مُسجّل": الفورم بيتخفى وكارت القيد بيبان
function showEntryLocked() {
  const reg = getRegisteredName();
  const locked = document.getElementById('entryLocked');
  if (!locked) return;
  document.getElementById('entryLockedName').textContent = reg || '';
  locked.style.display = 'block';
  ['photoSlot','nameInput'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  ['.name-input-wrap','.avatar-grid','.sig-wrap'].forEach(sel => {
    const el = document.querySelector(sel); if (el) el.style.display = 'none';
  });
  const submit = document.getElementById('submitBtn');
  if (submit) submit.style.display = 'none';
  const glow = document.getElementById('formGlow');
  if (glow) glow.style.display = 'none';
}

// الموظف المتسجل يقدر يفتح شهادته ويستعرض جولته — من غير دخلة جديدة
function viewRegisteredCertificate() {
  Sound.penTap();
  const ok = loadState();
  if (ok && state.playerName) {
    state.totalScore = state.mainScore + state.bonusScore;
    switchScreen('screenEntry', 'screenCert');
    setTimeout(() => renderCertificate(), 400);
  }
}

// ==================== أختام الأقسام — استمارة التوظيف (Task 26) ====================
// 6 أختام حبرية مرسومة SVG بدل رموز اليونيكود العشرة — كل موظف بياخد ختم قسمه،
// والاسم بيتخزن (مش الرمز) عشان يظهر مقروء في لوحة الشرف والشهادة
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
document.getElementById('photoInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  
  reader.onload = function(ev) {
    state.playerPhoto = ev.target.result;
    
    const entrySlot = document.getElementById('photoSlot');
    if (entrySlot) {
      entrySlot.innerHTML = `<img src="${ev.target.result}" alt="صورة اللاعب">`;
    }
    
    const certSlot = document.getElementById('certPhotoSlot');
    if (certSlot) {
      certSlot.innerHTML = `<img src="${ev.target.result}" alt="صورة اللاعب">`;
    }
    
    Sound.penTap();
  };
  
  reader.readAsDataURL(file);
  e.target.value = '';
});

function startGame() {
  // قاعدة الديوان: الموظف له دخلة واحدة في الجولة — المتسجل بيتردّ فوراً
  if (getRegisteredName()) { showEntryLocked(); return; }
  state.playerName = normalizeNamePure(document.getElementById('nameInput').value.trim());
  state.hasWasta = true; // واسطة جديدة مع كل دخول ديوان
  // تشغيل أجواء المكتب المحيطة (النقرة نفسها تفكّ قفل الصوت في المتصفح)
  if (window.Ambience) Ambience.unlock();
  Sound.stamp('success');
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
  // حروف رسمية زي ورقة الامتحان — أ/ب/ج/د في خانة مختومة جنب كل اختيار (Task 26)
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
  // تجميد واستكمال: لو خرجنا من الملف (أو الريفريش حصل) وسط السؤال ده — بنكمل بالثواني المتبقية
  // ده بيقفل غش الخروج والدخول اللي كان بيجدد الوقت من الأول
  applyDocTimeSnapshot();
  updateTimerDisplay();
  updateCandleVisual();

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
// دالة مشتركة بين شريط الملفات وعداد جولة المخاطرة
function timeZoneClass(pct) {
  if (pct > 0.66) return 'zone-fast';
  if (pct > 0.33) return 'zone-mid';
  return 'zone-slow';
}

function updateCandleVisual() {
  // بعد الاستئناف التلت بيتحسب على الوقت الممتد — نفس مرجع حساب النقاط بالظبط
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
  Sound.stamp('error');

  const card = document.getElementById('questionCard');
  card.classList.add('shake');
  setTimeout(() => card.classList.remove('shake'), 400);

  updateBribeButton();
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
  stamp.textContent = text;
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

function showStreakNotif(streak) {
  const el = document.createElement('div');
  el.className = 'streak-notif';
  el.textContent = `★ ستريك ${streak}!`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// نقية للاختبارات: تختار إجابتين غلط (مش الإجابة الصح) من إجمالي الاختيارات
function pickTwoWrong(correct, total) {
  const indices = [];
  for (let i = 0; i < total; i++) if (i !== correct) indices.push(i);
  return shuffleArray(indices).slice(0, 2);
}

function useFiftyFifty() {
  if (!state.hasFifty) return;
  if (witnessActive) return; // كارت الشاهد واقف — مفيش فطة دلوقتي (زي باقي الأدوات)
  // 50/50 only works for MCQ questions
  const q = getCurrentQuestion();
  const qType = q.type || 'mcq';
  if (qType !== 'mcq') {
    // Brief shake to indicate not applicable
    const btn = document.getElementById('btnFifty');
    btn.classList.add('shake');
    setTimeout(() => btn.classList.remove('shake'), 400);
    return;
  }
  state.hasFifty = false;
  document.getElementById('btnFifty').disabled = true;
  Sound.penTap();
  saveState();
  const btns = document.querySelectorAll('#optionsGrid .option-btn');
  // مسحة الفطة — إجابتين غلط يختفوا في مسحة واحدة
  pickTwoWrong(q.correct, btns.length).forEach(i => {
    btns[i].classList.add('strikethrough');
    btns[i].disabled = true;
  });
  const grid = document.getElementById('optionsGrid');
  grid.classList.remove('futta-sweep');
  void grid.offsetWidth;
  grid.classList.add('futta-sweep');
  Sound.futtaSwoosh();
  setTimeout(() => grid.classList.remove('futta-sweep'), 700);
}

// ==================== واسطة — تعدي السؤال بالسطرة ====================
// بتتتجدد مع كل ملف جديد — بتخطي السؤال من غير نقط ولا غلطة والستريك زي ما هو
function useWasta() {
  if (!state.hasWasta) return;
  if (witnessActive) return; // الشاهد واقف في وشك — مفيش واسطة دلوقتي
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
  Sound.stamp('success');
  Sound.penTap();
  saveState();
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
  // وقت السؤال في جولة المخاطرة = زمنه الأصلي من حقل time (زي الملفات بالظبط)
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

// عداد جولة المخاطرة بين على الشاشة — نفس شريط التلتات بتاع الملفات
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
    Sound.stamp('success');
    showFloatPoints('+' + GAME_POINTS.bonusCorrect, '', document.getElementById('bonusCard'));
    document.getElementById('bonusStamp' + state.bonusCurrentQ).classList.add('done', 'correct-stamp');
  } else {
    state.bonusWrong++;
    state.bonusScore -= GAME_POINTS.bonusPenalty;
    btns[index].classList.add('wrong');
    btns[q.correct].classList.add('correct');
    showStampOn('bonusStamp', 'error', 'غلط');
    Sound.stamp('error');
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
  // (لو اللاعب مسرحع وضغط شوف الشهادة قبلها — منظهرهاش على شاشة الشهادة)
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
  Sound.penTap();
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
    slot.innerHTML = `<img src="${state.playerPhoto}" alt="صورة اللاعب"><input type="file" id="certPhotoInput" accept="image/*" style="display:none">`;
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
    certRefEl.textContent = 'رقم الملف: ' + state.certRefId;
  }

  // 3.5 لوحة الشرف — النتيجة بتتسجل أول ما الشهادة تظهر
  const hallLine = document.getElementById('certHallLine');
  if (hallLine) {
    const res = recordInHall(state.totalScore, Math.round(evalData.percentage), evalData.stampConfig.text);
    if (res.rank > 0) {
      hallLine.textContent = res.isBest
        ? '🏆 نتيجة جديدة في لوحة الشرف — مركز ' + res.rank
        : '🏆 لوحة الشرف محتفظة بأحسن نتيجة ليك — مركز ' + res.rank;
    } else {
      hallLine.textContent = '🏆 اللوحة مليانة أشطر من كده… ورّقها المرة الجاية!';
    }
  }

  // 3.6 قيد في سجل الموظفين — لحظة الشهادة = الجولة اكتملت = الدخلة اتحسبت
  // من هنا شاشة الدخول بتقفل للاسم ده لحد ما جولة أسئلة جديدة تبدأ
  registerEmployeeOnce(state.playerName);
  
  // 4. Circular stamp with Arabic text (enhance cert-stamp)
  enhanceCertStamp(stampEl);
  
  // ===== المرفقات (Prompt 5) =====
  renderEnclosures();
  
  // Enable share/download buttons only after all animations complete
  enableCertButtonsWhenReady();
}

// Cert-specific photo upload
document.addEventListener('change', function(e) {
  if (e.target && e.target.id === 'certPhotoInput') {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      state.playerPhoto = ev.target.result;
      const slot = document.getElementById('certPhotoSlot');
      slot.innerHTML = `<img src="${ev.target.result}" alt="صورة اللاعب"><input type="file" id="certPhotoInput" accept="image/*" style="display:none">`;
    };
    reader.readAsDataURL(file);
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
  if (pct >= 90) badges.push('★ بطل الديوان');
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
  const text = `ديوان الحكمة — ${state.playerName} حصل على ${state.totalScore} نقطة (${Math.round(evalData.percentage)}%) — ${evalData.stampConfig.text} ◆`;
  if (navigator.share && navigator.canShare) {
    captureCertificate(canvas => {
      canvas.toBlob(blob => {
        const file = new File([blob], 'diwan-certificate.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ title: 'الديوان', text, files: [file] }).catch(() => {});
        } else {
          navigator.share({ title: 'الديوان', text }).catch(() => {});
        }
      }, 'image/png');
    });
  } else {
    navigator.clipboard.writeText(text).then(() => {
      alert('تم النسخ!');
    }).catch(() => {
      alert(text);
    });
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
 * راسم الشهادة على Canvas مباشرة — بديل html2canvas بالكامل.
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

    const INK = '#26344A', AMBER = '#C69A44', GOLD = '#C6A876',
          SUCCESS = '#2E6E45', ERROR = '#A6362A', BURNT = '#8B4A38';
    const PAPER_SOFT = (getComputedStyle(document.body).getPropertyValue('--diwan-paper-soft') || '').trim() || '#F3EBD8';
    const DISPLAY = '"Baloo Bhaijaan 2","Aref Ruqaa",serif';
    const BODY = '"Cairo",sans-serif';

    // ===== قراءة بيانات الشهادة الجاهزة من الـ DOM (بعد اكتمال الأنيميشن) =====
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
      loadImg('img/paper-ghibli.png'),
      photoEl ? loadImg(photoEl.src) : Promise.resolve(null),
      (sigEl && sigEl.style.display !== 'none' && sigEl.src) ? loadImg(sigEl.src) : Promise.resolve(null)
    ]).then(function (inputs) {
      try {
        const paper = inputs[0], photo = inputs[1], sig = inputs[2];

        // ===== الخلفية: ورق جيبلي مرسوم (نفس عالم المشهد) =====
        ctx.fillStyle = PAPER_SOFT;
        ctx.fillRect(0, 0, W, H);
        if (paper) {
          const pr = paper.width / paper.height, cr = W / H;
          let dw, dh;
          if (pr > cr) { dh = H + 40; dw = dh * pr; } else { dw = W + 40; dh = dw / pr; }
          ctx.drawImage(paper, (W - dw) / 2, (H - dh) / 2, dw, dh);
        }

        // ===== البرواز المزدوج (كحلي + دهبي) ومعينات الأركان =====
        ctx.strokeStyle = INK; ctx.lineWidth = 3;
        rr(ctx, 14.5, 14.5, W - 29, H - 29, 16); ctx.stroke();
        ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
        rr(ctx, 26.5, 26.5, W - 53, H - 53, 11); ctx.stroke();
        ctx.fillStyle = GOLD;
        [[26.5, 26.5], [W - 26.5, 26.5], [26.5, H - 26.5], [W - 26.5, H - 26.5]]
          .forEach(function (c) { diamond(ctx, c[0], c[1], 6); });

        const CX = 495;   // مركز عمود النصوص
        const RCX = 1042; // مركز عمود الصورة (يمين في الـRTL)

        // ===== الصورة الشخصية =====
        ctx.save();
        rr(ctx, RCX - 88, 78, 176, 200, 14);
        ctx.fillStyle = 'rgba(255,255,255,.45)';
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
          ctx.fillStyle = 'rgba(38,52,74,.35)';
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
          ctx.strokeStyle = 'rgba(38,52,74,.5)'; ctx.lineWidth = 1.5;
          line(ctx, RCX - 85, 380, RCX + 85, 380);
        }

        // ===== الدمغة الرسمية =====
        if (damghaNum) {
          ctx.strokeStyle = AMBER; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(RCX, 466, 50, 0, Math.PI * 2); ctx.stroke();
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(RCX, 466, 43, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = AMBER;
          ctx.font = '800 32px ' + DISPLAY;
          ctx.fillText(damghaNum, RCX, 477);
          ctx.fillStyle = 'rgba(38,52,74,.6)';
          ctx.font = '600 13px ' + BODY;
          ctx.fillText('دمغة الديوان', RCX, 540);
        }

        // ===== عمود النصوص =====
        // 1) السطر التمهيدي
        ctx.fillStyle = 'rgba(38,52,74,.75)';
        ctx.font = '600 27px ' + BODY;
        ctx.fillText('شهادة تقدير — الديوان', CX, 100);

        // 2) العنوان الكبير
        ctx.fillStyle = INK;
        ctx.font = '800 50px ' + DISPLAY;
        ctx.fillText('نتائج التحدي النهائي', CX, 160);

        // فاصل دهبي بمعين
        ctx.strokeStyle = AMBER; ctx.lineWidth = 2.5;
        line(ctx, CX - 80, 186, CX + 80, 186);
        ctx.fillStyle = AMBER;
        diamond(ctx, CX, 186, 5);

        // 3) الاسم بتوقيع مائل وخط موجي
        const playerName = state.playerName || 'موظف الديوان';
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
        ctx.fillStyle = 'rgba(38,52,74,.7)';
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
          ctx.fillStyle = 'rgba(38,52,74,.85)';
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
              ctx.fillStyle = 'rgba(255,255,255,.42)'; ctx.fill();
              ctx.strokeStyle = 'rgba(38,52,74,.25)'; ctx.lineWidth = 1; ctx.stroke();
              ctx.fillStyle = INK;
              ctx.fillText(p[0], x + p[1] / 2, y + 11);
              x += p[1] + gap;
            });
            y += pillH + 8;
          });
        }

        // 8) سطر المرفقات
        if (encSec && encSec.style.display !== 'none' && encCount > 0) {
          ctx.fillStyle = 'rgba(38,52,74,.7)';
          ctx.font = '600 21px ' + BODY;
          ctx.fillText('المرفقات: ' + encCount + (encCount === 1 ? ' بطاقة تقدير' : ' بطاقات تقدير'), CX, y + 24);
          y += 36;
        }

        // 9) الرقم المرجعي
        if (refText) {
          ctx.fillStyle = 'rgba(38,52,74,.55)';
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

// زرار الرجوع للمكتب بعد استلام الشهادة
function returnToDeskFromCert() {
  Sound.paperRustle();
  switchScreen('screenCert', 'screenDesk');
  setTimeout(function () { showDeskHub(); }, 400);
}

function downloadCert() {
  Sound.penTap();
  captureCertificate(canvas => {
    const link = document.createElement('a');
    link.download = 'diwan-certificate.png';
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
  // خلط ترتيب العناصر بنسخة جديدة من correctOrder
  state.orderItems = shuffleArray(q.correctOrder);
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
  if (!userAnswer) return false;
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

// ==================== لوحة الشرف (محلية على الجهاز) ====================
const HALL_KEY = 'diwanHallOfFame';
const HALL_MAX = 10;

function loadHall() {
  try {
    const arr = JSON.parse(localStorage.getItem(HALL_KEY));
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function saveHallStorage(list) {
  try { localStorage.setItem(HALL_KEY, JSON.stringify(list)); } catch (e) {}
}

// نقية للاختبارات: دمج نتيجة — نفس الاسم يحتفظ بأحسن نتيجة — وترجع اللوحة المرتبة والمركز
// المقارنة بأسماء موحّدة (مسافات متعادلة) عشان "أحمد " و "أحمد" ميبقوش شخصين
function upsertHallPure(list, entry, max) {
  const en = normalizeNamePure(entry.name);
  const old = list.find(e => normalizeNamePure(e.name) === en);
  const best = old && old.score >= entry.score ? old : entry;
  const next = list.filter(e => normalizeNamePure(e.name) !== en);
  next.push(best);
  next.sort((a, b) => (b.score - a.score) || ((b.pct || 0) - (a.pct || 0)));
  const trimmed = next.slice(0, max);
  const rank = trimmed.findIndex(e => normalizeNamePure(e.name) === en) + 1;
  return { list: trimmed, rank: rank, isBest: best === entry };
}

function recordInHall(score, pct, tierText) {
  const entry = {
    name: normalizeNamePure(state.playerName) || 'موظف مجهول',
    avatar: state.playerAvatar || '◆',
    score: score,
    pct: pct,
    tier: tierText || '',
    date: arabicToday()
  };
  const res = upsertHallPure(loadHall(), entry, HALL_MAX);
  saveHallStorage(res.list);
  return res;
}

function arabicToday() {
  const now = new Date();
  return now.getDate() + ' ' + MONTHS_AR[now.getMonth()] + ' ' + now.getFullYear();
}

// الشهور العربية — مستخدمة في تاريخ كارت الإنجاز ولوحة الشرف
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// خلط فيشر-يتس — نسخة جديدة من غير تغيير الأصل (فطة + ترتيب)
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function toggleHall() {
  const panel = document.getElementById('hallPanel');
  const show = !panel.style.display || panel.style.display === 'none';
  if (show) {
    renderHall();
    panel.style.display = '';
  } else {
    panel.style.display = 'none';
  }
  Sound.penTap();
}

function renderHall() {
  const rows = document.getElementById('hallRows');
  const list = loadHall();
  if (!list.length) {
    rows.innerHTML = '<div class="hall-empty">اللوحة لسه فاضية… كن أول موظف يعلّق اسمه فيها!</div>';
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  const meNorm = normalizeNamePure(state.playerName);
  rows.innerHTML = list.map((e, i) => {
    const me = normalizeNamePure(e.name) === meNorm ? ' hall-me' : '';
    const rank = medals[i] || ((i + 1) + '-');
    return '<div class="hall-row' + (i < 3 ? ' hall-top' : '') + me + '">'
      + '<span class="hall-rank">' + rank + '</span>'
      + '<span class="hall-avatar">' + escapeHtml(e.avatar || '◆') + '</span>'
      + '<span class="hall-name">' + escapeHtml(e.name) + '</span>'
      + '<span class="hall-score">' + e.score + ' نقطة</span>'
      + '</div>';
  }).join('');
}

// ==================== PROMPT 6: BRIBE POWER-UP ====================

function updateBribeButton() {
  const btn = document.getElementById('btnBribe');
  if (!state.hasBribe || state.mainScore < BRIBE_COST) {
    btn.disabled = true;
  } else {
    btn.disabled = false;
  }
}

function useBribe() {
  if (!state.hasBribe) return;
  if (witnessActive) return;
  Sound.penTap();
  // Show confirmation overlay
  document.getElementById('bribeConfirm').classList.add('visible');
}

function confirmBribe() {
  if (!state.hasBribe) return;
  // Guard: check score is still sufficient (may have changed while dialog was open)
  if (state.mainScore < BRIBE_COST) {
    cancelBribe();
    return;
  }
  state.hasBribe = false;
  document.getElementById('btnBribe').disabled = true;
  document.getElementById('bribeConfirm').classList.remove('visible');

  // خصم ثمن الشاي
  state.mainScore -= BRIBE_COST;

  // Show hint from current question — الممتحن همسلك التلميح على الشاي
  const q = currentDocQuestions[currentDocQuestionIdx];
  if (q.hint) {
    const hintNote = document.getElementById('hintNote');
    hintNote.textContent = '◆ الممتحن همسلك: ' + q.hint;
    hintNote.style.display = '';
  } else {
    const hintNote = document.getElementById('hintNote');
    hintNote.textContent = '◆ الممتحن: معلش يا باشا، السؤال ده مالوش تلميح… الشاي على حسابي ☕';
    hintNote.style.display = '';
  }
  Sound.teaSip();
  updateBribeButton();
  saveState();
}

function cancelBribe() {
  document.getElementById('bribeConfirm').classList.remove('visible');
  Sound.penTap();
}

// ==================== PROMPT 7: APPEAL SYSTEM ====================

function useAppeal() {
  if (state.appealUsed) return;
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
  
  // Pick a note that hasn't been used
  const available = MARGIN_NOTES.filter((_, i) => !usedMarginNotes.has(i));
  if (available.length === 0) return;
  
  const randIdx = Math.floor(Math.random() * available.length);
  const noteText = available[randIdx];
  const originalIdx = MARGIN_NOTES.indexOf(noteText);
  usedMarginNotes.add(originalIdx);
  
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
// لوحة الشرف والحفظ لوحدها وتبلش جولة جديدة. يعني تجديد الأسئلة كل فترة
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
  const prev = localStorage.getItem(SEASON_KEY);
  if (prev === cur) return;
  if (prev === null) { localStorage.setItem(SEASON_KEY, cur); return; } // أول تشغيل — من غير تصفير ولا إشعار
  localStorage.setItem(SEASON_KEY, cur);
  localStorage.removeItem(HALL_KEY);    // لوحة الشرف — صافية للجولة الجديدة
  localStorage.removeItem(STORAGE_KEY); // الحفظ القديم — الملفات ترجع فاضية
  localStorage.removeItem(REG_KEY);     // سجل الموظفين بيتصفّر برضه — كل جولة = دخلة جديدة للكل
  clearDocTimeSnapshot();               // أي وقت متجمّع من الجولة القديمة مالوش لازمة
  seasonJustReset = true;
})();

// إشعار "جولة جديدة" — بيظهر مرة واحدة بعد التصفير
function showSeasonNote() {
  if (!seasonJustReset) return;
  seasonJustReset = false;
  const el = document.createElement('div');
  el.className = 'season-note';
  el.innerHTML = '<strong>🔔 جولة جديدة بدأت!</strong><span>الأسئلة اتغيّرت — لوحة الشرف اتصفّرت والملفات رجعت فاضية. بالتوفيق يا باشا ✨</span>';
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
  const hasSaved = localStorage.getItem(STORAGE_KEY);

  // موظف متسجل؟ الدخلة اتستهلكت — بيرجع للمكتب على طول من غير سؤال الاستكمال
  if (reg) {
    showEntryLocked();
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
    // نفس القاعدة للموظف اللي لسه مسجلش: السؤال الشغال بيرجع يفتح لوحده
    if (resumeDocFromSnapshot()) return;
    switchScreen('screenEntry', 'screenDesk');
    setTimeout(() => showDeskHub(), 200);
  }
})();

// إشعار الجولة الجديدة (لو حصل تصفير موسم)
setTimeout(showSeasonNote, 900);
