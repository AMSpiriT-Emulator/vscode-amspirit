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
`&7Fxx` value 0–7, `ram_page`, `ext`), `/api/ram` takes `bank=` (central 0 vs
extended pages) and `view=cpu` (memory *as the Z80 sees it*, ROM overlays + RAM
banking applied). It renders a **memmap bar** and keeps every read/write/search
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
refreshed via `RefreshScheduler`, with a current‑breakpoint overlay. *Prereq:*
confirm the exact PNG endpoint/params in `amspirit-lite/src/amspirit-helpers/src/web_png.cpp`
(not in `web_server_api.md`).

**Phase 3 — Step Back / timeline** (reconciles with STATUS *reverse‑debug*).
Depends on the emulator exposing its recorded Z80 history over HTTP
(`session_record_z80_history` exists internally; no endpoint yet). **Action:**
raise the API need on `amspirit-lite` first; implement `stepBack`/`reverseContinue`
DAP once the endpoint lands. Blocked until then.

**Phase 4 — CSL/Lua scripting.** "Run script" command (active `.csl`/`.lua`
buffer → `runScript`), state indicator + abort. Also covers the existing
STATUS follow‑up *SNA/DSK load via `/api/script`* (DeZog parity). Good synergy
with editing scripts in VS Code.

**Phase 5 (optional) — config & input.** Palette commands to change model/CRTC,
reset, and send keystrokes. Virtual keyboard itself deprioritised (redundant with
the emulator window).

### Sequencing note
Phase 0 first (unblocks all), then 1 → 2 → 4 as independent PRs (each its own
changeset). Phase 3 is gated on an emulator API addition and should be scheduled
only once that endpoint exists.
</content>
