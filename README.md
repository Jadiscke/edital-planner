# Planejador de Editais

**Turn an exam notice into a traceable, adaptive study plan.**

Planejador de Editais is a web platform for candidates preparing for Brazilian public-service exams. It transforms an official exam notice (*edital*) and the indexes of the candidate's study materials into a structured map of what must be studied, where each topic is covered, and how to distribute that work across successive weeks.

Instead of treating AI output as an answer to trust blindly, the product keeps the source evidence, confidence, review status, document version, and model run behind every suggestion. The resulting plan remains explainable: each task can be traced from an edital topic to an approved material and exact page range.

> **Project status:** active development. The repository contains the product foundation and the first authenticated project experience; the complete workflow described below is the target MVP, not a claim that every capability is already available. The canonical product specification is [`docs/product/visao-escopo-arquitetura-fonte.md`](docs/product/visao-escopo-arquitetura-fonte.md) (version 0.7, conception status).

## The problem

Exam notices are long, inconsistent, and vary widely in detail. Candidates usually have to interpret the syllabus manually, break it into studyable subjects, search across many course PDFs, estimate the effort, and continually rebuild a schedule as their real pace changes.

Planejador de Editais is designed to replace that fragmented work with one reviewable system of record:

- a normalized syllabus that preserves the original wording and source location;
- a many-to-many map between syllabus items and material page ranges;
- visible coverage, gaps, ambiguity, and confidence;
- a complete backlog of theory, review, and exercise tasks;
- weekly capacity planning based on the candidate's available time;
- execution data that improves future estimates without rewriting history.

## Intended user journey

```mermaid
flowchart LR
    A["Choose or upload an edital"] --> B["Review the verticalized syllabus"]
    B --> C["Add material indexes"]
    C --> D["Review topic-to-page mappings"]
    D --> E["Configure weekly capacity"]
    E --> F["Generate the complete backlog"]
    F --> G["Study week by week"]
    G --> H["Recalibrate future work"]
    H --> I["Complete or create a new cycle"]
```

1. **Choose the edital.** Select an existing verticalized notice or upload a new PDF.
2. **Review the syllabus.** Multimodal extraction proposes a hierarchy of subjects, topics, and subtopics, preserving original text and evidence.
3. **Add study materials.** Upload only a PDF, photo, or screenshot of each material's index; the complete copyrighted course PDF is not required.
4. **Approve mappings.** Review suggested relationships between syllabus subtopics and material page ranges, especially low-confidence or partial matches.
5. **Configure the plan.** Set weekly study hours, pages per hour, subject priorities, and a target task duration of 15, 30, 45, 60, or 90 minutes.
6. **Generate the backlog.** Create every theory block needed to cover the approved pages, followed by review and exercise tasks.
7. **Work through weekly cycles.** Execute tasks with Pomodoro, a continuous timer, or a manual time entry.
8. **Adapt safely.** Move unfinished work forward and recalibrate only unstarted tasks and future weeks, preserving completed work and historical measurements.

## How planning works

Theory work is estimated in **pages per hour**, never words per minute:

```text
pages per theory task = pages per hour × target task minutes ÷ 60
weekly task capacity  = available weekly minutes ÷ target task minutes
estimated weeks       = ceil(total planned minutes ÷ available weekly minutes)
```

A subtopic may produce as many sequential theory blocks as necessary to cover its approved material ranges. Its dependency chain is:

```text
theory 1 → theory 2 → ... → theory N → review → exercises
```

Review remains locked until all approved theory pages are completed. Exercise results can record correct, incorrect, void, and unanswered questions as well as time spent. Weekly closure is intended to update subject-specific reading rates and forecasts while leaving completed tasks untouched.

## Product principles

- **Evidence before automation:** every extraction or association points to its source document version and location.
- **Human review is part of the workflow:** suggestions can be approved, corrected, rejected, or marked for further review.
- **No invented coverage:** missing material stays visible as a gap; confidence never replaces evidence.
- **The past is immutable:** replanning changes future work, not completed tasks or recorded sessions.
- **Access is deterministic:** AI never decides authorization, billing, retention, or entitlements.
- **Failures are recoverable:** processing jobs are designed to be versioned, idempotent, auditable, and replayable.
- **Metrics must be explainable:** measured, manually entered, estimated, and imported data remain distinguishable.
- **Privacy is the default:** benchmarking requires separate consent and sufficiently large, anonymous cohorts.

## MVP scope

The target MVP includes:

- authentication and one or more projects organized by exam;
- upload and versioning of exam notices;
- multimodal syllabus extraction and an editable hierarchy;
- study-material registration using index pages only;
- extraction of index hierarchy and page ranges;
- evidence-backed mapping suggestions with confidence and rationale;
- human review queues and coverage views;
- CSV or JSON export and basic processing history;
- generation of theory, review, and exercise tasks;
- capacity-based weekly planning and completion forecasts;
- Pomodoro, continuous timer, and manual execution records;
- weekly performance closure and future-only recalibration;
- secure recurring subscriptions enforced through backend entitlements;
- LGPD-aware data governance, access, export, and deletion workflows.

Explicitly outside the MVP:

- reading and summarizing every page of every course PDF;
- publicly distributing copyrighted study materials;
- fixed day-by-day calendar scheduling or automatic calendar integration;
- a built-in question bank, mock exams, or native mobile applications;
- automating login, purchase, or downloads from third-party platforms.

## Current implementation

The repository currently provides the foundations for the larger product:

| Area | Available today |
| --- | --- |
| Public experience | Static Astro marketing site with an accessible editorial design |
| Product application | React/Vite account and first-project experience |
| API | NestJS/Fastify project and edital operations, OpenAPI contract, PostgreSQL persistence, and tenant authorization |
| Authentication | Standards-based OIDC backend-for-frontend flow with server-side, revocable sessions |
| Documents | Private S3-compatible upload, immutable versions, Redis/BullMQ jobs, recoverable worker states, and status UI |
| Domain | Project and document rules, shared Zod contracts, idempotency, and tenant isolation |
| AI | Structured edital verticalization, material-index extraction, and mapping suggestions through OpenRouter |
| Validation | Unit, contract, HTTP, UI, integration, journey, and optional live-provider tests |

Document extraction/verticalization after the upload worker, the full review workflow, study-plan generator, task execution, analytics, benchmarking, billing, and privacy portals remain roadmap work unless represented by newer code or decision records.

## Repository structure

```text
apps/
  api/        NestJS API using Fastify, PostgreSQL, Drizzle, and OIDC
  marketing/  Static Astro marketing site
  web/        React and Vite product application
packages/
  ai/         OpenRouter integration and structured AI workflows
  contracts/  Shared API schemas and OpenAPI contracts
  domain/     Domain models and application rules
docs/
  adr/        Architecture decision records
  product/    Product vision and source requirements
  security/   Technology and vulnerability review
  system-design/ Navigable architecture overview
tests/        Repository-level contract and documentation tests
```

This is a TypeScript monorepo managed with pnpm workspaces.

## Architecture

The implemented foundation uses:

- Astro for the static public site;
- React 19 and Vite for the product application;
- NestJS with Fastify for the API;
- PostgreSQL and Drizzle ORM for persistence and reviewed SQL migrations;
- standards-based OIDC with a backend-for-frontend session flow;
- OpenRouter as the single AI gateway;
- versioned Zod and JSON Schema contracts at trust boundaries.

The target architecture adds isolated object storage, secure upload quarantine, asynchronous processing workers, semantic matching, planning and execution services, observability, audit trails, privacy governance, and billing/entitlement boundaries.

Authentication tokens are kept out of browser JavaScript. The API exchanges the OIDC authorization code, stores server-side sessions, and gives the browser an opaque `HttpOnly` cookie. Mutating cookie-authenticated requests are protected with an explicit origin allowlist. Tenant membership is resolved on the server for every protected project operation.

AI processing follows separate extraction, normalization, and matching stages. Model responses use strict schemas, are validated again before reaching the domain, and include audit metadata such as the resolved model, prompt version, usage, cost, and duration. The product treats document contents as untrusted input and does not give models authority over persistent business decisions.

## Getting started

### Prerequisites

- Node.js 24.18.0 or newer in the Node 24 LTS line
- pnpm 9.1.1
- PostgreSQL 17.10+ or 18.4+
- Redis on a currently supported, patched release
- private S3-compatible object storage
- an OpenID Connect provider for authenticated API development
- an OpenRouter API key for live AI operations

### Install and configure

```bash
pnpm install
cp .env.example .env
```

Update `.env` for your local services. At minimum, API development requires:

- `DATABASE_URL`: runtime PostgreSQL role with DML permissions only;
- `DDL_DATABASE_URL`: separate PostgreSQL role allowed to run migrations;
- `REDIS_URL`: dedicated BullMQ Redis connection (`rediss://` is required in production);
- `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_DOCUMENT_BUCKET`;
- `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_CLIENT_ID`, and `OIDC_CALLBACK_URL`;
- the remaining OIDC security settings documented in `.env.example`.

The API deliberately refuses to start if the runtime database role can create objects in the `public` schema. See [`docs/authentication.md`](docs/authentication.md) for database-role and OIDC requirements.

Run the migrations:

```bash
pnpm --filter @planejador/api migrate
```

### Run the applications

Start the API, document worker, product application, and marketing site in separate terminals:

```bash
pnpm dev:api
```

```bash
pnpm --filter @planejador/api dev:worker
```

```bash
pnpm dev:web
```

```bash
pnpm --filter @planejador/marketing dev
```

The API listens on `http://127.0.0.1:3001` by default. The marketing server exposes the public landing page at `http://127.0.0.1:4173/` and proxies the product application under `http://127.0.0.1:4173/app/`; all application routes and authentication redirects must remain inside `/app/*`. During development, the web application uses the local API address unless `VITE_API_URL` is configured.

## AI workflows

All model inference goes through OpenRouter; the project does not call model providers directly. Configure `OPENROUTER_API_KEY`, the primary model, and any fallbacks in `.env`.

Check the configuration without printing the API key:

```bash
pnpm ai:check
```

Run the structured workflows:

```bash
pnpm ai:verticalize ./input-verticalization.json
pnpm ai:extract-index ./input-material-index.json
pnpm ai:associate ./input-association.json
```

See [`packages/ai/README.md`](packages/ai/README.md) for input contracts, privacy defaults, audit output, and live-test options.

## Quality checks

```bash
pnpm test             # Complete default test suite
pnpm typecheck        # Type-check the workspace
pnpm test:ai          # Local AI contract tests
pnpm test:marketing   # Marketing static and journey tests
pnpm test:e2e         # Product Playwright tests
```

The PostgreSQL, Redis/BullMQ, and S3-compatible MinIO integration tests use Testcontainers and require Docker. The default API test command runs them whenever Docker is available and requires Docker in CI:

```bash
pnpm --filter @planejador/api test
```

Live OpenRouter tests are opt-in. One checks the real HTTP authentication contract using an intentionally invalid credential at no model cost; the paid smoke test requires a valid key. Read the AI package README before enabling either one.

## Roadmap

The source product plan groups delivery into four phases:

1. **Discovery:** select representative editais and material indexes, define schemas, and validate multimodal extraction.
2. **Technical MVP:** deliver authentication, edital and material workflows, reviewed mappings, coverage, weekly planning, timers, manual execution, subscriptions, and minimum LGPD controls.
3. **Quality and operations:** add evaluation, version comparison, cost monitoring, weekly recalibration, individual analytics, stronger account security, auditing, reconciliation, and tested recovery.
4. **Expansion:** add recurring maintenance plans, question-bank integrations, privacy-preserving cohort benchmarks, institutional plans, and mature compliance operations.

Open product decisions—including default reading speed, review intervals, task rounding, payment provider, plan limits, retention, recovery objectives, and benchmarking thresholds—remain documented in the source specification and should be resolved through explicit product or architecture decisions.

## Documentation

- [`CONTEXT.md`](CONTEXT.md) — domain language and invariants
- [`docs/product/visao-escopo-arquitetura-fonte.md`](docs/product/visao-escopo-arquitetura-fonte.md) — complete product vision, 94 functional requirements, user journey, and target architecture
- [`docs/authentication.md`](docs/authentication.md) — OIDC and session architecture
- [`docs/adr/0001-stack-tecnologica-inicial.md`](docs/adr/0001-stack-tecnologica-inicial.md) — initial technology choices
- [`docs/adr/0002-openrouter-como-gateway-de-ia.md`](docs/adr/0002-openrouter-como-gateway-de-ia.md) — OpenRouter gateway decision
- [`docs/adr/0003-landing-na-raiz-e-aplicacao-em-app.md`](docs/adr/0003-landing-na-raiz-e-aplicacao-em-app.md) — public landing and `/app/*` routing boundary
- [`docs/security/technology-vulnerability-review.md`](docs/security/technology-vulnerability-review.md) — security review and supported-version floors
- [`docs/system-design/index.html`](docs/system-design/index.html) — navigable system-design overview

## Contributing

Keep changes aligned with the domain principles in `CONTEXT.md`. Preserve evidence and versioning boundaries, validate all external inputs, and record material architectural decisions in `docs/adr`. Before opening a change, run the relevant tests and `pnpm typecheck`.

This repository does not currently declare an open-source license. Unless a license is added, the code remains under its default copyright restrictions.
