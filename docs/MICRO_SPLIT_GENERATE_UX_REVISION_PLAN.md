# Micro Split and Generate UX Revision Plan

Status: `RELEASED IN v1.1.9 — LIVE UAT`

This record covers three requested refinements after desktop v1.1.8:

1. price-basis-aware manual rate entry;
2. a collapsible Client → Day → split-service Generate tree with selection;
3. a focused Supplier Master popup that returns to the active work context.

The owner approved this design on 2026-07-29. The v1.1.9 implementation is now
active locally; generation remains a reviewed action and selection never sends.

## 1. Current behavior audit

### 1.1 Manual rate

The current manual-rate form has one rate amount, one Price Basis, and one
Quantity. Quantity:

- is not derived from Adult/Child/Infant pax;
- is not currently used to display a calculated total;
- is stored with the Micro Split item;
- appears in the generated service line only when it is not `1`;
- accepts `0.01` increments even though the current operational choices are
  normally whole units.

Therefore `PER_PAX` currently does not mean separate Adult, Child, and Infant
prices. The label and the form behavior are not yet aligned.

### 1.2 Generate queue

The current queue is a flat list of packages grouped by:

```text
Customer Code + Supplier
```

A package can contain services from several Days, but the queue card does not
show that Daywise hierarchy. Similar Customer Codes and suppliers are therefore
visually separated into apparently unrelated cards, making comparison with the
source Daywise difficult.

### 1.3 Supplier readiness link

`Open exact Supplier Master` currently navigates the main application away from
Generate into the full Supplier Master page. The user must later navigate back,
and the Generate scroll, selected package, and working context are not presented
as one uninterrupted task.

## 2. Manual-rate form design

### 2.1 Core rule

Changing Price Basis changes the visible rate fields and calculation rule. The
system must not use one generic `Manual rate × Quantity` form for every basis.

The form always displays a read-only calculation preview before save. Blank
means missing; explicit `0` means a known zero/free rate. These two states must
not be treated as the same value.

### 2.2 `PER_PAX`

When Price Basis is `PER_PAX`, the Micro Split already has the itinerary pax:

- Adult count;
- Child count;
- Infant count.

These counts appear read-only beside three editable rate inputs:

| Category | Count source | Manual rate input | Calculation |
| --- | --- | --- | --- |
| Adult | itinerary `adult_pax` | Adult rate | Adult count × Adult rate |
| Child | itinerary `child_pax` | Child rate | Child count × Child rate |
| Infant | itinerary `infant_pax` | Infant rate | Infant count × Infant rate |

Example:

```text
2 Adult × IDR 100,000 = IDR 200,000
1 Child × IDR 75,000  = IDR 75,000
1 Infant × IDR 0      = IDR 0
Estimated total       = IDR 275,000
```

Recommended validation:

- A category with pax greater than zero requires a rate value.
- Entering `0` explicitly is valid and means free/no charge.
- A category with zero pax is shown disabled and contributes zero.
- Quantity is hidden because the category counts are the quantities.
- If the itinerary pax changes through a revision, the saved rate snapshot is
  retained and the item becomes `REVISION_REVIEW`; it is not silently
  recalculated as an approved cost.

The local and published service schemas require a new `infant_rate_idr` field.
The current schema already stores Adult and Child separately but has no Infant
rate on the Micro Split item.

### 2.3 Whole-unit bases

These bases use:

```text
Unit rate × Quantity = Estimated total
```

Applicable initial choices:

- `PER_ITEM`
- `PER_UNIT`
- `PER_VEHICLE`
- `PER_TRIP`

Quantity behavior:

- default `1`;
- minimum `1`;
- whole numbers only;
- numeric step `1`, never `0.01`;
- staff may type the number directly instead of repeatedly pressing arrows;
- optional compact minus/plus controls change by exactly one.

Examples:

```text
4 Garland × IDR 50,000 = IDR 200,000
2 Vehicles × IDR 850,000 = IDR 1,700,000
```

The visible Quantity label follows the basis:

- `Items`
- `Units`
- `Vehicles`
- `Trips`

### 2.4 Flat bases

`PER_SERVICE` is treated as one flat service price:

```text
Service price × 1
```

Quantity is hidden and stored as `1`. A staff member who needs two separately
traceable services should create two Micro Split rows, unless the owner later
approves a different rule.

Future `PER_GROUP`, `PER_DAY`, `PER_HOUR`, `CUSTOM`, or fractional-unit rules
remain outside this first revision and require their own field behavior.

### 2.5 Manual-rate evidence

Reason, Source, and Evidence Reference remain required according to the current
manual-rate safety rule. The calculation preview does not convert a booking-only
manual rate into an approved Contract Rate.

Recommended visual order:

```text
Price Basis
Rate fields determined by basis
Quantity when applicable
Estimated total
Reason / Source / Evidence
```

The generated supplier booking may show quantities and quoted rate context, but
whether supplier emails include internal cost amounts remains a separate
mail-merge decision.

## 3. Generate tree design

### 3.1 Objective

Replace the flat queue with a compact, collapsible tree that preserves the
source Daywise order:

```text
☐ GA/PSHBALI1325 — Mr. Ganesh Biswal
├─ ▾ Day 1 — 01 Aug — Arrival and Uluwatu
│  ├─ ☐ Tarantula — Airport transfer       NOT GENERATED  RATE READY
│  └─ ☐ GWK — Entrance ticket              GENERATED      OPEN DRAFT
├─ ▸ Day 2 — 02 Aug — Ubud full day
└─ ▸ Day 3 — 03 Aug — Departure
```

The visual style is intentionally closer to a file tree than a stack of large
cards:

- one line per Client, Day, and service;
- indentation and branch lines;
- compact status text/pills;
- monospaced branch markers where useful;
- no repeated large Customer Code cards;
- independent collapse state per Client and Day.

### 3.2 Sort and grouping

Top level:

1. arrival date;
2. Customer Code;
3. customer name.

Inside Client:

1. Day number;
2. service date;
3. original Micro Split sequence.

Each service row displays:

- supplier;
- Product/service;
- rate readiness;
- communication state;
- supplier result;
- Gmail thread link when sent by Email;
- external evidence link when applicable.

Day header displays:

- Day number;
- service date;
- Day Wise header/title;
- selected/eligible/total counts.

### 3.3 Selection unit

Recommendation: the checkbox represents a stable Micro Split `service_id`.
This gives staff the flexibility requested while retaining exact Daywise
traceability.

Selection hierarchy:

- Client checkbox selects all visible eligible services for that Client.
- Day checkbox selects all eligible services for that Day.
- Service checkbox selects that exact split item.
- `Select all visible eligible` and `Clear selection` are available above the
  tree.

Selection never immediately sends an email.

The action is:

```text
Prepare selected (N)
```

The system then groups selected services by:

```text
Customer Code + Supplier + Action type
```

One supplier across several Days becomes one outgoing package containing the
selected Daywise service rows. Two suppliers always become two packages.

Before generation, a batch summary shows:

- selected service count;
- resulting supplier-package count;
- excluded/disabled rows and reasons;
- missing readiness notices;
- action and channel per package.

The existing Generate editor and two-panel Email popup remain unchanged after a
package is opened.

### 3.4 Checkbox eligibility

Default selectable:

- `NOT_GENERATED`;
- a revised item explicitly requiring `AMEND`;
- an explicitly prepared cancellation item requiring `CANCEL`.

Not selectable for a new booking:

- `GENERATED` — action becomes `Open draft`;
- `SENT_PENDING_SYNC` — action becomes `Retry sync`, never resend;
- `SEND_OUTCOME_UNKNOWN` — action becomes `Resolve outcome`;
- `SENT` — Gmail/evidence link is shown;
- `REVIEW_REQUIRED` — action opens supplier reply review;
- `CONFIRMED` or `CANCELED` — read-only completed state.

This rule prevents selecting an already sent item merely because its parent
Client or Day checkbox was clicked.

### 3.5 Package and snapshot safety

The existing booking snapshot table already stores linked service snapshots.
The revision must allow Generate to receive an explicit list of selected stable
`service_id` values instead of automatically taking every service for that
Client/Supplier.

Required safeguards:

- selected IDs must belong to the displayed Client and latest source revision;
- the backend recomputes supplier grouping and does not trust UI grouping;
- generated snapshot records the exact selected service IDs;
- changing selection after Generate creates or updates only an unsent draft;
- a Sent package is immutable;
- same service/action cannot be included in two active unsent packages;
- status changes refresh the tree without losing unrelated selections.

### 3.6 Default expansion

Recommended defaults:

- Clients containing eligible `NOT_GENERATED` work start expanded.
- Days containing selected or attention items start expanded.
- Sent/Confirmed-only Clients start collapsed.
- Search automatically expands matching Client/Day branches.
- After returning from the detail editor, the previous scroll and collapse
  state is restored.

## 4. Focused Supplier Master popup

### 4.1 Window behavior

`Open exact Supplier Master` opens a child application window, not a new main
navigation page.

The parent Generate workspace remains alive with:

- current Client/Day expansion;
- selected checkboxes;
- selected package;
- search/filter;
- scroll position;
- unsent preview content.

Only one focused Supplier popup is opened for the current correction request.
Closing it restores focus to the Generate window.

### 4.2 Exact correction context

The popup receives stable identifiers, not only visible names:

- `supplier_id`;
- `product_id` when applicable;
- `contract_id`/`contract_rate_id` when applicable;
- service date;
- missing/readiness section;
- originating Client, Day, and `service_id`.

It shows only the supplier header and required section:

| Readiness problem | Popup section |
| --- | --- |
| Supplier not linked | exact Supplier profile/linking |
| Email/WhatsApp destination missing | Contacts/Recipients |
| Booking channel/SOP missing | Booking SOP |
| Product missing | Product |
| Contract/rate missing | Contract and Rate for the service date |

An optional `Open full Supplier Master` link remains available only for
authorized Manager/Admin users.

### 4.3 Save and return

Primary action:

```text
Save & return to Generate
```

Behavior:

1. validate the exact section;
2. save through the existing permission/business-rule gateway;
3. read back the saved record;
4. send a structured result to the parent window;
5. refresh only the affected Supplier/service readiness;
6. close the popup;
7. restore focus, selection, collapse, and scroll state.

If validation, save, publication, or readback fails, the popup stays open and
shows the error. It must not close while implying success.

### 4.4 Local pending versus official data

The popup must not weaken current Supplier Master permissions.

Recommended rule:

- authorized Manager/Admin may `Save & publish`, then close after confirmed
  readback;
- a local-only staged correction may close as `Saved locally — publication
  pending`, but live Email send continues to use only approved official
  recipients/SOP data;
- unauthorized Vendor staff receive read-only context plus a future
  `Request correction` action rather than direct master mutation.

This prevents an unapproved locally typed email address from silently becoming
the live booking destination.

### 4.5 Electron window safety

The child window follows the current desktop security baseline:

- `contextIsolation: true`;
- `nodeIntegration: false`;
- the existing controlled preload bridge;
- role checks repeated in the main process/Apps Script;
- no raw Supplier Master payload in URL query strings;
- parent/child communication uses stable IPC request IDs;
- child closes automatically if the parent application exits.

## 5. Recommended delivery sequence

1. Add price-basis calculation helpers and schema support for Infant rate.
2. Render the dynamic manual-rate form and estimated totals.
3. Add calculation and migration tests.
4. Extend the queue read model with Client/Day/service hierarchy and states.
5. Build the read-only collapsible tree.
6. Add eligible selection and batch preparation.
7. Make Generate accept exact selected service IDs with backend regrouping.
8. Add the focused Supplier Master child window and save/readback return event.
9. Run visual, regression, packaging, and operational UAT.

## 6. Initial UAT gates

- `PER_PAX` uses itinerary Adult/Child/Infant counts and separate rates.
- Explicit Infant rate `0` is accepted; blank with Infant pax is still missing.
- `PER_ITEM`, `PER_UNIT`, `PER_VEHICLE`, and `PER_TRIP` use whole Quantity.
- The displayed estimated total matches the stored rate snapshot inputs.
- The tree order matches Client → Day → original Micro Split order.
- Collapse/search never changes status or selection unexpectedly.
- Parent checkboxes select eligible rows only.
- Sent/Confirmed/Pending Sync rows cannot be selected for a new send.
- Selected services are regrouped by the backend into the correct suppliers.
- One supplier covering several selected Days produces one package.
- A generated snapshot contains only the selected stable service IDs.
- The Supplier popup opens the exact missing section.
- Save failure keeps the popup open.
- Successful official save/readback closes the popup and refreshes the exact
  affected tree row without losing the Generate context.

## 7. Owner decisions — approved

1. Approve separate Adult/Child/Infant inputs for `PER_PAX`.
2. Approve explicit `0` as free and blank as missing.
3. Approve whole-number Quantity with step `1` for item/unit/vehicle/trip.
4. Confirm whether `PER_SERVICE` must always hide Quantity and stay fixed at 1.
5. Approve service-level checkboxes that regroup automatically by supplier.
6. Confirm whether one supplier across several selected Days should become one
   email/package, as recommended.
7. Confirm Manager/Admin `Save & publish` as the only path that can immediately
   clear recipient/SOP readiness for live Email.

## 8. v1.1.9 implementation result

- Manual `PER_PAX` stores separate Adult, Child, and Infant rates; explicit
  zero is preserved and missing required categories cannot claim `RATE_READY`.
- `PER_SERVICE` is fixed at one. Item, unit, vehicle, and trip quantities are
  whole numbers with step one.
- Generate renders Client → Day → service, keeps stable service-ID selection,
  and prepares the selected rows by supplier package without sending.
- Generated state is recorded per service. A partially generated supplier
  package keeps its other services eligible and visibly `NOT_GENERATED`.
- Supplier readiness opens a modal child window with the exact section and
  stable supplier/product/service context. A successful local save closes it,
  refreshes the parent read model, and preserves the active Generate package.
- Apps Script Web App Version 20 includes the Infant rate column on the existing
  deployment URL. GitHub Release v1.1.9 is published as Latest with installer,
  blockmap, and updater feed.
