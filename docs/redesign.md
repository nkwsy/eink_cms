# Redesign plan

Agreed on 2026-11-16. Five phases, each on its own branch with a pull request.

## How the signs work

- Almost all signs are 28" E Ink monochrome panels, 3840×1080, mounted
  horizontally or vertically.
- A sign updates only when someone powers it on. The piink script on the unit
  then fetches `/<slug>/current.bmp` once, with a 12-second timeout. There is no
  timer, polling or change detection, and nothing changes on the device.
- Typical flow: someone finishes editing, then walks out and powers the sign on
  a few minutes later. So the final image must exist the moment a screen is
  promoted, and the slug must hand it over instantly.
- The panel rejects 1-bit BMPs; it takes a 24-bit BMP at the exact panel size.
  Whether it shows real greys is unknown until the calibration screen has been
  looked at on a panel.

## Design language

Black background, white type, an offset grid of panels separated by lines of a
consistent weight. The editor should make that easy without forcing it.

## Phase 1 — crisp output and reliable pulls (this branch)

- Calibration screen: grey patches, dot patterns, line weights, text at several
  weights, picture treatments. Shown on one panel to decide whether greys are
  usable and which text weight reads best.
- Crisp renderer: text, lines, shapes and QR codes are pure black or white.
  Pictures are converted per block (sharp cut-off, dot pattern, or dither).
- Promote stores the finished image; the slug serves the stored copy.
- The device page shows "Ready to pull" and when the sign last pulled.
- Screens that were live before this change keep the old renderer until they
  are promoted.
- New QR codes default to bars, a 4-module quiet zone and error level M.
- One `dv_signage.xml` per screen model, replaceable as a file.

## Phase 2 — versions and undo

Autosaving draft, undo/redo, "save version" checkpoints, numbered versions on
promote, revert to any of the last 50. A version freezes layout, cards, media
and plugin settings; plugin data stays live. Copy a screen to another device or
start a draft from any version. Optional "promote at" time. Existing live
layouts become version 1.

## Phase 3 — editor

Canvas shows the true panel output with zoom. Click-to-edit text, multi-select,
alignment guides, layers panel, resize from every edge, copy/paste, nudging.
Rotation in 90° steps only. Grid by splitting panels and dragging dividers, with
free blocks still allowed. Screen style: background, one divider weight, four
text styles. Cards with named slots filled through a form; a placed card can be
detached. Guardrails warn (text too small, lines too thin, grey text, QR too
small) but never block.

## Phase 4 — media and templates

One media library on Vercel Blob, picked from inside the editor; originals kept;
crop and dither are settings. Upload guidance. Starter screens: the horizontal
and vertical 28" boards plus calibration. Cards: Welcome/map, Feature, Event
row, Activity, Park Rules, Get Involved, Share Ideas, Water Quality.

## Phase 5 — events and plugins

Event import from the Squarespace feed (`urbanrivers.org/events?format=json`),
per card or "fill all from upcoming": date, times and QR filled, title in the
bold line, series and "with" lines typed by hand (auto-split on "with" or a
colon), no photo, past events flagged. Plugins become a data source plus a slot
card built in the editor, with forms instead of raw JSON; code plugins remain
for bespoke visuals. Examples: water quality gauge, recent wildlife, trash
removed, paddling weather. Screens with data plugins are redrawn when the stored
image is more than an hour old.

## Out of scope

Playlists and rotating screens, any change to piink or device timers, named
user accounts, vertical QR bars.
