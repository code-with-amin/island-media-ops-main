# Submission template

## Links

- Deployed preview: **https://island-media-ops.vercel.app/**
- Walkthrough video: **https://drive.google.com/file/d/1i26gKmgVuOPuuNZMbjfpaeG47YKkbYmP/view?usp=sharing**

## Prototype access

Use the **account switcher in the top right of every page**. No passwords.

- Management user: **Morgan Reed · manager** → lands on `/manage`
- Fitter user: **Casey Morgan · fitter** → lands on `/field`
- Existing client user: **Taylor Quinn · Oak Legal** (active contract, scheduled
  work). Also seeded: **Jordan Ellis · Lighthouse Learning** (contract issued,
  awaiting a decision) and **Avery Stone · Silverline Fitness** (**no contracts**)
- New-client registration route: `/register`, or "Create an account" from any
  product page while signed out

Reset the demo at any time: `npm run db:reset`, or POST `/api/dev/reset`.

## Setup and checks

- Required runtime: **Node 22+**. No database server, no Docker, no accounts.
- Install command: `npm install`
- Seed or reset command: `npm run setup` (first run) · `npm run db:reset` (after)
- Development command: `npm run dev`
- Test command: **`npm run test:all`** — 205 Vitest + 11 Playwright steps.
  Playwright needs a browser once: `npx playwright install chromium`
- Production build command: `npm run build`

## Active time

- Active working time: **6 hrs**
- Unattended agent elapsed time: **15 min**
- Delivery started: **Aug 31, 2026**
- Delivery submitted: **Aug 31, 2026**

## What works

### Scenario A: signup and product discovery

All six steps work. Verified in a browser end to end.

1–3. `/` — catalogue search. Dates are **required**, because no answer on the
page means anything without them; media type, location and maximum monthly
budget narrow it. Search is a plain `GET`, so a search is a shareable URL. Each
product shows calculated availability, the native rate label, minimum term and
creative specification (`/products/[id]`).
4. `/register` creates a user and an organisation with **no contract**.
5. Session persists across reload (signed-in cookie; the account and its data
   are in the database).
6. Shortlist and a non-binding request from the product page. The confirmation
   says explicitly that nothing is reserved.

### Scenario B: management request to contract and campaign

All nine steps work.

1. `/manage` — attention-led, ordered by who is blocked, not by entity type.
2. `/manage/requests/[id]` leads with **live availability**, and reports the
   minimum-term problem separately from the inventory problem.
3. Approve, decline, or request more information — the last two require a note,
   recorded in history. **A request for information is a round trip:** the
   question reaches the client's portal, they answer it there, and the enquiry
   returns to the agency's decision queue with both sides in the history.
4. **Conflict:** approve `request-001` and the server rechecks *inside the
   transaction* and returns `409` naming all three blockers. The request stays
   `submitted`; nothing is half-applied.
5–6. On an approvable request: allocate an asset, create a draft (marked as not
   visible to the client), then issue.
7. The client sees it on their portal home as "Contract ready to review".
8. Accept, or request a change with a note. **A change request is a round
   trip too:** the manager answers it on the contract page, either revising the
   terms — which re-issues as a new version with the total recalculated and the
   new dates rechecked against inventory — or declining with a reason, which
   returns the same version to the client untouched.
9. Acceptance rechecks inventory, creates the confirmed booking and activates
   the campaign — in one transaction.

**Verify quickly:** `/manage/requests/request-001` → Approve.

### Scenario C: management creates and assigns field work

`/manage/work-orders` — the form sits beside the list because the manager
creating the work is usually the one watching it. Job type, scheduled window,
asset, location, instructions, internal notes and assigned fitter. Assigning is
what puts it on a phone *and* tells the client work is scheduled. Latest field
status, blocked reasons and proof are all on the same page and on the contract.

### Scenario D: fitter completion updates management and client visibility

`/field` on a phone viewport. `assigned → travelling → on_site → blocked ⇄
on_site → completed`. Blocking requires a reason; completion requires a note and
at least one proof. Completion writes a service event, which management sees in
full and the client sees as a safe summary with the proof attached.

**Verify quickly:** open `/field` at a phone width, try to block without a
reason, then try to finish without a photo.

## Deliberate exclusions and known limitations

Not built, per the brief: production authentication, identity verification,
electronic signature, payments, live notifications, real CRM/accounting/media
integrations, object storage, malware scanning, store deployment, full offline
sync, a map product, a brand system. Also not built: unrestricted CRUD for every
entity — the brief asks for the scenarios to work, not an admin panel.

Known limitations (fuller list in the README):

- The session cookie is **unsigned** and holds a raw user id. Anyone can become
  anyone. That is the role switcher, and it is the largest deliberate gap.
- Proof files live in the database as capped base64. Access control is real;
  storage is not production-shaped.
- The offline queue covers photographs, not status transitions, and is
  per-device.
- Contract versioning stores a version number, not a document snapshot.
- No pagination anywhere.

## Assumptions

1. Prototype clock fixed at `2027-01-15T09:00:00Z`, read from one module.
   Nothing calls `Date.now()`.
2. **All calendar dates are UTC-anchored.** Jersey local time is out of scope;
   production needs an explicit agency timezone, because "available from the
   1st" is a local-midnight question.
3. Calendar dates are stored as `YYYY-MM-DD` **strings**, not `DateTime` — ISO
   strings compare chronologically, removing a class of timezone bug.
4. A contract total is the monthly equivalent pro-rated across booked days. A
   price-on-request product is **refused** at drafting rather than priced at zero.
5. Submitting a request does **not** check availability. A request is an
   enquiry; refusing to record one would hide real demand. Availability is
   rechecked where it can actually block a commitment.
6. An idempotency key identifies the **attempt, not the payload** — a retry with
   an edited body returns the original record.
7. Fitters see office notes on their own jobs. Clients never do.

## Shared data model

- **Users and organisations.** A `User` has a role; a client user belongs to one
  `Organisation`. Staff have none. Every client-facing service takes
  `organisationId` as a **required argument**, so there is no un-scoped read
  path to call by accident.
- **Products, assets and pools.** A `Product` is what is sold. An `Asset` is the
  named bus panel, door, screen or van. A `CapacityPool` is shared capacity.
  Availability is computed differently for each and never conflated.
- **Requests, bookings, contracts, campaigns.** A `BookingRequest` is
  non-binding. A `Contract` is the agreement, with `ContractItem` lines. A
  `Campaign` is delivery of an accepted contract. A `Booking` is inventory
  actually consumed — created **on acceptance**, not before.
- **Work orders, service events, proof.** A `WorkOrder` is one visit;
  `ProofRecord` attaches to it; `ServiceEvent` is the safe client-visible
  summary. Plus `HistoryEvent`, one audit table for every entity, and
  `IdempotencyRecord`, unique on `(scope, key)`.

## Contract behaviour

`draft → issued → {change_requested → issued | accepted} → active → completed`,
with `cancelled` from most states. Enforced in `src/domain/contract.ts`, which
also owns the actor rules: a client cannot issue, a manager cannot accept on a
client's behalf.

**A client action moves status and appends history — it never touches items,
total or dates.** `version` increments only when a *manager* re-issues after a
change request. That makes "must not silently rewrite an issued contract"
structural rather than a convention.

Acceptance rechecks every asset **inside the transaction**, so the check cannot
go stale between reading and writing. On conflict it returns `409` and leaves the
contract exactly as it was — a test plants a competing booking and asserts
`status` is still `issued` and `acceptedAt` still null.

## Mobile and field-work behaviour

A separate mobile-first surface at `/field` — single column, sticky header, one
large primary action per state. Same tokens and primitives as the other two
interfaces; the difference is density and touch target size, not a second design.

**Proof handling.** Photographs are written to a device queue **before** the
upload is attempted, so a tab that dies mid-upload does not cost a second trip to
the depot. Each queued item carries a **stable idempotency key**, so retrying —
manually, or automatically when the connection returns — cannot produce two
copies of the same photograph. That is the real risk a retry queue introduces.

**Production alternative:** PWA, not native — and I would say so rather than
hedge. The fitter needs a camera, a job list and resilient uploads; a `capture`
file input, IndexedDB and a service worker cover all three, and web push works
on both platforms. Native costs two toolchains and two review cycles for a
handful of staff who need a fix the same afternoon. I would revisit for
background location, background upload while closed, or barcode scanning at
volume.

## Visual consistency

- **Colour and typography.** One token file, `src/app/globals.css`. Type is
  **IBM Plex** — Sans for language, Mono for anything read as data (dates, asset
  ids, capacity, money). It was drawn for technical and signage contexts, which
  is what this is. **In this product colour is data:** availability must encode
  booked, on hold, out of service and free, so those hues are reserved and the
  brand teal appears only on interactive affordances, where it cannot be
  mistaken for a state. Radius scale: 4/6/8px for chips, controls and cards.
- **Where it is applied.** All three surfaces share `src/ui/primitives.tsx` and
  the same token file. The **availability strip** — the requested window drawn
  once per asset with blocking records laid over it — appears in the catalogue,
  on product detail, on the manager's approval screen and on the inventory page.
  Four contexts, one component.
- **Third-party or generated asset sources and licences.** None. No third-party
  or generated images, icons or illustrations. The only external asset is the
  **IBM Plex typeface**, self-hosted via `next/font`, licensed under the **SIL
  Open Font License 1.1**.

## Access boundaries

Client data is scoped structurally: `organisationId` is a required first
argument on every portal service, and scoping happens in the `WHERE` clause, so
another organisation's record is never loaded into memory. A cross-tenant read
returns **`404`, not the `403`** in the supplied OpenAPI — a `403` confirms the
record exists. This is a deliberate, documented deviation.

Proof files are served by a route that checks organisation ownership; another
client fetching the same URL gets `404`. Verified in the Playwright journey.

**In production** the role switcher is replaced by real sessions (signed,
short-lived, revocable) with Postgres row-level security as a second line so a
future missed `WHERE` fails closed; record-level rules by assignment and account
ownership; and field-level rules in the serialisation layer, so internal notes
cannot leak through a forgotten interpolation. Detail in the productionisation
note.

## Persistence

SQLite via Prisma in a local file. **What survives a reload and a restart:**
registered accounts and organisations, shortlists, booking requests and their
history, contracts with version and status, campaigns and bookings, work-order
status, blocked reasons, completion notes, proof files, service events and the
full audit trail.

The seed is deterministic and preserves every supplied fixture ID — verified by
diffing two consecutive resets to byte-identical SQL dumps, which is what makes
`npm run db:reset` safe to run before a walkthrough.

**Production alternative:** managed Postgres, chosen for concurrency rather than
scale — the availability recheck depends on transactional isolation and would
take a row lock on candidate assets. Proof files move to object storage with
quarantine scanning and presigned access.

## Architecture and productionisation note

`docs/productionisation.md`.

## AI and development tools

| Tool | Contribution | How you verified the output |
|---|---|---|
| Claude Code (Opus) | Paired on the whole build: schema, domain layer, services, API, all three interfaces, tests, docs | Tests written **before** implementations and watched failing first; `npm run typecheck` and `npm run build` clean at every phase; every scenario driven end to end in a browser, including offline; API responses inspected with `curl` against a running server |
| Playwright | The connected journey, plus exploratory browser runs used to find real bugs | 11 steps pass from `npm run test:e2e`; screenshots reviewed by eye at desktop and iPhone viewports |
| Vitest | 205 unit and integration tests | Each watched failing before its implementation existed |
| Prisma | Schema, migrations, deterministic seed | Two consecutive `db:reset` runs diffed to byte-identical SQL dumps |

## Representative prompts or agent instructions

The instructions that shaped the work most:

1. *"Understand the assessments domain and flow, carefully read the
   do's and dont's"* — Set the standing constraint. It is why there is no ORM
   abstraction layer, no state-management library, no monorepo, no Docker, and
   no CRUD screens the scenarios do not need.
2. *"Build the domain rules first, as pure functions with no database, and write
   the test before the implementation. Watch each test fail before writing the
   code."* — Produced `src/domain`, and is why nine of the ten required checks
   are fast unit tests.
3. *"The fixtures contain deliberate friction — an expired hold, a retired
   asset, an outage, an unfulfillable request. Do not clean any of it up. Work
   out what each planted record is meant to prove and make the code prove it."*
   — Worth recording that this instruction existed and was still applied
   unevenly. It was followed for the inventory records and not for the seeded
   *history*, which is where the missed information-request round trip was
   described. The instruction was right; my reading of "record" was too narrow.
4. *"Do not trust a passing test as evidence the feature works. Drive each
   scenario in a real browser, including the offline path, and read the
   screenshots."* — This is what found the three field-app bugs below.
5. *"Colour in this product is data. Availability has to encode booked, held,
   out of service and free, so pick a brand colour that cannot be mistaken for a
   state."*

## AI-generated mistake or unsafe assumption

Two, in the order they matter. The first is the more instructive, and it was
caught by human review rather than by any test.

### 1. Half a workflow, reported as a finished one

**What the tool generated or assumed.** Scenario B step 3 says a manager "can
request more information". That was implemented as a status change plus a note
in the history — the manager's side, and only the manager's side. The client
portal rendered an `information required` badge and nothing more: not the
question, and no way to answer it. The scenario was then reported as complete.

**Why it was wrong or unsafe.** It is half a handshake. The enquiry stalled in
both queues at once, each side waiting on the other, and the client was shown a
status they could not act on. That is precisely the failure the brief opens by
warning against — screens that each work while the hand-off between them does
not. Worse, the evidence was already in the supplied data and had been read
past: `request-002`'s history contains an `information_supplied` entry *from the
client*, an event nothing in the implementation could ever have produced. The
fixtures had described the round trip; only half of it was built.

**How I noticed.** I did not. **The reviewer did**, looking at the client portal
and asking why there was no way to supply the information the manager had asked
for. No test failed. 185 tests passed at the time, including several asserting
that the manager's side worked correctly — they encoded the same partial
understanding as the code.

**What I changed.** Added `respondToInformationRequest` in the client portal
service: organisation-scoped like everything else there, refuses when the
enquiry is not actually waiting on the client, and requires a non-empty answer.
Answering returns the request to `submitted` so it re-enters the agency's
decision queue, and both the question and the answer are recorded in the shared
history. The portal now shows the question itself with a reply box under
"Waiting on you", and the attention list was generalised from contracts-only to
a typed list of anything needing the client — a client thinks about what is
waiting on them, not about which entity it belongs to.

**What check proved the correction.** Seven integration tests in
`tests/integration/clientPortal.test.ts`, covering the question reaching the
client, the answer returning the enquiry to the agency, the action clearing, an
empty answer being refused, answering an enquiry that was never queried being
refused, and another organisation being unable to answer it. Then the round
trip in a browser, which prints both sides of the exchange from the manager's
history:

```
Information required | by manager | Could you confirm your preferred start date…
Information supplied | by client  | Start 1 March please, and yes we can flex by a week.
```

Fixing it also exposed a smaller fault I had introduced in the same change: the
answer form rendered twice on the portal home, once in the attention list and
once in the enquiry list. Found by reading the screenshot.

**The lesson.** A test suite encodes what you thought of. Mine proved the
manager's half worked and was silent on whether the workflow was whole, because
the same assumption wrote both the code and the tests. The signal that would
have caught it was in the fixture data, not in the code — which is an argument
for reading seeded history as a specification rather than as sample rows.

### 2. Error handling that could not handle the error

**What the tool generated or assumed.** The field app's proof-upload retry queue
treated a failed upload as a `Response` with a non-`ok` status:

```ts
const response = await fetch(url, { … })
if (response.ok) return true
return false          // assumed this covers "no signal"
```

**Why it was wrong or unsafe.** `fetch` does not resolve when there is no
network — it **rejects**. So the one code path written specifically to survive a
lost connection was the one path that could not survive it. The rejection
propagated out of `flush()` as an unhandled promise rejection, `setPending(null)`
never ran, and the **"Retry now" button stayed permanently disabled** — in
exactly the situation the queue exists for. A fitter at a depot with no signal
would have been left with a photograph that could never be sent, and a second
trip to site.

**How I noticed.** Not from the tests, which exercise the service rather than
the browser. Running the scenario in Playwright with `context.setOffline(true)`
reported `pageerror: Failed to fetch`. The steps still went green, so a less
suspicious reading would have called it a pass.

**What I changed.** Wrapped both `fetch` calls in `try/catch`, returning `false`
on a network rejection so the item **stays queued** — the point of a queue — and
surfacing a plain message for a failed status transition. That exposed two more,
found the same way: a stale *"some photos are still waiting to send"* survived a
successful retry, telling a fitter their work had failed when it had not; and
proof was attached to every service event sharing a work order, so photographs
appeared against *"installation is planned for 16 January"* as well as the
completion — **evidence dated wrongly, in front of the client**.

**What check proved the correction.** The offline Playwright run now completes
with no `pageerror`: the photo queues while offline, flushes automatically on
`online`, and the job completes. The proof-dating bug got a regression test
first — *"proof is attached to the completion event only, not to earlier
events"* — asserting the scheduling event has no proofs and the completion event
has one.

**The lesson.** A passing suite is evidence the code does what the test says,
not that the feature works. All three of these sat in paths the unit tests could
not reach, and all three were found by running the thing for real.

## One useful improvement

**Stale inventory verification, surfaced before a manager commits.**

Every asset carries `verifiedAt` and `verificationSource`. Anything not
confirmed with the media owner in the last 30 days is flagged on the approval
screen and on `/manage/inventory`, naming the asset, the age and the source.

**Who it helps and why it earned its place.** It helps management, and it uses
data already in the supplied fixtures rather than inventing a feature. Hub door
B was last confirmed in October 2026 *by spreadsheet import* — and it is the
asset on the already-issued `contract-001`. That is not a coincidence in the
data; it is the shape of the real failure: an agency promises a client an asset
that nobody has checked, and finds out when a fitter arrives. It is a **warning,
not a block** — a manager may know better than the record — and it cost about
thirty minutes. It was added only after all four scenarios worked.

## What I would do next

1. **Postgres, with a row lock on candidate assets inside the approval
   transaction.** SQLite's single-writer model hides the concurrency question
   rather than answering it, and two managers approving the same asset is the
   most likely first production bug.
2. **Real sessions and row-level security.** The unsigned cookie is the largest
   deliberate gap; RLS makes a future missed `WHERE` fail closed rather than
   leak.
3. **Proof to object storage with quarantine scanning and presigned access.**
   The access rule is already right; the storage is not. A fitter's phone is the
   least controlled device in the estate.
4. **One real media-owner availability feed, with reconciliation.** Every
   integration assumption in the productionisation note rests on how a Jersey
   operator actually shares a schedule. One real example will invalidate
   something, and I would rather find out before building three more.
5. **Extend the offline queue to status transitions, on IndexedDB with
   Background Sync.** Today a fitter can queue a photograph but cannot complete
   a job with no signal, which is the case that sends them back to site.
