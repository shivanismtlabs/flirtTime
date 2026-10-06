# OneVibe

Scalable social platform backend — **Fastify API** + **Socket.IO** (separate processes).

Designed for horizontal scale (stateless API, Redis-backed Socket.IO adapter, module-isolated domains).

## Stack

| Layer | Tech |
|-------|------|
| HTTP API | Fastify 5 |
| Realtime | Socket.IO (own port / process) |
| Database | PostgreSQL + Knex.js |
| Cache / PubSub | Redis (ioredis) |
| Storage | AWS S3 |
| Validation | Zod |
| Auth | JWT access + refresh |
| Logging | Pino |

## Processes

| Process | Port | Command |
|---------|------|---------|
| API | `3000` | `npm run dev:api` |
| Socket.IO | `3001` | `npm run dev:socket` |
| Both | — | `npm run dev` |

API aur Socket **alag ports** par chalte hain taaki realtime traffic HTTP se isolate rahe aur dono independently scale ho saken.

## Project structure

```
onevibe/
├── database/
│   ├── migrations/
│   └── seeds/
├── src/
│   ├── apps/
│   │   ├── api/                 # Fastify HTTP server
│   │   │   └── versions/        # Version-wise API mounts (v1, v2, …)
│   │   └── socket/              # Socket.IO server (separate)
│   ├── modules/
│   │   ├── auth/
│   │   ├── user/
│   │   ├── feed/
│   │   ├── chat/
│   │   ├── media/
│   │   └── notification/
│   └── shared/
│       ├── config/              # Zod-validated env
│       ├── database/            # Knex pool
│       ├── cache/               # Redis
│       ├── storage/             # S3
│       ├── errors/
│       ├── middleware/
│       ├── logger/
│       ├── validation/
│       └── utils/
├── knexfile.ts
├── docker-compose.yml           # Postgres + Redis
└── package.json
```

### API versioning

Versions live under `src/apps/api/versions/`:

```
versions/
├── registry.ts      # v1, v2, v3 (all stable)
├── v1/index.ts
├── v2/index.ts
└── v3/index.ts
```

Enable in `.env` (default: **all stable** versions run):

```env
API_ENABLED_VERSIONS=v1,v2,v3
API_ENABLED_VERSIONS=all
API_DEFAULT_VERSION=v1
```

Discovery: `GET /api` lists versions + enabled flags.

### Module layout (har domain)

```
module/
├── *.routes.ts       # Fastify routes
├── *.controller.ts   # HTTP adapters
├── *.service.ts      # Business logic
├── *.repository.ts   # Knex / DB access
├── *.schema.ts       # Zod schemas
├── *.types.ts        # Domain types
└── index.ts          # Public exports
```

## API routes (v1)

| Module | Prefix |
|--------|--------|
| Auth | `/api/v1/auth` |
| User | `/api/v1/users` |
| Feed | `/api/v1/feed` |
| Chat | `/api/v1/chat` |
| Media | `/api/v1/media` |
| Notification | `/api/v1/notifications` |

Health / discovery:

- API: `GET http://localhost:3000/health`
- Versions: `GET http://localhost:3000/api`
- Socket: `GET http://localhost:3001/health`

## Socket events (skeleton)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `chat:join` / `chat:leave` | client → server | conversation rooms |
| `chat:typing` | bi-directional | typing indicators |
| `chat:message` | bi-directional | message fan-out |
| `notification:ack` | client → server | delivery ack |

Auth: connect with `auth: { token: '<accessJwt>' }` (or `Authorization` header).

Multi-node scale: Socket.IO Redis adapter (`@socket.io/redis-adapter`).

## Quick start

```bash
# 1) Infra
docker compose up -d

# 2) Env
cp .env.example .env
# Edit DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME as needed

# 3) Install
npm install

# 4) Run both processes
npm run dev
```

Migrations (jab schema add karna ho):

```bash
npm run db:migrate
```

## Scale notes (structure readiness)

- **Stateless API** — JWT, no in-memory session store
- **Separate Socket process** — scale WS pods independently
- **Redis adapter** — cross-node socket rooms / pub-sub
- **Connection pooling** — Knex pool mins/maxes via env
- **Cursor pagination** — Feed / Chat list endpoints
- **Rate limiting** — `@fastify/rate-limit` on API
- **S3 presigned uploads** — Media module (no heavy upload via API)

Business logic abhi stub/skeleton hai — pehle structure + wiring ready hai.
