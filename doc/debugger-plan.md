# Plan : extension `amspirit-debugger` (DAP + React webview)

> Statut : **plan validé, prêt à implémentation**
> Date : 2026-05-31
> Stack : pnpm workspaces · TypeScript strict · Biome · Vitest + RTL · React (TSX uniquement) · Vite · DAP

---

## 1. Ce que l'émulateur `amspirit-lite` expose réellement

Source : [`amspirit-lite/src/amspirit-helpers/src/web_server.cpp`](../../amspirit-lite/src/amspirit-helpers/src/web_server.cpp)
Doc : [`amspirit-lite/doc/web_server_api.md`](../../amspirit-lite/doc/web_server_api.md)

Serveur HTTP **mono-thread, sans keep-alive**, bind `127.0.0.1:8765` :

| Endpoint | Méthode | Rôle |
|---|---|---|
| `/` | GET | UI HTML de debug embarquée |
| `/api/state` | GET | Snapshot JSON (Z80 complet, GA, PSG, FDC, status emu, fps) |
| `/api/config` | GET / POST | Lit / change `CORE_PARAM_IN` (modèle CPC, CRTC, lang ROM, reset, pause) |
| `/api/ram` | GET / POST | Hex-dump (`?addr=&len=&bank=`) ; écriture + `exec` optionnel |
| `/api/exec` | POST | Set PC et reprend depuis l'adresse |
| `/api/keytype` | POST | Autotype d'une chaîne |
| `/api/keypress` | POST | Press/release d'un VK code CPC |
| `/api/basic` | POST | Tokenize + inject BASIC (`?reset=1&run=1`) |
| `/api/script` | GET / POST / DELETE | CSL ou Lua (`?lang=lua`) |

**Ce qui est exposé pour un debug Z80 :**
- ✅ Lecture complète des **registres Z80** (`PC`, `SP`, `A`/`F`, `B`/`C`, `D`/`E`, `H`/`L`, shadow regs, `IX`, `IY`, `I`, `R`, `IFF1/2`, `IM`)
- ✅ Lecture de la **RAM** (64 KB central + banks étendus)
- ✅ Écriture RAM + redirection du PC (`/api/exec`)
- ✅ Pause / reset hard & soft
- ✅ Snapshot Gate Array, PSG, FDC

**Ce qui manque pour un vrai debugger :**
- ❌ Pas de **breakpoints** (ni soft, ni hardware)
- ❌ Pas de **step instruction / step over / step into / step out**
- ❌ Pas d'**événements push** (le client doit *poller* pour détecter un arrêt)
- ❌ Pas de **désassemblage** côté émulateur (à faire côté client)
- ❌ Pas de **stack trace** (la pile Z80 est plate, mais le mapping CALL/RET n'est pas suivi)
- ❌ Pas de **watchpoints** mémoire
- ❌ Pas de **symboles** / mapping source ↔ adresse
- ⚠️ Endpoint `gdb_server.cpp` présent dans les sources mais **n'expose rien** (le fichier ne contient que le main loop SDL — code mort ou WIP).

---

## 2. HTTP est-il la bonne solution ?

**Pour l'usage actuel d'`amspirit-basic`** (injecter du BASIC, ping de présence) : **oui**, c'est parfaitement adapté.
- 1 requête = 1 action, latence acceptable (<5 ms en local), pas d'état partagé côté client.

**Pour un debugger interactif step-by-step** : **non, c'est inadapté.** Raisons :

1. **Polling obligatoire.** L'UI doit interroger `/api/state` toutes les N ms pour savoir si l'émulateur a atteint un breakpoint → CPU gaspillé côté hôte ET côté émulateur, latence d'au moins 1 frame perçue.
2. **Pas de notification d'événement.** Un "breakpoint hit", "exception", "stopped on step" doit être *push* du serveur vers le client — HTTP request/response n'a pas ce modèle (sauf SSE/long-polling, qui complique).
3. **Mono-thread, sans keep-alive.** Chaque interaction = handshake TCP complet. Pour 60 reads/s lors d'un step, l'overhead devient significatif et le serveur sérialise toutes les requêtes.
4. **Cohérence d'état.** Lire registres + RAM en deux requêtes séparées peut donner un état incohérent si l'émulateur tourne entre les deux.
5. **Réinvention.** VS Code a déjà un protocole standard et mature pour ça : **Debug Adapter Protocol (DAP)**, supporté nativement par toute l'UI de debug (breakpoints dans la gutter, variables view, call stack, watch, hover, debug console).

### Recommandation : **DAP côté VS Code, transport repensé côté émulateur**

L'extension doit implémenter un **Debug Adapter** DAP. La question devient : quel transport entre le Debug Adapter et `amspirit-lite` ?

| Option | Avantages | Inconvénients |
|---|---|---|
| **A. HTTP existant + polling** | Zéro modif émulateur | Latence, gaspillage CPU, pas d'événements push |
| **B. HTTP + SSE (`/api/events`)** | Ajout minimal côté émulateur, garde HTTP pour les commandes | Mi-figue mi-raisin, 2 modèles à maintenir |
| **C. WebSocket sur le même port 8765** | Bidirectionnel, événements push, faible overhead, déjà standard | Ajout d'une lib WS côté C++ (mais embed simple possible) |
| **D. Socket TCP brut + protocole binaire (style GDB Remote)** | Performant, le fichier `gdb_server.cpp` suggère que c'était l'intention | Protocole custom à spécifier, plus de code C++ |
| **E. Implémenter le vrai protocole GDB Remote Serial** | Réutilise outils existants (gdb, lldb) | Très lourd pour le bénéfice côté VS Code, et VS Code parle DAP pas GDB |

**Reco : C (WebSocket) à terme, A (HTTP+polling) en MVP.**
Justification :
- MVP testable **sans toucher à l'émulateur** → on livre vite, on valide l'UX DAP.
- Migration WS = ajout incrémental (`/ws` upgrade sur le port 8765, ajouter une nouvelle `WebPending::breakpoints` côté C++).
- Le Debug Adapter expose une interface `EmulatorTransport` → A et C cohabitent derrière la même abstraction.

---

## 3. Architecture cible

```
┌─────────────────────────────────────────────────────────────────────┐
│                          VS Code                                    │
│                                                                     │
│  ┌─────────────────────┐         ┌─────────────────────────────┐    │
│  │   Debug UI native   │◄──DAP──►│  amspirit-debugger          │    │
│  │  (breakpoints,      │  JSON   │  (Debug Adapter, in-process)│    │
│  │   call stack,       │  RPC    │                             │    │
│  │   variables, …)     │         │  - DebugSession.ts          │    │
│  └─────────────────────┘         │  - BreakpointManager.ts     │    │
│                                  │  - Disassembler.ts (Z80)    │    │
│  ┌─────────────────────┐         │  - EmulatorTransport (iface)│    │
│  │   Webview Panel     │◄──msg──►│    ├── HttpTransport (MVP)  │    │
│  │   (React, TSX)      │ postMsg │    └── WsTransport (v2)     │    │
│  │   - Registers       │         └─────────────┬───────────────┘    │
│  │   - Memory view     │                       │                    │
│  │   - Disasm          │                       │                    │
│  │   - PSG/GA panels   │                       │                    │
│  └─────────────────────┘                       │                    │
└────────────────────────────────────────────────┼────────────────────┘
                                                 │
                                       HTTP :8765│ (puis WS :8765/ws)
                                                 ▼
                                  ┌──────────────────────────────┐
                                  │      amspirit-lite (C++)     │
                                  │   web_server.cpp + Core API  │
                                  │   Core_z80_Read_Register …   │
                                  └──────────────────────────────┘
```

### Deux surfaces React, un seul Debug Adapter

- **Debug Session native** : breakpoints gérés par VS Code (gutter rouge), call stack, variables, watch, evaluate dans la console de debug → tout passe par DAP, aucun HTML/React à écrire.
- **Webview Panel React** : vues *spécifiques à la machine* qui n'existent pas en DAP standard → registres CPC formatés, Gate Array, PSG, mémoire vidéo, désassemblage enrichi. Communique avec le Debug Adapter via `postMessage` typé.

---

## 4. Mapping DAP ↔ AMSpiriT

| Requête DAP | Implémentation côté Debug Adapter |
|---|---|
| `initialize` | Annonce capabilities (`supportsConfigurationDoneRequest`, `supportsStepBack: false`, `supportsDisassembleRequest: true`, `supportsReadMemoryRequest: true`, `supportsWriteMemoryRequest: true`) |
| `launch` | (Optionnel) spawn de l'émulateur via `spawnEmulator` (déjà dans `@amspirit/shared`) |
| `attach` | Ping `/api/state` → vérifie présence |
| `setBreakpoints` | **MVP** : stocker en mémoire côté adapter, vérifier à chaque tick. **v2** : envoyer au C++ via nouveau `POST /api/breakpoints` |
| `configurationDone` | Pause initiale levée |
| `threads` | Un seul thread fictif (`{id: 1, name: "Z80"}`) |
| `stackTrace` | **MVP** : 1 frame (PC courant). **v2** : remonter la pile via heuristique CALL |
| `scopes` | `Registers`, `Flags`, `Shadow`, `Interrupts` |
| `variables` | Mappe vers la réponse `/api/state` → registres formatés |
| `readMemory` | `GET /api/ram?addr=…&len=…` → décode hex → renvoie base64 |
| `writeMemory` | `POST /api/ram` |
| `disassemble` | Lit RAM puis désassemble en TS (table Z80 complète, ~500 opcodes) |
| `continue` | `POST /api/config {paused: false}` |
| `pause` | `POST /api/config {paused: true}` |
| `next` / `stepIn` / `stepOut` | **MVP** : polling + comparaison PC (lent). **v2** : nouveau endpoint `POST /api/step?mode=over\|in\|out` |
| `evaluate` | Si expression = registre → renvoie sa valeur ; si `peek(addr)` → lit mémoire |
| `terminate` | Si on a spawn → kill du process |

### Événements DAP émis

- `initialized` → après `initialize`
- `stopped {reason: "breakpoint"|"step"|"pause"|"entry"}` → après détection
- `continued`
- `terminated` / `exited`
- `output {category: "console", output: …}` → relais du Z80 console msg de `emu_state.Console_Msg`

---

## 5. Structure du package

```
packages/amspirit-debugger/
├── package.json
├── tsconfig.json                 # adapter (Node)
├── tsconfig.webview.json         # webview (DOM, JSX react-jsx)
├── vite.config.ts                # build webview (lib mode + manifest)
├── biome.json                    # extends ../../biome.json
│
├── src/                          # Extension host (Node)
│   ├── extension.ts              # activate(): enregistre DebugAdapterDescriptorFactory + commandes
│   ├── debug/
│   │   ├── AmspiritDebugSession.ts   # extends LoggingDebugSession (vscode-debugadapter)
│   │   ├── BreakpointManager.ts
│   │   ├── Disassembler.ts           # désassembleur Z80 pur (testable)
│   │   ├── RegisterMap.ts            # /api/state JSON → variables DAP
│   │   └── transport/
│   │       ├── EmulatorTransport.ts  # interface
│   │       ├── HttpTransport.ts      # MVP, wrap EmulatorClient
│   │       └── WsTransport.ts        # v2, stub pour l'instant
│   ├── webview/
│   │   ├── DebuggerPanel.ts      # singleton WebviewPanel
│   │   ├── html.ts               # build HTML shell depuis manifest Vite + CSP nonce
│   │   └── messaging.ts          # types ext↔webview (discriminated unions)
│   └── debugConfigurationProvider.ts  # alimente launch.json
│
├── webview/                      # React app — TSX uniquement, AUCUN .html
│   ├── main.tsx                  # createRoot
│   ├── App.tsx
│   ├── components/
│   │   ├── Registers.tsx
│   │   ├── Flags.tsx
│   │   ├── Disassembly.tsx
│   │   ├── MemoryView.tsx
│   │   ├── GateArrayPanel.tsx
│   │   ├── PsgPanel.tsx
│   │   └── Toolbar.tsx
│   ├── hooks/
│   │   ├── useVsCodeApi.ts       # wrapper acquireVsCodeApi + postMessage typé
│   │   └── useDebugState.ts      # subscription au store
│   └── state/
│       └── store.ts              # useReducer + Context
│
└── tests/
    ├── unit/
    │   ├── Disassembler.test.ts          # TDD : 100% des opcodes Z80
    │   ├── RegisterMap.test.ts
    │   ├── BreakpointManager.test.ts
    │   ├── HttpTransport.test.ts         # mock http
    │   └── AmspiritDebugSession.test.ts  # mock transport, asserts DAP responses
    └── components/
        ├── Registers.test.tsx
        ├── Disassembly.test.tsx
        └── App.test.tsx                  # intégration avec useVsCodeApi mocké
```

---

## 6. Manifest VS Code (extraits clés)

```json
{
  "name": "amspirit-debugger",
  "engines": { "vscode": "^1.80.0" },
  "activationEvents": [
    "onDebug",
    "onCommand:amspirit.debugger.openPanel"
  ],
  "contributes": {
    "breakpoints": [{ "language": "amstrad-basic" }],
    "debuggers": [{
      "type": "amspirit",
      "label": "AMSpiriT Z80",
      "languages": ["amstrad-basic"],
      "configurationAttributes": {
        "attach": {
          "properties": {
            "port": { "type": "number", "default": 8765 },
            "host": { "type": "string", "default": "127.0.0.1" },
            "stopOnEntry": { "type": "boolean", "default": false }
          }
        },
        "launch": {
          "required": ["program"],
          "properties": {
            "program":     { "type": "string", "description": "Chemin du .bas à injecter" },
            "emulatorPath":{ "type": "string" },
            "port":        { "type": "number", "default": 8765 },
            "stopOnEntry": { "type": "boolean", "default": true }
          }
        }
      },
      "initialConfigurations": [
        { "type": "amspirit", "request": "attach", "name": "Attach AMSpiriT", "port": 8765 }
      ]
    }],
    "commands": [
      { "command": "amspirit.debugger.openPanel", "title": "AMSpiriT: Open Debug Panel" }
    ]
  }
}
```

Dépendances : `@amspirit/shared`, `@vscode/debugadapter`, `@vscode/debugprotocol`, `react`, `react-dom`.

---

## 7. Cycle TDD (ordre des commits attendu)

1. 🔴🟢 `Disassembler` : table d'opcodes Z80 (tests = vecteurs connus, ex. `NOP` `00`, `LD A,n` `3E nn`, prefixes `CB/DD/ED/FD`).
2. 🔴🟢 `RegisterMap` : transforme la réponse `/api/state` en `Variable[]` DAP.
3. 🔴🟢 `HttpTransport` : mocks `http.request`, vérifie endpoints utilisés.
4. 🔴🟢 `BreakpointManager` : add/remove/match par adresse.
5. 🔴🟢 `AmspiritDebugSession` : par requête DAP (initialize → threads → stackTrace → scopes → variables → continue → setBreakpoints → step). Transport mocké, asserts sur les `Response` / `Event` émis.
6. 🔴🟢 Composants React : `Registers`, `Disassembly`, `MemoryView`, … (jsdom + RTL).
7. 🔴🟢 Test d'intégration `App.test.tsx` : flux complet "stopped event → store mis à jour → composants rendus".

Config Vitest : `environmentMatchGlobs` (`tests/unit/**` → node, `tests/components/**` → jsdom).

---

## 8. Décisions

- **DAP plutôt que WebView-only** → UX VS Code native, breakpoints dans la gutter, call stack, hover, debug console gratuits.
- **Transport HTTP en MVP, WS en v2** → livraison rapide sans bloquer sur des changements côté C++.
- **Désassembleur en TS** → testable unitairement, pas de round-trip C++.
- **Webview TSX uniquement** (Vite mode lib + manifest, HTML shell généré par l'extension avec CSP nonce stricte) — respecte la contrainte "vues externes au TS, mais pas de HTML écrit à la main".
- **`useReducer` + Context** côté webview (zéro dep state-management).
- **Biome + TS strict** partout, project references.
- **pnpm workspaces** (`workspace:*` pour `@amspirit/shared`).

---

## 9. Hors scope du MVP

- Step instruction réel (sera implémenté avec polling-PC en attendant un endpoint C++ `/api/step`).
- Watchpoints mémoire (nécessitent un hook côté core).
- Symboles / source mapping BASIC ↔ adresses tokenisées (faisable car le tokenizer est connu, mais lourd).
- Reverse debugging.
- Publication Marketplace.

---

## 10. Travail attendu côté `amspirit-lite` (à proposer en PR séparée)

Pour passer de MVP à v2 (debugger réactif & précis) :

1. `POST /api/step?mode=instr|over|in|out` → exécute N instructions Z80 puis pause.
2. `POST /api/breakpoints` (body : `[{addr, condition?}]`) → liste maintenue côté core, contrôle dans la boucle d'exécution.
3. `GET /api/events` en **SSE** (ou upgrade WS sur `/ws`) → push `stopped`, `output`, `breakpoint-hit`.
4. (Optionnel) `GET /api/disasm?addr=&count=` côté core, plus rapide qu'un round-trip RAM.

Ces ajouts gardent la rétrocompatibilité de l'API HTTP existante.

---

## 11. Vérification

1. `pnpm install` → succès, lockfile généré.
2. `pnpm -r build` → 0 erreur TS strict.
3. `pnpm biome check .` → 0 erreur.
4. `pnpm -r test` → tous Vitest verts, couverture du désassembleur > 95 %.
5. F5 → Extension Dev Host → ouvrir un `.bas`, créer `launch.json` `attach`, poser un breakpoint, lancer → l'UI VS Code montre "Paused on breakpoint", panneau registres affiche les valeurs.
6. `pnpm --filter amspirit-debugger package` → `.vsix` valide.
