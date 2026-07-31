# Transport Module Foundation

## Navigation scope

The desktop Transport menu prepares these operational work areas:

1. New Itinerary Check
2. Revise Itinerary Check
3. Add Cost to Itinerary
4. Set Driver Detail
5. Review Arrival per Date
6. Review TOC per Itinerary
7. Cek KPI
8. Review Day Tour
9. Invoicing

The current release establishes navigation, terminology, and the intended data
boundaries. Business actions remain inactive until each Transport workflow is
discussed and approved. Placeholder pages must not create, revise, invoice, or
publish operational records.

## Shared operational principle

Transport follows the same published-itinerary and effective-dated Supplier
Master foundation as Vendor Booking. The differences will be Transport-specific
assignment, vehicle capacity, route/timing, driver, arrival/day-tour control,
TOC impact, extra cost, and invoice matching.

## Prepared workflow boundaries

| Menu | Prepared output | Future activation requirement |
| --- | --- | --- |
| New Itinerary Check | Structured vehicle requirement review | Required fields, checking status, ownership, and handoff rules |
| Revise Itinerary Check | Old/new impact classification | Keep, revise, reassign, add, and cancel rules |
| Add Cost to Itinerary | Supplier Product/Contract Rate selection | Surcharge, manual exception, approval, and cost snapshot rules |
| Set Driver Detail | Per-itinerary and per-day assignment foundation | Driver/vehicle fields, revision history, communication, and confirmation |
| Review Arrival per Date | Filtered arrival operations board and export boundary | Export columns, operational status, and dispatch ownership |
| Review TOC per Itinerary | Itinerary-level TOC review and export boundary | Full TOC rules, access/parking/route logic, and exceptions |
| Cek KPI | KPI dimensions only | Approved targets, weights, exclusions, and ownership |
| Review Day Tour | Daily readiness and completion foundation | Live statuses, evidence, exception, and closure rules |
| Invoicing | Transport cost-to-invoice matching boundary | Invoice intake, dispute, approval, reconciliation, and accounting handoff |

## Driver Master minimum

The future lightweight Driver Master starts with:

- Driver name
- International phone/WhatsApp number
- Supplier

The supplier remains editable. Driver assignment can apply to the whole
itinerary or a selected day. Any later revision must preserve the prior driver,
vehicle, actor, timestamp, and reason in history.

## Export controls

Review Arrival per Date and Review TOC per Itinerary are marked for export.
Exports must be generated from the filtered view, include the source itinerary
version and export timestamp, and must not mutate operational data.

