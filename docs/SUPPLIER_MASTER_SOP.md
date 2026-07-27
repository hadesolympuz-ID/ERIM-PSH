# ERIM-PSH Supplier Master and Contract Rate SOP

Document status: `APPROVED IMPLEMENTATION BASELINE`  
Effective release: `v1.1.0`  
Owner: `Manager / Admin`  
Authoritative source: `ERIM-PSH Google Sheet + Google Drive`

## 1. Purpose

Supplier Master is the only maintained source for Vendor, TOC, Transport,
Luggage Van, Additional Service, and future supplier categories. Operational
screens consume this source; they do not maintain their own vendor or rate
lists.

Changes saved by Manager/Admin are immediately active, appended to the audit
record, and announced to all active ERIM-PSH users.

## 2. Menu and screen

Open `Manager / Admin > Supplier Master`.

- Type tabs select a supplier category.
- The left section maintains supplier identity, booking contacts, recipients,
  and booking SOP.
- The right section maintains products/services and contract rates for the
  selected supplier.
- `Add Type` creates a future category without a backend syntax change.

Archived records remain in history but are removed from new operational
selection.

## 3. Supplier Type procedure

1. Select `Add Type`.
2. Fill a permanent uppercase code, display name, description, and display
   order.
3. Save once the category is operationally approved.
4. Never reuse an existing code for a different meaning.
5. Archive an unused type only after its suppliers and active contracts have
   been reviewed.

Initial types are:

- `VENDOR`
- `TOC`
- `TRANSPORT`
- `LUGGAGE_VAN`
- `ADDITIONAL_SERVICE`

## 4. Supplier profile procedure

Select a type and an existing supplier, or choose `New Supplier`.

Complete the applicable fields:

- official supplier name and optional legal name;
- booking channel: Email, WhatsApp, Email + WhatsApp, Portal, or Others;
- timezone, address, website/portal URL, tax and payment information;
- operational booking notes;
- one or more contact persons, each with role, phone, WhatsApp, and email;
- one or more booking recipients marked `TO`, `CC`, or `BCC`;
- one or more SOP steps with sequence, channel, instruction, lead time,
  escalation contact, and notes.

Recipient rows are unlimited. This supports a booking email with twelve or more
CC addresses without storing them inside one text field.

Save the supplier only after checking that the primary booking destination and
escalation path are usable.

## 5. Product/service procedure

Select a supplier, then add or edit a product in the right section.

Fill:

- service/product name and optional code/category;
- default price basis and unit;
- inclusion and exclusion;
- terms and conditions;
- cancellation policy;
- lead time and cutoff;
- location/area, capacity, and operational notes.

A product describes what is booked. Its price belongs to a contract rate, not
to the supplier or product profile.

## 6. Contract procedure

1. Select `New Contract`.
2. Fill contract number, currency, validity start and end dates, signed date,
   contract notes, and terms.
3. Upload the contract document when available. The file is stored below
   `Supplier Contracts/{Supplier ID - Supplier Name}` in the official Drive
   folder.
4. Add one or more rate rows. Each row links a product to a price basis, amount,
   currency, and optional row-level validity.
5. Save after checking date range, products, amounts, and source document.

The system blocks overlapping contracts for the same supplier and product
unless Manager/Admin records an explicit exception reason.

Contract state is derived from the current date:

- `SCHEDULED`: validity has not started;
- `ACTIVE`: currently valid;
- `EXPIRING`: valid and inside the expiry warning window;
- `EXPIRED`: validity has ended;
- `SUPERSEDED`, `CANCELLED`, or `ARCHIVED`: retained for history and excluded
  from new automatic rate selection.

For a renewal, create a new contract. Do not overwrite the old validity and
rates. The old contract remains the historical source for prior bookings.

## 7. Expiry and notification procedure

A daily central check evaluates contract validity. Warnings are created at
90, 60, 30, 14, 7, and 1 day before expiry, on the expiry date, and once after
expiry. Notifications are delivered to every active user with ERIM-PSH access.

Manager/Admin should:

1. review the expiring supplier and affected products;
2. request and upload the renewal;
3. create the new contract and rate rows;
4. verify the new validity before archiving or superseding an obsolete record.

## 8. Micro Split and pending-rate rule

Micro Split always displays:

1. Type
2. Supplier
3. Supplier Service / Product

The available options come from active Supplier Master records. For the service
date, the system applies only a valid contract rate.

If no valid contract rate exists:

- the item becomes `PENDING_RATE`;
- booking generation and sending by Email, WhatsApp, Portal, or another channel
  may continue;
- a booking-only manual rate may be entered at split time or later;
- manual rate requires a reason and source (`EMAIL`, `WHATSAPP`, `QUOTATION`,
  `PHONE`, `PORTAL`, or `OTHERS`);
- an evidence reference should identify the supporting email, thread, file,
  quotation, or note;
- the manual rate does not modify Supplier Master and does not become a future
  default.

This separates operational booking progress from commercial rate completion.

## 9. Archive and audit

Deletion is implemented as controlled archive so historical bookings never
lose their supplier, product, contract, or rate reference. Archive requires a
reason.

Every create, edit, archive, initialization, and expiry event records actor,
timestamp, entity, and change context in `AUDIT_LOG` and
`SUPPLIER_MASTER_EVENTS`.

## 10. Initial seed and migration

Initialization creates the Supplier Master tables and migrates the existing
`VENDOR_RATE_MASTER` and `TOC_MASTER` records. It also seeds temporary Transport
and Luggage Van examples and:

- Additional / Garland
- Additional / Water

Temporary records must be replaced with verified supplier and contract data
before production financial use.

