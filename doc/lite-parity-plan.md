# AMSpiriT‑Lite debug‑webview parity — analysis & catch‑up plan

> Written 2026‑07‑04. The `amspirit-lite` emulator's embedded debug web UI has
> grown well past what the VS Code extensions surface. This doc inventories the
> gap and lays out a **phased catch‑up** scoped to the developer‑in‑the‑editor
> workflow. Chosen scope: **Debug + scripting** (Phases 0–4); audio/disk/CRT‑
> shader/UI‑language are explicit **non‑goals** (they belong to the emulator's
> own window, not the editor).
>
> Sources: `../amspirit-lite/src/doc/web_server_api.md` (≈40 endpoints + SSE) and
> `../amspirit-lite/src/assets/amspirit-lite.html` (the embedded 10‑tab UI).

## 1. What amspirit‑lite's debug webview now offers

Ten tabs over ~40 HTTP endpoints + one SSE stream (`/api/events`):

| Tab | Key features | Endpoints |
|---|---|---|
| **Keyboard** | Virtual keyboard, live keyboard matrix | `/api/keymatrix`, `/api/keytype`, `/api/keypress`, `/api/keymap` |
| **BASIC** | Live listing, line/statement highlight, step (line+stmt), breakpoints, run‑to, variable hover | `/api/basic_listing`, `/api/basic_step`, `/api/basic_bp`, `/api/basic_runto`, `/api/basic_state` |
| **Debug (CPU)** | Z80 regs, disassembler with **code/data zone analysis** ("Analyze from PC" / "Reset zones"), single‑step, **Step Over**, **Step Back (timeline)**, PC breakpoints (bank‑qualified), **instruction history**, memmap, 64 KB RAM dump + **search**, **live screen capture w/ breakpoint overlay**, GA/CRTC/FDC/PSG/Screen sub‑tabs | `/api/step`, `/api/z80_bp`, `/api/history`, `/api/codemap`, `/api/memmap`, `/api/ram`, `/api/state`, PNG endpoint |
| **Audio** | Audio snapshot + **FFT spectrum**, record / WAV export | `/api/audio`, `/api/audio/record` |
| **Heat Map** | Executed‑code bitmap visualisation | `/api/codemap` |
| **Poke** | RAM read/write, PC redirect | `/api/ram`, `/api/exec` |
| **Script** | **CSL / Lua 5.4** runner, state, abort | `/api/script` (GET/POST/DELETE) |
| **Config** | CPC model, CRTC type, soft/hard reset, pause, volume | `/api/config` |
| **Disk** | Create blank DSK, save/download image | `/api/disk` |
| **Settings** | Monitor preset, screen type, **CRT shader params**, UI language, hotkeys | `/api/render`, `/api/lang` |

## 2. What we cover today (3 packages)

- **`@amspirit/shared` — `EmulatorClient`** (`packages/shared/src/emulator.ts`)
  wraps: `ping`/`pingState`/`getState`/`getZ80`; `injectBasic`/`exportBasic`/
  `getBasicState`/`getBasicListing`/`basicStep`/`setBasicBreakpoints`/`basicRunTo`;
  `setZ80Breakpoints`/`step`/`setPaused`; `getMemmap`/`readRam`/`writeRam`/
  `getConfig`/`getCodemap`. SSE consumed via `emulator-events` + `EmulatorEventHub`
  + `StopWatcher`/`RefreshScheduler`.
- **`amspirit-z80`** — 7 docked webviews: Registers, Memory (codemap shading +
  inline edit + RAM search? no — see gap), Disassembly (label‑aware, coverage,
  code‑vs‑data DB, export), Gate Array, PSG, FDC, CRTC. Stepping: `step`,
  **Step Over** and **run‑to** (targets computed client‑side in `step-targets.ts`),
  PC breakpoints. DAP session (attach + launch).
- **`amspirit-basic`** — BASIC Variables webview, inject/pull/run/reset, BASIC
  breakpoints via DAP, step, run‑to, SSE stop detection.

## 3. Gap analysis (vs lite, scoped to VS Code value)

### High value — in scope
| Feature (lite) | Our status | Endpoint |
|---|---|---|
| **Instruction history** (last 20) | ❌ not wrapped on client | `/api/history` |
| **Disassembler zone analysis** ("Analyze from PC" / "Reset zones") | ⚠️ codemap used for coverage shading + code‑vs‑data `DB`, but no explicit analyze/reset‑zones action | `/api/codemap` |
| **RAM search** (Find / Next in 64 KB) | ❌ | `/api/ram` |
| **Live screen capture** + breakpoint overlay | ❌ | PNG endpoint (verify in `web_png.cpp` — undocumented in `.md`) |
| **Step Back / timeline** | ⬜ already tracked in STATUS as *reverse‑debug*; **blocked** on the emulator exposing recorded Z80 history over HTTP | — |

### Medium value — in scope (scripting is the chosen extra)
| Feature | Our status | Endpoint |
|---|---|---|
| **CSL / Lua scripting** runner | ❌ (STATUS already lists *SNA/DSK load via `/api/script`*) | `/api/script` GET/POST/DELETE |
| Config from editor (CPC model / CRTC type / reset) | ⚠️ pause only (`setPaused`) | `/api/config` |
| Keyboard input (`keytype`/`keypress`) — dev convenience | ❌ | `/api/keytype`, `/api/keypress` |

### Memory‑mapping / banking awareness (cross‑cutting — important)
The lite Debug tab treats the **memory configuration** as a first‑class concern:
`/api/memmap` reports ROM/RAM per 16 KB region + banking (`rmr`, `ram_mode` the
`&7Fxx` value 0–7, `ram_page`, `ext`), `/api/ram` takes `bank=` (**16 KB banks**
since lite 1.14: 0–3 = central 64 KB, 4+ = extension, `addr` carries across
banks) and `view=cpu` (memory *as the Z80 sees it*, ROM overlays + RAM banking
applied). `POST /api/ram` takes `bank` too (2026‑09‑15: our `writeRam` does not
send it yet). It renders a **memmap bar** and keeps every read/write/search
config‑aware.

Where we stand: our Memory view already exposes the **bank selector** (central +
extended) and **`view=cpu`** toggle, and `readRam`/`writeRam` carry `bank`; but
`getMemmap()` currently feeds **only** the Gate Array view — we do **not** render
a ROM/RAM memmap bar in the Memory/Disassembly views, and coverage/search/zone
analysis are not yet driven by the live mapping. Implication for the plan:

- **Add a memmap bar** (ROM/RAM per region + `ram_mode`/`ram_page`) to the Memory
  and Disassembly views, sourced from the existing `getMemmap()`.
- **RAM search, screen overlay and zone analysis must be mapping‑aware**: search
  the correct bank / `view=cpu` space; label results by region (ROM name vs RAM
  bank); the disassembler already honours banks — extend zone analysis to respect
  the current mapping rather than a flat 64 KB.
- Fold this into **Phase 1** (memmap bar + mapping‑aware search) and **Phase 0**
  (ensure client read paths thread `bank`/`view` everywhere the new features read).

### Non‑goals (belong to the emulator window, not the editor)
FFT audio spectrum + WAV export · disk DSK management · CRT shader / monitor
presets · UI language · full virtual keyboard + keymatrix. Classed as *not
retard* — deliberately out of scope.

## 4. Catch‑up plan (phased; TDD + DI + Changesets, per repo conventions)

**Phase 0 — client foundations (1 PR).** Add the missing `EmulatorClient`
wrappers, each TDD'd against `FakeEmulator` (assert URL + payload):
`getHistory()` (`/api/history`), `execAt()` (`/api/exec`), script trio
`runScript`/`getScriptState`/`abortScript` (`/api/script`), `setConfig()`
(model/CRTC/reset via `/api/config`), and input helpers `keytype()`/`keypress()`.
RAM search stays a pure helper over `readRam`. These primitives unblock the rest.

**Phase 1 — complete the Z80 Debug surface (core value).**
1. **Instruction history** — new `amspirit.z80.history` view fed by `getHistory()`,
   refreshed off the existing `RefreshScheduler` (stop‑immediate + throttled).
2. **Zone analysis** in the Disassembly view — "Analyze from PC" / "Reset zones"
   layered on the existing codemap coverage (pure logic in `disasm-view-model.ts`).
3. **RAM search** in the Memory view (pure `memory-model.ts` search + Find/Next UI).

**Phase 2 — live screen capture.** Webview view rendering the emulator PNG,
refreshed via `RefreshScheduler`, with a current‑breakpoint overlay. *Prereq
resolved (2026‑09‑15):* `GET /api/screenshot[?crop&live&full]` is documented —
`image/png`, `503` before the first frame, and `X-Beam-X/Y` + `X-Crop-X/Y/W/H`
headers give the beam position in the same space `POST /api/raster_bp?x&y` takes.
So the view can also **arm a raster breakpoint by clicking the screen**.

**Phase 3 — Step Back / timeline** (reconciles with STATUS *reverse‑debug*).
*Unblocked (2026‑09‑15):* the emulator now exposes a **timelapse** —
`POST /api/tl_back` steps one snapshot back, and `emu` (`/api/ping`,
`/api/state`) carries `tl_active`, `tl_steps_back`, `tl_steps_fwd` and
`tl_step_kind` (`"frame"` / `"basic"` / `"z80"`). Only *back* has an endpoint
so far (no `tl_fwd`), and `/api/screenshot` forces `live=0` while rewound.
`/api/history` entries also now carry registers (`a`, `f`, `bc`, `de`, `hl`,
`sp`, `ix`, `iy`, `a2`, `f2`, …) next to `pc`/`hex`. **Action:** wrap `tlBack()`
+ the `tl_*` fields in `EmulatorClient` (TDD), then a DAP `stepBack` gated on
`tl_steps_back > 0`; check how the timelapse is enabled on the emulator side
(flag / config) before wiring.

**Phase 4 — CSL/Lua scripting.** "Run script" command (active `.csl`/`.lua`
buffer → `runScript`), state indicator + abort. `GET /api/script` now also
returns `output` (the `print()` capture, 64 KiB cap) — surface it in an output
channel. `POST /api/eval` + `GET /api/eval?seq=N` (persistent Lua console,
request/response) is a natural REPL. Network scripts run **sandboxed** (no
`io`/`os`/`require`; jailed `fs.*`) unless the emulator runs with
`--lua-full-stdlib`. The former STATUS follow‑up *SNA/DSK load via `/api/script`*
now has a direct route: **`POST /api/media?name=<file>&drive=<0|1>`** takes the
raw SNA/DSK/HFE/IPF/CPR/CRO/BIN bytes (headerless `.bin` needs
`name=game@4000[@ENTRY].bin`); `.cdt` is not supported there.

**Phase 5 (optional) — config & input.** Palette commands to change model/CRTC,
reset, and send keystrokes. Virtual keyboard itself deprioritised (redundant with
the emulator window).

### Sequencing note
Phase 0 first (unblocks all), then 1 → 2 → 4 as independent PRs (each its own
changeset). Phase 3 was gated on an emulator API addition; that landed
(`/api/tl_back`, see above), so it can now be scheduled after Phase 1.

## 5. API changes since this plan was written (lite 1.14 → 1.15, 2026‑09‑15)

Source of truth: a running emulator's `GET /api/doc` (+ `/api/doc/<name>`) and
`amspirit-lite/src/doc/web_server_api.md`. What changed for us:

| Change | Impact on this repo |
|---|---|
| Default port **`6128`** (was `8765`) | Defaults switched everywhere (client, settings, manifests, docs). Done. |
| `/api/ram` `bank` = **16 KB banks** (was 64 KB bank64s); `POST /api/ram` takes `bank` | `memoryBanks()` addresses each extended bank64 by its first 16 KB bank; `writeRam` still central‑only. Done (read side). |
| `/api/config` adds `ram_kb` (total, 128/192/320/576); `extended_ram` is a raw index | `EmulatorConfig.ramKb`; bank count derived from it. Done. |
| `emu.frame` → **`emu.frames`**; new `frame_ms`, `autotyping`, `autotype_remaining`, `tl_*`, `ram_apply_seq` | `EmuState.frames` + `ramApplySeq` mapped; `tl_*` pending Phase 3. |
| `POST /api/ram` / `/api/exec` answer `{ok, seq}`; readback must wait for `emu.ram_apply_seq >= seq` | `writeRam`/`execAt` return `seq`. **Launch should wait on it** instead of the dirty‑prefetch workaround — to try. |
| **`400 {error, field}`** for a rejected request (was `200` + no effect); `405 {error, allow}` for an undocumented method | `send()` rejects with the message. Done. |
| SSE `frame` event every **10 frames (~5 Hz)**, not per frame | Comment fixed; `RefreshScheduler` already throttles. |
| `/api/z80_bp` accepts **`Bnn:hhhh` physical locations**; a CPU address is resolved against the live mapping on apply (fires on the byte, not the address) | Bank‑aware breakpoints possible (symbol maps carry banks). Follow‑up. |
| New: `/api/tl_back`, `/api/screenshot` (documented), `/api/beam`, `/api/raster_bp`, `/api/media`, `/api/disk`, `/api/eval`, `/api/quit`, `/api/license`, `/api/doc/<name>` | Phases 2/3/4 above. |
| `/api/history` entries carry registers | History view could show them (Phase 3 timeline). |
| `/api/basic_bp` doc says "line numbers"; the handler still parses **statement addresses** (`h_basic_bp`) | No change; our client is right. Watch for a future flip. |

Known emulator limitation (documented upstream): `bank=4+` reads
`Memory_Extended[]`, **not** the live banked RAM the Z80 writes through
`OUT (&7Fxx)`; use `view=cpu` to see what is paged in.
</content>
