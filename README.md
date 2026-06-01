# WebFilius

**Browser-based network simulation for schools** — collaborative, interactive, zero installation.

> Build network topologies with drag & drop, watch packets travel across OSI layers in real time, and connect classroom networks over the internet. Didactically like Filius, powerful like Cisco Packet Tracer — but entirely in the browser.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite)](https://vite.dev)

---

## Why WebFilius?

| | Filius | Cisco Packet Tracer | **WebFilius** |
|---|---|---|---|
| Installation | Desktop app | Desktop app | **None — browser only** |
| Entry barrier | Low | High | **Low** |
| Protocol depth | Medium | High | **Medium–High** |
| Collaboration | No | No | **Yes — WAN between classrooms** |
| OSI visualization | No | Limited | **Yes (core feature)** |
| License | Open source | Proprietary | **Open source** |

**Target audience:** German-speaking secondary schools (Gymnasium & vocational schools, grades 9–12). The UI is in German; the codebase is in English.

---

## Features

- **Drag & drop topology builder** — PC, Switch, Router, WAN-Cloud nodes on a React Flow canvas
- **Client-side simulation** — ARP, MAC-learning, static routing, DHCP DORA, DNS, ICMP — all runs in the browser, no server round-trip per packet
- **OSI Inspector** — click any packet to see Layer 2–7 broken down with didactic German explanations of every forwarding decision
- **Interactive terminal** (xterm.js) — `ping`, `traceroute`, `ipconfig`, `arp -a`, `nslookup`, `curl` per device
- **WAN collaboration** — students in different classrooms connect their topologies via a shared link token; packets cross the internet in real time
- **Teacher dashboard** — create and manage link tokens, see connected rooms
- **Cloud persistence** — save/load projects via REST API, JWT auth with refresh-token rotation
- **PWA** — installable, works offline for saved projects
- **Dark / light / system theme** — OS-aware, persisted to localStorage
- **Export** — JSON topology, PNG screenshot (2× pixel ratio)
- **Keyboard shortcuts** — Ctrl+Z/Y (undo/redo), Ctrl+S (cloud save), Ctrl+C/V (copy-paste nodes)

---

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/SEOLizer/WebFili.git
cd WebFili
docker compose up
```

Open [http://localhost:5173](http://localhost:5173).

### Local dev servers

**Prerequisites:** Node.js 20+, PostgreSQL 15+, Redis 7+

```bash
# Frontend
cd frontend
npm install
npm run dev          # → http://localhost:5173

# Backend (separate terminal)
cd backend
npm install
cp .env.example .env # set DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET
npx prisma migrate dev
npm run dev          # → http://localhost:3001
```

The Vite dev server proxies `/api` and `/socket.io` to `localhost:3001` automatically.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, TypeScript 6 |
| Canvas | React Flow |
| State | Zustand |
| Styling | Tailwind CSS v4 + Radix UI / shadcn/ui |
| Terminal | xterm.js |
| Backend | Node.js + Express, TypeScript |
| Realtime | Socket.io |
| Database | PostgreSQL 15 (JSONB topologies) |
| ORM | Prisma 7 |
| Cache | Redis 7 |
| Auth | JWT — access token (15 min) + refresh token (7 d) |
| Tests | Vitest (unit), Playwright (E2E) |
| PWA | vite-plugin-pwa + Workbox |
| Container | Docker Compose |

---

## Architecture

All packet processing runs **entirely in the browser**. The Node.js backend is a pure message broker — it knows no network protocols.

```
requestAnimationFrame (~60 fps)
        │
        ▼
simState  ──plain JS object, mutated in place──
        │
        ├──► SVG overlay  (packet animations, no React)
        └──► 150 ms sync ──► Zustand (packetLog, deviceStats)
                                        │
                                        └──► React components re-render
```

The 150 ms decoupling keeps React out of the hot path — 60 fps animation without 60 re-renders per second.

**WAN collaboration flow:**

```
Student A                     Server                  Student B
    │── join_room(token) ───► │ ◄── join_room(token) ──│
    │── wan_packet(frame) ──► │── wan_packet(frame) ──► │
    │◄─ wan_ack(packetId) ─── │                         │
```

Packets leaving a WAN-Cloud node are serialized, rate-limited (50 pkt/s per socket), Zod-validated server-side, and relayed to all peers in the room.

### Project structure

```
webfili/
├── frontend/src/
│   ├── components/
│   │   ├── canvas/       # React Flow: nodes, edges, toolbox
│   │   ├── panels/       # OSI Inspector, Terminal, Device Config, Teacher Dashboard
│   │   └── layout/       # Toolbar, StatusBar
│   ├── engine/           # Pure functions — no store imports
│   │   ├── arp.ts
│   │   ├── routing.ts
│   │   ├── dhcp.ts
│   │   ├── dns.ts
│   │   └── packet.ts
│   ├── simulation/
│   │   ├── loop.ts       # rAF loop, simState, 150 ms sync
│   │   └── simState.ts   # non-reactive state
│   └── stores/           # Zustand — UI state only
├── backend/src/
│   ├── routes/           # auth, projects, links
│   ├── middleware/        # JWT verify, rate limiting
│   ├── websocket/        # Socket.io WAN broker
│   └── prisma/
└── docker-compose.yml
```

---

## Running tests

```bash
# Unit tests (Vitest)
cd frontend
npm run test
npm run test -- --run src/engine/arp.test.ts

# E2E tests (Playwright)
npx playwright test
npx playwright test tests/wan-collaboration.spec.ts
```

---

## Granting teacher role

By default new accounts are `student`. To promote a user to teacher (required for the Teacher Dashboard and link creation):

```sql
UPDATE users SET role = 'teacher' WHERE username = 'your_username';
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Follow the language policy: UI text in **German**, code and comments in **English**
4. Engine functions (`frontend/src/engine/`) must be **pure** — no store imports, no side effects
5. All state structures use `Record<string, X>`, never `Map<string, X>` (JSON serialization)
6. Open a pull request against `main`

---

## License

WebFilius is developed as open-source software for educational institutions.

MIT License — details TBD.
