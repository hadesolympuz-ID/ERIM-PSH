# Vendor Booking Next Milestone Plan

Status: `APPROVED FOR NEXT DEVELOPMENT`  
Recorded: 2026-07-28  
Target: post-v1.1.7 Vendor Booking development

Historical note: this plan governed the milestone delivered through v1.1.12.
The authoritative next-step base plan is now
`docs/VENDOR_V113_BASE_PLAN.md`.

## 1. Milestone outcome

The next milestone delivers one connected Vendor Booking operating loop:

```text
Itinerary Check read model
  → Vendor Dashboard work cards
  → Vendor Inbox register and work notifications
  → item readiness and master-data correction
  → SOP-based Generate / mail merge
  → safe Send ledger
  → Gmail reply linking
  → operational UAT
```

The milestone is not complete when only the UI is visible. Dashboard counts,
Inbox records, Itinerary Check, generated messages, sent evidence, and reply
links must resolve to the same stable Customer/Day/Service/Booking identities.

## 2. Generate and Send Booking

### 2.1 Item readiness panel

- Display every Vendor-owned Micro Split item with Client Code, Day/date,
  Supplier, Product/service, Type, pax, rate/contract readiness, selected
  channel, destination readiness, and booking state.
- `VENDOR` and `ADDITIONAL_SERVICE` enter Vendor generation.
- Transport, TOC, and Luggage Van remain owned by Transport.
- A pending or manual rate does not block booking communication.
- Non-contracted items and missing WhatsApp, Email, Portal, Recipient, or
  Booking SOP data receive visible notices.
- Every notice has a direct action to the exact Supplier Master entry.
- Corrections save through Local Pending and controlled publish, then refresh
  the affected readiness item without retyping.

### 2.2 SOP channel selection

- Available channels come from the active Supplier Booking SOP.
- Staff may select or change Email, WhatsApp, Portal, or Others before
  generation.
- Changing the channel immediately revalidates its required destination.
- A missing destination produces an actionable notice, not a dead control.

### 2.3 Email generation popup

Email generation uses a two-section popup:

- left: outgoing item selection, To/CC/BCC, Subject, mail-merge preview,
  attachments, rate warnings, and generation controls;
- right: permitted Gmail thread/context and the final generated message.

The final mail-merge body, Subject format, tokens, conditional sections, and
attachment rules follow samples supplied by the project owner. Generation
never sends automatically.

### 2.4 External channels

- WhatsApp, Portal, and Others use the same generated snapshot.
- Sent status requires an external booking reference or evidence note.
- Delivery, supplier reply, and supplier confirmation remain separate events.

## 3. Safe Send ledger

Email safety is a milestone gate:

1. Create a stable Send Attempt ID before calling Gmail.
2. Persist the exact booking snapshot, source revision, recipients, Subject,
   Body, attachment references, actor, and attempt time.
3. Send through the connected employee Gmail only after final confirmation.
4. Store Gmail message ID and thread ID after Gmail accepts the message.
5. Publish the official booking/communication evidence idempotently.
6. If Gmail succeeds but official Google sync fails, use
   `SENT_PENDING_SYNC`.
7. Retry only the official evidence sync; never resend the email.

A previously Sent action cannot be silently sent again. Staff must prepare an
Amendment, Cancellation, or explicitly approved new attempt.

## 4. Vendor Dashboard

The dashboard contains four work cards:

1. `New Itinerary — Not Split`: required Vendor work is not fully split and is
   not marked Vendor-complete.
2. `Split — Not Generated`: Micro Split exists, but one or more supplier
   packages have no current generated communication.
3. `Email Replied — Check Thread`: an inbound Gmail reply exists and has not
   completed human review.
4. `Upcoming Arrival Recheck`: arrival is D+1 through D+7 in the operational
   timezone; the action opens Itinerary Check with Client Code preloaded.

Counts aggregate by Client Code but preserve exact Day, service, booking, and
source-revision links. Opening a card does not mark it complete.

## 5. Vendor Inbox

Vendor Inbox has two independently scrolling sections.

### 5.1 Left — Booking Register

The wider left section lists `GENERATED`, `SENT_PENDING_SYNC`, and `SENT`
booking packages. Generated must never look like Sent.

Each record shows:

- Client Code and Customer Name;
- Adult, Child, and Infant pax;
- Supplier and Product/service with Day/date;
- New, Amendment, or Cancellation action;
- channel and generated/sent timestamps;
- rate readiness and supplier result;
- exact Gmail thread link when available;
- external reference/evidence for non-email channels.

Search matches Client Code, Customer Name, Supplier, and Product/service. Sort
supports Sent time, Generated time, and Client Code. Filters include state,
channel, action, supplier, and optional date range.

### 5.2 Right — Work Inbox

Initial incoming events:

- New Itinerary;
- Revised Itinerary.

Each event deep-links to the exact shared New/Revise workspace with Client Code,
source revision, and work context preloaded. Additional event types are added
incrementally after approval. Read, acknowledged, claimed, and completed remain
separate states.

## 6. Itinerary Check

Itinerary Check is a read-only submenu directly below the Vendor Dashboard and
is also the destination of the D+1–D+7 Recheck action.

Staff search a Client Code and receive:

```text
Client Code — Guest — Arrival/Departure
├─ Day 1 — date — Day Wise subject/title
│  ├─ Vendor — item — supplier — booking state — Gmail thread
│  ├─ Transport — item — supplier/vehicle — operational state
│  └─ TOC — item — location/service — operational state
└─ Day 2 — date — Day Wise subject/title
   └─ Additional Service — item — supplier — rate/booking state
```

The view includes Vendor, Additional Service, Transport, TOC, and Luggage Van
for complete inspection. Visibility does not transfer ownership. Vendor may not
edit Transport-owned data from this view.

Vendor-by-Email rows link only through stored Gmail thread IDs. External
channels show evidence/reference. Missing evidence displays a clear state
instead of a dead link. Searching, expanding, or opening a thread does not
change booking status or infer confirmation.

## 7. State and identity contract

The implementation keeps these states separate:

- split/readiness state;
- booking package state;
- communication generation/delivery state;
- official-sync state;
- supplier reply/review/result state;
- revision-impact state.

Stable IDs are mandatory for Client/Tour, source revision, Day, service,
supplier booking, communication, send attempt, and Gmail thread/message.
Subject text, visible names, Sheet row numbers, and current list order are not
identities.

## 8. Gmail reply association

- Associate inbound and outbound messages through Gmail thread ID.
- Do not locate a reply solely through Subject search.
- Receiving a reply creates a review task; it never automatically means
  Confirmed.
- Thread review and business result are separate audit events.
- Gmail access respects the connected employee and role permissions.

## 9. Permissions and ownership

- Vendor can inspect complete itinerary context where authorized.
- Transport, TOC, and Luggage Van mutations remain owned by Transport.
- Supplier Master corrections require the existing authorized Manager/Admin
  workflow.
- Email send uses the connected employee identity and approved destinations.
- Opening Dashboard, Inbox, Itinerary Check, or Gmail evidence does not grant
  mutation authority.

## 10. Delivery sequence

1. Build the stable Itinerary Check read model.
2. Derive the four Dashboard cards from that model and official work states.
3. Build the Booking Register and Work Inbox.
4. Add item readiness checks and exact master-entry deep links.
5. Apply the approved mail-merge/Subject samples to the Email popup.
6. Implement the safe Send ledger and idempotent official sync.
7. Link Gmail replies and human review state.
8. Run full operational UAT before enabling unrestricted live send.

## 11. UAT gates

- An unsplit itinerary appears only in the applicable unsplit work card.
- A partially generated itinerary shows correct generated/total counts.
- Generated, Sent Pending Sync, and Sent remain visibly distinct.
- A Gmail success followed by sync failure never causes a second email.
- Search by Client Code and Customer Name finds the expected Booking Register
  records.
- Email history opens the exact stored Gmail thread.
- New and Revised notifications open the exact working revision.
- D+1 through D+7 uses the operational timezone and opens Itinerary Check.
- Itinerary Check shows Day Wise subject/title and every available split type.
- Vendor cannot mutate Transport-owned data from Itinerary Check.
- A reply creates Review Required and never auto-confirms the supplier.
- Pending/manual rate items remain bookable and retain their warning/evidence.

## 12. Inputs still required

- approved sample New Booking mail merge;
- approved Amendment and Cancellation variants;
- approved Subject formats;
- attachment rules and sample files;
- approved live-UAT Email recipients;
- decision on Gmail context presentation in the right side of the popup.
