/* Camera: getUserMedia wrapper with graceful fallbacks and friendly,
   platform-specific permission guidance. */
(function (global) {
  'use strict';

  let stream = null;
  let currentVideo = null;

  function mkErr(name, msg) { const e = new Error(msg || name); e.name = name; return e; }

  function stop() {
    if (stream) { stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* ignore */ } }); }
    stream = null;
    if (currentVideo) { try { currentVideo.pause(); } catch (e) { /* ignore */ } currentVideo.srcObject = null; }
  }

  function constraintSets(facing) {
    const size = { width: { ideal: 1280 }, height: { ideal: 960 } };
    const sets = [];
    if (facing === 'environment') {
      sets.push({ video: Object.assign({ facingMode: { exact: 'environment' } }, size), audio: false });
    }
    sets.push({ video: Object.assign({ facingMode: { ideal: facing } }, size), audio: false });
    sets.push({ video: { facingMode: facing }, audio: false });
    sets.push({ video: true, audio: false });
    return sets;
  }

  async function start(video, facing) {
    stop();
    currentVideo = video;
    facing = facing || 'user';

    if (!window.isSecureContext) throw mkErr('InsecureContext');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw mkErr('Unsupported');

    let lastErr = null;
    const sets = constraintSets(facing);
    for (let i = 0; i < sets.length; i++) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(sets[i]);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        // Permission problems will not be fixed by relaxing constraints.
        if (e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError' || e.name === 'SecurityError' ||
          e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError' || e.name === 'NotReadableError')) break;
      }
    }
    if (!stream) throw lastErr || mkErr('NotFoundError');

    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.muted = true;
    video.srcObject = stream;

    await new Promise(function (resolve) {
      let done = false;
      function fin() { if (!done) { done = true; resolve(); } }
      video.onloadedmetadata = fin;
      video.onloadeddata = fin;
      setTimeout(fin, 4000);
    });
    try { await video.play(); } catch (e) { /* autoplay will still start on most browsers */ }

    const track = stream.getVideoTracks()[0];
    let actual = facing;
    try {
      const s = track && track.getSettings ? track.getSettings() : {};
      if (s.facingMode === 'user' || s.facingMode === 'environment') actual = s.facingMode;
    } catch (e) { /* ignore */ }

    return { facing: actual };
  }

  async function countVideoInputs() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      return list.filter(function (d) { return d.kind === 'videoinput'; }).length;
    } catch (e) { return 1; }
  }

  /* Draw the video centre-cropped ("cover") into a w x h area, optionally mirrored. */
  function drawCover(ctx, video, w, h, mirror) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const target = w / h, va = vw / vh;
    let sx, sy, sw, sh;
    if (va > target) { sh = vh; sw = vh * target; sx = (vw - sw) / 2; sy = 0; }
    else { sw = vw; sh = vw / target; sx = 0; sy = (vh - sh) / 2; }
    ctx.save();
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    ctx.restore();
  }

  function explain(err) {
    const name = (err && err.name) || '';
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    const inApp = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|Twitter|GSA\/|; wv\)/i.test(ua);

    let title = 'The camera could not start';
    let text = 'Something went wrong while opening the camera.';
    let steps = [];

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      title = 'Camera access is blocked';
      text = 'The photobooth needs your camera to work. Nothing is recorded or uploaded, the picture stays on your phone.';
      if (ios) {
        steps = [
          'Tap the “aA” icon in Safari’s address bar, then “Website Settings”.',
          'Set Camera to “Allow”.',
          'Come back here and tap “Try again”.',
          'Still stuck? Open Settings → Safari → Camera and choose “Ask” or “Allow”.'
        ];
      } else if (android) {
        steps = [
          'Tap the lock (or ⓘ) icon next to the web address.',
          'Open “Permissions” and set Camera to “Allow”.',
          'Come back here and tap “Try again”.',
          'Still stuck? Open Android Settings → Apps → Chrome → Permissions → Camera.'
        ];
      } else {
        steps = [
          'Click the camera icon on the right of the address bar (or the lock icon on the left).',
          'Choose “Allow” for the camera.',
          'Reload the page or tap “Try again”.'
        ];
      }
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      title = 'No camera found';
      text = 'This device doesn’t seem to have a camera that the browser can use.';
      steps = ['Check that a camera is connected and enabled.', 'Try again on your phone, the booth works best there.'];
    } else if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
      title = 'The camera is busy';
      text = 'Another app or browser tab is probably using the camera.';
      steps = ['Close other apps that use the camera (FaceTime, Zoom, Instagram…).', 'Close other browser tabs using the camera.', 'Tap “Try again”.'];
    } else if (name === 'InsecureContext') {
      title = 'A secure connection is needed';
      text = 'Browsers only allow camera access on secure (https) pages.';
      steps = ['Open the photobooth with a link that starts with https://.', 'If you are testing locally, use http://localhost or a free tunnel such as Cloudflare Tunnel.'];
    } else if (name === 'Unsupported') {
      title = 'This browser can’t use the camera';
      text = 'Camera access isn’t available in this browser.';
      steps = ['On iPhone, open the link in Safari.', 'On Android, open it in Chrome.'];
    } else if (err && err.message) {
      text = 'The browser said: ' + err.message;
      steps = ['Tap “Try again”.', 'Reload the page if it keeps happening.'];
    }

    if (inApp) {
      steps.unshift('It looks like you’re inside an in-app browser (Instagram, Messenger, Google app…). Open the link in ' +
        (ios ? 'Safari' : 'Chrome') + ' instead, usually via the “⋯” menu → “Open in browser”.');
    }
    return { title: title, text: text, steps: steps };
  }

  global.Camera = { start: start, stop: stop, drawCover: drawCover, countVideoInputs: countVideoInputs, explain: explain };
})(window);
