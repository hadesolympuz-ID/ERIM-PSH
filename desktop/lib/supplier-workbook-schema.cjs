const WORKBOOK_SHEETS = {
  SUPPLIERS: [
    "supplier_id", "type_code", "supplier_code", "supplier_name", "legal_name",
    "destinations", "address", "website", "tax_id", "internal_pic_employee_id",
    "operational_notes", "status", "record_version",
  ],
  CONTACTS: [
    "contact_id", "supplier_code", "contact_name", "position", "department",
    "phone", "whatsapp", "email", "preferred_channel", "operational_hours",
    "is_emergency", "responsibility", "status",
  ],
  RECIPIENTS: [
    "recipient_id", "supplier_code", "recipient_type", "channel", "address",
    "purpose", "sequence", "status",
  ],
  BOOKING_SOPS: [
    "sop_id", "supplier_code", "booking_channels", "lead_time", "cutoff_time",
    "required_information", "confirmation_procedure", "amendment_procedure",
    "cancellation_procedure", "emergency_procedure", "portal_url",
    "account_reference", "subject_template", "body_template", "status",
  ],
  PRODUCTS: [
    "product_id", "supplier_code", "product_code", "product_name", "category",
    "subcategory", "destinations", "description", "inclusion", "exclusion",
    "terms_and_conditions", "cancellation_terms", "booking_instructions",
    "minimum_order", "maximum_capacity", "tax_treatment", "notes", "status",
    "record_version",
  ],
  CONTRACTS: [
    "contract_id", "supplier_code", "contract_number", "contract_name",
    "valid_from", "valid_to", "currency", "tax_treatment",
    "terms_and_conditions", "drive_file_name", "drive_file_url",
    "allow_overlap", "overlap_reason", "status", "record_version",
  ],
  CONTRACT_RATES: [
    "contract_rate_id", "supplier_code", "contract_number", "product_code",
    "price_basis", "amount", "currency", "min_quantity", "max_quantity",
    "market", "season", "surcharge_rule", "valid_from", "valid_to", "notes",
    "status", "record_version",
  ],
};

const ISSUE_HEADERS = [
  "issue_id", "source_sheet", "source_row", "entity_type", "supplier_code",
  "record_code", "conflict_code", "conflict_reason", "conflicting_value",
  "existing_record_id", "existing_record_name", "recommended_action", "status",
];

const SUPPORTED_INITIAL_TYPES = [
  "VENDOR", "TOC", "TRANSPORT", "LUGGAGE_VAN", "ADDITIONAL_SERVICE",
];

module.exports = {
  ISSUE_HEADERS,
  SUPPORTED_INITIAL_TYPES,
  WORKBOOK_SHEETS,
};
