const API_VERSION = "v1";

function doGet() {
  return json_({
    ok: true,
    data: {
      service: "ERIM-PSH API",
      version: API_VERSION,
      serverTime: new Date().toISOString(),
    },
  });
}

function doPost(event) {
  try {
    const request = parseJsonBody_(event);
    const actor = authenticateRequest_(request.auth);
    const route = request.action;

    if (route === "publication.publish") {
      requireDesktop_(request, actor);
      return json_({ ok: true, data: publishDepartmentResult_(request, actor) });
    }

    if (route === "itinerary.event") {
      requireDesktop_(request, actor);
      return json_({ ok: true, data: recordItineraryEvent_(request, actor) });
    }

    if (route === "vendor.intake.save") {
      requireDesktop_(request, actor);
      return json_({ ok: true, data: saveVendorIntake_(request, actor) });
    }

    if (route === "tour.detail") {
      return json_({ ok: true, data: getTourDetail_(request.customerCode, actor) });
    }

    throw apiError_("NOT_FOUND", "Unknown API action.");
  } catch (error) {
    recordRejectedAudit_(error);
    return json_({
      ok: false,
      error: {
        code: error.code || "INTERNAL_ERROR",
        message: error.publicMessage || "The request could not be completed.",
        details: error.publicDetails || null,
      },
    });
  }
}

function parseJsonBody_(event) {
  const raw = event && event.postData && event.postData.contents;
  if (!raw) throw apiError_("INVALID_REQUEST", "Request body is required.");
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw apiError_("INVALID_JSON", "Request body must be valid JSON.");
  }
}

function authenticateRequest_(auth) {
  const token = auth && auth.accessToken;
  if (!token) throw apiError_("AUTH_REQUIRED", "Google authentication is required.");

  const response = UrlFetchApp.fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
    { muteHttpExceptions: true },
  );
  if (response.getResponseCode() !== 200) {
    throw apiError_("AUTH_INVALID", "Google session is invalid or expired.");
  }

  const identity = JSON.parse(response.getContentText());
  const properties = PropertiesService.getScriptProperties();
  const expectedClientId = properties.getProperty("GOOGLE_CLIENT_ID");
  const companyDomain = properties.getProperty("COMPANY_DOMAIN");
  if (expectedClientId && identity.aud !== expectedClientId) {
    throw apiError_("AUTH_AUDIENCE_INVALID", "Google session was not issued for ERIM-PSH.");
  }
  if (!identity.email || identity.email_verified !== "true") {
    throw apiError_("AUTH_EMAIL_REQUIRED", "A verified Google email is required.");
  }
  if (companyDomain && !identity.email.toLowerCase().endsWith(`@${companyDomain.toLowerCase()}`)) {
    throw apiError_("AUTH_DOMAIN_DENIED", "This Google account is outside the approved company domain.");
  }

  const employee = findRecord_("EMPLOYEES", "company_email", identity.email.toLowerCase());
  if (!employee || !truthy_(employee.active)) {
    throw apiError_("EMPLOYEE_INACTIVE", "This account is not an active ERIM-PSH employee.");
  }
  return {
    employeeId: employee.employee_id,
    fullName: employee.full_name || employee.company_email,
    email: identity.email.toLowerCase(),
    department: employee.department,
    role: employee.role,
    mobileAccess: truthy_(employee.mobile_access),
    desktopAccess: truthy_(employee.desktop_access),
  };
}

function requireDesktop_(request, actor) {
  if (request.clientMode !== "DESKTOP") {
    throw apiError_("MOBILE_READ_ONLY", "Mobile access is read-only.");
  }
  if (!actor.desktopAccess) {
    throw apiError_("DESKTOP_ACCESS_DENIED", "Desktop publishing is not enabled for this employee.");
  }
  if (request.draft && request.draft.department !== actor.department && actor.role !== "ADMIN") {
    throw apiError_("DEPARTMENT_DENIED", "You cannot publish another department's work.");
  }
}

function saveVendorIntake_(request, actor) {
  if (request.apiVersion !== API_VERSION) {
    throw apiError_("API_VERSION_UNSUPPORTED", "Desktop application must be updated before saving Vendor intake.");
  }
  const intake = request.intake || {};
  if (!request.requestId || !intake.customerCode || !intake.tourId) {
    throw apiError_("VALIDATION_ERROR", "Request ID, Customer Code, and Tour ID are required.");
  }
  validateVendorIntakePayload_(intake);
  const role = String(actor.role || "").toUpperCase().replace(/[ -]+/g, "_");
  if (String(actor.department || "").toUpperCase() !== "VENDOR"
      && !["ADMIN", "MANAGER", "ALL_ROUNDER"].includes(role)) {
    throw apiError_("DEPARTMENT_DENIED", "Vendor intake can only be posted by Vendor or oversight users.");
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const replay = findRecord_("AUDIT_LOG", "request_id", request.requestId);
    if (replay && replay.result === "SUCCESS") {
      return { customerCode: intake.customerCode, tourId: intake.tourId, replayed: true };
    }
    validateVendorSource_(request);
    ensureVendorSchema_();
    const now = new Date().toISOString();
    const code = String(intake.customerCode).trim().toUpperCase();
    const tour = findRecord_("TOURS", "customer_code", code);
    if (!tour) throw apiError_("TOUR_NOT_FOUND", "Customer Code was not found in TOURS.");
    if (String(tour.tour_id || "") !== String(intake.tourId || "")) {
      throw apiError_("TOUR_MISMATCH", "Customer Code and Tour ID do not refer to the same record.");
    }
    updateRecord_("TOURS", "customer_code", code, {
      client_name: intake.customerName || tour.client_name || "",
      pax_adult: Number(intake.adultPax || 0),
      pax_child: Number(intake.childPax || 0),
      pax_infant: Number(intake.infantPax || 0),
      arrival_date: intake.arrivalDate || "",
      arrival_flight: intake.arrivalFlight || "",
      arrival_sector: intake.arrivalSector || "",
      arrival_time: intake.arrivalTime || "",
      departure_date: intake.departureDate || "",
      departure_flight: intake.departureFlight || "",
      departure_sector: intake.departureSector || "",
      departure_time: intake.departureTime || "",
      record_version: Number(tour.record_version || 0) + 1,
      updated_at: now,
      updated_by: actor.employeeId,
    });
    (intake.hotels || []).forEach((hotel, index) => {
      const hotelStayId = hotel.hotelStayId || uuid_("HST");
      upsertVersionedRecord_(
        "TOUR_HOTEL_STAYS",
        "hotel_stay_id",
        hotelStayId,
        {
        hotel_stay_id: hotelStayId,
        tour_id: tour.tour_id,
        revision_id: intake.sourceRevisionId || "",
        stay_sequence: index + 1,
        hotel_name: hotel.hotelName || "",
        check_in_date: hotel.checkInDate || "",
        check_out_date: hotel.checkOutDate || "",
        status: "ACTIVE",
        record_version: 1,
        created_at: now,
        created_by: actor.employeeId,
        updated_at: now,
        updated_by: actor.employeeId,
        },
        actor,
        now,
      );
    });
    let splitCount = 0;
    (intake.days || []).forEach((day) => {
      const dayId = day.tourDayId || uuid_("TDAY");
      upsertVersionedRecord_("TOUR_DAYS", "tour_day_id", dayId, {
        tour_day_id: dayId,
        tour_id: tour.tour_id,
        revision_id: intake.sourceRevisionId || "",
        day_number: day.dayNumber,
        service_date: day.serviceDate || "",
        day_title: `Day ${day.dayNumber}`,
        location: "",
        arrival_departure_flag: Number(day.dayNumber) === 1 ? "ARRIVAL" : "",
        day_notes: day.daywiseText || "",
        status: "VENDOR_INTAKE_RECORDED",
        record_version: 1,
        created_at: now,
        created_by: actor.employeeId,
        updated_at: now,
        updated_by: actor.employeeId,
      }, actor, now);
      (day.splits || []).forEach((split, index) => {
        const serviceId = split.serviceId || uuid_("SVC");
        upsertVersionedRecord_("SERVICES", "service_id", serviceId, {
          service_id: serviceId,
          tour_day_id: dayId,
          tour_id: tour.tour_id,
          revision_id: intake.sourceRevisionId || "",
          service_sequence: index + 1,
          service_type: String(split.serviceType || "VENDOR").toUpperCase(),
          service_name: split.activityText || "",
          service_description: split.activityText || "",
          start_time: "",
          end_time: "",
          pickup_location: "",
          dropoff_location: "",
          quantity: 1,
          unit: "SERVICE",
          booking_required: String(split.serviceType || "").toUpperCase() === "VENDOR",
          status: "SPLIT_READY",
          notes: "",
          suggested_vendor_id: split.vendorId || "",
          suggested_vendor_name: split.vendorName || "",
          record_version: 1,
          created_at: now,
          created_by: actor.employeeId,
          updated_at: now,
          updated_by: actor.employeeId,
        }, actor, now);
        splitCount += 1;
      });
    });
    const auditId = uuid_("AUD");
    appendRecord_("AUDIT_LOG", {
      audit_id: auditId,
      event_timestamp: now,
      actor_employee_id: actor.employeeId,
      actor_email: actor.email,
      client_mode: "DESKTOP",
      action: "VENDOR_INTAKE_SAVED",
      entity_type: "TOUR",
      entity_id: tour.tour_id,
      tour_id: tour.tour_id,
      request_id: request.requestId,
      before_json: "",
      after_json: JSON.stringify({
        customerCode: code,
        sourcePublicationId: request.sourcePublicationId || "",
        sourceRecordVersion: Number(request.sourceRecordVersion || 0),
        adultPax: Number(intake.adultPax || 0),
        childPax: Number(intake.childPax || 0),
        infantPax: Number(intake.infantPax || 0),
        hotelCount: (intake.hotels || []).length,
        dayCount: (intake.days || []).length,
        splitCount,
      }),
      reason: "",
      result: "SUCCESS",
      error_code: "",
    });
    return {
      customerCode: code,
      tourId: tour.tour_id,
      auditId,
      hotelCount: (intake.hotels || []).length,
      dayCount: (intake.days || []).length,
      splitCount,
      replayed: false,
    };
  } finally {
    lock.releaseLock();
  }
}

function validateVendorIntakePayload_(intake) {
  const required = ["customerCode", "customerName", "tourId", "arrivalDate", "departureDate"];
  const missing = required.filter((field) => !String(intake[field] || "").trim());
  if (missing.length) {
    throw apiError_("VALIDATION_ERROR", `Missing Vendor intake fields: ${missing.join(", ")}.`);
  }
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(String(intake.arrivalDate)) || !isoDate.test(String(intake.departureDate))) {
    throw apiError_("VALIDATION_ERROR", "Arrival and departure dates must use YYYY-MM-DD.");
  }
  if (String(intake.departureDate) < String(intake.arrivalDate)) {
    throw apiError_("VALIDATION_ERROR", "Departure date cannot be earlier than arrival date.");
  }
  ["adultPax", "childPax", "infantPax"].forEach((field) => {
    const value = Number(intake[field] ?? 0);
    if (!Number.isInteger(value) || value < 0) {
      throw apiError_("VALIDATION_ERROR", "Adult, Child, and Infant must be whole numbers starting from 0.");
    }
  });
  const allowedTypes = ["VENDOR", "TOC", "VEHICLE", "ADDITIONAL_SERVICES"];
  const dayNumbers = {};
  (intake.days || []).forEach((day) => {
    const number = Number(day.dayNumber);
    if (!Number.isInteger(number) || number < 1 || dayNumbers[number]) {
      throw apiError_("VALIDATION_ERROR", "Day Wise numbers must be unique positive integers.");
    }
    dayNumbers[number] = true;
    (day.splits || []).forEach((split) => {
      if (!allowedTypes.includes(String(split.serviceType || "").toUpperCase())) {
        throw apiError_("VALIDATION_ERROR", "Unsupported Vendor micro split type.");
      }
    });
  });
}

function validateVendorSource_(request) {
  if (!request.sourcePublicationId) return;
  const source = findRecord_("DEPARTMENT_PUBLICATIONS", "publication_id", request.sourcePublicationId);
  if (!source || String(source.status) !== "PUBLISHED") {
    throw apiError_("VERSION_CONFLICT", "Reservation source is no longer current. Reload the itinerary.");
  }
  if (Number(source.published_record_version || 0) !== Number(request.sourceRecordVersion || 0)) {
    throw apiError_("VERSION_CONFLICT", "Reservation published a newer version. Reload before posting.", {
      expectedVersion: Number(source.published_record_version || 0),
      submittedVersion: Number(request.sourceRecordVersion || 0),
    });
  }
}

function ensureVendorSchema_() {
  ensureHeaders_("TOURS", [
    "pax_adult", "pax_child", "pax_infant",
    "arrival_flight", "arrival_sector", "arrival_time",
    "departure_flight", "departure_sector", "departure_time",
  ]);
  ensureSheetWithHeaders_("TOUR_HOTEL_STAYS", [
    "hotel_stay_id", "tour_id", "revision_id", "stay_sequence", "hotel_name",
    "check_in_date", "check_out_date", "status", "record_version",
    "created_at", "created_by", "updated_at", "updated_by",
  ]);
  ensureHeaders_("SERVICES", ["suggested_vendor_id", "suggested_vendor_name"]);
}

function publishDepartmentResult_(request, actor) {
  if (request.apiVersion !== API_VERSION) {
    throw apiError_("API_VERSION_UNSUPPORTED", "Desktop application must be updated before publishing.");
  }
  if (!request.idempotencyKey || !request.draft) {
    throw apiError_("VALIDATION_ERROR", "Idempotency key and draft are required.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existing = findRecord_("DEPARTMENT_PUBLICATIONS", "idempotency_key", request.idempotencyKey);
    if (existing) return publicationResponse_(existing, true);

    const draft = request.draft;
    validatePublicationDraft_(draft);
    validateSourceVersion_(draft);

    const now = new Date().toISOString();
    const reservationTour = draft.department === "RESERVATION" && draft.publicationType === "NEW_CONFIRMATION"
      ? upsertReservationTour_(draft, actor, now)
      : null;
    const resolvedTourId = draft.tourId || (reservationTour && reservationTour.tour_id) || "";
    const publicationId = uuid_("PUB");
    const officialEntityId = draft.officialEntityId || resolvedTourId || uuid_(entityPrefix_(draft.publicationType));
    const previous = latestDepartmentPublication_(resolvedTourId, draft.customerCode, draft.department);
    const publishedVersion = Number(previous && previous.published_record_version || 0) + 1;
    const contentHash = digest_(JSON.stringify(draft.payload));

    const publication = {
      publication_id: publicationId,
      idempotency_key: request.idempotencyKey,
      official_entity_id: officialEntityId,
      tour_id: resolvedTourId,
      customer_code: String(draft.customerCode).trim().toUpperCase(),
      department: draft.department,
      publication_type: draft.publicationType,
      source_publication_id: draft.sourcePublicationId || "",
      source_record_version: draft.sourceRecordVersion || "",
      published_record_version: publishedVersion,
      content_hash: contentHash,
      payload_json: JSON.stringify(draft.payload),
      status: "PUBLISHED",
      published_at: now,
      published_by: actor.employeeId,
      superseded_by_publication_id: "",
    };
    appendRecord_("DEPARTMENT_PUBLICATIONS", publication);

    if (previous) {
      updateRecord_(
        "DEPARTMENT_PUBLICATIONS",
        "publication_id",
        previous.publication_id,
        { status: "SUPERSEDED", superseded_by_publication_id: publicationId },
      );
    }

    if (draft.sourcePublicationId) {
      appendRecord_("PUBLICATION_LINKS", {
        publication_link_id: uuid_("LNK"),
        tour_id: resolvedTourId,
        customer_code: publication.customer_code,
        from_publication_id: draft.sourcePublicationId,
        to_publication_id: publicationId,
        relationship_type: "SOURCE_TO_RESULT",
        created_at: now,
        created_by: actor.employeeId,
      });
    }

    const isNewItinerary = draft.department === "RESERVATION"
      && draft.publicationType === "NEW_CONFIRMATION";
    appendRecord_("AUDIT_LOG", {
      audit_id: uuid_("AUD"),
      event_timestamp: now,
      actor_employee_id: actor.employeeId,
      actor_email: actor.email,
      client_mode: "DESKTOP",
      action: isNewItinerary ? "ITINERARY_POSTED" : "PUBLICATION_PUBLISH",
      entity_type: isNewItinerary ? "ITINERARY" : "DEPARTMENT_PUBLICATION",
      entity_id: isNewItinerary
        ? String(draft.payload.itineraryDriveFileId || publicationId)
        : publicationId,
      tour_id: resolvedTourId,
      request_id: request.idempotencyKey,
      before_json: previous ? JSON.stringify(previous) : "",
      after_json: JSON.stringify(isNewItinerary ? {
        customerCode: publication.customer_code,
        customerName: draft.payload.customerName || "",
        revisionNumber: 0,
        driveFileId: draft.payload.itineraryDriveFileId || "",
        driveFileName: draft.payload.itineraryDriveFileName || "",
        publicationId,
      } : publication),
      reason: isNewItinerary ? "New itinerary posted." : "",
      result: "SUCCESS",
      error_code: "",
    });
    if (isNewItinerary) {
      broadcastItineraryNotification_({
        tourId: resolvedTourId,
        revisionId: "",
        customerCode: publication.customer_code,
        eventType: "NEW",
        revisionNumber: 0,
        note: "New itinerary posted.",
      }, actor, now);
    }

    return publicationResponse_(publication, false);
  } finally {
    lock.releaseLock();
  }
}

function recordItineraryEvent_(request, actor) {
  if (request.apiVersion !== API_VERSION) {
    throw apiError_("API_VERSION_UNSUPPORTED", "Desktop application must be updated before recording itinerary activity.");
  }
  const eventId = String(request.eventId || "").trim();
  const eventType = String(request.eventType || "").trim().toUpperCase();
  const customerCode = String(request.customerCode || "").trim().toUpperCase();
  if (!eventId || !customerCode || !["REVISION", "DOWNLOAD"].includes(eventType)) {
    throw apiError_("VALIDATION_ERROR", "Event ID, Customer Code, and a supported itinerary event are required.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existing = findRecord_("AUDIT_LOG", "request_id", eventId);
    if (existing) {
      return { eventId, auditId: existing.audit_id, replayed: true, notificationsCreated: 0 };
    }
    const tour = request.tourId
      ? findRecord_("TOURS", "tour_id", request.tourId)
      : findRecord_("TOURS", "customer_code", customerCode);
    if (!tour) throw apiError_("TOUR_NOT_FOUND", "Customer Code was not found.");
    const now = new Date().toISOString();
    const revisionNumber = Number(request.revisionNumber || 0);
    const action = eventType === "REVISION" ? "ITINERARY_REVISED" : "ITINERARY_DOWNLOADED";
    const after = {
      customerCode,
      revisionNumber,
      driveFileId: request.driveFileId || "",
      driveFileName: request.driveFileName || "",
      downloadedFileName: request.downloadedFileName || "",
      note: request.note || "",
    };
    const auditId = uuid_("AUD");
    appendRecord_("AUDIT_LOG", {
      audit_id: auditId,
      event_timestamp: now,
      actor_employee_id: actor.employeeId,
      actor_email: actor.email,
      client_mode: "DESKTOP",
      action,
      entity_type: "ITINERARY",
      entity_id: request.driveFileId || eventId,
      tour_id: tour.tour_id,
      request_id: eventId,
      before_json: "",
      after_json: JSON.stringify(after),
      reason: request.note || "",
      result: "SUCCESS",
      error_code: "",
    });
    const notificationsCreated = eventType === "REVISION"
      ? broadcastItineraryNotification_({
        tourId: tour.tour_id,
        revisionId: eventId,
        customerCode,
        eventType,
        revisionNumber,
        note: request.note || "",
      }, actor, now)
      : 0;
    return { eventId, auditId, replayed: false, notificationsCreated };
  } finally {
    lock.releaseLock();
  }
}

function broadcastItineraryNotification_(details, actor, now) {
  const notificationId = uuid_("NOTIF");
  const revisionLabel = details.eventType === "REVISION"
    ? `REV ${details.revisionNumber}`
    : "New itinerary";
  appendRecord_("NOTIFICATIONS", {
    notification_id: notificationId,
    tour_id: details.tourId || "",
    revision_id: details.revisionId || "",
    notification_type: details.eventType === "REVISION"
      ? "ITINERARY_REVISED"
      : "ITINERARY_POSTED",
    title: `${details.customerCode} - ${revisionLabel}`,
    message: `${actor.fullName || actor.employeeId} ${details.eventType === "REVISION" ? "posted a revision" : "posted a new itinerary"}.${details.note ? ` Note: ${details.note}` : ""}`,
    source_module: "RESERVATION",
    action_url: details.eventType === "REVISION"
      ? `vendor-revise-itinerary:${details.customerCode}`
      : `vendor-new-itinerary:${details.customerCode}`,
    created_at: now,
    created_by: actor.employeeId,
    expires_at: "",
  });
  const recipients = allRecords_("EMPLOYEES")
    .filter((employee) => truthy_(employee.active)
      && (truthy_(employee.desktop_access) || truthy_(employee.mobile_access)))
    .filter((employee) => {
      const department = String(employee.department || "").toUpperCase();
      const role = String(employee.role || "").toUpperCase().replace(/[ -]+/g, "_");
      return department === "VENDOR"
        || ["ADMIN", "MANAGER", "ALL_ROUNDER"].includes(role)
        || String(employee.employee_id || "") === String(actor.employeeId || "");
    });
  recipients.forEach((employee) => {
    appendRecord_("NOTIF_RECIPIENTS", {
      notification_recipient_id: uuid_("NREC"),
      notification_id: notificationId,
      employee_id: employee.employee_id,
      delivery_status: "DELIVERED",
      read_at: "",
      acknowledged_at: "",
      action_status: "PENDING",
      action_note: "",
    });
  });
  return recipients.length;
}

function validatePublicationDraft_(draft) {
  const required = ["customerCode", "department", "publicationType", "payload"];
  const missing = required.filter((key) => draft[key] === undefined || draft[key] === null || draft[key] === "");
  if (missing.length) {
    throw apiError_("VALIDATION_ERROR", `Missing required fields: ${missing.join(", ")}.`);
  }
  if (Object.keys(draft.payload || {}).length === 0) {
    throw apiError_("VALIDATION_ERROR", "Publication payload cannot be empty.");
  }
}

function upsertReservationTour_(draft, actor, now) {
  ensureHeaders_("TOURS", [
    "itinerary_drive_file_id",
    "itinerary_drive_file_name",
    "itinerary_drive_file_url",
    "updated_at",
    "updated_by",
  ]);
  const code = String(draft.customerCode).trim().toUpperCase();
  const payload = draft.payload || {};
  const existing = findRecord_("TOURS", "customer_code", code);
  const tour = {
    tour_id: existing && existing.tour_id || uuid_("TOUR"),
    customer_code: code,
    client_name: payload.customerName || existing && existing.client_name || "",
    agent_name: payload.agentName || existing && existing.agent_name || "",
    confirmation_email_thread_id: payload.confirmationThreadId
      || existing && existing.confirmation_email_thread_id || "",
    itinerary_drive_file_id: payload.itineraryDriveFileId
      || existing && existing.itinerary_drive_file_id || "",
    itinerary_drive_file_name: payload.itineraryDriveFileName
      || existing && existing.itinerary_drive_file_name || "",
    itinerary_drive_file_url: payload.itineraryDriveFileUrl
      || existing && existing.itinerary_drive_file_url || "",
    updated_at: now,
    updated_by: actor.employeeId,
  };
  if (existing) {
    updateRecord_("TOURS", "customer_code", code, tour);
  } else {
    appendRecord_("TOURS", tour);
  }
  return tour;
}

function validateSourceVersion_(draft) {
  if (!draft.sourcePublicationId) return;
  const source = findRecord_("DEPARTMENT_PUBLICATIONS", "publication_id", draft.sourcePublicationId);
  if (!source) throw apiError_("SOURCE_NOT_FOUND", "The upstream publication no longer exists.");
  if (String(source.status) !== "PUBLISHED") {
    throw apiError_("VERSION_CONFLICT", "The upstream publication has been superseded.", {
      latestPublicationId: source.superseded_by_publication_id || "",
    });
  }
  if (Number(source.published_record_version) !== Number(draft.sourceRecordVersion)) {
    throw apiError_("VERSION_CONFLICT", "The upstream version changed. Refresh and review the latest publication.", {
      expectedVersion: Number(source.published_record_version),
      submittedVersion: Number(draft.sourceRecordVersion),
    });
  }
}

function getTourDetail_(customerCode, actor) {
  if (!customerCode) throw apiError_("VALIDATION_ERROR", "Customer Code is required.");
  if (!actor.mobileAccess && !actor.desktopAccess) {
    throw apiError_("ACCESS_DENIED", "This employee does not have ERIM-PSH access.");
  }
  const code = String(customerCode).trim().toUpperCase();
  const tour = findRecord_("TOURS", "customer_code", code);
  if (!tour) throw apiError_("TOUR_NOT_FOUND", "Customer Code was not found.");
  const publications = allRecords_("DEPARTMENT_PUBLICATIONS")
    .filter((row) => row.customer_code === code && row.status === "PUBLISHED")
    .map((row) => ({
      publicationId: row.publication_id,
      department: row.department,
      type: row.publication_type,
      version: row.published_record_version,
      publishedAt: row.published_at,
      publishedBy: row.published_by,
    }));
  const communications = allRecords_("COMMUNICATIONS")
    .filter((row) => row.tour_id === tour.tour_id)
    .map((row) => ({
      type: row.communication_type,
      channel: row.channel,
      status: row.status,
      gmailThreadId: row.gmail_thread_id,
      sentAt: row.sent_at,
    }));
  return { tour, publications, communications };
}

function publicationResponse_(publication, replayed) {
  return {
    publicationId: publication.publication_id,
    officialEntityId: publication.official_entity_id,
    tourId: publication.tour_id,
    publishedRecordVersion: Number(publication.published_record_version),
    publishedAt: publication.published_at,
    replayed,
  };
}

function latestDepartmentPublication_(tourId, customerCode, department) {
  return allRecords_("DEPARTMENT_PUBLICATIONS")
    .filter((row) =>
      (tourId ? row.tour_id === tourId : row.customer_code === String(customerCode).toUpperCase())
      && row.department === department
    )
    .sort((a, b) => Number(b.published_record_version) - Number(a.published_record_version))[0] || null;
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw apiError_("SERVER_NOT_CONFIGURED", "SPREADSHEET_ID is not configured.");
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  const sheet = spreadsheet_().getSheetByName(name);
  if (!sheet) throw apiError_("SCHEMA_MISSING", `Required sheet ${name} does not exist.`);
  return sheet;
}

function allRecords_(sheetName) {
  const values = sheet_(sheetName).getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1)
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function findRecord_(sheetName, key, value) {
  return allRecords_(sheetName).find((row) =>
    String(row[key] || "").toLowerCase() === String(value || "").toLowerCase()
  ) || null;
}

function appendRecord_(sheetName, record) {
  const sheet = sheet_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  sheet.appendRow(headers.map((header) => record[header] === undefined ? "" : record[header]));
}

function ensureHeaders_(sheetName, requiredHeaders) {
  const sheet = sheet_(sheetName);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  requiredHeaders.forEach((header) => {
    if (!headers.includes(header)) headers.push(header);
  });
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function ensureSheetWithHeaders_(sheetName, requiredHeaders) {
  const spreadsheet = spreadsheet_();
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String).filter(Boolean);
  requiredHeaders.forEach((header) => {
    if (!headers.includes(header)) headers.push(header);
  });
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function upsertVersionedRecord_(sheetName, key, value, record, actor, now) {
  const existing = findRecord_(sheetName, key, value);
  const versioned = Object.assign({}, record, {
    record_version: existing ? Number(existing.record_version || 0) + 1 : 1,
    created_at: existing && existing.created_at || record.created_at || now,
    created_by: existing && existing.created_by || record.created_by || actor.employeeId,
    updated_at: now,
    updated_by: actor.employeeId,
  });
  if (existing) {
    updateRecord_(sheetName, key, value, versioned);
  } else {
    appendRecord_(sheetName, versioned);
  }
}

function updateRecord_(sheetName, key, value, changes) {
  const sheet = sheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const keyIndex = headers.indexOf(key);
  if (keyIndex < 0) throw apiError_("SCHEMA_INVALID", `${sheetName}.${key} is missing.`);
  const rowIndex = values.findIndex((row, index) => index > 0 && String(row[keyIndex]) === String(value));
  if (rowIndex < 1) throw apiError_("RECORD_NOT_FOUND", `${sheetName} record was not found.`);
  Object.entries(changes).forEach(([field, fieldValue]) => {
    const columnIndex = headers.indexOf(field);
    if (columnIndex >= 0) sheet.getRange(rowIndex + 1, columnIndex + 1).setValue(fieldValue);
  });
}

function recordRejectedAudit_(error) {
  try {
    appendRecord_("AUDIT_LOG", {
      audit_id: uuid_("AUD"),
      event_timestamp: new Date().toISOString(),
      actor_employee_id: "",
      actor_email: "",
      client_mode: "",
      action: "REQUEST_REJECTED",
      entity_type: "",
      entity_id: "",
      tour_id: "",
      request_id: "",
      before_json: "",
      after_json: "",
      reason: error.publicMessage || error.message,
      result: "REJECTED",
      error_code: error.code || "INTERNAL_ERROR",
    });
  } catch (_auditError) {
    console.error("Unable to write rejected audit", _auditError);
  }
}

function apiError_(code, publicMessage, publicDetails) {
  const error = new Error(publicMessage);
  error.code = code;
  error.publicMessage = publicMessage;
  error.publicDetails = publicDetails || null;
  return error;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function truthy_(value) {
  return value === true || String(value).toUpperCase() === "TRUE" || String(value) === "1";
}

function uuid_(prefix) {
  return `${prefix}-${Utilities.getUuid()}`;
}

function entityPrefix_(publicationType) {
  const map = {
    NEW_CONFIRMATION: "TOUR",
    ITINERARY_REVISION: "REV",
    DAYWISE_BOOKING: "BKG",
    DRIVER_ASSIGNMENT: "DRV",
    CUSTOMER_INVOICE: "INV",
    PAYMENT_REQUEST: "PAYREQ",
  };
  return map[publicationType] || "ENT";
}

function digest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)
    .map((byte) => (byte + 256).toString(16).slice(-2))
    .join("");
}
