# GC-02 Patch versus Historical Base Plan Compatibility Check

## 1. Purpose

This record prevents a safety patch from accidentally reversing an earlier
approved ERIM-PSH design.

It compares the ten items in `docs/GC02_PATCH_DECISION_REGISTER.md` against the
historical architecture, Vendor base plans, Generate SOP, UAT corrections,
security decisions, roadmap, and chronological Project Progress.

No application behavior is authorized by this compatibility record alone.

## 2. Record Control

| Field | Value |
| --- | --- |
| Record | `GC02-BASE-COMPAT-01` |
| Date | `31/July/2026` |
| Branch reviewed | `agent/desktop-v1` |
| Version context | `v1.1.17` working tree |
| Source patch register | `GC02-PATCH-DECISION-01` |
| Result | Six aligned, one compatible extension, one scope correction, one temporary clarity treatment, and one patch-only deferment |
| Implementation rule | A GC-02 audit finding does not silently supersede an approved owner decision |

## 3. Documents Reviewed

### Architecture and authority

1. `README.md`
2. `docs/architecture.md`
3. `docs/data-model.md`
4. `docs/permissions.md`
5. `docs/DFD_DETAILED_FUNCTION_PROCESS.md`
6. `docs/roadmap.md`
7. `PROJECT_PROGRESS.md`

### Vendor design and operational SOP

8. `docs/VENDOR_BOOKING_BASE_PLAN.md`
9. `docs/VENDOR_NEXT_MILESTONE_PLAN.md`
10. `docs/VENDOR_BOOKING_GENERATE_SOP.md`
11. `docs/MICRO_SPLIT_GENERATE_UX_REVISION_PLAN.md`
12. `docs/VENDOR_V113_BASE_PLAN.md`
13. `docs/VENDOR_V119_UAT_FOLLOWUP_NOTES.md`

### Related controls

14. `docs/SUPPLIER_MASTER_SOP.md`
15. `docs/SUPPLIER_LOCAL_RATE_APPROVAL_SYNC_SOP.md`
16. `docs/POST_NOTIFICATION_MATRIX_PLAN.md`
17. `docs/TRIAL_ISSUE_RECORD.md`
18. `docs/GENERAL_SYSTEM_CHECK_MILESTONE_RECORD.md`
19. `docs/GC02_PATCH_DECISION_REGISTER.md`

## 4. Decision Precedence Rule

When two records appear different, use this order:

1. the newest explicit owner clarification for the exact subject;
2. the newest correction/follow-up section that explicitly supersedes an older
   section;
3. an implemented and UAT-recorded behavior when no later owner correction
   exists;
4. the latest consolidated Base Plan/SOP;
5. older architectural/base records as historical intent;
6. an audit finding is evidence of risk, not automatic authority to redesign;
7. a proposed patch cannot close or replace an older business rule unless the
   owner has approved that change explicitly.

Example already present in the project:

- an older v1.1.13 section proposed an independent manual Total Pax;
- the later owner correction removed that field and retained manually entered
  Adult/Child/Infant with derived Total;
- the later correction is authoritative without deleting the historical text.

The same method must be used for GC-02.

## 5. Compatibility Matrix

| No. | Proposed patch | Historical intent | Compatibility result | Required guard before implementation |
| --- | --- | --- | --- | --- |
| 1 | Count repeated WhatsApp/Portal/Other sends as immutable attempts | Base Plan already requires WhatsApp Sent to record timestamp, actor, target, attempt, and proof. Later Generate design says a sent attempt is immutable and later action creates a new attempt. | `ALIGNED` | Append a new attempt/event; never update the previous evidence row. Keep supplier result and communication result separate. |
| 2 | Link Email sent directly in Gmail by searching the ERIM-selected subject | Existing primary SOP sends Email through the controlled ERIM Gmail composer and stores Message/Thread IDs. Base Plan forbids Subject as identity, and reply association must use Thread ID. | `COMPATIBLE EXTENSION — OWNER APPROVED` | Subject is discovery only. Require the connected sender, Sent Mail, exact Message/Thread IDs, recipient/time checks, and explicit selection when ambiguous. Do not replace normal `Send via Gmail`. |
| 3 | Treat Save/Revise affecting Sent services as a revision | Base Plan requires immutable old/new revisions, human impact choice, old confirmed history retention, and new Amend/Rebook/Cancel communication. | `ALIGNED — CORE PLAN` | Preserve source/service/booking IDs and snapshots. Never reinterpret a destructive save as a harmless draft replacement after delivery exists. |
| 4 | Stop exposing OAuth Client Secret to renderer | Security plan intentionally retains the legacy secret temporarily in local SQLite and records full removal as Pending. It must not enter renderer/source/package/log/Google. | `SCOPE CORRECTION REQUIRED` | Immediate patch removes the value only from renderer/bootstrap and introduces a privileged private-settings read. Keep the existing local-SQLite storage temporarily. PKCE/vault migration or deletion requires a separate owner-approved security milestone. |
| 5 | Keep Approval Center in one main window and mark it Temporary | Historical plan locates it under `Manager / Admin → Approval Center` and requires cross-PC central review. It does not require a separate popup. | `ALIGNED BUT TEMPORARY` | One-window UI must not be described as the final approval workflow. Cross-PC upload/readback, maker-checker, takeover, conflict, and duplicate-publish gates remain authoritative. |
| 6 | Make itinerary revision posting staged and resumable | Architecture requires versioned/immutable revisions, audit, idempotent sync, and safe retry. Existing Reservation behavior intentionally replaces the same Drive file while retaining Drive revisions. | `ALIGNED ENHANCEMENT` | Keep the same-file Drive revision design. Add recovery stages; do not silently change to a new-file-per-revision model. Never repeat Drive PATCH when the accepted revision can be proven. |
| 7 | Control external links/windows | Portal plan already recommends the normal system browser and defers embedded portal automation. Gmail/Drive plans require exact authorized links or a separate system window/panel. Internal Supplier correction uses a focused ERIM child window. | `ALIGNED WITH DESTINATION CLASSIFICATION` | External HTTPS content goes to a controlled system opener. Internal focused Supplier Master stays an isolated ERIM child window. Do not convert every child window into an external browser action. |
| 8 | Add Batch ID, per-package progress, retry/skip/resume for partial Generate | Previous plans require deterministic order, partial generated counts, persisted progress, exact resume, visible blocked packages, and never automatic/bulk send. | `ALIGNED` | Preserve approved channel/package/service sorting. Retry only failed package stages and never regenerate or send successful packages. Process remains guided manual delivery. |
| 9 | Append `(Itinerary)` to Process Report action labels | Base Plan requires actions such as Open Draft, Retry Post, Review Conflict, and View Posted Result to perform their valid contextual operation. Current code routes all rows to itinerary. | `TEMPORARY CLARITY ONLY` | The suffix may explain the present destination but cannot close the functional finding. Keep exact action processors in backlog and never claim Retry/View/Rebuild has run merely because itinerary opened. |
| 10 | Defer PWA from the desktop safety patch | Architecture fixes mobile as an authenticated read-only PWA. Roadmap targets the first installable-web UAT during the week of `03/August/2026`. | `DEFERRED FROM THIS PATCH — NOT CANCELED` | Keep PWA as a separate active milestone. Do not remove its read-only/auth/API/DNS/phone-UAT requirements or reinterpret deferment as cancellation. |

## 6. Historical Evidence by Patch

### 6.1 Repeated external attempts

Historical support:

- `docs/VENDOR_BOOKING_BASE_PLAN.md:437-441` — WhatsApp manual Sent records
  timestamp, actor, target, attempt, and proof.
- `docs/VENDOR_V119_UAT_FOLLOWUP_NOTES.md:205-213` — one channel per
  package/action; sent attempts remain immutable.
- `docs/VENDOR_V119_UAT_FOLLOWUP_NOTES.md:314-324` — resend receives a new
  linked attempt and the booking displays all attempt outcomes.

Compatibility conclusion:

The user clarification to count repeated external sends restores the intended
append-only attempt model. The patch must not implement a mutable
`last_external_reference` as the only evidence.

### 6.2 Email sent outside ERIM

Historical boundaries:

- `docs/VENDOR_BOOKING_BASE_PLAN.md:189-194` — an Email link requires a stored
  Gmail Thread ID and must not be constructed from Subject text.
- `docs/VENDOR_BOOKING_BASE_PLAN.md:426-435` — Gmail evidence includes Message
  ID, Thread ID, sender, recipient snapshot, Subject, attachments, and sent
  time.
- `docs/VENDOR_NEXT_MILESTONE_PLAN.md:183-190` — replies associate through
  Thread ID and must not be located solely through Subject search.
- `docs/VENDOR_V119_UAT_FOLLOWUP_NOTES.md:232-245` — controlled ERIM Gmail
  composer remains the normal Email-send path.

Compatibility conclusion:

`Link email sent outside system` is an approved extension, not a replacement
for controlled ERIM sending. Subject may discover candidates, but the stored
Message/Thread IDs become the identity/evidence.

### 6.3 Revision-safe Vendor Intake

Historical support:

- `docs/VENDOR_BOOKING_BASE_PLAN.md:404-419` — compare immutable revisions,
  require human impact choice, keep old confirmed history, and create
  Amend/Rebook/Cancel/New records without replacing the original row.
- `PROJECT_PROGRESS.md:493-494` — Amendment must not overwrite an already Sent
  booking; automatic old/new classification remains an unfinished foundation.
- `docs/architecture.md:117-120` — published work becomes read-only unless a
  controlled revision is created.

Compatibility conclusion:

The GC-02 patch repairs an implementation gap and returns behavior to the
original plan. It is not a redesign.

### 6.4 OAuth Client Secret

Historical decision:

- `docs/DFD_DETAILED_FUNCTION_PROCESS.md:243-250` — legacy OAuth secret is local
  only and is not required by the intended PKCE flow.
- `docs/DFD_DETAILED_FUNCTION_PROCESS.md:1794-1802` — owner temporarily accepted
  the field in local PC SQLite; removal/migration is future hardening.
- `PROJECT_PROGRESS.md:174-180` and `PROJECT_PROGRESS.md:655` — removal is
  Pending and the secret must never enter Git, logs, installers, Sheets, or
  Drive.
- `docs/DFD_DETAILED_FUNCTION_PROCESS.md:1785-1792` — credentials must not be
  packaged into renderer/source files.

Compatibility correction:

The immediate GC-02 scope is:

```text
keep secret temporarily in local SQLite
  -> main process reads it through a private settings function
  -> renderer receives only configured true/false
  -> no secret value in bootstrap/UI
```

The immediate patch must not silently delete or migrate the stored secret.

### 6.5 Approval Center

Historical support:

- `docs/VENDOR_V113_BASE_PLAN.md:1739-1855` — cross-PC Approval Center belongs
  under Manager/Admin and requires central snapshot/hash review,
  maker-checker, Resume/Takeover, conflict handling, and exact-once publish.
- `PROJECT_PROGRESS.md:741` — the same direction is recorded in the official
  chronology.

Compatibility conclusion:

The current single-window Temporary view is a valid shell at the correct menu
location. It is not final until central approval route deployment/readback and
cross-PC UAT pass.

### 6.6 Itinerary revision stages

Historical support:

- `docs/architecture.md:81-97` — publications/revisions retain version and
  lineage.
- `docs/VENDOR_BOOKING_BASE_PLAN.md:308-329` — itinerary revisions,
  communications, attempts, publications, links, and audit use stable IDs.
- `PROJECT_PROGRESS.md:630` — approved Reservation revision behavior replaces
  the Drive file and increments revision history with mandatory note.

Compatibility conclusion:

The patch adds recovery around the approved same-file revision process. It must
not change the document authority or create an unrelated revision storage
model.

### 6.7 External links and windows

Historical support:

- `docs/VENDOR_V119_UAT_FOLLOWUP_NOTES.md:97-140` — Supplier Portal opens in
  the normal system browser; optional embedded popup is deferred and would
  require strict isolation.
- `docs/architecture.md:198-210` — manually complete Portal booking and return
  to ERIM; browser automation is deferred.
- `PROJECT_PROGRESS.md:496` — exact Gmail thread may open in a separate system
  window/panel.
- `docs/MICRO_SPLIT_GENERATE_UX_REVISION_PLAN.md` and later Vendor plans —
  `Open exact Supplier Master` is an internal focused ERIM child window that
  returns to the same Generate context.

Compatibility classification:

| Destination | Correct treatment |
| --- | --- |
| Supplier Portal | Normal system browser through controlled HTTPS/host checks |
| WhatsApp `wa.me` | Normal system browser/app through controlled HTTPS target |
| Gmail Thread | Exact stored Thread ID through account-aware external link |
| Google Drive itinerary/contract | Controlled system browser link |
| Google OAuth | Privileged main-process system browser flow |
| Focused Supplier Master | Internal isolated ERIM child window, not an external site |

### 6.8 Generate batch recovery

Historical support:

- `docs/VENDOR_BOOKING_BASE_PLAN.md:146-160` — partially Generated itineraries
  remain visible with generated/total counts and exact deep links.
- `docs/VENDOR_V113_BASE_PLAN.md:368-444` — Generate and Resume land on the
  deterministic spreadsheet batch list.
- `docs/VENDOR_V113_BASE_PLAN.md:1346-1404` — Process is a guided manual session,
  uses deterministic order, preserves blocked rows, and resumes exact pending
  work.
- `docs/VENDOR_V113_BASE_PLAN.md:1593-1735` — Gmail stages derive from persisted
  ledgers, provide stage-safe Retry/Skip, and never repeat successful work.
- `docs/VENDOR_V119_UAT_FOLLOWUP_NOTES.md:827-880` — channel/package/service
  sorting is authoritative and deterministic.

Compatibility conclusion:

A durable Batch ID is a missing implementation mechanism for the already
approved behavior. It must preserve, not replace, the existing sort and
Process/Review UX.

### 6.9 Process Report labels and actions

Historical requirement:

- `docs/VENDOR_V113_BASE_PLAN.md:919-936` — Process Report must expose valid
  contextual actions including Open Draft, Retry Post, Review Conflict, and
  View Posted Result.
- `docs/VENDOR_V113_BASE_PLAN.md:1251-1286` — Booking Delivery Report actions
  must resolve exact authoritative state and cannot bypass safeguards.

Compatibility conclusion:

Adding `(Itinerary)` is honest temporary labeling for the current generic
destination. It is not the historical final behavior and must remain visibly
tracked as functional debt.

### 6.10 PWA deferment

Historical requirement:

- `README.md:61-73` — mobile remains a deferred read-only PWA foundation after
  the desktop milestone.
- `docs/architecture.md:28-48` — mobile is authenticated, role-filtered, and
  server-enforced read-only.
- `docs/roadmap.md:21-43` — first installable-web UAT targets the week of
  `03/August/2026`.
- `PROJECT_PROGRESS.md:48-55` — Mobile PWA is `IN PROGRESS`, not canceled.

Compatibility conclusion:

PWA is excluded only from this desktop safety patch. It remains an active,
separate milestone and must retain its target and architecture.

## 7. Do-Not-Regress Guard List

Every GC-02 implementation must preserve these approved rules:

1. Generate includes only `VENDOR` Micro Split type unless a later owner
   decision explicitly changes it.
2. Exactly one channel is active per package/action.
3. Portal same-supplier round-trip grouping and different-supplier separation
   remain intact.
4. Approved deterministic package and service sorting remains authoritative.
5. Generate never sends automatically.
6. Product/Service detail, not broad Day Wise Header prose, is the booking line.
7. `GENERATED`, `SENT_PENDING_SYNC`, `SENT/SYNCED`, supplier result, and
   confirmation remain separate states.
8. Gmail Send, Resend, Retry Sync, Reconcile, Amendment, and supplier
   Cancellation remain different actions.
9. Gmail Message/Thread IDs and every attempt snapshot remain immutable.
10. Cancel Sending applies per stable unsent Service ID only and creates no
    delivery evidence.
11. Reset Daywise remains blocked by any prepared/accepted/ambiguous Send
    Attempt or external delivery evidence.
12. `PENDING_RATE` remains operationally bookable with its approved warnings
    and provenance rules.
13. Portal passwords, OTPs, tokens, and cookies are never stored by ERIM in the
    current milestone.
14. Revision impact requires human judgement and never silently cancels or
    rewrites a confirmed booking.
15. Approval business state and publication/sync state remain separate.
16. Mobile remains server-enforced read-only.

## 8. Required Changes to the GC-02 Patch Register

The following wording is authoritative after this compatibility check:

1. OAuth immediate patch means **remove secret from renderer only** while
   retaining the owner-approved temporary local-SQLite storage.
2. Manual external Email means **discover then link a proven Gmail
   Message/Thread ID**, never mark Sent from Subject alone.
3. External navigation is **destination-classified**; focused Supplier Master
   remains an internal ERIM child window.
4. Process Report `(Itinerary)` is a temporary clarity label and does not close
   action-specific functional work.
5. PWA is deferred from this patch only and remains an active milestone.

## 9. Compatibility Gate Before Coding

Before implementing each GC-02 patch:

1. cite its row in this compatibility matrix;
2. cite the historical rule it preserves;
3. list the database/API statuses it may change;
4. list the records/statuses it must not change;
5. add a regression test for the historical behavior;
6. add a new test for the patch;
7. do not mark Fixed until packaged UAT proves both tests/behaviors.

## 10. Final Recommendation

The GC-02 safety work can continue without reversing the project when the
compatibility guards above are treated as release gates.

The most important correction is OAuth scope: fix renderer exposure now, but do
not silently remove the owner-approved temporary local SQLite credential.

The most important non-closure is Process Report: the `(Itinerary)` suffix is a
temporary truthful label, while action-specific Retry/View/Rebuild behavior
remains planned.

The PWA remains separate and active rather than being canceled by desktop patch
work.
