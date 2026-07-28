# ERIM-PSH Trial Issue Record

This record contains issues observed during hands-on trial testing. An item
remains `OPEN` until its acceptance conditions are implemented and retested in
the packaged desktop application.

## v1.1.5 trial — 2026-07-28

### UAT-115-001 — Supplier Master publish must be split by Type and dependency stage

**Status:** `OPEN`  
**Priority:** High  
**Area:** Manager/Admin → Supplier Master → Local Pending publication

**Observed**

Publishing Supplier, Product, Contract, and Rate changes directly in one mixed
operation can fail. Product and Contract records depend on Supplier records
already existing in the central source.

**Required behavior**

- Publication is scoped to one Supplier Type at a time.
- Within that Type, publication runs in dependency stages:
  1. Supplier
  2. Product
  3. Contract and Rate
- A later stage only starts after the previous stage succeeds and the central
  source is refreshed/confirmed.
- A failed stage stops later stages without losing successful earlier stages or
  unresolved Local Pending records.
- The review screen clearly shows Type, stage, selected count, success, failure,
  and remaining pending count.

**Acceptance test**

Create new Transport suppliers, products, contracts, and rates locally. Publish
the Transport Type. Verify that Supplier completes first, Product second, and
Contract/Rate last; all central relationships resolve and no direct mixed-batch
failure occurs.

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

