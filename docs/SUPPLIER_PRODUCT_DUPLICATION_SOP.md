# Supplier Product Duplication SOP

## Purpose

Use this workflow when the same service structure and price applies to several
suppliers, especially Transport vehicle products. Duplication is a local
staging operation. It does not write to Google until the reviewed Supplier
Master batch is published.

## Daily procedure

1. Open **Manager / Admin → Supplier Master**.
2. Select the Supplier Type and source supplier.
3. Find the source Product and select **Duplicate**.
4. Confirm or revise the Product/service name for the copies.
5. Choose one or more active destination suppliers from the same Type.
6. Choose whether to copy:
   - Contract validity, Terms and Conditions, and contract metadata.
   - Matching rates/prices for the selected Product.
7. Select **Save copies locally**.
8. Review the summary. Existing same-name Products are reported as conflicts
   and are never overwritten.
9. Open **Pending Supplier Master changes**, review the generated Product and
   Contract drafts, correct supplier-specific differences, then publish the
   approved batch to Google.

## Copy rules

- Product ID, Contract ID, and Contract Rate ID are always new.
- Product code is cleared so the new record can receive an independent code.
- Source Product details, inclusion, exclusion, operational notes, booking
  instructions, and Terms and Conditions are copied.
- Only rates belonging to the selected source Product are copied.
- Contract validity and currency are preserved when Contract copying is on.
- Google Drive contract files are not copied. The destination supplier must use
  its own contract evidence.
- Destination suppliers must be active and belong to the source Supplier Type.
- Same-name Product conflicts are skipped and listed; no update or overwrite is
  performed.
- All generated records enter SQLite `READY_TO_PUBLISH` staging and follow the
  existing dependency order: Product before Contract/Rate.

## Review checklist before Google publication

- Destination supplier is correct.
- Vehicle/service name and capacity are correct.
- Inclusion, exclusion, and operational notes apply to the destination.
- Rate basis and amount are correct.
- Contract validity is valid for the destination supplier.
- Contract number and destination-specific evidence are corrected if required.
- Conflicts have been opened and resolved from Supplier Master.

