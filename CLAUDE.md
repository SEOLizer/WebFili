# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

WebFilius is a **web-based network simulation platform** (Filius meets Cisco Packet Tracer, in the browser). The project is currently in the **planning/greenfield phase** — the `readme.md` is the authoritative spec. All implementation follows that document.

## Development Commands

### Frontend (`frontend/`)
```bash
npm install
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # Production build
npm run test       # Vitest unit tests
npm run test -- --run src/engine/arp.test.ts  # Run single test file
npx playwright test                           # E2E tests
```

### Backend (`backend/`)
```bash
npm install
cp .env.example .env   # Configure PostgreSQL + Redis
npx prisma migrate dev # Run DB migrations
npm run dev            # Express server → http://localhost:3001
```

### Full Stack
```bash
docker compose up      # Frontend + Backend + PostgreSQL + Redis in one command
```

## Architecture

### Key Principle: Client-Side Simulation
All packet processing (ARP, routing, MAC-learning) runs **entirely in the browser**. The Node.js backend only brokers WAN packets between clients via WebSocket rooms. Never move simulation logic to the server.

### Critical: Simulation Loop ≠ React Render Cycle
The simulation loop runs via `requestAnimationFrame` (~60 fps) and mutates a **non-reactive** `simState` plain object directly. Only a 150ms sync pushes UI-relevant state (packet log, device stats) into Zustand. This prevents 60 re-renders/second on all subscribed components.

```
rAF loop → simState (plain JS, mutated in place)
                ├─► SVG/Canvas overlay (packet animations, no React)
                └─► 150ms sync → Zustand (packetLog, deviceStats, activePacketId)
```

### State: Records, not Maps
All state structures use `Record<string, X>` (plain objects with ID as key), never `Map<string, X>`. Maps are not JSON-serializable and break persistence.

### Frontend Architecture

**React Flow** is the canvas engine — custom nodes (PC, Switch, Router, WAN-Cloud) and custom edges (animated packets) sit on top of it. Do not replace React Flow with a raw canvas approach.

**Zustand stores** (`frontend/src/stores/`) — UI state only:
- `topologyStore.ts` — React Flow nodes/edges + device configuration
- `simulationUiStore.ts` — mode (construct/simulate), packetLog, activePacketId
- `authStore.ts` — JWT tokens, user info

**Simulation engine** (`frontend/src/engine/`) contains **pure functions only** — no store imports, no side effects. `simulation/loop.ts` calls them and writes results into `simState`. This is critical for testability.

```
engine/arp.ts       — ARP resolution logic
engine/routing.ts   — Route lookup (longest-prefix-match), TTL decrement
engine/dhcp.ts      — DHCP DORA flow, lease management
engine/dns.ts       — A-record resolution
engine/packet.ts    — Frame construction and forwarding decisions
engine/mac.ts       — MAC learning for switches
```

**Component structure** (`frontend/src/components/`):
- `canvas/` — React Flow nodes, edges, Toolbox sidebar
- `panels/` — OSI Inspector (accordion), Terminal (fake shell in WP3, xterm.js in WP4), Device Config
- `layout/` — Toolbar, StatusBar, resizable panel system (react-resizable-panels)

### Backend Architecture

Express + Socket.io server (`backend/src/`):
- `routes/` — REST endpoints (auth, projects CRUD, virtual links)
- `middleware/` — JWT verification, rate limiting (max 50 packets/s per user)
- `websocket/` — Socket.io room broker for WAN packet relay
- `prisma/` — Schema and migrations

**Database schema** (PostgreSQL via Prisma):
- `users` — id, username, password_hash, role (student/teacher/admin)
- `projects` — id, user_id, name, topology (JSONB — React Flow export format)
- `virtual_links` — link_token (PK), room_name, creator_id, expires_at

Redis is used for session store and real-time state cache only.

### Simulation Data Flow

Packet lifecycle in the store:
1. `sendPacket(deviceId, packet)` → creates frame, triggers ARP if MAC unknown
2. `tick(deltaMs)` (called from `requestAnimationFrame`) → advances all in-flight packets
3. React Flow edges animate packets based on store state
4. Packets accumulate in `packetLog` for the OSI Inspector panel

### WAN Collaboration Flow

1. Teacher creates `linkToken` via `POST /api/links`
2. Student A + Student B each place a WAN-Cloud node and enter the same token
3. Both clients join the same Socket.io room (`join_room`)
4. Packets entering A's WAN-Cloud are serialized and emitted to the room
5. B's store receives the packet via `receive_packet` and injects it locally

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript |
| Canvas/Graph | React Flow |
| State | Zustand |
| Styling | Tailwind CSS v4 + Radix UI / shadcn/ui |
| Terminal | xterm.js |
| Backend | Node.js + Express, TypeScript |
| Realtime | Socket.io |
| Database | PostgreSQL (JSONB) + Redis |
| ORM | Prisma |
| Auth | JWT (access + refresh tokens) |
| Tests | Vitest (unit), Playwright (E2E) |
| Container | Docker Compose |

## Two Modes

The UI has two distinct modes — keep their constraints respected throughout the codebase:

- **Construct mode**: Nodes draggable, edges editable, simulation stopped
- **Simulate mode**: Canvas frozen (`nodesDraggable={false}`, `edgesUpdatable={false}`), packets animate along edges, `tick()` loop running

## Collaboration Model

- **Topology editing is local only** — no shared canvas, no CRDTs. Each student builds their own topology.
- **WAN collaboration = packet exchange only** — packets leaving a WAN-Cloud node are serialized and sent via Socket.io to another client, which injects them into its local simulation.

## Language Policy

- **UI, error messages, OSI inspector texts**: German (target audience: German schools)
- **Code, comments, git history**: English
