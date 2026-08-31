# Productionisation note

**Island Media Co advertising operations** — what changes between this prototype
and something an agency could run its business on.

## Architecture

Keep the shape: one Next.js application with a pure domain layer, a service
layer, and route handlers. A small management team has no scaling problem that
microservices solve, and splitting three surfaces into three deployables triples
the operational surface to fix a problem nobody has. What changes is around it.

**Postgres replaces SQLite** — not for scale, for concurrency. The availability
recheck relies on transactional isolation, and two managers approving the same
asset at the same moment is a real Tuesday. In Postgres the approval transaction
takes a row lock on the candidate assets (`SELECT … FOR UPDATE`); SQLite's
single-writer model hides that problem rather than solving it.

**Background jobs** for the three things that should leave the request path:
contract activation on a start date, hold expiry, media-owner reconciliation. A
`pg`-backed queue (Graphile Worker) before reaching for Redis, with retries and
a dead-letter queue. Every job must be idempotent — at-least-once is the only
honest delivery guarantee.

**Reconciliation, not webhooks.** Media owners will not push clean, ordered
events. Poll each owner's feed into a staging table and diff it against our
view; where an owner sends a spreadsheet — which the fixtures already admit with
`verificationSource: "spreadsheet import"` — treat the import as a first-class
ingest with a human review step. Reconciliation must never silently alter a
confirmed booking; it raises an exception for a person.

**Idempotency** is already real here: `(scope, key)` unique, keyed on the
attempt rather than the payload. Production adds a 24-hour expiry, stores the
original response body so a replay returns it verbatim, and extends the rule
from material creates to every mutating endpoint.

**Monitoring.** Sentry with the release SHA, plus structured logs carrying
request id, actor and organisation. The most valuable alert is not a 500 rate —
it is *availability rechecks failing more often than usual*, which means our
view of inventory has drifted from the owner's.

**PWA, not native, for the field app.** The fitter needs a camera, a job list
and resilient uploads; a file input with `capture`, IndexedDB and a service
worker cover all three, and web push now works on both platforms. Native costs
two toolchains, two review cycles and a distribution problem for a handful of
staff who need a fix the same afternoon. I would revisit for background
location, background upload while closed, or barcode scanning at volume — none
is in this brief.

## Data model and sources of truth

The prototype's separation of product, asset, pool, booking, contract, campaign
and work order holds up. What production adds is being explicit about what we do
**not** own.

| Domain | Source of truth | Us |
|---|---|---|
| Inventory existence and condition | Media owner | Cached projection with a verification age |
| Availability and bookings | **Us** | Authoritative; owners confirm, we commit |
| Client identity | **Us** | CRM is downstream, never authoritative |
| Invoices and payments | Accounting system | We emit a billable event, never a ledger |
| Creative and proof files | Object storage | Keys and metadata only |
| Screen playout schedule | Owner's scheduler | We hold the sold slot, not the loop |

Two boundaries worth defending. **We are not an accounting system** — the moment
we derive VAT or track payment status we own a compliance problem; acceptance
emits an event finance consumes. **We do not own the loop** — if our capacity
model and the owner's scheduler disagree, theirs wins and we raise an exception.
The `verifiedAt` field is the seed of this: it already admits our view is a
cache.

## Identity, permissions and the signature boundary

The role switcher goes. Clients get email and password or a passwordless link,
with a verified address required before a contract can be issued to it. Staff
are provisioned by an administrator, with SSO if the agency has Workspace or
365. Sessions become signed, short-lived and revocable — the prototype's cookie
is unsigned and holds a raw user id, which is the largest deliberate gap in this
repository.

**Business verification** matters more than email verification: before issuing a
contract, require a company number and a named signatory checked against the
Jersey registry. That is a manual step and should be, because the failure mode
is issuing a contract to someone with no authority to accept it.

Permissions run at three levels. **Tenant** — every client query scoped to one
organisation, already structural here because `organisationId` is a required
argument with no un-scoped path to call by mistake; production adds Postgres
row-level security so a future missed `WHERE` fails closed. Cross-tenant reads
return `404`, never `403`, so the API never confirms another organisation's
records exist. **Record** — a fitter reads only their own jobs, already
enforced. **Field** — `internalNotes` reach the agency and the assigned fitter,
never a client, and a fitter's completion note is internal too because it may
name depot staff or another client's site; the client sees a generated safe
summary. Field rules belong in the serialisation layer, or one forgotten
interpolation leaks them.

**Contracts** need the document, not just a version number: an immutable
snapshot per version, rendered and hashed, so "what did they accept" has an
answer a year later. Acceptance stores the hash, timestamp, user and IP. That is
where I would stop. Click-through acceptance with an audit trail is enforceable
for most commercial agreements. Qualified eIDAS signatures mean a provider
integration, a per-envelope cost and an external dependency in the critical path
of every deal — **I would not build it until counsel says the click-through is
insufficient.**

## Proof files and field resilience

Proof moves out of the database. Upload directly from the phone to object
storage via a short-lived presigned URL; the bytes never touch our servers. The
object lands in **quarantine and is scanned before it is readable** — a fitter's
phone is the least controlled device in the estate — and the UI shows the proof
as pending until it clears. Serve through presigned URLs only; the ownership
check the prototype already performs decides whether to mint one. Strip EXIF GPS
unless location is deliberately part of the proof, and if it is, tell the fitter,
because it is their location too.

Offline moves from `localStorage` to IndexedDB with a service worker and
Background Sync, so an upload completes with the app closed, and extends to
**status transitions** as well as photographs so a job can be completed in a
basement car park. The stable idempotency key is what makes any of it safe, and
it is already here for exactly that reason.

## Environments, delivery, data safety

Local, per-PR preview, staging on anonymised data, production; no shared dev
database. CI runs typecheck, unit and integration tests, the Playwright journey,
`npm audit`, and a migration dry-run against a staging snapshot. The connected
journey is the check that matters most: it is the only one that fails when a
hand-off between interfaces breaks.

Migrations are expand-then-contract, never pairing a schema change with a code
change that depends on it in the same release. Backups use managed PITR with a
**restore rehearsed on a schedule** — a backup nobody has restored is a
hypothesis. Rollback is an immutable previous-version switch; migrations roll
forward. Secrets live in the platform store; this repository contains none.
Dependencies via Renovate and a lockfile. The current `npm audit` finding is in
the Prisma CLI's tree, is a devDependency and is unreachable from our usage —
recorded rather than patched around.

## Cost and maintenance

Hosting £20–40, managed Postgres with PITR £20–50, object storage £5–15,
monitoring £0–30, email £0–15 — roughly **£50–150 a month** at this size. The
dominant cost is not infrastructure. It is the half-day a week of attention any
live system needs, and the media-owner integrations, which are bespoke per owner
and are where the effort actually goes.

What keeps three interfaces cheap in six months is what this prototype is built
around: one token file, one set of primitives, one domain layer. The availability
strip appears in four places and exists once. When the rule for holds changes it
changes in `domain/availability.ts` and every surface follows. The expensive
version is the one where each interface grows its own copy of the rules.

## What I would validate first

1. **Watch a manager work for half a day.** The dashboard is my guess at what
   needs attention first; their morning is the specification.
2. **Get one real media-owner availability feed.** Every integration assumption
   above rests on how a Jersey operator actually shares a schedule. One real
   example will invalidate something.
3. **Give a fitter the app at a depot** — a real installation, real weather, real
   signal. The offline queue rests on an assumption about where signal fails.
4. **Settle the signature position with counsel** before building past
   click-through.
5. **Decide who wins when our capacity model and the owner's disagree.** The
   prototype assumes the owner does. That is a commercial call, made by the
   people who field the phone call.

The riskiest assumption is not in the code. It is that an agency's inventory can
be modelled as assets and pools at all. The fixtures suggest it can; two real
media owners would tell us whether it holds, and that is what I would want to
know before writing much more.
