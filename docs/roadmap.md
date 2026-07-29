# Foundation Roadmap

## Phase 0 - Decisions and preparation

- Finalize Customer Code rules
- Finalize employee/role/department list
- Finalize status catalogue and approval ownership
- Prepare dummy itinerary, confirmation, quotation, and booking data
- Create DEV Sheet, Drive folders, and Apps Script project

## Phase 1 - Technical integration spike

- Publish Hostinger HTTPS test
- Install PWA on Android and iPhone
- Configure Google identity
- Call Apps Script from the Hostinger origin
- Read and write one controlled test record
- Reject a mobile mutation
- Record and inspect an audit event

## Phase 2 - Mobile monitoring MVP

- Target first installable-web UAT: week of 2026-08-03.
- Delivery form: Hostinger-hosted PWA installed from the browser on Android and
  through Add to Home Screen on iPhone; no native Android package.
- First operational slice:
  - Google Workspace sign-in and role-filtered access
  - dashboard and notification/work Inbox
  - read-only Itinerary Check
  - booking communication/status tracking
  - Gmail thread deep links
- Customer Code search
- Tour overview
- Today/on-ground services
- Driver and vehicle details
- Pending confirmations
- Current itinerary and email links
- Role-filtered fields and timeline
- Keep Supplier Master bulk maintenance, document editing, and the full booking
  mail composer on desktop during the first mobile milestone.
- Cache only the application shell and non-sensitive preferences. OAuth tokens
  and operational records must not become a long-lived offline data store.
- Mobile mutation rejection remains enforced by Apps Script, not only by hidden
  interface controls.

## Phase 3 - Desktop reservation foundation

- New confirmation intake
- Stable Drive itinerary file
- Revision and affected departments
- Notifications and work items

## Phase 4 - Department workflows

- Vendor/daywise/booking
  - Focused build contract: `docs/VENDOR_BOOKING_BASE_PLAN.md`
  - v1.0.8 Sprint 1: Vendor role dashboard, general Inbox, New Itinerary intake,
    DOCX extraction/review, unlimited hotel stays, Day Wise paste workspace,
    and pre-generation micro split are implemented; live dummy Post/readback
    UAT remains before release.
  - Universal Lookup foundation for live per-keystroke vendor/program search
  - Canonical vendor IDs, historical aliases, contextual ranking, and keyboard navigation
  - Organic manual activity detail remains editable and authoritative
  - Daywise micro-item split, claim control, communication evidence, and per-item confirmation
- Transport/driver/rates/TOC
- Ops accounting/invoice/cost
- Cashier/payment evidence
- Manager monitoring and KPI

## Phase 5 - Sales and Production commercial chain

This phase starts after the operational core reaches its agreed milestone.

- Versioned vendor and transport contract rates with effective dates
- Daywise cost and derived/implied selling-rate calculation
- Quotation, quotation items, approval, sharing, reply trail, and revisions
- Accepted quotation to New Confirmation/Reservation handoff
- Rate sheet and commercial snapshot preservation
- Cost Sheet with quoted, contracted, and actual cost comparison
- Customer invoicing, payment, and variance linkage

## Release gates

- No production data in DEV
- No anonymous API mutations
- Mobile mutations are rejected server-side
- Every official mutation is version-checked and audited
- Email recipients are restricted in DEV
- Resource ownership and recovery are documented before PROD migration
