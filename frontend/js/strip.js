/* Strip: composes the captured photos into a vintage photobooth print using
   the Canvas API, including cute cut-out PNG stickers. */
(function (global) {
  'use strict';

  const FONT_SCRIPT = '"Caveat","Segoe Script","Bradley Hand",cursive';
  const FONT_MONO = '"Courier New",Courier,monospace';

  const LAYOUTS = [
    { id: 'classic', name: 'Classic strip' },
    { id: 'twin', name: 'Twin strips' },
    { id: 'grid', name: '2×2 collage' },
    { id: 'polaroid', name: 'Polaroids' }
  ];

  const STRIP_STICKERS = [
    { id: 'all', name: '✨ All Cute', preview: 's8' },
    { id: 'love', name: '💗 Love Bears', preview: 's7' },
    { id: 'cats', name: '🐱 Peach & Goma', preview: 's1' },
    { id: 'cool', name: '😎 Cool Duo', preview: 's6' },
    { id: 'none', name: 'None' }
  ];

  function lum(hex) {
    hex = String(hex).replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    const n = parseInt(hex, 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function heart(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx - s * 1.5, cy - s * 0.2, cx - s * 0.7, cy - s * 1.2, cx, cy - s * 0.4);
    ctx.bezierCurveTo(cx + s * 0.7, cy - s * 1.2, cx + s * 1.5, cy - s * 0.2, cx, cy + s * 0.9);
    ctx.closePath();
  }

  function star(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = (i % 2 === 0) ? r : r * 0.45;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function photoAt(ctx, src, x, y, w, h, r) {
    ctx.save();
    rr(ctx, x, y, w, h, r);
    ctx.clip();
    if (src) {
      const sa = src.width / src.height, ta = w / h;
      let sx = 0, sy = 0, sw = src.width, sh = src.height;
      if (sa > ta) { sw = sh * ta; sx = (src.width - sw) / 2; }
      else { sh = sw / ta; sy = (src.height - sh) * 0.35; }
      ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
    } else {
      ctx.fillStyle = '#e8d9de';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  function drawPattern(ctx, W, H, type, dark) {
    if (type === 'none') return;
    ctx.save();
    if (type === 'gingham') {
      ctx.fillStyle = dark ? 'rgba(255,255,255,.10)' : 'rgba(217,72,112,.10)';
      const b = 28;
      for (let x = 0; x < W; x += b * 2) ctx.fillRect(x, 0, b, H);
      for (let y = 0; y < H; y += b * 2) ctx.fillRect(0, y, W, b);
      ctx.restore();
      return;
    }
    ctx.fillStyle = dark ? 'rgba(255,255,255,.14)' : 'rgba(217,72,112,.16)';
    const sp = type === 'dots' ? 34 : 64;
    let row = 0;
    for (let y = sp / 2; y < H + sp; y += sp, row++) {
      for (let x = (row % 2 ? sp : sp / 2); x < W + sp; x += sp) {
        if (type === 'hearts') { heart(ctx, x, y, 9); ctx.fill(); }
        else if (type === 'stars') { star(ctx, x, y, 10); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.restore();
  }

  function paintPaper(ctx, W, H, o, dark) {
    ctx.fillStyle = o.color;
    ctx.fillRect(0, 0, W, H);
    drawPattern(ctx, W, H, o.pattern, dark);
  }

  function addFinish(ctx, W, H, dark) {
    const n = global.Filters.noise();
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.globalCompositeOperation = 'overlay';
    for (let y = 0; y < H; y += 128) for (let x = 0; x < W; x += 128) ctx.drawImage(n, x, y, 128, 128);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.07)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    ctx.restore();
  }

  function getPackKeys(packId) {
    if (packId === 'none') return [];
    if (packId === 'love') return ['s8', 's7', 's2', 's4'];
    if (packId === 'cats') return ['s1', 's2', 's7', 's8'];
    if (packId === 'cool') return ['s6', 's3', 's5', 's4'];
    return ['s8', 's7', 's1', 's6', 's2', 's4', 's3', 's5'];
  }

  function footer(ctx, cx, y, maxW, o, ink) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ff7fa1';
    heart(ctx, cx - 26, y - 62, 5); ctx.fill();
    heart(ctx, cx, y - 64, 8); ctx.fill();
    heart(ctx, cx + 26, y - 62, 5); ctx.fill();

    let cy = y;
    ctx.fillStyle = ink;
    if (o.caption) {
      let size = 54;
      ctx.font = '700 ' + size + 'px ' + FONT_SCRIPT;
      while (ctx.measureText(o.caption).width > maxW && size > 24) { size -= 2; ctx.font = '700 ' + size + 'px ' + FONT_SCRIPT; }
      ctx.fillText(o.caption, cx, cy);
      cy += 44;
    }
    if (o.showDate) {
      ctx.globalAlpha = 0.78;
      ctx.font = '600 21px ' + FONT_MONO;
      ctx.fillText(o.dateText, cx, cy);
    }
    ctx.restore();

    const keys = getPackKeys(o.stripSticker || 'all');
    if (keys.length && global.Decor && global.Decor.drawCutoutAt) {
      global.Decor.drawCutoutAt(ctx, keys[0], cx - maxW * 0.41, y - 14, 112, -10);
      global.Decor.drawCutoutAt(ctx, keys[1 % keys.length], cx + maxW * 0.41, y - 14, 112, 10);
    }
  }

  function classicAt(ctx, photos, o, ox, ink) {
    const x = ox + 36, w = 528, h = 500, gap = 24;
    let y = 36;
    for (let i = 0; i < 4; i++) { photoAt(ctx, photos[i], x, y, w, h, 5); y += h + gap; }
    const keys = getPackKeys(o.stripSticker || 'all');
    if (keys.length && global.Decor && global.Decor.drawCutoutAt) {
      global.Decor.drawCutoutAt(ctx, keys[2 % keys.length], ox + 520, 520, 96, 8);
      global.Decor.drawCutoutAt(ctx, keys[3 % keys.length], ox + 78, 1045, 96, -8);
      global.Decor.drawCutoutAt(ctx, keys[4 % keys.length], ox + 522, 1570, 96, 9);
    }
    const lastBottom = 36 + 3 * (h + gap) + h;
    footer(ctx, ox + 300, lastBottom + 88, 520, o, ink);
  }

  function drawClassic(ctx, photos, o, m) { classicAt(ctx, photos, o, 0, m.ink); }

  function drawTwin(ctx, photos, o, m) {
    classicAt(ctx, photos, o, 0, m.ink);
    classicAt(ctx, photos, o, 600, m.ink);
    ctx.save();
    ctx.setLineDash([12, 9]);
    ctx.strokeStyle = m.dark ? 'rgba(255,255,255,.45)' : 'rgba(90,47,66,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(600, 0); ctx.lineTo(600, m.H); ctx.stroke();
    ctx.restore();
  }

  function drawGrid(ctx, photos, o, m) {
    const w = 480, h = 560, gap = 24, mg = 36;
    for (let i = 0; i < 4; i++) {
      const cx = mg + (i % 2) * (w + gap), cy = mg + Math.floor(i / 2) * (h + gap);
      photoAt(ctx, photos[i], cx, cy, w, h, 6);
    }
    const keys = getPackKeys(o.stripSticker || 'all');
    if (keys.length && global.Decor && global.Decor.drawCutoutAt) {
      global.Decor.drawCutoutAt(ctx, keys[2 % keys.length], m.W / 2, mg + h + gap / 2, 118, -4);
      global.Decor.drawCutoutAt(ctx, keys[3 % keys.length], 76, 72, 98, -10);
      global.Decor.drawCutoutAt(ctx, keys[4 % keys.length], m.W - 76, 72, 98, 10);
    }
    const bottom = mg + 2 * h + gap;
    footer(ctx, m.W / 2, bottom + 92, 900, o, m.ink);
  }

  function drawPolaroid(ctx, photos, o, m) {
    const cards = [
      { cx: 285, cy: 330, rot: -5 }, { cx: 795, cy: 300, rot: 4 },
      { cx: 300, cy: 920, rot: 3 }, { cx: 790, cy: 950, rot: -4 }
    ];
    const cw = 440, ch = 540, b = 26, bb = 96;
    const cardDark = lum(o.cardColor) < 0.45;
    const keys = getPackKeys(o.stripSticker || 'all');
    for (let i = 0; i < 4; i++) {
      const c = cards[i];
      ctx.save();
      ctx.translate(c.cx, c.cy);
      ctx.rotate(c.rot * Math.PI / 180);
      ctx.shadowColor = 'rgba(60,20,40,.30)';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = o.cardColor;
      rr(ctx, -cw / 2, -ch / 2, cw, ch, 6);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      photoAt(ctx, photos[i], -cw / 2 + b, -ch / 2 + b, cw - 2 * b, ch - b - bb, 3);
      if (keys.length && global.Decor && global.Decor.drawCutoutAt) {
        global.Decor.drawCutoutAt(ctx, keys[(i + 2) % keys.length], 0, ch / 2 - bb / 2 + 2, 74, 0);
      } else {
        ctx.fillStyle = cardDark ? '#ffb6c8' : '#ff7fa1';
        heart(ctx, 0, ch / 2 - bb / 2 + 4, 10);
        ctx.fill();
      }
      ctx.restore();
    }
    footer(ctx, m.W / 2, 1340, 900, o, m.ink);
  }

  const SIZES = {
    classic: { size: [600, 2298], draw: drawClassic },
    twin: { size: [1200, 2298], draw: drawTwin },
    grid: { size: [1056, 1370], draw: drawGrid },
    polaroid: { size: [1080, 1500], draw: drawPolaroid }
  };

  function render(photos, o, scale) {
    const L = SIZES[o.layout] || SIZES.classic;
    const W = L.size[0], H = L.size[1];
    const S = Math.min(scale, Math.sqrt(9e6 / (W * H)));
    const c = document.createElement('canvas');
    c.width = Math.round(W * S);
    c.height = Math.round(H * S);
    const ctx = c.getContext('2d');
    ctx.scale(S, S);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const dark = lum(o.color) < 0.45;
    const ink = dark ? '#fff4f6' : '#5a2f42';
    paintPaper(ctx, W, H, o, dark);
    L.draw(ctx, photos, o, { W: W, H: H, ink: ink, dark: dark });
    if (o.finish) addFinish(ctx, W, H, dark);
    return c;
  }

  global.Strip = {
    render: render,
    LAYOUTS: LAYOUTS,
    STRIP_STICKERS: STRIP_STICKERS,
    ensureFonts: function () { return global.Filters.ensureFonts(); }
  };
})(window);
