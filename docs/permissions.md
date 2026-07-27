# Permission Baseline

## Device policy

| Capability | Mobile | Desktop |
| --- | --- | --- |
| Search by Customer Code | Allow | Allow |
| View status and timeline | Allow by role | Allow by role |
| Open itinerary/email/document links | Allow by role | Allow by role |
| View driver/on-ground details | Allow by role | Allow by role |
| View pending confirmations | Allow by role | Allow by role |
| Create or revise itinerary | Deny | Reservation only |
| Edit daywise, vendor, or driver | Deny | Authorized department |
| Send system communication | Deny | Authorized department |
| Change rate, TOC, or invoice | Deny | Authorized department |
| Approve or mark paid | Deny | Authorized approver/cashier |
| View Supplier Master | Deny | Authorized ERIM-PSH desktop users |
| Create/edit/archive supplier data and contracts | Deny | Manager/Admin only |

Supplier Master write routes require an active employee whose role is
`ADMIN`/`MANAGER` or whose department is `MANAGER_ADMIN`. The server performs
this check even when a desktop client exposes or manually constructs a request.
Archive actions require a reason and retain referenced history.

## Enforcement

The API must evaluate:

1. verified Google identity
2. active employee
3. department and role
4. route permission
5. entity ownership or assignment
6. requested fields
7. device/session mode
8. current record version

Mobile mutation requests return a stable `MOBILE_READ_ONLY` error even if a user
manually constructs the request.

## Sensitive fields

Financial totals, payment proof, guest contact details, internal notes, and
private vendor contact information require field-level visibility rules.
