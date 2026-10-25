# SyncBoard

SyncBoard is a Kanban board where several people work on the same board at once, with every change synchronized live across their screens and conflicting edits detected instead of silently lost. Clients stay in sync over JWT-authenticated Socket.io rooms, concurrent edits to a card are detected with version-based optimistic concurrency (last-write-wins, with the overwritten user notified), and board reads go through a Redis cache that is invalidated on every write. Presence is derived from room membership with browser-side idle detection, and a Redis adapter lets real-time broadcasts span multiple backend instances. The backend is containerized with Docker and deployed on Render, with the frontend on Vercel.

**[Live demo](https://syncboard-pied.vercel.app)** *(demo video link added once recorded)*

---

## Why this project exists

SyncBoard was built to work through the problems that come up when several people edit the same data at the same time. Three of them shaped most of the design:

- **Simultaneous edits.** When two people edit the same card at nearly the same moment, the server detects it with a version number checked inside a single atomic database update. The later write wins, and the earlier one is never lost silently.
- **Telling someone their change was overwritten.** The affected user gets a live notification if they are online, and a conflict record is stored on the card, so it is visible later even if they were away.
- **Fast reads without stale data.** Board reads are cached in Redis and the cache entry is cleared on every write, so reads stay fast and never lag behind changes.

The conflict handling is covered by automated tests, including one that fires two simultaneous requests at the same card.

## Core features

- **Auth** — JWT-based signup/login, bcrypt password hashing
- **Boards, columns, and cards** — full CRUD, drag-and-drop reordering (including precise drop-position detection, not just "always append")
- **Card details** — labels, due dates, and an assignee picker drawn from the board's actual collaborators
- **Collaborators and invites** — invite teammates onto a board by email. An invite is pending until the invited person accepts or declines it from their boards page; a pending invite grants no access to the board, and only accepted collaborators can view it, receive its live updates, or be assigned cards. Invites arrive live over Socket.io, so they appear on the invitee's boards page without a reload.
- **Presence** — avatars on a board show who is viewing it right now (green dot) and who has it open but is away (hollow ring). Away means no mouse, keyboard, touch or scroll activity for 2 minutes, or the tab is in the background. Someone with the board open in several tabs counts as active if any tab is active.
- **Activity log** — a quiet, collapsed-by-default log on each card tracks who changed what and when, distinct from the conflict-warning indicator (which is reserved specifically for genuine version conflicts, not routine edits)
- **Real-time collaboration** — Socket.io-powered live sync of every card/column change across all connected clients, with room-level authorization (a valid token alone isn't enough — you must actually be a collaborator on that board) and automatic re-sync of full board state on reconnect after a dropped connection
- **Multi-instance ready** — the Socket.io Redis adapter relays broadcasts between backend instances through Redis pub/sub, so real-time sync and presence keep working if the backend runs as more than one process. Verified locally with two separate backend processes sharing one Redis. Production currently runs a single instance, so this is capability rather than something exercised in the live deployment.
- **Conflict resolution** — server-side version tracking, using an atomic database operation rather than a read-then-write pattern (important under genuinely simultaneous requests, not just closely-timed ones), detects when two edits race; the later write always succeeds (last-write-wins), the "losing" user gets a live notification if online, and a persistent conflict record is kept on the card itself so the change is never silently, untraceably lost even if that user was offline at the time
- **Caching** — Redis-backed caching on board reads with automatic invalidation on every write, verified end-to-end (not just assumed to work). Authorization is checked on every board read before the cache is consulted.
- **Rate limiting** — tiered limits (stricter on auth routes, more permissive on general API usage)
- **Automated tests** — Jest + Supertest coverage specifically targeting the conflict-resolution logic, including a regression test for a real bug caught during manual testing, and a dedicated test simulating true concurrency via `Promise.all` to verify simultaneous requests are handled correctly

Three pieces of behavior were decided early in the project's architecture and implemented afterward, in later passes: automatic re-sync after a dropped connection, correct conflict detection under genuinely simultaneous (not just closely-timed) requests, and the invite accept/decline step. The second required moving the conflict-check logic to an atomic database operation, since two truly simultaneous requests could otherwise both read the same version before either wrote - the concurrency test above specifically verifies this is handled correctly.

## Architecture

```
User drags a card (frontend)
      |
      v
Frontend emits a Socket.io event ("card:moved") to backend
      |
      v
Backend checks the user is an authorized collaborator on this board
      |
      v
Backend validates + updates MongoDB (new position, version++)
      |
      v
Backend invalidates the Redis cache entry for that board
      |
      v
Backend broadcasts "card:moved" to every other client in that board's Socket.io room
      |
      v
All connected clients update instantly - no refresh needed
```

REST API reads follow a separate cache-first path:

```
GET /api/boards/:id
      |
      v
Rate limiter checks the request isn't excessive
      |
      v
Check the user is the board's owner or a collaborator
      |
      v
Check Redis - if cached, return immediately
      |
      v
If not cached: fetch from MongoDB -> store in Redis (60s TTL) -> return
```

Sockets also join a personal room keyed to their own user id, used for events addressed to one person rather than a board - for example, an invite for a board they cannot access yet. With the Redis adapter attached, both board rooms and personal rooms work across backend instances.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React (Vite), `@dnd-kit` for drag-and-drop |
| Backend | Node.js, Express, Docker |
| Real-time | Socket.io, `@socket.io/redis-adapter` |
| Database | MongoDB Atlas |
| Caching | Redis (Docker Compose locally; Upstash in production) |
| Auth | JWT + bcrypt |
| Testing | Jest, Supertest, `mongodb-memory-server` |
| Rate limiting | `express-rate-limit` |

## Getting started

### Prerequisites
- Node.js (v18+)
- Docker Desktop (for local Redis)
- A MongoDB Atlas connection string

### 1. Clone and start local infrastructure
```bash
git clone https://github.com/karanmakasana285/syncboard.git
cd syncboard
docker-compose up -d
```
This starts a local Redis container (port 6379).

### 2. Backend setup
```bash
cd backend
npm install
cp .env.example .env
# fill in MONGODB_URI, JWT_SECRET, PORT in .env
npm run dev
```

### 3. Frontend setup
```bash
cd frontend
npm install
npm run dev
```

Visit the printed local URL (typically `http://localhost:5173`).

### 4. Run tests
```bash
cd backend
npm test
```

## Known limitations (by design, not oversight)

- **Same-field conflicts are not merged.** If two users edit the exact same field at nearly the same moment, the later write wins outright — there's no field-level merge or operational-transform logic (the much harder approach tools like Google Docs use). This was a deliberate simplicity tradeoff for this project's scope.
- **Conflict notifications broadcast to the whole board room**, filtered client-side to only display for the affected user's open card. This is fine given the trust model (board collaborators already see all board activity) but wouldn't be appropriate in a system with per-user-private cards.
- **JWT is stored in `localStorage`**, not an httpOnly cookie — simpler for this project's scope, at the cost of theoretical XSS exposure a cookie-based approach would avoid.
- **Invites only work for people who already have an account.** Inviting an email with no account is rejected rather than held until they sign up.
- **Presence is as fresh as the socket connection.** A tab closed normally disappears from presence immediately, but a hard network drop is only noticed once Socket.io's heartbeat times out (around 45 seconds).
- **The Redis adapter is not exercised in production.** The live deployment runs a single backend instance; running more would also need a hosting tier that supports scaling.

## What I'd build next

- Column-level activity logging (cards already have a per-card activity log; columns don't yet)
- Field-level conflict detection instead of version-level, to narrow the blast radius of a race further
- Holding invites for people who haven't signed up yet

## Deployment

Deployed live: Vercel (frontend), Render (backend, containerized and deployed via Docker), MongoDB Atlas (database), Upstash (Redis). CORS is locked to the deployed frontend's exact origin in production; local development still allows all origins for convenience.

## Project structure

```
syncboard/
  backend/
    app.js            - Express app setup (importable for tests)
    server.js          - real entry point (DB/Redis connect + listen)
    Dockerfile          - production container image
    models/             - Mongoose schemas (User, Board, Column, Card)
    routes/              - REST endpoints
    socket/               - Socket.io server, room auth, presence, Redis adapter
    middleware/            - JWT auth, rate limiting
    utils/                   - shared authorization helper
    tests/                    - Jest/Supertest suite
  frontend/
    src/
      pages/                    - route-level components
      components/                - reusable UI (Card, Column, modals)
      context/                     - auth state
      api/                          - axios client
      socket/                        - socket connection helper
      utils/                          - idle detection for presence
  docker-compose.yml               - local Redis
```