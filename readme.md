# WebFilius – Webbasierte Netzwerksimulationsplattform

> Didaktisch wie Filius, leistungsfähig wie Cisco Packet Tracer – aber im Browser, kollaborativ und auf dem Stand von 2026.

---

## 1. Vision

WebFilius ist eine **browserbasierte Netzwerksimulationsplattform für Schulen**. Schülerinnen und Schüler bauen per Drag & Drop Netzwerktopologien, senden Pakete durch ihre Netze und sehen in Echtzeit, was auf jeder OSI-Schicht passiert. Klassen verbinden ihre Topologien über das Internet und beobachten, wie ihre Pakete tatsächlich zwischen zwei Browsern fliegen.

**Abgrenzung zu bestehenden Tools:**

| Kriterium | Filius | Cisco PT | WebFilius |
|-----------|--------|----------|-----------|
| Installation | Desktop-App | Desktop-App | Browser, keine Installation |
| Einstiegshürde | Niedrig | Hoch | Niedrig |
| Protokoll-Tiefe | Mittel | Hoch | Mittel–Hoch |
| Kollaboration | Nein | Nein | Ja (WAN zwischen Klassen) |
| OSI-Visualisierung | Nein | Eingeschränkt | Ja (Kernfeature) |
| Lizenz | Open Source | Proprietär | Open Source |

**Zielgruppe:** Gymnasien und berufsbildende Schulen, deutschsprachig, Klassen 9–12.

---

## 2. Architektonische Grundsätze

### 2.1 Client-seitige Simulation

Die gesamte Paketverarbeitung (ARP, MAC-Learning, Routing, DHCP, DNS) läuft **ausschließlich im Browser**. Der Server ist ein purer Nachrichtenbroker – er kennt keine Netzwerkprotokolle.

**Begründung:** Deterministische Simulation, kein Netzwerk-Roundtrip pro Tick, unabhängige Schüler-Sessions, einfache Offline-Nutzung.

### 2.2 Simulation Loop ≠ React-Render-Cycle

Das ist die kritischste Architektur-Entscheidung. Der Simulations-Loop läuft in `requestAnimationFrame` (~60 fps) und mutiert einen **nicht-reaktiven** Simulations-State direkt. React und Zustand werden davon entkoppelt:

```
requestAnimationFrame (~60 fps)
        │
        ▼
simState (plain JS object, direkt mutiert)
  ├─ devices: Record<string, DeviceState>
  ├─ packets: PacketState[]
  ├─ arpTables: Record<string, ArpEntry[]>
  ├─ macTables: Record<string, MacEntry[]>
  └─ routingTables: Record<string, RouteEntry[]>
        │
        ├──► Canvas-Overlay (SVG/Canvas2D)
        │    Paket-Animationen direkt gezeichnet
        │    → kein React-State-Update
        │
        └──► Sync alle ~150ms ──► Zustand (nur UI-relevanter State)
                                    ├─ packetLog (Inspector)
                                    ├─ deviceStats (Statusbar)
                                    └─ activePacketId (Highlight)
```

**Warum:** Würde der tick()-Loop direkt in den Zustand-Store schreiben, hätten alle subscribten React-Komponenten 60 Re-Renders pro Sekunde. Das ist nicht performant.

### 2.3 State-Serialisierung: Records statt Maps

`Map<string, X>` ist nicht JSON-serialisierbar. Alle State-Strukturen verwenden `Record<string, X>` (plain objects mit ID als Key). Das ermöglicht direktes `JSON.stringify()` für Persistierung und vereinfacht Debugging.

### 2.4 Kollaborationsmodell

- **Topologie-Editing:** Lokal. Jeder Schüler baut seine eigene Topologie. Es gibt kein gemeinsames Canvas-Editing (zu komplex, würde CRDTs erfordern).
- **WAN-Kollaboration:** Pakete, die eine WAN-Cloud-Node verlassen, werden via Socket.io an einen anderen Client gesendet und dort in dessen lokale Simulation eingespeist. Die Animation läuft dann auf dem Canvas des Empfängers.

### 2.5 Sprache

UI, Fehlermeldungen und didaktische Texte sind **Deutsch**. Zielgruppe sind deutschsprachige Schulen. Codebase, Kommentare und Git-History sind **Englisch**.

---

## 3. Systemarchitektur

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React 19 + Vite)               │
│                                                             │
│  Toolbox     React Flow Canvas      Panels                  │
│  (Sidebar)   CustomNodes/Edges      ├─ OSI Inspector        │
│              Drag & Drop            ├─ Terminal (xterm.js)  │
│              Zoom, MiniMap          ├─ Device Config        │
│                    │                └─ Lehrer-Dashboard     │
│                    │                                        │
│       ┌────────────▼────────────┐                          │
│       │    Zustand Stores       │  ← UI-State (150ms sync) │
│       │  topology / ui / auth   │                          │
│       └────────────┬────────────┘                          │
│                    │                                        │
│       ┌────────────▼────────────┐                          │
│       │   Simulation Engine     │  ← simState (non-React)  │
│       │   arp / routing / dhcp  │    tick() via rAF        │
│       │   dns / packet          │                          │
│       └─────────────────────────┘                          │
└─────────────────────┬───────────────────────────────────────┘
                      │ REST + WebSocket (Socket.io)
┌─────────────────────▼───────────────────────────────────────┐
│                 BACKEND (Node.js + Express)                  │
│                                                             │
│  REST: Auth, Projects CRUD, Virtual Links                   │
│  WebSocket: WAN-Paket-Broker (Socket.io Rooms)              │
│                                                             │
│  PostgreSQL (users, projects JSONB, virtual_links)          │
│  Redis (Session-Cache, Socket.io Adapter)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Technologie-Stack

| Schicht | Technologie | Begründung |
|---------|-------------|-----------|
| Frontend | React 19 + Vite + TypeScript | Standard 2026, beste HMR, native ESM |
| Canvas | React Flow | Fertige Drag & Drop, Zoom, Custom Nodes/Edges |
| State (UI) | Zustand + subscribeWithSelector | Leicht, TypeScript-first, verhindert Oversubscription |
| Styling | Tailwind CSS v4 + Radix UI / shadcn/ui | Headless, accessible, schnell |
| Terminal | xterm.js | Echte Terminal-Emulation (ab WP 4) |
| Code-Editor | CodeMirror 6 | Für Webserver-HTML-Editor (ab WP 4) |
| Backend | Node.js + Express + TypeScript | Durchgängig TS, hohe I/O-Performance |
| Echtzeit | Socket.io | Rooms, Fallback HTTP-Long-Polling |
| Datenbank | PostgreSQL + Prisma | JSONB für Topologien, typsichere Migrationen |
| Cache | Redis | Socket.io Adapter, Session-Store |
| Auth | JWT (Access + Refresh Token) | Stateless, passt zu SPA |
| Tests | Vitest (Unit), Playwright (E2E) | Vite-nativ, schnell |
| Container | Docker Compose | Ein Befehl für alles |

---

## 5. Datenstrukturen (Kern)

### SimulationState (nicht-reaktiv)

```typescript
// src/engine/types.ts

type DeviceType = 'pc' | 'server' | 'switch' | 'router' | 'wan-cloud';

interface DeviceState {
  id: string;
  type: DeviceType;
  label: string;
  interfaces: Record<string, InterfaceState>;  // port-id → state
  arpTable: ArpEntry[];
  macTable: MacEntry[];       // nur Switch
  routingTable: RouteEntry[]; // nur Router
  services: ServiceState[];   // nur Server/PC
  outgoingQueue: PacketState[];
}

interface PacketState {
  id: string;
  layer2: { srcMac: string; destMac: string; etherType: 'ipv4' | 'arp' };
  layer3?: { srcIp: string; destIp: string; protocol: 'icmp' | 'tcp' | 'udp'; ttl: number };
  layer4And7?: { srcPort?: number; destPort?: number; protocol: 'http' | 'dns' | 'dhcp' | 'icmp'; payload: string };
  status: 'queued' | 'in-transit' | 'received' | 'dropped';
  currentDeviceId: string;
  path: string[];      // Geräte-IDs in Reihenfolge
  dropReason?: string; // didaktischer Text bei 'dropped'
  createdAt: number;
}

// Alles Record<string, X> – kein Map
interface SimulationState {
  devices: Record<string, DeviceState>;
  connections: Record<string, ConnectionState>;
  packets: PacketState[];
}
```

### Zustand Stores (reaktiv, UI-only)

```typescript
// src/stores/topologyStore.ts  – React Flow State + Gerätekonfiguration
// src/stores/simulationUiStore.ts – Modus, Inspector-State, packetLog
// src/stores/authStore.ts  – JWT, User-Info
```

---

## 6. Projektstruktur

```
webfili/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── canvas/        # React Flow: Nodes, Edges, Toolbox
│   │   │   ├── panels/        # OSI-Inspector, Terminal, Device-Config
│   │   │   └── layout/        # Toolbar, StatusBar, Panel-System
│   │   ├── engine/            # Pure functions – kein Store-Import
│   │   │   ├── arp.ts
│   │   │   ├── routing.ts
│   │   │   ├── dhcp.ts
│   │   │   ├── dns.ts
│   │   │   └── packet.ts
│   │   ├── stores/
│   │   │   ├── topologyStore.ts
│   │   │   ├── simulationUiStore.ts
│   │   │   └── authStore.ts
│   │   ├── simulation/
│   │   │   ├── loop.ts        # rAF-Loop, simState, sync zu Zustand
│   │   │   └── simState.ts    # nicht-reaktiver State
│   │   ├── hooks/
│   │   ├── types/
│   │   └── App.tsx
│   ├── vite.config.ts
│   └── tailwind.config.ts
├── backend/
│   ├── src/
│   │   ├── routes/            # auth, projects, links
│   │   ├── middleware/        # JWT-Verify, Rate-Limit
│   │   ├── websocket/         # Socket.io Broker
│   │   ├── services/
│   │   └── index.ts
│   └── prisma/
│       └── schema.prisma
├── docker-compose.yml
└── readme.md
```

**Regel:** `engine/`-Funktionen dürfen **keinen Store importieren**. Sie nehmen State rein, geben neuen State zurück. Der Simulations-Loop ruft sie auf und schreibt Ergebnisse in `simState`.

---

## 7. Datenbankschema

```sql
CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  username    VARCHAR(64) UNIQUE NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role        VARCHAR(16) DEFAULT 'student',  -- student | teacher | admin
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE projects (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  topology    JSONB NOT NULL DEFAULT '{}',   -- React Flow Export + simState-Konfig
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE virtual_links (
  link_token  VARCHAR(64) PRIMARY KEY,
  room_name   VARCHAR(128) NOT NULL,
  creator_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
  max_users   SMALLINT DEFAULT 30,
  expires_at  TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW()
);
```

---

## 8. REST-API

| Endpunkt | Methode | Auth | Beschreibung |
|----------|---------|------|-------------|
| `/api/auth/register` | POST | – | Registrierung |
| `/api/auth/login` | POST | – | Login → JWT |
| `/api/auth/refresh` | POST | Refresh-Token | Access-Token erneuern |
| `/api/projects` | GET | JWT | Eigene Projekte |
| `/api/projects` | POST | JWT | Neues Projekt |
| `/api/projects/:id` | GET/PUT/DELETE | JWT | Projekt verwalten |
| `/api/links` | POST | JWT (teacher) | Neuen Virtual Link erstellen |
| `/api/links` | GET | JWT (teacher) | Eigene Links auflisten |
| `/api/links/:token` | DELETE | JWT (teacher) | Link löschen |

---

## 9. WebSocket-Protokoll (WAN-Broker)

```
Client A                      Server                    Client B
   │                             │                          │
   │── join_room(linkToken) ───► │ ◄── join_room(token) ───│
   │                             │                          │
   │── wan_packet({              │                          │
   │     linkToken,              │                          │
   │     frame: PacketState      │                          │
   │   }) ───────────────────► │                          │
   │                             │── wan_packet(frame) ───► │
   │◄─ wan_ack({packetId}) ──── │                          │
```

**Rate-Limiting:** 50 Pakete/Sekunde pro Socket. Pakete, die dieses Limit überschreiten, werden mit `wan_error` beantwortet, nicht gesilent gedroppt.

**Validierung:** Jedes `frame`-Objekt wird serverseitig gegen ein Zod-Schema validiert, bevor es weitergeleitet wird.

---

## 10. UI-Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [WebFilius]  Datei  Bearbeiten  Ansicht  Simulation  [User] │
├─────────┬──────────────────────────────────┬─────────────────┤
│ Toolbox │                                  │   Rechtes Panel │
│         │      React Flow Canvas           │                 │
│ [🖥 PC]  │                                  │   Tabs:         │
│ [🔄 SW] │   ┌───┐   ┌──────┐              │   OSI-Inspector │
│ [🌐 R]  │   │PC1├───│ SW1  │              │   Terminal      │
│ [☁ WAN] │   └───┘   └──┬───┘              │   Konfiguration │
│         │              │                  │                 │
│         │           ┌──▼───┐              │                 │
│         │           │  R1  │              │                 │
│         │           └──────┘              │                 │
├─────────┴──────────────────────────────────┴─────────────────┤
│ Modus: Konstruktion │ Pakete: 0 │ WAN: – │ [▶ Simulation]   │
└──────────────────────────────────────────────────────────────┘
```

**Panel-System:** `react-resizable-panels` für verstellbare Breiten. Rechtes Panel zeigt kontextabhängig das passende Tab (Doppelklick auf PC → Terminal-Tab; Klick auf Kabel → Inspector-Tab).

---

## 11. OSI-Inspektor (Kernfeature)

Aufklappbares Akkordeon, das ein gefangenes Paket in Schichten zerlegt:

```
┌────────────────────────────────────────┐
│ 📦 Frame #42 — 14:23:05.123           │
├────────────────────────────────────────┤
│ ▼ Layer 2 (Ethernet)                  │
│   Ziel-MAC:   AA:BB:CC:DD:EE:FF       │
│   Quell-MAC:  12:34:56:78:9A:BC       │
│   Typ:        0x0800 (IPv4)           │
│   ✓ Ziel-MAC stimmt mit Interface     │
│     überein – Paket wird an L3        │
│     übergeben.                        │
├────────────────────────────────────────┤
│ ▶ Layer 3 (IPv4)                      │
├────────────────────────────────────────┤
│ ▶ Layer 4 + 7 (ICMP)                  │
└────────────────────────────────────────┘
```

Erklärungstexte sind didaktisch formuliert, auf Deutsch, und erklären **warum** ein Paket weitergeleitet oder verworfen wird.

---

## 12. Arbeitspakete (WPs)

Die WPs sind sequenziell – jedes WP liefert ein lauffähiges, testbares Inkrement.

---

### WP 1 – Foundation: Canvas & Drag & Drop

**Ziel:** Topologien bauen, Geräte verbinden, Zustand lokal speichern.

**Umfang:**
- Vite + React 19 + TypeScript + Tailwind + Zustand Setup
- React Flow Canvas mit Custom Nodes: PC, Switch, Router, WAN-Cloud
- Toolbox Sidebar: Geräte per Drag & Drop auf Canvas ziehen
- Verbindungen: Kabel per Drag zwischen Ports ziehen
- Verbindungsvalidierung (Switch ↔ Switch erlaubt, PC ↔ PC mit Tooltip-Warnung)
- Snap-to-Grid (20px), Auto-Naming (PC-1, SW-1, …)
- Rechtsklick-Kontextmenü (Löschen, Umbenennen)
- Undo/Redo via React Flow `onNodesChange`-History
- Tastatur-Shortcuts: `Entf`, `Strg+Z/Y`, `Strg+A`, `Strg+D`
- Projekt-Speicherung im **localStorage** (kein Backend in WP 1)
- `topologyStore.ts` mit `Record<string, DeviceState>`

**Abnahmekriterium:** Eine PC–Switch–Router–Topologie kann gebaut, benannt, gespeichert und nach Seiten-Reload wiederhergestellt werden.

---

### WP 2 – Simulation Engine: ARP + ICMP + OSI-Inspektor

**Ziel:** Erstes funktionierendes `ping` zwischen zwei PCs, mit vollem OSI-Inspektor.

**Umfang:**
- `simState.ts`: nicht-reaktiver Simulations-State (Records, kein Map)
- `simulation/loop.ts`: rAF-Loop, 150ms-Sync zu `simulationUiStore`
- `engine/packet.ts`: Frame-Konstruktion, Forwarding-Entscheidungen
- `engine/arp.ts`: ARP Request/Reply, ARP-Table-Füllung
- MAC-Learning im Switch (`engine/mac.ts`)
- ICMP Echo Request/Reply
- Canvas-Overlay: Paket-Punkte animiert entlang der Edges (SVG, kein React State)
- Simulations-Modus: Canvas einfrieren (`nodesDraggable={false}`)
- **OSI-Inspektor Panel**: aufklappbares Akkordeon, Layer 2 + 3, deutsche Erklärungstexte
- `packetLog`: letzte 500 Pakete, filterbar nach Gerät / Protokoll

**Abnahmekriterium:** `ping 192.168.1.2` von PC-1 an PC-2 (selbes Subnetz, über Switch) läuft durch. Inspektor zeigt ARP-Ablauf und ICMP-Frames mit deutschen Erklärungen.

---

### WP 3 – Layer 3: Router & Statisches Routing

**Ziel:** Pakete routen zwischen Subnetzen, traceroute funktioniert.

**Umfang:**
- Router-Node mit konfigurierbaren Interfaces (IP + Subnet je Port)
- IP-Konfiguration im Device-Config-Panel (Inline im Panel, kein Modal)
- `engine/routing.ts`: Longest-Prefix-Match, TTL-Dekrement
- ICMP TTL Exceeded (für traceroute)
- Statische Routing-Einträge manuell konfigurierbar
- Routing-Tabelle im Device-Config-Panel (lesen + bearbeiten)
- ARP zwischen Subnetzen über Router (Proxy-ARP nein, Standard-Gateway ja)
- OSI-Inspektor: Layer 3 erweitert (Routing-Entscheidung erklärt)
- Terminal (einfache `<div>`-basierte Fake-Shell, **noch kein xterm.js**):
  - `ping <ip>`
  - `ipconfig` / `ip addr`
  - `arp -a`
  - `traceroute <ip>`

**Abnahmekriterium:** Drei Subnetze (PC-1 → SW-1 → R-1 → SW-2 → PC-2 → R-1 → SW-3 → PC-3), statische Routen, `ping` und `traceroute` funktionieren. Inspektor zeigt TTL-Dekrement.

---

### WP 4 – Applikationsschicht: DHCP, DNS, HTTP, echtes Terminal

**Ziel:** Server-Dienste, vollständige Anwendungsschicht, xterm.js.

**Umfang:**
- Server-Node: Dienste starten/stoppen (DHCP, DNS, HTTP)
- `engine/dhcp.ts`: DORA-Ablauf (Discover, Offer, Request, Ack), Lease-Verwaltung
- `engine/dns.ts`: Einfache A-Record-Auflösung
- HTTP Request/Response Simulation (kein echter HTTP-Stack, simuliert)
- Integierter HTML-Editor für Webserver: **CodeMirror 6** (Syntax-Highlighting)
- **xterm.js** ersetzt Fake-Shell (echte Terminal-Emulation je Gerät)
- Neue Terminal-Befehle: `nslookup`, `curl`, `ssh` (simuliert)
- OSI-Inspektor: Layer 4 + 7 (Ports, Protokoll, Payload)
- Dienste-Manager Panel

**Abnahmekriterium:** PC-1 bezieht per DHCP eine IP, löst per DNS `example.local` auf, macht HTTP-Request an Server – Inspektor zeigt alle 4 Schichten mit deutschen Erklärungen.

---

### WP 5 – Backend: Auth, API, Persistierung

**Ziel:** Projekte in der Cloud speichern, Benutzerkonten.

**Umfang:**
- Node.js + Express + TypeScript Backend-Setup
- PostgreSQL + Prisma: Schema aus §7, erste Migration
- Redis-Setup (Session-Cache)
- JWT Auth: Register, Login, Refresh-Token-Rotation
- REST-Endpunkte gemäß §8
- Frontend: localStorage → API-Persistierung migrieren
- Login/Register-UI (Radix UI Dialog)
- Automatisches Token-Refresh im `authStore`
- Zod-Validierung für alle Request Bodies
- **Docker Compose**: Frontend + Backend + PostgreSQL + Redis

**Abnahmekriterium:** Registrierung, Login, Projekt speichern/laden via API, Token-Refresh funktioniert, `docker compose up` startet alles.

---

### WP 6 – WAN-Kollaboration & Lehrer-Dashboard

**Ziel:** Klassen verbinden ihre Topologien über das Internet.

**Umfang:**
- Socket.io auf dem Backend (Redis-Adapter für Multi-Instance)
- WebSocket-Broker gemäß §9 (join_room, wan_packet, wan_ack, wan_error)
- Rate-Limiting: 50 Pakete/Sekunde pro Socket (serverseitig)
- Zod-Validierung aller eingehenden Frames
- WAN-Cloud-Node im Frontend: Token-Eingabe, Verbindungsstatus (🟢/🔴)
- WAN-Kollaborationsfluss: Paket serialisieren → senden → empfangen → in simState einschleusen
- **Lehrer-Dashboard**: Virtual Links erstellen, Token anzeigen, aktive Räume + User-Anzahl, Link löschen
- Rolle `teacher` kann Links erstellen (JWT-Claim), `student` kann nur joinen
- Playwright E2E-Tests für WAN-Kollaboration (zwei Browser-Instanzen)

**Abnahmekriterium:** Schüler A pingt über eine WAN-Cloud Schüler B an – Paket-Animation läuft auf B's Canvas. Inspektor auf beiden Seiten zeigt korrekte Frames.

---

### WP 7 – Polish, PWA & Performance

**Ziel:** Produktionsreifes Erlebnis.

**Umfang:**
- Dunkelmodus (OS-Setting automatisch, manuell umschaltbar)
- **PWA**: `vite-plugin-pwa`, Service Worker, Offline-Nutzung gespeicherter Projekte
- Export/Import: JSON (Topologie), PNG (Screenshot via `html-to-image`), SVG
- MiniMap (React Flow built-in)
- Gruppen-Selektion + Copy & Paste für Nodes
- Performance-Profiling: Paket-Animation mit > 50 gleichzeitigen Paketen
- Lighthouse-Score ≥ 90 für Performance + Accessibility
- Vollständige Keyboard-Navigation im Panel-System

**Abnahmekriterium:** Lighthouse ≥ 90, 50 gleichzeitige Pakete ohne Frame-Drops, PWA installierbar und offline nutzbar.

---

## 13. Entwicklungs-Setup

```bash
# Frontend
cd frontend
npm install
npm run dev           # http://localhost:5173

# Backend (separates Terminal)
cd backend
npm install
cp .env.example .env  # DATABASE_URL, REDIS_URL, JWT_SECRET setzen
npx prisma migrate dev
npm run dev           # http://localhost:3001

# Alles mit Docker
docker compose up     # Frontend + Backend + PostgreSQL + Redis
```

### Einzelne Tests ausführen

```bash
# Vitest (Unit, aus frontend/)
npm run test
npm run test -- src/engine/arp.test.ts

# Playwright (E2E, aus frontend/)
npx playwright test
npx playwright test tests/wan-collaboration.spec.ts
```

---

## 14. Offene Entscheidungen (Backlog)

Diese Punkte sind bewusst zurückgestellt und bedürfen einer Entscheidung vor Beginn von WP 5+:

| Thema | Optionen | Status |
|-------|----------|--------|
| **Hosting** | Selbst-hosted (Docker), Managed Platform (Render/Railway), öffentliche Demo-Instanz | Offen |
| **i18n** | Nur Deutsch (MVP), später Englisch per i18next | MVP = nur Deutsch |
| **Shared Canvas** | Nicht geplant (zu komplex ohne CRDT) | Explizit ausgeschlossen |
| **IPv6** | Protokollabstraktion vorbereiten, aber IPv4-only im MVP | IPv4-only bis WP 4 |
| **Paket-Capture Export** | `.pcap`-Export für Wireshark (Lerneffekt++) | Backlog post-WP 7 |
| **Mobile** | Nicht adressiert (Canvas + Terminal = Desktop-only) | Explizit ausgeschlossen |

---

## 15. Lizenz

WebFilius wird als Open-Source-Software für Bildungseinrichtungen entwickelt. (Details folgen.)
