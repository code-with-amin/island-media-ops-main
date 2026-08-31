# Island Media Co — connected advertising operations prototype

A prototype for a fictional Jersey out-of-home advertising agency, built for the
Frameworks technical assessment. One operating model behind three interfaces:

| Surface | Route | Built for |
|---|---|---|
| Public catalogue | `/` | A visitor choosing media for a set of dates |
| Client portal | `/portal` | An account holder, with or without a contract |
| Management | `/manage` | The agency, on a desktop |
| Field app | `/field` | A fitter, on a phone |

Everything is fictional. There is no real client data, no credentials and no
production system access in this repository.

---

## Quick start

Requires Node 22 or later. No database server, no Docker, no accounts.

```bash
npm install          # also generates the Prisma client
npm run setup        # creates .env, applies the schema, seeds the fixtures
npm run dev          # http://localhost:3000
```

Then use the **account switcher in the top right** to move between roles. It is
deliberately conspicuous: it stands in for authentication, which the brief
excludes.

### Prototype accounts

| Account | Role | What they can show you |
|---|---|---|
| Morgan Reed | manager | The whole agency: requests, contracts, field work, inventory |
| Casey Morgan | fitter | One assigned installation, on a phone-sized screen |
| Avery Stone | client · Silverline Fitness | **A client with no contracts** and one open enquiry |
| Jordan Ellis | client · Lighthouse Learning | **An issued contract awaiting a decision** |
| Taylor Quinn | client · Oak Legal | **An active contract** with a campaign and scheduled work |

New client registration works and persists: `/register`, or "Create an account"
from any product page while signed out.

To put the demo back to a known state, run `npm run db:reset`, or POST to
`/api/dev/reset` from the running app.

---

## Commands

| Command | What it does |
|---|---|
| `npm run setup` | First-run: `.env`, migrations, seed |
| `npm run dev` | Development server |
| `npm run build` | Production build (generates the Prisma client first) |
| `npm run start` | Serve the production build |
| `npm run db:migrate` | Apply committed migrations (same command CI and a deploy use) |
| `npm run db:migrate:new` | Create a migration after changing `schema.prisma` |
| `npm run db:reset` | Apply migrations, then reseed to the exact fixture state |
| `npm run db:remote` | Apply migrations and seed the deployed preview's database |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 205 unit and integration tests (Vitest) |
| `npm run test:e2e` | 11 browser steps of the connected journey (Playwright) |
| `npm run test:all` | Both, in order — **the command to run** |

`npm run test:e2e` starts a dev server itself if one is not already running.
It needs a browser once: `npx playwright install chromium`.

---

## Architecture

```
src/
  app/
    (public)/      catalogue, product detail, registration
    portal/        client account
    manage/        management desktop
    field/         fitter mobile
    api/           route handlers mirroring api/openapi.yaml
  domain/          pure functions, zero I/O — the business rules
  server/          Prisma, session, services (orchestration)
  ui/              tokens, primitives, three layout shells
prisma/            schema, migrations and the deterministic seed
tests/             integration tests and the connected journey
```

Two rules give this its shape.

**`src/domain` imports nothing from `src/server` or Prisma.** Every business
rule is a pure function over plain data, which is why nine of the ten required
checks are fast unit tests rather than end-to-end runs, and why the seeded
scenarios are reproducible without a database.

**No page reads Prisma directly.** Client components call the API; server
components call the same service functions the API calls. That boundary is what
makes "three interfaces, one operating model" structurally true rather than a
claim.

### The domain layer

| Module | Owns |
|---|---|
| `dates.ts` | Half-open `[start, end)` comparison |
| `availability.ts` | Exclusive-asset and capacity-pool availability |
| `rates.ts` | Display label, budget-filter eligibility |
| `contract.ts` | Contract lifecycle and actor rules |
| `workOrder.ts` | Work-order lifecycle and its guards |
| `clock.ts` | The fixture clock — nothing calls `Date.now()` directly |

### Data model

Product, physical asset, capacity pool, booking, contract, campaign and work
order are separate records, per the brief's explicit rule against collapsing
them.

- A **product** is what is sold. A **physical asset** is the named bus panel,
  door, screen or van that delivers it. A **capacity pool** is shared capacity
  such as a digital loop.
- A **booking request** is a non-binding enquiry. A **contract** is the
  agreement. A **campaign** is the delivery of an accepted contract. A
  **booking** is the inventory actually consumed, created only on acceptance.
- A **work order** is one visit. **Proof records** attach to it. **Service
  events** are the safe, client-visible summary of what happened.

Two infrastructure tables support the rules rather than the business:

- `HistoryEvent` — one audit table for every entity that records material
  change, so "actor, time, action, note" is enforced in one place rather than
  duplicated across six models.
- `IdempotencyRecord` — unique on `(scope, key)`, making repeated material
  creates safe.

### Persistence

SQLite through Prisma, in a local file. The deployed preview points at
**Turso** — hosted libSQL, which is SQLite — because a serverless filesystem is
read-only and its `/tmp` is wiped between instances, so contracts a reviewer
accepted would vanish. Turso was chosen over Postgres precisely to keep this
simple: the schema, the migrations and the local workflow are identical either
way, and only the connection changes. Nothing here requires a database server
or an account to run locally. Account registration, requests,
contracts, work-order status and proof all survive a reload and a restart.

The **prototype shortcut**: proof files are stored inline in the database as
size-capped base64 data URLs and served by a route that checks organisation
ownership. The access rule is real; the storage is not what production would
do. See the productionisation note.

---

## Business rules and where they live

| Rule | Enforced in |
|---|---|
| Half-open date ranges | `domain/dates.ts` |
| A request must end after it starts | `domain/dates.ts`, checked at every entry point |
| Exclusive asset free of booking, active hold and outage | `domain/availability.ts` |
| Capacity pool measured at **peak** concurrent usage | `domain/availability.ts` |
| An expired hold does not block | `domain/availability.ts` |
| Server rechecks availability on approval and acceptance | `services/management.ts`, `services/clientPortal.ts` — **inside the transaction** |
| Native rate label displayed; monthly equivalent only for budget | `domain/rates.ts` |
| Null price is "Price on request", never zero, never within budget | `domain/rates.ts` |
| Contract lifecycle and version discipline | `domain/contract.ts` |
| Blocked needs a reason; completed needs a note and proof | `domain/workOrder.ts` |
| Client queries scoped to one organisation | `services/clientPortal.ts` — `organisationId` is a required argument |
| Idempotency on material creates | `server/idempotency.ts` |
| One live contract per booking request | `services/management.ts` |
| A revised contract is a new version, rechecked against inventory | `services/management.ts` |

Three of these are worth calling out.

**The capacity pool uses a sweep line, not a sum.** Summing the units of every
overlapping booking is the obvious implementation and it is wrong: two bookings
that never coincide get counted together and the pool is reported fuller than it
is. On the seeded data both approaches happen to return 4, so the fixtures alone
would not have caught it — there is a test that fails under a sum and passes
under a peak.

**The recheck runs inside the transaction, not before it.** Otherwise it can go
stale between reading and writing. A refused acceptance leaves the contract
exactly as it was, which a test asserts.

**Availability returns why, not just whether.** Each blocked asset carries the
reason and the offending record with its dates, which is what the availability
strip draws and what the 409 error lists.

---

## Required checks

All ten, and where to find each one.

| # | Check | Where |
|---|---|---|
| 1 | Overlapping exclusive-asset bookings | `src/domain/availability.test.ts` |
| 2 | Expired versus active holds | `src/domain/availability.test.ts` |
| 3 | Capacity-pool availability | `src/domain/availability.test.ts` |
| 4 | Duplicate submission, same idempotency key | `tests/integration/bookingRequests.test.ts` |
| 5 | A client with no contracts can use the catalogue | `tests/integration/catalogue.test.ts`, `clientPortal.test.ts` |
| 6 | Contract issue, acceptance and change request | `src/domain/contract.test.ts`, `tests/integration/clientPortal.test.ts` |
| 7 | Blocked work order requires a reason | `src/domain/workOrder.test.ts`, `tests/integration/fieldWork.test.ts` |
| 8 | Completed work order requires proof, updates service history | `tests/integration/fieldWork.test.ts` |
| 9 | Organisation A cannot retrieve organisation B's contract | `tests/integration/clientPortal.test.ts`, and again over HTTP in the journey |
| 10 | One connected UI journey | `tests/e2e/connected-journey.spec.ts` |

---

## The seeded friction

The supplied fixtures contain deliberate awkwardness. None of it was cleaned up.
The fastest way to see the rules working:

| Look at | What it proves |
|---|---|
| Catalogue, 12–18 Feb 2027 | Bus 102 reads free until the 15th and booked after — the half-open boundary, drawn |
| `request-001` in management | Unfulfillable **twice over**: no asset free, and 6 days against a 30-day minimum. Approving returns 409 naming all three blocking records and changes nothing |
| Hub screen pool, 20–28 Feb | Exactly full at 4 of 4. `hold-002` expired on 10 January and is correctly ignored — counting it would report an impossible 5 of 4 |
| Charging-station screen | Price on request. Set any budget filter and it disappears, rather than passing as free |
| Bus 202 | Retired, so it is shown as a blocked candidate rather than hidden |
| Hub door B | Last verified October 2026. Management is warned before committing a client to it |
| Silverline Fitness | A client account with zero contracts and a working portal |

---

## Assumptions

1. **Time.** The prototype clock is fixed at `2027-01-15T09:00:00Z`, read from
   `domain/clock.ts`. Nothing calls `Date.now()` directly.
2. **Timezone.** All calendar dates are UTC-anchored. Jersey local time and
   daylight saving are out of scope; production would need an explicit agency
   timezone, because "available from the 1st" is a local-midnight question.
3. **Dates are strings.** Calendar dates are stored as `YYYY-MM-DD` rather than
   `DateTime`. ISO strings compare chronologically, which removes a whole class
   of timezone-drift bug. Instants stay UTC `DateTime`.
4. **Pricing.** A contract total is the product's monthly equivalent pro-rated
   across the booked days. A price-on-request product cannot be drafted into a
   contract without a rate being agreed first — it is refused rather than
   priced at zero.
5. **Enquiries do not check availability.** A request is an enquiry; refusing to
   record one because inventory looks tight would hide real demand from the
   agency. Availability is rechecked at approval and acceptance, where it can
   actually block a commitment.
6. **Idempotency keys identify the attempt, not the payload.** A retry carrying
   an edited body returns the original record rather than creating a second one.
7. **Fitters see the office notes on their own jobs.** They are internal to the
   agency, not secret from the person doing the work. They never reach a client.

## Deviation from the supplied API contract

Two, both deliberate:

1. **Cross-tenant reads return `404`, not the `403`** in `api/openapi.yaml`. A
   `403` confirms that another organisation's record exists. The prototype
   treats records outside your organisation as absent.
2. **A shortlist endpoint was added** (`/api/client/shortlist`). Scenario A
   requires shortlisting and the supplied document defines no route for it.

Everything else is equivalent to the supplied contract.

---

## Deliberate exclusions

Not built, on the brief's instruction: production authentication, identity
verification, electronic signature, payments, live notifications, real
accounting/CRM/media-scheduling integrations, object storage, malware scanning,
App Store deployment, full offline synchronisation, programmatic advertising, a
map product, and a full brand or illustration system.

Also deliberately not built: unrestricted CRUD for every entity. The brief asks
for the connected scenarios to work through a coherent interface, not an admin
panel.

## Known limitations

- **Sessions are not authentication.** The cookie holds a user id and is
  unsigned. Anyone can become anyone. That is the point of a role switcher.
- **Proof files live in the database.** Capped at 2 MB and base64-encoded, so
  the database grows with every photograph. Access control is real; storage is
  not production-shaped.
- **The offline queue is per-device and per-browser.** It survives a reload and
  a crashed tab, and retries automatically when the connection returns. It is
  not a full offline sync: a fitter cannot progress a job with no signal at all,
  only queue the photographs.
- **Contract versioning stores a version number, not a document history.** The
  previous version's terms are not retained; the audit trail records that a new
  version was issued.
- **No pagination.** Every list loads in full, which is fine at fixture scale
  and would not be at real scale.
- **A single `npm audit` finding** in the Prisma CLI's `deepmerge-ts`
  dependency: a devDependency, not shipped, and the vector is not reachable from
  how we use it. Pinning backwards costs more than it gains.
- **`/api/dev/reset` destroys data by design.** It is gated on the manager
  role, which the switcher hands out freely — that is not security, it just
  stops it being a naked public endpoint. In production it would not exist:
  demo data would live in its own environment and resetting it would be an
  operational task, not an HTTP call.

---

## Visual system

One token file, `src/app/globals.css`, holds every colour, type step and radius
used by all three interfaces. They differ in density and layout, never in
palette or type.

Type is **IBM Plex**: Sans for anything read as language, Mono for anything read
as data — dates, asset identifiers, capacity, money. It was drawn for technical
and signage contexts, which is what this is.

In this product **colour is data**: availability has to encode booked, on hold,
out of service and free, so those hues are reserved. The brand teal therefore
appears only on interactive affordances, where it cannot be mistaken for a
state.

The one element built properly is the **availability strip**: the requested
window drawn once per physical asset with the blocking records laid over it. The
hardest question here is "why can't I have this?", and the honest answer is
never one word. The same component appears in the catalogue, on a product, on
the approval screen and on the inventory page.

### Asset sources

No third-party or generated images, icons or illustrations are used. The only
external asset is the IBM Plex typeface, served self-hosted by `next/font`,
licensed under the SIL Open Font License 1.1.

---

## Documents

- Productionisation note — `docs/productionisation.md`
- Submission details — `SUBMISSION_TEMPLATE.md`
