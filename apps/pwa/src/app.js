const config = window.ERIM_CONFIG || {};
const form = document.querySelector("#tour-search");
const input = document.querySelector("#customer-code");
const message = document.querySelector("#search-message");
const result = document.querySelector("#result");

const demoTour = {
  customerCode: "DEV-PSH-0001",
  clientName: "Development Guest",
  agentName: "Development Agent",
  arrivalDate: "2026-08-10",
  status: "ON_GROUND",
  updatedAt: "Development data",
  driver: {
    name: "Driver not connected",
    phone: "—",
    vehicle: "—"
  },
  pendingConfirmations: [
    {
      service: "Sample supplier booking",
      detail: "Awaiting API connection"
    }
  ],
  links: []
};

function setText(id, value) {
  document.querySelector(`#${id}`).textContent = value || "—";
}

function renderTour(tour) {
  setText("result-code", tour.customerCode);
  setText("result-status", tour.status);
  setText("result-client", tour.clientName);
  setText("result-agent", tour.agentName);
  setText("result-arrival", tour.arrivalDate);
  setText("result-updated", tour.updatedAt);
  setText("driver-name", tour.driver?.name || "Not assigned");
  setText("driver-phone", tour.driver?.phone);
  setText("driver-vehicle", tour.driver?.vehicle);

  const pending = tour.pendingConfirmations || [];
  setText("pending-count", String(pending.length));
  document.querySelector("#pending-list").replaceChildren(
    ...pending.map((item) => {
      const row = document.createElement("li");
      const title = document.createElement("strong");
      const detail = document.createElement("span");
      title.textContent = item.service;
      detail.textContent = item.detail;
      row.append(title, detail);
      return row;
    })
  );

  const links = (tour.links || []).filter((link) => /^https:\/\//.test(link.url));
  const linkNodes = links.length
    ? links.map((link) => {
        const anchor = document.createElement("a");
        anchor.href = link.url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = link.label;
        return anchor;
      })
    : [Object.assign(document.createElement("span"), { textContent: "Links will appear after Google integration." })];
  document.querySelector("#quick-links").replaceChildren(...linkNodes);
  result.hidden = false;
}

async function findTour(customerCode) {
  if (!config.apiBaseUrl) {
    if (customerCode.toUpperCase() === demoTour.customerCode) return demoTour;
    throw new Error("API is not connected yet. Try DEV-PSH-0001.");
  }

  const url = new URL(config.apiBaseUrl);
  url.searchParams.set("action", "tour.detail");
  url.searchParams.set("customerCode", customerCode);
  const response = await fetch(url, { method: "GET", credentials: "omit" });
  if (!response.ok) throw new Error("The status service could not be reached.");
  const body = await response.json();
  if (!body.ok) throw new Error(body.error?.message || "Tour not found.");
  return body.data;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const customerCode = input.value.trim();
  const button = form.querySelector("button");
  result.hidden = true;
  message.classList.remove("error");
  message.textContent = "Searching…";
  button.disabled = true;

  try {
    renderTour(await findTour(customerCode));
    message.textContent = "Latest available details.";
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("error");
  } finally {
    button.disabled = false;
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

