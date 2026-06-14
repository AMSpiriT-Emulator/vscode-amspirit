# AMSpiriT — VS Code Extensions (monorepo)

Édition Amstrad CPC BASIC dans VS Code, avec injection directe dans l'émulateur
[AMSpiriT Lite](https://github.com/AMSpiriT/amspirit-lite) en une touche.

Ce dépôt est un **monorepo pnpm** qui héberge la couche partagée et toutes les
extensions VS Code de l'écosystème AMSpiriT.

## Structure du dépôt

```
vscode-amspirit/
├── packages/
│   ├── shared/                  # @amspirit/shared — client HTTP émulateur réutilisable
│   └── amspirit-basic/          # Extension VS Code (architecture TDD, modules testables, DI)
├── biome.json                   # Lint + format (Biome)
├── tsconfig.base.json           # TS strict partagé
├── pnpm-workspace.yaml
└── doc/
    └── debugger-plan.md         # Plan d'évolution future (debugger DAP)
```

| Package | Rôle | Statut |
|---|---|---|
| [`@amspirit/shared`](packages/shared/) | `EmulatorClient` + `spawnEmulator` | Stable, 20 tests Vitest |
| [`amspirit-basic`](packages/amspirit-basic/) | Extension VS Code (BASIC + injection), architecture TDD (modules testables, DI) | Actif, c'est ce qui est packagé — 48 tests Vitest |

## Stack outillage

- **pnpm workspaces** (≥ 10)
- **TypeScript** strict avec `noUncheckedIndexedAccess` et `exactOptionalPropertyTypes`
- **Biome** pour lint + format (zéro ESLint/Prettier)
- **Vitest** pour les tests unitaires
- **CI GitHub Actions** (`check` + `test` + `build` sur Node 20)

## Prérequis

- Node.js ≥ 20
- pnpm ≥ 10 (`corepack enable` ou `npm i -g pnpm`)
- [AMSpiriT Lite](https://github.com/AMSpiriT/amspirit-lite) compilé avec `--web-server`
- VS Code (ou VSCodium) 1.80+

## Build & test

```bash
pnpm install              # installe tous les packages
pnpm build                # tsc -p sur chaque package
pnpm test                 # vitest run sur chaque package
pnpm check                # biome check (lint + format)
pnpm check:fix            # auto-fix Biome
```

Commandes par package (filtre `pnpm --filter <nom>`) :

```bash
pnpm --filter @amspirit/shared       test
pnpm --filter amspirit-basic         build
pnpm --filter amspirit-basic         test:watch
pnpm --filter amspirit-basic         package    # produit le .vsix
```

## Fonctionnalités de l'extension `amspirit-basic`

- Coloration syntaxique Amstrad CPC BASIC (`.bas`)
- Injection du fichier courant dans un émulateur en cours d'exécution
- Hard-reset puis injection après boot
- Auto-exécution (`RUN`) après injection
- Récupération du programme BASIC en mémoire vers un nouvel éditeur (pull)
- Lancement de l'émulateur depuis VS Code
- Indicateur de connexion dans la barre d'état

### Configuration (`Ctrl+,` → chercher `amspirit`)

| Paramètre | Défaut | Description |
|---|---|---|
| `amspirit.emulatorPath` | _(vide)_ | Chemin complet de `amspirit-lite-sdl`. Un sélecteur de fichier s'ouvre si vide. |
| `amspirit.webPort` | `8765` | Port du serveur HTTP de debug de l'émulateur (`--web-port`). |
| `amspirit.autoLaunch` | `false` | Lance automatiquement l'émulateur au démarrage si aucun n'est joignable. |
| `amspirit.emulatorArgs` | `[]` | Arguments supplémentaires (ex. `["--cpc", "6128"]`). |

### Raccourcis (fichiers `.bas` actifs)

| Action | Raccourci | Description |
|---|---|---|
| **Inject & Run** | `F6` | Tokenise + injecte le fichier, puis `RUN`. |
| **Reset & Run** | `Shift+F6` | Hard-reset, injection après boot (~3 s), puis `RUN`. |
| **Inject only** | `Ctrl+F6` | Injection sans exécution (utile pour `LIST`). |

### Commandes (`Ctrl+Shift+P`)

| Commande | Description |
|---|---|
| `AMSpiriT: Launch Emulator` | Démarre `amspirit-lite-sdl --web-server` |
| `AMSpiriT: Connect to Emulator` | Ping l'émulateur, met à jour la barre d'état |
| `AMSpiriT: Inject & Run BASIC` | Injecte + exécute |
| `AMSpiriT: Reset & Run BASIC` | Hard-reset puis injecte + exécute |
| `AMSpiriT: Inject BASIC (no run)` | Injecte sans exécuter |
| `AMSpiriT: Reset & Inject BASIC (no run)` | Hard-reset puis injecte sans exécuter |
| `AMSpiriT: Pull BASIC from Emulator` | Récupère le programme en mémoire dans un nouvel éditeur `.bas` |

### Démarrer l'émulateur côté CLI

L'émulateur doit être lancé avec `--web-server` :

```bash
amspirit-lite-sdl --web-server
amspirit-lite-sdl --web-server --web-port 9000   # port custom
```

Ou via la commande `AMSpiriT: Launch Emulator` (les flags sont ajoutés automatiquement).

## Développement

```bash
git clone <ce-repo>
cd vscode-amspirit
pnpm install
pnpm --filter amspirit-basic watch
```

Ouvre le dossier dans VS Code, presse **F5** pour lancer un Extension
Development Host avec l'extension chargée. Recharge la fenêtre hôte
(`Developer: Reload Window`) après modification.

### Workflow TDD pour `amspirit-basic`

L'architecture isole la logique métier de l'API VS Code :

- `src/config/Settings.ts` — lecture/validation des settings (testable sans VS Code)
- `src/connection/PingService.ts` — boucle de ping + transitions d'état
- `src/lifecycle/EmulatorLauncher.ts` — gestion du process enfant
- `src/statusBar/ConnectionIndicator.ts` — view-model pur de la barre d'état
- `src/commands/inject.ts` — réducteur d'outcome pour les 4 modes d'injection
- `src/extension.ts` — fine couche d'adaptation VS Code (non testée)

Tous les modules métier sont couverts par des tests Vitest dans
`packages/amspirit-basic/tests/`.

## Roadmap

- [x] Migration pnpm + Biome + TS strict
- [x] Extraction `@amspirit/shared` avec tests
- [x] Réimplémentation TDD de `amspirit-basic` (modules testables, DI)
- [x] Remplacement du package legacy par la version TDD
- [ ] Validation manuelle de bout en bout contre l'émulateur réel
- [ ] Commande « Pull BASIC from Emulator » (`GET /api/basic_export`)
- [ ] Extension `amspirit-debugger` (DAP) — voir [doc/debugger-plan.md](doc/debugger-plan.md)

## License

MIT
