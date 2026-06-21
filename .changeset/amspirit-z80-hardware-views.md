---
"amspirit-z80": minor
---

Added dedicated **peripheral-chip views** to the AMSpiriT Z80 tool suite, docked
alongside Registers/Memory/Disassembly in the Activity Bar:

- **Gate Array** — video mode; the palette as a **colour swatch grid** (the 16
  PENs plus the border, the GA's 17th ink, set off by a divider; PENs unused in
  the current video mode are dimmed); HBL/VBL signal chips; RMR / RAM-banking; and
  the 16 KB **memory map as a ROM/RAM bar** with ROM names (Lower / BASIC /
  AMSDOS), from `/api/memmap`.
- **PSG (AY)** — the three tone channels **side by side**, each with its
  frequency (period → Hz), period, a **volume meter** (or `ENV` when
  envelope-driven) and tone/noise routing chips; plus the noise period and the
  envelope (period + an ASCII **shape glyph**).
- **FDC (765)** — MSR + SR0–SR2 as hex; the MSR and SR0 decoded into named bit
  chips (RQM/DIO/EXM/CB/D0B–D3B, SE/EC/NR/HD); the interrupt code; and the
  motor + active-drive state.
- **CRTC** — the CRTC type/variant, the machine context (CPC model, frame, FPS)
  and the HSYNC/VSYNC chips it drives. (The HTTP API does not expose the 6845
  register file today, so this view stays minimal.)

Shared design polish across the suite: bit chips carry per-bit tooltips; hex
values use a `#` sigil so they aren't confused with the decimal fields beside
them; the Memory and Disassembly views gained a **colour legend** for their
shading; and the "no data" placeholder no longer says "paused" (the views update
live). Most chips reuse the shared scope table (which gained palette / membar
renderers); the PSG has a dedicated view. All decoding lives in pure,
unit-tested modules behind a shared `HardwarePanel`; new shared client methods
`getState()` / `getMemmap()`.
