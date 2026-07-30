# Vendor Booking v1.1.13 Base Plan

Status: `IMPLEMENTED AND PACKAGED IN v1.1.13 — LIVE APPS SCRIPT/UAT GATE PENDING`
Recorded: 2026-07-30
Target version: `v1.1.13`
Branch: `agent/desktop-v1`
Base release: `v1.1.12`

This is the authoritative base plan for the next Vendor Booking milestone. It
compiles the confirmed owner feedback previously recorded in Section 14 of
`docs/VENDOR_V119_UAT_FOLLOWUP_NOTES.md`.

No feature in this document is considered implemented until its acceptance
gate passes. Recording this plan does not authorize sending a real email,
publishing test Supplier data, or claiming an online sync that did not occur.

Implementation result (2026-07-30):

- Desktop schema, New Itinerary, compact Generate preparation, four-channel
  completion, per-Service Cancel Generate, generated batch grid, delivery
  report, IPC contracts, and Apps Script source changes are implemented.
- All 60 automated tests, desktop syntax checks, diff hygiene, packaged ASAR
  inspection, and the isolated eight-second executable smoke gate pass.
- NSIS installer `v1.1.13` is built. Real supplier delivery and representative
  Supplier online mutation were not used for verification.
- Apps Script source deployment is still pending because this workstation has
  no authenticated Apps Script deployment binding. Do not describe Day 0 or
  manual Total Pax as centrally live until that deployment and health check
  pass.

---

## 1. Milestone outcome

Deliver five focused Vendor Booking improvements:

1. a compact and safer New Itinerary Day Wise workspace, including an optional
   pre-arrival Day 0;
2. a compact Generate preparation tree with flexible, always-visible delivery
   channels and in-place completion of missing channel details;
3. an auditable `Cancel generate` action for each individual unsent generated
   service item in the maximized Generate & Send Supplier Booking popup.
4. a service-level Booking Delivery Report that makes every booking/delivery
   state, sent time, and required next action searchable and sortable.
5. a compact spreadsheet-style Generated Batch List as the first screen after
   Generate, with scrollable rows and clear List/Previous/Next navigation.

The implementation must preserve the v1.1.12 delivery ledger, stable Service
IDs, Gmail anti-double-send controls, Supplier Rate approval states, Portal
transaction evidence, and local-first Supplier Master behavior.

---

## 2. Confirmed scope A — Vendor Booking → New Itinerary

### 2.1 Day Wise Header from posted itinerary

Current condition:

- Rebuild Dates preserves an existing local Day Wise Header by service date.
- A newly rebuilt Day starts with a blank header.
- The posted itinerary `Program`/day heading is not currently mapped
  automatically into Day Wise Header.

Required behavior:

- Extract the matching posted itinerary `Program`/day heading into Day Wise
  Header.
- Bind by explicit Day/date relationship, not only by visual text order.
- Fill an empty Day Wise Header automatically.
- Preserve a non-empty locally edited header during Rebuild Dates.
- Never copy one Day's Program into another Day when source order changes.
- Keep the source itinerary preview read-only and available for comparison.

### 2.2 Faster time entry

- When staff enters only an hour, normalize it to `HH:00`.
- Examples: `9` → `09:00`; `09` → `09:00`.
- Preserve explicitly entered minutes, such as `09:35`.
- Apply the behavior consistently to Start, Finish, Arrival, and Departure time
  fields when staff edits them.
- Keep storage and validation in normalized 24-hour `HH:MM`.
- Empty time remains valid where the field is optional.

### 2.3 Compact New Itinerary layout

- Use standard system typography rather than dashboard-sized text.
- Reduce Day-card padding, gaps, input height, textarea minimum height, labels,
  buttons, and supporting metadata.
- Keep controls touch/click safe and readable at 100% and 125% Windows scaling.
- Do not reduce contrast for validation, rate, or hotel-change warnings.

### 2.4 Date presentation

- Display operational dates as `dd/MMMM/yyyy` with a full month name.
- Keep database, Apps Script payload, comparison, and sorting values in ISO
  `YYYY-MM-DD`.
- Calendar input and visible formatted date must represent the same value.
- Do not convert dates through local timezone math that can shift the day.

### 2.5 Optional Day 0

Purpose:

Support an operational pickup before the official arrival date. Example:
arrival on 03 January at 00:10 may require a pickup entry on 02 January at
23:59 so Transport sees it before ordinary Day 1 work.

Controls:

- Place `+ Add Day 0` directly below `Day Wise & micro split`.
- Do not create Day 0 automatically.
- Allow at most one Day 0.
- While Day 0 exists, hide or disable Add and show `Delete Day 0`.
- Day 0 exposes editable date, Day Wise Header, Start/Finish time, detail,
  hotel context, and Micro Split records.

Rebuild behavior:

- Rebuild Dates preserves an existing Day 0.
- Staff may adjust the Day 0 date independently.
- Rebuild Day 1 through Departure from the reviewed Arrival/Departure dates.
- Adding, adjusting, or deleting Day 0 never renumbers or overwrites Day 1+.
- Operational sorting uses Day 0 service date, time, Day number, and stable IDs
  so the earlier pickup is visible to downstream workflows.

Delete safety:

- `Delete Day 0` removes only Day 0.
- Always require a clear confirmation.
- Use a stronger summary when Day 0 contains a date, title, time, detail, or
  Micro Split records.
- Canceling confirmation preserves all Day 0 content.
- The removal becomes permanent only when the local itinerary draft is saved;
  ordinary unsaved-change protection remains active beforehand.

### 2.6 Pax and flight fields

- Total Pax is a direct manual input controlled by staff.
- Itinerary extraction and Rebuild Dates must not overwrite manual Total Pax.
- Keep Adult, Child, and Infant fields intact in this milestone.
- Their final relationship to manual Total Pax is deliberately deferred for a
  later owner decision; do not silently derive one from the other.
- Arrival date/time and Departure date/time populate automatically from the
  posted itinerary when available.
- The extracted values remain visible, reviewable, and editable.
- Day 0 never replaces the official Arrival date/time.

---

## 3. Confirmed scope B — Generate preparation submenu

### 3.1 Compact directory tree

Visual direction:

- Use a dense Windows Explorer/CMD-style hierarchy:
  `Client → Day → Vendor service`.
- Use a standard font stack: `Segoe UI`, Arial, sans-serif.
- Target approximately 12px primary row text, 11px secondary metadata, and
  restrained 13–14px working-section headings.
- Replace visually large cards with compact rows.
- Use aligned checkboxes, square expand/collapse controls, indentation,
  folder/item cues, and continuous branch lines.
- Use a subtle selected-row background/marker.
- Render Day Wise Header in solid black in normal, selected, and disabled rows.
- Keep status, rate, and supplier-result metadata secondary and muted.

The compact tree must still show:

- Customer Code and client name;
- Day number and formatted service date;
- Day Wise Header;
- Supplier and Product/service;
- booking state, rate state, and supplier-result state;
- eligibility and selection state.

### 3.2 Always-visible delivery-channel selection

For the selected item/package, the middle Supplier/SOP panel always shows four
single-choice options:

- Email;
- WhatsApp;
- Portal;
- Other.

Rules:

- Exactly one channel is selected per supplier package.
- Do not hide a channel because its destination data is incomplete.
- Default to the explicit current/default Supplier SOP channel stored in the
  database.
- For legacy SOP data without an explicit default, use the first active channel
  in stored SOP order and label it as a fallback.
- Preserve the staff selection while the same preparation session/package is
  active.
- Changing channel refreshes recipients, destination, readiness, preview,
  snapshot, and communication sort position.
- Never carry stale recipient data from the previously selected channel.

### 3.3 Channel readiness and destinations

Every option shows its data and readiness:

- Email: all configured TO addresses and a compact CC summary. Missing TO means
  `DATA MISSING`.
- WhatsApp: recipient name and international number. Missing number means
  `DATA MISSING`.
- Portal: portal host/URL and non-secret account reference. Missing URL means
  `DATA MISSING`.
- Other: method/instruction and destination/reference. Missing instructions
  mean `DATA MISSING`.

An incomplete channel remains selectable. Generate for that package is blocked
only until the selected channel has complete valid local data.

### 3.4 Complete delivery channel popup

Selecting a `DATA MISSING` channel immediately opens a compact in-place popup.
It must not navigate away from Generate or lose tree selection, package
selection, expanded branches, search text, or scroll position.

Popup context:

- Customer Code;
- stable Supplier identity and name;
- selected channel;
- missing-field count;
- concise reason the channel is incomplete.

Channel fields:

- Email: repeatable TO, optional CC, optional BCC;
- WhatsApp: recipient name and international phone number;
- Portal: portal URL and non-secret account reference;
- Other: method/instruction and destination/reference.

Validation:

- validate email addresses;
- normalize and validate international phone format;
- validate Portal URL;
- require the channel-specific minimum destination;
- never request or store passwords, OTPs, access tokens, cookies, recovery
  codes, or payment credentials.

Actions:

- `Save locally & queue online`;
- `Cancel`;
- optional `Open exact Supplier Master` for maintenance outside the compact
  missing-field scope.

Cancel behavior:

- keep the chosen channel selected;
- keep it visibly `DATA MISSING`;
- keep Generate blocked only for that package;
- preserve all unrelated preparation work.

Save behavior:

- create/update the exact local Supplier Booking SOP and/or Recipient draft;
- record actor, time, package context, stable Supplier identity, base online
  version, and changed fields;
- use stable IDs and idempotency so repeated Save does not duplicate records;
- immediately apply the local overlay to the selected package;
- refresh the destination and readiness without page reload;
- set `READY — LOCAL PENDING ONLINE` when locally complete;
- queue the dependency-ordered Supplier publication for online synchronization;
- do not falsely mark the detail online or `SYNCED`.

Visible sync states:

- `READY — LOCAL PENDING ONLINE`;
- `SYNC QUEUED`;
- `SYNCED`;
- `CONFLICT`;
- `FAILED`.

The existing Supplier refresh must preserve local pending detail. A base-version
conflict never silently overwrites local or online values. Generate may use
complete local-pending detail, but the booking snapshot must record local
provenance and pending-online state.

---

## 4. Confirmed scope C — Generate & Send Supplier Booking popup

### 4.1 Cancel Generate positioning

Scope this action to the maximized `Generate & Send Supplier Booking` popup
opened after staff generates the selected booking items.

- Keep the left list grouped by supplier package, but expose its generated
  service items as compact child rows.
- Add a compact `Cancel generate` button beside every individual generated
  service child row.
- Keep package selection, service-item selection/preview, and Cancel action
  separate.
- Show the action only while the containing package is
  `GENERATED / DRAFT READY — NOT SENT` and no Send Attempt or external delivery
  evidence exists.
- Do not show it for a service inside Sent, Sent Pending Sync, unknown Gmail
  outcome, or any package with proven external-channel delivery.

### 4.2 Cancel confirmation and state

Before cancellation, show:

- Customer Code;
- Supplier;
- channel;
- the one exact stable Service ID and its Day/date/Product summary;
- remaining service-item count in the generated supplier package;
- explicit `NOT SENT` statement;
- explanation that this is not a supplier cancellation.

Require:

- operational reason;
- explicit final confirmation.

On confirmation:

- create an immutable `GENERATE_ITEM_CANCELED` audit event for the one selected
  Service ID with actor, time, reason, previous channel, package key, and
  before-change generated snapshot hash;
- create no Gmail Send Attempt;
- create no Gmail Message/Thread ID;
- create no Supplier Booking delivery evidence;
- create no WhatsApp/Portal/Other delivery evidence;
- create no supplier cancellation action;
- release only the one selected stable Service ID to `NOT_GENERATED`;
- make only that service selectable again in the main Generate tree;
- preserve every other generated service in the same package;
- rebuild the remaining generated package's ordered Service ID array, service
  snapshot, body, Portal transaction membership where applicable, rate
  provenance, updated time, and snapshot hash using the deterministic
  comparator;
- never retain the removed service in Subject/body, Portal evidence preview,
  attachment plan, or the next Send Attempt snapshot;
- keep the package `GENERATED / DRAFT READY — NOT SENT` when at least one
  generated service remains;
- mark the package `GENERATE_CANCELED` only when staff cancels its final
  remaining service;
- allow the released service to be corrected and generated again into the same
  supplier package or a different package/channel according to its corrected
  data.

For a combined Portal return ticket, removing one unsent segment must refresh
the Portal transaction and display the existing possible-return/transaction-
impact notice. Nothing is sent and no ticket reference is invented.

### 4.3 Popup navigation after cancellation

- Remove only the canceled service child row from its active popup package.
- Do not close the maximized workspace automatically.
- When sibling services remain, keep the same supplier package selected and
  move service focus to the next sibling; otherwise use the previous sibling.
- When no service remains, remove the empty package from the active popup batch
  and move to the next package, otherwise the previous package.
- Update both service-item and supplier-package progress counts immediately.
- Do not affect sibling services or adjacent generated packages.
- Persist per-item canceled generation history across application restart.

### 4.4 Generated Batch List landing view

After Generate finishes, the maximized `Generate & Send Supplier Booking`
popup opens on a compact `Generated Batch List`, not directly on an arbitrary
package detail.

Visual model:

- spreadsheet-style grid inspired by Excel, without attempting to reproduce
  Excel controls or appearance exactly;
- standard system font at approximately 11–12px;
- compact 30–34px package rows;
- sticky column headings;
- subtle row borders, selected-row highlight, and frozen action/navigation
  areas where practical;
- vertical and horizontal scrolling for large batches;
- no oversized cards or headings inside the grid.

Use one primary row per generated supplier package because Send/Portal/
WhatsApp/Other delivery occurs at package level. Each package row is expandable
to show its individual service-item child rows and their per-item
`Cancel generate` controls.

Primary package columns:

- sequence number;
- Customer Code;
- Client Name;
- Supplier;
- channel;
- item count;
- first/last service date;
- package status;
- action needed;
- `Open / Review`.

Expanded service child columns:

- Day;
- service date;
- Product/service;
- Day Wise Header;
- rate state;
- item generation state;
- `Cancel generate` when allowed.

### 4.5 List and detail navigation

Landing-list actions:

- `Back to Preparation`;
- `Open / Review selected`;
- `Next Pending`;
- `Close`.

Package communication-detail actions:

- `Back to List`;
- `Previous Package`;
- position indicator `Package X of N`;
- `Next Package`;
- `Next Pending`;
- existing channel-specific controlled action.

Navigation rules:

- `Previous/Next Package` follows the same deterministic package sort used at
  Generate and Resume.
- `Next Pending` skips completed or non-actionable packages.
- Returning to List preserves selected row, expanded package, scroll position,
  and filters/sort.
- Opening detail highlights the exact package row when staff returns.
- Canceling one service refreshes only its package row/item count and preserves
  list position.
- Canceling the final service removes the empty package from the active grid
  with a visible notice and selects the next available package.
- Closing and resuming generated drafts returns to the batch list rather than
  choosing a package silently.

---

## 5. Confirmed scope D — Booking Delivery Report

### 5.1 Report identity and placement

- Add a `Booking Delivery Report` list view under Vendor Booking monitoring,
  with a direct shortcut from the maximized Generate & Send Supplier Booking
  popup.
- Use one row per stable Service ID, not one row per package.
- When several service rows share one supplier email/package, show the shared
  Package/Booking reference in row detail and open the same controlled package
  workspace from each linked row.
- Never use a report-row button to bypass confirmation, Gmail preflight,
  recipient review, resend reason, reconciliation, or delivery-evidence rules.

### 5.2 Compact list columns

Primary visible columns:

- Customer Code;
- Client Name;
- service date;
- Day number;
- Product/service;
- Supplier;
- delivery channel;
- booking/delivery status;
- Sent date and time;
- contextual action.

Use `dd/MMMM/yyyy HH:mm WITA` for visible Sent time. Keep stored timestamps in
the existing ISO/UTC contract and convert only for display.

Expandable row detail:

- Day Wise Header;
- Package/Booking ID and stable Service ID;
- action type: New, Amendment, or Cancellation;
- rate/provenance state;
- destination summary: Email TO/CC, WhatsApp number, Portal host/reference, or
  Other destination;
- sender/actor;
- Gmail Message ID and Thread ID, when applicable;
- official evidence state;
- last attempt/action time;
- latest error, conflict, or pending reason;
- reply/confirmation state;
- generated, sent, and last-updated times.

### 5.3 Search, filters, and sort

Default view:

- preset `Needs Action`;
- highest-risk/most-actionable state first;
- then oldest unresolved action first;
- then service date, Supplier, Customer Code, and stable Service ID.

Free-text search must match, case-insensitively:

- Customer Code;
- Client Name;
- Supplier;
- Product/service;
- Day Wise Header;
- channel;
- status;
- destination/reference;
- Package/Booking reference.

Examples:

- typing `dinner` returns every matching Product/service or Day Wise Header;
- typing a Supplier name returns that Supplier's rows;
- typing a Customer Code returns all exact linked services.

Filters:

- action preset: Needs Action, All, Not Generated, Draft/Not Sent, Sent,
  Sync Problem, Reply/Review, Confirmed, Canceled;
- exact booking/delivery status;
- delivery channel;
- Supplier;
- service-date From/To;
- Sent-date From/To;
- has/does-not-have delivery evidence;
- has/does-not-have supplier reply.

Sort dropdown:

- Action priority;
- Booking status;
- Supplier name;
- Customer Code;
- Client Name;
- service date;
- Sent date/time, newest or oldest;
- Product/service;
- channel;
- last updated.

Show active filter chips and provide `Clear filters`. Search, filter, sort, and
expanded-row state should remain stable while staff performs an action and the
report refreshes.

### 5.4 Derived status labels

Use staff-readable derived labels without changing the underlying ledger:

- `NOT GENERATED`;
- `DRAFT READY — NOT SENT`;
- `EMAIL PREFLIGHT REQUIRED`;
- `SENT — SYNC PENDING`;
- `SENT — SYNCED`;
- `EMAIL OUTCOME UNKNOWN`;
- `EXTERNAL ACTION PENDING`;
- `EXTERNAL EVIDENCE RECORDED`;
- `REPLY — REVIEW REQUIRED`;
- `CONFIRMED`;
- `GENERATE ITEM CANCELED`;
- `AMENDMENT REQUIRED`.

Status is calculated from the stable service link, active booking snapshot,
Send Attempt ledger, external evidence, reply evidence, and official sync
state. A gray pill alone is not sufficient; the text must also appear in the
Status column and expanded detail.

### 5.5 Contextual per-item actions

Every row shows only actions valid for that exact item/state:

| Derived state | Primary action | Supporting actions |
| --- | --- | --- |
| `NOT GENERATED` | `Open Generate` | `Open itinerary item` |
| `DRAFT READY — NOT SENT` | `Review & Send` | `Cancel Generate`, `Open draft` |
| `EMAIL PREFLIGHT REQUIRED` | `Recheck Gmail` | `Reconnect Google`, `Open draft` |
| `SENT — SYNC PENDING` | `Retry Sync` | `Delivery History`, `Open Gmail` |
| `SENT — SYNCED` | `Delivery History` | `Open Gmail`, `Prepare Amendment` |
| `EMAIL OUTCOME UNKNOWN` | `Reconcile Gmail` | `Delivery History` |
| `EXTERNAL ACTION PENDING` | `Open Channel` | `Record Evidence` |
| `REPLY — REVIEW REQUIRED` | `Review Reply` | `Open Gmail`, `Delivery History` |
| `GENERATE ITEM CANCELED` | `Generate Again` | `Generation History` |
| `AMENDMENT REQUIRED` | `Prepare Amendment` | `Delivery History` |

Rules:

- A report action targets the row's stable Service ID and resolves the exact
  current package/booking before opening its workspace.
- Package-level actions such as Send, Resend, Retry Sync, or Reconcile must
  clearly show every linked service before confirmation.
- `Resend / Ganti penerima` remains inside Delivery History and is not a
  one-click report action.
- After a successful action, refresh only the affected rows/counters where
  practical and preserve report position.
- Disable the initiating button while an action is running and keep existing
  idempotency/anti-double-click protection.

### 5.6 Scale and list behavior

- Support at least 100 operational service rows without oversized cards.
- Use compact sticky column headings.
- Provide practical page sizes such as 50 and 100 rows, or equivalent
  virtualization.
- Show total result count and Needs Action count.
- Keep loading, empty, offline, failed-refresh, and stale-data states explicit.
- Do not silently remove a row after action; update its status or move it only
  when the active filter no longer includes it, with a visible confirmation.

---

## 6. Data and state changes

### 6.1 Day 0

- Desktop validation must permit `dayNumber = 0` only for the single optional
  Day 0 record.
- Apps Script validation and online Day storage must accept the same controlled
  value.
- Day 1 remains the official Arrival Day for arrival/departure flags and
  itinerary semantics.
- Day 0 uses a stable `tourDayId` and stable Micro Split Service IDs.
- Migration must not reinterpret legacy missing/invalid Day numbers as Day 0.

### 6.2 Manual Total Pax

- Add/preserve an explicit manual Total Pax value without removing
  Adult/Child/Infant fields.
- Local and online payloads must distinguish manual Total Pax from component
  pax.
- No automatic reconciliation rule is introduced in this milestone.

### 6.3 Channel detail staging

- Reuse local Supplier Master draft/version/conflict controls.
- Stage SOP and Recipient entities separately when their dependencies differ.
- Queue online publication only after valid local save.
- Use stable draft IDs and queue idempotency keys.
- Expose local provenance to Vendor preview/generation.

### 6.4 Generate cancellation

- Add an auditable item event/state `GENERATE_ITEM_CANCELED`.
- Use package terminal state `GENERATE_CANCELED` only after its final service is
  removed.
- Preserve the before-change snapshot/hash in item cancellation history and the
  rebuilt current snapshot/hash on the active package.
- Active generated-draft queries exclude canceled service links and fully
  canceled package snapshots.
- Queue eligibility derives from exact active booking-service links, not only
  from the latest package display name.

---

### 6.5 Delivery report read model

- Build the report from one service-level read model joining active
  booking-service links, generated snapshots, Send Attempts, external evidence,
  reply evidence, and Supplier/itinerary context.
- Derive effective status and available actions in the backend so renderer
  labels/buttons cannot drift from authoritative state.
- Add deterministic query/filter/sort fields and stable Service ID tie-breaker.
- Keep timestamps in ISO/UTC and return an explicit display timezone contract.

---

## 7. Required implementation sequence

1. Add failing automated tests for Day 0, manual Total Pax, Program-header
   mapping, time normalization, channel readiness, local channel completion,
   queue idempotency, and Cancel Generate.
2. Implement SQLite/schema migrations and Apps Script validation contracts.
3. Implement posted Program-to-Day mapping and New Itinerary field behavior.
4. Implement Add/Delete Day 0 and Rebuild preservation.
5. Apply compact New Itinerary typography and formatted date presentation.
6. Implement compact Generate directory tree.
7. Implement always-visible channel options and deterministic defaulting.
8. Implement the in-place channel completion popup, local overlay, and
   idempotent online queue.
9. Implement `GENERATE_ITEM_CANCELED`, one-Service-ID release, deterministic
   remaining-package rebuild, audit history, and the per-service popup action.
10. Implement the Generated Batch spreadsheet grid, expandable service items,
    preserved List/Detail navigation, and Previous/Next/Next Pending behavior.
11. Implement the service-level Delivery Report read model, filters/sort,
    expandable detail, and authoritative per-item actions.
12. Run full regression, Apps Script syntax, database migration, packaged ASAR,
    Windows scaling/visual, and isolated smoke checks.
13. Deploy a new Apps Script version before live channel-completion sync UAT.
14. Publish v1.1.13 only after automated/package gates pass; keep real external
    messages and representative Supplier Master mutations within controlled
    owner-approved UAT.

---

## 8. Milestone acceptance gates

### 8.1 New Itinerary

- [ ] Posted Program fills the matching empty Day Wise Header.
- [ ] Manual Day Wise Header survives Rebuild Dates.
- [ ] Program mapping remains correct when source order changes.
- [ ] Hour-only input becomes `HH:00`; explicit minutes remain unchanged.
- [ ] Dates show `dd/MMMM/yyyy` while stored values remain ISO.
- [ ] `+ Add Day 0` creates exactly one Day 0 only after staff action.
- [ ] Add cannot create a duplicate Day 0.
- [ ] Day 0 survives Rebuild Dates and remains independently adjustable.
- [ ] Day 0 sorts before Day 1 according to operational date/time.
- [ ] Delete Day 0 removes only Day 0 and honors Cancel confirmation.
- [ ] Populated Day 0 receives the stronger deletion warning.
- [ ] Day 1+ IDs, numbering, details, and Micro Splits remain unchanged.
- [ ] Manual Total Pax survives extraction, rebuild, save, restart, and sync.
- [ ] Adult/Child/Infant values remain intact.
- [ ] Arrival/Departure date and time match posted extraction and remain
  editable.
- [ ] Compact layout remains readable at minimum desktop width and 125% scaling.

### 8.2 Generate preparation

- [ ] Tree hierarchy is visually clear without large cards.
- [ ] Standard font sizing is consistent; Day Wise Header remains black.
- [ ] Selection, expansion, search, and scroll survive detail refresh.
- [ ] Email, WhatsApp, Portal, and Other are always visible.
- [ ] Default channel matches stored Supplier/SOP data.
- [ ] Each channel shows the correct destination and readiness.
- [ ] Selecting `DATA MISSING` opens only the relevant completion fields.
- [ ] Canceling completion loses no unrelated work.
- [ ] Local Save refreshes readiness without reload.
- [ ] One Save produces one stable local draft and one online queue item.
- [ ] Repeated clicks do not duplicate local or online queue records.
- [ ] Online success becomes `SYNCED`.
- [ ] Offline, conflict, and failed publication preserve local detail.
- [ ] Complete local-pending detail can Generate with provenance recorded.
- [ ] Switching channels carries no stale recipients or destination.
- [ ] No credentials or secrets enter local/online operational storage.

### 8.3 Cancel Generate

- [ ] Every generated/not-sent service child row has one Cancel Generate
  button.
- [ ] Selecting a package or service row never triggers cancellation.
- [ ] Confirmation shows the one exact Service ID and remaining-package impact.
- [ ] Reason and explicit confirmation are required.
- [ ] Cancellation creates no Send Attempt or delivery evidence.
- [ ] Only the selected Service ID returns to `NOT_GENERATED`.
- [ ] Every sibling service remains generated and selectable in the same popup
  package.
- [ ] Remaining Subject/body/service snapshot and hash exclude the canceled
  item and remain deterministic.
- [ ] Portal transaction membership and warnings refresh after one segment is
  removed.
- [ ] The final remaining item cancellation changes the empty package to
  `GENERATE_CANCELED`.
- [ ] The released service can be corrected and generated again.
- [ ] Adjacent services and popup packages remain unchanged.
- [ ] Service and package progress/navigation update correctly.
- [ ] Per-item canceled history survives restart.
- [ ] Sent, pending-sync, and unknown-outcome packages cannot Cancel Generate.

### 8.4 Generated Batch List

- [ ] Generate opens the maximized popup on the Generated Batch List.
- [ ] Grid uses one compact primary row per supplier package.
- [ ] Expanding a package shows every exact service child item.
- [ ] Every eligible child item exposes its own Cancel Generate action.
- [ ] Sticky headings and scrolling remain usable for 100+ service items.
- [ ] `Open / Review` opens the exact selected package detail.
- [ ] Back to List restores selected row, expansion, scroll, filter, and sort.
- [ ] Previous/Next Package follows deterministic Generate order.
- [ ] Next Pending skips completed/non-actionable packages.
- [ ] Position indicator remains correct after item cancellation.
- [ ] Canceling one item refreshes only its package membership/count.
- [ ] Canceling the final item removes only the empty package and selects a
  predictable adjacent package.
- [ ] Resume drafts returns to the batch list with the same deterministic order.

### 8.5 Booking Delivery Report

- [ ] One row represents one stable Service ID.
- [ ] Shared-package services show the same package reference without losing
  item identity.
- [ ] Default Needs Action ordering is deterministic.
- [ ] Free-text search finds Customer, Client, Supplier, Product, Day Header,
  status, destination, and reference words.
- [ ] `dinner` search returns all matching service/header rows.
- [ ] Status, channel, Supplier, service-date, and Sent-date filters work
  independently and together.
- [ ] Every approved sort uses stable Service ID as the final tie-breaker.
- [ ] Sent date/time displays in `dd/MMMM/yyyy HH:mm WITA`.
- [ ] Expanded detail shows destination, sender, evidence, IDs, errors, reply,
  and operational timestamps.
- [ ] Derived status matches the authoritative backend ledger/read model.
- [ ] Every state exposes only its valid actions.
- [ ] Row actions resolve the exact current booking/package before opening.
- [ ] Package-level action confirmation lists every linked service.
- [ ] Resend remains controlled through Delivery History.
- [ ] Successful actions refresh affected rows without losing search/filter/
  sort context.
- [ ] 100+ rows remain compact and usable at 125% Windows scaling.
- [ ] Loading, empty, offline, stale, and failed-refresh states are explicit.

### 8.6 Release

- [ ] All source and Apps Script syntax checks pass.
- [ ] Full automated regression passes.
- [ ] Fresh and migrated SQLite profiles pass.
- [ ] Packaged ASAR contains the milestone controls.
- [ ] Packaged Windows application passes isolated smoke launch.
- [ ] Apps Script deployment health returns HTTP 200 with `ok: true`.
- [ ] Connected local/online channel-detail sync UAT passes without duplicate
  Supplier SOP/Recipient rows.
- [ ] Installer, blockmap, and `latest.yml` are internally consistent.
- [ ] GitHub release digest matches the local installer digest.

---

## 9. Explicit non-goals

- Sending a real supplier email automatically during Generate.
- Storing Portal passwords or browser credentials in ERIM-PSH.
- Bulk package cancellation that silently returns all services without
  individual staff selection.
- Redefining the final relationship among Total Pax, Adult, Child, and Infant.
- Replacing Amendment, Resend, supplier Cancellation, or Gmail reconciliation
  with Cancel Generate.
- Changing non-Vendor workflow ownership.
- Implementing mobile/PWA scope in the same desktop release.
- Turning the report into a one-click Send or Resend bypass.
- Building a general analytics/export module beyond this operational list.

---

## 10. Completion definition

The milestone is complete only when:

- all five confirmed workspaces meet their acceptance gates;
- automated and packaged verification pass;
- required Apps Script changes are deployed and healthy;
- v1.1.13 updater assets are published with matching hashes;
- the progress record distinguishes completed local/package gates from any
  connected operational UAT that remains.

---

## 11. Next-step kickoff boundary

When the owner authorizes implementation, start from this exact sequence:

1. verify branch `agent/desktop-v1`, Git status, remote synchronization, and
   the v1.1.12 base release;
2. commit/push this base-plan record separately from application implementation
   if it has not yet been published;
3. create failing tests and migration/read-model contracts before renderer
   changes;
4. implement the five confirmed phases in the Required Implementation Sequence
   defined above;
5. keep each phase locally verifiable before proceeding to packaging;
6. run the complete 86-gate milestone checklist and regression suite;
7. deploy Apps Script only after source/package checks pass;
8. publish v1.1.13 only after the installer/updater/hash gates pass.

Kickoff does not authorize:

- sending a real supplier email;
- recording invented delivery evidence;
- entering representative Supplier data into the online database without a
  controlled UAT case;
- changing the approved scope without recording the owner decision.

Until the owner explicitly starts implementation, changes remain limited to
this base plan and its progress references.

---

## 12. Owner correction after v1.1.13 trial

Status: `RECORDED — FOLLOW-UP IMPLEMENTATION NOT STARTED`

Recorded from the owner's installed v1.1.13 trial on 2026-07-30. These points
correct the interpretation of the released implementation and supersede any
conflicting wording above.

### 12.1 Pax entry correction

- `Adult`, `Child`, and `Infant` are the three values staff must enter
  manually.
- Do not ask staff to enter a separate independent `Total Pax`.
- Remove the Total Pax column from the form entirely.
- When a compatibility payload or message calculation needs Total Pax, derive
  it internally as `Adult + Child + Infant`; staff never enters or edits it.

### 12.2 Visible date format correction

- The actual date presentation used by staff must visibly read
  `dd/MMMM/yyyy`, for example `03/October/2026`.
- A small formatted helper below a native date input is not sufficient while
  the primary control still displays the browser/Windows locale format.
- Database and online payload storage remain compact ISO `yyyy-MM-dd`.
- Date picking/editing must remain practical while the visible office-facing
  value uses the required long-month format.

### 12.3 Rebuild Dates and Day Wise Header correction

- Clicking `Rebuild dates` must resolve the current posted itinerary again and
  populate each matching Day Wise Header directly from that Day's `Program`.
- A Day must not remain blank when the matching posted Program is available.
- Matching must use explicit Day/date context and must never shift one Day's
  Program into another.
- The populated header remains editable after rebuild.
- An intentional non-empty manual edit remains protected; rebuild fills an
  empty or source-derived header without silently erasing a later staff edit.

### 12.4 Vendor Daily Control — Online Process Report

Add a new operational item/card to the Vendor Booking Daily Control Dashboard
for local-save and online-post processing progress.

The report must:

- create/update a process row after `Save local draft`, after a Micro Split
  autosave, and after `Post structured data online`;
- distinguish local persistence from online completion;
- show at least Customer Code, Client, action/source, latest time, progress
  state, result, and required action;
- expose explicit states such as `LOCAL_SAVED`, `QUEUED`, `POSTING`,
  `PENDING_SYNC`, `POSTED_ONLINE`, `FAILED`, and `CONFLICT`;
- never label a locally saved draft as posted online;
- retain failed/pending rows for retry and investigation;
- provide the valid contextual action, such as Open Draft, Retry Post, Review
  Conflict, or View Posted Result;
- update from the real local queue/publication result rather than a visual-only
  progress counter.

This record does not authorize implementation, a new version, Apps Script
deployment, or a real supplier communication until the owner says to proceed.

### 12.5 Generated item detail — Back to List versus Cancel Generate

Owner clarification:

- `Back to list` and `Cancel Generate item` are two different actions.
- They may be positioned together near the currently selected generated
  Service item, but they must never share the same state-changing behavior.
- Do not place `Back to list` only as a distant global header action when staff
  are working on one Service item.

Required layout:

- the selected Service-item area exposes one contextual `Cancel Generate item`
  action;
- the same local work area exposes one `Back to list` navigation action;
- if a package contains several Services, each Service has its own
  `Cancel Generate item`;
- `Back to list` appears once for the selected/detail area and is not repeated
  as though it were a per-Service business action;
- the popup header may retain batch progress and `Close`, but does not need the
  primary `Back to list` action.

Required `Back to list` behavior:

- it performs navigation only;
- it must not change `GENERATED`, delivery, Send Attempt, or evidence state;
- it clears the active detail selection/highlight for Item A;
- it clears any stale Item A detail context before another item is opened;
- after staff points to or opens Item B, the middle/right panels must show only
  Item B context;
- reopening Item A is allowed only when Item A remains an active generated
  item;
- Item A must not remain visually `ON`, selected, or active merely because it
  was the previously opened item;
- list filter, sort, expansion, and scroll context remain preserved.

Required `Cancel Generate item` behavior:

1. staff selects the exact stable Service item;
2. staff clicks `Cancel Generate item`;
3. the application requests a required revision reason and explicit
   confirmation;
4. the backend verifies that this exact Service is still `GENERATED` and has
   no delivery attempt/evidence that prohibits cancellation;
5. only that Service returns to `NOT_GENERATED`;
6. the Service is removed immediately from the active generated batch list;
7. the parent package service count and generated progress refresh
   immediately;
8. all sibling Services remain generated;
9. the remaining package Subject/body/Portal membership/snapshot hash are
   rebuilt;
10. `GENERATE_ITEM_CANCELED` is recorded with Service ID, reason, actor,
    previous hash, new hash, and time;
11. if the removed Service was the final active Service, the empty package is
    marked `GENERATE_CANCELED` and its package row disappears from the active
    generated batch;
12. the UI selects the next valid pending generated item when practical, or
    returns to the refreshed batch list when none remains.

Refresh and return rules:

- after successful Cancel Generate, the generated batch must be re-read from
  authoritative local state rather than only hiding the DOM row;
- returning to the list must therefore show the same result after reopening
  the popup or restarting the application;
- an item returned to `NOT_GENERATED` may appear again only in the Generate
  preparation tree, where staff can correct and explicitly generate it again;
- it must not reappear in the active generated batch until a new Generate
  succeeds;
- failure or conflict during cancellation keeps the item visible and shows the
  error; the UI must not pretend it was removed.

Example:

- Package P contains generated Item A and Item B.
- Opening A and clicking only `Back to list` leaves A and B generated, but
  removes A's active highlight.
- Opening A and completing `Cancel Generate item` removes A from Package P,
  returns A to `NOT_GENERATED`, preserves B as generated, and refreshes Package
  P to one active item.
- If B is later canceled successfully, Package P has no active generated item
  and disappears from the generated batch.

Acceptance checks:

- [ ] Back to List never changes business state.
- [ ] Back to List clears stale item selection and detail context.
- [ ] Opening B after A cannot display A's message, supplier, channel, or
  actions.
- [ ] Cancel Generate removes only the confirmed stable Service ID.
- [ ] Successful cancellation immediately delists that Service from the active
  generated batch.
- [ ] Sibling generated Services remain visible and unchanged.
- [ ] The final removed Service also removes the empty package row.
- [ ] Reopening/restarting reproduces the refreshed list from SQLite.
- [ ] The canceled Service is available in Generate preparation as
  `NOT_GENERATED`.
- [ ] Failed cancellation never hides the item or records a false success.

### 12.6 v1.1.14 correction implementation

Status: `IMPLEMENTED IN SOURCE — PACKAGE AND CONTROLLED UAT PENDING`

The owner authorized implementation after confirming that the Total Pax column
must be removed. The v1.1.14 source now implements:

- Adult, Child, and Infant as the only manual pax columns; compatibility Total
  Pax is derived internally and ignores any caller-supplied independent total;
- primary Vendor intake, hotel, and Day Wise date text in `dd/MMMM/yyyy`, with
  ISO conversion at the database and online boundaries;
- latest posted Program exposure and Rebuild Dates fill for blank matching Day
  Wise Headers while preserving non-empty staff edits;
- exact Product/Service-only STANDARD_V1 booking lines, excluding the broad
  multi-product Day Wise Header from supplier communications;
- Back to List inside the selected-item work area with selection/detail reset;
- per-Service Cancel Generate controls in both batch and selected detail views;
- authoritative active Generated-batch refresh after cancellation and after
  Gmail or external delivery, so Sent records move to history/report;
- a persisted Vendor Daily Control Online Process Report for local save, Micro
  Split autosave, posting, posted-online, and failed results.

Automated status:

- 60 tests pass;
- JavaScript syntax checks pass;
- `git diff --check` passes.

Remaining gates:

- [x] build and inspect the v1.1.14 Windows artifact;
- [x] run the packaged desktop smoke test;
- [x] publish the desktop updater only after artifact/hash verification;
- deploy the Apps Script source separately from the desktop release;
- use controlled UAT for representative online posting and real supplier
  delivery.

Verified package:

- installer: `release/ERIM-PSH-Setup-1.1.14.exe`;
- size: `111,083,314` bytes;
- SHA-256:
  `EA56ED59041F992903E19EF6D27F9665F27B1540D0754F993A37D06F6DF74A17`;
- ASAR reports version `1.1.14` and contains the corrected queue, date, and
  exact-product email source;
- the packaged executable stayed alive through the isolated eight-second smoke
  gate without using the staff database.
- GitHub Release `v1.1.14` is published with the installer, blockmap, and
  `latest.yml`; GitHub's installer digest matches the verified local SHA-256.

### 12.7 v1.1.15 navigation and pre-send cancellation hotfix

Owner trial exposed two connected UI-state faults in v1.1.14:

- returning to the batch list set the active package index to `-1`, but the
  hidden work panel remained in the CSS grid and rendered `Package 0 of N`;
- stale hidden message fields were compared against an empty baseline, causing
  Back, Previous, Next, Close, and window-close to all show the same false
  Unsaved warning.

The hotfix contract is:

- dirty checking runs only while a real package detail is open and selected;
- returning to list clears stale recipients, subject, body, preview, selection,
  and establishes a clean list baseline;
- hidden batch/work views use `display: none !important`;
- list mode displays `No package selected`, not `Package 0`;
- Previous and Next remain disabled without an active package;
- a genuine staff edit to Action, Recipients, Subject, or Body still receives
  the save/discard protection.

Owner terminology and flow:

- rename the staff action to `Cancel sending item`;
- use one standard `Are you sure?` confirmation;
- OK returns only that stable Service ID to `NOT_GENERATED` and delists it from
  the active sending queue;
- Cancel makes no change;
- use automatic audit reason `STAFF_CANCELED_BEFORE_SEND`, so staff does not
  fill a second reason form;
- preserve backend security: the Service must still be `GENERATED`, have no
  Send Attempt or delivery evidence, and belong to the exact booking/package;
- siblings remain generated and the remaining snapshot/hash are rebuilt.

Automated status:

- 61 tests pass, including a dedicated false-unsaved/navigation regression;
- syntax and diff checks pass;
- Windows installer, ASAR content, and isolated eight-second packaged-app smoke
  gate pass.
- installer: `release/ERIM-PSH-Setup-1.1.15.exe`;
- size: `111,083,225` bytes;
- SHA-256:
  `30E0F1639434C2253120963D4AAADF50DFEE7EF34516ABA415E0ADF1671E6E1C`;
- GitHub Release `v1.1.15` is published as Latest with installer, blockmap, and
  `latest.yml`; GitHub's installer digest matches the local verified SHA-256.
