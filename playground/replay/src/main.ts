import {
  getEvents,
  getAllEvents,
  getEventCount,
} from "@browser-tester/browser/runtime";

const EVENT_TYPE_NAMES: Record<number, string> = {
  0: "DomContentLoaded",
  1: "Load",
  2: "FullSnapshot",
  3: "IncrementalSnapshot",
  4: "Meta",
  5: "Custom",
  6: "Plugin",
};

const countBadge = document.getElementById("event-count") as HTMLSpanElement;
const eventLog = document.getElementById("event-log") as HTMLDivElement;
const emptyState = document.getElementById("empty-state") as HTMLDivElement;

const refreshCount = () => {
  countBadge.textContent = String(getEventCount());
};

const renderEvents = (events: ReadonlyArray<{ type: number; timestamp: number }>) => {
  if (events.length === 0) return;
  emptyState.style.display = "none";

  for (const event of events) {
    const entry = document.createElement("div");
    entry.className = "event-entry";

    const typeName = EVENT_TYPE_NAMES[event.type] ?? `Unknown(${event.type})`;
    const relativeTime = new Date(event.timestamp).toLocaleTimeString();

    const summary = document.createElement("span");
    summary.innerHTML = `<span class="event-type">${typeName}</span><span class="event-time">${relativeTime}</span>`;

    const detail = document.createElement("div");
    detail.className = "event-detail";
    detail.textContent = JSON.stringify(event, undefined, 2);

    entry.appendChild(summary);
    entry.appendChild(detail);
    entry.addEventListener("click", () => entry.classList.toggle("expanded"));

    eventLog.appendChild(entry);
  }

  eventLog.scrollTop = eventLog.scrollHeight;
};

document.getElementById("ctrl-refresh")?.addEventListener("click", () => {
  refreshCount();
  renderEvents(getAllEvents());
});

document.getElementById("ctrl-drain")?.addEventListener("click", () => {
  const drained = getEvents();
  refreshCount();
  renderEvents(drained);
});

document.getElementById("ctrl-clear")?.addEventListener("click", () => {
  eventLog.querySelectorAll(".event-entry").forEach((entry) => entry.remove());
  emptyState.style.display = "flex";
});

let counterValue = 0;
const counterDisplay = document.getElementById("counter-display") as HTMLSpanElement;

document.getElementById("increment")?.addEventListener("click", () => {
  counterValue += 1;
  counterDisplay.textContent = String(counterValue);
});

document.getElementById("decrement")?.addEventListener("click", () => {
  counterValue -= 1;
  counterDisplay.textContent = String(counterValue);
});

setInterval(refreshCount, 500);
