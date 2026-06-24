---
"@amspirit/shared": minor
"amspirit-z80": minor
---

Surface the full CRTC (6845) register file in the CRTC view.

`/api/state` now carries a `crtc` block (`regs` R0–R13, `selected_reg`,
`rasterline`, `vsync`), so `EmulatorClient.getState()` maps a new `CrtcState`
and the CRTC view shows the register file with named decimal values, the chip
variant, the selected register, the current raster line and the real CRTC
VSYNC — replacing the type-only placeholder. The view stays strictly CRTC:
machine context (model/frame/FPS) and the Gate-Array HSYNC proxy were dropped.
