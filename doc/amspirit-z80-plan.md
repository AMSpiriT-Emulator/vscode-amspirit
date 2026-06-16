# Plan — package `amspirit-z80` (debugger Z80 assembleur)

> Brief de handoff. À exécuter par un agent travaillant **dans ce repo
> (`vscode-amspirit`)**. Le repo émulateur `amspirit-lite` est déjà prêt :
> branche `feat/z80-breakpoints`, endpoint `POST /api/z80_bp` livré (breakpoints
> PC niveau instruction, sans modification du core). Crée une branche dédiée,
> travaille en **TDD**, et termine par le gate `pnpm precommit`.

## 0. Contexte & objectif

L'émulateur AMSpiriT Lite expose un serveur de debug HTTP (`--web-server`,
`127.0.0.1:8765`). L'extension `amspirit-basic` est un debugger DAP **BASIC**.
On ajoute un **3ᵉ package** `packages/amspirit-z80` : un debugger DAP
**assembleur Z80**, type de debug `amspirit-z80`, qui réutilise `@amspirit/shared`
(`EmulatorClient`, `disassemble`, `Z80Registers`). **Aucune modification de
`amspirit-basic`.**

## 1. Contrat API émulateur disponible aujourd'hui (ne rien supposer d'autre)

| Besoin | Endpoint | Détail |
|---|---|---|
| Breakpoints PC | `POST /api/z80_bp` | body = adresses séparées par virgules, **hex `0x..` ou décimal** ; body vide = efface tout. Stoppe avec **`PC == addr`, avant** d'exécuter l'instruction. `{"ok":true}` |
| Registres | `GET /api/z80` | `{PC,SP,A,F,B,C,D,E,H,L,A2..L2,IX,IY,I,R,IFF1,IFF2,IM}` |
| Mémoire | `GET /api/ram?addr=N&len=N&view=cpu` | `{hex}`. **Toujours `view=cpu`** (le PC tombe souvent en ROM) |
| Continue / Pause | `POST /api/config` body `{"paused":bool}` | |
| Détection d'arrêt | `GET /api/ping` | `emu.paused` — poll ~100 ms (réutiliser le pattern `StopPoller` de `amspirit-basic`) |
| Step 1 instruction | `POST /api/step` | exécute exactement une instruction Z80 puis re-pause |

**Pas disponibles** (et pas requis) : `/api/disasm` (désassembler **côté client**
via `disassemble()` de `shared`), run-to Z80 natif, step-over/out natifs → voir
§5, tout se fait **côté client** avec les endpoints ci-dessus.

## 2. Architecture du mapping source ↔ adresse (décision actée)

Pattern **adapter**, pour brancher plusieurs assembleurs (sjasmplus d'abord,
puis rasm) :

```ts
interface SymbolMap {
  lineToAddresses(file: string, line: number): number[]                    // breakpoints
  addressToLine(addr: number): { file: string; line: number } | undefined  // stack / highlight
}
interface SymbolMapParser {
  readonly id: string                       // "sjasmplus-sld" | "rasm"
  parse(content: string, opts): SymbolMap
}
```

- **v1 : `SjasmplusSldParser`** — format SLD (`sjasmplus --sld=out.sld`), pensé
  pour DAP (c'est ce qu'utilise DeZog). Champs par enregistrement :
  `source|line|defLine|page|value(address)|type|data` ; ne retenir que les
  lignes de type instruction (`T`). TDD contre un échantillon SLD réel.
- **v2 : `RasmParser`** (adapter suivant, même interface).
- Le `.sld`/map est désigné par un attribut `launch.json` (`mapFile`), avec
  auto-détection à côté du `program`.

## 3. Conventions à respecter (depuis `amspirit-basic`)

- **ESM strict** : imports avec extension `.js` ; fichiers **kebab-case**,
  classes PascalCase.
- **Biome** : double quotes, trailing commas `all`, **semicolons asNeeded**,
  `noExplicitAny: error`, `useImportType`, `node:` protocol.
- **TS strict** : `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **Logique pure + DI**, testée via **Vitest** (`tests/**/*.test.ts`, seuils
  90/90/90/80). La session DAP (shell impératif) est **exclue de la coverage**
  (comme `basic-debug-session.ts`).
- **Build** : `vite build` (webview React si vue registres) + `esbuild.mjs`
  (bundle `out/extension.js`, `vscode` external, `@amspirit/shared` inliné via
  alias source).
- **Factory DAP inline** : `DebugAdapterInlineImplementation`, DI de
  `EmulatorClient`.
- Copier les fichiers de config quasi tels quels : `tsconfig.json`,
  `vitest.config.mts`, `vite.config.ts`, `esbuild.mjs`, `knip.json` (ajouter
  l'entrée workspace), `language-configuration.json`.
- Manifeste : `name: "amspirit-z80"`,
  `activationEvents: ["onDebugResolve:amspirit-z80"]`, debugger
  `type: "amspirit-z80"` (`request: attach` en v1), langage `z80-asm`
  (extensions `.asm`, `.z80`, `.s`), `breakpoints: [{language:"z80-asm"}]`.

## 4. Changement dans `@amspirit/shared` (TDD dans `shared/tests`)

Ajouter à `EmulatorClient` :

- `setZ80Breakpoints(addrs: number[]): Promise<void>` → `POST /api/z80_bp`,
  body `addrs.map(a => "0x" + a.toString(16)).join(",")`.
- `step(): Promise<void>` → `POST /api/step` (si pas déjà présent).

(`@amspirit/shared` est dans `ignore` des changesets → pas d'entrée changeset
pour lui.)

## 5. Mapping DAP → endpoints (tout réalisable sans nouveau travail émulateur)

| Requête DAP | Implémentation |
|---|---|
| `initialize` | capabilities : `supportsConfigurationDoneRequest`, `supportsTerminateRequest`, `supportsReadMemoryRequest`, `supportsDisassembleRequest`, `supportsSteppingGranularity` |
| `setBreakPoints` (source) | `SymbolMap.lineToAddresses()` → `setZ80Breakpoints()` ; marquer `verified` celles résolues |
| `threads` | unique `Thread(1, "Z80")` |
| `stackTrace` | `getZ80()` → `addressToLine(PC)` → 1 frame (walk de pile plus tard) |
| `scopes` / `variables` | formater `Z80Registers` en Registers / Flags / Shadow / Interrupts (module **pur**, TDD) |
| `continue` | `setPaused(false)` + `StopPoller` → `StoppedEvent` |
| `pause` | `setPaused(true)` |
| `stepIn` | `step()` (une instruction) |
| `next` (step-over) | décoder l'instr courante via `disassemble(readRam(PC, view=cpu))` → adresse suivante = `PC + len` ; poser un **bp temporaire** là + bps user, `continue`, retirer le temp à l'arrêt (saute les `CALL/RST`). Calcul de cible = module **pur** testable |
| `stepOut` | lire `SP` + l'adresse de retour en mémoire `(SP)`, poser bp temporaire à cette adresse, `continue`, retirer à l'arrêt (module **pur**) |
| run-to-cursor | bp temporaire one-shot à l'adresse cible, `continue`, retirer à l'arrêt |
| `disassemble` / `readMemory` | `disassemble()` de `shared` sur `readRam(..., view=cpu)` |

## 6. Découpage TDD (red → green, par module pur d'abord)

1. **`shared`** : `setZ80Breakpoints` (+`step`) — test du body envoyé.
2. **`symbol-map/sjasmplus-sld.ts`** : parse SLD → `lineToAddresses` /
   `addressToLine`. Tests contre un échantillon SLD (includes, plusieurs
   adresses pour une ligne, lignes sans code).
3. **`registers-view.ts`** : `Z80Registers` → variables DAP (flags décodés depuis
   F : S Z H P/V N C).
4. **`step-targets.ts`** : calcul des cibles step-over (`PC + len` via
   `decodeInstruction`) et step-out (depuis SP + mémoire).
5. **`stop-poller.ts`** : réutiliser/copier celui de `amspirit-basic` (ou le
   remonter dans `shared`).
6. **`z80-debug-session.ts`** : shell DAP câblant les modules (non couvert par
   coverage).
7. **`extension.ts`** : activation + enregistrement factory/configProvider (non
   testé).

## 7. Validation live (après build)

Builder l'émulateur depuis la branche `feat/z80-breakpoints`, le lancer
`--web-server`, assembler un petit `.asm` avec `sjasmplus --sld`, charger le
binaire, attacher : poser un breakpoint en marge → vérifier l'arrêt sur la bonne
ligne (`PC` == adresse SLD), tester continue / stepIn / next / stepOut.
(Pattern : `pkill` l'instance précédente, `XDG_CONFIG_HOME` isolé.)

## 8. Clôture

- `.changeset/amspirit-z80-phase1.md` : `"amspirit-z80": minor` + description.
- Gate complet : **`pnpm precommit`** (build + biome check + typecheck +
  test:coverage + knip) vert.
- Commits **sans attribution** (cf. CLAUDE.md du repo + instructions globales).
  PR contre `main`.

## 9. Hors scope v1 (futur)

- Vue registres/désassemblage en webview React (le slice disasm existe déjà côté
  `amspirit-basic` phase 2c — réutilisable).
- Adapter `rasm` (v2).
- Step-over/out **natifs** côté émulateur + canal SSE (optimisations émulateur
  déjà identifiées, non bloquantes).
