import rrwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";
import type { eventWithTime } from "@rrweb/types";
import { updateSteps } from "./steps";
import "./style.css";

const REPLAY_WIDTH = 960;
const REPLAY_HEIGHT = 540;

const app = document.getElementById("app")!;

app.innerHTML = `
  <div id="steps-panel">
    <h2 id="run-title">Test Run</h2>
    <div id="run-status" class="run-status status-running">running</div>
    <div id="run-summary" style="display:none"></div>
    <ul id="steps-list"></ul>
  </div>
  <div id="replay-container">
    <div class="status" id="status">Loading replay\u2026</div>
  </div>
`;

const container = document.getElementById("replay-container")!;
const statusElement = document.getElementById("status");
let player: rrwebPlayer | undefined;
let allEvents: eventWithTime[] = [];

const initPlayer = (events: eventWithTime[]): void => {
  if (player) {
    player.getReplayer().addEvent(events.at(-1)!);
    return;
  }
  if (events.length < 2) return;

  statusElement?.remove();
  player = new rrwebPlayer({
    target: container,
    props: {
      events,
      width: REPLAY_WIDTH,
      height: REPLAY_HEIGHT,
      autoPlay: true,
      showController: false,
      liveMode: true,
    },
  });
  player.getReplayer().startLive();
};

const bootstrap = async (): Promise<void> => {
  const latestResponse = await fetch("/latest.json");
  if (latestResponse.ok) {
    allEvents = await latestResponse.json();
    if (allEvents.length >= 2) initPlayer(allEvents);
  }

  const stepsResponse = await fetch("/steps");
  if (stepsResponse.ok) {
    const state = await stepsResponse.json();
    if (state && state.steps) updateSteps(state);
  }

  const eventSource = new EventSource("/events");

  eventSource.addEventListener("replay", (message) => {
    try {
      const events: eventWithTime[] = JSON.parse(message.data);
      for (const event of events) {
        allEvents.push(event);
        if (player) player.getReplayer().addEvent(event);
      }
      if (!player && allEvents.length >= 2) initPlayer(allEvents);
    } catch {
      // ignore malformed events
    }
  });

  eventSource.addEventListener("steps", (message) => {
    try {
      updateSteps(JSON.parse(message.data));
    } catch {
      // ignore malformed steps
    }
  });

  eventSource.onerror = () => {
    if (statusElement) statusElement.textContent = "Connection lost. Retrying...";
  };
};

bootstrap();
