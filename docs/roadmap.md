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

- Customer Code search
- Tour overview
- Today/on-ground services
- Driver and vehicle details
- Pending confirmations
- Current itinerary and email links
- Role-filtered fields and timeline

## Phase 3 - Desktop reservation foundation

- New confirmation intake
- Stable Drive itinerary file
- Revision and affected departments
- Notifications and work items

## Phase 4 - Department workflows

- Vendor/daywise/booking
- Transport/driver/rates/TOC
- Ops accounting/invoice/cost
- Cashier/payment evidence
- Manager monitoring and KPI

## Release gates

- No production data in DEV
- No anonymous API mutations
- Mobile mutations are rejected server-side
- Every official mutation is version-checked and audited
- Email recipients are restricted in DEV
- Resource ownership and recovery are documented before PROD migration

