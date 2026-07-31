function setupReservationKpiDatabase() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID is not configured.");
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const detailHeaders = [
    "kpi_record_id",
    "followup_id",
    "customer_code",
    "tour_id",
    "source_type",
    "source_reference_id",
    "reservation_employee_id",
    "reservation_employee_name",
    "status",
    "started_at",
    "pending_hours",
    "kpi_band",
    "waiting_for_department",
    "pending_reason",
    "last_followup_at",
    "resolved_at",
    "resolution_hours",
    "updated_at",
    "recorded_by_email",
  ];

  let detail = ss.getSheetByName("RESERVATION_KPI");
  if (!detail) detail = ss.insertSheet("RESERVATION_KPI");
  detail.getRange(1, 1, 1, detailHeaders.length).setValues([detailHeaders]);
  detail.setFrozenRows(1);
  detail.getRange(1, 1, 1, detailHeaders.length)
    .setBackground("#e8eaed")
    .setFontColor("#202124")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  detail.getRange("I2:I2000").setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["PENDING", "RESOLVED", "CANCELED"], true)
      .setAllowInvalid(false)
      .build()
  );
  detail.getRange("M2:M2000").setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList([
        "RESERVATION",
        "VENDOR",
        "TRANSPORT",
        "OPS_ACCOUNTING",
        "GENERAL_CASHIER",
        "MANAGER_ADMIN",
        "EXTERNAL",
      ], true)
      .setAllowInvalid(true)
      .build()
  );
  if (!detail.getFilter()) {
    detail.getRange(1, 1, Math.max(detail.getMaxRows(), 2), detailHeaders.length).createFilter();
  }
  detail.setColumnWidth(1, 160);
  detail.setColumnWidth(2, 160);
  detail.setColumnWidth(3, 130);
  detail.setColumnWidth(4, 130);
  detail.setColumnWidth(5, 150);
  detail.setColumnWidth(6, 170);
  detail.setColumnWidth(7, 160);
  detail.setColumnWidth(8, 190);
  detail.setColumnWidth(9, 105);
  detail.setColumnWidth(10, 165);
  detail.setColumnWidth(11, 110);
  detail.setColumnWidth(12, 105);
  detail.setColumnWidth(13, 180);
  detail.setColumnWidth(14, 320);
  detail.setColumnWidth(15, 165);
  detail.setColumnWidth(16, 165);
  detail.setColumnWidth(17, 120);
  detail.setColumnWidth(18, 165);
  detail.setColumnWidth(19, 210);
  detail.getRange("K2:K2000").setNumberFormat("0.0");
  detail.getRange("Q2:Q2000").setNumberFormat("0.0");
  detail.getRange("A:S").setVerticalAlignment("middle");
  detail.getRange("N:N").setWrap(true);
  detail.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("ON_TRACK")
      .setBackground("#e6f4ea")
      .setFontColor("#137333")
      .setRanges([detail.getRange("L2:L2000")])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("ATTENTION")
      .setBackground("#fef7e0")
      .setFontColor("#b06000")
      .setRanges([detail.getRange("L2:L2000")])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("OVERDUE")
      .setBackground("#fce8e6")
      .setFontColor("#c5221f")
      .setRanges([detail.getRange("L2:L2000")])
      .build(),
  ]);

  let summary = ss.getSheetByName("RESERVATION_KPI_SUMMARY");
  if (!summary) summary = ss.insertSheet("RESERVATION_KPI_SUMMARY");
  summary.clear();
  summary.getRange("A1:C1").merge()
    .setValue("Reservation KPI — Management Summary")
    .setFontSize(16)
    .setFontWeight("bold")
    .setBackground("#f1f3f4")
    .setHorizontalAlignment("left");
  summary.getRange("A3:C3").setValues([["Metric", "Current value", "Management meaning"]])
    .setFontWeight("bold")
    .setBackground("#e8eaed");
  summary.getRange("A4:C12").setValues([
    ["Total KPI records", '=COUNTA(RESERVATION_KPI!A2:A)', "All recorded Reservation follow-ups"],
    ["Currently pending", '=COUNTIF(RESERVATION_KPI!I2:I,"PENDING")', "Open follow-ups requiring coordination"],
    ["On track", '=COUNTIFS(RESERVATION_KPI!I2:I,"PENDING",RESERVATION_KPI!L2:L,"ON_TRACK")', "Pending for less than 24 hours"],
    ["Attention", '=COUNTIFS(RESERVATION_KPI!I2:I,"PENDING",RESERVATION_KPI!L2:L,"ATTENTION")', "Pending for 24–48 hours"],
    ["Overdue", '=COUNTIFS(RESERVATION_KPI!I2:I,"PENDING",RESERVATION_KPI!L2:L,"OVERDUE")', "Pending for more than 48 hours"],
    ["Pending without reason", '=COUNTIFS(RESERVATION_KPI!I2:I,"PENDING",RESERVATION_KPI!N2:N,"")', "Items that need accountability notes"],
    ["Average pending hours", '=IFERROR(AVERAGEIF(RESERVATION_KPI!I2:I,"PENDING",RESERVATION_KPI!K2:K),0)', "Average age of open follow-ups"],
    ["Resolved records", '=COUNTIF(RESERVATION_KPI!I2:I,"RESOLVED")', "Completed follow-up records"],
    ["Average resolution hours", '=IFERROR(AVERAGE(RESERVATION_KPI!Q2:Q),0)', "Average time from post to resolution"],
  ]);
  summary.getRange("B4:B12").setNumberFormat("0.0");
  summary.getRange("A14:H14").setValues([[
    "Employee ID",
    "Employee Name",
    "Pending",
    "On Track",
    "Attention",
    "Overdue",
    "Missing Reason",
    "Resolved",
  ]]).setFontWeight("bold").setBackground("#e8eaed");
  summary.getRange("A15").setFormula(
    '=IFERROR(SORT(UNIQUE(FILTER(RESERVATION_KPI!G2:H,RESERVATION_KPI!G2:G<>"")),1,TRUE),"")'
  );
  for (let row = 15; row <= 200; row += 1) {
    summary.getRange(row, 3).setFormula(`=IF($A${row}="","",COUNTIFS(RESERVATION_KPI!$G:$G,$A${row},RESERVATION_KPI!$I:$I,"PENDING"))`);
    summary.getRange(row, 4).setFormula(`=IF($A${row}="","",COUNTIFS(RESERVATION_KPI!$G:$G,$A${row},RESERVATION_KPI!$I:$I,"PENDING",RESERVATION_KPI!$L:$L,"ON_TRACK"))`);
    summary.getRange(row, 5).setFormula(`=IF($A${row}="","",COUNTIFS(RESERVATION_KPI!$G:$G,$A${row},RESERVATION_KPI!$I:$I,"PENDING",RESERVATION_KPI!$L:$L,"ATTENTION"))`);
    summary.getRange(row, 6).setFormula(`=IF($A${row}="","",COUNTIFS(RESERVATION_KPI!$G:$G,$A${row},RESERVATION_KPI!$I:$I,"PENDING",RESERVATION_KPI!$L:$L,"OVERDUE"))`);
    summary.getRange(row, 7).setFormula(`=IF($A${row}="","",COUNTIFS(RESERVATION_KPI!$G:$G,$A${row},RESERVATION_KPI!$I:$I,"PENDING",RESERVATION_KPI!$N:$N,""))`);
    summary.getRange(row, 8).setFormula(`=IF($A${row}="","",COUNTIFS(RESERVATION_KPI!$G:$G,$A${row},RESERVATION_KPI!$I:$I,"RESOLVED"))`);
  }
  summary.setFrozenRows(3);
  summary.setColumnWidth(1, 190);
  summary.setColumnWidth(2, 190);
  summary.setColumnWidth(3, 320);
  summary.setColumnWidth(4, 120);
  summary.setColumnWidth(5, 120);
  summary.setColumnWidth(6, 120);
  summary.setColumnWidth(7, 140);
  summary.setColumnWidth(8, 120);
  summary.getRange("C4:C12").setWrap(true);

  SpreadsheetApp.flush();
  console.log(JSON.stringify({
    ok: true,
    detailSheet: "RESERVATION_KPI",
    summarySheet: "RESERVATION_KPI_SUMMARY",
  }));
}
