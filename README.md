# MediGrid — City Emergency Bed & Patient Transfer Network

MediGrid is an event-driven emergency healthcare coordination platform connecting **42 city hospitals**, **4,284 individual beds** (`ICU`, `VENTILATOR`, `GENERAL`), **22 ambulances**, and a centralized **Emergency Control Room**.

## Runtime Modes

1. **(Node.js + Express + WebSockets + SQLite on Port 3000)**
   - Runs directly in the sandbox environment where standalone Docker, PostgreSQL, Redis, and RabbitMQ daemons are not installed.
   - Executes real relational ACID transactions (`better-sqlite3` with WAL mode, foreign keys, and partial unique indexes), in-process atomic Redis-style reservation locks (`redisCoordinator.ts`) with 15-minute TTL expiry, a durable Transactional Outbox + RabbitMQ-style priority queue / DLQ broker (`rabbitmqBroker.ts`), and 2 stateless load-balanced API nodes (`API Node Alpha` & `API Node Beta`) with WebSocket live broadcasts (`/ws`).
   - All seeded records are explicitly labeled as **synthetic demonstration data**.
   - 
2. Backend Reference Architecture (Local Execution)

- Designed for local execution without Docker Desktop or Docker Engine.
- Backend services can be installed and configured individually:
  - **PostgreSQL 16** – Relational database for persistent storage, supporting `asyncpg` and partial `UNIQUE` constraints.
  - **Redis 7** – In-memory data store for caching and atomic bed-locking operations using Redis Lua scripts, `SPOP`, and `SET NX EX 900`.
  - **RabbitMQ 3.13** – Message broker supporting durable priority queues (`x-max-priority: 10`), publisher confirms, and Dead-Letter Exchange.
  - **FastAPI** – Backend API for application logic, request handling, and database integration.
  - **Nginx** – Reverse proxy and load balancer for distributing requests across multiple API instances, with upstream failover configuration.

- Services are started and managed individually in the local development environment.
- Multiple FastAPI instances can be configured for load balancing if required.
- Database, caching, messaging, and API services communicate through their respective local configurations.

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


