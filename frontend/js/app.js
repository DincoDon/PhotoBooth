/* App controller: screens, camera flow, capture sequence, review, strip designer. */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  const DEFAULTS = {
    title: 'A Little Photobooth ♡',
    subtitle: '',
    enter_label: 'Enter Photobooth',
    welcome_note: 'From Anand to my Baby♡',
    default_caption: 'Love you Babyy ♡',
    default_filter: 'normal',
    countdown_seconds: 3,
    romantic_messages: [
      'Love you Baby ♡ You make every ordinary moment feel like a favourite memory.',
      'No filter needed. You’re already the prettiest thing in the frame.'
    ]
  };

  const COLORS = ['#ffd6e0', '#fff3df', '#ffffff', '#e4d7ff', '#d4f1e4', '#d3e8ff', '#fff1b8', '#f48fb1', '#c9344c', '#201a1e'];
  const CARD_COLORS = ['#fffdf9', '#ffffff', '#ffe3ea', '#2a2226'];
  const PATTERNS = [
    { id: 'hearts', name: '♡ Hearts' }, { id: 'stars', name: '✦ Stars' }, { id: 'dots', name: '• Dots' },
    { id: 'gingham', name: '▦ Gingham' }, { id: 'none', name: 'Plain' }
  ];
  const FORMATS = [{ id: 'png', name: 'PNG' }, { id: 'jpg', name: 'JPG' }];
  const TIMERS = [3, 5, 10, 0];
  const PHOTO_W = 900, PHOTO_H = 1200;

  function pad(n) { return String(n).padStart(2, '0'); }
  function todayISO() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDate(iso) { const p = (iso || todayISO()).split('-'); return p[2] + ' · ' + p[1] + ' · ' + p[0]; }
  function stamp() { const d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  const state = {
    cfg: DEFAULTS, screen: 'welcome',
    filterId: 'normal', mode: 'strip', facing: 'user', timer: 3,
    flash: true, grain: true, leak: false, sticker: 'bubu_hug', text: '',
    photos: [null, null, null, null], single: null, reviewKind: 'strip',
    job: null, busy: false, cancel: false, camReady: false, demoMode: false, demoPose: 0,
    noteShown: false, noteIdx: -1,
    design: {
      layout: 'classic', color: '#ffd6e0', cardColor: '#fffdf9', pattern: 'hearts',
      stripSticker: 'all', caption: 'Love you Babyyy ♡', showDate: true, date: todayISO(), format: 'png', finish: true
    }
  };

  let booted = false;

  Streamlit.onArgs(function (args) {
    if (!booted) boot(Object.assign({}, DEFAULTS, (args && args.config) || {}));
  });
  Streamlit.ready();
  Streamlit.setFrameHeight(Math.max(window.innerHeight || 0, 600));
  setTimeout(function () { if (!booted) boot(DEFAULTS); }, 600);

  let toastT;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  function setRich(el, text) {
    el.textContent = '';
    String(text).split('♡').forEach(function (part, i, arr) {
      el.appendChild(document.createTextNode(part));
      if (i < arr.length - 1) { const s = document.createElement('span'); s.className = 'heart'; s.textContent = '♡'; el.appendChild(s); }
    });
  }

  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === 'screen-' + id); });
    state.screen = id;
    if (id === 'booth') requestAnimationFrame(function () { fitViewfinder(); applyLive(); });
  }

  function chipRow(el, items, getActive, onPick) {
    el.textContent = '';
    items.forEach(function (it) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (it.id === getActive() ? ' active' : '');
      if (it.preview && Decor.cutoutUrls && Decor.cutoutUrls[it.preview]) {
        const im = document.createElement('img');
        im.src = Decor.cutoutUrls[it.preview];
        im.alt = '';
        b.appendChild(im);
      }
      const sp = document.createElement('span');
      sp.textContent = it.name;
      b.appendChild(sp);
      b.addEventListener('click', function () {
        el.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
        b.classList.add('active');
        onPick(it.id);
      });
      el.appendChild(b);
    });
  }

  function swatchRow(el, colors, getActive, onPick, withCustom) {
    el.textContent = '';
    colors.forEach(function (col) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (col.toLowerCase() === String(getActive()).toLowerCase() ? ' active' : '');
      b.style.background = col;
      b.setAttribute('aria-label', 'Colour ' + col);
      b.addEventListener('click', function () {
        el.querySelectorAll('.swatch').forEach(function (c) { c.classList.remove('active'); });
        b.classList.add('active');
        onPick(col);
      });
      el.appendChild(b);
    });
    if (withCustom) {
      const wrap = document.createElement('div');
      wrap.className = 'swatch custom';
      wrap.setAttribute('aria-label', 'Custom colour');
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.value = '#ffd6e0';
      inp.addEventListener('input', function () {
        el.querySelectorAll('.swatch').forEach(function (c) { c.classList.remove('active'); });
        wrap.classList.add('active');
        onPick(inp.value);
      });
      wrap.appendChild(inp);
      el.appendChild(wrap);
    }
  }

  function boot(cfg) {
    booted = true;
    state.cfg = cfg;

    setRich($('w-title'), cfg.title);
    if (cfg.subtitle) {
      $('w-sub').hidden = false;
      $('w-sub').textContent = cfg.subtitle;
    } else {
      $('w-sub').hidden = true;
    }
    $('btn-enter-label').textContent = cfg.enter_label;
    if (cfg.welcome_note) {
      $('w-note').hidden = false;
      $('w-note').textContent = cfg.welcome_note;
    } else {
      $('w-note').hidden = true;
    }
    if (cfg.to) { $('w-eyebrow').hidden = false; $('w-eyebrow').textContent = 'for ' + cfg.to + ' ♡'; }
    document.title = String(cfg.title).replace('♡', '').trim() || 'Photobooth';

    state.filterId = Filters.has(cfg.default_filter) ? cfg.default_filter : 'normal';
    state.timer = TIMERS.indexOf(Number(cfg.countdown_seconds)) >= 0 ? Number(cfg.countdown_seconds) : 3;
    state.design.caption = cfg.default_caption || 'Love you  ♡';
    updateTimerLabel();

    buildFloaties();
    buildRail();
    buildExtras();
    buildDesignControls();
    bindEvents();
    Filters.ensureFonts();
    setInterval(drawThumbs, 700);
  }

  function buildFloaties() {
    const box = $('floaties');
    const chars = ['♡', '✦', '★', '♥', '✧', '♡'];
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('span');
      s.textContent = chars[i % chars.length];
      s.style.left = (Math.random() * 100) + '%';
      s.style.fontSize = (12 + Math.random() * 20) + 'px';
      s.style.animationDuration = (11 + Math.random() * 14) + 's';
      s.style.animationDelay = (-Math.random() * 20) + 's';
      s.style.color = ['#ffb6c8', '#ffc9d6', '#e7dcff', '#ffd9a8', '#ff9fb8'][i % 5];
      box.appendChild(s);
    }
    if (Decor.cutoutUrls) {
      for (let i = 1; i <= 8; i++) {
        const im = document.createElement('img');
        im.className = 'float-sticker';
        im.src = Decor.cutoutUrls['s' + i];
        im.alt = '';
        im.style.left = ((i - 0.5) * 12) + '%';
        im.style.animationDuration = (15 + (i % 4) * 3) + 's';
        im.style.animationDelay = (-i * 2.3) + 's';
        box.appendChild(im);
      }
    }
  }

  function buildRail() {
    const rail = $('filter-rail');
    rail.textContent = '';
    Filters.list.forEach(function (def) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'filter-item' + (def.id === state.filterId ? ' active' : '');
      b.dataset.id = def.id;
      const c = document.createElement('canvas');
      c.width = 116; c.height = 148;
      const l = document.createElement('span');
      l.textContent = def.name;
      b.appendChild(c); b.appendChild(l);
      b.addEventListener('click', function () { selectFilter(def.id); });
      rail.appendChild(b);
    });
  }

  function selectFilter(id) {
    state.filterId = id;
    const rail = $('filter-rail');
    rail.querySelectorAll('.filter-item').forEach(function (b) {
      const act = b.dataset.id === id;
      b.classList.toggle('active', act);
      if (act) rail.scrollTo({ left: b.offsetLeft - rail.clientWidth / 2 + b.clientWidth / 2, behavior: 'smooth' });
    });
    applyLive();
  }

  function fitViewfinder() {
    const st = $('stage'), vf = $('viewfinder');
    const cs = getComputedStyle(st);
    const pw = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 16;
    const ph = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 16;
    const w = Math.max(120, Math.min(pw, ph * 0.75));
    vf.style.width = w + 'px';
    vf.style.height = (w / 0.75) + 'px';
    vf.style.setProperty('--u', (w / 100) + 'px');
  }

  function applyLive() {
    const vf = $('viewfinder');
    const u = (vf.clientWidth / 100) || 3.6;
    const def = Filters.get(state.filterId);
    $('video').style.filter = Filters.cssString(def, u);
    Filters.buildLive($('fx'), def, { grain: state.grain, leak: state.leak, u: u, date: new Date() });
    Decor.buildStickers($('stickers'), state.sticker);
    Decor.buildText($('photo-text'), state.text);
  }

  function drawBaseSource(ctx, w, h, poseIndex) {
    if (!state.demoMode) {
      const v = $('video');
      const mirror = state.facing === 'user';
      Camera.drawCover(ctx, v, w, h, mirror);
      return;
    }
    const grads = [
      ['#ffd6e0', '#fff0f5'],
      ['#ffe5ec', '#e8dff5'],
      ['#fff1d6', '#ffd6e0'],
      ['#e2f0cb', '#ffe5ec']
    ];
    const p = (typeof poseIndex === 'number' ? poseIndex : state.demoPose) % 4;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, grads[p][0]);
    g.addColorStop(1, grads[p][1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const mainKeys = ['s8', 's7', 's6', 's1'];
    Decor.drawCutoutAt(ctx, mainKeys[p], w * 0.5, h * 0.52, w * 0.58, 0);
  }

  function drawThumbs() {
    if (state.screen !== 'booth' || !state.camReady || state.busy || document.hidden) return;
    const v = $('video');
    if (!state.demoMode && !v.videoWidth) return;
    $('filter-rail').querySelectorAll('.filter-item').forEach(function (b) {
      const c = b.querySelector('canvas');
      const ctx = c.getContext('2d');
      const def = Filters.get(b.dataset.id);
      try {
        Filters.render(ctx, c.width, c.height, function () { drawBaseSource(ctx, c.width, c.height, 0); },
          def, { grain: state.grain, leak: false, u: c.width / 100, date: new Date(), noLabels: true });
      } catch (e) { /* ignore */ }
    });
  }

  function buildExtras() {
    chipRow($('opt-stickers'), Decor.stickers, function () { return state.sticker; }, function (id) { state.sticker = id; applyLive(); });
    on($('opt-photo-text'), 'input', function (e) { state.text = e.target.value; Decor.buildText($('photo-text'), state.text); });
    on($('opt-flash'), 'change', function (e) { state.flash = e.target.checked; });
    on($('opt-grain'), 'change', function (e) { state.grain = e.target.checked; applyLive(); });
    on($('opt-leak'), 'change', function (e) { state.leak = e.target.checked; applyLive(); });
    on($('btn-extras'), 'click', function () { $('sheet-extras').hidden = false; });
    on($('btn-extras-done'), 'click', function () { $('sheet-extras').hidden = true; });
    on($('sheet-extras'), 'click', function (e) { if (e.target === $('sheet-extras')) $('sheet-extras').hidden = true; });
  }

  function updateTimerLabel() { $('timer-label').textContent = state.timer ? state.timer + 's' : 'Off'; }

  let camToken = 0;
  async function startCamera() {
    const tok = ++camToken;
    state.camReady = false;
    state.demoMode = false;
    const msg = $('vf-msg');
    msg.hidden = false;
    msg.textContent = 'Starting camera…';
    try {
      const r = await Camera.start($('video'), state.facing);
      if (tok !== camToken) return;
      state.facing = r.facing;
      state.camReady = true;
      $('video').classList.toggle('mirror', r.facing === 'user');
      msg.hidden = true;
      applyLive();
      Camera.countVideoInputs().then(function (n) { $('btn-switch').hidden = n < 2; });
      if (state.job) setHint(state.job.single ? 'Retake: tap the shutter' : 'Retake photo ' + (state.job.index + 1) + ': tap the shutter');
    } catch (e) {
      if (tok !== camToken) return;
      state.camReady = false;
      showError(e);
    }
  }

  function startDemoCamera() {
    stopCamera();
    state.demoMode = true;
    state.camReady = true;
    show('booth');
    const msg = $('vf-msg');
    msg.hidden = false;
    msg.style.background = 'linear-gradient(145deg, rgba(255,214,224,.92), rgba(231,220,255,.92))';
    msg.style.color = '#d94870';
    msg.textContent = '';
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';
    const im = document.createElement('img');
    im.src = Decor.cutoutUrls.s8;
    im.alt = '';
    im.style.width = '140px';
    const txt = document.createElement('div');
    txt.style.fontFamily = 'var(--font-script)';
    txt.style.fontSize = '26px';
    txt.textContent = 'Love you Mam ♡';
    wrap.appendChild(im);
    wrap.appendChild(txt);
    msg.appendChild(wrap);
    applyLive();
    setTimeout(drawThumbs, 100);
  }

  function stopCamera() { camToken++; Camera.stop(); state.camReady = false; }

  function showError(e) {
    const info = Camera.explain(e);
    $('err-title').textContent = info.title;
    $('err-text').textContent = info.text;
    const ol = $('err-steps');
    ol.textContent = '';
    info.steps.slice(0, 2).forEach(function (s) { const li = document.createElement('li'); li.textContent = s; ol.appendChild(li); });
    show('error');
  }

  function enterBooth() {
    show('booth');
    $('dots').hidden = state.mode !== 'strip';
    resetDots();
    if (!state.job) setHint('');
    startCamera();
  }

  let audioCtx = null;
  function shutterClick() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1200, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.08);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.11);
    } catch (e) { /* ignore */ }
  }

  function setHint(t) { const h = $('vf-hint'); h.textContent = t || ''; h.classList.toggle('on', !!t); }
  function resetDots() { $('dots').querySelectorAll('i').forEach(function (d) { d.classList.remove('on'); }); }
  function setDots(n) { $('dots').querySelectorAll('i').forEach(function (d, i) { d.classList.toggle('on', i < n); }); }

  async function countdown(n) {
    const el = $('countdown');
    for (let i = n; i > 0; i--) {
      if (state.cancel) { el.textContent = ''; return false; }
      el.textContent = '';
      const s = document.createElement('span');
      s.textContent = i;
      el.appendChild(s);
      await sleep(1000);
    }
    el.textContent = '';
    return !state.cancel;
  }

  function doFlash() {
    if (!state.flash) return;
    const f = $('flash');
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  function capturePhoto(poseIndex) {
    const c = document.createElement('canvas');
    c.width = PHOTO_W; c.height = PHOTO_H;
    const ctx = c.getContext('2d');
    const def = Filters.get(state.filterId);
    Filters.render(ctx, PHOTO_W, PHOTO_H, function () { drawBaseSource(ctx, PHOTO_W, PHOTO_H, poseIndex); },
      def, { grain: state.grain, leak: state.leak, u: PHOTO_W / 100, date: new Date() });
    Decor.drawStickers(ctx, PHOTO_W, PHOTO_H, state.sticker);
    Decor.drawText(ctx, PHOTO_W, PHOTO_H, state.text);
    state.demoPose++;
    return c;
  }

  async function freeze(c) {
    const t = document.createElement('canvas');
    t.width = 300; t.height = 400;
    t.getContext('2d').drawImage(c, 0, 0, 300, 400);
    const img = $('freeze');
    img.src = t.toDataURL('image/jpeg', 0.8);
    img.classList.add('on');
    await sleep(750);
    img.classList.remove('on');
  }

  async function takeOne(hint, poseIndex) {
    setHint(hint);
    let ok;
    if (state.timer > 0) ok = await countdown(state.timer);
    else { await sleep(350); ok = !state.cancel; }
    setHint('');
    if (!ok) return null;
    doFlash();
    shutterClick();
    const c = capturePhoto(poseIndex);
    await freeze(c);
    return c;
  }

  async function onShutter() {
    if (state.busy) { state.cancel = true; return; }
    if (!state.camReady) { toast('The camera isn’t ready yet'); return; }
    state.busy = true;
    state.cancel = false;
    $('btn-shutter').classList.add('busy');
    document.body.classList.add('shooting');
    let nextKind = null;
    try {
      const job = state.job;
      if (job) {
        const c = await takeOne(job.single ? 'Retaking ♡' : 'Retaking photo ' + (job.index + 1), job.index);
        if (c) {
          if (job.single) state.single = c; else state.photos[job.index] = c;
          state.job = null;
          nextKind = job.single ? 'photo' : 'strip';
        }
      } else if (state.mode === 'strip') {
        const shots = [];
        resetDots();
        for (let i = 0; i < 4; i++) {
          const c = await takeOne('Photo ' + (i + 1) + ' of 4', i);
          if (!c) break;
          shots.push(c);
          setDots(shots.length);
          if (i < 3) await sleep(250);
        }
        if (shots.length === 4) { state.photos = shots; state.noteShown = false; nextKind = 'strip'; }
        else { resetDots(); toast('Cancelled, no worries ♡'); }
      } else {
        const c = await takeOne('Smile ♡', state.demoPose);
        if (c) { state.single = c; nextKind = 'photo'; }
      }
    } catch (e) {
      toast('Something went wrong taking the picture. Please try again.');
    } finally {
      state.busy = false;
      state.cancel = false;
      setHint('');
      $('countdown').textContent = '';
      $('btn-shutter').classList.remove('busy');
      document.body.classList.remove('shooting');
    }
    if (nextKind) goReview(nextKind);
  }

  function thumbURL(c) {
    const t = document.createElement('canvas');
    t.width = 300; t.height = 400;
    t.getContext('2d').drawImage(c, 0, 0, 300, 400);
    return t.toDataURL('image/jpeg', 0.85);
  }

  function goReview(kind) {
    state.reviewKind = kind;
    stopCamera();
    renderReview();
    show('review');
  }

  function renderReview() {
    const strip = state.reviewKind === 'strip';
    const grid = $('review-grid');
    grid.textContent = '';
    grid.classList.toggle('single', !strip);
    const items = strip ? state.photos : [state.single];
    const badgeKeys = ['s1', 's2', 's6', 's8'];
    items.forEach(function (c, i) {
      if (!c) return;
      const card = document.createElement('div');
      card.className = 'review-card';
      card.style.animationDelay = (i * 0.08) + 's';
      const img = document.createElement('img');
      img.className = 'photo-thumb';
      img.src = thumbURL(c);
      img.alt = 'Photo ' + (i + 1);
      card.appendChild(img);

      if (Decor.cutoutUrls && Decor.cutoutUrls[badgeKeys[i % badgeKeys.length]]) {
        const st = document.createElement('img');
        st.className = 'card-sticker';
        st.src = Decor.cutoutUrls[badgeKeys[i % badgeKeys.length]];
        st.alt = '';
        card.appendChild(st);
      }

      const acts = document.createElement('div');
      acts.className = 'acts';
      const retake = document.createElement('button');
      retake.type = 'button'; retake.textContent = '↺ Retake';
      retake.addEventListener('click', function () { state.job = { index: i, single: !strip }; enterBooth(); });
      const save = document.createElement('button');
      save.type = 'button'; save.textContent = '⬇ Save';
      save.addEventListener('click', function () { savePhoto(c, i); });
      acts.appendChild(retake); acts.appendChild(save);
      if (strip) { const n = document.createElement('div'); n.className = 'no'; n.textContent = (i + 1) + ' / 4'; card.appendChild(n); }
      card.appendChild(acts);
      grid.appendChild(card);
    });
    $('btn-make-strip').hidden = !strip;
    $('btn-review-booth').textContent = strip ? 'Retake all' : 'Keep shooting';
    $('review-title').textContent = strip ? 'Your four little moments' : 'Your photo';
  }

  function canvasToBlob(c, type, q) {
    return new Promise(function (resolve) { c.toBlob(resolve, type, q); });
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }

  async function savePhoto(c, i) {
    const blob = await canvasToBlob(c, 'image/jpeg', 0.95);
    if (!blob) { toast('Could not save that photo'); return; }
    download(blob, 'photo-' + stamp() + '-' + (i + 1) + '.jpg');
    toast('Saved ♡ check your downloads');
  }

  function buildDesignControls() {
    const d = state.design;
    chipRow($('opt-layout'), Strip.LAYOUTS, function () { return d.layout; }, function (id) {
      d.layout = id; $('row-card').hidden = id !== 'polaroid'; scheduleDesign();
    });
    if ($('opt-strip-stickers') && Strip.STRIP_STICKERS) {
      chipRow($('opt-strip-stickers'), Strip.STRIP_STICKERS, function () { return d.stripSticker; }, function (id) {
        d.stripSticker = id; scheduleDesign();
      });
    }
    swatchRow($('opt-color'), COLORS, function () { return d.color; }, function (v) { d.color = v; scheduleDesign(); }, true);
    swatchRow($('opt-card'), CARD_COLORS, function () { return d.cardColor; }, function (v) { d.cardColor = v; scheduleDesign(); }, false);
    chipRow($('opt-pattern'), PATTERNS, function () { return d.pattern; }, function (id) { d.pattern = id; scheduleDesign(); });
    chipRow($('opt-format'), FORMATS, function () { return d.format; }, function (id) { d.format = id; });

    $('opt-caption').value = d.caption;
    $('opt-date-value').value = d.date;
    on($('opt-caption'), 'input', function (e) { d.caption = e.target.value; scheduleDesign(); });
    on($('opt-date'), 'change', function (e) { d.showDate = e.target.checked; $('opt-date-value').hidden = !d.showDate; scheduleDesign(); });
    on($('opt-date-value'), 'input', function (e) { d.date = e.target.value || todayISO(); scheduleDesign(); });
    on($('opt-finish'), 'change', function (e) { d.finish = e.target.checked; scheduleDesign(); });
  }

  function designOpts() {
    const d = state.design;
    return {
      layout: d.layout, color: d.color, cardColor: d.cardColor, pattern: d.pattern,
      stripSticker: d.stripSticker, caption: d.caption.trim(),
      showDate: d.showDate, dateText: fmtDate(d.date), finish: d.finish
    };
  }

  let designT = null;
  function scheduleDesign() { clearTimeout(designT); designT = setTimeout(renderDesignPreview, 50); }

  async function renderDesignPreview() {
    if (state.photos.some(function (p) { return !p; })) return;
    await Strip.ensureFonts();
    const c = Strip.render(state.photos, designOpts(), 0.8);
    const cv = $('strip-canvas');
    cv.width = c.width; cv.height = c.height;
    cv.getContext('2d').drawImage(c, 0, 0);
  }

  function openDesigner() {
    show('design');
    scheduleDesign();
    if (!state.noteShown) { state.noteShown = true; setTimeout(function () { showNote(); }, 700); }
  }

  async function exportStrip(scale) {
    await Strip.ensureFonts();
    const c = Strip.render(state.photos, designOpts(), scale);
    const jpg = state.design.format === 'jpg';
    const blob = await canvasToBlob(c, jpg ? 'image/jpeg' : 'image/png', 0.95);
    if (!blob) throw new Error('Could not create the image');
    return { blob: blob, name: 'photo-strip-' + stamp() + (jpg ? '.jpg' : '.png') };
  }

  async function withBusy(btn, fn) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Working…';
    try { await fn(); } catch (e) { toast('Oops, that didn’t work. Please try again.'); }
    btn.disabled = false;
    btn.textContent = label;
  }

  let modalUrl = null;
  function openImage(blob) {
    if (modalUrl) URL.revokeObjectURL(modalUrl);
    modalUrl = URL.createObjectURL(blob);
    $('modal-img').src = modalUrl;
    $('modal-image').hidden = false;
  }

  function showNote() {
    const list = (state.cfg.romantic_messages && state.cfg.romantic_messages.length) ? state.cfg.romantic_messages : DEFAULTS.romantic_messages;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === state.noteIdx) i = (i + 1) % list.length;
    state.noteIdx = i;
    $('note-text').textContent = list[i];
    $('modal-note').hidden = false;
  }

  function bindEvents() {
    on($('btn-enter'), 'click', function () { state.job = null; enterBooth(); });
    on($('btn-home'), 'click', function () { state.job = null; stopCamera(); show('welcome'); });
    on($('btn-switch'), 'click', function () {
      state.facing = state.facing === 'user' ? 'environment' : 'user';
      startCamera();
    });
    on($('btn-shutter'), 'click', onShutter);
    on($('btn-timer'), 'click', function () {
      state.timer = TIMERS[(TIMERS.indexOf(state.timer) + 1) % TIMERS.length];
      updateTimerLabel();
      toast(state.timer ? 'Countdown: ' + state.timer + ' seconds' : 'Countdown off');
    });
    document.querySelectorAll('.mode-toggle button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.mode = b.dataset.mode;
        document.querySelectorAll('.mode-toggle button').forEach(function (x) { x.classList.toggle('active', x === b); });
        $('dots').hidden = state.mode !== 'strip';
        resetDots();
      });
    });

    on($('btn-review-back'), 'click', function () { state.job = null; enterBooth(); });
    on($('btn-review-booth'), 'click', function () { state.job = null; enterBooth(); });
    on($('btn-make-strip'), 'click', openDesigner);

    on($('btn-design-back'), 'click', function () { show('review'); });
    on($('design-preview'), 'click', function () {
      exportStrip(1).then(function (r) { openImage(r.blob); }).catch(function () { toast('Could not open the preview'); });
    });
    on($('btn-download'), 'click', function () {
      withBusy($('btn-download'), async function () {
        const r = await exportStrip(2);
        download(r.blob, r.name);
        toast('Saved ♡');
      });
    });
    on($('btn-share'), 'click', function () {
      withBusy($('btn-share'), async function () {
        const r = await exportStrip(2);
        try {
          const file = new File([r.blob], r.name, { type: r.blob.type });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Love you Adriana ♡' });
          } else {
            openImage(r.blob);
            toast('Press and hold the picture to save it ♡');
          }
        } catch (e) {
          if (e && e.name === 'AbortError') return;
          openImage(r.blob);
          toast('Press and hold the picture to save it ♡');
        }
      });
    });

    on($('btn-err-retry'), 'click', function () { enterBooth(); });
    on($('btn-err-demo'), 'click', function () { startDemoCamera(); });
    on($('btn-err-home'), 'click', function () { state.job = null; stopCamera(); show('welcome'); });

    on($('btn-note-more'), 'click', function () { showNote(); });
    on($('btn-note-close'), 'click', function () { $('modal-note').hidden = true; });
    on($('btn-image-close'), 'click', function () { $('modal-image').hidden = true; });

    window.addEventListener('resize', function () {
      if (state.screen === 'booth') { fitViewfinder(); applyLive(); }
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { if (state.screen === 'booth') { fitViewfinder(); applyLive(); } }, 300);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (state.screen === 'booth' && !state.busy && !state.demoMode) { stopCamera(); }
      } else if (state.screen === 'booth' && !state.busy && !state.camReady) {
        startCamera();
      }
    });
  }
})();
