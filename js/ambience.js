// ==================== AMBIENCE ENGINE — أجواء المصلحة ====================
// أصوات محيطة مركّبة بالكامل بـ Web Audio API (بدون أي ملفات صوت خارجية)
// يعتمد على getAudioCtx() و state.isMuted المعرفين في game.js — يُحمَّل بعده

(function () {
  'use strict';

  const Ambience = {
    started: false,
    master: null,
    timers: [],
    liveSources: [],

    // ---------- أدوات مساعدة ----------
    _ctx() {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    },

    _noiseBuffer(ctx, seconds, brown) {
      const size = Math.max(1, Math.floor(ctx.sampleRate * seconds));
      const buf = ctx.createBuffer(1, size, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < size; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * w) / 1.02; data[i] = last * 3.5; }
        else data[i] = w;
      }
      return buf;
    },

    _track(src) { this.liveSources.push(src); },

    _later(fn, minSec, maxSec) {
      const delay = (minSec + Math.random() * (maxSec - minSec)) * 1000;
      const t = setTimeout(() => { if (!this.started) return; fn.call(this); this._later(fn, minSec, maxSec); }, delay);
      this.timers.push(t);
    },

    // ---------- دورة حياة المحرك ----------
    unlock() {
      // مكتوم؟ مفتدّش حاجة ولا بنعمل أي ctx — الكتم هو اللي بيتحكم
      if (state.isMuted) return;
      try {
        const c = getAudioCtx();
        if (c.state === 'suspended') c.resume();
      } catch (e) {}
      this.start();
    },

    start() {
      if (this.started) return;
      let ctx;
      try { ctx = this._ctx(); } catch (e) { return; }

      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);
      // دخول ناعم عشان الصوت ميبقاش مفاجئ
      this.master.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 2.5);

      this._startHum(ctx);
      this._scheduleEvents(ctx);
      this.started = true;
    },

    stop() {
      if (!this.started) return;
      this.started = false;
      this.timers.forEach(clearTimeout);
      this.timers = [];
      try {
        const ctx = getAudioCtx();
        this.master.gain.cancelScheduledValues(ctx.currentTime);
        this.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      } catch (e) {}
      const dying = this.liveSources.slice();
      this.liveSources = [];
      setTimeout(() => {
        dying.forEach(s => { try { s.stop(); } catch (e) {} });
        try { if (this.master) this.master.disconnect(); } catch (e) {}
      }, 500);
    },

    setMuted(m) {
      if (m) this.stop();
      else this.start();
    },

    // ---------- همهمة المكيف + الراديو البعيد (طبقة مستمرة) ----------
    _startHum(ctx) {
      // 1) هواء المكيف: ضجيج بني معتّم
      const air = ctx.createBufferSource();
      air.buffer = this._noiseBuffer(ctx, 3, true);
      air.loop = true;
      const airLP = ctx.createBiquadFilter();
      airLP.type = 'lowpass';
      airLP.frequency.value = 160;
      const airGain = ctx.createGain();
      airGain.gain.value = 0.06;
      air.connect(airLP).connect(airGain).connect(this.master);
      air.start();
      this._track(air);

      // تنفّس بطيء في شدة الهواء (كتكوت مكيف)
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.018;
      lfo.connect(lfoGain).connect(airGain.gain);
      lfo.start();
      this._track(lfo);

      // 2) طنين أنبوبي خفيف جدًا (إضاءة نيون بعيدة)
      const buzz = ctx.createOscillator();
      buzz.type = 'sine';
      buzz.frequency.value = 100;
      const buzzGain = ctx.createGain();
      buzzGain.gain.value = 0.006;
      buzz.connect(buzzGain).connect(this.master);
      buzz.start();
      this._track(buzz);

      // 3) مروحة السقف — هوا ناعم مستمر "فَـشّ فَـشّ" بنَفَس بطيء
      //    (من غير همهمة موتور حادة — صوت هوا مريح زي مروحة المصالح من بعيد)
      const chopRate = 3 / 1.15;   // 3 ريشات × لفة كل 1.15 ثانية — متزامنة مع الدوران المرئي

      //    الهوا الأساسي: ضجيج بني مفلتر ناعم — "زهير" المروحة المريح
      const fanAir = ctx.createBufferSource();
      fanAir.buffer = this._noiseBuffer(ctx, 3, true);
      fanAir.loop = true;
      const fanAirLP = ctx.createBiquadFilter();
      fanAirLP.type = 'lowpass';
      fanAirLP.frequency.value = 420;
      const fanAirGain = ctx.createGain();
      fanAirGain.gain.value = 0.085;
      fanAir.connect(fanAirLP).connect(fanAirGain).connect(this.master);
      fanAir.start();
      this._track(fanAir);

      //    نَفَس بطيء في شدة الهوا عشان الصوت ميبقاش ثابت آلي
      const swell = ctx.createOscillator();
      swell.type = 'sine';
      swell.frequency.value = 0.11;
      const swellDepth = ctx.createGain();
      swellDepth.gain.value = 0.011;
      swell.connect(swellDepth).connect(fanAirGain.gain);
      swell.start();
      this._track(swell);

      //    دقة الريش: هوا بيمر على الريش — "فَـشّ" ناعمة مع كل ريشة
      const chop = ctx.createBufferSource();
      chop.buffer = this._noiseBuffer(ctx, 2, false);
      chop.loop = true;
      const chopBP = ctx.createBiquadFilter();
      chopBP.type = 'bandpass';
      chopBP.frequency.value = 560;
      chopBP.Q.value = 0.6;
      const chopGain = ctx.createGain();
      chopGain.gain.value = 0.04;
      const chopLFO = ctx.createOscillator();
      chopLFO.type = 'sine';
      chopLFO.frequency.value = chopRate;
      const chopDepth = ctx.createGain();
      chopDepth.gain.value = 0.012;
      chopLFO.connect(chopDepth).connect(chopGain.gain);
      chop.connect(chopBP).connect(chopGain).connect(this.master);
      chop.start();
      chopLFO.start();
      this._track(chop);
      this._track(chopLFO);

      //    لمعة هوا عالية خفيفة فوق الدقة — نفس "فَش" الهوا الناعمة
      const hush = ctx.createBufferSource();
      hush.buffer = this._noiseBuffer(ctx, 2, false);
      hush.loop = true;
      const hushBP = ctx.createBiquadFilter();
      hushBP.type = 'bandpass';
      hushBP.frequency.value = 1900;
      hushBP.Q.value = 0.4;
      const hushGain = ctx.createGain();
      hushGain.gain.value = 0.007;
      const hushLFO = ctx.createOscillator();
      hushLFO.type = 'sine';
      hushLFO.frequency.value = chopRate;
      const hushDepth = ctx.createGain();
      hushDepth.gain.value = 0.0026;
      hushLFO.connect(hushDepth).connect(hushGain.gain);
      hush.connect(hushBP).connect(hushGain).connect(this.master);
      hush.start();
      hushLFO.start();
      this._track(hush);
      this._track(hushLFO);
    },

    // ---------- أحداث عشوائية مؤجلة ----------
    _scheduleEvents(ctx) {
      this._later(this._evtTick, 1, 1);          // تِك...تَك الساعة — كل ثانية بالظبط
      this._later(this._evtDistantPhone, 22, 55);
      this._later(this._evtPaper, 9, 24);
      this._later(this._evtDistantStamp, 35, 80);
      this._later(this._evtDoorThud, 45, 110);
    },

    // تِك...تَك ساعة الحيطة — نقرتان ميكانيكيتان مختلفتان بتتبادلو كل ثانية
    _evtTick() {
      const ctx = this._ctx(); if (!this.started) return;
      this._tickHi = !this._tickHi;
      const hi = this._tickHi;
      const t0 = ctx.currentTime + 0.012;
      // نقرة ضجيج ميكانيكية قصيرة (جسم التِك)
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(ctx, 0.03, false);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = hi ? 2850 : 2150;
      bp.Q.value = 5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.055, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
      src.connect(bp).connect(g).connect(this.master);
      src.start(t0); src.stop(t0 + 0.035);
      this._track(src);
      // جرس صغير بيدي النقرة جسمها المعدني
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hi ? 1900 : 1430;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.024, t0);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
      o.connect(og).connect(this.master);
      o.start(t0); o.stop(t0 + 0.05);
      this._track(o);
    },

    // تليفون بي رن في جناح بعيد — مكتوم ومهضوم
    _evtDistantPhone() {
      const ctx = this._ctx(); if (!this.started) return;
      const t0 = ctx.currentTime;
      [0, 2.4].forEach(off => {
        const amp = ctx.createGain();
        amp.gain.value = 0;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 950;
        amp.connect(lp).connect(this.master);

        [400, 450].forEach(f => {
          const o = ctx.createOscillator();
          o.type = 'sine'; o.frequency.value = f;
          const g = ctx.createGain(); g.gain.value = 0.5;
          o.connect(g).connect(amp);
          o.start(t0 + off); o.stop(t0 + off + 1.3);
          this._track(o);
        });
        // نبض الرن الكلاسيكي 20 هيرتز
        const am = ctx.createOscillator();
        am.frequency.value = 20;
        const amDepth = ctx.createGain();
        amDepth.gain.value = 0.5;
        am.connect(amDepth).connect(amp.gain);
        am.start(t0 + off); am.stop(t0 + off + 1.3);
        this._track(am);

        amp.gain.setValueAtTime(0.0001, t0 + off);
        amp.gain.linearRampToValueAtTime(0.08, t0 + off + 0.05);
        amp.gain.setValueAtTime(0.08, t0 + off + 1.15);
        amp.gain.linearRampToValueAtTime(0.0001, t0 + off + 1.3);
      });
    },

    // ورق بيتقلب بعيد
    _evtPaper() {
      const ctx = this._ctx(); if (!this.started) return;
      const t0 = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(ctx, 0.35, false);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.055, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      src.connect(hp).connect(g).connect(this.master);
      src.start(t0); src.stop(t0 + 0.35);
      this._track(src);
    },

    // ختمة بعيدة على ورق (مكتب جنبنا شغال)
    _evtDistantStamp() {
      const ctx = this._ctx(); if (!this.started) return;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t0);
      o.frequency.exponentialRampToValueAtTime(55, t0 + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.09, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      o.connect(g).connect(this.master);
      o.start(t0); o.stop(t0 + 0.14);
      this._track(o);
    },

    // طرقة باب خشبية بعيدة
    _evtDoorThud() {
      const ctx = this._ctx(); if (!this.started) return;
      [0, 0.22].forEach((off, i) => {
        const t0 = ctx.currentTime + off;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(70, t0);
        o.frequency.exponentialRampToValueAtTime(38, t0 + 0.18);
        const g = ctx.createGain();
        g.gain.setValueAtTime(i === 0 ? 0.12 : 0.085, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        o.connect(g).connect(this.master);
        o.start(t0); o.stop(t0 + 0.22);
        this._track(o);
      });
    },

    // ---------- أصوات تفاعل خصائص المكتب ----------
    // قلابة الشاي — رنّة ملعقة + دوايرة
    stirSound() {
      const ctx = this._ctx();
      const t0 = ctx.currentTime;
      [[2093, 0, 0.07], [2637, 0.16, 0.05]].forEach(pair => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = pair[0];
        const g = ctx.createGain();
        g.gain.setValueAtTime(pair[2], t0 + pair[1]);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + pair[1] + 0.3);
        o.connect(g).connect(ctx.destination);
        o.start(t0 + pair[1]); o.stop(t0 + pair[1] + 0.3);
      });
      // لفّة الشاي في الكوباية
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(ctx, 0.45, false);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 2;
      bp.frequency.setValueAtTime(1400, t0);
      bp.frequency.exponentialRampToValueAtTime(500, t0 + 0.45);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.04, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      src.connect(bp).connect(g).connect(ctx.destination);
      src.start(t0); src.stop(t0 + 0.5);
    },

    // ختمة الختم الخشبي الصغيرة
    thudProp() {
      const ctx = this._ctx();
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t0);
      o.frequency.exponentialRampToValueAtTime(60, t0 + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(t0); o.stop(t0 + 0.16);
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(ctx, 0.06, false);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.08, t0);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
      src.connect(lp).connect(ng).connect(ctx.destination);
      src.start(t0); src.stop(t0 + 0.06);
    },

    // رنة الهاتف الأرضي على المكتب
    ringLocal() {
      const ctx = this._ctx();
      const t0 = ctx.currentTime;
      const amp = ctx.createGain();
      amp.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2200;
      amp.connect(lp).connect(ctx.destination);
      [480, 620].forEach(f => {
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = 0.5;
        o.connect(g).connect(amp);
        o.start(t0); o.stop(t0 + 1.1);
      });
      const am = ctx.createOscillator();
      am.frequency.value = 16;
      const amDepth = ctx.createGain();
      amDepth.gain.value = 0.45;
      am.connect(amDepth).connect(amp.gain);
      am.start(t0); am.stop(t0 + 1.1);
      amp.gain.setValueAtTime(0.0001, t0);
      amp.gain.linearRampToValueAtTime(0.06, t0 + 0.04);
      amp.gain.setValueAtTime(0.06, t0 + 0.95);
      amp.gain.linearRampToValueAtTime(0.0001, t0 + 1.05);
    },

    // كشكشة السوداني
    crackleSound() {
      const ctx = this._ctx();
      let t = ctx.currentTime + 0.02;
      for (let i = 0; i < 4; i++) {
        const dur = 0.01 + Math.random() * 0.015;
        const src = ctx.createBufferSource();
        src.buffer = this._noiseBuffer(ctx, dur + 0.02, false);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2200 + Math.random() * 2400;
        bp.Q.value = 2.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.06 + Math.random() * 0.05, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
        src.connect(bp).connect(g).connect(ctx.destination);
        src.start(t); src.stop(t + dur + 0.02);
        t += 0.04 + Math.random() * 0.08;
      }
    },

    // قلب صفحة الملف الكرتون
    flipSound() {
      const ctx = this._ctx();
      const t0 = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(ctx, 0.3, false);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(900, t0);
      bp.frequency.exponentialRampToValueAtTime(2800, t0 + 0.28);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      src.connect(bp).connect(g).connect(ctx.destination);
      src.start(t0); src.stop(t0 + 0.3);
    },

    // ورقة خفيفة اتلمست
    rustleSmall() {
      const ctx = this._ctx();
      const t0 = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(ctx, 0.25, false);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.045, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      src.connect(hp).connect(g).connect(ctx.destination);
      src.start(t0); src.stop(t0 + 0.25);
    },

    // طقّة قلم
    flickSound() {
      const ctx = this._ctx();
      const t0 = ctx.currentTime;
      [[0, 0.05], [0.09, 0.035]].forEach(pair => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = 340;
        const g = ctx.createGain();
        g.gain.setValueAtTime(pair[1], t0 + pair[0]);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + pair[0] + 0.08);
        o.connect(g).connect(ctx.destination);
        o.start(t0 + pair[0]); o.stop(t0 + pair[0] + 0.08);
      });
    }
  };

  // ---------- تفاعلات خصائص المكتب (تستدعى من onclick) ----------
  window.DeskProps = {
    _pulse(el, cls, ms) {
      if (!el) return;
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), ms);
    },
    stir(e) {
      if (e) e.stopPropagation();
      this._pulse(e && e.currentTarget, 'stirring', 1500);
      if (!state.isMuted) Ambience.stirSound();
    },
    hit(e) {
      if (e) e.stopPropagation();
      this._pulse(e && e.currentTarget, 'stamping', 600);
      if (!state.isMuted) Ambience.thudProp();
    },
    ring(e) {
      if (e) e.stopPropagation();
      this._pulse(e && e.currentTarget, 'ringing', 1300);
      if (!state.isMuted) Ambience.ringLocal();
    },
    crack(e) {
      if (e) e.stopPropagation();
      this._pulse(e && e.currentTarget, 'cracking', 900);
      if (!state.isMuted) Ambience.crackleSound();
    },
    flip(e) {
      if (e) e.stopPropagation();
      this._pulse(e && e.currentTarget, 'flipping', 700);
      if (!state.isMuted) Ambience.flipSound();
    },
    flutter(e) {
      if (e) e.stopPropagation();
      this._pulse(e && e.currentTarget, 'fluttering', 1200);
      if (!state.isMuted) Ambience.rustleSmall();
    },
    flick(e) {
      if (e) e.stopPropagation();
      this._pulse(e && e.currentTarget, 'flicking', 600);
      if (!state.isMuted) Ambience.flickSound();
    }
  };

  window.Ambience = Ambience;

  // ---------- مشهد الديوان: مقاسات الكانفاس + ساعة حقيقية + لمبة بتنقط ----------
  const Scene = {
    IMG_W: 1344,
    IMG_H: 768,
    fit() {
      const host = document.querySelector('.desk-scene');
      const cv = document.getElementById('sceneCanvas');
      if (!host || !cv) return;
      const w = host.clientWidth || 0;
      const h = host.clientHeight || 0;
      if (!w || !h) return; // الشاشة مخفية لسه — الـ ResizeObserver هينادي تاني
      const AR = this.IMG_W / this.IMG_H;
      let cw = w, ch = w / AR;
      if (ch < h) { ch = h; cw = h * AR; }
      cv.style.width = cw + 'px';
      cv.style.height = ch + 'px';
      // البورتريه: الكانفاس يتثبت على نص اللوحة منزاح 4% — العناصر المرسومة على
      // الحروف (تليفون/سوداني/شاي شمال، أوراق يمين) تخرج بره المجال، ومكانها
      // عناصر SVG بمقاعد ثابتة في الشريط السفلي (Task 26 — كل عنصر في مكانه)
      const portrait = h > w;
      cv.style.left = '50%';
      cv.style.transform = portrait ? 'translate(calc(-50% - 4%), -50%)' : 'translate(-50%,-50%)';
      const visW = Math.min(100, (w / cw) * 100);
      cv.style.setProperty('--vis-w', visW + '%');
      cv.style.setProperty('--vis-cx', portrait ? '54%' : '50%');
      // الوضع العرضي: الكانفاس بيفيض فوق وتحت — المروحة لازم تنزل لحد أول حاجة ظاهرة
      // (كانت متثبتة على أول اللوحة فبتتقص بره الشاشة ومكانش باين منها حاجة)
      const visTop = Math.max(0, (ch - h) / 2);
      cv.style.setProperty('--vis-top', visTop + 'px');
    },
    tickClock() {
      const el = document.querySelector('.scene-clock');
      if (!el) return;
      const n = new Date();
      const m = n.getMinutes() + n.getSeconds() / 60;
      const hh = (n.getHours() % 12) * 30 + m * 0.5;
      el.style.setProperty('--hh', hh + 'deg');
      el.style.setProperty('--mh', (m * 6) + 'deg');
      el.style.setProperty('--sh', (n.getSeconds() * 6) + 'deg');
    },
    scheduleFlicker() {
      setTimeout(() => {
        const dim = document.getElementById('sceneDim');
        if (dim) {
          dim.classList.add('flickering');
          setTimeout(() => dim.classList.remove('flickering'), 1000);
        }
        this.scheduleFlicker();
      }, 42000 + Math.random() * 55000);
    },
    spinFan() {
      // الدوران بيتحرك من الجافاسكريبت (requestAnimationFrame + attribute transform)
      // بدل CSS animation — عشان يشتغل في كل المتصفحات حتى لو:
      // - الجهاز مفعّل "تقليل الحركة" (prefers-reduced-motion كان بيقفل الريش خالص)
      // - متصفح قديم بيتعامل غلط مع transform-box: view-box في الأنيميشن
      const blades = document.querySelector('.fan-blades');
      const shadow = document.querySelector('.fan-shadow-blades');
      if (!blades && !shadow) return;
      const DEG_PER_MS = 360 / 1150;   // لفة كل 1.15 ثانية — نفس إيقاع صوت "فَـشّ" المروحة
      let last = performance.now();
      let angle = 0;
      const step = (now) => {
        const dt = now - last;
        last = now;
        if (dt > 0 && dt < 400) {
          angle = (angle + DEG_PER_MS * dt) % 360;
          // الظل نسخة من نفس ريش المروحة بنفس الـviewBox — نفس المركز (120 45) ونفس الزاوية بالظبط
          if (blades) blades.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' 120 45)');
          if (shadow) shadow.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' 120 45)');
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    init() {
      this.fit();
      // الشاشة ممكن تكون display:none وقت التحميل — نراقب تغيّر مقاسها
      const host = document.querySelector('.desk-scene');
      if (host && window.ResizeObserver) {
        new ResizeObserver(() => this.fit()).observe(host);
      }
      window.addEventListener('resize', () => this.fit());
      window.addEventListener('orientationchange', () => this.fit());
      this.tickClock();
      setInterval(() => this.tickClock(), 1000);
      this.scheduleFlicker();
      this.spinFan();
    }
  };
  window.DiwanScene = Scene;
  Scene.init();

  // فتح الأجواء: أي لمسة حقيقية على الصفحة تشغّل الصوت — مقصود إن القايمة كاملة
  // (pointerdown + touchend + click + keydown) وعلى طول مش مرة واحدة، عشان iOS
  // وأي متصفح بيوقف الـ AudioContext بعد قفل الشاشة/تبديل التبويب يرجع يشتغل بأي لمسة
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function () { Ambience.unlock(); }, { passive: true });
  });
})();
