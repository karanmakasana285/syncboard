# SyncBoard

A real-time collaborative Kanban board — built to explore the engineering problems that separate a CRUD app from a genuinely multi-user product: live synchronization across clients, conflict resolution when edits race each other, and the caching/rate-limiting layer a real API needs at scale.

**[Live demo](https://syncboard-pied.vercel.app)** *(demo video link added once recorded)*

Note: the backend runs on Render's free tier, which spins down after periods of inactivity - the first request after idle time may take 30-60 seconds to wake up.

---

## Why this project exists

Most portfolio Kanban boards are just CRUD with drag-and-drop. SyncBoard is intentionally built around the parts that are *hard* precisely because multiple people can touch the same data at the same time:

- What happens when two people edit the same card within milliseconds of each other?
- How do you tell a user their change was overwritten, including if they weren't even looking at the screen when it happened?
- How do you keep a read-heavy API fast without serving stale data the moment something changes?

This project answers each of those with a real, tested implementation — not just a diagram.

## Core features

- **Auth** — JWT-based signup/login, bcrypt password hashing
- **Boards, columns, and cards** — full CRUD, drag-and-drop reordering (including precise drop-position detection, not just "always append")
- **Card details** — labels, due dates, and an assignee picker drawn from the board's actual collaborators
- **Collaborators** — invite teammates onto a board by email; a quiet, collapsed-by-default activity log on each card tracks who changed what and when, distinct from the conflict-warning indicator (which is reserved specifically for genuine version conflicts, not routine edits)
- **Real-time collaboration** — Socket.io-powered live sync of every card/column change across all connected clients, with room-level authorization (a valid token alone isn't enough — you must actually be a collaborator on that board) and automatic re-sync of full board state on reconnect after a dropped connection
- **Conflict resolution** — server-side version tracking, using an atomic database operation rather than a read-then-write pattern (important under genuinely simultaneous requests, not just closely-timed ones), detects when two edits race; the later write always succeeds (last-write-wins), the "losing" user gets a live notification if online, and a persistent conflict record is kept on the card itself so the change is never silently, untraceably lost even if that user was offline at the time
- **Caching** — Redis-backed caching on board reads with automatic invalidation on every write, verified end-to-end (not just assumed to work)
- **Rate limiting** — tiered limits (stricter on auth routes, more permissive on general API usage)
- **Automated tests** — Jest + Supertest coverage specifically targeting the conflict-resolution logic, including a regression test for a real bug caught during manual testing, and a dedicated test simulating true concurrency via `Promise.all` to verify simultaneous requests are handled correctly

Two pieces of behavior were decided early in the project's architecture and implemented afterward, in a later review pass: automatic re-sync after a dropped connection, and correct conflict detection under genuinely simultaneous (not just closely-timed) requests. The latter required moving the conflict-check logic to an atomic database operation, since two truly simultaneous requests could otherwise both read the same version before either wrote - the new concurrency test above specifically verifies this is handled correctly.

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
Check Redis - if cached, return immediately
      |
      v
If not cached: fetch from MongoDB -> store in Redis (60s TTL) -> return
```

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React (Vite), `@dnd-kit` for drag-and-drop |
| Backend | Node.js, Express |
| Real-time | Socket.io |
| Database | MongoDB (Atlas in production; Docker Compose for local dev) |
| Caching | Redis (Docker Compose locally; Upstash in production) |
| Auth | JWT + bcrypt |
| Testing | Jest, Supertest, `mongodb-memory-server` |
| Rate limiting | `express-rate-limit` |

## Getting started

### Prerequisites
- Node.js (v18+)
- Docker Desktop (for local MongoDB + Redis)
- A MongoDB Atlas connection string (or use the Docker MongoDB instance for fully offline dev)

### 1. Clone and start local infrastructure
```bash
git clone https://github.com/karanmakasana285/syncboard.git
cd syncboard
docker-compose up -d
```
This starts local MongoDB (port 27017) and Redis (port 6379) containers.

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
- **Board invites are instant, with no accept/decline step.** Inviting someone by email adds them to the board immediately. Since board membership is persistent (not a one-time share), a real accept/decline flow - closer to how GitHub or Slack handle workspace invites - would be the more correct design; noted here as a deliberate, tracked simplification rather than an oversight.

## What I'd build next

- Invite accept/decline flow, replacing the current instant-add model
- Presence indicators (who's currently viewing/editing a board)
- Column-level activity logging (cards already have a per-card activity log; columns don't yet)
- Field-level conflict detection instead of version-level, to narrow the blast radius of a race further

## Deployment

Deployed live: Vercel (frontend), Render (backend), MongoDB Atlas (database), Upstash (Redis). CORS is locked to the deployed frontend's exact origin in production; local development still allows all origins for convenience.

## Project structure

```
syncboard/
  backend/
    app.js            - Express app setup (importable for tests)
    server.js          - real entry point (DB/Redis connect + listen)
    models/             - Mongoose schemas (User, Board, Column, Card)
    routes/              - REST endpoints
    socket/               - Socket.io server + room auth
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
  docker-compose.yml               - local MongoDB + Redis
```