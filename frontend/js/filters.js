/* Filters: one definition drives both the LIVE preview (CSS filter + DOM
   overlay layers on the <video>) and the CAPTURE / THUMBNAIL render (canvas).
   Canvas path uses ctx.filter when the browser really supports it, and a
   pixel-level fallback (iOS Safari) otherwise, so what you see is what you get. */
(function (global) {
  'use strict';

  const BASE = { ops: [], blur: 0, tints: [], glow: 0, vignette: 0, grain: 0, scan: 0, labels: [] };

  const RAW = [
    { id: 'normal', name: 'Normal' },
    {
      id: 'vintage', name: 'Vintage Film',
      ops: [{ f: 'sepia', v: 0.35 }, { f: 'contrast', v: 1.1 }, { f: 'saturate', v: 1.25 }, { f: 'brightness', v: 1.05 }],
      tints: [{ c: 'rgb(255,196,120)', a: 0.14, b: 'soft-light' }], vignette: 0.38, grain: 0.22
    },
    {
      id: 'bw', name: 'Black & White',
      ops: [{ f: 'grayscale', v: 1 }, { f: 'contrast', v: 1.2 }, { f: 'brightness', v: 1.05 }],
      vignette: 0.28, grain: 0.18
    },
    {
      id: 'dreamy', name: 'Dreamy Pink',
      ops: [{ f: 'brightness', v: 1.08 }, { f: 'contrast', v: 0.92 }, { f: 'saturate', v: 1.2 }], blur: 0.18,
      tints: [{ c: 'rgb(255,150,190)', a: 0.3, b: 'soft-light' }, { c: 'rgb(255,190,215)', a: 0.16, b: 'screen' }],
      glow: 0.28, vignette: 0.12, grain: 0.08
    },
    {
      id: 'warm', name: 'Warm Glow',
      ops: [{ f: 'sepia', v: 0.2 }, { f: 'saturate', v: 1.3 }, { f: 'brightness', v: 1.08 }, { f: 'hue-rotate', v: -8 }],
      tints: [{ c: 'rgb(255,160,70)', a: 0.24, b: 'soft-light' }, { c: 'rgb(255,200,120)', a: 0.1, b: 'screen' }],
      glow: 0.18, vignette: 0.15, grain: 0.06
    },
    {
      id: 'cool', name: 'Cool Tone',
      ops: [{ f: 'saturate', v: 0.95 }, { f: 'hue-rotate', v: 8 }, { f: 'brightness', v: 1.04 }, { f: 'contrast', v: 1.06 }],
      tints: [{ c: 'rgb(110,170,255)', a: 0.26, b: 'soft-light' }, { c: 'rgb(150,200,255)', a: 0.07, b: 'screen' }],
      vignette: 0.2, grain: 0.06
    },
    {
      id: 'y2k', name: 'Y2K',
      ops: [{ f: 'saturate', v: 1.6 }, { f: 'contrast', v: 1.15 }, { f: 'brightness', v: 1.1 }, { f: 'hue-rotate', v: -10 }],
      tints: [{ c: 'rgb(255,110,220)', a: 0.2, b: 'screen' }, { c: 'rgb(70,200,255)', a: 0.14, b: 'overlay' }],
      glow: 0.22, grain: 0.08
    },
    {
      id: 'retro90', name: 'Retro 90s',
      ops: [{ f: 'contrast', v: 1.15 }, { f: 'saturate', v: 1.35 }, { f: 'sepia', v: 0.15 }, { f: 'brightness', v: 0.98 }],
      tints: [{ c: 'rgb(255,185,90)', a: 0.2, b: 'soft-light' }], vignette: 0.3, grain: 0.22,
      labels: [{ t: '@stamp', pos: 'br', color: '#ff9a2e', size: 7 }]
    },
    {
      id: 'faded', name: 'Faded Film',
      ops: [{ f: 'contrast', v: 0.85 }, { f: 'brightness', v: 1.1 }, { f: 'saturate', v: 0.8 }, { f: 'sepia', v: 0.1 }],
      tints: [{ c: 'rgb(238,226,214)', a: 0.2, b: 'normal' }], vignette: 0.1, grain: 0.16
    },
    {
      id: 'soft', name: 'Soft Focus',
      ops: [{ f: 'brightness', v: 1.08 }, { f: 'contrast', v: 0.9 }, { f: 'saturate', v: 1.1 }], blur: 0.35,
      glow: 0.3, vignette: 0.1
    },
    {
      id: 'vhs', name: 'VHS',
      ops: [{ f: 'saturate', v: 1.4 }, { f: 'contrast', v: 1.12 }, { f: 'hue-rotate', v: 6 }, { f: 'brightness', v: 1.02 }], blur: 0.12,
      tints: [{ c: 'rgb(255,40,140)', a: 0.1, b: 'screen' }, { c: 'rgb(0,170,255)', a: 0.08, b: 'screen' }],
      scan: 0.22, grain: 0.2,
      labels: [{ t: 'PLAY ▶', pos: 'tl', color: '#ffffff', size: 6.5 }, { t: '@vhsdate', pos: 'bl', color: '#ffffff', size: 6 }]
    },
    {
      id: 'sepia', name: 'Sepia',
      ops: [{ f: 'sepia', v: 1 }, { f: 'contrast', v: 1.05 }, { f: 'brightness', v: 1.05 }], vignette: 0.35, grain: 0.15
    }
  ];

  const LIST = RAW.map(function (f) { return Object.assign({}, BASE, f); });
  const BY_ID = {};
  LIST.forEach(function (f) { BY_ID[f.id] = f; });

  function get(id) { return BY_ID[id] || LIST[0]; }
  function has(id) { return !!BY_ID[id]; }

  /* ---------- helpers ---------- */
  function cssString(def, u) {
    const parts = def.ops.map(function (o) { return o.f + '(' + o.v + (o.f === 'hue-rotate' ? 'deg' : '') + ')'; });
    if (def.blur) parts.push('blur(' + (def.blur * u).toFixed(2) + 'px)');
    return parts.length ? parts.join(' ') : 'none';
  }

  function grainAlpha(g) { return Math.min(1, g * 2.4); }

  let noiseCanvas = null, noiseUrl = null;
  function noise() {
    if (!noiseCanvas) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      const id = x.createImageData(128, 128);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
        id.data[i + 3] = 255;
      }
      x.putImageData(id, 0, 0);
      noiseCanvas = c;
    }
    return noiseCanvas;
  }
  function noiseURL() { if (!noiseUrl) noiseUrl = noise().toDataURL('image/png'); return noiseUrl; }

  function labelText(t, d) {
    const p = function (n) { return String(n).padStart(2, '0'); };
    const mons = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    if (t === '@stamp') return "'" + p(d.getFullYear() % 100) + '  ' + p(d.getMonth() + 1) + '  ' + p(d.getDate());
    if (t === '@vhsdate') return mons[d.getMonth()] + '. ' + p(d.getDate()) + ' ' + d.getFullYear();
    return t;
  }

  const LEAK_CSS = 'radial-gradient(circle at 0% 18%, rgba(255,150,60,.95) 0%, rgba(255,150,60,0) 55%),' +
    'radial-gradient(circle at 100% 92%, rgba(255,80,150,.85) 0%, rgba(255,80,150,0) 52%)';

  /* ---------- live preview layers (DOM) ---------- */
  function buildLive(fx, def, o) {
    fx.textContent = '';
    function add(cls, style) {
      const d = document.createElement('div');
      if (cls) d.className = cls;
      Object.assign(d.style, style);
      fx.appendChild(d);
      return d;
    }
    def.tints.forEach(function (t) { add('tint', { background: t.c, opacity: t.a, mixBlendMode: t.b }); });
    if (def.glow) {
      add('glow', {
        background: 'radial-gradient(circle at 50% 38%, rgba(255,255,255,' + def.glow + ') 0%, rgba(255,255,255,0) 68%)',
        mixBlendMode: 'screen'
      });
    }
    if (def.vignette) {
      add('vig', { background: 'radial-gradient(circle at center, rgba(0,0,0,0) 52%, rgba(40,10,25,' + def.vignette + ') 100%)' });
    }
    if (o.grain && def.grain) {
      add('grain', { backgroundImage: 'url(' + noiseURL() + ')', opacity: grainAlpha(def.grain), mixBlendMode: 'overlay' });
    }
    if (def.scan) {
      const s = 'rgba(0,0,0,' + def.scan + ')';
      add('scan', {
        backgroundImage: 'repeating-linear-gradient(to bottom, ' + s + ' 0, ' + s + ' calc(var(--u) * .35), transparent calc(var(--u) * .35), transparent calc(var(--u) * .9))'
      });
    }
    if (o.leak) add('leak', { background: LEAK_CSS, opacity: 0.5, mixBlendMode: 'screen' });
    if (!o.noLabels) {
      def.labels.forEach(function (l) {
        const d = add('label ' + l.pos, { color: l.color, fontSize: 'calc(var(--u) * ' + l.size + ')' });
        d.textContent = labelText(l.t, o.date || new Date());
      });
    }
  }

  /* ---------- canvas: colour ops ---------- */
  let ctxFilterOK = null;
  function supportsCtxFilter() {
    if (ctxFilterOK !== null) return ctxFilterOK;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 2;
      const x = c.getContext('2d');
      if (!('filter' in x)) { ctxFilterOK = false; return false; }
      x.filter = 'grayscale(1)';
      x.fillStyle = 'rgb(255,0,0)';
      x.fillRect(0, 0, 2, 2);
      const p = x.getImageData(0, 0, 1, 1).data;
      ctxFilterOK = (p[0] === p[1] && p[1] === p[2]);
    } catch (e) { ctxFilterOK = false; }
    return ctxFilterOK;
  }

  function matrixPass(d, m) {
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = m[0] * r + m[1] * g + m[2] * b;
      d[i + 1] = m[3] * r + m[4] * g + m[5] * b;
      d[i + 2] = m[6] * r + m[7] * g + m[8] * b;
    }
  }

  function opMatrix(f, v) {
    if (f === 'grayscale') {
      const a = 1 - Math.min(1, v);
      return [0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a,
        0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a,
        0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a];
    }
    if (f === 'sepia') {
      const a = 1 - Math.min(1, v);
      return [0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a,
        0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a,
        0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a];
    }
    if (f === 'saturate') {
      return [0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v,
        0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v,
        0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v];
    }
    if (f === 'hue-rotate') {
      const rad = v * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
      return [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
    }
    return null;
  }

  function applyOpsPixels(ctx, w, h, ops) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data, n = d.length;
    ops.forEach(function (op) {
      const v = op.v;
      if (op.f === 'brightness') {
        for (let i = 0; i < n; i += 4) { d[i] *= v; d[i + 1] *= v; d[i + 2] *= v; }
      } else if (op.f === 'contrast') {
        const off = 127.5 * (1 - v);
        for (let i = 0; i < n; i += 4) { d[i] = d[i] * v + off; d[i + 1] = d[i + 1] * v + off; d[i + 2] = d[i + 2] * v + off; }
      } else {
        const m = opMatrix(op.f, v);
        if (m) matrixPass(d, m);
      }
    });
    ctx.putImageData(img, 0, 0);
  }

  let tmpCanvas = null;
  function blurFallback(ctx, w, h, px) {
    const k = Math.max(2, Math.round(px * 2));
    const tw = Math.max(1, Math.ceil(w / k)), th = Math.max(1, Math.ceil(h / k));
    if (!tmpCanvas) tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = tw; tmpCanvas.height = th;
    const t = tmpCanvas.getContext('2d');
    t.imageSmoothingEnabled = true;
    t.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, tw, th);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmpCanvas, 0, 0, tw, th, 0, 0, w, h);
    ctx.restore();
  }

  /* ---------- canvas: overlays (same order as DOM layers) ---------- */
  function overlays(ctx, w, h, def, o) {
    const u = o.u;
    def.tints.forEach(function (t) {
      ctx.save();
      ctx.globalAlpha = t.a;
      ctx.globalCompositeOperation = t.b === 'normal' ? 'source-over' : t.b;
      ctx.fillStyle = t.c;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    });
    if (def.glow) {
      const R = Math.hypot(0.5 * w, 0.62 * h);
      const g = ctx.createRadialGradient(w / 2, h * 0.38, 0, w / 2, h * 0.38, R);
      g.addColorStop(0, 'rgba(255,255,255,' + def.glow + ')');
      g.addColorStop(0.68, 'rgba(255,255,255,0)');
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
    }
    if (def.vignette) {
      const R = Math.hypot(w / 2, h / 2);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, R);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.52, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(40,10,25,' + def.vignette + ')');
      ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
    }
    if (o.grain && def.grain) {
      ctx.save();
      ctx.globalAlpha = grainAlpha(def.grain);
      ctx.globalCompositeOperation = 'overlay';
      const tile = 30 * u, n = noise();
      for (let y = 0; y < h; y += tile) for (let x = 0; x < w; x += tile) ctx.drawImage(n, x, y, tile, tile);
      ctx.restore();
    }
    if (def.scan) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,' + def.scan + ')';
      for (let y = 0; y < h; y += 0.9 * u) ctx.fillRect(0, y, w, 0.35 * u);
      ctx.restore();
    }
    if (o.leak) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.globalCompositeOperation = 'screen';
      let g = ctx.createRadialGradient(0, 0.18 * h, 0, 0, 0.18 * h, Math.hypot(w, 0.82 * h));
      g.addColorStop(0, 'rgba(255,150,60,.95)'); g.addColorStop(0.55, 'rgba(255,150,60,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      g = ctx.createRadialGradient(w, 0.92 * h, 0, w, 0.92 * h, Math.hypot(w, 0.92 * h));
      g.addColorStop(0, 'rgba(255,80,150,.85)'); g.addColorStop(0.52, 'rgba(255,80,150,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (!o.noLabels) {
      const date = o.date || new Date();
      def.labels.forEach(function (l) {
        ctx.save();
        ctx.font = (l.size * u) + 'px "VT323", "Courier New", monospace';
        ctx.fillStyle = l.color;
        ctx.shadowColor = 'rgba(0,0,0,.45)';
        ctx.shadowBlur = u * 1.2;
        let x, y;
        if (l.pos === 'tl') { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; x = 0.05 * w; y = 0.04 * h; }
        else if (l.pos === 'bl') { ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; x = 0.05 * w; y = 0.96 * h; }
        else { ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; x = 0.95 * w; y = 0.96 * h; }
        ctx.fillText(labelText(l.t, date), x, y);
        ctx.restore();
      });
    }
  }

  /* drawBase() must paint the un-filtered picture onto ctx (full w x h). */
  function render(ctx, w, h, drawBase, def, o) {
    const hasOps = def.ops.length > 0 || def.blur > 0;
    if (!hasOps) {
      drawBase();
    } else if (supportsCtxFilter()) {
      ctx.save();
      ctx.filter = cssString(def, o.u);
      drawBase();
      ctx.restore();
    } else {
      drawBase();
      if (def.ops.length) applyOpsPixels(ctx, w, h, def.ops);
      if (def.blur) blurFallback(ctx, w, h, def.blur * o.u);
    }
    overlays(ctx, w, h, def, o);
  }

  function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const loads = ['700 40px "Caveat"', '500 20px "VT323"', '700 40px "Playfair Display"'].map(function (f) {
      return document.fonts.load(f, '♡ AaBb 0123').catch(function () { return null; });
    });
    return Promise.race([Promise.all(loads), new Promise(function (r) { setTimeout(r, 2500); })]);
  }

  global.Filters = {
    list: LIST, get: get, has: has, cssString: cssString, buildLive: buildLive,
    render: render, supportsCtxFilter: supportsCtxFilter, noise: noise, ensureFonts: ensureFonts
  };
})(window);
