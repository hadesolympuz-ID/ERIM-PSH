# ERIM-PSH Supplier Import / Export SOP

Document status: `APPROVED IMPLEMENTATION BASELINE`  
Effective release: `v1.1.3`  
Owner: `Manager / Admin`

## 1. Scope

Open `Manager / Admin > Import / Export Data`.

The current menu supports exactly one Type per operation:

- Vendor
- TOC
- Transport
- Luggage Van
- Additional Service

Hotel is deliberately excluded. Hotel will later use the same Excel engine from
a separate Hotel submenu with its own seasonal model for Low Season, High
Season, Peak Season, surcharges, and optional services such as Spa or
Candlelight Dinner.

## 2. Official workbook

Always start with `Download Excel template`. Do not rename required sheets or
headers.

The workbook contains:

- `README`, `LOOKUPS`, and `EXAMPLES`;
- `SUPPLIERS`;
- `CONTACTS`;
- `RECIPIENTS`;
- `BOOKING_SOPS`;
- `PRODUCTS`;
- `CONTRACTS`;
- `CONTRACT_RATES`;
- `IMPORT_ISSUES`.

Dates use `yyyy-mm-dd`. WhatsApp and phone values retain the international `+`
prefix, for example `+62 812-3916-9392`.

## 3. Import procedure

Import is `CREATE ONLY`.

1. Choose one Type.
2. Select the completed `.xlsx` file.
3. ERIM-PSH validates every required sheet/header and previews each data row.
4. Review `READY`, `CONFLICT`, and `INVALID` counts and explanations.
5. Export conflicts when a separate correction list is needed.
6. Choose `Save valid data locally`.
7. Open Pending Supplier Master, review the local records, and publish the
   selected batch to Google.

The Excel import never overwrites an existing Supplier, Contact, Recipient,
Booking SOP, Product, Contract, or Contract Rate. It may create a new child
record under an existing supplier when that child is not already present.

A new Contract requires at least one valid Contract Rate row in the same
workbook. Existing contracts are maintained from Supplier Master, not replaced
through Excel.

## 4. Conflict procedure

Every import analysis is stored locally as an auditable batch. A conflict row
records its source sheet/row, conflict code, explanation, existing record, and
recommended action.

Use either:

- `Open existing` to maintain the record in Supplier Master; or
- `Export conflicts` to create the same workbook format populated with the
  rejected rows and `IMPORT_ISSUES`.

Corrected rows may be copied into a fresh official template and imported again.
Rows already saved locally also count as existing records and are protected
from accidental duplicate import.

## 5. Export procedure

1. Choose one Type.
2. Apply optional Location, Product, Supplier Status, Contract Status, Rate
   State, Booking Channel, and validity-date filters.
3. Check individual suppliers or use `Select all filtered`.
4. Choose `Export selected`.

The output uses the same workbook structure accepted by Import, so it can be
reviewed, copied, or used as a controlled reference. Because Import is
create-only, exported existing IDs and codes cannot be used to overwrite
central records.

## 6. Publication and source of truth

Import saves valid records to the existing per-user SQLite Pending queue.
Nothing becomes central merely because a file passed validation. Authorized
Manager/Admin staff publish the reviewed queue to the Google Supplier Master in
dependency order:

1. Supplier
2. Product
3. Contract and Contract Rate

Google remains the authoritative source after publication; the local import
batch remains the audit and correction trail.
