# ERIM-PSH GC-02 Patch Decision Register

## 1. Record Control

| Field | Value |
| --- | --- |
| Record | `GC02-PATCH-DECISION-01` |
| Date | `31/July/2026` |
| Source audit | `docs/GENERAL_SYSTEM_CHECK_MILESTONE_RECORD.md` — General Check Milestone `GC-02` |
| Application version reviewed | `v1.1.17` working tree |
| Branch | `agent/desktop-v1` |
| Target version | `v1.1.18` |
| Status | Implementation started; code-complete items and remaining UAT/gaps are tracked below |
| Purpose | Record owner clarification, proposed patch, estimated result, and likely residual issue before implementation |

This document began as a decision-only record. The implementation status column
was updated after the approved patch work started; historical requirements remain
the acceptance contract.

Historical compatibility is governed by
`docs/GC02_BASE_PLAN_COMPATIBILITY_CHECK.md`. If wording in this patch register
appears broader than that compatibility record, the compatibility guard wins
until the owner explicitly approves a new superseding decision.

## 2. Decision Summary

| No. | Area | Agreed patch direction | Current status | Estimated result after patch | Possible residual issue after patch |
| --- | --- | --- | --- | --- | --- |
| 1 | Repeated WhatsApp/Portal/Other delivery | Repeated delivery is allowed, but every delivery must create a new immutable attempt. Display total send count and full history instead of overwriting the previous evidence. | Implemented locally and in central evidence contract; automated ledger tests pass; packaged UAT pending | Every attempt remains visible with attempt number, time, actor, channel, evidence, result, and resend reason. | Manual evidence can still be inaccurate if staff enters the wrong reference. |
| 2 | Email sent outside ERIM | Allow staff to link an email sent manually from Gmail. Search Sent Mail using the exact booking subject selected from ERIM, then verify sender, recipient, time, Message ID, and Thread ID before attaching it to the booking. | Implemented with exact-subject Sent Mail discovery, candidate selection, Message/Thread evidence, and background central sync; live Gmail UAT pending | Externally sent Email can obtain real Gmail evidence without pretending ERIM sent it. | Subject alone is not unique. Multiple/no candidates require user selection; Gmail session must belong to the sending account. |
| 3 | Save/Revise after a booking was Sent | Treat the change as a revision. Preserve the original Sent snapshot and source lineage; create a new itinerary/service revision and prepare Amendment, Cancellation, or New Booking only for affected items. | Safety core implemented: before/proposed snapshots, affected IDs, immutable booking history, `AMENDMENT_REQUIRED`, and stale-send block. Full ambiguous-match/action planner remains open. | Destructive save no longer silently permits delivery from a stale generated snapshot. | Automatic classification and planned Amendment/Cancellation/New Booking UI still require the next workflow pass. |
| 4 | OAuth secret in renderer | Remove Google Client Secret from bootstrap/public settings. Renderer receives only a configured/not-configured indicator. The privileged main process continues reading the owner-approved temporary local-SQLite value through a private settings path. | Implemented and regression-tested; full credential migration deliberately out of scope | Renderer/bootstrap receives only configured/not-configured. Blank Settings save preserves the privileged stored value. | PKCE/vault migration and legacy-secret removal remain a separate owner-approved security milestone. |
| 5 | Approval Center | Keep Approval Center in the main ERIM window, repair the missing route title, add a safe route fallback, and mark the workflow Temporary pending owner review. | Route/UI patch implemented; automated verification passed; packaged interaction UAT pending | Code-level route failure fixed: Approval Center can continue to load inside the current window. | Central/local approval reconciliation and maker-checker business state still need separate UAT; fixing navigation alone does not prove the approval lifecycle. |
| 6 | Itinerary revision partial success | Convert revision posting into a durable staged job with stable request ID, Drive revision evidence, retry/resume, and stage-specific status. Never ask staff to repeat a completed Drive PATCH. | Durable local stages and same-request resume implemented; automated idempotency tests pass; live Drive failure-window UAT pending | Retry after a recorded `DRIVE_UPDATED` stage skips Drive upload and resumes the register/event/follow-up chain. | Google accepting PATCH while the PC loses the response before local stage persistence remains an ambiguous-outcome recovery case. |
| 7 | External links/windows | Inventory and route every external destination through a controlled HTTPS opener. Block main-window navigation and unmanaged child windows. | Controlled HTTPS opener, audit event, denied renderer child windows, and blocked main navigation implemented; packaged redirect UAT pending | External sites open in the default browser and ERIM remains on the active work screen. | Portal redirects, custom login domains, and future suppliers still need operational domain review. |
| 8 | Partial Generate batch | Add a stable Batch ID and per-package stages. Generated packages remain recoverable, with progress, retry, skip, and Resume Exact Batch. | Stable Batch ID, item stages, persisted failure, successful-item preservation, exact failed/pending retry, and audited-session Skip behavior implemented. | A failure no longer hides successful packages or requires blind regeneration. | Richer per-stage visualization remains; workflow is recoverable rather than externally atomic. |
| 9 | Process Report labels | Preserve the existing action label and append ` (Itinerary)`, for example `RETRY POST (Itinerary)`. Keep the current destination to the itinerary workspace until exact action processors are implemented. | Implemented as temporary label clarification; action processors remain open by design | Staff can see the current action opens itinerary work. | The button still does not execute the named Retry/View/Rebuild action automatically. |
| 10 | Mobile PWA | Record as not implemented and defer API/auth/DNS work to the dedicated mobile milestone. Do not treat it as a regression in this safety patch. | Deferred by owner | No change in this patch. Desktop patch scope remains focused. | PWA stays demo/non-operational until authenticated API contract, configuration, DNS, and phone UAT are completed. |

## 3. Detailed Patch Requirements

### 3.1 Repeated external delivery ledger

Repeated WhatsApp, Portal, and Other delivery is valid operational behavior.
The system must record it as history rather than updating the previous row.

Required attempt fields:

1. stable `delivery_attempt_id`;
2. booking/package/service linkage;
3. sequential display number: `Attempt 1`, `Attempt 2`, and so on;
4. channel;
5. action: New Booking, Amendment, Cancellation, Resend, or Other;
6. resend/repeat reason;
7. actor employee ID and verified email where available;
8. prepared time, action time, and recorded time;
9. Portal/WhatsApp/Other evidence/reference;
10. snapshot hash, recipients, subject/message snapshot, and service snapshot;
11. local state, central sync state, and error;
12. link to the preceding attempt when it is a resend/repeat.

UI result:

- show `Sent 3 times` or equivalent on the booking row;
- expand to view all attempts;
- never edit/delete the old evidence through a normal resend;
- provide correction as a new audited correction event, not a silent overwrite.

Suggested state separation:

```text
GENERATED
ACTION_RECORDED_LOCAL
SENT_PENDING_SYNC
SENT_SYNCED
SYNC_FAILED
OUTCOME_NEEDS_REVIEW
```

### 3.2 Email sent manually outside ERIM

Approved behavior:

1. staff opens the relevant Generated booking in ERIM;
2. staff chooses `Link email sent outside system`;
3. ERIM uses the selected booking's stored subject;
4. Gmail search is restricted to Sent Mail and the connected staff account;
5. candidates are checked against:
   - exact subject;
   - expected TO recipients where available;
   - sender/account identity;
   - a reasonable time window;
   - customer code and supplier where useful;
6. one exact candidate can be proposed;
7. multiple candidates must be shown for explicit selection;
8. no candidate leaves the booking unsent/unverified and allows a later recheck;
9. after selection, store Gmail Message ID, Thread ID, sent time, and evidence
   source `EXTERNAL_GMAIL_LINK`;
10. synchronize through the same central evidence ledger as an ERIM-sent email.

Existing reusable foundation:

- Gmail subject search already exists;
- unknown-outcome reconciliation already uses Sent Mail, exact subject,
  expected recipients, and a time boundary;
- therefore the patch should reuse and generalize that code rather than create
  an unrelated search implementation.

Safety rule:

Subject match alone must never silently mark a booking Sent. Reused subjects or
multiple recipients can produce more than one valid-looking Gmail result.

### 3.3 Revision-safe Vendor Intake

When any affected service already has Generated/Sent/Confirmed history:

1. keep the original Day and Micro Split source version;
2. save the edited intake as a new revision;
3. compare old and new service snapshots;
4. classify each service:
   - unchanged;
   - amended;
   - removed/cancelled;
   - newly added;
   - ambiguous match requiring review;
5. retain original booking and delivery attempts unchanged;
6. create the next communication action only for affected services;
7. show the operator the planned consequences before committing.

Normal unsent drafting can remain easy to edit, but it must use the same stable
identity rules so a later Sent record always has a recoverable parent.

### 3.4 What “renderer” means and what currently receives the secret

In this Electron application:

- **Main process** is the privileged desktop process. It owns SQLite, filesystem,
  Google services, windows, and IPC handlers.
- **Preload** exposes a limited `window.erim` bridge.
- **Renderer** is the visible ERIM HTML/JavaScript window
  (`desktop/renderer/index.html` and `desktop/renderer/app.js`).

Current flow:

```text
SQLite app_settings
  -> database.getPublicSettings()
  -> main IPC app:bootstrap
  -> renderer state.bootstrap.settings
  -> renderSettings()
  -> visible Settings form field
```

`getPublicSettings()` currently includes the actual `googleClientSecret`, so the
renderer receives the secret value. The planned patch changes the renderer
payload to something like:

```text
googleClientId: visible value if operationally required
googleClientSecretConfigured: true/false
googleClientSecret: never returned
```

For the immediate compatible patch, secret updates are write-only from the
Settings UI and remain persisted in the owner-approved temporary local SQLite
setting. The main process reads the value through a private settings function;
bootstrap/public settings never return it. Moving the value to OS credential
storage or removing it entirely remains a separate owner-approved security
milestone.

### 3.5 Approval Center step-by-step verification

Current path:

1. user clicks `Approval Center`;
2. delegated navigation handler reads `data-manager-action`;
3. handler calls `showView("approval-center", "MANAGER_ADMIN")`;
4. `showView()` activates `approval-center-view`;
5. `showView()` looks up `titles["approval-center"]`;
6. no such title entry exists;
7. `titles[view][0]` throws a JavaScript error;
8. control does not return normally to the click handler;
9. `loadApprovalCenter()` is therefore not reliably called.

Patch/UAT path:

1. add the Approval Center title definition;
2. make `showView()` fallback safely for every unknown route;
3. click Approval Center from Manager/Admin;
4. confirm correct active menu and title;
5. confirm Loading state;
6. confirm online result or explicit local-cache warning;
7. test search and status filter;
8. test maker-checker restriction;
9. test Approve, Changes, Reject, and Take Over Sync;
10. refresh/reopen and confirm status readback remains consistent.

Implementation update `31/July/2026`:

- Approval Center remains one section in the existing main ERIM window;
- no new Approval Center `BrowserWindow` or popup was added;
- menu and page now display a Temporary marker;
- missing title route was added;
- unknown routes now receive a safe display-title fallback instead of crashing
  while reading an absent title;
- source regression test was added and passes;
- packaged click-through and the final owner-approved business workflow remain
  pending, so the page must continue to show its Temporary marker.

### 3.6 Itinerary revision step-by-step verification

Current backend order:

1. validate Customer Code, note, file, and Drive File ID;
2. verify the selected file still exists and is DOCX;
3. read DOCX bytes;
4. PATCH the real Google Drive file;
5. list Google Drive revisions;
6. calculate revision number and generate a new local request ID;
7. append the revision record to the central revision register;
8. record the revision event/notification;
9. return success to the renderer.

Current renderer continuation:

10. create/start the Reservation follow-up locally;
11. close the Revision dialog;
12. refresh the application;
13. return to Reservation workspace;
14. show success or an activity warning.

Confirmed failure windows:

- failure at step 5 or 7 occurs after Drive has already changed, but the UI sees
  a normal error;
- event failure at step 8 is converted to a warning, which is safer;
- follow-up failure at step 10 enters the renderer catch even though steps 4–9
  may already have succeeded;
- clicking Post again can repeat work against the already changed Drive file.

Planned stages:

```text
PREPARED
DRIVE_PATCH_REQUESTED
DRIVE_REVISION_VERIFIED
REVISION_REGISTERED
EVENT_PENDING / EVENT_RECORDED
FOLLOWUP_PENDING / FOLLOWUP_RECORDED
COMPLETED
NEEDS_RECONCILIATION
```

The UI must offer `Resume pending stages`, not a blind repeat of `Post`.

### 3.7 External destination inventory

| No. | Visible action | Destination/source | Current opening path | Planned control |
| --- | --- | --- | --- | --- |
| 1 | Vendor `Open Drive` | Posted itinerary Google Drive URL | Anchor with `target="_blank"` | Controlled HTTPS external opener |
| 2 | Re Check `Open Drive` | Latest itinerary Google Drive URL | Anchor with `target="_blank"` | Controlled HTTPS external opener |
| 3 | Revision `Open in Google Drive` | Revision Drive URL | Anchor with `target="_blank"` | Controlled HTTPS external opener |
| 4 | Supplier Contract `Open uploaded contract` | Stored contract Drive URL | Normal anchor without external target/intercept; can navigate ERIM window | Controlled HTTPS external opener |
| 5 | `Open Gmail thread` | `mail.google.com`, currently account slot `/u/0/` | `external.open` IPC | Controlled opener plus verified sender/account-qualified URL |
| 6 | `Open WhatsApp` | `https://wa.me/<number>` | `external.open` IPC | Controlled opener with strict host and number validation |
| 7 | `Open supplier portal` | Supplier Master Portal URL | `external.open` IPC | Controlled opener with normalized HTTPS URL and host audit |
| 8 | Google OAuth login | Google authorization URL | Main-process `shell.openExternal` | Keep privileged; restrict expected OAuth host/path |

Current IPC rejects non-HTTPS URLs, which is useful. The missing controls are:

- renderer main-window navigation denial;
- child-window denial;
- destination host policy/audit;
- consistent external opening for all anchors;
- account-aware Gmail URLs.

### 3.8 Generate batch double-check

Confirmed current sequence:

1. collect selected services and group by package;
2. obtain a preview for every package;
3. if Email exists, run Gmail preflight;
4. optionally allow Draft Only;
5. call `generateBooking()` sequentially for each prepared package;
6. each successful call persists that package immediately;
7. add it only to the in-memory `generatedBatch`;
8. if a later package throws, execution jumps to one generic catch;
9. generated packages remain stored;
10. the complete Batch Review dialog is not opened by that failed run;
11. the existing Resume Generated Drafts action can recover drafts, but it can
    mix this partial batch with older Generated drafts and has no failed-package
    stage record.

Planned behavior:

1. create Batch ID before package generation;
2. persist package manifest and order;
3. stage each package as Pending, Generating, Generated, Failed, Skipped, or
   Cancelled;
4. display progress during generation;
5. always open the batch result, even when some packages fail;
6. allow Retry Failed, Skip, Cancel Sending Item, and Resume Exact Batch;
7. make retry idempotent using Batch ID + Package ID + snapshot hash;
8. never silently regenerate a package that already succeeded.

Estimated outcome:

This will make the workflow recoverable and understandable. It will not make
all external work one atomic transaction, which is neither practical nor
necessary when every stage is durable and idempotent.

### 3.9 Process Report label clarification

Approved display rule:

```text
<EXISTING REQUIRED ACTION> (Itinerary)
```

Examples:

- `RETRY POST (Itinerary)`
- `VIEW POSTED RESULT (Itinerary)`
- `REBUILD AND POST (Itinerary)`

For this patch, the destination remains the loaded Vendor New/Revise Itinerary
workspace. Exact action-specific processors remain a separate functional
milestone. The suffix is a clarity patch, not a claim that Retry or Rebuild is
already executed automatically.

### 3.10 PWA scope decision

The mobile PWA is not implemented as an operational client yet. The existing
API/auth/DNS findings remain recorded under `GC02-P0-007`, but are deferred from
this desktop safety patch.

Dedicated mobile milestone must later cover:

1. hosting and DNS;
2. deployment configuration;
3. Google authentication and employee access;
4. one POST/GET API contract agreed with Apps Script;
5. read-only permission rules;
6. PWA navigation and offline behavior;
7. physical-phone and installer UAT.

## 4. Estimated Closure Matrix

| Item | Expected after proposed patch | Audit finding disposition estimate |
| --- | --- | --- |
| Repeated external delivery | Fully traceable, no overwrite | `GC02-P0-001` can close after local + central ledger UAT |
| Manual external Email | Supported with real Gmail evidence | Email portion can close; ambiguous/no-match cases remain controlled Attention states |
| Revision-safe intake | Sent parent/snapshot preserved | `GC02-P0-002` can close after revision/delete/archive regression tests |
| Renderer secret | Secret removed from renderer while temporary SQLite storage remains unchanged | `GC02-P0-003` renderer-exposure finding can close after bootstrap/renderer inspection; full legacy-secret removal remains separately open |
| Approval Center | Single-window route patched and visibly Temporary | `GC02-P0-004` is code-fixed but remains pending packaged click-through UAT; approval lifecycle findings remain |
| Revision posting | Staged and resumable | `GC02-P0-005` can close after injected-failure UAT at every stage |
| External navigation | Main window protected | `GC02-P0-006` can close after destination and preload-isolation tests |
| Generate partial batch | Recoverable and exact | `GC02-P1-001` can close after package-N failure simulation |
| Report labels | Clear itinerary destination | Label ambiguity closes; action-specific behavior remains open |
| PWA | Deferred | `GC02-P0-007` remains open by owner decision |

## 5. Required Tests Before Marking Fixed

1. External channel: record three sends and prove Attempt 1/2/3 remain
   immutable locally and centrally.
2. External Email: find exactly one Sent message; test zero and multiple
   candidates; verify Message ID and Thread ID.
3. Revise: change/remove a Sent service and prove old source, snapshot, and
   attempt remain readable.
4. Renderer secret: inspect bootstrap payload and renderer memory/UI; actual
   secret must be absent, while the existing local SQLite value remains usable
   by the privileged main process.
5. Approval Center: real click-through plus every review action and refresh.
6. Revision: inject failure after Drive PATCH, after revision register, after
   event, and before follow-up; resume without a second Drive change.
7. External links: each listed link opens only the system browser; main ERIM
   window and preload remain isolated.
8. Generate: fail package N of a multi-package batch, then retry only N and
   prove packages 1..N-1 were not regenerated.
9. Process Report: verify every displayed label includes `(Itinerary)` and
   opens the intended customer itinerary.
10. PWA: no closure test in this patch; finding remains explicitly open.

## 6. Implementation Status

| Phase | Status |
| --- | --- |
| Owner clarification | Recorded |
| Source verification | Completed for all ten points |
| Patch design estimate | Recorded |
| Code implementation | Approval Center single-window route patch completed; other listed patches not started |
| Automated regression tests | Approval Center route/Temporary marker test added; remaining patch tests not started |
| Packaged Electron UAT | Not started |
| Commit/push/release | Not started |
