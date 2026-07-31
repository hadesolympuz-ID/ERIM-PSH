# ERIM-PSH General System Check & Milestone Record

**Document type:** `OFFICIAL ADDITIONAL AUDIT RECORD`  
**Record policy:** `APPEND-ONLY BY AUDIT MILESTONE`  
**Initial audit date:** `31/July/2026`  
**Repository:** `C:\PROJECT\ERIM-PSH`  
**Branch:** `agent/desktop-v1`  
**Source version audited:** `v1.1.17`  
**Audit baseline commit:** `5d90c1b`  
**Current disposition:** `UAT / SAFETY PATCH REQUIRED BEFORE FULL STAFF ROLLOUT`

---

## 1. Purpose

Dokumen ini adalah catatan resmi hasil general check ERIM-PSH dari foundation
awal sampai milestone yang sedang aktif.

Dokumen ini bersifat **additional**:

- tidak menggantikan `PROJECT_PROGRESS.md`;
- tidak menggantikan base plan per module;
- tidak menghapus hasil audit lama ketika audit baru dilakukan;
- setiap general check berikutnya ditambahkan sebagai milestone audit baru;
- status `DONE` hanya boleh diberikan setelah implementation, test, dan
  evidence/retest sesuai acceptance gate tersedia;
- temuan yang sudah diperbaiki tetap dipertahankan sebagai historical record.

Dokumen sumber yang tetap berlaku:

- `PROJECT_PROGRESS.md`
- `docs/VENDOR_BOOKING_BASE_PLAN.md`
- `docs/VENDOR_BOOKING_GENERATE_SOP.md`
- `docs/VENDOR_NEXT_MILESTONE_PLAN.md`
- `docs/VENDOR_V113_BASE_PLAN.md`
- `docs/TRANSPORT_MODULE_FOUNDATION.md`
- `docs/TRANSPORT_NEXT_MILESTONE_PLAN.md`
- `docs/POST_NOTIFICATION_MATRIX_PLAN.md`

---

## 2. Status Legend

| Status | Meaning |
| --- | --- |
| `VERIFIED` | Sudah diperiksa dari source, test, local database, atau live read-only evidence. |
| `PASS` | Check lulus pada baseline audit. |
| `OPEN` | Gap/bug telah ditemukan dan belum ditutup melalui retest. |
| `IN PROGRESS` | Implementation aktif tetapi belum memenuhi seluruh gate. |
| `UAT REQUIRED` | Sudah tersedia dalam source tetapi belum cukup dibuktikan dalam realistic/live UAT. |
| `BLOCKED` | Tidak dapat ditutup sebelum dependency atau authority tersedia. |
| `DEFERRED` | Sengaja dipindahkan ke milestone berikutnya. |
| `CLOSED` | Temuan sudah diperbaiki dan lulus retest dengan evidence. |

Severity:

| Priority | Meaning |
| --- | --- |
| `P0` | Berisiko menyebabkan salah kirim, double-send, data resmi tidak konsisten, permission bypass, kehilangan evidence, atau recovery tidak aman. |
| `P1` | Mengganggu reliability, kontrol operasional, traceability, atau penggunaan oleh banyak staff. |
| `P2` | Hardening, maintainability, performance, dokumentasi, atau peningkatan UX. |

---

## 3. Product Milestone Recap

### 3.1 Version progression

| Version range | Milestone focus | General status |
| --- | --- | --- |
| `v1.0.0–v1.0.7` | Desktop/local SQLite foundation, controlled sync architecture, Google Workspace connection, installer, updater, Reservation foundation. | `FOUNDATION AVAILABLE` |
| `v1.0.8–v1.0.11` | Daywise, Micro Split, rate basis, Supplier/Product relationship, local operational editing. | `FOUNDATION AVAILABLE` |
| `v1.1.0–v1.1.3` | Supplier Master, Product/Contract/Rate, import/export, local draft and publish controls. | `FOUNDATION AVAILABLE / APPROVAL FLOW IN PROGRESS` |
| `v1.1.4–v1.1.6` | Stabilization, publish flow, and Transport foundation. | `PARTIAL` |
| `v1.1.7–v1.1.12` | Vendor Generate, delivery channels, Gmail evidence, safe status separation, Portal sorting and package handling. | `IMPLEMENTED / UAT CONTINUES` |
| `v1.1.13–v1.1.16` | Compact tree/list UI, navigation, per-item return, generated-message correction, Daywise header migration. | `IMPLEMENTED / UAT CONTINUES` |
| `v1.1.17` | Daywise reset, orphan protection, parent integrity, date formatting, Process Report, staged/background send sync, Supplier approval request foundation. | `SOURCE + INSTALLER VERIFIED / SAFETY PATCH REQUIRED` |

### 3.2 Current product maturity

ERIM-PSH sudah mempunyai foundation lintas module, tetapi belum seluruhnya
menjadi end-to-end production workflow.

| Area | Current position |
| --- | --- |
| Desktop shell and local data | Operational foundation tersedia. |
| Reservation | Foundation tersedia; full operational lifecycle belum selesai. |
| Supplier Master | Local workflow dan central publish foundation tersedia; cross-PC approval lifecycle belum final. |
| Vendor Booking | Generate/Email flow sudah substantial; external delivery, central reconciliation, confirmation, and reply lifecycle masih memiliki gap. |
| Transport | Foundation dan next milestone plan tersedia; full working menu belum selesai. |
| Ops Accounting | Data foundation tersedia; operational workflow belum selesai. |
| General Cashier | Data foundation tersedia; operational workflow belum selesai. |
| Manager/Admin | DEV, settings, and approval foundation tersedia; full notification/approval/access governance belum selesai. |
| Mobile PWA | Read-only direction/foundation tersedia; production mobile installer/monitoring target belum selesai. |

---

## 4. Audit Scope and Method

General check milestone ini mencakup:

1. Git branch, source version, and working tree.
2. Automated source checks and test suite.
3. Windows installer/update artifacts.
4. Active local SQLite integrity and operational relationships.
5. Vendor intake, Daywise/Micro Split, Generate, Send, evidence, and resend data flow.
6. Google Apps Script and central Google Sheet read-only comparison.
7. Gmail authorization, immutable delivery evidence, and recovery behavior.
8. Supplier Master approval and cross-PC synchronization.
9. Backup/rollback content and credential boundary.
10. Documentation consistency and missing UAT coverage.

Audit dilakukan dari real source, active local database, build artifacts, dan
read-only central data. Catatan plan digunakan sebagai intended behavior, bukan
sebagai bukti bahwa function sudah bekerja.

---

## 5. Baseline Evidence — General Check Milestone 01

### 5.1 Repository and build baseline

| Check | Result | Status |
| --- | --- | --- |
| Active branch | `agent/desktop-v1` | `VERIFIED` |
| HEAD / origin baseline | `5d90c1b` | `VERIFIED` |
| Source application version | `1.1.17` | `VERIFIED` |
| Working tree | Memiliki perubahan v1.1.17 yang belum di-commit/push. | `OPEN` |
| Automated tests | `65/65 PASS` | `PASS` |
| Source syntax/check command | Pass | `PASS` |
| `git diff --check` | Pass | `PASS` |
| Installer | `release/ERIM-PSH-Setup-1.1.17.exe` | `VERIFIED` |
| Installer size | `111,087,733 bytes` | `VERIFIED` |
| Installer SHA-256 | `AB2B548A53006131A2D4C54CED7389BD8F02FD31560D8938E0339AB11F400BC5` | `VERIFIED` |
| Updater metadata | `latest.yml` points to v1.1.17 | `VERIFIED` |

### 5.2 Active local SQLite baseline

Database audited:

`C:\Users\U S E R\AppData\Roaming\erim-psh-desktop\erim-psh-local.sqlite`

| Record group | Count / result |
| --- | ---: |
| SQLite quick integrity check | `OK` |
| Vendor intakes | `4` |
| Tour days | `34` |
| Micro splits | `46` |
| Supplier bookings | `20` |
| Booking services | `22` |
| Send attempts | `6` |
| Supplier sync approvals | `1` |
| Process events | `8` |
| Booking status: GENERATED | `8` |
| Booking status: GENERATE_CANCELED | `4` |
| Booking status: SENT | `8` |
| Send attempt status: SYNCED | `6` |
| Approval status | `APPROVAL_REQUESTED` |

Integrity checks that passed:

- no local orphan Daywise/Micro Split relationship;
- no duplicate active booking-service relation;
- no Sent Email record without Gmail Message ID/Thread ID;
- no pending send evidence missing its required attempt relation;
- no Generated booking incorrectly carrying a send attempt;
- no duplicate active send attempt;
- no invalid Pax/Day number found in the audited set.

This proves the audited local snapshot is structurally healthy. It does not
prove every UI flow or central synchronization path is production-safe.

---

## 6. Current End-to-End Data Flow

### 6.1 Itinerary to Vendor working data

1. Reservation/source itinerary is loaded from Google Drive/DOCX.
2. Extractor reads customer, travel dates, flight times, pax, hotel, and
   program/day content using document layout and label patterns.
3. `Rebuild Dates` maps extracted day data into local Vendor Intake days.
4. User can edit Daywise header, date, Start/Finish time, hotel, Adult, Child,
   Infant, and Micro Split.
5. Local save writes the working structure transactionally to SQLite.
6. Post Structured Data sends the current local structure through Apps Script
   to central Google data.

Current strengths:

- stable local IDs exist;
- local save is transactional;
- structured Daywise/Micro Split is reloadable;
- reset protection can block an intake that already has Sent booking evidence;
- display date format has been moved toward `dd/MMMM/yyyy`;
- Day 0 and manual pax controls exist in the current milestone.

Current gaps:

- extraction remains dependent on DOCX layout/labels;
- extracted fields do not yet have field-level confidence and provenance;
- Rebuild Dates only fills blank/available values and cannot reliably
  distinguish an old extracted value from a deliberate manual override;
- matching mainly follows Day number rather than an explicit source revision
  and source date identity;
- central post does not reconcile records removed from the current local
  manifest.

### 6.2 Micro Split to Generate

1. Eligible `VENDOR` Micro Split items appear in Generate Preparation.
2. Tree groups work by Customer Code, Daywise, and Service.
3. Supplier/Product/Rate/Delivery Channel readiness is evaluated.
4. User selects eligible items and generates a local booking snapshot.
5. Selected items are grouped into Supplier Booking packages according to
   channel and approved sorting rules.
6. Per-item `Cancel sending item` returns only the selected service to the
   ungenerated list, subject to Sent evidence protection.
7. Review list and Process workspace expose generated packages for delivery.

Current strengths:

- Generated does not mean Sent;
- per-item cancellation is separated from package cancellation;
- stable service links and snapshot data are retained;
- Email, WhatsApp, Portal, and Other channel UI exists;
- Portal sorting and same-supplier round-trip grouping direction are recorded;
- Gmail thread evidence and controlled resend exist for Email.

Current gaps:

- some readiness and destination validation still depend too much on renderer
  controls rather than backend authority;
- source snapshot lineage does not consistently carry an explicit source
  record/revision version;
- unsupported/incomplete external destinations can reach a weaker backend
  record path;
- no full Electron UAT yet proves queue behavior with 50–100 mixed items.

### 6.3 Email delivery

1. Generate creates an editable local message snapshot.
2. Gmail preflight checks connected token/profile and connection health.
3. User performs a final send confirmation.
4. Gmail API sends the message from the connected employee account.
5. An immutable local Send Attempt stores Message ID, Thread ID, sender,
   recipient snapshot, subject/body snapshot, timestamp, and outcome.
6. Booking becomes `SENT_PENDING_SYNC` while central evidence is not confirmed.
7. Background/manual sync uploads evidence to Apps Script.
8. Successful central evidence marks the attempt `SYNCED` and booking `SENT`.
9. Resend is a new controlled attempt and never overwrites original evidence.

Current strengths:

- status separation prevents Generated from being treated as Sent;
- Gmail Message ID and Thread ID are stored;
- immutable attempt model protects original send evidence;
- anti-double-send logic exists for the Email happy path;
- sync retry is separated from resend;
- Sent Email records audited locally contain the required Gmail IDs.

Current gaps:

- central Vendor/Manager permission is not proven before Gmail actually sends;
- if Gmail accepts but app closes before central sync, startup auto-recovery is
  not complete;
- background evidence sync progress is not yet a full live IPC stream;
- current view may not auto-refresh immediately when background sync finishes;
- Gmail outcome-unknown/reconcile path lacks complete live UAT;
- cross-role unauthorized-send UAT has not been completed.

### 6.4 WhatsApp, Portal, and Other delivery

1. Generated snapshot is shown with adaptive channel instructions.
2. User opens/copies the external destination or portal.
3. User completes the external action.
4. User records external reference/evidence locally.
5. Local booking is marked Sent based on that manual record.

Current gap:

The current external action path is materially weaker than Email:

- no immutable External Delivery Attempt equivalent;
- no robust backend status transition guard;
- no complete parent integrity guard at final record time;
- no idempotent anti-double-record key;
- repeated record can overwrite external reference/time;
- no confirmed central evidence sync/retry;
- no complete use of `EXTERNAL_BOOKING_REFS`;
- exact service-to-booking relationship remains incomplete centrally.

### 6.5 Supplier local change approval

1. Staff can create/edit Supplier/Product/Contract/Rate locally.
2. Local rate may be used for local operational preparation and booking.
3. Google sync detects a local Contract/Rate change requiring Manager approval.
4. Staff creates an approval request containing an exact snapshot.
5. Manager/Admin is intended to review the central request from another PC.
6. After approval, the approved snapshot can be resumed or taken over for sync.

Current strengths:

- local work is not blocked while waiting for central approval;
- approval request and exact snapshot foundation exist;
- central approval row was confirmed in live read-only data.

Current gaps:

- local approval row has business status but not a durable,
  separately-visible central sync status;
- server success followed by client response/readback failure can appear as a
  generic failure even when the central request exists;
- full cross-PC Manager review, approve/change-request/reject, and takeover
  lifecycle has not passed live UAT;
- notification routing for approval remains planning, not active workflow.

---

## 7. Confirmed Findings Register

### 7.1 P0 — Must be resolved before broad rollout

| ID | Finding | Evidence / current behavior | Impact | Required correction | Status |
| --- | --- | --- | --- | --- | --- |
| `GC-P0-001` | Central ghost Day/Service rows after local rebuild/reset/repost. | For audited Tour ID, local has 8 days/9 splits while central has 9 `TOUR_DAYS` and 12 `SERVICES`; an old Day 1 and three old services remain active. | Mobile/downstream/report can read obsolete operational data. | Add current-ID manifest reconciliation and tombstone/archive missing prior rows; protect Sent/history; run one-time cleanup. | `OPEN` |
| `GC-P0-002` | External channel Sent evidence is local-only. | Audited Portal and WhatsApp Sent bookings have no corresponding central Supplier Booking/Communication evidence. | Other PCs and mobile cannot trust or recover delivery status. | Add immutable External Delivery Attempt, central evidence upload, retry, and exact service links. | `OPEN` |
| `GC-P0-003` | External record path lacks sufficient state, parent, and idempotency guards. | Current backend record operation can accept repeated/manual calls and overwrite reference/time. | Duplicate/incorrect Sent evidence or evidence attached to stale parent. | Enforce `GENERATED → SENT_PENDING_SYNC → SENT`; validate active parents; stable attempt/idempotency key; prohibit overwrite. | `OPEN` |
| `GC-P0-004` | Central authorization is not proven before real Gmail send. | Gmail preflight verifies Google connection but Apps Script Vendor/Manager permission is enforced later during evidence sync. | Unauthorized staff could send real email before central rejection. | Add central employee/department/role authorization preflight before Gmail and every external delivery action. | `OPEN` |
| `GC-P0-005` | Approval business status and central sync status are conflated. | Local can show `APPROVAL_REQUESTED` without durable upload/readback state; central row may exist after UI reports failure. | Staff may repeat request or Manager may not know whether request is visible. | Separate business and transport states, add readback by request ID, reconcile unknown outcome, and expose cross-PC state. | `OPEN` |
| `GC-P0-006` | Rollback manifest incorrectly states client credentials are excluded. | `google_client_secret` exists in active and rollback SQLite although manifest claims exclusion. | Backup confidentiality assumption is false; credential exposure risk. | Treat backup as confidential, scrub secret, correct manifest, and move to public desktop PKCE design without legacy secret. | `OPEN` |

### 7.2 P1 — Operational reliability and control

| ID | Finding | Required correction | Status |
| --- | --- | --- | --- |
| `GC-P1-001` | Extracted vs manually edited Daywise values have no field-level provenance. | Store source field, source revision/version, extraction confidence, extracted value, manual override flag, actor, and time. | `OPEN` |
| `GC-P1-002` | Rebuild Dates cannot safely refresh a revised itinerary while preserving deliberate manual edits. | Add explicit refresh choices and compare current source revision against stored lineage. | `OPEN` |
| `GC-P1-003` | Post retry uses a new request ID on each attempt. | Persist one idempotency key per publication intent until a known final outcome. | `OPEN` |
| `GC-P1-004` | No complete startup recovery for pending/unknown send evidence. | On startup, scan attempts, reconcile known Gmail IDs, retry evidence only, and block resend until outcome is known. | `OPEN` |
| `GC-P1-005` | Background send progress is not fully live or automatically reflected in all views. | Add IPC progress events and deterministic refresh of package, report, dashboard, and queue status. | `OPEN` |
| `GC-P1-006` | Dashboard `Not Split` can hide partially split itineraries. | Count source services/required work vs completed Vendor splits, not just existence of any Vendor split. | `OPEN` |
| `GC-P1-007` | `VENDOR_COMPLETE` is referenced but final transition/action is incomplete. | Define readiness rule, authorized action, central publication, notification, and downstream handoff. | `OPEN` |
| `GC-P1-008` | Supplier confirmation/result lifecycle is incomplete. | Add Pending Reply, Reply Review Required, Confirmed, Rejected/Unavailable, Amendment, Canceled, and reviewed evidence states. | `OPEN` |
| `GC-P1-009` | Vendor Inbox has no durable per-user read/ack state. | Use central notification recipient state per employee with read/acknowledge/resolve separation. | `OPEN` |
| `GC-P1-010` | Gmail reply detection is bounded, N+1, silent on failure, and lacks Mark Reviewed. | Incremental thread watch/search, surfaced failures, stable last-checked cursor, and reviewer action. | `OPEN` |
| `GC-P1-011` | Process Report is append-only but does not emphasize the latest effective outcome. | Show current effective state plus expandable attempt history; preserve failures without presenting them as unresolved after success. | `OPEN` |
| `GC-P1-012` | Some role/department settings and actions rely on local/UI guards. | Move authoritative permission checks to Apps Script/backend IPC boundary and prevent ordinary local role self-escalation. | `OPEN` |

### 7.3 P2 — Hardening and maintainability

| ID | Finding | Required correction | Status |
| --- | --- | --- | --- |
| `GC-P2-001` | Test suite does not yet cover real Electron interaction and restart behavior. | Add packaged Electron E2E for navigation, queue, modal close, restart, deep links, and recovery. | `OPEN` |
| `GC-P2-002` | Interactive privileged-action reauthentication remains pending. | Implement encrypted authentication time/scope hash and 72-hour privileged-action reauth. | `OPEN` |
| `GC-P2-003` | Electron renderer sandbox is disabled. | Audit dependencies and enable sandbox where compatible; document exceptions. | `OPEN` |
| `GC-P2-004` | Documentation contains historical contradictions. | Keep decision history but label superseded sections and publish one current behavior index. | `OPEN` |
| `GC-P2-005` | Apps Script route/source/version health is not sufficiently visible. | Add backend version/schema/route health response and deployment checklist. | `OPEN` |
| `GC-P2-006` | Current v1.1.17 working tree has not been committed/pushed as an intentional release baseline. | Complete safety patch, retest, commit, push, tag/release, and controlled update only after approval. | `OPEN` |

---

## 8. Central Data Reconciliation Detail

### 8.1 Confirmed mismatch

For audited Tour:

`TOUR-baf3e601-9723-4d07-b3d9-031f0cfcb1ec`

| Layer | Days | Services |
| --- | ---: | ---: |
| Current local Vendor Intake | `8` | `9` |
| Current central rows | `9` | `12` |

Central still contains:

- one superseded Day 1 row;
- three superseded Day 1 services;
- rows are still operationally active rather than archived/tombstoned.

### 8.2 Root cause

Current Apps Script Vendor Intake save performs upsert for rows present in the
incoming payload. It does not reconcile rows from the previous official
manifest that are absent from the new current payload.

### 8.3 Required safe behavior

Posting a Vendor Intake revision must:

1. receive one stable publication/idempotency key;
2. load the previous active manifest for the same Tour/Vendor Intake;
3. upsert all current Day/Service stable IDs;
4. identify prior IDs absent from the new manifest;
5. block or specially handle records with Sent/Confirmed/history evidence;
6. mark safe obsolete records `SUPERSEDED` or `ARCHIVED`;
7. never erase immutable communication/audit history;
8. commit the manifest and audit result together;
9. return counts for inserted, updated, unchanged, superseded, protected, and
   conflicted rows;
10. support an idempotent retry after network/client timeout.

One-time cleanup must use the same protection rules and create an audit report;
it must not use blind row deletion.

---

## 9. Delivery Evidence Target Model

All delivery channels should use a common attempt ledger:

| Field group | Required content |
| --- | --- |
| Identity | Attempt ID, Booking ID, exact Booking Service IDs, Customer Code, Supplier ID, Product ID. |
| Channel | Email, WhatsApp, Portal, or Other. |
| Snapshot | Recipient/destination, subject/title, message/body, attachment references, portal URL where applicable. |
| Action | New Booking, Amendment, Cancellation, Resend, or External Re-record with reason. |
| Outcome | Prepared, User Confirmed, Submitted, Provider Accepted, Outcome Unknown, Pending Sync, Synced, Failed, Skipped. |
| Evidence | Gmail Message/Thread ID, WhatsApp evidence, Portal booking/reference, Other evidence, actor, timestamp. |
| Integrity | Parent-active check, authorization result, idempotency key, source revision/version, immutable original attempt. |
| Recovery | Retry-sync count, last error, next allowed action, reconciliation result. |

Rules:

- `Generate` never means `Sent`.
- Opening or closing a popup never means `Processed`.
- Only successful provider action/evidence can move an attempt toward Sent.
- Sync retry never performs the external send again.
- Resend always creates a new attempt and requires a reason/confirmation.
- Original Message ID/Thread ID/external evidence is immutable.
- A canceled generated service returns to the ungenerated list immediately.
- Sent/Confirmed evidence cannot be reset by ordinary Daywise reset.

---

## 10. Security and Permission Review

### Verified controls

- Electron uses `contextIsolation: true`.
- Renderer does not use direct Node integration.
- Google tokens and operational database are local, not committed to Git.
- Email stores stable Gmail references rather than unrestricted mailbox data.
- Email happy path has immutable attempt and anti-double-send protection.
- Apps Script contains role checks for protected central Vendor evidence routes.

### Open controls

1. Central role authorization must occur before Gmail/provider mutation.
2. Local employee/department selection must not grant server authority.
3. Privileged actions need periodic reauthentication.
4. Legacy OAuth client secret must be removed from normal desktop/backup
   storage.
5. Backups must accurately declare included sensitive content.
6. External channel record actions need the same integrity level as Gmail.
7. Mobile remains read-only and server mutation rejection must be continuously
   tested.

---

## 11. Test and UAT Coverage

### Automated checks passed

- all 65 current automated tests;
- source check;
- whitespace/diff check;
- SQLite quick integrity;
- local relationship and send-attempt consistency queries.

### Required realistic UAT

| UAT ID | Scenario | Acceptance result |
| --- | --- | --- |
| `UAT-GC-001` | Generate and process 50–100 mixed-channel items. | Sorting, selection, Next/Previous, cancellation, progress, and restart remain correct. |
| `UAT-GC-002` | Close/reopen at Generated, Sending, Provider Accepted, Pending Sync, Unknown, Sent, and Resend states. | No false Processed/Sent state and no duplicate send. |
| `UAT-GC-003` | Reset → Rebuild → Post an intake that removes Day/Service rows. | Central current view exactly matches local manifest; old rows are safely superseded. |
| `UAT-GC-004` | Close app immediately after Gmail accepts. | Startup recovers evidence/sync without resending Gmail. |
| `UAT-GC-005` | Force response timeout after Gmail acceptance. | Outcome becomes Unknown/Reconcile; resend remains blocked until safe. |
| `UAT-GC-006` | Controlled resend to changed recipient. | Original attempt remains immutable; new attempt is linked with reason. |
| `UAT-GC-007` | Portal/WhatsApp repeated Record action. | One immutable attempt/evidence; duplicate call is idempotent. |
| `UAT-GC-008` | Cross-PC Supplier Rate approval. | Maker sees upload state; Manager sees exact snapshot; decision syncs back reliably. |
| `UAT-GC-009` | Unauthorized department tries Gmail and external send. | Action is rejected before external provider mutation. |
| `UAT-GC-010` | Supplier Gmail reply arrives. | Correct Booking becomes Reply Review Required; human can Mark Reviewed. |
| `UAT-GC-011` | Itinerary revision changes dates, day count, title, flight time, and pax. | Rebuild shows source changes, preserves deliberate manual overrides, and records provenance. |
| `UAT-GC-012` | Parent Supplier/Product/Rate is archived while Generated item exists. | Item becomes Needs Action/Orphan Protected and cannot be incorrectly sent. |
| `UAT-GC-013` | Background evidence sync fails then succeeds. | UI shows stages, Retry Sync only, latest effective status, and full attempt history. |
| `UAT-GC-014` | Daywise reset contains Sent item. | Reset is blocked with exact protected item list; unsent intake can reset fully after confirmation. |
| `UAT-GC-015` | Backup creation and restore rehearsal. | Restore works; manifest matches content; excluded credentials are genuinely absent. |

---

## 12. Recommended Delivery Sequence

### Safety patch — proposed `v1.1.18`

1. Central current-manifest reconciliation and safe tombstone/archive.
2. One-time ghost Day/Service cleanup with protected-history audit.
3. Common immutable delivery-attempt ledger for external channels.
4. Central evidence sync and retry for WhatsApp/Portal/Other.
5. Backend status, parent, and idempotency guards for all channels.
6. Central permission preflight before Gmail/external action.
7. Separate Supplier approval business status and central sync status.
8. Approval request readback/reconciliation by stable request ID.
9. Remove/scrub legacy secret from rollback content and correct backup manifest.
10. Run P0 UAT gates before broad staff update.

### Operational hardening

1. Field-level extraction provenance and revision-aware Rebuild Dates.
2. Startup send-evidence recovery and outcome reconciliation.
3. Live background progress/IPC and automatic view refresh.
4. Latest-effective Process Report with full history drill-down.
5. Vendor Complete and Reservation handoff.
6. Supplier confirmation, result, reply review, amendment, and cancellation
   lifecycle.
7. Per-user Inbox read/acknowledge/resolve state.
8. Controlled notification routes according to the official notification
   matrix.

### Product continuation

1. Complete Transport working menu and on-ground extraction.
2. Driver/vehicle/TOC daywise assignment.
3. Complete Ops Accounting workflow.
4. Complete General Cashier workflow.
5. Complete Manager/Admin governance and KPI controls.
6. Complete production read-only mobile PWA and installer/onboarding.

---

## 13. Release Gates

v1.1.17 may continue as a controlled owner/test UAT build, but this audit does
not recommend unrestricted staff rollout until:

- every `GC-P0-*` item is closed or explicitly risk-accepted by the owner;
- central ghost data is reconciled and cleanup evidence is retained;
- Email and external channels use authorized, recoverable delivery evidence;
- cross-PC approval status is unambiguous;
- backup secret boundary is corrected;
- critical realistic UAT passes;
- source, Apps Script deployment, installer, Git commit, Git push, and release
  metadata refer to the same verified version.

---

## 14. Documentation Alignment Required

Historical documents must be preserved, but current behavior needs a clear
supersession marker for these decisions:

1. Generate scope is `VENDOR` type only unless a later approved plan changes it.
2. Additional Service does not automatically enter Vendor Generate.
3. Generated booking message must contain the exact Product/Service item, not
   the Daywise Header.
4. `Generate`, `Sent Pending Sync`, `Sent`, `Confirmed`, and `Reviewed` are
   separate states.
5. Portal/WhatsApp manual evidence is not equivalent to central synced evidence
   until the common attempt/sync model is implemented.
6. Dashboard and Inbox foundations exist, but their complete lifecycle is not
   finished.
7. Approval request foundation exists, but cross-PC operational approval is not
   yet considered complete.

---

## 15. Append Protocol for Future General Checks

Future audits must add a new section and never rewrite this baseline silently.

Use this template:

```text
General Check Milestone NN
Date:
Version / commit:
Environment:
Scope:
Automated checks:
Local data checks:
Central data checks:
Live/UAT checks:
New findings:
Previously open findings retested:
Closed finding IDs + evidence:
Regressions:
New priority/order:
Release recommendation:
Auditor/actor:
```

Finding IDs remain stable. If a closed issue returns, mark it `REOPENED` under
the same ID and record the new evidence.

---

## 16. General Check Milestone History

| Milestone | Date | Version | Result | Release recommendation |
| --- | --- | --- | --- | --- |
| `GC-01` | `31/July/2026` | `v1.1.17` | Local structure and automated suite healthy; six P0 cross-layer safety gaps and additional P1/P2 gaps confirmed. | Keep as controlled UAT; prepare safety patch before broad rollout. |

---

# General Check Milestone 02 — Button, Function, and Behavior Audit

## 17. Milestone Record

| Field | Value |
| --- | --- |
| Milestone | `GC-02` |
| Date | `31/July/2026` |
| Version inspected | `v1.1.17` working tree |
| Branch | `agent/desktop-v1` |
| Last committed base during audit | `5d90c1b` |
| Environment | Local Windows desktop source, isolated temporary SQLite simulations, Apps Script source, PWA source, and public mobile URL reachability |
| Scope | Every discoverable desktop button, form, dynamic action, renderer-to-main IPC route, state transition, delivery channel, dialog behavior, Google boundary, Apps Script route, PWA action, and recovery path |
| Change policy | Audit only. No application behavior was changed by this milestone. |

This milestone is additive to `GC-01`. Findings from `GC-01` remain open unless
they are explicitly closed below.

## 18. Inventory and Automated Evidence

| Check | Result |
| --- | --- |
| Static `<button>` elements | `143` |
| Static button IDs | `100` |
| Dynamic button/action templates | `68` |
| Total HTML IDs | `385`, all unique |
| Static button IDs without an `app.js` reference | `0` |
| Renderer `ipcRenderer.invoke` channels | `85` |
| Main `ipcMain.handle` channels | `85` |
| Unmatched IPC channels | `0` |
| Automated tests | `65/65 PASS` |
| `npm run check` | `PASS` |
| `git diff --check` | `PASS` |
| Public mobile URL | `FAIL`: DNS resolution returned `ERR_NAME_NOT_RESOLVED` during this audit |

Passing source checks prove that controls are wired and the current assertions
still pass. They do not prove transaction atomicity, recovery, authorization,
or correct real-world behavior. Most existing tests assert source/markup or
isolated units; they do not click through a real packaged Electron session.

## 19. Confirmed P0 Findings

### `GC02-P0-001` — External delivery can be overwritten or falsely marked Sent

`recordVendorBookingExternalAction` accepts any existing booking and any
non-empty reference. It does not enforce:

1. `GENERATED` as the required previous communication state;
2. WhatsApp/Portal/Other as the allowed external channels;
3. intact Day/Service/Supplier/Product parents;
4. one immutable delivery attempt;
5. idempotency or duplicate protection;
6. central evidence synchronization.

Temporary-database simulation confirmed that a Portal reference could be
changed from `REF-FIRST` to `REF-SECOND` after it was already Sent. The same
function also marked an Email booking Sent using `MANUAL-NO-GMAIL` while Gmail
Message ID remained empty.

Required patch: route all channels through one immutable attempt ledger, apply
channel-specific evidence validation, reject Email manual completion, and
separate `SENT_PENDING_SYNC` from centrally synchronized `SENT`.

### `GC02-P0-002` — Normal Save/Revise can remove the parent of a Sent booking

Reset Daywise correctly blocks a reset when Sent evidence exists, but ordinary
Vendor Intake Save deletes and reinserts Day/Split rows without the same guard.

Temporary-database simulation:

1. create a Portal booking;
2. mark it Sent;
3. save the same intake without its original split;
4. save succeeds;
5. booking parent integrity becomes `SERVICE_SOURCE_MISSING`.

This bypasses the intended reset safety and creates an orphan Sent booking.

Required patch: protect referenced source rows, use revision/tombstone lineage
instead of destructive replacement, and reject a save that would orphan any
Generated/Sent/Confirmed attempt.

### `GC02-P0-003` — Google OAuth client secret is exposed to the renderer

`database.getPublicSettings()` returns `googleClientSecret`. Bootstrap passes
the settings object to the renderer and the Settings view fills the client
secret field. Isolated database inspection confirmed the stored secret is
returned by the function named “public settings”.

Required patch: keep the secret exclusively in the privileged process or OS
credential store, expose only `configured: true/false`, and migrate/scrub old
values and backups.

### `GC02-P0-004` — Approval Center navigation can crash its own action

The Manager/Admin navigation handler calls:

`showView("approval-center", "MANAGER_ADMIN")`

but the `showView` title map has no `approval-center` entry. Accessing
`titles[view][0]` therefore throws before Approval Center finishes loading.

Required patch: add a complete route definition, add a route existence guard,
and cover every navigation button with a real click-through test.

### `GC02-P0-005` — Itinerary revision can report failure after Drive changed

The revision flow updates the real Drive file first, then reads Drive revisions,
appends the application revision, records the event, and finally starts the
local follow-up. These stages are not one recoverable transaction.

If a later stage fails, the UI reports failure although the file may already
have changed. A user retry can patch the real Drive file again and duplicate
revision semantics.

Required patch: introduce a stable revision request ID, durable stages,
idempotent resume, before/after Drive revision evidence, and UI reporting that
distinguishes “Drive updated, local/central continuation pending” from a total
failure.

### `GC02-P0-006` — External window and navigation boundary is unmanaged

The Electron main process has no explicit `setWindowOpenHandler`,
`will-navigate`, or equivalent allowlist. Drive links use `target="_blank"` in
several views, while the Supplier Contract link can navigate the main ERIM
window directly. Gmail/Drive content may also contain links.

Risks include:

- losing the active work area by navigating the main window away;
- unmanaged child windows;
- external content sharing the application preload/security configuration;
- inconsistent return-to-work behavior.

Required patch: deny renderer navigation, route approved HTTPS URLs through
`shell.openExternal`, allowlist destinations, and ensure no external page can
access the ERIM preload bridge.

### `GC02-P0-007` — Mobile PWA cannot call the implemented Tour API contract

The PWA calls `GET ?action=tour.detail&customerCode=...` with
`credentials: "omit"`. Apps Script `doGet()` ignores the action and returns only
health information. `tour.detail` exists only under authenticated `doPost()`,
and the PWA has no sign-in/access-token flow. The repository contains only
`config.js.example`, so an unconfigured build remains demo-only. The public
status URL also failed DNS resolution during this audit.

Required patch: choose and implement one authenticated mobile contract, include
deployment configuration without committing secrets, add API contract tests,
and pass a real phone/UAT gate before calling the PWA operational.

## 20. Confirmed P1 Findings

### `GC02-P1-001` — Generate batch has partial-success without a batch ledger

Packages are generated sequentially and persisted immediately. If package N
fails, packages 1..N-1 remain Generated, but the operator receives only a
generic failure and may not receive a complete review dialog.

Required patch: durable batch ID, per-package stages, progress, retry/skip,
resume, and a final result summary.

### `GC02-P1-002` — Cancel All can target the wrong business scope

Cancel All derives work from current queue packages for the customer rather
than exact proven original Sent/Confirmed attempts. It may prepare cancellation
for a package that was never booked. A failure midway also leaves partial
cancellation state.

Required patch: select immutable original attempts, show scope before action,
and link every cancellation/amendment to its original delivery attempt.

### `GC02-P1-003` — External Sent action is vulnerable to double click

The external evidence action has no final confirmation and is not disabled
while processing. Combined with `GC02-P0-001`, rapid repeat clicks can replace
evidence or produce ambiguous completion.

### `GC02-P1-004` — Cancelling channel completion does not restore the channel

The selected channel is written into renderer state before missing-data
completion is confirmed. Closing or cancelling the popup leaves the newly
selected, incomplete channel active, and Generate can proceed against it.

Required patch: stage the selection, validate/complete it, and commit only after
Save succeeds; otherwise restore the previous channel.

### `GC02-P1-005` — Channel completion can silently replace recipients

Saving channel completion removes existing recipients of the same channel/type
and writes one destination. Email completion cannot faithfully represent
multiple TO/CC/BCC recipients and can destroy an existing recipient set.

Required patch: structured repeatable recipient rows with role, validation,
stable IDs, and explicit diff before replacement.

### `GC02-P1-006` — “Save locally & queue online” does not queue a publish

The channel-completion wording promises an online queue, but the action creates
a local Supplier Master draft. A separate Manager approval/publish is still
needed.

Required patch: either create a real Approval Request/Sync job or rename the
action and show its exact next step.

### `GC02-P1-007` — Inbox can hide external Sent that is not centrally synced

Needs Action logic does not reliably flag external local-only Sent evidence.
`NON_EMAIL_CHANNEL` can be interpreted as evidence recorded even though there
is no common central delivery attempt.

Required patch: compute dashboard/report status from the common delivery and
sync ledger, not channel-specific shortcuts.

### `GC02-P1-008` — Process Report action labels do not control the action

Rows can expose actions such as Retry, View Result, or Rebuild and Post, but the
click handler ignores `data-vendor-process-action` and always opens New
Itinerary. This is a confirmed behavior mismatch, not a missing button handler.

### `GC02-P1-009` — Notification deep links handle only two destinations

Vendor notification routing recognizes only New Itinerary and Revise
Itinerary. Other stored action URLs may be displayed as actionable but do
nothing when clicked.

### `GC02-P1-010` — Booking Register can open the latest package, not the row

“Open booking” routes by `packageKey` rather than exact `bookingId`. A historical
row can therefore open the current/latest booking for that package instead of
the selected attempt.

### `GC02-P1-011` — Gmail thread link assumes account slot zero

Thread links use `/mail/u/0/`. When the connected employee Gmail is not browser
account slot zero, the button can open the wrong account or fail to find the
thread.

Required patch: store/use an account-qualified link or open with the verified
sender identity.

### `GC02-P1-012` — Upload-before-save can leave orphan Drive files

Itinerary and Supplier Contract uploads occur before the parent application
record is safely saved. Cancelling the dialog or a later save failure can leave
an unreferenced Drive file.

### `GC02-P1-013` — Accepted source file types exceed extractor capability

The initial picker accepts PDF, DOC, XLS, and XLSX, but later revision context
uses Mammoth DOCX conversion. A successfully uploaded non-DOCX file can later
break Vendor itinerary extraction.

Required patch: align accepted types with actual parsers or implement and test
the missing parsers.

### `GC02-P1-014` — Most dialogs have no unsaved-change protection

Only the Vendor communication workspace has meaningful dirty-navigation
protection. Itinerary, revision, split, Supplier, Product, Contract, Channel,
Approval, and import dialogs can close through X/Escape without a consistent
dirty guard. The focused Supplier popup can also close directly.

### `GC02-P1-015` — Install Update can discard active work

When an update is ready, the action calls quit/install without a final
confirmation or a cross-dialog dirty-state check.

### `GC02-P1-016` — Supplier draft actions can become misleading or stuck

The UI continues to show Open after Mark Ready, while backend editing is then
blocked. The backend has a draft-cancel capability, but no equivalent UI action
was found. Mark Ready is effectively irreversible from the operator view.

### `GC02-P1-017` — Resolve follow-up lacks confirmation and recovery

Reservation follow-up Resolve has no confirmation, reason, or Reopen action.
The backend also does not first prove that the target record exists before
logging/updating it.

### `GC02-P1-018` — Refresh converts failures into apparently empty work

Refresh catches some Notification and Vendor operational failures and replaces
the state with empty/offline collections. Without a prominent error, staff can
read an outage as “nothing pending”.

### `GC02-P1-019` — Daywise Rebuild cannot distinguish extracted from manual

Existing populated values are preserved with fallback expressions. There is no
field-level provenance, so a changed itinerary may leave an old extracted
header/time in place because it looks the same as an intentional manual edit.

### `GC02-P1-020` — Stable-source revision history is not preserved locally

Ordinary Vendor Save replaces Day/Split rows rather than storing an explicit
new source revision. This contributes to orphan risk and weakens auditability.

## 21. P2 and Incomplete-Module Findings

1. `GC02-P2-001`: Transport’s nine submenu buttons currently switch
   informational foundation cards; they do not yet execute transport data
   workflows.
2. `GC02-P2-002`: Vendor KPI states that calculation is not implemented.
3. `GC02-P2-003`: Ops Accounting and General Cashier remain generic draft
   workspaces rather than their complete operational processes.
4. `GC02-P2-004`: Manager/Admin does not yet expose the planned configurable
   Notification Settings matrix.
5. `GC02-P2-005`: Sync Center offers bulk Publish Pending but lacks per-job
   retry, skip, exact detail, visible running stage, and robust action disabling.
6. `GC02-P2-006`: PWA Today and Pending point to the same result anchor;
   Profile points to a section that does not exist.
7. `GC02-P2-007`: Service Worker caches network responses without first
   requiring a successful response and falls back to HTML for missing assets,
   which can create offline MIME/behavior failures.
8. `GC02-P2-008`: PWA branding says `ERM-PSH`, inconsistent with `ERIM-PSH`.
9. `GC02-P2-009`: Contract monetary inputs use `0.01` stepping; IDR and
   basis-aware quantities need explicit domain rules.
10. `GC02-P2-010`: Supplier initialization closes the dialog before the async
    result; failure requires reopening and retyping the confirmation.
11. `GC02-P2-011`: Product filter behavior uses exact normalized equality in
    a place whose text/list presentation suggests flexible search.
12. `GC02-P2-012`: Several legacy renderer functions have no active callers,
    increasing regression risk and ambiguity over the canonical path.
13. `GC02-P2-013`: HTML sanitization is regex-based rather than an explicit
    allowlist. The existing CSP reduces risk, but renderer content should still
    use a maintained sanitizer and strict external-link routing.

## 22. Button and Behavior Coverage Summary

| Area | Wiring | Main behavior result |
| --- | --- | --- |
| Main navigation | All static IDs referenced | Approval Center route crash; several modules are foundations only |
| New/Revise Itinerary | Wired | Save can orphan Sent parents; rebuild provenance and parser/type gaps |
| Generate Preparation | Wired | Partial batch generation; channel cancel/recipient replacement issues |
| Generate & Send | Wired | Gmail happy path is stronger; external send ledger is unsafe |
| Generated Batch Review | Wired | Needs durable batch progress/resume and exact attempt navigation |
| Vendor Inbox/Dashboard/Report | Wired | Some statuses/actions are derived incorrectly or route generically |
| Supplier Master | Wired | Local draft/approval wording and irreversible UI states need correction |
| Revision/Drive | Wired | Multi-stage partial-success and orphan upload risks |
| Sync Center | Wired | Bulk-only control; weak job-level recovery |
| Transport | Buttons respond | Operational functions not implemented |
| Ops Accounting/Cashier/KPI | Buttons respond | Foundation/incomplete workflows |
| Desktop Update | Wired | Missing dirty-state/quit safety |
| Mobile PWA | UI button responds | Real API/auth contract and live DNS are not operational |

## 23. Previously Open Findings Retested

The following `GC-01` conclusions remain open and are reinforced by this audit:

1. central ghost Day/Service rows need reconciliation/tombstones;
2. external channel Sent evidence is not centrally synchronized;
3. Gmail authorization must be enforced before send, not only during later
   evidence synchronization;
4. Supplier approval business state and sync transport state remain conflated;
5. backup/rollback secret boundaries remain unsafe;
6. Daywise extraction provenance remains incomplete;
7. background send progress/recovery remains incomplete;
8. Dashboard/Inbox lifecycle and per-user notification state remain incomplete.

No previous finding is marked Closed by `GC-02`.

## 24. Strengths Confirmed

1. All discovered static button IDs have renderer references.
2. Renderer/Main IPC declarations are complete and matched.
3. HTML IDs are unique.
4. Automated checks are green.
5. Gmail’s normal send path already includes confirmation, Message/Thread
   evidence, immutable-attempt concepts, and sync separation more clearly than
   external channels.
6. Cancel Sending per item has confirmation and useful backend guards.
7. Reset Daywise has explicit confirmation and blocks known Sent evidence.
8. Supplier archive requests retain local reason/history.
9. `external.open` restricts its IPC input to HTTPS.
10. Apps Script `saveVendorIntake_` independently enforces Vendor or authorized
    oversight access; this suspected permission gap was tested and rejected.

## 25. Recommended Patch Order

### Safety patch A — transaction and evidence integrity

1. Close `GC02-P0-001` and `GC02-P0-002`.
2. Reuse one immutable attempt/status/sync model for every channel.
3. Add parent/tombstone protection to every save, revise, reset, archive, and
   cancel path.
4. Add startup reconciliation for interrupted attempts.

### Safety patch B — security and recoverability

1. Close `GC02-P0-003` and scrub old backups.
2. Close `GC02-P0-005` with staged idempotent revision jobs.
3. Close `GC02-P0-006` with navigation/window allowlists.
4. Add global dirty-state protection before close, navigation, and update.

### Workflow patch

1. Fix Approval Center routing.
2. Add a real Generate batch ledger and per-item progress/retry/skip.
3. Correct Process Report actions and exact booking/attempt deep links.
4. Correct channel completion transaction and structured recipients.
5. Expose clear local, pending-sync, synced, failed, confirmed, and attention
   states in the report.

### Mobile patch

1. Repair deployment/DNS.
2. Implement authenticated Tour Detail contract.
3. Correct navigation, offline behavior, and branding.
4. Run installer and physical-phone UAT.

## 26. GC-02 Release Recommendation

Keep `v1.1.17` as owner/test UAT only. Do not treat it as a broad staff release
until all `GC02-P0-*` findings are closed or explicitly risk-accepted, and the
critical Generate → Deliver → Evidence → Sync → Revise/Cancel flows pass a
packaged Electron UAT using disposable test accounts and recoverable data.

The next implementation milestone should reference finding IDs directly in
commits, tests, and UAT evidence so no item is lost between discussions.

## 27. Updated General Check Milestone History

| Milestone | Date | Version | Result | Release recommendation |
| --- | --- | --- | --- | --- |
| `GC-01` | `31/July/2026` | `v1.1.17` | Cross-layer baseline: six P0 findings plus P1/P2 gaps. | Controlled UAT only. |
| `GC-02` | `31/July/2026` | `v1.1.17` | All discoverable controls and IPC routes are wired, but seven new/expanded P0 behavior and integrity findings plus workflow and incomplete-module gaps are confirmed. | Controlled owner/test UAT only; safety patches required before broad rollout. |

Owner clarification and proposed treatment for the first GC-02 patch are
recorded separately in `docs/GC02_PATCH_DECISION_REGISTER.md`. That register
does not mark any finding Fixed until its implementation and UAT evidence exist.

Historical plan compatibility for those proposed patches is recorded in
`docs/GC02_BASE_PLAN_COMPATIBILITY_CHECK.md`. In particular, the immediate
OAuth fix removes the secret from renderer/bootstrap exposure without silently
overriding the earlier owner decision to retain the legacy value temporarily in
local SQLite. Manual external Email is permitted only by linking proven Gmail
Message/Thread evidence; Subject remains discovery input, never stable identity.
