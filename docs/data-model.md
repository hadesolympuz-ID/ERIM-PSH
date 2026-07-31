# Initial Data Model

## Local desktop database

Each authorized desktop user has a separate local temporary database. It is a
workspace and sync queue, not the company-wide authoritative database.

Recommended local tables:

- `LOCAL_PROFILE`
- `LOCAL_SETTINGS`
- `LOCAL_DRAFTS`
- `LOCAL_DRAFT_ITEMS`
- `LOCAL_SOURCE_SNAPSHOTS`
- `LOCAL_GENERATED_FILES`
- `LOCAL_SYNC_QUEUE`
- `LOCAL_SYNC_RESULTS`
- `LOCAL_ACTIVITY_LOG`
- `VENDOR_INTAKE_DRAFTS`
- `VENDOR_HOTEL_DRAFTS`
- `VENDOR_DAY_DRAFTS`
- `VENDOR_SERVICE_SPLITS`
- `LOCAL_SUPPLIER_MASTER_CACHE`

Required local control fields include:

- local record ID
- official entity ID when already published
- tour ID / Customer Code
- department
- owner employee ID
- draft status
- base/source publication ID
- base/source record version
- local revision number
- idempotency key
- sync status
- last sync attempt
- sync error
- created/updated timestamps

Recommended sync statuses:

- `LOCAL_DRAFT`
- `READY_TO_VALIDATE`
- `VALIDATION_FAILED`
- `READY_TO_POST`
- `POSTING`
- `PENDING_SYNC`
- `SYNCED`
- `CONFLICT`
- `CANCELED`

## Published Google data

Published/official tables:

- `EMPLOYEES`
- `TOURS`
- `ITINERARY_REVISIONS`
- `DEPARTMENT_PUBLICATIONS`
- `PUBLICATION_LINKS`
- `WORK_ITEMS`
- `NOTIFICATIONS`
- `NOTIFICATION_RECIPIENTS`
- `TOUR_DAYS`
- `TOUR_HOTEL_STAYS`
- `SERVICES`
- `SUPPLIER_BOOKINGS`
- `COMMUNICATIONS`
- `EXTERNAL_BOOKING_REFS`
- `DRIVER_ASSIGNMENTS`
- `PRICE_LISTS`
- `PRICE_LIST_ITEMS`
- `TOC_REQUESTS`
- `TOC_ITEMS`
- `CUSTOMER_INVOICES`
- `TRANSPORTER_INVOICES`
- `PAYMENT_REQUESTS`
- `PAYMENTS`
- `FOLLOW_UPS`
- `AUDIT_LOG`
- `SUPPLIER_TYPES`
- `SUPPLIERS`
- `SUPPLIER_CONTACTS`
- `SUPPLIER_RECIPIENTS`
- `SUPPLIER_SOPS`
- `SUPPLIER_PRODUCTS`
- `SUPPLIER_CONTRACTS`
- `CONTRACT_RATES`
- `SUPPLIER_MASTER_EVENTS`

## Supplier Master and contract authority

Supplier categories are data, not backend constants. `SUPPLIER_TYPES` therefore
drives both Manager/Admin tabs and Micro Split type choices. A supplier owns
repeatable contacts, recipients, SOP steps, and products. A contract owns
versioned rates linked to products and a validity window.

Existing contracts are never destroyed when renewed. A new contract is created
and the previous record remains available to historical booking snapshots.
Operational service rows store supplier, product, contract, and contract-rate
IDs together with the applied rate snapshot.

When no contract rate is valid on the service date, the service remains
bookable with `PENDING_RATE`. A booking-only manual rate stores reason, source,
and evidence reference and never updates the central contract rate.

## Publication chain

`DEPARTMENT_PUBLICATIONS` stores each completed department output:

- `publication_id`
- `tour_id`
- `customer_code`
- `department`
- `publication_type`
- `source_publication_id`
- `source_record_version`
- `published_record_version`
- `content_hash`
- `status`
- `published_at`
- `published_by`
- `superseded_by_publication_id`

`PUBLICATION_LINKS` records explicit upstream/downstream relationships:

- `publication_link_id`
- `tour_id`
- `from_publication_id`
- `to_publication_id`
- `relationship_type`
- `created_at`
- `created_by`

Downstream departments read official publications, never another user's local
database or local filesystem path.

## Shared official control fields

Every mutable official record includes:

- stable entity ID
- record version
- status
- source publication ID
- created timestamp and actor
- updated timestamp and actor
- source tour/customer code
- archived flag where applicable

## Email references

Stable references are stored instead of unrestricted mailbox content.

### Reservation confirmation

- tour ID / Customer Code
- communication type `CONFIRMATION`
- Gmail thread ID
- Gmail message ID
- sender
- subject snapshot
- received timestamp

### Ops Accounting quotation

- tour ID / Customer Code
- communication type `QUOTATION`
- Gmail thread ID
- Gmail message ID
- quotation reference
- sender
- subject snapshot
- received timestamp

### Vendor email booking

- supplier booking ID
- vendor ID
- communication type `SUPPLIER_BOOKING`
- channel `EMAIL`
- Gmail thread/message ID
- final sent-content snapshot
- attachment Drive file IDs
- sent/reply/confirmation timestamps

## WhatsApp and portal references

`EXTERNAL_BOOKING_REFS` supports channels not represented by Gmail:

- `external_booking_ref_id`
- `tour_id`
- `booking_id`
- `vendor_id`
- `channel`
- `portal_name`
- `target_label`
- `target_address_or_url`
- `external_reference`
- `message_snapshot`
- `status`
- `submitted_at`
- `submitted_by`
- `last_checked_at`
- `proof_file_ids`
- `notes`

For WhatsApp, store generated content and manual evidence. For portal bookings,
store portal reference, latest status, and proof. Do not store portal passwords
in Sheets or the shared source repository.

## Document references

- current itinerary Drive file ID
- revision/supporting file IDs
- invoice Drive file ID
- booking-package file IDs
- payment-proof Drive file ID
- external booking evidence file IDs

The API converts permitted references into safe open links for the current
authenticated user.
