# Transport Next Milestone Plan

Status: `DRAFT v0.1 — OWNER INPUT OPEN`

This record translates the first approved Transport discussion into a safe
development baseline. It is a design record only. It does not activate
Transport writes, publish Google records, or change the current v1.1.8 build.

## 1. Initial scope

The first Transport operating loop contains three work areas:

1. Extract active on-ground itineraries by a selected operating date.
2. Add Transport and TOC requirements from the New Itinerary Daywise context.
3. Extract Transport Daywise requirements and assign driver name and number.

Additional Transport requirements can be appended to this document before the
implementation milestone is approved.

## 2. Ownership boundary

- Reservation remains the owner of Customer Code, customer identity, pax,
  arrival/departure, flights, and the published itinerary revision.
- Vendor remains the owner of Vendor and Additional Service Micro Split items.
- Transport owns `TRANSPORT` and `TOC` requirement details, driver assignment,
  and later Transport operational readiness.
- The first scope does not assign ownership of `LUGGAGE_VAN`; this remains an
  open owner decision.
- Transport users never edit the raw itinerary or overwrite another
  department's Micro Split items.
- All Transport work carries the exact `tour_id`, Customer Code,
  `source_revision_id`, `tour_day_id`, and stable service/assignment IDs.

The shared New Itinerary screen therefore acts as one itinerary context with
separate department-owned layers, not as one shared editable record.

## 3. Shared read model

The initial Transport read model is assembled from:

- `TOURS` for Customer Code, customer, pax, arrival/departure, and flight data.
- `ITINERARY_REVISIONS` for the latest applicable published revision.
- `TOUR_DAYS` for Day number, operating date, title, time, and Daywise notes.
- `SERVICES` for current `TRANSPORT` and `TOC` requirements.
- Supplier Master for Transport/TOC supplier, Product, Contract, and rate
  readiness references.
- `DRIVER_ASSIGNMENTS` for the latest active driver assignment plus history.

Only the latest applicable non-canceled itinerary revision is shown as current.
Older versions remain traceable and must not be deleted.

Local drafts may be displayed when offline, but the UI must label them clearly
and must not merge two versions into one silent result.

## 4. Work area A — On Ground by Date

### 4.1 Inclusion rule

An itinerary is on ground for selected date `D` when:

```text
arrival_date <= D <= departure_date
```

Arrival and departure dates are included. Canceled itineraries are excluded
from the default view but remain available through an explicit status filter.
All date calculations use the configured operational timezone, initially
`Asia/Makassar`.

This differs from an arrival-only board. The result includes every active guest
movement on the selected operating date.

### 4.2 Default controls

- Required operating-date filter, defaulting to today.
- Customer Code/customer search.
- Optional readiness filter:
  - All
  - Transport not filled
  - TOC not reviewed
  - Driver missing
  - Driver assigned
  - Revision needs review
- Refresh action with last-synced timestamp.
- Read-only export is reserved for a later approved format.

### 4.3 Result columns

Each itinerary row shows:

- Customer Code and customer name.
- Adult/Child/Infant pax.
- Arrival and departure dates.
- Arrival/departure flight and time where applicable.
- Day number and Day title active on the selected date.
- Transport requirement count.
- TOC requirement count.
- Driver assignment summary.
- Current source revision.
- Readiness notices.

The primary action opens the exact Daywise Transport/driver context. Filtering
or opening a row never changes an operational status.

## 5. Work area B — New Itinerary Transport and TOC intake

### 5.1 Entry

New or revised published itineraries appear in a Transport Work Inbox. Opening
an item loads:

- The published itinerary/reference document.
- Arrival, departure, flights, and pax.
- Day 1..N with service date, Day title, time, and Daywise notes.
- Existing Transport/TOC items for the exact source revision.
- Read-only Vendor, Additional Service, and other department items when useful
  for coordination.

### 5.2 Transport requirement fields

The first Transport item contract includes:

- Stable `service_id`.
- `tour_day_id`, Day number, and service date.
- Activity/service description.
- Pickup time and location.
- Drop-off location.
- Quantity.
- Transport supplier.
- Transport Product/vehicle requirement.
- Operational notes.
- Rate readiness reference (`RATE_READY` or `PENDING_RATE`).
- Source revision and record version.

Rate readiness is visible but does not block recording the operational
requirement. Cost approval remains outside this first scope.

### 5.3 TOC requirement fields

The first TOC item contract includes:

- Stable `service_id`.
- `tour_day_id`, Day number, and service date.
- TOC service/location.
- Planned time.
- Quantity or pax basis where applicable.
- Supplier/Master reference.
- Route, access, parking, or operational note.
- Rate readiness reference.
- Source revision and record version.

Detailed TOC payment/submission rules remain outside this first scope.

### 5.4 Draft and publish behavior

- Save locally as a Transport draft first.
- Publish only Transport-owned items through an idempotent Apps Script route.
- A publish retry reuses the same service IDs and idempotency key.
- Partial or failed sync remains `PENDING_SYNC`; it does not create duplicates.
- Publishing Transport/TOC does not mark Vendor, Reservation, or the whole
  itinerary complete.

## 6. Work area C — Set Driver Detail from Daywise

### 6.1 Extraction rule

The page extracts current `TRANSPORT` service rows from the latest applicable
Daywise revision. TOC-only rows do not require a driver unless a later rule
explicitly links them to a Transport service.

Rows are grouped visually by:

```text
Customer Code → Day/date → Transport service
```

### 6.2 Assignment level

The canonical assignment is per Transport service, not only per Day. This
supports two or more vehicles/drivers on the same date.

For fast entry, the UI may provide:

- Apply the same driver to all selected Transport services on one Day.
- Apply the same driver to a selected date range.

Bulk apply still creates or updates an assignment for each stable Transport
service; it never collapses multiple services into one ambiguous record.

### 6.3 Initial driver fields

Required:

- Driver name.
- Driver phone/WhatsApp number in normalized international format.

Context/read-only or optional in the first iteration:

- Transport supplier.
- Transport Product/vehicle requirement.
- Vehicle number/type when later approved.
- Pickup time/location.
- Assignment note.

The design may suggest a Driver Master match, but staff can enter an organic
driver when the approved driver does not yet exist. Whether organic entries
automatically create Driver Master records remains an open decision.

### 6.4 Driver assignment states

Driver assignment state is separate from Transport requirement state:

- `NOT_ASSIGNED`
- `DRAFT`
- `ASSIGNED`
- `REVISION_REVIEW`
- `CANCELED`
- `PENDING_SYNC`

`ASSIGNED` means the required driver name and normalized number are recorded.
It does not automatically mean the driver confirmed, the service completed, or
the supplier invoice is approved.

Every reassignment preserves the previous driver, number, actor, timestamp,
source revision, and reason.

## 7. Revision handling

When a revised itinerary affects date, time, route, Transport Product, or the
underlying Day/service:

- Existing assignments are not silently deleted.
- Unaffected stable services retain their current assignment.
- Affected assignments become `REVISION_REVIEW`.
- Removed services retain history and require an explicit cancel decision.
- New services start as `NOT_ASSIGNED`.
- The operator sees old and new values before choosing keep, revise, reassign,
  add, or cancel.

## 8. Permission baseline

- Transport staff: read itinerary context; create/revise Transport and TOC
  requirements; assign/reassign drivers.
- Transport supervisor/approved All Rounder: same operations plus later
  controlled override.
- Reservation and Vendor: read Transport result required for coordination; no
  Transport mutation.
- Manager/Admin: read/audit by default; master-data maintenance stays in the
  existing Manager/Admin area.

Apps Script remains the final permission and business-rule gateway.

## 9. Suggested menu mapping

The existing foundation can be activated without adding duplicate menus:

| Existing menu | First activated purpose |
| --- | --- |
| `New Itinerary Check` | Daywise Transport and TOC intake |
| `Revise Itinerary Check` | Revision impact and keep/revise/reassign/add/cancel decisions |
| `Set Driver Detail` | Driver assignment from extracted Transport Daywise services |
| `Review Arrival per Date` | Rename or broaden to `On Ground per Date` |

`Add Cost`, `Cek KPI`, `Review Day Tour`, `Invoicing`, and full TOC payment
handling remain inactive until separately discussed.

## 10. Delivery sequence

1. Build the shared Transport read model and date inclusion rules.
2. Activate On Ground by Date as read-only.
3. Activate Transport/TOC local drafts in New Itinerary.
4. Add idempotent Transport/TOC publication and readback.
5. Activate Daywise driver assignment with per-service stable IDs.
6. Add revision-impact handling and assignment history.
7. Expose approved read-only result to other departments/mobile.
8. Run controlled UAT before enabling routine operational use.

## 11. Initial UAT gates

- A selected date returns arrivals, departures, and stay-through itineraries
  exactly once.
- An itinerary outside the selected date does not appear.
- Daywise dates and titles match the latest published revision.
- Transport can edit only `TRANSPORT` and `TOC` items.
- Multiple Transport services on one Day can hold different drivers.
- Bulk driver apply produces distinct service assignments.
- Driver number validation accepts the approved international format.
- Revision changes flag affected assignments without deleting history.
- Offline/save/sync retry does not duplicate requirements or assignments.
- Vendor and Reservation views remain read-only for Transport-owned fields.

## 12. Open owner decisions

These points remain intentionally open for the next discussion:

1. Whether `LUGGAGE_VAN` belongs to Transport in this same intake.
2. Whether On Ground includes canceled/no-show itineraries behind a filter or
   excludes them completely.
3. Whether driver entry is free text first, Driver Master first, or both.
4. Whether driver confirmation requires a separate status/evidence.
5. Vehicle fields required with the first driver assignment.
6. Whether one service can have multiple drivers/vehicles as separate units.
7. Final On Ground export columns and file format.
8. TOC submission, payment, and exception rules.
9. Who can approve manual Transport/TOC rate exceptions.
10. The final version number and implementation/UAT release boundary.
