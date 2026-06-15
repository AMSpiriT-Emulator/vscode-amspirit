---
"@amspirit/shared": minor
"amspirit-basic": minor
---

`@amspirit/shared` gains a pure, reusable Z80 disassembler (`disassemble` /
`decodeInstruction`, covering the main table plus the CB, ED and DD/FD — IX/IY,
incl. DDCB/FDCB — prefixes) so any AMSpiriT extension can decode CPC code, and
`EmulatorClient.readRam(…, { cpuView: true })` to read memory as the Z80 sees it
(ROM/RAM mapping applied) via `/api/ram?view=cpu`.

The `amspirit-basic` debug panel ("AMSpiriT: Open Debug Panel") now shows a
**BASIC Variables** card reproducing the amspirit-lite web-debugger panel: a
memory-layout header (TXTTOP, program size, variable and array zones, free RAM,
statement address, BASIC version) plus a name/type/value table of the live
Locomotive BASIC variables, with cells that flash when their value changes.
