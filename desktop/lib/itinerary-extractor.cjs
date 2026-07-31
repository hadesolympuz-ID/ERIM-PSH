const MONTHS = {
  JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3,
  APR: 4, APRIL: 4, MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7,
  AUG: 8, AUGUST: 8, SEP: 9, SEPT: 9, SEPTEMBER: 9,
  OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11, DEC: 12, DECEMBER: 12,
};

function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tableRows(html) {
  return [...String(html || "").matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
    .map((table) => [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((row) => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((cell) => decodeHtml(cell[1]))
        .filter(Boolean))
      .filter((row) => row.length));
}

function uniqueAdjacent(values) {
  return values.filter((value, index) => !index || value !== values[index - 1]);
}

function rowAfter(rows, label) {
  const index = rows.findIndex((row) => row.some((cell) => cell.toUpperCase().includes(label)));
  return index >= 0 ? uniqueAdjacent(rows[index + 1] || []) : [];
}

function fieldValue(rows, label) {
  const upper = label.toUpperCase();
  for (const row of rows) {
    const index = row.findIndex((cell) => cell.toUpperCase().includes(upper));
    if (index >= 0 && row[index + 1]) return row[index + 1];
  }
  return "";
}

function normalizeDate(value) {
  const text = String(value || "").trim().toUpperCase().replace(/[.,]/g, " ");
  const match = text.match(/\b(\d{1,2})\s+([A-Z]+)\s+(\d{4})\b/);
  if (!match || !MONTHS[match[2]]) return "";
  return `${match[3]}-${String(MONTHS[match[2]]).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function normalizeTime(value) {
  const match = String(value || "").match(/\b([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\b/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
}

function extractProgramDays(tables) {
  const result = new Map();
  for (const rows of tables) {
    let currentDay = 0;
    let currentDate = "";
    for (const row of rows) {
      const cells = uniqueAdjacent(row).map((cell) => String(cell || "").trim()).filter(Boolean);
      const joined = cells.join(" | ");
      const dayMatch = joined.match(/\bDAY\s*(\d+)\b/i);
      if (dayMatch) {
        currentDay = Number(dayMatch[1]);
        currentDate = normalizeDate(joined) || currentDate;
      }
      const dateInRow = normalizeDate(joined);
      if (currentDay && dateInRow) currentDate = dateInRow;
      if (currentDay && /\bSTART\b/i.test(joined)) {
        const times = cells.map(normalizeTime).filter(Boolean);
        if (times.length) {
          const existing = result.get(currentDay) || {
            dayNumber: currentDay,
            serviceDate: currentDate,
            dayTitle: "",
          };
          result.set(currentDay, {
            ...existing,
            serviceDate: currentDate || existing.serviceDate,
            startTime: times[0] || existing.startTime || "",
            finishTime: times[1] || existing.finishTime || "",
          });
        }
      }
      const programIndex = cells.findIndex((cell) => /\bPROGRAMS?\b/i.test(cell));
      if (!currentDay || programIndex < 0) continue;
      const program = cells.slice(programIndex + 1).join(" ").replace(/^[:\s-]+/, "").trim();
      if (!program) continue;
      result.set(currentDay, {
        ...(result.get(currentDay) || {}),
        dayNumber: currentDay,
        serviceDate: currentDate,
        dayTitle: program,
      });
    }
  }
  return [...result.values()].sort((left, right) => left.dayNumber - right.dayNumber);
}

function extractItineraryFromHtml(html) {
  const tables = tableRows(html);
  const allRows = tables.flat();
  const header = tables.find((rows) =>
    rows.some((row) => row.some((cell) => cell.toUpperCase().includes("ARRIVAL DATE")))
  ) || tables[0] || [];
  const booking = rowAfter(header, "BOOKING CODE");
  const arrival = rowAfter(header, "ARRIVAL DATE");
  const departure = rowAfter(header, "DEPARTURE DATE");
  const hotels = [];
  tables.forEach((rows) => {
    const hotelHeaderIndex = rows.findIndex((row) => {
      const cells = row.map((cell) => cell.toUpperCase());
      return cells.some((cell) => cell === "IN" || cell.includes("CHECK IN"))
        && cells.some((cell) => cell === "OUT" || cell.includes("CHECK OUT"))
        && cells.some((cell) => cell.includes("ACCOM") || cell.includes("HOTEL"));
    });
    if (hotelHeaderIndex < 0) return;
    const hotelHeaders = rows[hotelHeaderIndex].map((cell) => cell.toUpperCase());
    const hotelIndex = hotelHeaders.findIndex((cell) => cell.includes("ACCOM") || cell.includes("HOTEL"));
    const checkInIndex = hotelHeaders.findIndex((cell) => cell === "IN" || cell.includes("CHECK IN"));
    const checkOutIndex = hotelHeaders.findIndex((cell) => cell === "OUT" || cell.includes("CHECK OUT"));
    for (const row of rows.slice(hotelHeaderIndex + 1)) {
      const values = uniqueAdjacent(row);
      if (values.some((cell) => cell.toUpperCase().includes("REQUIREMENT"))) break;
      const checkIn = normalizeDate(values[checkInIndex]);
      const checkOut = normalizeDate(values[checkOutIndex]);
      const hotelName = values[hotelIndex] || "";
      if (hotelName && checkIn && checkOut) {
        hotels.push({
          hotelStayId: "",
          hotelName,
          checkInDate: checkIn,
          checkOutDate: checkOut,
        });
      }
    }
  });
  return {
    customerCode: fieldValue(allRows, "CUSTOMER CODE") || booking[0] || "",
    customerName: fieldValue(allRows, "CUSTOMER NAME") || booking[1] || "",
    arrivalDate: normalizeDate(fieldValue(allRows, "ARRIVAL DATE") || arrival[0]),
    arrivalFlight: fieldValue(allRows, "ARRIVAL FLIGHT") || arrival[1] || "",
    arrivalSector: fieldValue(allRows, "ARRIVAL SECTOR") || arrival[2] || "",
    arrivalTime: normalizeTime(fieldValue(allRows, "ARRIVAL TIME") || arrival[3]),
    departureDate: normalizeDate(fieldValue(allRows, "DEPARTURE DATE") || departure[0]),
    departureFlight: fieldValue(allRows, "DEPARTURE FLIGHT") || departure[1] || "",
    departureSector: fieldValue(allRows, "DEPARTURE SECTOR") || departure[2] || "",
    departureTime: normalizeTime(fieldValue(allRows, "DEPARTURE TIME") || departure[3]),
    hotels,
    programDays: extractProgramDays(tables),
  };
}

module.exports = {
  extractItineraryFromHtml,
  normalizeDate,
  normalizeTime,
  extractProgramDays,
  tableRows,
};
