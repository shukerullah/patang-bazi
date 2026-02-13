# 🪁 Patang Bazi

Multiplayer kite fighting game inspired by traditional South Asian kite battles. Fly your kite, catch stars, cross strings with opponents, and cut them down.

## How to Play

- **Pull string** — `SPACE` / `CLICK` / Touch to fly your kite higher
- **Steer** — `← →` or `A D` / Touch left/right zones
- **Catch ⭐ stars** for points
- **Cross strings** with other kites to start a *pench* (string fight) — pull hard to cut their line!

## Tech Stack

| Layer | Tech |
|-------|------|
| Client | PixiJS 8, Vite, TypeScript |
| Server | Colyseus, Express, TypeScript |
| Shared | Physics engine, constants, types |
| Monorepo | pnpm workspaces, Turborepo |

## Project Structure

```
patang-bazi/
├── packages/
│   ├── client/     → Browser game (PixiJS, Vite)
│   ├── server/     → Game server (Colyseus, Express)
│   └── shared/     → Physics, types, constants
├── netlify.toml    → Client deploy config
└── turbo.json      → Build orchestration
```

## Local Development

```bash
# Install dependencies
pnpm install

# Start both client and server
pnpm dev

# Or individually
pnpm dev:server   # → ws://localhost:2567
pnpm dev:client   # → http://localhost:3000
```

## Deployment

**Client** is deployed on [Netlify](https://netlify.com), **Server** on [Render](https://render.com). Both auto-deploy from the `main` branch.

### Netlify (Client)

Config is in `netlify.toml`. Set one environment variable:

| Variable | Value |
|----------|-------|
| `VITE_SERVER_URL` | `wss://your-server.onrender.com` |

### Render (Server)

| Setting | Value |
|---------|-------|
| Root Directory | `packages/server` |
| Build Command | `cd ../.. && pnpm install && pnpm --filter @patang/shared run build && pnpm --filter @patang/server run build` |
| Start Command | `node dist/index.js` |

## Game Features

- Real-time multiplayer with server-authoritative physics
- Pench system — progressive string-crossing battles with sparks and tension meter
- Client-side prediction with server reconciliation
- Procedural audio (wind, string tension, crowd reactions)
- Hot-join — drop into games already in progress
- Responsive design — desktop and mobile touch controls
- Star collectibles with appear/disappear lifecycle
- Manjha (string length) progress bar

## License

MIT
