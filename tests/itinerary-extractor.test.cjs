const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractItineraryFromHtml,
  normalizeDate,
  normalizeTime,
} = require("../desktop/lib/itinerary-extractor.cjs");

test("extracts flight, dates, customer, and repeatable hotels from itinerary tables", () => {
  const html = `
    <table>
      <tr><td>Customer Code</td><td>GA/PSHBALI1325</td></tr>
      <tr><td>Customer Name</td><td>Ganesh Biswal</td></tr>
      <tr><td>Arrival Date</td><td>11 AUGUST 2026</td></tr>
      <tr><td>Arrival Flight</td><td>MH 715</td></tr>
      <tr><td>Arrival Sector</td><td>KUL - DPS</td></tr>
      <tr><td>Arrival Time</td><td>12.05</td></tr>
      <tr><td>Departure Date</td><td>18 AUG 2026</td></tr>
      <tr><td>Departure Flight</td><td>MH850</td></tr>
      <tr><td>Departure Time</td><td>16:25</td></tr>
    </table>
    <table>
      <tr><th>Hotel</th><th>Check In</th><th>Check Out</th></tr>
      <tr><td>Metland Venya</td><td>11 AUG 2026</td><td>15 AUG 2026</td></tr>
      <tr><td>Taluh Bebek</td><td>15 AUG 2026</td><td>18 AUG 2026</td></tr>
    </table>
  `;
  const result = extractItineraryFromHtml(html);
  assert.equal(result.customerCode, "GA/PSHBALI1325");
  assert.equal(result.customerName, "Ganesh Biswal");
  assert.equal(result.arrivalDate, "2026-08-11");
  assert.equal(result.arrivalFlight, "MH 715");
  assert.equal(result.arrivalTime, "12:05");
  assert.equal(result.departureDate, "2026-08-18");
  assert.equal(result.hotels.length, 2);
  assert.deepEqual(result.hotels[1], {
    hotelStayId: "",
    hotelName: "Taluh Bebek",
    checkInDate: "2026-08-15",
    checkOutDate: "2026-08-18",
  });
});

test("normalizes month variants and dotted time", () => {
  assert.equal(normalizeDate("28 JULY 2026"), "2026-07-28");
  assert.equal(normalizeDate("01 Jul 2026"), "2026-07-01");
  assert.equal(normalizeTime("13.35"), "13:35");
});

test("extracts Day Wise Program headers from the posted itinerary", () => {
  const html = `
    <table>
      <tr><td>Day 1 :</td><td>Date :</td><td>02 OCT 2026</td></tr>
      <tr><td>Programs :</td><td>ARRIVAL AND ULUWATU SUNSET</td></tr>
      <tr><td>Day 2 :</td><td>Date :</td><td>03 OCT 2026</td></tr>
      <tr><td>Programs :</td><td>FULL DAY UBUD TOUR</td></tr>
    </table>`;
  const result = extractItineraryFromHtml(html);
  assert.deepEqual(result.programDays, [{
    dayNumber: 1, serviceDate: "2026-10-02", dayTitle: "ARRIVAL AND ULUWATU SUNSET",
  }, {
    dayNumber: 2, serviceDate: "2026-10-03", dayTitle: "FULL DAY UBUD TOUR",
  }]);
});
