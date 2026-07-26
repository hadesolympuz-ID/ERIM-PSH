# ERIM-PSH Architecture Baseline

## Approved direction

ERM-PSH has two distinct client surfaces.

```text
MOBILE MONITORING
status.peakseasonholidays.com
  -> Hostinger HTTPS
  -> Installable read-only PWA
  -> Google authentication
  -> Google Apps Script read API
  -> Published Google data and authorized links

DESKTOP OPERATIONS
Department user PC
  -> Desktop workspace
  -> Per-user local temporary database
  -> Validate + Complete/Post
  -> Google Apps Script publish API
  -> Published Google database / Drive documents / Gmail references
```

No Vercel, PostgreSQL, Play Store package, or independently hosted application
server is required for the MVP.

## Client modes

### Mobile

Hostinger and `status.peakseasonholidays.com` are used only for the mobile
monitoring PWA.

Mobile capabilities:

- Sign in with an approved Google account.
- Search tour by Customer Code.
- View published itinerary and department progress.
- View on-ground driver, vehicle, and service details.
- View pending supplier confirmations.
- Open authorized confirmation, quotation, booking, portal, itinerary, and
  supporting-document links.
- View timestamps and published operational timeline.

Mobile does not create, revise, send, approve, price, pay, or change official
status. Apps Script must reject mutation requests even if someone constructs
the request manually.

### Desktop

Desktop is the operational workspace. Each authorized department user has an
isolated local temporary database on their own PC.

The local database stores:

- unfinished drafts
- imported/pulled published input required for the current task
- generated-but-not-yet-posted packages
- pending uploads and retry jobs
- local working notes that are not yet official

When a department completes work, the desktop application publishes a
controlled result through Apps Script. Only the published result becomes
visible to downstream departments and mobile monitoring.

## Department publication chain

Department databases must never be read directly by other user PCs.

```text
Reservation local draft
  -> Reservation publication
  -> Vendor local draft based on published Reservation version
  -> Vendor publication
  -> Transport / Ops Accounting local work based on published chain
  -> Department publications
  -> Cashier / Manager / mobile read published results
```

Each publication links to its source rather than copying or rewriting another
department's local database. Minimum publication-control fields:

- `publication_id`
- `tour_id`
- `customer_code`
- `department`
- `publication_type`
- `source_publication_id`
- `source_record_version`
- `published_record_version`
- `content_hash`
- `published_at`
- `published_by`
- `status`

This preserves an auditable chain while allowing each department to work
independently. A local path such as `C:\...` must never be used as a downstream
system link because another PC or mobile device cannot reliably access it.

## Data authority

- Per-user local database: temporary department workspace.
- Google published database: authoritative completed/postable records.
- Google Drive: authoritative documents and evidence.
- Gmail: authoritative email threads.
- Mobile PWA: read-only projection of published data.

Local data becomes eligible for publication only after validation and explicit
Complete/Post. After successful publication, the local record stores the
returned publication ID and published version and becomes read-only unless a
new controlled revision is created.

## Synchronization safety

Every publish operation must:

1. authenticate the Google user
2. verify active employee, department, role, and desktop access
3. validate mandatory fields and permitted mutations
4. compare the user's source/base version with the latest published version
5. reject stale work and require refresh/review
6. use an idempotency key to prevent duplicate posting
7. acquire a central lock for version/ID generation
8. write the official records and publication manifest
9. append an audit event
10. return publication ID, official version, and timestamp
11. mark the local job synced only after confirmed success

If network or posting fails, the local operation remains `PENDING_SYNC` and can
be retried with the same idempotency key.

## Email and external-channel linkage

### Reservation

Reservation links the received confirmation email to the Tour/Customer Code:

- Gmail thread ID
- Gmail message ID when needed
- subject snapshot
- sender
- received timestamp
- open-thread URL generated for an authorized user

### Ops Accounting

Ops Accounting links the received quotation email to the same Tour/Customer
Code:

- Gmail thread ID
- Gmail message ID when needed
- quotation reference
- sender
- received timestamp
- open-thread URL generated for an authorized user

### Vendor booking by email

Each email-channel supplier booking links its own booking record to:

- booking ID
- vendor ID
- Gmail thread/message ID
- generated subject/body snapshot
- attachment Drive file IDs
- sent/reply/confirmation timestamps
- latest communication status

### Vendor booking by WhatsApp

WhatsApp is initially controlled as assisted/manual evidence:

- approved target phone or group label
- generated final message snapshot
- attachment Drive file IDs
- `COPY_READY`, `SENT_MANUAL`, or `CONFIRMED` status
- sent/confirmed timestamp and actor
- optional screenshot/proof file in Drive

The system should not claim automatic WhatsApp delivery unless an approved
official API/integration is implemented later.

### Vendor booking through an external portal

For portals such as a ferry or supplier booking site:

- channel type `PORTAL`
- portal/vendor name
- portal URL
- external booking reference
- booked service/date
- submitted timestamp and actor
- portal status
- last checked timestamp
- proof/confirmation PDF or screenshot in Drive
- portal notes or failure reason

MVP recommendation: open the portal from ERIM-PSH, complete the booking
manually, then return and record the reference/status/evidence. Browser
automation is deferred until the portal terms, login method, stability, and
business value are reviewed.

## API boundary

Clients never receive:

- spreadsheet or Drive write credentials
- Apps Script secrets
- unrestricted Gmail access
- authorization based only on client-provided role or device mode

Every API call independently validates the user, employee status, department,
permission, requested fields, source version, and action.

## Environments

- DEV: personal Google account, dummy records, test recipients.
- STAGING: production-like schema, controlled test users.
- PROD: company-owned Workspace, Shared Drive, deployment, and recovery owner.

All Google IDs, resource URLs, and local database paths are environment
configuration and must not be hard-coded into shared business logic.

