# ERIM-PSH Vendor Booking — Implementation Base Plan

Document status: `APPROVED BASELINE`
Prepared: 2026-07-27
Target sequence: v1.0.8-v1.1.x

## Supplier Master foundation — v1.1.0

The Manager/Admin `Supplier Master` submenu is the shared foundation for all
Vendor Booking rate and booking-address selection. It supports data-driven
types, repeatable contacts/recipients/SOP steps, product details, contract
documents, dated contract rates, controlled archive, audit, and broadcast
notifications.

Micro Split reads Type, Supplier, and Product from this source. A missing or
expired contract produces `PENDING_RATE` but does not block booking delivery.
A booking-only manual rate requires reason and source and does not alter the
master contract. The operating procedure is recorded in
`docs/SUPPLIER_MASTER_SOP.md`.

## 1. Purpose

This document is the focused implementation baseline for the ERIM-PSH Vendor
Booking module. It converts the approved operational discussion into buildable
phases, data ownership, statuses, online/local tables, controls, and acceptance
criteria.

The module supports staff judgement instead of replacing it. The system must
reduce missed bookings, wrong confirmation interpretation, repeated window
switching, duplicate work, and unclear responsibility while keeping operational
details organically editable.

## 2. Confirmed ownership

| Area | Owner | Rule |
| --- | --- | --- |
| Customer Code and itinerary | Reservation | Reservation remains the case owner and final customer/agent-facing sender. |
| Daywise and micro-item breakdown | Vendor Booking | Vendor converts the exact published itinerary revision into operational services and supplier bookings. |
| Individual booking result | Vendor Booking / All Rounder | Every required micro-item is independently reviewed and resolved. |
| Final Vendor completion | Vendor Booking | `VENDOR_BOOKING_COMPLETE` may be published only after every required item is resolved. |
| Final itinerary check/send | Reservation | Vendor completion creates a targeted Reservation final-check task. |
| Override and audit review | Manager / All Rounder | Controlled takeover and exception resolution are append-only audited actions. |

## 3. Menu hierarchy

```text
Vendor role Dashboard (home)
  Urgent
  Pending
  Replied
  Done

Vendor Booking
  Notification Inbox (shared generic component)
    Display event totals and latest information only
    New Itinerary count
    Revised Itinerary count
    Other permitted event counts

  New Confirmation
    Load Customer Code
    View source confirmation and itinerary
    Build daywise
    Split micro-items
    Assign program/vendor/channel
    Group supplier bookings

  Generating Booking
    Load selected Customer Code/supplier booking
    Generate booking from approved template
    Preview recipients/body/attachments
    Send or record external action

  Revise Confirmation
    Load exact old and new itinerary revisions
    Review revision impact
    Decide per affected item
    Amend/rebook/cancel/add
    Re-check affected bookings

  Re-check Booking
    Search Customer Code
    Filter unresolved/reply received/confirmed/canceled
    Open linked email thread or external evidence
    Confirm / Not Confirmed / Review Again / Cancel
    Complete Vendor process
```

Vendor master maintenance is an Administrator Settings function, not a normal
Vendor Daily menu. Operational staff select approved records through Universal
Lookup and do not edit the raw master table.

### 3.1 Vendor role dashboard

Each department will eventually have a different dashboard composition and menu
content. The Vendor role dashboard is the first department-specific dashboard.
It contains four fixed sections with independent vertical scrolling, sticky
section headers, item counts, loading/empty/error states, and no whole-page
scroll dependency.

| Section | Record level | Inclusion rule | Primary action |
| --- | --- | --- | --- |
| `Urgent` | Customer Code with unresolved counts | More than 72 hours have elapsed since the applicable Reservation New/Revise/Cancel publication and at least one required Vendor item is either not split into micro-items or not resolved as confirmed/canceled according to the approved action. | Open the exact unresolved context: New/Revise workspace for missing split or Re-check Booking for unresolved supplier result. |
| `Pending` | Supplier booking package | Micro-item split exists, but the required outbound booking/amendment/cancellation communication has not reached `SENT`. | `Generate Booking` opens the `Generating Booking` submenu with Customer Code, booking ID, source revision, and action type preloaded. |
| `Replied` | Supplier booking/reply | A linked inbound vendor response exists and the newest reply has not completed human review. Receiving an email does not automatically mean confirmed. | Open Re-check Booking beside the linked email thread and append a review-open event. |
| `Done` | Customer Code summary | Vendor processing is complete and check-in date is after today but no later than today + 7 calendar days. If today is day 1, the visible window is day 2 through day 8. | Read-only information only; no mutation button. |

Time calculations use the configured operational timezone, initially
`Asia/Makassar`. The 72-hour Urgent clock starts from the exact Reservation
publication that created the Vendor action, not from the first time a Vendor
staff member opens it. A later applicable revision/cancel event has its own
source publication time and affected-item clock.

These sections are independent operational views, not mutually exclusive
business statuses. An item older than 72 hours that receives a new reply may
appear in both `Urgent` and `Replied`. Both cards point to the same stable
booking/service ID and central claim, so they cannot create two editable
records. The Customer Code may show aggregated counts, such as `2 urgent`, `3
pending`, and `1 replied`, and clicking a count opens the exact micro-items.
`Done` remains a Customer Code summary and is excluded as soon as an unresolved
later revision exists.

Minimum visible card information:

- Customer Code and Customer Name;
- New / Revise / Cancel source action and itinerary revision;
- arrival/check-in date;
- age since Reservation publication or reply time;
- unresolved/split/replied/confirmed item counts;
- current owner/claim state;
- next required action;
- latest operational note/reason.

The dashboard is a derived read model. It does not become another official
business table. Apps Script derives the online snapshot from official records;
the desktop stores a user-specific local cache for fast rendering and offline
visibility.

## 4. Non-negotiable status separation

One status column must never represent the whole workflow. The following state
groups remain separate:

| State group | Example values | Meaning |
| --- | --- | --- |
| Work item | `NEW`, `ACKNOWLEDGED`, `CLAIMED`, `IN_PROGRESS`, `FINISHED` | Who is handling the system task. |
| Service requirement | `REQUIRED`, `CHANGED`, `REMOVED`, `RESOLVED` | What the itinerary requires. |
| Supplier booking | `DRAFT`, `READY`, `ACTIVE`, `AMENDMENT_REQUIRED`, `CANCELED` | Operational supplier package. |
| Communication | `GENERATED`, `REVIEWED`, `SENT`, `DELIVERY_FAILED`, `REPLY_RECEIVED` | Email/WhatsApp/portal delivery state. |
| Supplier result | `PENDING`, `CONFIRMED`, `NOT_CONFIRMED`, `REVIEW_AGAIN`, `CANCELED` | Human-reviewed supplier outcome. |
| Revision impact | `UNCHANGED`, `ADD`, `CHANGE`, `REBOOK`, `CANCEL` | Required human decision after itinerary revision. |

Generating an email does not mean it was sent. Receiving a reply does not mean
it was confirmed. Opening a work item does not mean its booking is complete.

## 5. Core online data contract

All official mutations pass through Apps Script. Desktop clients do not write
directly to raw Google Sheet rows.

| Table | Purpose | Critical identifiers/fields |
| --- | --- | --- |
| `TOURS` | Customer Code case header | `tour_id`, `customer_code`, owner, active revision |
| `ITINERARY_REVISIONS` | Immutable itinerary versions | `revision_id`, `tour_id`, revision number, Drive File ID, note |
| `WORK_ITEMS` | Department task and central claim | `work_item_id`, source revision, department, status, assigned/claimed actor, claim expiry, record version |
| `VENDORS` | Canonical vendor master | `vendor_id`, official name, channel, active/approved status, timezone, cutoff |
| `VENDOR_ALIASES` | Historical/alternate vendor spelling | `alias_id`, `vendor_id`, normalized alias |
| `PROGRAMS` | Canonical program/activity master | `program_id`, name, category, active status |
| `PROGRAM_VENDOR_MAP` | Valid program/vendor relationship | `program_id`, `vendor_id`, priority/effective dates |
| `VENDOR_CONTACTS` | Structured destination and multi-CC rules | `contact_id`, `vendor_id`, type, email/phone, To/CC role, active/effective dates |
| `TOUR_DAYS` | Stable day/date/hotel context | `tour_day_id`, `tour_id`, revision ID, day number, date, hotel/location context |
| `SERVICES` | Atomic itinerary requirement | `service_id`, `tour_day_id`, type, description, pax, source revision, lifecycle status |
| `SUPPLIER_BOOKINGS` | Booking package per vendor/channel | `booking_id`, `tour_id`, vendor ID, channel, booking status, supplier result |
| `BOOKING_SERVICES` | Many-to-many service/booking link | `booking_service_id`, `booking_id`, `service_id`, required/result status |
| `COMMUNICATIONS` | Generated/sent/reply communication | `communication_id`, `booking_id`, channel, direction, status, template version, thread/message/reference |
| `COMMUNICATION_RECIPIENTS` | Exact To/CC/BCC snapshot | `recipient_id`, `communication_id`, recipient type, address, display name |
| `BOOKING_REVIEW_ATTEMPTS` | Append-only human review result | `attempt_id`, booking/service, reviewer, opened time, evidence, previous/new result, reason |
| `EXTERNAL_BOOKING_REFS` | WhatsApp/portal references | `external_ref_id`, booking ID, channel, URL/reference, timestamps, evidence Drive ID |
| `FOLLOW_UPS` | Pending reason and next action | `follow_up_id`, booking/service, category, reason, owner, due/escalation time, resolved time |
| `NOTIFICATIONS` | Central event | `notification_id`, event type, source entity/version, created time |
| `NOTIF_RECIPIENTS` | Per-user notification delivery | notification/user, unread/read, acknowledged/resolved times |
| `DEPARTMENT_PUBLICATIONS` | Immutable department handoff | publication ID, Vendor completion status, exact source revision |
| `PUBLICATION_LINKS` | Chain lineage | upstream Reservation publication to Vendor publication |
| `AUDIT_LOG` | Append-only management evidence | event ID, actor, action, entity/version, before/after summary, timestamp |

Stable IDs are mandatory. Row number, visible description, subject text, or
current sort order must never be used as record identity.

## 6. Local desktop data contract

The local database is a work/cache layer, not the official shared truth.

| Local table | Purpose | Retention/rule |
| --- | --- | --- |
| `local_vendor_inbox` | User-specific notification/work cache | Keep visible notification history for 90 days. |
| `local_vendor_master_cache` | Authorized vendors, aliases, programs, contacts | Refresh from approved online version; no credential data. |
| `local_vendor_drafts` | Unposted daywise, service, booking, and note changes | Owned by local employee and exact source revision. |
| `local_vendor_source_snapshots` | Exact Reservation source used for comparison | Immutable per loaded source version. |
| `local_vendor_sync_queue` | Idempotent Apps Script mutations | Retry safely; never duplicate official records. |
| `local_vendor_sync_results` | Server acknowledgement and official IDs | Mark synced only after confirmed online success. |
| `local_email_review_cache` | Temporary permitted message/thread metadata | No long-term token storage; respect current user mailbox. |

Every draft stores `source_revision_id`, `employee_id`, and `record_version`.
Posting must fail with a stale-data warning if the official version changed.

## 7. Claim and concurrency contract

1. Opening an editable work item requests an atomic Apps Script claim.
2. The first successful claimant receives edit ownership.
3. A second opener sees the owner and claim time and remains read-only.
4. Read-only staff may inspect data permitted by their role.
5. Claim release, finish, expiry, and Manager/All Rounder takeover are server
   operations with record-version checks.
6. Every claim attempt and result is appended to `AUDIT_LOG`.
7. Losing a claim never silently discards a local draft; the client blocks post
   and offers a safe read/export path.

Initial claim duration: configurable, proposed 30 minutes with heartbeat while
the editable screen is active. The final duration remains a UAT decision.

## 8. Universal Lookup contract

Universal Lookup is one reusable typeahead component for vendors, programs,
hotels, agents, staff, and Customer Codes.

- Filter and re-rank on every typed character using authorized local cache.
- Exact match before prefix match; prefix before contains match.
- Program-relevant, active, approved records rank first.
- Resolve aliases visibly to a canonical stable ID.
- Support Arrow Up/Down, Enter, Escape, mouse selection, and clear.
- Show why a result matched.
- Provide an intentional `Show all` fallback.
- Never silently replace an intentional staff selection.
- Keep manual organic detail editable, for example `02 HRS SPA 13.00`.

## 9. New Confirmation flow

```text
Reservation publishes exact itinerary revision
  -> targeted Vendor notification/work item
  -> Vendor acknowledges and claims
  -> system loads itinerary + confirmation thread + current chain
  -> staff builds daywise and micro-items
  -> staff assigns program/vendor/channel
  -> system groups supplier booking packages
  -> system validates missing/duplicate/unassigned services
  -> system generates versioned communication preview
  -> staff verifies To/CC/body/attachments
  -> send or manual external record
  -> per-item reply/re-check lifecycle
  -> completion gate
  -> VENDOR_BOOKING_COMPLETE
  -> targeted Reservation final-check task
```

## 10. Revised Confirmation flow

The system may calculate dates and carry forward unchanged structured context,
but may not decide supplier impact by itself.

For each affected micro-item:

1. Compare immutable old/new source revisions.
2. Show date/day/service/vendor/communication/current-result context.
3. Suggest an impact without committing it.
4. Require staff to choose `UNCHANGED`, `ADD`, `CHANGE`, `REBOOK`, or `CANCEL`.
5. Require a note for `CHANGE`, `REBOOK`, and `CANCEL`.
6. Keep old confirmed booking and communication history.
7. Create the required new/amend/cancel communication.
8. Re-open confirmation review only for affected items.

Example: one canceled vendor and two new vendors creates one explicit cancel
action linked to the old booking plus two new booking records. It never replaces
the original booking row.

Moving a SPA from Day 2 to Day 3 carries forward the new calculated date/day
context while keeping staff-entered organic booking detail available for review.

## 11. Email, WhatsApp, and portal evidence

### Gmail

- Connected employee mailbox remains the sender/reviewer identity.
- Store Gmail thread ID and message ID, not only a clickable URL.
- Store exact sender, To/CC recipient snapshot, subject, template version,
  attachment Drive IDs, and sent timestamp.
- Loading a linked email marks it read only for the current staff mailbox.
- Successful system opening appends `EMAIL_REVIEW_OPENED` even with no status
  change.
- A received reply always requires human interpretation.

### WhatsApp

- System prepares copy-ready content; staff performs the external action.
- Clicking `Sent` records timestamp, actor, target, attempt, and optional proof.
- Clicking `Confirmed` records a separate timestamp and evidence.
- No claim of automatic delivery without an approved integration.

### External portal

- Store portal URL, booking reference, current status, last checked time, actor,
  and optional proof.
- Never store portal passwords in operational tables or GitHub.

## 12. Notification routing

Notifications are event- and recipient-based, not broadcast-to-everyone.
All departments use the same generic Notification Inbox component. In the
initial version it is information-only: it shows general totals such as New
Itinerary, Revised Itinerary, and other permitted events plus a simple latest
information list. It does not claim work, change a business status, generate a
booking, or provide subgroup-specific workflows.

The visible Inbox structure is shared; the recipient dataset is different.
Apps Script generates `NOTIF_RECIPIENTS` from the employee's active job
description, department, role, assignment, and approved oversight rules.
All Rounder, Manager, Administrator, or another approved oversight position may
receive broader cross-department notifications. Ordinary staff receive only
events relevant to their job description.

| Event | Primary recipients | Result |
| --- | --- | --- |
| `NEW_ITINERARY_PUBLISHED` | Vendor Booking queue/assigned staff | New Confirmation task |
| `ITINERARY_REVISED` | Current Vendor owner + affected Vendor role | Revision impact task |
| `SUPPLIER_REPLY_RECEIVED` | Booking owner / eligible Vendor staff | Re-check task |
| `BOOKING_NOT_CONFIRMED` | Reservation + configured follow-up roles + oversight | Reason/action notification |
| `VENDOR_BOOKING_COMPLETE` | Reservation + authorized oversight | Final-check task |
| `CLAIM_TAKEOVER` | Previous owner + Manager/All Rounder audit | Ownership notice |

Transport and unrelated operational roles do not receive Vendor booking noise.
Subgroup classification, advanced filters, deep links, acknowledgement, and
90-day local read/history behavior remain later Inbox enhancements. Central
event and recipient records remain available for the future lifecycle.

## 13. Delivery phases and progress

| Phase | Proposed version | Deliverable | Status | Exit condition |
| --- | --- | --- | --- | --- |
| VB-00 | planning baseline | Data/status/API/UI contract | `DONE` | This baseline is approved and linked from project progress. |
| VB-01 | v1.0.8 | Vendor role dashboard + generic Notification Inbox + claim/read-only concurrency | `PENDING` | Four independently scrolling dashboard sections follow the approved filters; two-user claim test passes; shared Inbox displays only job-description-permitted totals/information. |
| VB-02 | v1.0.9a | Vendor/program/contact master cache + Universal Lookup | `IN PROGRESS` | Google Sheet source of truth now supplies 82 TOC entries and 232 Vendor rate rows through 2026-12-16; every desktop startup cross-checks content checksum and atomically refreshes SQLite only when changed. Full keyboard navigation, aliases, contacts, stable official vendor IDs, and fallback UAT remain. |
| VB-03 | v1.0.9-v1.0.10 | Daywise + micro-item + supplier split workspace | `IN PROGRESS` | New itinerary can be fully split without raw Sheet editing; each Day derives active/changeover hotels, requires Start Time before Split, permits optional Finish Time, uses a wide resizable two-pane editor, and Save Split persists only to local SQLite until a separate controlled Generate/online stage. Five type-aware catalogues and independent booking/rate status are implemented in v1.0.10. |
| VB-03A | v1.0.11 | Micro split Type dropdown hotfix | `DONE` | All five types remain visible in a fixed select regardless of the current selection. |
| VB-04 | v1.0.12 | Template preview + safe Gmail/WhatsApp/portal send evidence | `PENDING` | DEV whitelist blocks unsafe send; exact sent snapshot is auditable. |
| VB-05 | v1.0.12/14 | Reply inbox + per-micro-item review attempts | `PENDING` | Confirmed/Not Confirmed/Review Again work independently per item. |
| VB-06 | v1.0.13 | Revision impact + amend/rebook/cancel | `PENDING` | Confirmed history survives; all affected items require human decisions. |
| VB-07 | v1.0.14 | Completion gate + Vendor publication | `PENDING` | Incomplete item blocks completion; resolved case notifies Reservation. |
| VB-08 | v1.0.15 | Reservation drill-down + communication viewer | `PENDING` | Daywise, item, status, PIC, and permitted email trail load on demand. |

## 14. First implementation sprint — VB-01

### Scope

1. Add role-aware dashboard routing and the Vendor Dashboard with independently
   scrolling Urgent, Pending, Replied, and Done sections.
2. Add Vendor Booking navigation shell, shared generic display-only Notification
   Inbox, and Generating Booking route placeholder.
3. Add central Vendor dashboard/work-item and notification-summary read
   endpoints.
4. Add atomic claim, heartbeat, release, finish, and controlled takeover
   endpoints.
5. Add local Vendor Dashboard cache. Notification history/read lifecycle remains
   a later enhancement.
6. Display Customer Code, event type, source revision, received time, priority,
   owner, and claim time in the applicable work/dashboard view.
7. Route actionable Vendor Dashboard cards into the matching Customer Code,
   booking, and source-revision context.
8. Append work open/claim/release/finish/takeover events to online audit.

### Explicitly out of scope

- Gmail sending;
- booking templates;
- daywise editing;
- supplier confirmation decisions;
- revision impact processing;
- final Vendor completion;
- Notification Inbox subgroup classification, deep links, read/acknowledge
  actions, and 90-day local lifecycle.

### Required dummy UAT

1. Vendor A opens an unclaimed item and becomes editor.
2. Vendor B opens the same item and receives read-only notice.
3. Vendor A releases; Vendor B successfully claims.
4. Expired claim can be safely reacquired.
5. Manager takeover records previous/new owner and reason.
6. The same generic Inbox UI shows different permitted totals for Vendor,
   Reservation, and All Rounder test users based on server recipient routing.
7. Inbox cards/counts are display-only and cannot mutate, claim, or finish work.
8. Every work open/claim/release/takeover/finish action is present in online
   audit.
9. An unresolved item older than 72 hours appears in Urgent using Reservation
   publication time.
10. A split-but-unsent booking appears in Pending and `Generate Booking` opens
    the correct preloaded route.
11. A linked unreviewed inbound reply appears in Replied and does not
    automatically become Confirmed.
12. Done shows only completed Customer Codes checking in tomorrow through the
    next seven calendar days and remains read-only.

## 15. Build gate before Gmail send

The following inputs are required before VB-04:

- dummy/whitelisted recipient addresses;
- one approved New Confirmation email sample;
- one Revised Confirmation email sample;
- one complete supplier reply trail;
- structured vendor To/CC sample;
- booking subject/body/attachment SOP;
- approved template versioning rule.

Until these are supplied, implementation must stop at preview/draft and may not
send to arbitrary recipients.

## 16. Definition of done

A Vendor Booking phase is `DONE` only when:

- automated checks pass;
- the Apps Script endpoint and Sheet contract are version-aligned;
- local retry is idempotent;
- authorization is enforced server-side;
- actor/time/source revision/record version are auditable;
- dummy UAT acceptance conditions pass;
- no credential or OAuth token enters Git, Sheet, draft, or audit payload;
- project progress, DFD, and release notes are updated.

## 17. v1.0.8 Sprint 1 implementation status — 2026-07-27

Implemented:

- Vendor sidebar: Inbox, Generate, New Itinerary, Revise Itinerary,
  Cancel All Service, and Cek KPI;
- role-aware four-section Vendor dashboard shell with independent scroll;
- general display-only Inbox plus New/Revise notification deep-link routing;
- latest central tour/revision/publication lookup and Drive DOCX rendering;
- deterministic extraction of Customer Code/Name, arrival/departure
  date-flight-sector-time, and repeatable hotels;
- explicit `NEEDS_REVIEW` state so extraction never silently becomes official;
- editable header including Adult/Child/Infant pax, unlimited hotel rows, inclusive Day 1..N builder, organic
  Day Wise paste field, and side-by-side source itinerary;
- aligned Arrival/Departure summary groups and an editable Tour Day Header
  beside each Day Wise service date, persisted to `TOUR_DAYS.day_title`;
- per-day pre-generation split for Vendor, TOC, Transport, Luggage Van, and
  Additional Service;
- type-aware provider/service lookup and rate snapshot; current Google master
  data supplies Vendor and TOC while clearly labeled DEV fixtures temporarily
  supply Transport, Luggage Van, and Vendor `Additional` services `Garland`
  and `Water`;
- independent booking and rate states: Additional Service may save as
  `PENDING_RATE`, while email, WhatsApp, or portal booking remains available;
- transactional local SQLite tables and stable IDs;
- controlled `vendor.intake.save` Apps Script endpoint, source-version check,
  role gate, lock, idempotency, online schema alignment, and audit;
- Apps Script Version 7 deployed on the existing DEV `/exec` URL, including
  validated Adult/Child/Infant pax persistence;
- workbook foundation/data dictionary aligned and visually verified; existing
  `TOURS.pax_adult`, `TOURS.pax_child`, and `TOURS.pax_infant` are reused;
- 17/17 automated checks and isolated-profile Electron startup smoke test.

Still pending before this sprint is marked complete:

- one authenticated dummy Customer Code Post from the v1.0.8 desktop and
  direct readback from `TOURS`, `TOUR_HOTEL_STAYS`, `TOUR_DAYS`, `SERVICES`,
  and `AUDIT_LOG`;
- exact Pending card preload into Generate;
- online dashboard query refinement per source revision/work item;
- Revise Itinerary impact processing;
- atomic claim/edit lock;
- Universal Lookup stable `vendor_id`;
- installer, GitHub release, and updater delivery.
