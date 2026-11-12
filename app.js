/* GhostCut — a free, private, in-browser video editor.
 * No build step, no dependencies. Open index.html (or serve the folder) and edit.
 */
'use strict';
(() => {
  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const EPS = 1e-4;
  const MIN_DUR = 0.1;
  const HEAD_W = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head-w')) || 132;

  const fmt = (t, withMs = true) => {
    if (!isFinite(t)) t = 0;
    const m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${withMs ? '.' + String(cs).padStart(2, '0') : ''}`;
  };
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'style') n.style.cssText = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  };
  const toast = (msg, ms = 2600) => {
    const t = el('div', { class: 'toast' }, msg);
    $('#toasts').append(t);
    setTimeout(() => t.remove(), ms);
  };
  const once = (target, ev, timeout = 8000) => new Promise((res, rej) => {
    const to = setTimeout(() => { cleanup(); rej(new Error('timeout: ' + ev)); }, timeout);
    const ok = () => { cleanup(); res(); };
    const bad = () => { cleanup(); rej(new Error('error loading media')); };
    const cleanup = () => { clearTimeout(to); target.removeEventListener(ev, ok); target.removeEventListener('error', bad); };
    target.addEventListener(ev, ok);
    target.addEventListener('error', bad);
  });

  // ------------------------------------------------------------------
  // constants
  // ------------------------------------------------------------------
  const NO_FILTER = { brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0 };
  const FILTER_PRESETS = {
    none:    { label: 'Original', f: {} },
    vivid:   { label: 'Vivid',    f: { brightness: 104, contrast: 115, saturate: 150 } },
    bw:      { label: 'B&W',      f: { grayscale: 100, contrast: 120 } },
    vintage: { label: 'Vintage',  f: { sepia: 45, contrast: 92, brightness: 106, saturate: 85 } },
    warm:    { label: 'Warm',     f: { sepia: 22, saturate: 125, brightness: 103 } },
    cool:    { label: 'Cool',     f: { hue: 12, saturate: 90, contrast: 105, brightness: 102 } },
    drama:   { label: 'Drama',    f: { contrast: 145, brightness: 90, saturate: 115 } },
    dream:   { label: 'Dreamy',   f: { contrast: 82, brightness: 112, saturate: 80, blur: 1 } },
  };
  const PRESET_CSS = (key) => filterStr({ ...NO_FILTER, ...FILTER_PRESETS[key].f }, 0.15);

  const FONTS = [
    ['system-ui, sans-serif', 'Sans'],
    ['Impact, "Arial Black", sans-serif', 'Impact'],
    ['Georgia, "Times New Roman", serif', 'Serif'],
    ['"Courier New", monospace', 'Mono'],
    ['"Comic Sans MS", "Comic Neue", cursive', 'Comic'],
    ['"Trebuchet MS", sans-serif', 'Trebuchet'],
    ['"Brush Script MT", cursive', 'Script'],
  ];

  const TEXT_PRESETS = [
    { name: 'Basic',     t: { text: 'Your text', color: '#ffffff' } },
    { name: 'Caption',   t: { text: 'when the code works first try', color: '#ffffff', stroke: '#000000', strokeW: 10, bold: true, size: 72, y: 0.72 } },
    { name: 'Title',     t: { text: 'BIG TITLE', font: FONTS[1][0], size: 150, color: '#ffffff', shadow: true, anim: 'pop' } },
    { name: 'Boxed',     t: { text: 'Boxed', color: '#111111', bg: '#ffd43b', bold: true, anim: 'slide' } },
    { name: 'Neon',      t: { text: 'neon vibes', color: '#22d3ee', glow: true, bold: true, size: 110, anim: 'fade' } },
    { name: 'Subtitle',  t: { text: 'subtitle goes here', color: '#ffffff', bg: '#000000aa', size: 52, y: 0.86 } },
    { name: 'Typewriter',t: { text: 'typing...', font: FONTS[3][0], color: '#a3e635', size: 80, anim: 'typewriter' } },
    { name: 'Meme',      t: { text: 'TOP TEXT', font: FONTS[1][0], color: '#ffffff', stroke: '#000000', strokeW: 14, size: 120, y: 0.12 } },
  ];
  const STICKERS = '😂 💀 🔥 ✨ 👻 😭 🤯 😎 🥹 ❤️ 💯 👀 🎉 🙏 😤 🫡 🤡 💅 🗿 ⭐ ⚡ 🌈 🎵 📸 🍕 🐐 👑 💸 🚀 ✅ ❌ ⬆️ ➡️ 💬 ❓ ‼️'.split(' ');

  const ANIMS = [['none', 'None'], ['fade', 'Fade in'], ['pop', 'Pop'], ['slide', 'Slide up'], ['typewriter', 'Typewriter']];

  // ------------------------------------------------------------------
  // state
  // ------------------------------------------------------------------
  const newTrack = (kind) => ({ id: uid(), kind, clips: [], muted: false, hidden: false });

  const state = {
    project: {
      aspect: '9:16', res: 720, bg: '#000000',
      tracks: [newTrack('visual'), newTrack('visual'), newTrack('audio')],
    },
    media: new Map(),     // id -> media record (not serialised)
    selectedId: null,
    time: 0,
    playing: false,
    pps: 80,              // timeline pixels per second
    snap: true,
    exporting: null,
  };

  const canvas = $('#stage');
  const ctx = canvas.getContext('2d');

  const tracks = () => state.project.tracks;
  const allClips = () => tracks().flatMap(t => t.clips);
  const findClip = (id) => {
    for (const tr of tracks()) { const c = tr.clips.find(c => c.id === id); if (c) return { clip: c, track: tr }; }
    return null;
  };
  const selected = () => (state.selectedId ? findClip(state.selectedId) : null);
  const clipEnd = (c) => c.start + c.duration;
  const projectDuration = () => allClips().reduce((m, c) => Math.max(m, clipEnd(c)), 0);
  const mainTrack = () => { const v = tracks().filter(t => t.kind === 'visual'); return v[v.length - 1]; };
  const trackKindFor = (type) => (type === 'audio' ? 'audio' : 'visual');
  const isActive = (c, t) => t >= c.start - EPS && t < clipEnd(c) - EPS;
  const srcLimit = (c) => {           // max timeline duration a clip may have from its source
    const m = state.media.get(c.mediaId);
    if (!m || !isFinite(m.duration) || c.type === 'image' || c.type === 'text') return Infinity;
    return (m.duration - c.in) / c.speed;
  };

  // ------------------------------------------------------------------
  // canvas size
  // ------------------------------------------------------------------
  function dims() {
    const [a, b] = state.project.aspect.split(':').map(Number);
    const short = state.project.res;
    const even = (x) => Math.round(x / 2) * 2;
    return a >= b ? { W: even(short * a / b), H: short } : { W: short, H: even(short * b / a) };
  }
  function applyCanvasSize() {
    const { W, H } = dims();
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    fitStage();
  }
  function fitStage() {
    const wrap = $('#stageWrap');
    const pad = 28;
    const aw = wrap.clientWidth - pad, ah = wrap.clientHeight - pad;
    const s = Math.min(aw / canvas.width, ah / canvas.height);
    if (s > 0 && isFinite(s)) {
      canvas.style.width = Math.floor(canvas.width * s) + 'px';
      canvas.style.height = Math.floor(canvas.height * s) + 'px';
    }
  }
  new ResizeObserver(fitStage).observe($('#stageWrap'));

  // ------------------------------------------------------------------
  // history (undo / redo)
  // ------------------------------------------------------------------
  const history = { stack: [], idx: -1 };
  function commit() {
    const snap = JSON.stringify(state.project);
    if (history.stack[history.idx] !== snap) {
      history.stack = history.stack.slice(0, history.idx + 1);
      history.stack.push(snap);
      if (history.stack.length > 150) history.stack.shift();
      history.idx = history.stack.length - 1;
    }
    afterChange();
  }
  function restore(i) {
    history.idx = i;
    state.project = JSON.parse(history.stack[i]);
    if (state.selectedId && !findClip(state.selectedId)) state.selectedId = null;
    for (const c of allClips()) { const m = state.media.get(c.mediaId); if (m) m.removed = false; }
    renderMediaGrid();
    syncTopbar();
    afterChange(true);
  }
  const undo = () => { if (history.idx > 0) restore(history.idx - 1); };
  const redo = () => { if (history.idx < history.stack.length - 1) restore(history.idx + 1); };
  function afterChange(rebuildInspector = false) {
    $('#undoBtn').disabled = history.idx <= 0;
    $('#redoBtn').disabled = history.idx >= history.stack.length - 1;
    gcElements();
    applyCanvasSize();
    renderTimeline();
    if (rebuildInspector) renderInspector();
    if (!state.playing) syncMedia(state.time, false);
    requestRender();
  }

  // ------------------------------------------------------------------
  // media import
  // ------------------------------------------------------------------
  async function importFiles(files) {
    let added = 0;
    for (const file of files) {
      const kind = file.type.startsWith('video/') ? 'video'
        : file.type.startsWith('image/') ? 'image'
        : file.type.startsWith('audio/') ? 'audio' : null;
      if (!kind) { toast(`Skipped ${file.name} (not media)`); continue; }
      const m = { id: uid(), name: file.name, kind, url: URL.createObjectURL(file), duration: 0, w: 0, h: 0, thumb: null, wave: null, loading: true };
      state.media.set(m.id, m);
      renderMediaGrid();
      try {
        if (kind === 'image') await loadImage(m);
        else if (kind === 'video') await loadVideo(m);
        else await loadAudio(m);
        m.loading = false;
        added++;
        if (kind !== 'image' && file.size < 250e6) computeWave(m, file).then(() => renderTimeline()).catch(() => {});
      } catch (err) {
        console.warn(err);
        toast(`Couldn't load ${file.name} — format may not be supported by your browser`);
        URL.revokeObjectURL(m.url);
        state.media.delete(m.id);
      }
      renderMediaGrid();
    }
    if (added) toast(`Imported ${added} file${added > 1 ? 's' : ''} — hit ＋ to drop it on the timeline`);
  }

  async function loadImage(m) {
    const img = new Image();
    img.src = m.url;
    await img.decode();
    m.img = img; m.w = img.naturalWidth; m.h = img.naturalHeight;
    m.duration = Infinity; m.thumb = m.url;
  }

  async function loadVideo(m) {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = m.url;
    await once(v, 'loadedmetadata');
    if (!isFinite(v.duration)) {           // e.g. MediaRecorder webm files
      v.currentTime = 1e9;
      await once(v, 'durationchange', 4000).catch(() => {});
    }
    m.duration = isFinite(v.duration) ? v.duration : 10;
    m.w = v.videoWidth; m.h = v.videoHeight;
    v.currentTime = Math.min(1, m.duration * 0.1);
    await once(v, 'seeked').catch(() => {});
    const th = document.createElement('canvas');
    th.height = 90; th.width = Math.max(1, Math.round(90 * (m.w / m.h || 16 / 9)));
    try { th.getContext('2d').drawImage(v, 0, 0, th.width, th.height); m.thumb = th.toDataURL('image/jpeg', 0.7); } catch { /* ignore */ }
    v.removeAttribute('src'); v.load();
  }

  async function loadAudio(m) {
    const a = new Audio();
    a.preload = 'metadata'; a.src = m.url;
    await once(a, 'loadedmetadata');
    m.duration = isFinite(a.duration) ? a.duration : 30;
  }

  async function computeWave(m, file) {
    const buf = await file.arrayBuffer();
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const audio = await new OAC(1, 44100, 44100).decodeAudioData(buf);
    const ch = audio.getChannelData(0);
    const bins = Math.min(3000, Math.max(200, Math.ceil(audio.duration * 40)));
    const step = Math.floor(ch.length / bins) || 1;
    const c = document.createElement('canvas');
    c.width = bins; c.height = 60;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.75)';
    let max = 0;
    const peaks = new Float32Array(bins);
    for (let i = 0; i < bins; i++) {
      let p = 0;
      for (let j = i * step, e = Math.min(ch.length, j + step); j < e; j += 4) { const v = Math.abs(ch[j]); if (v > p) p = v; }
      peaks[i] = p; if (p > max) max = p;
    }
    for (let i = 0; i < bins; i++) {
      const h = Math.max(1, (peaks[i] / (max || 1)) * 58);
      g.fillRect(i, 60 - h, 1, h);
    }
    m.wave = c.toDataURL();
  }

  function removeMedia(id) {
    // No confirm() dialog (it's blocked in sandboxed pages): remove, and let undo bring it back.
    const used = allClips().filter(c => c.mediaId === id).length;
    for (const tr of tracks()) tr.clips = tr.clips.filter(c => c.mediaId !== id);
    const m = state.media.get(id);
    if (m) m.removed = true;
    if (state.selectedId && !findClip(state.selectedId)) select(null);
    renderMediaGrid();
    commit();
    toast(used ? `Removed file + ${used} clip${used > 1 ? 's' : ''} · Ctrl+Z to undo` : 'Removed file · Ctrl+Z to undo');
  }

  // ------------------------------------------------------------------
  // clip factory & placement
  // ------------------------------------------------------------------
  const baseClip = () => ({
    id: uid(), start: 0, duration: 3, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0,
    x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1,
    filters: { ...NO_FILTER }, preset: 'none',
  });

  function clipFromMedia(m) {
    const c = baseClip();
    c.type = m.kind; c.mediaId = m.id;
    c.duration = m.kind === 'image' ? 3 : m.duration;
    return c;
  }

  function textClip(opts = {}) {
    const c = baseClip();
    Object.assign(c, {
      type: 'text', text: 'Your text', font: FONTS[0][0], size: 90, color: '#ffffff',
      stroke: '#000000', strokeW: 0, bg: '', bold: true, italic: false, align: 'center',
      shadow: false, glow: false, anim: 'none',
    }, opts);
    return c;
  }

  const fits = (track, start, dur, ignoreId) =>
    track.clips.every(c => c.id === ignoreId || c.start >= start + dur - EPS || clipEnd(c) <= start + EPS);

  function insertTrack(kind, top = kind === 'visual') {
    const tr = newTrack(kind);
    if (kind === 'visual' && top) tracks().unshift(tr);
    else if (kind === 'visual') tracks().splice(tracks().indexOf(mainTrack()), 0, tr);
    else tracks().push(tr);
    return tr;
  }

  /** Put a clip somewhere sensible. mode: 'append' (end of main track) or 'playhead'. */
  function placeClip(c, mode = 'playhead', preferTrack = null) {
    const kind = trackKindFor(c.type);
    if (mode === 'append' && kind === 'visual') {
      const mt = mainTrack();
      c.start = mt.clips.reduce((m, x) => Math.max(m, clipEnd(x)), 0);
      mt.clips.push(c);
      return mt;
    }
    if (mode === 'playhead') c.start = state.time;
    if (preferTrack && preferTrack.kind === kind && fits(preferTrack, c.start, c.duration)) { preferTrack.clips.push(c); return preferTrack; }
    let candidates = tracks().filter(t => t.kind === kind && !t.captions);
    if (kind === 'visual' && c.type !== 'text') candidates = candidates.reverse();
    let tr = candidates.find(t => fits(t, c.start, c.duration));
    if (!tr) tr = insertTrack(kind, c.type === 'text');
    tr.clips.push(c);
    return tr;
  }

  function addMediaToTimeline(id, mode) {
    const m = state.media.get(id);
    if (!m || m.loading) return;
    const c = clipFromMedia(m);
    placeClip(c, mode || (m.kind === 'audio' ? 'playhead' : 'append'));
    select(c.id);
    commit();
    if (projectDuration() > 0 && state.pps * projectDuration() > $('#tlScroll').clientWidth * 3) autoZoom();
  }

  function addText(opts) {
    const c = textClip(opts);
    placeClip(c, 'playhead');
    select(c.id);
    commit();
  }

  // ------------------------------------------------------------------
  // editing ops
  // ------------------------------------------------------------------
  function splitAt(t) {
    const sel = selected();
    let targets = [];
    if (sel && isActive(sel.clip, t) && t - sel.clip.start > MIN_DUR / 2 && clipEnd(sel.clip) - t > MIN_DUR / 2) targets = [sel];
    else if (!sel) for (const tr of tracks()) for (const c of tr.clips) if (t - c.start > MIN_DUR / 2 && clipEnd(c) - t > MIN_DUR / 2) targets.push({ clip: c, track: tr });
    if (!targets.length) { toast('Move the playhead over a clip to split it'); return; }
    let last = null;
    for (const { clip: c, track } of targets) {
      const left = t - c.start;
      const b = JSON.parse(JSON.stringify(c));
      b.id = uid();
      b.start = t;
      b.duration = c.duration - left;
      b.in = c.in + left * c.speed;
      b.fadeIn = 0;
      c.duration = left;
      c.fadeOut = 0;
      if (b.type === 'text') b.anim = 'none';
      track.clips.push(b);
      last = b;
    }
    if (sel && last) state.selectedId = last.id;
    commit();
    renderInspector();
  }

  function deleteSelected() {
    const sel = selected();
    if (!sel) return;
    sel.track.clips = sel.track.clips.filter(c => c.id !== sel.clip.id);
    select(null);
    commit();
  }

  function duplicateSelected() {
    const sel = selected();
    if (!sel) return;
    const c = JSON.parse(JSON.stringify(sel.clip));
    c.id = uid();
    c.start = clipEnd(sel.clip);
    if (!fits(sel.track, c.start, c.duration)) placeClip(c, 'keep'); else sel.track.clips.push(c);
    select(c.id);
    commit();
  }

  function setSpeed(c, track, speed) {
    const srcLen = c.duration * c.speed;
    let dur = srcLen / speed;
    const next = track.clips.filter(x => x.id !== c.id && x.start >= c.start + EPS).sort((a, b) => a.start - b.start)[0];
    if (next) dur = Math.min(dur, next.start - c.start);
    c.speed = speed;
    c.duration = Math.max(MIN_DUR, Math.min(dur, srcLimit({ ...c, duration: 0 })));
    c.fadeIn = Math.min(c.fadeIn, c.duration / 2);
    c.fadeOut = Math.min(c.fadeOut, c.duration / 2);
  }

  // ------------------------------------------------------------------
  // audio graph + per-clip media elements
  // ------------------------------------------------------------------
  let actx = null, master = null, exportDest = null;
  function ensureAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      master = actx.createGain();
      master.connect(actx.destination);
      exportDest = actx.createMediaStreamDestination();
      master.connect(exportDest);
      for (const e of els.values()) attachAudio(e);
    }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }
  function attachAudio(e) {
    if (!actx || e.gain) return;
    try {
      const src = actx.createMediaElementSource(e.el);
      e.gain = actx.createGain();
      src.connect(e.gain).connect(master);
      e.src = src;
    } catch (err) { console.warn('audio attach failed', err); }
  }

  const els = new Map();   // clipId -> { el, mediaId, gain }
  function getEl(c) {
    let e = els.get(c.id);
    if (e && e.mediaId === c.mediaId) return e;
    if (e) disposeEl(c.id);
    const m = state.media.get(c.mediaId);
    if (!m) return null;
    const node = c.type === 'video' ? document.createElement('video') : document.createElement('audio');
    node.preload = 'auto';
    node.playsInline = true;
    node.src = m.url;
    node.addEventListener('seeked', () => { if (!state.playing) requestRender(); });
    node.addEventListener('loadeddata', () => requestRender());
    $('#mediaHolder').append(node);
    e = { el: node, mediaId: c.mediaId, gain: null };
    els.set(c.id, e);
    attachAudio(e);
    return e;
  }
  function disposeEl(id) {
    const e = els.get(id);
    if (!e) return;
    e.el.pause();
    try { e.src && e.src.disconnect(); e.gain && e.gain.disconnect(); } catch { /* ignore */ }
    e.el.removeAttribute('src'); e.el.load(); e.el.remove();
    els.delete(id);
  }
  function gcElements() {
    const live = new Set(allClips().map(c => c.id));
    for (const id of [...els.keys()]) if (!live.has(id)) disposeEl(id);
  }
  function setVolume(e, v) {
    if (e.gain) { e.el.volume = 1; e.gain.gain.value = v; }
    else e.el.volume = clamp(v, 0, 1);
  }

  const fadeFactor = (c, t) => {
    const local = t - c.start;
    let f = 1;
    if (c.fadeIn > 0 && local < c.fadeIn) f *= clamp(local / c.fadeIn, 0, 1);
    if (c.fadeOut > 0 && local > c.duration - c.fadeOut) f *= clamp((c.duration - local) / c.fadeOut, 0, 1);
    return f;
  };

  /** Keep every <video>/<audio> element aligned with timeline time t. */
  function syncMedia(t, playing) {
    const active = new Set();
    for (const tr of tracks()) {
      for (const c of tr.clips) {
        if (c.type !== 'video' && c.type !== 'audio') continue;
        const within = isActive(c, t);
        const upcoming = !within && t < c.start && c.start - t < 1.5;
        if (!within && !upcoming) continue;
        const e = getEl(c);
        if (!e) continue;
        const v = e.el;
        if (upcoming) {   // pre-roll so the first frame is decoded when we get there
          if (v.paused && Math.abs(v.currentTime - c.in) > 0.05 && !v.seeking) v.currentTime = c.in;
          continue;
        }
        active.add(c.id);
        const target = c.in + (t - c.start) * c.speed;
        const audible = !tr.muted && !(c.type === 'video' && tr.hidden);
        setVolume(e, audible ? c.volume * fadeFactor(c, t) : 0);
        if (playing) {
          if (v.playbackRate !== c.speed) v.playbackRate = c.speed;
          if (v.paused) {
            if (Math.abs(v.currentTime - target) > 0.05) v.currentTime = target;
            v.play().catch(() => {});
          } else if (Math.abs(v.currentTime - target) > 0.3) {
            v.currentTime = target;
          }
        } else {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - target) > 0.015) v.currentTime = target;
        }
      }
    }
    for (const [id, e] of els) if (!active.has(id) && !e.el.paused) e.el.pause();
  }

  // ------------------------------------------------------------------
  // rendering
  // ------------------------------------------------------------------
  function filterStr(f, scale = 1) {
    const parts = [];
    if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
    if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
    if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
    if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
    if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`);
    if (f.sepia) parts.push(`sepia(${f.sepia}%)`);
    if (f.blur) parts.push(`blur(${(f.blur * scale).toFixed(2)}px)`);
    return parts.length ? parts.join(' ') : 'none';
  }

  const shortSide = () => Math.min(canvas.width, canvas.height);

  function sourceOf(c) {
    if (c.type === 'image') { const m = state.media.get(c.mediaId); return m && m.img ? { src: m.img, w: m.w, h: m.h } : null; }
    if (c.type === 'video') {
      const e = getEl(c);
      if (!e || e.el.readyState < 2 || !e.el.videoWidth) return null;
      return { src: e.el, w: e.el.videoWidth, h: e.el.videoHeight };
    }
    return null;
  }
  const containScale = (w, h) => Math.min(canvas.width / w, canvas.height / h);

  function textFont(c, size) {
    return `${c.italic ? 'italic ' : ''}${c.bold ? '800' : '500'} ${size}px ${c.font}`;
  }
  function textLayout(c) {
    const size = c.size * shortSide() / 1080;
    ctx.font = textFont(c, size);
    const lines = String(c.text || ' ').split('\n');
    const lh = size * 1.18;
    const widths = lines.map(l => ctx.measureText(l).width);
    const w = Math.max(10, ...widths), h = lines.length * lh;
    return { size, lines, lh, widths, w, h, pad: c.bg ? size * 0.32 : size * 0.1 };
  }

  /** Box of a visual clip in canvas space, before rotation: centre + size (already scaled). */
  function clipBox(c) {
    const cx = c.x * canvas.width, cy = c.y * canvas.height;
    if (c.type === 'text') {
      const L = textLayout(c);
      return { cx, cy, w: (L.w + L.pad * 2) * c.scale, h: (L.h + L.pad * 1.2) * c.scale };
    }
    const m = state.media.get(c.mediaId);
    const w = (m && m.w) || 16, h = (m && m.h) || 9;
    const s = containScale(w, h) * c.scale;
    return { cx, cy, w: w * s, h: h * s };
  }

  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeBack = (p) => { const k = 1.70158; return 1 + (k + 1) * Math.pow(p - 1, 3) + k * Math.pow(p - 1, 2); };

  function drawText(c, local) {
    const L = textLayout(c);
    const A = Math.min(0.5, c.duration / 3);
    const p = A > 0 ? clamp(local / A, 0, 1) : 1;
    let alpha = 1, sc = 1, dy = 0, chars = Infinity;
    switch (c.anim) {
      case 'fade': alpha = p; break;
      case 'pop': sc = 0.3 + 0.7 * easeBack(p); alpha = Math.min(1, p * 2.5); break;
      case 'slide': dy = (1 - easeOut(p)) * canvas.height * 0.06; alpha = p; break;
      case 'typewriter': {
        const total = L.lines.join('').length;
        const T = Math.min(1.5, c.duration * 0.6, total * 0.07);
        chars = T > 0 ? Math.floor(total * clamp(local / T, 0, 1)) : total;
        break;
      }
    }
    ctx.globalAlpha *= alpha;
    ctx.translate(0, dy);
    ctx.scale(sc, sc);
    if (c.bg) {
      ctx.fillStyle = c.bg;
      const bw = L.w + L.pad * 2, bh = L.h + L.pad * 1.2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-bw / 2, -bh / 2, bw, bh, L.size * 0.22); else ctx.rect(-bw / 2, -bh / 2, bw, bh);
      ctx.fill();
    }
    ctx.font = textFont(c, L.size);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    let left = chars;
    L.lines.forEach((line, i) => {
      if (left <= 0) return;
      const txt = left === Infinity ? line : line.slice(0, left);
      if (left !== Infinity) left -= line.length;
      const lw = L.widths[i];
      const x = c.align === 'left' ? -L.w / 2 : c.align === 'right' ? L.w / 2 - lw : -lw / 2;
      const y = -L.h / 2 + L.lh * (i + 0.5);
      if (c.strokeW > 0) {
        ctx.strokeStyle = c.stroke;
        ctx.lineWidth = c.strokeW * L.size / 60;
        ctx.strokeText(txt, x, y);
      }
      ctx.save();
      if (c.glow) { ctx.shadowColor = c.color; ctx.shadowBlur = L.size * 0.45; }
      else if (c.shadow) { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = L.size * 0.12; ctx.shadowOffsetY = L.size * 0.06; }
      ctx.fillStyle = c.color;
      ctx.fillText(txt, x, y);
      if (c.glow) ctx.fillText(txt, x, y);
      ctx.restore();
    });
  }

  function drawClip(c, t) {
    const alpha = clamp(c.opacity * fadeFactor(c, t), 0, 1);
    if (alpha <= 0) return;
    ctx.save();
    ctx.translate(c.x * canvas.width, c.y * canvas.height);
    ctx.rotate((c.rotation * Math.PI) / 180);
    ctx.globalAlpha = alpha;
    if (c.type === 'text') {
      ctx.scale(c.scale, c.scale);
      drawText(c, t - c.start);
    } else {
      const s = sourceOf(c);
      if (s) {
        const k = containScale(s.w, s.h) * c.scale;
        ctx.filter = filterStr(c.filters, shortSide() / 1080);
        ctx.drawImage(s.src, (-s.w * k) / 2, (-s.h * k) / 2, s.w * k, s.h * k);
      }
    }
    ctx.restore();
  }

  let guides = null;   // {v:bool, h:bool} centre guides during canvas drag
  function render() {
    renderQueued = false;
    const t = state.time;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.filter = 'none';
    ctx.fillStyle = state.project.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    const ts = tracks();
    for (let i = ts.length - 1; i >= 0; i--) {
      const tr = ts[i];
      if (tr.kind !== 'visual' || tr.hidden) continue;
      for (const c of tr.clips) if (isActive(c, t)) drawClip(c, t);
    }
    if (!state.exporting && !state.playing) drawOverlay(t);
  }

  function drawOverlay(t) {
    const sel = selected();
    const lw = Math.max(2, shortSide() / 360);
    if (guides) {
      ctx.save();
      ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = lw; ctx.setLineDash([lw * 4, lw * 3]);
      ctx.beginPath();
      if (guides.v) { ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); }
      if (guides.h) { ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); }
      ctx.stroke();
      ctx.restore();
    }
    if (!sel || sel.clip.type === 'audio' || !isActive(sel.clip, t) || sel.track.hidden) return;
    const c = sel.clip, b = clipBox(c);
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate((c.rotation * Math.PI) / 180);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw;
    ctx.shadowColor = '#000'; ctx.shadowBlur = lw * 2;
    ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    const r = handleRadius();
    ctx.fillStyle = '#8b5cf6';
    ctx.beginPath(); ctx.arc(b.w / 2, b.h / 2, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
  }
  const handleRadius = () => Math.max(10, shortSide() / 45);

  let renderQueued = false;
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(render);
  }

  // ------------------------------------------------------------------
  // playback
  // ------------------------------------------------------------------
  let clock = { wall: 0, t: 0 }, rafId = 0;
  function play() {
    if (state.playing) return;
    const dur = projectDuration();
    if (dur <= 0) { toast('Timeline is empty — import something first 👀'); return; }
    if (state.time >= dur - 0.02) state.time = 0;
    ensureAudio();
    state.playing = true;
    clock = { wall: performance.now(), t: state.time };
    $('#playBtn').textContent = '❚❚';
    syncMedia(state.time, true);
    rafId = requestAnimationFrame(tick);
  }
  function pause() {
    if (!state.playing) return;
    state.playing = false;
    cancelAnimationFrame(rafId);
    $('#playBtn').textContent = '▶';
    for (const e of els.values()) e.el.pause();
    syncMedia(state.time, false);
    requestRender();
  }
  const togglePlay = () => (state.playing ? pause() : play());

  function tick(now) {
    if (!state.playing) return;
    const dur = projectDuration();
    state.time = clock.t + (now - clock.wall) / 1000;
    if (state.time >= dur) {
      state.time = dur;
      render();
      if (state.exporting) { finishExport(); return; }
      pause();
      updatePlayhead();
      return;
    }
    syncMedia(state.time, true);
    render();
    updatePlayhead(true);
    if (state.exporting) updateExportProgress(state.time / dur);
    rafId = requestAnimationFrame(tick);
  }

  function seek(t) {
    state.time = clamp(t, 0, Math.max(projectDuration(), 0));
    if (state.playing) clock = { wall: performance.now(), t: state.time };
    syncMedia(state.time, state.playing);
    updatePlayhead();
    requestRender();
  }

  function updatePlayhead(follow = false) {
    const x = HEAD_W() + state.time * state.pps;
    $('#playhead').style.transform = `translateX(${x}px)`;
    $('#timecode').textContent = `${fmt(state.time)} / ${fmt(projectDuration())}`;
    if (follow) {
      const sc = $('#tlScroll');
      const vis = x - sc.scrollLeft;
      if (vis > sc.clientWidth - 60 || vis < HEAD_W()) sc.scrollLeft = x - HEAD_W() - 40;
    }
  }

  // ------------------------------------------------------------------
  // export
  // ------------------------------------------------------------------
  function pickMime() {
    const list = [
      ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4'],
      ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'],
      ['video/mp4;codecs=avc1', 'mp4'],
      ['video/webm;codecs=vp9,opus', 'webm'],
      ['video/webm;codecs=vp8,opus', 'webm'],
      ['video/webm', 'webm'],
      ['video/mp4', 'mp4'],   // Safari
    ];
    if (!window.MediaRecorder) return null;
    return list.find(([m]) => MediaRecorder.isTypeSupported(m)) || null;
  }

  async function startExport() {
    const dur = projectDuration();
    if (dur <= 0) { toast('Nothing to export yet — add some clips first'); return; }
    const mime = pickMime();
    if (!mime || !canvas.captureStream) { toast('Your browser can’t record video. Try Chrome, Edge or Firefox.'); return; }
    pause();
    ensureAudio();
    try { await actx.resume(); } catch { /* ignore */ }

    const { W, H } = dims();
    const stream = new MediaStream([
      ...canvas.captureStream(30).getVideoTracks(),
      ...(exportDest ? exportDest.stream.getAudioTracks() : []),
    ]);
    const rec = new MediaRecorder(stream, {
      mimeType: mime[0],
      videoBitsPerSecond: H * W > 1e6 ? 12e6 : 6e6,
      audioBitsPerSecond: 192000,
    });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    state.exporting = { rec, chunks, ext: mime[1], cancelled: false };

    $('#exportInfo').textContent = `${W}×${H} · ${mime[1].toUpperCase()} · ${fmt(dur, false)}`;
    updateExportProgress(0);
    $('#exportModal').classList.remove('hidden');

    // prime every video at the start so frame 0 isn't black
    seek(0);
    await waitForFrames(0);
    if (!state.exporting || state.exporting.cancelled) return;
    rec.onstop = () => {
      const ex = state.exporting;
      state.exporting = null;
      $('#exportModal').classList.add('hidden');
      seek(0);
      if (!ex || ex.cancelled) { toast('Export cancelled'); return; }
      const blob = new Blob(ex.chunks, { type: rec.mimeType || 'video/' + ex.ext });
      lastExport = { blob, filename: `ghostcut-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ex.ext}` };
      $('#resaveBtn').classList.remove('hidden');
      saveExport();
    };
    rec.start(250);
    play();
  }

  // Saving: inside a claude.ai artifact, plain downloads are blocked, so use the
  // page's `downloads` capability there. Everywhere else, a normal <a download>.
  let lastExport = null;
  async function saveExport() {
    if (!lastExport) return;
    const { blob, filename } = lastExport;
    const mb = (blob.size / 1e6).toFixed(1);
    let dl = null;
    if (window.claude && typeof window.claude.use === 'function') {
      try { dl = await window.claude.use('downloads'); } catch { dl = null; }
    }
    if (dl) {
      try {
        await dl.save({ filename, data: blob });
        toast(`Saved ${filename} (${mb} MB). No watermark, no fee 😌`, 4500);
      } catch (err) {
        const code = err && err.code;
        if (code === 'declined') toast('Save cancelled. Hit “Save again” up top whenever you’re ready.', 4500);
        else if (code === 'rate_limited') toast('A save prompt is already open. Finish that one first.', 4500);
        else toast('This view can’t save files. Open the page in a browser tab and try “Save again”.', 5000);
      }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast(`Exported! ${mb} MB. No watermark, no fee 😌`, 4500);
  }

  function waitForFrames(t) {
    const pending = allClips().filter(c => c.type === 'video' && isActive(c, t)).map(c => getEl(c)).filter(Boolean)
      .filter(e => e.el.readyState < 2 || e.el.seeking)
      .map(e => once(e.el, e.el.seeking ? 'seeked' : 'loadeddata', 3000).catch(() => {}));
    return Promise.all(pending).then(() => new Promise(r => setTimeout(r, 120)));
  }

  function finishExport() {
    state.playing = false;
    cancelAnimationFrame(rafId);
    $('#playBtn').textContent = '▶';
    for (const e of els.values()) e.el.pause();
    updateExportProgress(1);
    const ex = state.exporting;
    // give the recorder a moment to capture the last frame
    setTimeout(() => { if (ex.rec.state !== 'inactive') ex.rec.stop(); }, 200);
  }
  function cancelExport() {
    const ex = state.exporting;
    if (!ex) return;
    ex.cancelled = true;
    pause();
    if (ex.rec.state !== 'inactive') ex.rec.stop();
    else { state.exporting = null; $('#exportModal').classList.add('hidden'); }
  }
  function updateExportProgress(p) {
    const pct = Math.round(clamp(p, 0, 1) * 100);
    $('#exportBar').style.width = pct + '%';
    $('#exportPct').textContent = pct + '%';
  }

  // ------------------------------------------------------------------
  // timeline UI
  // ------------------------------------------------------------------
  function tickStep() {
    for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) if (s * state.pps >= 70) return s;
    return 600;
  }

  function renderTimeline() {
    const head = HEAD_W();
    const dur = Math.max(projectDuration() + 10, 20);
    const laneW = dur * state.pps;
    $('#tlContent').style.width = head + laneW + 'px';

    // ruler
    const ruler = $('#ruler');
    ruler.innerHTML = '';
    ruler.style.width = laneW + 'px';
    const step = tickStep(), minor = step / 5;
    for (let i = 0; i * minor <= dur; i++) {
      const t = i * minor;
      const major = i % 5 === 0;
      const tk = el('div', { class: 'tick' + (major ? ' major' : ''), style: `left:${t * state.pps}px` });
      if (major) tk.append(el('span', {}, step < 1 ? fmt(t) : fmt(t, false)));
      ruler.append(tk);
    }

    // tracks
    const holder = $('#tracks');
    holder.innerHTML = '';
    const main = mainTrack();
    const overlays = tracks().filter(t => t.kind === 'visual' && t !== main && !t.captions);
    let ai = 0;
    for (const tr of tracks()) {
      const isMain = tr === main;
      const name = tr.kind === 'audio' ? `🎵 Audio ${++ai}`
        : isMain ? '🎬 Main'
        : tr.captions ? '💬 Captions'
        : `▦ Overlay ${overlays.length - overlays.indexOf(tr)}`;
      const kindCount = tracks().filter(t => t.kind === tr.kind).length;
      const headEl = el('div', { class: 'track-head' },
        el('span', { class: 'tname', title: name }, name),
        el('button', { class: tr.muted ? 'off' : '', title: tr.muted ? 'Unmute track' : 'Mute track', onclick: () => { tr.muted = !tr.muted; commit(); } }, tr.muted ? '🔇' : '🔊'),
        tr.kind === 'visual' ? el('button', { class: tr.hidden ? 'off' : '', title: tr.hidden ? 'Show track' : 'Hide track', onclick: () => { tr.hidden = !tr.hidden; commit(); } }, '👁') : null,
        !isMain && kindCount > 1 && !tr.clips.length ? el('button', { title: 'Remove empty track', onclick: () => { state.project.tracks = tracks().filter(t => t !== tr); commit(); } }, '✕') : null,
      );
      const lane = el('div', { class: 'lane', style: `width:${laneW}px` });
      for (const c of tr.clips) lane.append(clipEl(c));
      const row = el('div', { class: `track-row ${tr.kind}${isMain ? ' main' : ''}${tr.hidden ? ' hidden-track' : ''}`, 'data-track': tr.id }, headEl, lane);
      holder.append(row);
    }
    updatePlayhead();
  }

  function clipEl(c) {
    const m = c.mediaId ? state.media.get(c.mediaId) : null;
    const left = c.start * state.pps, width = Math.max(4, c.duration * state.pps);
    const d = el('div', {
      class: `clip type-${c.type}${c.id === state.selectedId ? ' selected' : ''}`,
      'data-clip': c.id,
      style: `left:${left}px;width:${width}px`,
    });
    if (m && m.thumb && (c.type === 'video' || c.type === 'image')) d.style.backgroundImage = `url("${m.thumb}")`;
    if (m && m.wave && isFinite(m.duration)) {
      const full = (m.duration * state.pps) / c.speed;
      d.append(el('div', { class: 'wave', style: `background-image:url("${m.wave}");background-size:${full}px 100%;background-position:${(-c.in * state.pps) / c.speed}px 0` }));
    }
    const label = c.type === 'text' ? `T  ${c.text.replace(/\n/g, ' ')}` : (m ? m.name : 'missing media');
    const lab = el('div', { class: 'label' }, label);
    if (c.speed !== 1) lab.append(el('span', { class: 'spd' }, `${c.speed}×`));
    d.append(lab);
    if (c.fadeIn > 0) d.append(el('div', { class: 'fade in', style: `width:${c.fadeIn * state.pps}px` }));
    if (c.fadeOut > 0) d.append(el('div', { class: 'fade out', style: `width:${c.fadeOut * state.pps}px` }));
    d.append(el('div', { class: 'h l', 'data-handle': 'l' }), el('div', { class: 'h r', 'data-handle': 'r' }));
    return d;
  }

  function autoZoom() {
    const dur = projectDuration();
    if (dur <= 0) return;
    const avail = $('#tlScroll').clientWidth - HEAD_W() - 40;
    setZoom(clamp(avail / (dur * 1.1), 10, 400));
  }
  function setZoom(pps, anchorT = state.time) {
    const sc = $('#tlScroll');
    const screenX = HEAD_W() + anchorT * state.pps - sc.scrollLeft;
    state.pps = clamp(pps, 10, 400);
    $('#zoomRange').value = state.pps;
    renderTimeline();
    sc.scrollLeft = HEAD_W() + anchorT * state.pps - screenX;
  }

  // ---- timeline pointer interactions ----
  const tlScroll = $('#tlScroll');
  const timeAtClientX = (x) => {
    const r = tlScroll.getBoundingClientRect();
    return Math.max(0, (x - r.left + tlScroll.scrollLeft - HEAD_W()) / state.pps);
  };
  function snapPoints(excludeId) {
    const pts = [0, state.time];
    for (const c of allClips()) if (c.id !== excludeId) pts.push(c.start, clipEnd(c));
    return pts;
  }
  function snapTime(t, pts) {
    if (!state.snap) return t;
    const thr = 8 / state.pps;
    let best = t, bd = thr;
    for (const p of pts) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function trackAtClientY(y) {
    for (const row of $$('.track-row')) {
      const r = row.getBoundingClientRect();
      if (y >= r.top && y < r.bottom) return tracks().find(t => t.id === row.dataset.track);
    }
    return null;
  }

  let drag = null;
  tlScroll.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || state.exporting) return;
    const clipNode = ev.target.closest('.clip');
    const inHead = ev.target.closest('.track-head');
    if (inHead) return;
    if (clipNode) {
      const found = findClip(clipNode.dataset.clip);
      if (!found) return;
      ev.preventDefault();
      if (state.selectedId !== found.clip.id) select(found.clip.id);
      const handle = ev.target.dataset.handle;
      drag = {
        mode: handle ? 'trim-' + handle : 'move',
        clip: found.clip, track: found.track,
        x0: ev.clientX, orig: { start: found.clip.start, duration: found.clip.duration, in: found.clip.in },
        pts: snapPoints(found.clip.id), moved: false,
      };
      tlScroll.setPointerCapture(ev.pointerId);
      return;
    }
    if (ev.target.closest('.ruler-row') || ev.target.closest('.lane')) {
      if (ev.target.closest('.lane')) select(null);
      drag = { mode: 'scrub' };
      tlScroll.setPointerCapture(ev.pointerId);
      seek(timeAtClientX(ev.clientX));
    }
  });

  tlScroll.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    if (drag.mode === 'scrub') { seek(timeAtClientX(ev.clientX)); return; }
    const dx = (ev.clientX - drag.x0) / state.pps;
    if (!drag.moved && Math.abs(ev.clientX - drag.x0) < 3 && drag.mode === 'move' && !drag.trackMoved) {
      // tiny jitter: ignore until real movement (also allows vertical track change)
      const t = trackAtClientY(ev.clientY);
      if (!t || t === drag.track) return;
    }
    drag.moved = true;
    const c = drag.clip, o = drag.orig;
    if (drag.mode === 'move') {
      let start = Math.max(0, o.start + dx);
      const sEnd = snapTime(start + c.duration, drag.pts) - c.duration;
      const sStart = snapTime(start, drag.pts);
      start = Math.abs(sStart - start) <= Math.abs(sEnd - start) ? sStart : sEnd;
      start = Math.max(0, start);
      let target = trackAtClientY(ev.clientY) || drag.track;
      if (target.kind !== trackKindFor(c.type)) target = drag.track;
      if (fits(target, start, c.duration, c.id)) {
        c.start = start;
        if (target !== drag.track) {
          drag.track.clips = drag.track.clips.filter(x => x !== c);
          target.clips.push(c);
          drag.track = target;
          drag.trackMoved = true;
        }
      } else if (fits(drag.track, start, c.duration, c.id)) {
        c.start = start;
      }
    } else if (drag.mode === 'trim-l') {
      const end = o.start + o.duration;
      const others = drag.track.clips.filter(x => x !== c && clipEnd(x) <= o.start + EPS);
      const prevEnd = others.reduce((m, x) => Math.max(m, clipEnd(x)), 0);
      let minStart = Math.max(0, prevEnd);
      if (c.type === 'video' || c.type === 'audio') minStart = Math.max(minStart, o.start - o.in / c.speed);
      let s = snapTime(o.start + dx, drag.pts);
      s = clamp(s, minStart, end - MIN_DUR);
      c.start = s;
      c.duration = end - s;
      if (c.type === 'video' || c.type === 'audio') c.in = Math.max(0, o.in + (s - o.start) * c.speed);
    } else if (drag.mode === 'trim-r') {
      const nexts = drag.track.clips.filter(x => x !== c && x.start >= clipEnd({ start: o.start, duration: o.duration }) - EPS);
      const nextStart = nexts.reduce((m, x) => Math.min(m, x.start), Infinity);
      let e = snapTime(o.start + o.duration + dx, drag.pts);
      e = clamp(e, o.start + MIN_DUR, Math.min(nextStart, o.start + srcLimit({ ...c, in: o.in })));
      c.duration = e - o.start;
    }
    c.fadeIn = Math.min(c.fadeIn, c.duration / 2);
    c.fadeOut = Math.min(c.fadeOut, c.duration / 2);
    renderTimeline();
    const node = $(`.clip[data-clip="${c.id}"]`);
    if (node) node.classList.add('dragging');
    if (!state.playing) { syncMedia(state.time, false); requestRender(); }
  });

  const endDrag = () => {
    if (!drag) return;
    const was = drag;
    drag = null;
    if (was.mode !== 'scrub' && was.moved) { commit(); renderInspector(); }
    else if (was.mode !== 'scrub') renderTimeline();
  };
  tlScroll.addEventListener('pointerup', endDrag);
  tlScroll.addEventListener('pointercancel', endDrag);

  tlScroll.addEventListener('wheel', (ev) => {
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      setZoom(state.pps * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), timeAtClientX(ev.clientX));
    }
  }, { passive: false });

  // drag media from the library onto a lane
  tlScroll.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer.types.includes('text/ghost-media')) return;
    ev.preventDefault();
    $$('.track-row').forEach(r => r.classList.remove('drop-ok'));
    const row = ev.target.closest('.track-row');
    if (row) row.classList.add('drop-ok');
  });
  tlScroll.addEventListener('dragleave', () => $$('.track-row').forEach(r => r.classList.remove('drop-ok')));
  tlScroll.addEventListener('drop', (ev) => {
    const id = ev.dataTransfer.getData('text/ghost-media');
    $$('.track-row').forEach(r => r.classList.remove('drop-ok'));
    if (!id) return;
    ev.preventDefault();
    ev.stopPropagation();
    const m = state.media.get(id);
    if (!m || m.loading) return;
    const c = clipFromMedia(m);
    c.start = snapTime(timeAtClientX(ev.clientX), snapPoints());
    placeClip(c, 'keep', trackAtClientY(ev.clientY));
    select(c.id);
    commit();
  });

  // ------------------------------------------------------------------
  // canvas interactions (move / scale on the preview)
  // ------------------------------------------------------------------
  const toCanvas = (ev) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * canvas.width, y: ((ev.clientY - r.top) / r.height) * canvas.height };
  };
  const toLocal = (c, b, p) => {
    const a = (-c.rotation * Math.PI) / 180;
    const dx = p.x - b.cx, dy = p.y - b.cy;
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  };
  function hitTest(p) {
    const ts = tracks();
    for (let i = 0; i < ts.length; i++) {           // top-most track first
      const tr = ts[i];
      if (tr.kind !== 'visual' || tr.hidden) continue;
      for (let j = tr.clips.length - 1; j >= 0; j--) {
        const c = tr.clips[j];
        if (!isActive(c, state.time)) continue;
        const b = clipBox(c), l = toLocal(c, b, p);
        if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2) return c;
      }
    }
    return null;
  }

  let cdrag = null;
  canvas.addEventListener('pointerdown', (ev) => {
    if (state.exporting) return;
    if (state.playing) pause();
    const p = toCanvas(ev);
    const sel = selected();
    if (sel && sel.clip.type !== 'audio' && isActive(sel.clip, state.time)) {
      const b = clipBox(sel.clip), l = toLocal(sel.clip, b, p);
      if (Math.hypot(l.x - b.w / 2, l.y - b.h / 2) <= handleRadius() * 1.8) {
        cdrag = { mode: 'scale', clip: sel.clip, s0: sel.clip.scale, d0: Math.hypot(p.x - b.cx, p.y - b.cy) || 1, b };
        canvas.setPointerCapture(ev.pointerId);
        return;
      }
    }
    const hit = hitTest(p);
    if (hit) {
      if (hit.id !== state.selectedId) select(hit.id);
      cdrag = { mode: 'move', clip: hit, p0: p, x0: hit.x, y0: hit.y, moved: false };
      canvas.setPointerCapture(ev.pointerId);
    } else {
      select(null);
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!cdrag) {
      const sel = selected();
      let cur = 'default';
      if (sel && sel.clip.type !== 'audio' && isActive(sel.clip, state.time)) {
        const p = toCanvas(ev), b = clipBox(sel.clip), l = toLocal(sel.clip, b, p);
        if (Math.hypot(l.x - b.w / 2, l.y - b.h / 2) <= handleRadius() * 1.8) cur = 'nwse-resize';
        else if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2) cur = 'move';
      }
      canvas.style.cursor = cur;
      return;
    }
    const p = toCanvas(ev), c = cdrag.clip;
    cdrag.moved = true;
    if (cdrag.mode === 'move') {
      let x = cdrag.x0 + (p.x - cdrag.p0.x) / canvas.width;
      let y = cdrag.y0 + (p.y - cdrag.p0.y) / canvas.height;
      guides = { v: false, h: false };
      if (Math.abs(x - 0.5) < 0.015) { x = 0.5; guides.v = true; }
      if (Math.abs(y - 0.5) < 0.015) { y = 0.5; guides.h = true; }
      c.x = x; c.y = y;
    } else {
      const d = Math.hypot(p.x - cdrag.b.cx, p.y - cdrag.b.cy);
      c.scale = clamp(cdrag.s0 * (d / cdrag.d0), 0.05, 10);
    }
    requestRender();
    refreshInspectorValues();
  });
  const endCanvasDrag = () => {
    if (!cdrag) return;
    const moved = cdrag.moved;
    cdrag = null; guides = null;
    if (moved) commit();
    requestRender();
  };
  canvas.addEventListener('pointerup', endCanvasDrag);
  canvas.addEventListener('pointercancel', endCanvasDrag);

  // ------------------------------------------------------------------
  // selection + inspector
  // ------------------------------------------------------------------
  function select(id) {
    if (state.selectedId === id) return;
    state.selectedId = id;
    $$('.clip.selected').forEach(n => n.classList.remove('selected'));
    if (id) { const n = $(`.clip[data-clip="${id}"]`); if (n) n.classList.add('selected'); }
    renderInspector();
    requestRender();
  }

  const insp = $('#inspector');
  let liveBindings = [];   // [{input, get, valEl, fmt}] for refreshInspectorValues

  function section(title, ...kids) { return el('div', { class: 'insp-section' }, el('h3', {}, title), ...kids); }

  function slider(label, get, set, min, max, step, show = (v) => v, opts = {}) {
    const val = el('span', { class: 'val' }, show(get()));
    const input = el('input', { type: 'range', min, max, step, value: get() });
    input.addEventListener('input', () => {
      set(parseFloat(input.value));
      val.textContent = show(get());
      if (opts.timeline) renderTimeline();
      if (!state.playing) syncMedia(state.time, false);
      requestRender();
    });
    input.addEventListener('change', () => commit());
    input.addEventListener('dblclick', () => { if (opts.reset != null) { set(opts.reset); input.value = get(); val.textContent = show(get()); commit(); } });
    liveBindings.push({ input, get, valEl: val, show });
    return el('div', { class: 'ctl' }, el('label', { title: opts.reset != null ? 'Double-click slider to reset' : '' }, label), input, val);
  }
  function colorCtl(label, get, set, extra) {
    const input = el('input', { type: 'color', value: (get() || '#000000').slice(0, 7) });
    input.addEventListener('input', () => { set(input.value); requestRender(); });
    input.addEventListener('change', () => commit());
    return el('div', { class: 'ctl wide' }, el('label', {}, label), el('div', { class: 'row' }, input, extra || null));
  }
  function selectCtl(label, options, get, set) {
    const s = el('select', {}, options.map(([v, l]) => el('option', { value: v, selected: String(get()) === String(v) }, l)));
    s.addEventListener('change', () => { set(s.value); commit(); });
    return el('div', { class: 'ctl wide' }, el('label', {}, label), s);
  }
  function toggleBtn(label, get, set, title) {
    const b = el('button', { class: get() ? 'on' : '', title: title || '' }, label);
    b.addEventListener('click', () => { set(!get()); b.classList.toggle('on', !!get()); commit(); });
    return b;
  }

  function refreshInspectorValues() {
    for (const b of liveBindings) { b.input.value = b.get(); b.valEl.textContent = b.show(b.get()); }
  }

  function renderInspector() {
    liveBindings = [];
    insp.innerHTML = '';
    const sel = selected();
    if (!sel) { insp.append(emptyInspector()); return; }
    const { clip: c, track } = sel;
    const m = c.mediaId ? state.media.get(c.mediaId) : null;
    const icon = { video: '🎬', image: '🖼', audio: '🎵', text: '🔤' }[c.type];

    insp.append(section(`${icon} ${c.type === 'text' ? 'Text' : (m ? m.name : c.type)}`,
      el('p', { class: 'muted small', style: 'margin:0 0 8px' }, `Starts ${fmt(c.start)} · Length ${fmt(c.duration)}`),
      el('div', { class: 'row' },
        el('button', { onclick: () => splitAt(state.time) }, '✂ Split'),
        el('button', { onclick: duplicateSelected }, '⧉ Copy'),
        el('button', { onclick: deleteSelected }, '🗑 Delete'),
      )));

    if (c.caption) {
      const count = allClips().filter(x => x.caption).length;
      insp.append(section('Captions',
        el('p', { class: 'muted small', style: 'margin:0 0 8px' }, `Style this one, then copy its look to all ${count} captions.`),
        el('div', { class: 'row' },
          el('button', { onclick: () => applyStyleToAllCaptions(c) }, '🎨 Apply style to all'),
          el('button', { onclick: deleteAllCaptions }, '🗑 Delete all'),
        )));
    }

    if (c.type === 'text') {
      const ta = el('textarea', { rows: 3 }, c.text);
      ta.addEventListener('input', () => { c.text = ta.value; requestRender(); });
      ta.addEventListener('change', () => commit());
      insp.append(section('Text',
        ta,
        selectCtl('Font', FONTS, () => c.font, v => { c.font = v; }),
        slider('Size', () => c.size, v => { c.size = v; }, 16, 400, 1, v => v),
        colorCtl('Color', () => c.color, v => { c.color = v; }),
        el('div', { class: 'row', style: 'margin:8px 0' },
          toggleBtn('B', () => c.bold, v => { c.bold = v; }, 'Bold'),
          toggleBtn('I', () => c.italic, v => { c.italic = v; }, 'Italic'),
          toggleBtn('Shadow', () => c.shadow, v => { c.shadow = v; }),
          toggleBtn('Glow', () => c.glow, v => { c.glow = v; }),
        ),
        el('div', { class: 'row', style: 'margin:8px 0' },
          ...[['left', '⇤'], ['center', '↔'], ['right', '⇥']].map(([a, l]) => {
            const b = el('button', { class: c.align === a ? 'on' : '', title: `Align ${a}` }, l);
            b.addEventListener('click', () => { c.align = a; commit(); renderInspector(); });
            return b;
          })),
        colorCtl('Outline', () => c.stroke, v => { c.stroke = v; }),
        slider('Outline px', () => c.strokeW, v => { c.strokeW = v; }, 0, 30, 1, v => v, { reset: 0 }),
        colorCtl('Box', () => c.bg || '#000000', v => { c.bg = v; },
          toggleBtn(c.bg ? 'On' : 'Off', () => !!c.bg, v => { c.bg = v ? '#000000' : ''; renderInspector(); })),
        selectCtl('Animation', ANIMS, () => c.anim, v => { c.anim = v; }),
      ));
    }

    if (c.type !== 'audio') {
      const fitBtns = c.type === 'text' ? null : el('div', { class: 'row', style: 'margin-top:8px' },
        el('button', { onclick: () => { c.scale = 1; c.x = 0.5; c.y = 0.5; commit(); refreshInspectorValues(); } }, 'Fit'),
        el('button', { onclick: () => { const mm = m || { w: 16, h: 9 }; c.scale = Math.max(canvas.width / mm.w, canvas.height / mm.h) / containScale(mm.w, mm.h); c.x = 0.5; c.y = 0.5; commit(); refreshInspectorValues(); } }, 'Fill'),
        el('button', { onclick: () => { Object.assign(c, { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 }); commit(); refreshInspectorValues(); } }, 'Reset'),
      );
      insp.append(section('Transform',
        slider('X', () => +(c.x * 100).toFixed(1), v => { c.x = v / 100; }, -50, 150, 0.5, v => v + '%', { reset: 50 }),
        slider('Y', () => +(c.y * 100).toFixed(1), v => { c.y = v / 100; }, -50, 150, 0.5, v => v + '%', { reset: 50 }),
        slider('Scale', () => Math.round(c.scale * 100), v => { c.scale = v / 100; }, 5, 500, 1, v => v + '%', { reset: 100 }),
        slider('Rotate', () => c.rotation, v => { c.rotation = v; }, -180, 180, 1, v => v + '°', { reset: 0 }),
        slider('Opacity', () => Math.round(c.opacity * 100), v => { c.opacity = v / 100; }, 0, 100, 1, v => v + '%', { reset: 100 }),
        fitBtns,
      ));
    }

    if (c.type === 'video' || c.type === 'image') {
      const chips = el('div', { class: 'chips' }, Object.entries(FILTER_PRESETS).map(([k, p]) => {
        const sw = el('div', { class: 'sw', style: (m && m.thumb ? `background:url("${m.thumb}") center/cover;` : '') + `filter:${PRESET_CSS(k)}` });
        const b = el('button', { class: 'chip' + (c.preset === k ? ' on' : '') }, sw, el('span', {}, p.label));
        b.addEventListener('click', () => { c.preset = k; c.filters = { ...NO_FILTER, ...p.f }; commit(); renderInspector(); });
        return b;
      }));
      const f = c.filters;
      insp.append(section('Filters', chips));
      insp.append(section('Adjust',
        slider('Brightness', () => f.brightness, v => { f.brightness = v; }, 0, 200, 1, v => v, { reset: 100 }),
        slider('Contrast', () => f.contrast, v => { f.contrast = v; }, 0, 200, 1, v => v, { reset: 100 }),
        slider('Saturation', () => f.saturate, v => { f.saturate = v; }, 0, 300, 1, v => v, { reset: 100 }),
        slider('Hue', () => f.hue, v => { f.hue = v; }, -180, 180, 1, v => v + '°', { reset: 0 }),
        slider('B&W', () => f.grayscale, v => { f.grayscale = v; }, 0, 100, 1, v => v, { reset: 0 }),
        slider('Sepia', () => f.sepia, v => { f.sepia = v; }, 0, 100, 1, v => v, { reset: 0 }),
        slider('Blur', () => f.blur, v => { f.blur = v; }, 0, 30, 0.5, v => v, { reset: 0 }),
      ));
    }

    if (c.type === 'video' || c.type === 'audio') {
      const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
      const sp = el('div', { class: 'row' }, speeds.map(s => {
        const b = el('button', { class: c.speed === s ? 'on' : '' }, s + '×');
        b.addEventListener('click', () => { setSpeed(c, track, s); commit(); renderInspector(); });
        return b;
      }));
      insp.append(section('Speed & Audio', sp,
        slider('Volume', () => Math.round(c.volume * 100), v => { c.volume = v / 100; }, 0, 200, 1, v => v + '%', { reset: 100 }),
      ));
    }

    insp.append(section('Fade',
      slider('Fade in', () => c.fadeIn, v => { c.fadeIn = Math.min(v, c.duration / 2); }, 0, 3, 0.05, v => v.toFixed(2) + 's', { reset: 0, timeline: true }),
      slider('Fade out', () => c.fadeOut, v => { c.fadeOut = Math.min(v, c.duration / 2); }, 0, 3, 0.05, v => v.toFixed(2) + 's', { reset: 0, timeline: true }),
    ));
  }

  function emptyInspector() {
    const keys = [
      ['Space', 'Play / pause'], ['S', 'Split at playhead'], ['D', 'Duplicate'], ['Del', 'Delete clip'],
      ['← →', 'Step 1 frame (Shift: 1s)'], ['Home / End', 'Jump to start / end'], ['Ctrl Z', 'Undo'],
      ['Ctrl ⇧ Z', 'Redo'], ['+ / −', 'Zoom timeline'], ['Ctrl+scroll', 'Zoom timeline'],
    ];
    return el('div', { class: 'empty-insp' },
      el('h2', {}, 'No clip selected'),
      el('p', {}, 'Import media on the left, hit ＋ to add it, then click a clip to edit it. Drag things around right on the preview.'),
      el('div', { class: 'kbd-list' }, keys.flatMap(([k, d]) => [el('kbd', {}, k), el('span', {}, d)])),
    );
  }

  // ------------------------------------------------------------------
  // auto captions: Whisper speech-to-text, running in a Web Worker on
  // the viewer's own device (transformers.js + ONNX Runtime / WebAssembly)
  // ------------------------------------------------------------------
  const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
  const CAPTION_MODELS = {
    tiny: { en: 'onnx-community/whisper-tiny.en_timestamped', multi: 'onnx-community/whisper-tiny_timestamped' },
    base: { en: 'onnx-community/whisper-base.en_timestamped', multi: 'onnx-community/whisper-base_timestamped' },
  };
  const CAPTION_LANGS = [
    ['en', 'English'], ['auto', 'Auto-detect (any language)'],
    ['arabic', 'Arabic'], ['chinese', 'Chinese'], ['dutch', 'Dutch'], ['french', 'French'], ['german', 'German'],
    ['hindi', 'Hindi'], ['indonesian', 'Indonesian'], ['italian', 'Italian'], ['japanese', 'Japanese'],
    ['korean', 'Korean'], ['polish', 'Polish'], ['portuguese', 'Portuguese'], ['russian', 'Russian'],
    ['spanish', 'Spanish'], ['swahili', 'Swahili'], ['tagalog', 'Tagalog'], ['turkish', 'Turkish'],
    ['ukrainian', 'Ukrainian'], ['vietnamese', 'Vietnamese'],
  ];
  const CAPTION_STYLES = {
    classic: { label: 'Classic', t: { color: '#ffffff', stroke: '#000000', strokeW: 12, bg: '', bold: true, shadow: false, glow: false, font: FONTS[0][0], anim: 'none' } },
    pop:     { label: 'Pop',     t: { color: '#ffd43b', stroke: '#000000', strokeW: 14, bg: '', bold: true, shadow: false, glow: false, font: FONTS[1][0], anim: 'pop' } },
    boxed:   { label: 'Boxed',   t: { color: '#ffffff', stroke: '#000000', strokeW: 0, bg: '#000000b3', bold: true, shadow: false, glow: false, font: FONTS[0][0], anim: 'none' } },
    clean:   { label: 'Clean',   t: { color: '#ffffff', stroke: '#000000', strokeW: 0, bg: '', bold: true, shadow: true, glow: false, font: FONTS[0][0], anim: 'fade' } },
  };
  const CAPTION_STYLE_KEYS = ['font', 'size', 'color', 'stroke', 'strokeW', 'bg', 'bold', 'italic', 'align', 'shadow', 'glow', 'anim', 'x', 'y', 'scale', 'rotation', 'opacity'];

  // Runs inside the worker. Loads the model once and keeps it for the next run.
  const CAPTION_WORKER_SRC = `
    let asr = null, asrModel = null;
    self.onmessage = async (e) => {
      const { id, model, audio, language } = e.data;
      try {
        const { pipeline } = await import(${JSON.stringify(TRANSFORMERS_URL)});
        if (asrModel !== model) {
          if (asr && asr.dispose) { try { await asr.dispose(); } catch (_) {} }
          asr = null; asrModel = null;
          asr = await pipeline('automatic-speech-recognition', model, {
            progress_callback: (p) => self.postMessage({ id, type: 'progress', p }),
          });
          asrModel = model;
        }
        self.postMessage({ id, type: 'loaded' });
        const opts = { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 };
        if (!model.includes('.en')) { opts.task = 'transcribe'; if (language) opts.language = language; }
        const out = await asr(audio, opts);
        self.postMessage({ id, type: 'result', chunks: out.chunks || [] });
      } catch (err) {
        self.postMessage({ id, type: 'error', message: String((err && err.message) || err) });
      }
    };`;

  let capWorker = null, capJob = null, capBusy = false, capStopped = false;
  const stoppedError = () => Object.assign(new Error('cancelled'), { cancelled: true });

  function getCaptionWorker() {
    if (!capWorker) {
      const url = URL.createObjectURL(new Blob([CAPTION_WORKER_SRC], { type: 'text/javascript' }));
      capWorker = new Worker(url, { type: 'module' });
      capWorker.onmessage = (e) => { if (capJob) capJob.onMessage(e.data); };
      capWorker.onerror = (e) => {
        e.preventDefault();
        if (capJob) capJob.onMessage({ id: capJob.id, type: 'error', message: e.message || 'The caption worker crashed' });
      };
    }
    return capWorker;
  }

  function transcribe(audio, model, language, onProgress) {
    return new Promise((resolve, reject) => {
      const id = uid();
      capJob = {
        id, reject,
        onMessage(d) {
          if (d.id !== id) return;
          if (d.type === 'progress' || d.type === 'loaded') onProgress(d);
          else if (d.type === 'result') { capJob = null; resolve(d.chunks); }
          else if (d.type === 'error') { capJob = null; reject(new Error(d.message)); }
        },
      };
      getCaptionWorker().postMessage({ id, model, audio, language }, [audio.buffer]);
    });
  }

  function cancelTranscription() {
    if (capWorker) { capWorker.terminate(); capWorker = null; }
    if (capJob) {
      const job = capJob;
      capJob = null;
      job.reject(stoppedError());
    }
  }

  /** Decode a media file's audio to 16 kHz mono, the format Whisper expects. */
  async function decodePcm16k(m) {
    const buf = await (await fetch(m.url)).arrayBuffer();
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ab = await new OAC(1, 1, 16000).decodeAudioData(buf);   // resamples to 16 kHz
    const n = ab.numberOfChannels;
    if (n === 1) return ab.getChannelData(0);
    const out = new Float32Array(ab.length);
    for (let ch = 0; ch < n; ch++) {
      const d = ab.getChannelData(ch);
      for (let i = 0; i < d.length; i++) out[i] += d[i];
    }
    for (let i = 0; i < out.length; i++) out[i] /= n;
    return out;
  }

  /** Whisper word chunks (seconds into the slice) -> timeline words, minus [Music]-style tags. */
  function captionWords(chunks, c) {
    const words = [];
    let depth = 0;
    const end = clipEnd(c);
    for (const ch of chunks) {
      const raw = String(ch.text || '').trim();
      const opens = (raw.match(/[[(]/g) || []).length;
      const closes = (raw.match(/[\])]/g) || []).length;
      const insideTag = depth > 0 || opens > 0;
      depth = Math.max(0, depth + opens - closes);
      const text = raw.replace(/[[\]()]/g, '').trim();
      if (insideTag || !text || /[♪♫]/.test(text)) continue;
      const ts = ch.timestamp || [];
      const a = ts[0];
      if (a == null || !isFinite(a)) continue;
      let b = ts[1];
      if (b == null || !isFinite(b) || b < a) b = a + 0.3;
      const s = c.start + a / c.speed;
      if (s >= end - 0.05) continue;
      words.push({ text, start: Math.max(c.start, s), end: Math.min(end, Math.max(c.start + b / c.speed, s + 0.08)) });
    }
    return words;
  }

  /** Group words into short captions: break on word count, pauses and sentence ends. */
  function groupCaptionWords(words, maxWords, clipEndT) {
    const groups = [];
    let cur = [];
    for (const w of words) {
      const prev = cur[cur.length - 1];
      if (prev && (cur.length >= maxWords || w.start - prev.end > 0.7 || /[.!?]$/.test(prev.text))) {
        groups.push(cur);
        cur = [];
      }
      cur.push(w);
    }
    if (cur.length) groups.push(cur);
    return groups.map((g, i) => {
      const start = g[0].start;
      const next = groups[i + 1];
      const lastEnd = g[g.length - 1].end;
      // hold each caption until the next one starts, unless there's a real pause
      let end = next && next[0].start - lastEnd < 0.7 ? next[0].start : lastEnd + 0.25;
      if (next) end = Math.min(end, next[0].start);
      end = Math.min(end, clipEndT);
      if (end - start < 0.2) end = Math.min(clipEndT, start + 0.2);
      return { words: g.map(w => w.text), start, end };
    }).filter(g => g.end - g.start >= 0.05);
  }

  function captionText(words, textCase) {
    let s = words.join(' ').replace(/\s+([,.!?;:])/g, '$1').replace(/[,.;:]+$/, '');
    if (textCase === 'upper') s = s.toUpperCase();
    else if (textCase === 'lower') s = s.toLowerCase();
    return s;
  }

  /** Break a caption onto extra lines when it would run off the side of the frame. */
  function wrapCaption(c) {
    const size = c.size * shortSide() / 1080;
    ctx.save();
    ctx.font = textFont(c, size);
    const maxW = (canvas.width * 0.86) / c.scale - (c.bg ? size * 0.7 : 0);
    const lines = [];
    let line = '';
    for (const word of c.text.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    ctx.restore();
    c.text = lines.join('\n');
  }

  const captionTracks = () => tracks().filter(t => t.captions);
  function removeAllCaptions() {
    for (const tr of tracks()) tr.clips = tr.clips.filter(c => !c.caption);
    state.project.tracks = tracks().filter(t => !(t.captions && !t.clips.length));
  }
  function addCaptionClip(c) {
    for (const tr of captionTracks()) if (fits(tr, c.start, c.duration)) { tr.clips.push(c); return; }
    const tr = newTrack('visual');
    tr.captions = true;
    tracks().unshift(tr);
    tr.clips.push(c);
  }

  function applyStyleToAllCaptions(src) {
    let n = 0;
    for (const c of allClips()) {
      if (!c.caption || c === src) continue;
      for (const k of CAPTION_STYLE_KEYS) c[k] = src[k];
      n++;
    }
    commit();
    toast(n ? `Copied this style to ${n} other caption${n > 1 ? 's' : ''}` : 'This is the only caption');
  }
  function deleteAllCaptions() {
    const n = allClips().filter(c => c.caption).length;
    removeAllCaptions();
    select(null);
    commit();
    toast(`Deleted ${n} caption${n === 1 ? '' : 's'} · Ctrl+Z to undo`);
  }

  // ---- caption settings (remembered per browser) ----
  const capPrefs = { lang: 'en', model: 'tiny', words: 3, style: 'classic', textCase: 'none' };
  try { Object.assign(capPrefs, JSON.parse(localStorage.getItem('ghostcut.captions') || '{}')); } catch { /* storage unavailable */ }
  if (!CAPTION_STYLES[capPrefs.style]) capPrefs.style = 'classic';
  if (!CAPTION_MODELS[capPrefs.model]) capPrefs.model = 'tiny';
  if (!CAPTION_LANGS.some(([v]) => v === capPrefs.lang)) capPrefs.lang = 'en';
  capPrefs.words = clamp(Math.round(+capPrefs.words) || 3, 1, 6);
  const saveCapPrefs = () => { try { localStorage.setItem('ghostcut.captions', JSON.stringify(capPrefs)); } catch { /* ignore */ } };

  function buildCaptionModal() {
    $('#capLang').append(...CAPTION_LANGS.map(([v, l]) => el('option', { value: v }, l)));
    const styles = $('#capStyles');
    for (const [key, s] of Object.entries(CAPTION_STYLES)) {
      const t = s.t;
      const css = [
        `font:800 14px ${t.font}`, `color:${t.color}`,
        t.strokeW ? `-webkit-text-stroke:3px ${t.stroke};paint-order:stroke fill` : '',
        t.bg ? `background:${t.bg};padding:2px 6px;border-radius:4px` : '',
        t.shadow ? 'text-shadow:0 2px 4px #000' : '',
      ].join(';');
      const b = el('button', { type: 'button', 'data-style': key, title: s.label }, el('span', { style: css }, s.label));
      b.addEventListener('click', () => { capPrefs.style = key; syncCapForm(); });
      styles.append(b);
    }
    $('#capLang').addEventListener('change', (e) => { capPrefs.lang = e.target.value; });
    $('#capModel').addEventListener('change', (e) => { capPrefs.model = e.target.value; });
    $('#capCase').addEventListener('change', (e) => { capPrefs.textCase = e.target.value; });
    $('#capWords').addEventListener('input', (e) => { capPrefs.words = +e.target.value; $('#capWordsVal').textContent = capPrefs.words; });
    $('#capGo').addEventListener('click', runCaptions);
    $('#capCancel').addEventListener('click', () => {
      if (capBusy) { capStopped = true; cancelTranscription(); } else closeCaptionModal();
    });
    $('#autoCapBtn').addEventListener('click', openCaptionModal);
  }

  function syncCapForm() {
    $('#capLang').value = capPrefs.lang;
    $('#capModel').value = capPrefs.model;
    $('#capCase').value = capPrefs.textCase;
    $('#capWords').value = capPrefs.words;
    $('#capWordsVal').textContent = capPrefs.words;
    $$('#capStyles button').forEach(b => b.classList.toggle('on', b.dataset.style === capPrefs.style));
  }

  function openCaptionModal() {
    if (state.exporting) return;
    pause();
    const list = $('#capSources');
    list.innerHTML = '';
    const sources = allClips().filter(c => (c.type === 'video' || c.type === 'audio') && state.media.get(c.mediaId))
      .sort((a, b) => a.start - b.start);
    const hasVideo = sources.some(c => c.type === 'video');
    for (const c of sources) {
      const m = state.media.get(c.mediaId);
      const box = el('input', { type: 'checkbox', value: c.id });
      // music files usually shouldn't be captioned, so audio clips start unticked when there's video
      box.checked = c.type === 'video' || !hasVideo;
      list.append(el('label', {}, box, el('span', { title: m.name }, `${c.type === 'video' ? '🎬' : '🎵'} ${m.name}`),
        el('em', {}, `${fmt(c.start, false)}–${fmt(clipEnd(c), false)}`)));
    }
    if (!sources.length) list.append(el('p', { class: 'muted small', style: 'margin:0' }, 'Add a video or audio clip with someone talking first.'));
    $('#capGo').disabled = !sources.length;
    $('#capReplaceRow').classList.toggle('hidden', !allClips().some(c => c.caption));
    $('#capReplace').checked = true;
    syncCapForm();
    setCapBusy(false);
    capErrorMsg('');
    $('#captionModal').classList.remove('hidden');
  }
  function closeCaptionModal() { $('#captionModal').classList.add('hidden'); }

  let capTimer = 0;
  function setCapBusy(busy) {
    capBusy = busy;
    $('#capForm').classList.toggle('hidden', busy);
    $('#capProgress').classList.toggle('hidden', !busy);
    $('#capGo').classList.toggle('hidden', busy);
    $('#capCancel').textContent = busy ? 'Stop' : 'Cancel';
    if (!busy) clearInterval(capTimer);
  }
  function capProgress(status, pct, detail = '') {
    $('#capStatus').textContent = status;
    const indeterminate = pct == null;
    $('#capBarWrap').classList.toggle('indeterminate', indeterminate);
    $('#capBar').style.width = indeterminate ? '' : `${clamp(pct, 0, 100)}%`;
    $('#capDetail').textContent = detail;
  }
  function capErrorMsg(msg) {
    $('#capError').textContent = msg;
    $('#capError').classList.toggle('hidden', !msg);
  }
  function friendlyCaptionError(err) {
    const msg = String((err && err.message) || err);
    if (/fetch|network|import|load|module|404|ERR_/i.test(msg)) {
      return 'Couldn’t download the caption AI. Check your internet connection and try again. (After the first download it works offline.)';
    }
    if (/memory|allocation|OOM/i.test(msg)) return 'Your device ran out of memory. Try the Fast model, or caption shorter clips.';
    return `Captioning failed: ${msg}`;
  }

  async function runCaptions() {
    // snapshot the chosen clips so later edits can't shift them mid-run
    const sources = $$('#capSources input:checked').map(i => findClip(i.value)).filter(Boolean).map(f => ({ ...f.clip }));
    if (!sources.length) { capErrorMsg('Tick at least one clip to caption.'); return; }
    saveCapPrefs();
    capErrorMsg('');
    const prefs = { ...capPrefs };
    const replace = !$('#capReplaceRow').classList.contains('hidden') && $('#capReplace').checked;
    const model = CAPTION_MODELS[prefs.model][prefs.lang === 'en' ? 'en' : 'multi'];
    const language = prefs.lang === 'en' || prefs.lang === 'auto' ? null : prefs.lang;
    const style = CAPTION_STYLES[prefs.style].t;
    const tall = canvas.height > canvas.width;

    setCapBusy(true);
    capStopped = false;
    const pcmCache = new Map();
    const made = [];
    const skipped = [];
    const files = {};
    try {
      for (let i = 0; i < sources.length; i++) {
        const c = sources[i];
        const m = state.media.get(c.mediaId);
        const label = sources.length > 1 ? ` (clip ${i + 1} of ${sources.length})` : '';
        capProgress(`Reading audio${label}…`, null, m.name);
        let pcm = pcmCache.get(m.id);
        if (!pcm) {
          try { pcm = await decodePcm16k(m); } catch { if (capStopped) throw stoppedError(); skipped.push(m.name); continue; }
          pcmCache.set(m.id, pcm);
        }
        if (capStopped) throw stoppedError();
        const a = Math.max(0, Math.floor(c.in * 16000));
        const b = Math.min(pcm.length, Math.ceil((c.in + c.duration * c.speed) * 16000));
        if (b - a < 16000 * 0.3) continue;
        const slice = pcm.slice(a, b);

        const t0 = performance.now();
        const listening = () => capProgress(`Listening${label}…`, null, `${m.name} · ${Math.round((performance.now() - t0) / 1000)}s`);
        const chunks = await transcribe(slice, model, language, (d) => {
          if (d.type === 'loaded') {
            listening();
            clearInterval(capTimer);
            capTimer = setInterval(listening, 1000);
            return;
          }
          const p = d.p || {};
          if (p.status === 'progress' && p.file && p.total) {
            files[p.file] = { loaded: p.loaded || 0, total: p.total };
            let loaded = 0, total = 0;
            for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
            if (total > 1e6) {
              capProgress('Downloading caption AI (first time only)…', (loaded / total) * 100,
                `${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`);
            }
          } else if (p.status === 'initiate' || p.status === 'download') {
            if (!Object.keys(files).length) capProgress('Loading caption AI…', null, '');
          }
        });
        clearInterval(capTimer);

        const words = captionWords(chunks, c);
        for (const g of groupCaptionWords(words, prefs.words, clipEnd(c))) {
          const cap = textClip({
            ...style,
            text: captionText(g.words, prefs.textCase),
            size: tall ? 64 : 58,
            y: tall ? 0.7 : 0.84,
            caption: true,
          });
          cap.start = g.start;
          cap.duration = g.end - g.start;
          wrapCaption(cap);
          made.push(cap);
        }
      }
    } catch (err) {
      clearInterval(capTimer);
      setCapBusy(false);
      if (err && err.cancelled) { capErrorMsg('Stopped. Nothing was added.'); return; }
      console.error(err);
      capErrorMsg(friendlyCaptionError(err));
      return;
    }
    setCapBusy(false);
    if (!made.length) {
      capErrorMsg(skipped.length
        ? `Couldn’t read the audio in ${skipped.join(', ')}. Your browser may not support that file’s sound format.`
        : 'Didn’t hear any speech in the selected clips.');
      return;
    }
    if (replace) removeAllCaptions();
    for (const cap of made) addCaptionClip(cap);
    select(null);
    commit();
    closeCaptionModal();
    toast(`Added ${made.length} captions ✨ Click one to edit it, or restyle them all at once`, 4500);
    if (skipped.length) toast(`Skipped ${skipped.join(', ')}: couldn’t read its audio`, 5000);
  }

  // ------------------------------------------------------------------
  // left panel
  // ------------------------------------------------------------------
  function renderMediaGrid() {
    const grid = $('#mediaGrid');
    grid.innerHTML = '';
    for (const m of state.media.values()) {
      if (m.removed) continue;
      if (m.loading) { grid.append(el('div', { class: 'media-item loading' }, 'loading…')); continue; }
      const item = el('div', {
        class: `media-item ${m.kind}`, draggable: 'true', title: m.name,
        style: m.thumb ? `background-image:url("${m.thumb}")` : '',
      },
        m.kind === 'audio' ? '🎵' : null,
        isFinite(m.duration) ? el('span', { class: 'dur' }, fmt(m.duration, false)) : null,
        el('button', { class: 'rm', title: 'Remove from project', onclick: (e) => { e.stopPropagation(); removeMedia(m.id); } }, '✕'),
        el('button', { class: 'add', title: 'Add to timeline', onclick: (e) => { e.stopPropagation(); addMediaToTimeline(m.id); } }, '＋'),
        el('span', { class: 'name' }, m.name),
      );
      item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/ghost-media', m.id); e.dataTransfer.effectAllowed = 'copy'; });
      item.addEventListener('dblclick', () => addMediaToTimeline(m.id));
      grid.append(item);
    }
  }

  function buildLeftPanels() {
    const tp = $('#textPresets');
    for (const p of TEXT_PRESETS) {
      const t = textClip(p.t);
      const style = [
        `font:${t.italic ? 'italic ' : ''}${t.bold ? 800 : 500} 15px ${t.font}`,
        `color:${t.color}`,
        t.bg ? `background:${t.bg};padding:2px 8px;border-radius:5px` : '',
        t.strokeW ? `-webkit-text-stroke:1px ${t.stroke};paint-order:stroke fill` : '',
        t.glow ? `text-shadow:0 0 8px ${t.color}` : t.shadow ? 'text-shadow:0 2px 4px #000' : '',
      ].join(';');
      const b = el('button', { class: 'preset', title: `Add “${p.name}” text` }, el('span', { style }, p.name));
      b.addEventListener('click', () => addText(p.t));
      tp.append(b);
    }
    const sg = $('#stickerGrid');
    for (const s of STICKERS) {
      const b = el('button', { title: 'Add sticker' }, s);
      b.addEventListener('click', () => addText({ text: s, size: 220, bold: false, anim: 'pop' }));
      sg.append(b);
    }
    $$('.tab').forEach(tab => tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
      $$('.tab-body').forEach(b => b.classList.toggle('hidden', b.dataset.body !== tab.dataset.tab));
    }));
  }

  // ------------------------------------------------------------------
  // top bar + global wiring
  // ------------------------------------------------------------------
  function syncTopbar() {
    $('#aspectSel').value = state.project.aspect;
    $('#resSel').value = String(state.project.res);
    $('#bgColor').value = state.project.bg;
  }

  function wire() {
    $('#fileInput').addEventListener('change', (e) => { importFiles([...e.target.files]); e.target.value = ''; });
    $('#undoBtn').addEventListener('click', undo);
    $('#redoBtn').addEventListener('click', redo);
    $('#aspectSel').addEventListener('change', (e) => { state.project.aspect = e.target.value; commit(); });
    $('#resSel').addEventListener('change', (e) => { state.project.res = +e.target.value; commit(); });
    $('#bgColor').addEventListener('input', (e) => { state.project.bg = e.target.value; requestRender(); });
    $('#bgColor').addEventListener('change', () => commit());
    $('#exportBtn').addEventListener('click', startExport);
    $('#resaveBtn').addEventListener('click', saveExport);
    $('#cancelExportBtn').addEventListener('click', cancelExport);
    $('#playBtn').addEventListener('click', togglePlay);
    $('#toStartBtn').addEventListener('click', () => seek(0));
    $('#toEndBtn').addEventListener('click', () => seek(projectDuration()));
    $('#splitBtn').addEventListener('click', () => splitAt(state.time));
    $('#dupBtn').addEventListener('click', duplicateSelected);
    $('#delBtn').addEventListener('click', deleteSelected);
    $('#addVTrackBtn').addEventListener('click', () => { insertTrack('visual', true); commit(); });
    $('#addATrackBtn').addEventListener('click', () => { insertTrack('audio'); commit(); });
    $('#snapChk').addEventListener('change', (e) => { state.snap = e.target.checked; });
    $('#zoomRange').addEventListener('input', (e) => setZoom(+e.target.value));

    // drop files anywhere
    let dragDepth = 0;
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; document.body.classList.add('dragging'); } });
    window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0; document.body.classList.remove('dragging');
      importFiles([...e.dataTransfer.files]);
    });

    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'textarea' || (tag === 'input' && !['range', 'checkbox', 'color'].includes(e.target.type)) || tag === 'select') return;
      if (state.exporting) return;
      if (!$('#captionModal').classList.contains('hidden')) {
        if (e.key === 'Escape' && !capBusy) closeCaptionModal();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (k === ' ') { e.preventDefault(); togglePlay(); }
      else if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (mod && k.toLowerCase() === 'b') { e.preventDefault(); splitAt(state.time); }
      else if (mod) return;
      else if (k === 's' || k === 'S') splitAt(state.time);
      else if (k === 'd' || k === 'D') duplicateSelected();
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSelected(); }
      else if (k === 'ArrowLeft') { e.preventDefault(); seek(state.time - (e.shiftKey ? 1 : 1 / 30)); }
      else if (k === 'ArrowRight') { e.preventDefault(); seek(state.time + (e.shiftKey ? 1 : 1 / 30)); }
      else if (k === 'Home') { e.preventDefault(); seek(0); }
      else if (k === 'End') { e.preventDefault(); seek(projectDuration()); }
      else if (k === '+' || k === '=') setZoom(state.pps * 1.25);
      else if (k === '-' || k === '_') setZoom(state.pps / 1.25);
      else if (k === 'Escape') select(null);
    });

    window.addEventListener('beforeunload', (e) => {
      if (allClips().length) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ------------------------------------------------------------------
  // boot
  // ------------------------------------------------------------------
  buildLeftPanels();
  buildCaptionModal();
  wire();
  syncTopbar();
  renderMediaGrid();
  renderInspector();
  commit();

  // tiny hook for automated tests / power users poking around in devtools
  window.GhostCut = { state, importFiles, addMediaToTimeline, addText, splitAt, seek, play, pause, startExport, undo, redo, projectDuration };
})();
