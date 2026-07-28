# ERIM-PSH Trial Issue Record

This record contains issues observed during hands-on trial testing. An item
remains `OPEN` until its acceptance conditions are implemented and retested in
the packaged desktop application.

## v1.1.5 trial — 2026-07-28

### UAT-115-001 — Supplier Master publish must be split by Type and dependency stage

**Status:** `IMPLEMENTED / APPS SCRIPT DEPLOYMENT + LIVE UAT PENDING`
**Priority:** High  
**Area:** Manager/Admin → Supplier Master → Local Pending publication

**Observed**

Publishing Supplier, Product, Contract, and Rate changes directly in one mixed
operation can fail. Product and Contract records depend on Supplier records
already existing in the central source.

**Required behavior**

- Staff may select the full related set in one action; the desktop creates one
  persistent Publish Session and performs the dependency orchestration.
- Before publishing, the session validates the complete
  Supplier -> Product -> Contract -> Rate graph and reports missing or invalid
  relationships without discarding valid records.
- Publication is isolated by Supplier Type so failure in one Type does not
  interrupt another Type.
- Within each Type, publication runs in dependency stages:
  1. Supplier
  2. Product
  3. Contract and Rate
- Large stages are divided into safe backend chunks without requiring staff to
  select or publish each chunk manually.
- A later stage only starts after the previous stage succeeds and every
  dependency is confirmed by Google readback.
- A failed stage stops later stages without losing successful earlier stages or
  unresolved Local Pending records.
- A stopped session can resume only its failed, blocked, or unprocessed records;
  records already confirmed in Google are not republished.
- The review screen clearly shows Type, stage, batch, selected count, success,
  failure, conflict, blocked, and remaining pending count.
- Live progress identifies the current Supplier/Product/Contract item and uses
  the statuses `WAITING`, `PUBLISHING`, `VERIFYING`, `SYNCED`, `CONFLICT`,
  `FAILED`, and `BLOCKED_BY_DEPENDENCY`.
- Overall percentage is calculated from records confirmed by Google readback,
  not merely from requests sent:
  `confirmed records / total selected records * 100`.
- Closing the progress dialog does not stop publication; the current and
  previous Publish Sessions remain available from session history.
- Final reconciliation refreshes the complete Google Supplier Master into
  SQLite and then refreshes every dependent Micro Split catalogue.

**Acceptance test**

Select a 94-record Transport set containing new Suppliers, duplicated Products,
Contracts, and Rates, then publish it in one action. Verify Supplier completes
first, Product second, and Contract/Rate last; progress is visible down to the
current item and confirmed percentage; every central relationship resolves;
and an interrupted session resumes without duplicates or missing records.

---

### UAT-115-002 — Department dashboard click conflicts with submenu collapse

**Status:** `OPEN`  
**Priority:** High  
**Area:** Main sidebar navigation

**Observed**

Parent menus such as Reservation and Vendor Booking currently serve as both the
department-dashboard link and the submenu collapse control. After opening a
submenu, clicking the parent again collapses the submenu but does not reliably
open the department dashboard.

**Required behavior**

- Clicking the parent menu label always opens that department's dashboard.
- Expanding/collapsing the submenu uses a separate control area.
- The sidebar remains full-text; no icon-only menu is introduced.
- The active department and submenu remain visible and are restored after the
  whole sidebar is hidden and shown again.
- Keyboard and accessible labels distinguish `Open dashboard` from
  `Expand/collapse submenu`.

**Acceptance test**

Open a child page under Reservation, Vendor Booking, Transport, and
Manager/Admin. For each department, select the parent label and verify its
dashboard opens. Separately operate the submenu control and verify it only
changes submenu visibility.

---

### UAT-115-003 — Product duplication needs multi-select tracking

**Status:** `OPEN`  
**Priority:** High  
**Area:** Manager/Admin → Supplier Master → Products

**Observed**

Duplicating one Product at a time makes large Transport catalog entry difficult
to track. Staff can forget which vehicle/service Product was already copied and
can skip an item.

**Required behavior**

- Product cards/rows provide selection checkboxes.
- The selected supplier view provides `Select all visible`, clear selection,
  selected count, and `Duplicate selected`.
- Filtering/searching does not silently lose the current selection; the UI
  shows the total selected count.
- One duplicate operation accepts multiple source Products and one or more
  destination suppliers.
- Preview displays the Product × destination-supplier copy matrix before local
  staging.
- Results report created, skipped conflict, and failed combinations per Product
  and supplier.
- Successful copies enter Local Pending with new Product/Contract/Rate IDs and
  preserve the existing no-overwrite conflict rule.

**Acceptance test**

Select several Transport vehicle Products, copy them to multiple Transport
suppliers, and verify every selected Product/supplier combination is visible in
preview and result. Existing same-name Products must be reported as conflicts
without overwriting data.

---

### UAT-115-004 — Published Supplier Master catalogue is lost in Micro Split

**Status:** `IMPLEMENTED / PACKAGED UAT PENDING`
**Priority:** Blocker
**Area:** Vendor Booking → New Itinerary → Daywise Micro Split

**Observed**

Supplier, Product, Contract, and Contract Rate records are present and active in
the central Google Supplier Master, but published Suppliers and Products do not
automatically appear in Micro Split. Loading an itinerary can replace the
complete local catalogue with a legacy suggestions payload that does not carry
the Supplier Master relationships.

**Confirmed technical gaps**

- Vendor Intake context omits the Supplier, Product, Contract, and raw Rate
  catalogue required by the current Micro Split controls.
- Loading an itinerary can overwrite a complete UI catalogue with an incomplete
  suggestions payload.
- Startup Supplier Master synchronization updates SQLite but does not refresh
  the renderer catalogue when the background sync completes.
- The SQLite fallback requires a currently valid Rate before it accepts the
  dynamic catalogue, incorrectly hiding Suppliers and Products that should be
  selectable as `PENDING_RATE`.
- Rate candidates are initially filtered using the current date instead of
  being resolved independently against each Day service date.

**Required behavior**

- Vendor Intake provides or resolves the complete active Supplier Master
  catalogue from SQLite.
- Itinerary data and catalogue data have separate ownership; an empty or older
  itinerary suggestions payload cannot erase a newer local catalogue.
- Successful startup sync, Supplier Master publish, and Publish Session final
  reconciliation automatically refresh Micro Split.
- Offline startup retains and displays the last valid SQLite catalogue.
- Type, Supplier, and Product remain selectable without a valid Contract or
  Rate; the selected item becomes `PENDING_RATE` and booking may continue.
- Contract Rate selection uses the service date of the relevant Day. Future,
  current, and expired validity are evaluated independently per Day.
- A booking-only manual rate remains available for `PENDING_RATE` and does not
  modify Supplier Master.

**Acceptance test**

Publish a new Supplier and Product, load and reload a Vendor itinerary, and
verify both remain selectable in Micro Split. Repeat without a Contract, with a
future Contract, with an active Contract, with an expired Contract, and while
offline. Verify the correct `PENDING_RATE` or `RATE_READY` result for each Day
service date and confirm that opening the itinerary never clears the catalogue.

---

### UAT-115-005 — New Product and Contract editor opens below long record lists

**Status:** `IMPLEMENTED / PACKAGED UAT PENDING`
**Priority:** High
**Area:** Manager/Admin → Supplier Master → Product and Contract sections

**Observed**

Selecting `Add Product` or `Add Contract` appends the new editor below all
existing records. Suppliers with many Products or Contracts force staff to
scroll from the action at the top to the new form at the bottom for every entry.

**Required behavior**

- `Add Product` and `Add Contract` insert the new editor at the top of their
  respective section, immediately below the section heading and action controls.
- After insertion, the section scrolls only as far as required to reveal the
  new editor and focus its first required field.
- Existing Product or Contract records remain below the new editor in their
  normal sort order.
- Only one unsaved new editor of the same entity kind is opened at a time;
  selecting Add again focuses the existing unsaved editor.
- Saving or cancelling removes the temporary new-editor state without changing
  the user's wider Supplier Master scroll position.
- Editing an existing record keeps that record in context and does not move it
  to the top.
- The behavior remains usable on short and long lists and does not introduce
  overlapping columns or horizontal scrolling at supported desktop widths.

**Acceptance test**

Open a Supplier containing a long Product list and a long Contract list.
Select `Add Product` and `Add Contract` from a scrolled position. Verify each new
editor appears at the top of its section, the first required field receives
focus, repeated Add does not create duplicate blank editors, and Save/Cancel
returns staff to the same working context without scrolling to the bottom.

---

## Next rehabilitation gate before adding more operational items

The next implementation package must be completed as one controlled foundation
update in this order:

1. Persistent dependency-aware Publish Session and Google readback.
2. Live per-item progress, confirmed percentage, history, and safe resume.
3. Complete Supplier Master payload and SQLite fallback correction.
4. Non-destructive renderer catalogue refresh and background-sync propagation.
5. Per-Day contract-rate resolution and `PENDING_RATE` behavior.
6. Top-positioned Product and Contract creation editors with focus and
   scroll-context preservation.
7. Regression tests plus packaged UAT using the 94-record Transport scenario.

Further Vendor Booking and Transport operational item expansion should begin
only after this gate passes, because those modules depend on the same Supplier,
Product, Contract, Rate, and Micro Split authority.
