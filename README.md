# 🪁 Patang Bazi — Multiplayer Kite Fighting

AAA 2D multiplayer kite flying & fighting game built with **PixiJS**, **Colyseus**, and **TypeScript**.

## Architecture

```
patang-bazi/
├── packages/
│   ├── shared/          ← Types, constants, physics (runs on BOTH client & server)
│   │   └── src/
│   │       ├── types/       Game types, network messages, state interfaces
│   │       ├── constants/   Tuning values, physics params, scoring
│   │       └── physics/     Deterministic kite simulation, pench detection
│   │
│   ├── client/          ← PixiJS game client (Vite + TypeScript)
│   │   └── src/
│   │       ├── game/        Core Game class, game loop
│   │       ├── systems/     Input, Sky renderer, future: particles, audio
│   │       ├── network/     Colyseus client, prediction, reconciliation
│   │       ├── scenes/      Start screen, gameplay, game over
│   │       ├── ui/          HUD overlays
│   │       └── assets/      Sprites, audio files
│   │
│   └── server/          ← Colyseus authoritative game server
│       └── src/
│           ├── rooms/       PatangRoom (game logic, physics authority)
│           ├── schemas/     Colyseus state schemas (serialized to clients)
│           └── commands/    Future: room commands pattern
│
├── turbo.json           Turborepo pipeline config
├── tsconfig.base.json   Shared TypeScript config
└── pnpm-workspace.yaml  Workspace definition
```

## Key Design Decisions

### Shared Physics
The kite physics (`stepKite`) runs identically on client and server via `@patang/shared`.
- **Server**: Authoritative simulation, processes player inputs
- **Client**: Prediction (run same physics locally for instant feedback)
- **Reconciliation**: When server state arrives, discard processed inputs, re-simulate pending

### Networking Model
- **Server-authoritative** with client-side prediction
- Clients send **inputs only** (pull, steer) → lightweight messages
- Server broadcasts state at **20Hz**, clients interpolate at **60fps**
- Colyseus handles room management, matchmaking, and delta serialization

### Fixed Timestep
Physics runs at a fixed 60Hz regardless of frame rate:
- `accumulator` pattern in game loop
- Render interpolates between physics frames using `alpha`
- Ensures deterministic simulation across different devices

## Quick Start

```bash
# Install dependencies
pnpm install

# Build shared package first
pnpm --filter @patang/shared build

# Start server (port 2567)
pnpm dev:server

# Start client (port 3000)
pnpm dev:client
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Renderer | PixiJS v8 (WebGPU/WebGL2) |
| Physics | Custom deterministic simulation |
| Game Loop | Fixed timestep (60Hz) + interpolation |
| UI/HUD | HTML overlay (DOM) |
| Multiplayer | Colyseus 0.15 (WebSocket) |
| Serialization | @colyseus/schema (binary delta) |
| Build | Vite + TypeScript |
| Monorepo | pnpm workspaces + Turborepo |

## Next Steps

- [ ] Kite sprite renderer (PixiJS Graphics → sprites)
- [ ] String renderer with catenary physics
- [ ] Star collectible renderer with particle effects
- [ ] Ground/clouds/birds visual layers
- [ ] HUD overlay (score, wind, height)
- [ ] Start screen → lobby → gameplay scene flow
- [ ] Sound system (Howler.js)
- [ ] Progressive pench (string crossing) system
- [ ] Matchmaking lobby UI
- [ ] Mobile touch controls refinement
