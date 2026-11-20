# 👻 GhostCut

A free, private video editor that runs entirely in your browser.
There's no install, no account, no watermark and no subscription, and your files never leave your device.

## ▶ Use it now

**https://lghost067.github.io/ghosts/**

It works on desktop and phone. Chrome or Edge give the best results, including MP4 export.

## Run it yourself

Option A: open `index.html` in Chrome, Edge or Firefox.

Option B: serve the folder, which is the most reliable way:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

### Hosting on GitHub Pages

The live link above comes from GitHub Pages. To set it up on your own copy:

1. The repo must be **public**, because free GitHub accounts can't use Pages on private repos. Use Settings → General → Change visibility.
2. Go to Settings → Pages → **Deploy from a branch**, pick the branch, choose `/ (root)`, then Save.
3. Wait about a minute. Every push redeploys automatically, and you can watch progress in the **Actions** tab.

If you still get a 404 right after a deploy, your browser is showing an old copy. Hard refresh with Ctrl+Shift+R, or open the link in a private window.

## What it does

- **Import** videos, photos and music (click, or drag files anywhere)
- **Multi-track timeline**: a main track, overlay tracks (picture-in-picture, stickers, text) and audio tracks
- **Edit**: drag to move, drag the edges to trim, split ✂, duplicate, delete, with snapping
- **Text**: 8 presets (caption, title, boxed, neon, subtitle, typewriter, meme…), fonts, outline, box, shadow and glow
- **Auto captions** ✨: an AI (Whisper) listens to your clips and writes timed captions, entirely on your device
  - English, auto-detect or 20 other languages; Fast (41 MB) or Accurate (77 MB) model, downloaded once then cached
  - 1–6 words per caption, 4 styles, text case, and one click to restyle or delete them all
  - Handles trimmed and sped-up clips; captions are normal text clips you can edit
- **Keyframes** ◆: animate position, scale, rotation and opacity over time
  - ◆ buttons per property plus "Add keyframe here", with prev/next jumping and markers on the timeline
  - Changing an animated value adds a keyframe automatically, including when you drag on the preview
  - Motion curves: smooth, linear, ease in/out, hold
  - Keyframes survive split, trim and speed changes
- **Animations**: In / Out / Loop presets on any clip (video, photo, text, stickers)
  - fade, pop, zoom, slide, spin, typewriter, Ken Burns, pulse, float, sway, shake, rotate
  - Adjustable length, with an instant preview when you pick one
  - Tune every loop: tempo in **BPM** (type your song's BPM to move on the beat), plus strength, angle, distance or zoom
  - Rotate can spin either way, and Ken Burns can zoom in or out
  - Loops stay on the beat when you split or trim a clip
- **Transitions** ⧓: 34 of them, from the **⧓ Transitions** tab or the ＋ on any cut between two touching clips
  - The tab adds to the selected cut, else the selected clip's cut, else the cut nearest the playhead, and can close gaps for you
  - Basics: fade, dip to black/white, flash, blur
  - Motion: push, slide and whip pan (with motion blur) in 4 directions
  - Camera: zoom in/out (zoom blur), spin, flip, shake
  - Shapes: wipes in 4 directions, circle open/close, clock wipe, blinds, doors
  - FX: glitch (RGB split), pixelate, film burn
  - Live animated previews of your own clips, adjustable length, 🎲 random, and apply to every cut at once
  - Video keeps playing through the transition on both sides, and transitions export like everything else
- **Multi-select**: Shift/Ctrl+click, box-select on the timeline, Ctrl+A, or the ☑ Multi-select button on phones
  - Move, split, duplicate, delete, animate, filter, speed, volume and fade a whole group at once
- **Voiceover** 🎙: record straight from your mic while the timeline plays
  - Mic picker and level meter to check it works, then a 3-2-1 countdown
  - The take lands on an audio track exactly where you started, so it lines up with the picture
  - Option to hear the video while you talk (use headphones), and voiceovers are ticked by default in Auto captions
- **Stickers**: a pile of emoji 💀🔥✨
- **Filters**: Vivid, B&W, Vintage, Warm, Cool, Drama, Dreamy, plus manual brightness, contrast, saturation, hue, sepia and blur
- **Transform**: drag and scale right on the preview (with centre snapping), plus rotation, opacity and fit/fill
- **Speed**: 0.25× to 4×
- **Volume**: up to 200%, plus fade in/out on audio and video
- **Track controls**: mute and hide per track
- **Aspect ratios**: 9:16, 16:9, 1:1, 4:5, 3:4 · 720p / 1080p · custom background colour
- **Undo / redo** everything
- **Autosave** 💾: your project and its files are saved on your device as you edit
  - Close the tab, lose battery or reboot: reopen GhostCut and everything comes back, playhead and all
  - "✓ Saved" in the top bar shows it's stored
- **Projects** 📁: keep as many projects as you like, each with its own clips, files, settings and undo
  - Create, open, rename, duplicate and delete from the 📁 button in the top bar (it shows the open project's name)
  - Cards show a thumbnail, length, clip count and when you last edited
  - The site reopens the project you were last working on; files shared by duplicates are stored once
- **Project files** 📦: move a project between devices (phone ↔ laptop, Android ↔ iPhone, Windows ↔ Mac)
  - 📤 on a project card saves it as one `.ghostcut` file with every clip, effect and media file inside
  - Download it, or Share it (AirDrop, Drive, WhatsApp…) on phones that support sharing files
  - On the other device: 📁 Projects → 📥 Open file (or just drag it in). It opens as a new project and never overwrites one
- **Export to MP4** (H.264, in Chrome/Edge) or WebM, with audio mixed in

## Shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause (stops a voiceover take while recording) |
| S or Ctrl+B | Split at playhead |
| D | Duplicate |
| Delete | Delete selected (or the selected transition) |
| Shift/Ctrl+click | Add a clip to the selection |
| Ctrl+A | Select everything |
| K | Add / remove a keyframe |
| ← / → | Step a frame (Shift: 1 second) |
| Home / End | Jump to start / end |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| + / − or Ctrl+scroll | Zoom timeline |

## Good to know

- Export records in **real time**, so a 30 s video takes about 30 s. Keep the tab visible while it renders.
- Filters need a browser with canvas filter support (Chrome, Edge, Firefox).
- Projects are saved in this browser on this device. To move one to another device, save it as a project file (📤). It doesn't sync between your phone and laptop, and clearing the browser's site data deletes it. Export anything you can't lose.
- Autosave keeps a copy of your imported files, so long videos use storage space on your device. If you run out, the top bar says "⚠ Not saved".
- Moving projects between devices: a video the other device can't play (for example an iPhone HEVC `.mov` on some Windows or Android browsers) opens as missing, and GhostCut names the file. Re-import an MP4 (H.264) copy there. Text fonts are your device's own, so Impact or Comic Sans can look a bit different on another device.
- Voiceover needs microphone permission. If you blocked it, allow the mic for the site from the 🔒 next to the address.
- Auto captions need internet the first time, to download the AI library and model. After that your browser caches them.
- `dist/ghostcut.html` is an older single-file snapshot made for claude.ai hosting. It has no auto captions, keyframes, animations or multi-select, so use the GitHub Pages version.

Built with plain HTML, CSS and JavaScript: canvas for compositing, Web Audio for mixing, and MediaRecorder for export. There are zero dependencies.
