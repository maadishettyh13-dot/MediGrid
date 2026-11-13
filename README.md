# MediGrid — City Emergency Bed & Patient Transfer Network

MediGrid is an event-driven emergency healthcare coordination platform connecting **42 city hospitals**, **4,284 individual beds** (`ICU`, `VENTILATOR`, `GENERAL`), **22 ambulances**, and a centralized **Emergency Control Room**.

## Runtime Modes

1. **(Node.js + Express + WebSockets + SQLite on Port 3000)**
   - Runs directly in the sandbox environment where standalone Docker, PostgreSQL, Redis, and RabbitMQ daemons are not installed.
   - Executes real relational ACID transactions (`better-sqlite3` with WAL mode, foreign keys, and partial unique indexes), in-process atomic Redis-style reservation locks (`redisCoordinator.ts`) with 15-minute TTL expiry, a durable Transactional Outbox + RabbitMQ-style priority queue / DLQ broker (`rabbitmqBroker.ts`), and 2 stateless load-balanced API nodes (`API Node Alpha` & `API Node Beta`) with WebSocket live broadcasts (`/ws`).
   - All seeded records are explicitly labeled as **synthetic demonstration data**.

2. **Full Docker Reference Stack (`docker-compose.yml` + `fastapi-reference/`)**
   - Ready for local execution with Docker Desktop / Docker Engine:
     - `postgres:16-alpine` (PostgreSQL 16 with `asyncpg` and partial `UNIQUE` constraints)
     - `redis:7-alpine` (Redis Lua `SPOP` + `SET NX EX 900` atomic bed locking)
     - `rabbitmq:3.13-management-alpine` (Durable priority queues with `x-max-priority: 10`, publisher confirms, and Dead-Letter Exchange)
     - `medigrid-api-1` & `medigrid-api-2` (2 FastAPI replicas)
     - `nginx:1.27-alpine` (Load balancer with automatic 5-second upstream failover)

## Project Structure

```
/
├── server.ts                            # Express + WebSocket + Vite entry point (Port 3000)
├── docker-compose.yml                   # Postgres, Redis, RabbitMQ, 2x FastAPI, Nginx stack
├── fastapi-reference/                   # Python FastAPI + asyncpg + Redis Lua + aio-pika service
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── requirements.txt
│   └── app/
│       ├── main.py                      # FastAPI endpoints & 1-second expiry worker
│       ├── database.py                  # asyncpg pool & PostgreSQL DDL
│       ├── redis_coordinator.py         # Atomic Lua reservation + TTL lock script
│       └── rabbitmq_broker.py           # Priority queues, publisher confirms & DLQ
├── server/                              # Live preview backend runtime
│   ├── db/
│   │   ├── database.ts                  # 12-table relational schema + partial UNIQUE indexes
│   │   └── seed.ts                      # Synthetic data (42 hospitals, 4,284 beds, 22 ambulances)
│   ├── infrastructure/
│   │   ├── redisCoordinator.ts          # Per-bed atomic locking, 15m TTL, measured p95 latency
│   │   ├── rabbitmqBroker.ts            # Outbox relay, priority heap, retries, DLQ, 10k backlog test
│   │   └── instanceManager.ts           # Alpha & Beta node round-robin router + failover
│   ├── consumers/                       # Idempotent bed, audit, notification & saga consumers
│   ├── services/                        # Emergency, Transfer Saga, WebSocket & 9 Stress Tests
│   └── routes/api.ts                    # REST API endpoints
└── src/
    ├── types/medilink.ts
    ├── hooks/useMediLinkSocket.ts
    ├── components/                      # Layout, CityMap (Leaflet/OSM), StatusBadge, MetricCard
    └── pages/                           # Login, ControlRoom, HospitalConsole, Dispatch, Transfers, Monitoring, StressTesting, Architecture
```

## Demo Accounts (Password: `demo123`)

| Role | Email | Scope |
|---|---|---|
| Emergency Control Room | `control@medigrid.org` | Full Hyderabad network, monitoring, stress tests, architecture |
| Hospital Staff (Apollo Jubilee Hills) | `staff@apollohyd.medigrid.org` | Apollo Hospitals, Jubilee Hills (`HOSP-01`) beds, admissions, transfers |
| Hospital Staff (KIMS Secunderabad) | `staff@kimshyd.medigrid.org` | KIMS Hospitals, Secunderabad (`HOSP-02`) beds, admissions, transfers |
| Ambulance Dispatcher | `dispatch04@medigrid.org` | Hyderabad 108 Unit `AMB-104` nearest-bed search, holds & transfers |

## Local Execution

### Preview Runtime
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

### Docker Compose Reference Stack (Local Machine)
```bash
docker compose up --build
```
The Nginx load balancer exposes the FastAPI cluster on `http://localhost:8080`, and RabbitMQ Management UI runs on `http://localhost:15672`.
