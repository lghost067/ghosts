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
    { name: 'Title',     t: { text: 'BIG TITLE', font: FONTS[1][0], size: 150, color: '#ffffff', shadow: true, animIn: 'pop' } },
    { name: 'Boxed',     t: { text: 'Boxed', color: '#111111', bg: '#ffd43b', bold: true, animIn: 'slide-up' } },
    { name: 'Neon',      t: { text: 'neon vibes', color: '#22d3ee', glow: true, bold: true, size: 110, animIn: 'fade', animLoop: 'pulse' } },
    { name: 'Subtitle',  t: { text: 'subtitle goes here', color: '#ffffff', bg: '#000000aa', size: 52, y: 0.86 } },
    { name: 'Typewriter',t: { text: 'typing...', font: FONTS[3][0], color: '#a3e635', size: 80, animIn: 'typewriter', animInDur: 1 } },
    { name: 'Meme',      t: { text: 'TOP TEXT', font: FONTS[1][0], color: '#ffffff', stroke: '#000000', strokeW: 14, size: 120, y: 0.12 } },
  ];
  const STICKERS = '😂 💀 🔥 ✨ 👻 😭 🤯 😎 🥹 ❤️ 💯 👀 🎉 🙏 😤 🫡 🤡 💅 🗿 ⭐ ⚡ 🌈 🎵 📸 🍕 🐐 👑 💸 🚀 ✅ ❌ ⬆️ ➡️ 💬 ❓ ‼️'.split(' ');

  // Animation presets. In/Out play at the clip's edges; Loop runs for the whole clip.
  const ANIM_MOVES = [
    ['none', 'None'], ['fade', 'Fade'], ['pop', 'Pop'], ['zoom-in', 'Zoom in'], ['zoom-out', 'Zoom out'],
    ['slide-left', 'Slide left'], ['slide-right', 'Slide right'], ['slide-up', 'Slide up'], ['slide-down', 'Slide down'],
    ['spin', 'Spin'],
  ];
  const ANIM_TEXT_ONLY = [['typewriter', 'Typewriter']];
  const ANIM_LOOPS = [
    ['none', 'None'], ['kenburns', 'Slow zoom (Ken Burns)'], ['pulse', 'Pulse'], ['float', 'Float'],
    ['sway', 'Sway'], ['shake', 'Shake'], ['rotate', 'Rotate'],
  ];
  // Loop tuning, in each loop's own units. A clip stores animLoopRate / animLoopAmt (null = the default here).
  // Tempo is stored in beats per second but shown in BPM so it can be matched to a song.
  const bpm = (hz) => ({ label: 'Tempo (BPM)', def: hz, min: 10, max: 300, step: 1, toUI: (v) => Math.round(v * 60), fromUI: (b) => b / 60, number: true,
    title: 'Beats per minute: set it to your song\'s BPM to move on the beat' });
  const pct1 = (v) => (v * 100).toFixed(1) + '%';
  const LOOP_PARAMS = {
    kenburns: { amt: { label: 'Zoom', def: 0.15, min: -0.5, max: 0.6, step: 0.01, title: 'How far it zooms over the clip. Below 0 zooms out instead',
      show: (v) => (v < 0 ? '−' : '+') + Math.round(Math.abs(v) * 100) + '%' } },
    pulse: { rate: bpm(1.4), amt: { label: 'Strength', def: 0.06, min: 0.01, max: 0.4, step: 0.01, show: (v) => '±' + Math.round(v * 100) + '%' } },
    float: { rate: bpm(0.6), amt: { label: 'Distance', def: 0.015, min: 0.002, max: 0.15, step: 0.001, show: pct1 } },
    sway:  { rate: bpm(0.5), amt: { label: 'Angle', def: 5, min: 1, max: 45, step: 1, show: (v) => '±' + v + '°' } },
    shake: { rate: { label: 'Speed', def: 1, min: 0.2, max: 4, step: 0.1, show: (v) => v.toFixed(1) + '×' },
             amt: { label: 'Strength', def: 0.006, min: 0.001, max: 0.05, step: 0.001, show: pct1 } },
    rotate: { rate: { label: 'Speed (°/s)', def: 120, min: -720, max: 720, step: 5, number: true,
      title: 'Degrees per second. Negative spins anticlockwise' } },
  };
  const LOOP_FIELD = { rate: 'animLoopRate', amt: 'animLoopAmt' };
  /** A loop's rate or amount for clip c, falling back to the default for its loop type. */
  function loopVal(c, key) {
    const P = (LOOP_PARAMS[c.animLoop] || {})[key];
    const v = c[LOOP_FIELD[key]];
    return typeof v === 'number' && Number.isFinite(v) ? v : (P ? P.def : 1);
  }
  // Keyframes: these properties can be animated over time.
  const KF_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity'];
  const KF_EASES = [['smooth', 'Smooth'], ['linear', 'Linear'], ['in', 'Ease in'], ['out', 'Ease out'], ['hold', 'Hold (jump)']];
  const FRAME = 1 / 30;

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
    selectedId: null,     // the "primary" selected clip (drives the inspector)
    selectedIds: new Set(),
    multiMode: false,     // tap-to-add selection (for phones, where there's no Shift key)
    time: 0,
    playing: false,
    stopAt: null,         // when previewing an animation, pause here
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
  const selectedAll = () => [...state.selectedIds].map(findClip).filter(Boolean);
  const isVisual = (c) => c.type !== 'audio';
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
    state.selectedIds = new Set([...state.selectedIds].filter(id => findClip(id)));
    if (state.selectedId && !findClip(state.selectedId)) state.selectedId = [...state.selectedIds].pop() || null;
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
    setSelection([...state.selectedIds], state.selectedId);   // drops clips that no longer exist
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
    animIn: 'none', animInDur: 0.5, animOut: 'none', animOutDur: 0.5, animLoop: 'none',
    animLoopRate: null, animLoopAmt: null,   // loop tempo/strength (null = default for that loop)
    animLoopOfs: 0,       // seconds the loop is already into its cycle at the clip start (keeps the beat across splits/trims)
    kf: {},               // prop -> [{t (seconds from clip start), v}], sorted by t
    kfEase: 'smooth',
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
      shadow: false, glow: false,
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
  const canSplit = (c, t) => t - c.start > MIN_DUR / 2 && clipEnd(c) - t > MIN_DUR / 2;

  function splitAt(t) {
    // selection set → split the selected clips under the playhead; nothing selected → split everything there
    let targets;
    if (state.selectedIds.size) {
      targets = selectedAll().filter(({ clip }) => canSplit(clip, t));
      if (!targets.length) { toast('Move the playhead over a selected clip to split it'); return; }
    } else {
      targets = [];
      for (const tr of tracks()) for (const c of tr.clips) if (canSplit(c, t)) targets.push({ clip: c, track: tr });
      if (!targets.length) { toast('Move the playhead over a clip to split it'); return; }
    }
    const newIds = [];
    for (const { clip: c, track } of targets) {
      const left = t - c.start;
      const b = JSON.parse(JSON.stringify(c));
      b.id = uid();
      b.start = t;
      b.duration = c.duration - left;
      b.in = c.in + left * c.speed;
      b.fadeIn = 0;
      b.animIn = 'none';          // the In animation stays on the first half…
      b.animLoopOfs = (c.animLoopOfs || 0) + left;   // the loop carries on mid-beat instead of restarting
      c.duration = left;
      c.fadeOut = 0;
      c.animOut = 'none';         // …and the Out animation moves to the second half
      // keep motion continuous: both halves get a keyframe at the cut with the value there
      for (const p of KF_PROPS) {
        const keys = (c.kf && c.kf[p]) || [];
        if (!keys.length) continue;
        const v = kfValue(keys, left, c.kfEase);
        c.kf[p] = keys.filter(k => k.t < left - 1e-6).concat({ t: left, v });
        b.kf[p] = [{ t: 0, v }].concat(keys.filter(k => k.t > left + 1e-6).map(k => ({ t: k.t - left, v: k.v })));
      }
      track.clips.push(b);
      newIds.push(b.id);
    }
    if (state.selectedIds.size) setSelection(newIds, newIds[newIds.length - 1]);
    commit();
    renderInspector();
  }

  function deleteSelected() {
    const ids = new Set(state.selectedIds);
    if (!ids.size) return;
    for (const tr of tracks()) tr.clips = tr.clips.filter(c => !ids.has(c.id));
    select(null);
    commit();
    if (ids.size > 1) toast(`Deleted ${ids.size} clips · Ctrl+Z to undo`);
  }

  function duplicateSelected() {
    const sel = selectedAll();
    if (!sel.length) return;
    // copy the whole group, keeping the clips' timing relative to each other, right after the group
    const groupStart = Math.min(...sel.map(s => s.clip.start));
    const offset = Math.max(...sel.map(s => clipEnd(s.clip))) - groupStart;
    const copies = sel.map(({ clip, track }) => {
      const c = JSON.parse(JSON.stringify(clip));
      c.id = uid();
      c.start = clip.start + offset;
      return { c, track };
    });
    for (const { c, track } of copies) {
      if (fits(track, c.start, c.duration)) track.clips.push(c); else placeClip(c, 'keep');
    }
    setSelection(copies.map(x => x.c.id), copies[copies.length - 1].c.id);
    commit();
  }

  function setSpeed(c, track, speed) {
    const srcLen = c.duration * c.speed;
    const oldDur = c.duration, oldSpeed = c.speed;
    let dur = srcLen / speed;
    const next = track.clips.filter(x => x.id !== c.id && x.start >= c.start + EPS).sort((a, b) => a.start - b.start)[0];
    if (next) dur = Math.min(dur, next.start - c.start);
    c.speed = speed;
    c.duration = Math.max(MIN_DUR, Math.min(dur, srcLimit({ ...c, duration: 0 })));
    c.fadeIn = Math.min(c.fadeIn, c.duration / 2);
    c.fadeOut = Math.min(c.fadeOut, c.duration / 2);
    // keyframes are pinned to moments in the footage, so they stretch/squash with the speed
    if (oldDur > 0) for (const p of KF_PROPS) if (c.kf && c.kf[p]) c.kf[p] = c.kf[p].map(k => ({ t: (k.t * oldSpeed) / speed, v: k.v }));
  }

  // ------------------------------------------------------------------
  // keyframes
  // ------------------------------------------------------------------
  function easeKf(f, ease) {
    switch (ease) {
      case 'linear': return f;
      case 'in': return f * f * f;
      case 'out': return 1 - Math.pow(1 - f, 3);
      case 'hold': return f >= 1 ? 1 : 0;
      default: return f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;   // smooth (ease in-out)
    }
  }
  /** Value of a sorted key list at local time lt. */
  function kfValue(keys, lt, ease) {
    if (lt <= keys[0].t) return keys[0].v;
    const last = keys[keys.length - 1];
    if (lt >= last.t) return last.v;
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (lt >= a.t && lt < b.t) {
        const f = b.t > a.t ? (lt - a.t) / (b.t - a.t) : 1;
        return a.v + (b.v - a.v) * easeKf(f, ease);
      }
    }
    return last.v;
  }
  const hasKf = (c, p) => !!(c.kf && c.kf[p] && c.kf[p].length);
  const hasAnyKf = (c) => KF_PROPS.some(p => hasKf(c, p));
  /** Property value at timeline time t, following keyframes when there are any. */
  const valAt = (c, p, t = state.time) => (hasKf(c, p) ? kfValue(c.kf[p], t - c.start, c.kfEase) : c[p]);
  const playheadIn = (c) => state.time >= c.start - EPS && state.time <= clipEnd(c) + EPS;
  const localNow = (c) => clamp(state.time - c.start, 0, c.duration);
  const keyIndexAt = (c, p, lt) => (c.kf && c.kf[p] ? c.kf[p].findIndex(k => Math.abs(k.t - lt) < FRAME / 2) : -1);

  function upsertKey(c, p, lt, v) {
    if (!c.kf) c.kf = {};
    const keys = c.kf[p] || (c.kf[p] = []);
    const i = keyIndexAt(c, p, lt);
    if (i >= 0) keys[i].v = v;
    else { keys.push({ t: lt, v }); keys.sort((a, b) => a.t - b.t); }
  }
  function removeKey(c, p, i) {
    const keys = c.kf[p];
    const [gone] = keys.splice(i, 1);
    if (!keys.length) { delete c.kf[p]; c[p] = gone.v; }   // last key gone: stay where it was
  }
  /**
   * Set a property "now". If it's animated, this edits/creates the keyframe at the playhead
   * (like other editors: once a property has keyframes, changing it adds one).
   */
  function setProp(c, p, v) {
    if (hasKf(c, p)) {
      if (!playheadIn(c)) return false;
      upsertKey(c, p, localNow(c), v);
    } else c[p] = v;
    return true;
  }
  /** ◆ button on one property: add a keyframe here, or remove the one that's here. */
  function toggleKey(c, p) {
    if (!playheadIn(c)) { toast('Move the playhead over this clip to add a keyframe'); return; }
    const lt = localNow(c);
    const i = keyIndexAt(c, p, lt);
    if (i >= 0) removeKey(c, p, i);
    else upsertKey(c, p, lt, valAt(c, p));
    commit();
    refreshInspectorValues();
  }
  const keyTimes = (c) => [...new Set(KF_PROPS.flatMap(p => (hasKf(c, p) ? c.kf[p].map(k => +k.t.toFixed(4)) : [])))].sort((a, b) => a - b);
  const anyKeyHere = (c) => playheadIn(c) && KF_PROPS.some(p => keyIndexAt(c, p, localNow(c)) >= 0);
  /** Big ◆ button: keyframe every property at the playhead, or remove all keys here. */
  function toggleAllKeys(c) {
    if (!playheadIn(c)) { toast('Move the playhead over this clip to add a keyframe'); return; }
    const lt = localNow(c);
    if (anyKeyHere(c)) {
      for (const p of KF_PROPS) { const i = keyIndexAt(c, p, lt); if (i >= 0) removeKey(c, p, i); }
    } else {
      for (const p of KF_PROPS) upsertKey(c, p, lt, valAt(c, p));
      if (keyTimes(c).length === 1) toast('Keyframe added ◆ Now move the playhead and change something to animate it', 4500);
    }
    commit();
    renderInspector();
  }
  function jumpKey(c, dir) {
    const lt = state.time - c.start;
    const times = keyTimes(c).filter(t => t >= -EPS && t <= c.duration + EPS);
    const target = dir < 0 ? times.filter(t => t < lt - FRAME / 2).pop() : times.find(t => t > lt + FRAME / 2);
    if (target == null) { toast(dir < 0 ? 'No earlier keyframe' : 'No later keyframe'); return; }
    seek(c.start + target);
  }
  function clearKeys(c) {
    for (const p of KF_PROPS) if (hasKf(c, p)) c[p] = valAt(c, p);
    c.kf = {};
    commit();
    renderInspector();
  }

  // ------------------------------------------------------------------
  // In / Out / Loop animations
  // ------------------------------------------------------------------
  /** Extra motion from animation presets at local time lt: multiply alpha/scale, add offsets. */
  function animFx(c, lt) {
    const fx = { alpha: 1, scale: 1, dx: 0, dy: 0, rot: 0, chars: Infinity };
    const D = c.duration;
    const inDur = Math.min(c.animInDur || 0, D / 2), outDur = Math.min(c.animOutDur || 0, D / 2);
    if (c.animIn && c.animIn !== 'none' && inDur > 0 && lt < inDur) applyMove(fx, c.animIn, clamp(lt / inDur, 0, 1), true);
    if (c.animOut && c.animOut !== 'none' && outDur > 0 && lt > D - outDur) applyMove(fx, c.animOut, clamp((D - lt) / outDur, 0, 1), false);
    const TAU = Math.PI * 2;
    if (c.animLoop && c.animLoop !== 'none') {
      const rate = loopVal(c, 'rate'), amt = loopVal(c, 'amt');
      const lp = lt + (c.animLoopOfs || 0);      // loop time, continuous across splits
      switch (c.animLoop) {
        case 'kenburns': {
          const p = clamp(lt / D, 0, 1);
          fx.scale *= amt >= 0 ? 1 + amt * p : 1 - amt * (1 - p);   // zoom in, or start close and zoom out
          break;
        }
        case 'pulse': fx.scale *= 1 + amt * Math.sin(TAU * rate * lp); break;
        case 'float': fx.dy += amt * Math.sin(TAU * rate * lp); break;
        case 'sway': fx.rot += amt * Math.sin(TAU * rate * lp); break;
        case 'shake': {
          const q = lp * rate;
          fx.dx += amt * (Math.sin(q * 47) + Math.sin(q * 29)) / 2;
          fx.dy += amt * (Math.sin(q * 53) + Math.sin(q * 31)) / 2;
          break;
        }
        case 'rotate': fx.rot += rate * lp; break;
      }
    }
    return fx;
  }
  /** p = how "present" the clip is: 0 = fully gone, 1 = fully in place. */
  function applyMove(fx, type, p, isIn) {
    const k = 1 - easeOut(p);          // 0 at rest → 1 fully away (eases out when entering, in when leaving)
    const dir = isIn ? 1 : -1;
    switch (type) {
      case 'fade': fx.alpha *= p; break;
      case 'pop': fx.scale *= Math.max(0, 0.3 + 0.7 * easeBack(p)); fx.alpha *= Math.min(1, p * 2.5); break;
      case 'zoom-in': fx.scale *= isIn ? 1 - 0.5 * k : 1 + 0.6 * k; fx.alpha *= Math.min(1, p * 2); break;
      case 'zoom-out': fx.scale *= isIn ? 1 + 0.6 * k : 1 - 0.5 * k; fx.alpha *= Math.min(1, p * 2); break;
      case 'slide-left': fx.dx += dir * 0.6 * k; fx.alpha *= Math.min(1, p * 2); break;
      case 'slide-right': fx.dx -= dir * 0.6 * k; fx.alpha *= Math.min(1, p * 2); break;
      case 'slide-up': fx.dy += dir * 0.4 * k; fx.alpha *= Math.min(1, p * 2); break;
      case 'slide-down': fx.dy -= dir * 0.4 * k; fx.alpha *= Math.min(1, p * 2); break;
      case 'spin': fx.rot += -dir * 180 * k; fx.scale *= 1 - 0.6 * k; fx.alpha *= p; break;
      case 'typewriter': fx.chars = p; break;   // fraction of characters shown (text only)
    }
  }

  /** Preview an animation: play just this stretch of the timeline, then stop. */
  function previewRange(a, b) {
    if (state.exporting) return;
    pause();
    seek(a);
    play();
    state.stopAt = b;
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
  function clipBox(c, t = state.time) {
    const cx = valAt(c, 'x', t) * canvas.width, cy = valAt(c, 'y', t) * canvas.height;
    const scale = valAt(c, 'scale', t), rot = valAt(c, 'rotation', t);
    if (c.type === 'text') {
      const L = textLayout(c);
      return { cx, cy, rot, w: (L.w + L.pad * 2) * scale, h: (L.h + L.pad * 1.2) * scale };
    }
    const m = state.media.get(c.mediaId);
    const w = (m && m.w) || 16, h = (m && m.h) || 9;
    const s = containScale(w, h) * scale;
    return { cx, cy, rot, w: w * s, h: h * s };
  }

  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeBack = (p) => { const k = 1.70158; return 1 + (k + 1) * Math.pow(p - 1, 3) + k * Math.pow(p - 1, 2); };

  /** charsFrac: fraction of characters to show (typewriter), Infinity = all. */
  function drawText(c, charsFrac) {
    const L = textLayout(c);
    const total = L.lines.join('').length;
    const chars = charsFrac === Infinity ? Infinity : Math.floor(total * charsFrac);
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
    const fx = animFx(c, t - c.start);
    const alpha = clamp(valAt(c, 'opacity', t) * fadeFactor(c, t) * fx.alpha, 0, 1);
    const scale = valAt(c, 'scale', t) * fx.scale;
    if (alpha <= 0 || scale <= 0) return;
    ctx.save();
    ctx.translate((valAt(c, 'x', t) + fx.dx) * canvas.width, (valAt(c, 'y', t) + fx.dy) * canvas.height);
    ctx.rotate(((valAt(c, 'rotation', t) + fx.rot) * Math.PI) / 180);
    ctx.globalAlpha = alpha;
    if (c.type === 'text') {
      ctx.scale(scale, scale);
      drawText(c, fx.chars);
    } else {
      const s = sourceOf(c);
      if (s) {
        const k = containScale(s.w, s.h) * scale;
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
    const single = state.selectedIds.size === 1;
    for (const { clip: c, track } of selectedAll()) {
      if (!isVisual(c) || !isActive(c, t) || track.hidden) continue;
      const b = clipBox(c, t);
      ctx.save();
      ctx.translate(b.cx, b.cy);
      ctx.rotate((b.rot * Math.PI) / 180);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw;
      ctx.shadowColor = '#000'; ctx.shadowBlur = lw * 2;
      if (!single) ctx.setLineDash([lw * 5, lw * 3]);
      ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
      if (single && sel && c === sel.clip) {      // resize handle only when one clip is selected
        const r = handleRadius();
        ctx.setLineDash([]);
        ctx.fillStyle = '#8b5cf6';
        ctx.beginPath(); ctx.arc(b.w / 2, b.h / 2, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.stroke();
      }
      ctx.restore();
    }
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
    state.stopAt = null;
    clock = { wall: performance.now(), t: state.time };
    $('#playBtn').textContent = '❚❚';
    syncMedia(state.time, true);
    rafId = requestAnimationFrame(tick);
  }
  function pause() {
    if (!state.playing) return;
    state.playing = false;
    state.stopAt = null;
    cancelAnimationFrame(rafId);
    $('#playBtn').textContent = '▶';
    for (const e of els.values()) e.el.pause();
    syncMedia(state.time, false);
    requestRender();
    refreshInspectorValues();
  }
  const togglePlay = () => (state.playing ? pause() : play());

  function tick(now) {
    if (!state.playing) return;
    const dur = projectDuration();
    state.time = clock.t + (now - clock.wall) / 1000;
    if (state.stopAt != null && !state.exporting && state.time >= state.stopAt) {
      state.time = Math.min(state.stopAt, dur);
      pause();
      updatePlayhead();
      return;
    }
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
    if (!state.playing) refreshInspectorValues();   // animated values + ◆ states follow the playhead
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
      class: `clip type-${c.type}${state.selectedIds.has(c.id) ? ' selected' : ''}`,
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
    for (const t of keyTimes(c)) {
      if (t < -EPS || t > c.duration + EPS) continue;
      d.append(el('div', { class: 'kfm', style: `left:${t * state.pps}px`, title: `Keyframe at ${fmt(c.start + t)}` }));
    }
    const badges = [c.animIn !== 'none' ? '↘' : '', c.animLoop !== 'none' ? '↻' : '', c.animOut !== 'none' ? '↗' : ''].join('');
    if (badges) lab.prepend(el('span', { class: 'anim-badge', title: 'Has animations' }, badges));
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
  function snapPoints(exclude = new Set()) {
    const pts = [0, state.time];
    for (const c of allClips()) if (!exclude.has(c.id)) pts.push(c.start, clipEnd(c));
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
  const fitsExcept = (track, start, dur, ids) =>
    track.clips.every(x => ids.has(x.id) || x.start >= start + dur - EPS || clipEnd(x) <= start + EPS);
  const shiftKeys = (kf, delta) => {
    const out = {};
    for (const [p, keys] of Object.entries(kf || {})) out[p] = keys.map(k => ({ t: k.t - delta, v: k.v }));
    return out;
  };

  tlScroll.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || state.exporting) return;
    if (ev.target.closest('.track-head')) return;
    const clipNode = ev.target.closest('.clip');
    const additive = ev.shiftKey || ev.ctrlKey || ev.metaKey || state.multiMode;
    if (clipNode) {
      const found = findClip(clipNode.dataset.clip);
      if (!found) return;
      ev.preventDefault();
      const id = found.clip.id;
      const handle = ev.target.dataset.handle;
      let collapseTo = null;
      if (handle) select(id);                         // trimming works on one clip
      else if (additive) {
        if (state.selectedIds.has(id)) { select(id, 'toggle'); return; }
        select(id, 'add');
      } else if (!state.selectedIds.has(id)) select(id);
      else if (state.selectedIds.size > 1) collapseTo = id;   // plain click inside a group: keep it for dragging
      const group = !handle && state.selectedIds.size > 1
        ? selectedAll().map(s => ({ clip: s.clip, track: s.track, start: s.clip.start }))
        : null;
      drag = {
        mode: handle ? 'trim-' + handle : 'move',
        clip: found.clip, track: found.track, group, collapseTo,
        x0: ev.clientX, y0: ev.clientY,
        orig: { start: found.clip.start, duration: found.clip.duration, in: found.clip.in, kf: JSON.parse(JSON.stringify(found.clip.kf || {})), loopOfs: found.clip.animLoopOfs || 0 },
        pts: snapPoints(group ? new Set(group.map(g => g.clip.id)) : new Set([id])),
        moved: false,
      };
      tlScroll.setPointerCapture(ev.pointerId);
      return;
    }
    if (ev.target.closest('.ruler-row')) {
      drag = { mode: 'scrub' };
      tlScroll.setPointerCapture(ev.pointerId);
      seek(timeAtClientX(ev.clientX));
      return;
    }
    if (ev.target.closest('.lane')) {
      // click an empty spot = move the playhead (and clear the selection); drag = box-select
      drag = { mode: 'lane', x0: ev.clientX, y0: ev.clientY, additive, base: new Set(state.selectedIds), moved: false, mouse: ev.pointerType === 'mouse' };
      if (drag.mouse) tlScroll.setPointerCapture(ev.pointerId);
    }
  });

  function updateMarquee(d, ev) {
    let box = $('#marquee');
    if (!box) { box = el('div', { id: 'marquee', class: 'marquee' }); $('#tlContent').append(box); }
    const cr = $('#tlContent').getBoundingClientRect();
    const x1 = Math.min(d.x0, ev.clientX), x2 = Math.max(d.x0, ev.clientX);
    const y1 = Math.min(d.y0, ev.clientY), y2 = Math.max(d.y0, ev.clientY);
    box.style.cssText = `left:${x1 - cr.left}px;top:${y1 - cr.top}px;width:${x2 - x1}px;height:${y2 - y1}px`;
    const hit = new Set(d.additive ? d.base : []);
    for (const n of $$('.clip')) {
      const r = n.getBoundingClientRect();
      if (r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2) hit.add(n.dataset.clip);
    }
    setSelection([...hit]);
  }
  const removeMarquee = () => { const m = $('#marquee'); if (m) m.remove(); };

  tlScroll.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    if (drag.mode === 'scrub') { seek(timeAtClientX(ev.clientX)); return; }
    if (drag.mode === 'lane') {
      if (!drag.mouse) return;                        // on touch, dragging scrolls the timeline instead
      if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 4) return;
      drag.moved = true;
      updateMarquee(drag, ev);
      return;
    }
    if (!drag.moved && Math.abs(ev.clientX - drag.x0) < 3 && Math.abs(ev.clientY - drag.y0) < 3) return;   // ignore jitter
    drag.moved = true;
    const dx = (ev.clientX - drag.x0) / state.pps;
    const c = drag.clip, o = drag.orig;
    if (drag.mode === 'move' && drag.group) {
      // move the whole selection together, sideways only; snap on the grabbed clip's edges
      const ids = new Set(drag.group.map(g => g.clip.id));
      const s0 = o.start + dx;
      const sStart = snapTime(s0, drag.pts), sEnd = snapTime(s0 + c.duration, drag.pts) - c.duration;
      let d = (Math.abs(sStart - s0) <= Math.abs(sEnd - s0) ? sStart : sEnd) - o.start;
      d = Math.max(d, -Math.min(...drag.group.map(g => g.start)));
      if (drag.group.every(g => fitsExcept(g.track, g.start + d, g.clip.duration, ids))) {
        for (const g of drag.group) g.clip.start = g.start + d;
      }
    } else if (drag.mode === 'move') {
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
      c.kf = shiftKeys(o.kf, s - o.start);           // keyframes stay put on the timeline
      c.animLoopOfs = (o.loopOfs || 0) + (s - o.start);  // and so does the loop's beat
    } else if (drag.mode === 'trim-r') {
      const nexts = drag.track.clips.filter(x => x !== c && x.start >= o.start + o.duration - EPS);
      const nextStart = nexts.reduce((m, x) => Math.min(m, x.start), Infinity);
      let e = snapTime(o.start + o.duration + dx, drag.pts);
      e = clamp(e, o.start + MIN_DUR, Math.min(nextStart, o.start + srcLimit({ ...c, in: o.in })));
      c.duration = e - o.start;
    }
    const moved = drag.group ? drag.group.map(g => g.clip) : [c];
    for (const x of moved) {
      x.fadeIn = Math.min(x.fadeIn, x.duration / 2);
      x.fadeOut = Math.min(x.fadeOut, x.duration / 2);
    }
    renderTimeline();
    for (const x of moved) {
      const node = $(`.clip[data-clip="${x.id}"]`);
      if (node) node.classList.add('dragging');
    }
    if (!state.playing) { syncMedia(state.time, false); requestRender(); }
  });

  const endDrag = (ev) => {
    if (!drag) return;
    const was = drag;
    drag = null;
    removeMarquee();
    const cancelled = ev.type === 'pointercancel';
    if (was.mode === 'scrub') return;
    if (was.mode === 'lane') {
      if (!was.moved && !cancelled) {
        if (!was.additive) select(null);
        seek(timeAtClientX(ev.clientX));
      }
      return;
    }
    if (was.moved) { commit(); renderInspector(); return; }
    if (was.collapseTo && !cancelled) select(was.collapseTo);   // plain click on a grouped clip: select just it
    renderTimeline();
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
    const a = (-b.rot * Math.PI) / 180;
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
  const onScaleHandle = (c, p) => {
    const b = clipBox(c), l = toLocal(c, b, p);
    return Math.hypot(l.x - b.w / 2, l.y - b.h / 2) <= handleRadius() * 1.8 ? b : null;
  };
  canvas.addEventListener('pointerdown', (ev) => {
    if (state.exporting) return;
    if (state.playing) pause();
    const p = toCanvas(ev);
    const sel = selected();
    const additive = ev.shiftKey || ev.ctrlKey || ev.metaKey || state.multiMode;
    if (!additive && state.selectedIds.size === 1 && sel && isVisual(sel.clip) && isActive(sel.clip, state.time)) {
      const b = onScaleHandle(sel.clip, p);
      if (b) {
        cdrag = { mode: 'scale', clip: sel.clip, p0: p, s0: valAt(sel.clip, 'scale'), d0: Math.hypot(p.x - b.cx, p.y - b.cy) || 1, b };
        canvas.setPointerCapture(ev.pointerId);
        return;
      }
    }
    const hit = hitTest(p);
    if (!hit) { if (!additive) select(null); return; }
    if (additive) {
      if (state.selectedIds.has(hit.id)) { select(hit.id, 'toggle'); return; }
      select(hit.id, 'add');
    } else if (!state.selectedIds.has(hit.id)) select(hit.id);
    // drag every selected clip that's on screen right now, together
    const movers = selectedAll().map(s => s.clip).filter(c => isVisual(c) && isActive(c, state.time));
    cdrag = {
      mode: 'move', clip: hit, p0: p, moved: false,
      starts: movers.map(c => ({ c, x: valAt(c, 'x'), y: valAt(c, 'y') })),
      collapseTo: !additive && state.selectedIds.size > 1 ? hit.id : null,
    };
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!cdrag) {
      const sel = selected();
      let cur = 'default';
      if (sel && isVisual(sel.clip) && isActive(sel.clip, state.time)) {
        const p = toCanvas(ev), b = clipBox(sel.clip), l = toLocal(sel.clip, b, p);
        if (state.selectedIds.size === 1 && Math.hypot(l.x - b.w / 2, l.y - b.h / 2) <= handleRadius() * 1.8) cur = 'nwse-resize';
        else if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2) cur = 'move';
      }
      canvas.style.cursor = cur;
      return;
    }
    const p = toCanvas(ev), c = cdrag.clip;
    if (!cdrag.moved && Math.hypot(p.x - cdrag.p0.x, p.y - cdrag.p0.y) < 2) return;   // ignore jitter
    cdrag.moved = true;
    if (cdrag.mode === 'move') {
      const ddx = (p.x - cdrag.p0.x) / canvas.width, ddy = (p.y - cdrag.p0.y) / canvas.height;
      // centre-snap on the grabbed clip; the rest of the group follows by the same amount
      const grabbed = cdrag.starts.find(s => s.c === c) || cdrag.starts[0];
      let sx = 0, sy = 0;
      guides = { v: false, h: false };
      if (grabbed) {
        const x = grabbed.x + ddx, y = grabbed.y + ddy;
        if (Math.abs(x - 0.5) < 0.015) { sx = 0.5 - x; guides.v = true; }
        if (Math.abs(y - 0.5) < 0.015) { sy = 0.5 - y; guides.h = true; }
      }
      for (const s of cdrag.starts) { setProp(s.c, 'x', s.x + ddx + sx); setProp(s.c, 'y', s.y + ddy + sy); }
    } else {
      const d = Math.hypot(p.x - cdrag.b.cx, p.y - cdrag.b.cy);
      setProp(c, 'scale', clamp(cdrag.s0 * (d / cdrag.d0), 0.05, 10));
    }
    requestRender();
    refreshInspectorValues();
  });
  const endCanvasDrag = (ev) => {
    if (!cdrag) return;
    const was = cdrag;
    cdrag = null; guides = null;
    if (was.moved) { commit(); renderTimeline(); }
    else if (was.collapseTo && ev.type !== 'pointercancel') select(was.collapseTo);
    requestRender();
  };
  canvas.addEventListener('pointerup', endCanvasDrag);
  canvas.addEventListener('pointercancel', endCanvasDrag);

  // ------------------------------------------------------------------
  // selection + inspector
  // ------------------------------------------------------------------
  /** mode: 'replace' (default), 'add' or 'toggle'. select(null) clears the selection. */
  function select(id, mode = 'replace') {
    if (mode === 'toggle') {
      const ids = new Set(state.selectedIds);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      setSelection([...ids], ids.has(id) ? id : null);
    } else if (mode === 'add') {
      setSelection([...state.selectedIds, id], id);
    } else {
      setSelection(id ? [id] : [], id);
    }
  }
  function setSelection(ids, primary = null) {
    const next = new Set(ids.filter(id => findClip(id)));
    const prim = primary != null && next.has(primary) ? primary
      : next.has(state.selectedId) ? state.selectedId : ([...next].pop() || null);
    const same = next.size === state.selectedIds.size && [...next].every(i => state.selectedIds.has(i)) && prim === state.selectedId;
    state.selectedIds = next;
    state.selectedId = prim;
    for (const n of $$('.clip')) n.classList.toggle('selected', next.has(n.dataset.clip));
    if (!same) renderInspector();
    requestRender();
  }
  function selectAll() {
    setSelection(allClips().map(c => c.id), state.selectedId);
  }

  const insp = $('#inspector');
  let liveBindings = [];   // things to refresh when the playhead moves (sliders, ◆ buttons)
  let lastKfHint = 0;
  const kfHint = () => {
    if (Date.now() - lastKfHint < 3000) return;
    lastKfHint = Date.now();
    toast('This is animated with keyframes. Move the playhead over the clip to change it.');
  };

  function section(title, ...kids) { return el('div', { class: 'insp-section' }, el('h3', {}, title), ...kids); }

  /** opts.kf = {clip, prop} adds a ◆ keyframe button for that property. */
  function slider(label, get, set, min, max, step, show = (v) => v, opts = {}) {
    const input = el('input', { type: 'range', min, max, step, value: get(), 'aria-label': label });
    // opts.number: a typeable box instead of the value label, for exact values like a song's BPM
    const val = opts.number
      ? el('input', { type: 'number', class: 'val-num', min, max, step, value: get(), 'aria-label': `${label} value`, inputmode: 'decimal' })
      : el('span', { class: 'val' }, show(get()));
    const showVal = () => { if (opts.number) { if (document.activeElement !== val) val.value = get(); } else val.textContent = show(get()); };
    let dia = null;
    const updDia = () => {
      if (!dia) return;
      const { clip, prop } = opts.kf;
      const here = playheadIn(clip) && keyIndexAt(clip, prop, localNow(clip)) >= 0;
      dia.classList.toggle('on', here);
      dia.classList.toggle('anim', hasKf(clip, prop));
      dia.title = here ? `Remove the ${label} keyframe here` : `Add a ${label} keyframe here`;
    };
    if (opts.kf) {
      dia = el('button', { class: 'kf-dia', type: 'button', 'aria-label': `${label} keyframe` }, '◆');
      dia.addEventListener('click', () => toggleKey(opts.kf.clip, opts.kf.prop));
      updDia();
    }
    input.addEventListener('input', () => {
      set(parseFloat(input.value));
      showVal();
      updDia();
      if (opts.timeline) renderTimeline();
      if (!state.playing) syncMedia(state.time, false);
      requestRender();
    });
    input.addEventListener('change', () => commit());
    input.addEventListener('dblclick', () => { if (opts.reset != null) { set(opts.reset); input.value = get(); showVal(); updDia(); requestRender(); commit(); } });
    if (opts.number) {
      const fromBox = () => {
        const n = parseFloat(val.value);
        if (!Number.isFinite(n)) return false;
        set(clamp(n, +min, +max));
        input.value = get();
        updDia();
        if (!state.playing) syncMedia(state.time, false);
        requestRender();
        return true;
      };
      val.addEventListener('input', fromBox);
      val.addEventListener('change', () => { fromBox(); val.value = get(); commit(); });
      val.addEventListener('keydown', (e) => { if (e.key === 'Enter') val.blur(); });
    }
    liveBindings.push({ input, get, showVal, updDia });
    const tip = [opts.title, opts.reset != null ? 'Double-click the slider to reset' : ''].filter(Boolean).join('. ');
    return el('div', { class: 'ctl' + (dia ? ' has-kf' : '') + (opts.number ? ' num' : ''), title: opts.title || '' },
      el('label', { title: tip }, label), input, val, dia);
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
    for (const b of liveBindings) {
      if (b.custom) { b.custom(); continue; }
      b.input.value = b.get();
      b.showVal();
      if (b.updDia) b.updDia();
    }
  }

  /** Animation presets for one or more visual clips. */
  function animSection(list) {
    const c0 = list[0];
    const single = list.length === 1;
    const moves = list.every(c => c.type === 'text') ? ANIM_MOVES.concat(ANIM_TEXT_ONLY) : ANIM_MOVES;
    const outMoves = ANIM_MOVES;
    const previewIn = () => { if (single && c0.animIn !== 'none') previewRange(c0.start, Math.min(clipEnd(c0) - 0.02, c0.start + Math.min(c0.animInDur, c0.duration / 2) + 0.4)); };
    const previewOut = () => { if (single && c0.animOut !== 'none') previewRange(Math.max(c0.start, clipEnd(c0) - Math.min(c0.animOutDur, c0.duration / 2) - 0.4), clipEnd(c0) - 0.02); };
    const previewLoop = () => { if (single && c0.animLoop !== 'none') previewRange(c0.start, Math.min(clipEnd(c0) - 0.02, c0.start + 2.5)); };
    const pick = (label, options, key, after) => {
      const s = el('select', { 'aria-label': label }, options.map(([v, l]) => el('option', { value: v, selected: c0[key] === v }, l)));
      s.addEventListener('change', () => {
        for (const c of list) {
          if (s.value === 'typewriter' && c.type !== 'text') continue;
          c[key] = s.value;
          if (key === 'animLoop') { c.animLoopRate = null; c.animLoopAmt = null; }   // units differ per loop type
          if (s.value === 'typewriter') c.animInDur = clamp(+(String(c.text || '').length * 0.06).toFixed(1), 0.5, 2);
        }
        commit();
        renderInspector();
        after();
      });
      return el('div', { class: 'ctl wide' }, el('label', {}, label), s);
    };
    const dur = (label, key, after) => slider(label, () => c0[key], v => { for (const c of list) c[key] = v; }, 0.1, 3, 0.1, v => v.toFixed(1) + 's');
    const parts = [
      pick('In', moves, 'animIn', previewIn),
      c0.animIn !== 'none' ? dur('In length', 'animInDur') : null,
      pick('Out', outMoves, 'animOut', previewOut),
      c0.animOut !== 'none' ? dur('Out length', 'animOutDur') : null,
      pick('Loop', ANIM_LOOPS, 'animLoop', previewLoop),
    ];
    // tempo / strength for the loop (only when every selected clip uses the same loop)
    const lp = LOOP_PARAMS[c0.animLoop];
    if (lp && list.every(c => c.animLoop === c0.animLoop)) {
      for (const key of ['rate', 'amt']) {
        const P = lp[key];
        if (!P) continue;
        const toUI = P.toUI || ((v) => v), fromUI = P.fromUI || ((v) => v);
        parts.push(slider(P.label, () => toUI(loopVal(c0, key)), (v) => { for (const c of list) c[LOOP_FIELD[key]] = fromUI(v); },
          P.min, P.max, P.step, P.show || ((v) => v), { number: P.number, title: P.title, reset: toUI(P.def) }));
      }
    }
    if (single && (c0.animIn !== 'none' || c0.animOut !== 'none' || c0.animLoop !== 'none')) {
      parts.push(el('div', { class: 'row', style: 'margin-top:8px' },
        c0.animIn !== 'none' ? el('button', { type: 'button', onclick: previewIn }, '▶ Preview in') : null,
        c0.animOut !== 'none' ? el('button', { type: 'button', onclick: previewOut }, '▶ Preview out') : null,
        c0.animLoop !== 'none' ? el('button', { type: 'button', onclick: previewLoop }, '▶ Preview loop') : null,
      ));
    }
    return section('Animation', ...parts);
  }

  function keyframeSection(c) {
    const count = keyTimes(c).length;
    const main = el('button', { type: 'button', class: 'kf-main', onclick: () => toggleAllKeys(c) });
    const upd = () => {
      const here = anyKeyHere(c);
      main.classList.toggle('on', here);
      main.textContent = here ? '◆ Remove keyframe here' : '◇ Add keyframe here';
    };
    upd();
    liveBindings.push({ custom: upd });
    return section('Keyframes',
      el('p', { class: 'muted small', style: 'margin:0 0 8px' }, count
        ? `${count} keyframe${count > 1 ? 's' : ''}. Move the playhead and change position, scale, rotation or opacity to animate between them.`
        : 'Add a keyframe, move the playhead, then change position, scale, rotation or opacity. GhostCut animates in between.'),
      el('div', { class: 'row' }, main),
      count ? el('div', { class: 'row', style: 'margin-top:6px' },
        el('button', { type: 'button', title: 'Previous keyframe', onclick: () => jumpKey(c, -1) }, '◀ Prev'),
        el('button', { type: 'button', title: 'Next keyframe', onclick: () => jumpKey(c, 1) }, 'Next ▶'),
        el('button', { type: 'button', onclick: () => clearKeys(c) }, 'Clear all'),
      ) : null,
      count > 1 ? selectCtl('Motion', KF_EASES, () => c.kfEase, v => { c.kfEase = v; }) : null,
    );
  }

  function renderMultiInspector(list) {
    const clips = list.map(s => s.clip);
    const vis = clips.filter(isVisual);
    const looks = clips.filter(c => c.type === 'video' || c.type === 'image');
    const audible = list.filter(s => s.clip.type === 'video' || s.clip.type === 'audio');
    insp.append(section(`☑ ${clips.length} clips selected`,
      el('p', { class: 'muted small', style: 'margin:0 0 8px' }, 'Changes here apply to all of them. Drag any of them to move the group.'),
      el('div', { class: 'row' },
        el('button', { type: 'button', onclick: () => splitAt(state.time) }, '✂ Split'),
        el('button', { type: 'button', onclick: duplicateSelected }, '⧉ Copy'),
        el('button', { type: 'button', onclick: deleteSelected }, '🗑 Delete'),
      ),
      el('div', { class: 'row', style: 'margin-top:6px' },
        el('button', { type: 'button', onclick: () => select(null) }, 'Clear selection'))));
    if (vis.length) {
      insp.append(animSection(vis));
      const v0 = vis[0];
      insp.append(section('Look',
        slider('Opacity', () => Math.round(valAt(v0, 'opacity') * 100), v => { for (const c of vis) if (!setProp(c, 'opacity', v / 100)) kfHint(); }, 0, 100, 1, v => v + '%', { reset: 100 })));
    }
    if (looks.length) {
      insp.append(section('Filters', el('div', { class: 'chips' }, Object.entries(FILTER_PRESETS).map(([k, p]) => {
        const b = el('button', { type: 'button', class: 'chip' + (looks.every(c => c.preset === k) ? ' on' : '') },
          el('div', { class: 'sw', style: `filter:${PRESET_CSS(k)}` }), el('span', {}, p.label));
        b.addEventListener('click', () => { for (const c of looks) { c.preset = k; c.filters = { ...NO_FILTER, ...p.f }; } commit(); renderInspector(); });
        return b;
      }))));
    }
    if (audible.length) {
      const a0 = audible[0].clip;
      const speeds = [0.5, 1, 1.5, 2];
      insp.append(section('Speed & Audio',
        el('div', { class: 'row' }, speeds.map(s => {
          const b = el('button', { type: 'button', class: audible.every(x => x.clip.speed === s) ? 'on' : '' }, s + '×');
          b.addEventListener('click', () => { for (const x of audible) setSpeed(x.clip, x.track, s); commit(); renderInspector(); });
          return b;
        })),
        slider('Volume', () => Math.round(a0.volume * 100), v => { for (const x of audible) x.clip.volume = v / 100; }, 0, 200, 1, v => v + '%', { reset: 100 })));
    }
    const c0 = clips[0];
    insp.append(section('Fade',
      slider('Fade in', () => c0.fadeIn, v => { for (const c of clips) c.fadeIn = Math.min(v, c.duration / 2); }, 0, 3, 0.05, v => v.toFixed(2) + 's', { reset: 0, timeline: true }),
      slider('Fade out', () => c0.fadeOut, v => { for (const c of clips) c.fadeOut = Math.min(v, c.duration / 2); }, 0, 3, 0.05, v => v.toFixed(2) + 's', { reset: 0, timeline: true }),
    ));
  }

  function renderInspector() {
    liveBindings = [];
    insp.innerHTML = '';
    if (state.selectedIds.size > 1) { renderMultiInspector(selectedAll()); return; }
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
      ));
    }

    if (isVisual(c)) {
      const put = (p, v) => { if (!setProp(c, p, v)) kfHint(); };
      const afterBtn = () => { commit(); refreshInspectorValues(); };
      const fitBtns = el('div', { class: 'row', style: 'margin-top:8px' },
        c.type === 'text' ? null : el('button', { type: 'button', onclick: () => { put('scale', 1); put('x', 0.5); put('y', 0.5); afterBtn(); } }, 'Fit'),
        c.type === 'text' ? null : el('button', { type: 'button', onclick: () => {
          const mm = m || { w: 16, h: 9 };
          put('scale', Math.max(canvas.width / mm.w, canvas.height / mm.h) / containScale(mm.w, mm.h)); put('x', 0.5); put('y', 0.5); afterBtn();
        } }, 'Fill'),
        el('button', { type: 'button', title: 'Reset position, size, rotation and opacity, and remove keyframes', onclick: () => {
          Object.assign(c, { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, kf: {} }); commit(); renderInspector();
        } }, 'Reset'),
      );
      insp.append(section('Transform',
        slider('X', () => +(valAt(c, 'x') * 100).toFixed(1), v => put('x', v / 100), -50, 150, 0.5, v => v + '%', { reset: 50, kf: { clip: c, prop: 'x' } }),
        slider('Y', () => +(valAt(c, 'y') * 100).toFixed(1), v => put('y', v / 100), -50, 150, 0.5, v => v + '%', { reset: 50, kf: { clip: c, prop: 'y' } }),
        slider('Scale', () => Math.round(valAt(c, 'scale') * 100), v => put('scale', v / 100), 5, 500, 1, v => v + '%', { reset: 100, kf: { clip: c, prop: 'scale' } }),
        slider('Rotate', () => Math.round(valAt(c, 'rotation')), v => put('rotation', v), -180, 180, 1, v => v + '°', { reset: 0, kf: { clip: c, prop: 'rotation' } }),
        slider('Opacity', () => Math.round(valAt(c, 'opacity') * 100), v => put('opacity', v / 100), 0, 100, 1, v => v + '%', { reset: 100, kf: { clip: c, prop: 'opacity' } }),
        fitBtns,
      ));
      insp.append(keyframeSection(c));
      insp.append(animSection([c]));
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
      ['Space', 'Play / pause'], ['S', 'Split at playhead'], ['D', 'Duplicate'], ['Del', 'Delete selected'],
      ['Shift+click', 'Select more clips'], ['Drag', 'Box-select on the timeline'], ['Ctrl A', 'Select everything'],
      ['K', 'Add / remove keyframe'],
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
    classic: { label: 'Classic', t: { color: '#ffffff', stroke: '#000000', strokeW: 12, bg: '', bold: true, shadow: false, glow: false, font: FONTS[0][0], animIn: 'none' } },
    pop:     { label: 'Pop',     t: { color: '#ffd43b', stroke: '#000000', strokeW: 14, bg: '', bold: true, shadow: false, glow: false, font: FONTS[1][0], animIn: 'pop', animInDur: 0.2 } },
    boxed:   { label: 'Boxed',   t: { color: '#ffffff', stroke: '#000000', strokeW: 0, bg: '#000000b3', bold: true, shadow: false, glow: false, font: FONTS[0][0], animIn: 'none' } },
    clean:   { label: 'Clean',   t: { color: '#ffffff', stroke: '#000000', strokeW: 0, bg: '', bold: true, shadow: true, glow: false, font: FONTS[0][0], animIn: 'fade', animInDur: 0.15 } },
  };
  // copied by "Apply style to all" (keyframes aren't: each caption has its own timing)
  const CAPTION_STYLE_KEYS = ['font', 'size', 'color', 'stroke', 'strokeW', 'bg', 'bold', 'italic', 'align', 'shadow', 'glow',
    'animIn', 'animInDur', 'animOut', 'animOutDur', 'animLoop', 'animLoopRate', 'animLoopAmt', 'x', 'y', 'scale', 'rotation', 'opacity'];

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
      b.addEventListener('click', () => addText({ text: s, size: 220, bold: false, animIn: 'pop' }));
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
    $('#multiBtn').addEventListener('click', (e) => {
      state.multiMode = !state.multiMode;
      e.currentTarget.classList.toggle('on', state.multiMode);
      e.currentTarget.setAttribute('aria-pressed', String(state.multiMode));
      toast(state.multiMode ? 'Multi-select on: tap clips to add or remove them' : 'Multi-select off');
    });
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
      else if (mod && k.toLowerCase() === 'a') { e.preventDefault(); selectAll(); }
      else if (mod) return;
      else if (k === 's' || k === 'S') splitAt(state.time);
      else if (k === 'd' || k === 'D') duplicateSelected();
      else if (k === 'k' || k === 'K') {
        const sel = selected();
        if (state.selectedIds.size === 1 && sel && isVisual(sel.clip)) toggleAllKeys(sel.clip);
        else toast('Select one video, photo or text clip to keyframe it');
      }
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
  window.GhostCut = {
    state, importFiles, addMediaToTimeline, addText, splitAt, seek, play, pause, startExport, undo, redo, projectDuration,
    select, setSelection, selectAll, valAt, animFx, commit,
  };
})();
