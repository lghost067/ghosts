# 👻 GhostCut

A free, private video editor that runs entirely in your browser.
There's no install, no account, no watermark and no subscription, and your files never leave your device.

## Run it

Option A: open `index.html` in Chrome, Edge or Firefox.

Option B: serve the folder, which is the most reliable way:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Want a public link? Turn on **GitHub Pages** for this repo (Settings → Pages → deploy from branch, root folder). It's just three static files.

## What it does

- **Import** videos, photos and music (click, or drag files anywhere)
- **Multi-track timeline**: a main track, overlay tracks (picture-in-picture, stickers, text) and audio tracks
- **Edit**: drag to move, drag the edges to trim, split ✂, duplicate, delete, with snapping
- **Text**: 8 presets (caption, title, boxed, neon, subtitle, typewriter, meme…), fonts, outline, box, shadow and glow
- **Text animations**: fade, pop, slide up, typewriter
- **Auto captions** ✨: an AI (Whisper) listens to your clips and writes timed captions, entirely on your device
  - English, auto-detect or 20 other languages; Fast (41 MB) or Accurate (77 MB) model, downloaded once then cached
  - 1–6 words per caption, 4 styles, text case, and one click to restyle or delete them all
  - Handles trimmed and sped-up clips; captions are normal text clips you can edit
- **Stickers**: a pile of emoji 💀🔥✨
- **Filters**: Vivid, B&W, Vintage, Warm, Cool, Drama, Dreamy, plus manual brightness, contrast, saturation, hue, sepia and blur
- **Transform**: drag and scale right on the preview (with centre snapping), plus rotation, opacity and fit/fill
- **Speed**: 0.25× to 4×
- **Volume**: up to 200%, plus fade in/out on audio and video
- **Track controls**: mute and hide per track
- **Aspect ratios**: 9:16, 16:9, 1:1, 4:5, 3:4 · 720p / 1080p · custom background colour
- **Undo / redo** everything
- **Export to MP4** (H.264, in Chrome/Edge) or WebM, with audio mixed in

## Shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause |
| S or Ctrl+B | Split at playhead |
| D | Duplicate |
| Delete | Delete clip |
| ← / → | Step a frame (Shift: 1 second) |
| Home / End | Jump to start / end |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| + / − or Ctrl+scroll | Zoom timeline |

## Good to know

- Export records in **real time**, so a 30 s video takes about 30 s. Keep the tab visible while it renders.
- Filters need a browser with canvas filter support (Chrome, Edge, Firefox).
- Projects aren't saved when you close the tab, so export before you leave.
- Auto captions need internet the first time, to download the AI library and model. After that your browser caches them.
- Auto captions don't work in the claude.ai-hosted copy (`dist/ghostcut.html`), because that sandbox blocks the model download. Use the GitHub Pages version.

Built with plain HTML, CSS and JavaScript: canvas for compositing, Web Audio for mixing, and MediaRecorder for export. There are zero dependencies.
