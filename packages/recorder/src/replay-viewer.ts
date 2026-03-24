import { REPLAY_PLAYER_HEIGHT_PX, REPLAY_PLAYER_WIDTH_PX } from "./constants";
import type { ViewerRunState } from "./viewer-events";

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const RRWEB_PLAYER_VERSION = "2.0.0-alpha.18";
const RRWEB_PLAYER_CSS = `https://cdn.jsdelivr.net/npm/rrweb-player@${RRWEB_PLAYER_VERSION}/dist/style.css`;
const RRWEB_PLAYER_JS = `https://cdn.jsdelivr.net/npm/rrweb-player@${RRWEB_PLAYER_VERSION}/dist/rrweb-player.js`;

type EventsSource = "sse" | { ndjsonPath: string };

interface ReplayViewerOptions {
  title: string;
  bodyHtml?: string;
  eventsSource?: EventsSource;
  steps?: ViewerRunState;
}

const buildLoadEventsScript = (source: EventsSource): string => {
  if (source === "sse") {
    return `
      const res = await fetch('/latest.json');
      if (res.ok) { allEvents = await res.json(); if (allEvents.length >= 2) initPlayer(allEvents); }
      const es = new EventSource('/events');
      es.addEventListener('replay', (msg) => { try { for (const e of JSON.parse(msg.data)) { allEvents.push(e); if (player) player.getReplayer().addEvent(e); } if (!player && allEvents.length >= 2) initPlayer(allEvents); } catch {} });
      es.addEventListener('steps', (msg) => { try { updateSteps(JSON.parse(msg.data)); } catch {} });
      es.onerror = () => { if (statusEl) statusEl.textContent = 'Connection lost. Retrying...'; };`;
  }

  const escapedPath = source.ndjsonPath.replaceAll("'", "\\'");
  return `
      const res = await fetch('${escapedPath}');
      if (res.ok) {
        allEvents = (await res.text()).trim().split('\\n').map(l => JSON.parse(l));
        if (allEvents.length >= 2) initPlayer(allEvents);
        else if (statusEl) statusEl.textContent = 'No replay events recorded.';
      } else if (statusEl) statusEl.textContent = 'Failed to load replay.';`;
};

const buildStepsScript = (steps?: ViewerRunState): string => {
  const initialData = steps ? JSON.stringify(steps) : "null";
  return `
    const stepsPanel = document.getElementById('steps-panel');
    const runTitle = document.getElementById('run-title');
    const runStatus = document.getElementById('run-status');
    const runSummary = document.getElementById('run-summary');
    const stepsList = document.getElementById('steps-list');
    let initialSteps = ${initialData};
    if (initialSteps) updateSteps(initialSteps);

    function updateSteps(state) {
      if (!stepsPanel || !state) return;
      stepsPanel.style.display = 'block';
      if (runTitle) runTitle.textContent = state.title || 'Test Run';
      if (runStatus) {
        runStatus.textContent = state.status;
        runStatus.className = 'run-status status-' + state.status;
      }
      if (runSummary) {
        runSummary.textContent = state.summary || '';
        runSummary.style.display = state.summary ? 'block' : 'none';
      }
      if (stepsList && state.steps) {
        stepsList.innerHTML = '';
        for (const step of state.steps) {
          const li = document.createElement('li');
          li.className = 'step-item step-' + step.status;
          const badge = document.createElement('span');
          badge.className = 'step-badge';
          badge.textContent = step.status === 'passed' ? '\\u2713'
            : step.status === 'failed' ? '\\u2717'
            : step.status === 'active' ? '\\u25CF'
            : '\\u25CB';
          const title = document.createElement('span');
          title.className = 'step-title';
          title.textContent = step.title;
          li.appendChild(badge);
          li.appendChild(title);
          if (step.summary) {
            const summary = document.createElement('span');
            summary.className = 'step-summary';
            summary.textContent = step.summary;
            li.appendChild(summary);
          }
          stepsList.appendChild(li);
        }
      }
    }`;
};

const stepsStyles = `
    #steps-panel { display: none; margin-bottom: 24px; background: #1e293b; border-radius: 8px; padding: 20px; border: 1px solid #334155 }
    #steps-panel h2 { margin: 0 0 4px 0; font-size: 16px; font-weight: 600 }
    .run-status { display: inline-block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 4px; margin-bottom: 12px }
    .status-running { background: #1e3a5f; color: #60a5fa }
    .status-passed { background: #14532d; color: #4ade80 }
    .status-failed { background: #7f1d1d; color: #f87171 }
    #run-summary { font-size: 13px; color: #94a3b8; margin-bottom: 16px }
    #steps-list { list-style: none; padding: 0; margin: 0 }
    .step-item { display: flex; align-items: baseline; gap: 8px; padding: 6px 0; font-size: 14px; border-top: 1px solid #1e293b }
    .step-item:first-child { border-top: none }
    .step-badge { flex-shrink: 0; width: 16px; text-align: center; font-size: 13px }
    .step-pending .step-badge { color: #64748b }
    .step-active .step-badge { color: #60a5fa; animation: pulse 1.5s infinite }
    .step-passed .step-badge { color: #4ade80 }
    .step-failed .step-badge { color: #f87171 }
    .step-title { color: #e2e8f0 }
    .step-summary { color: #94a3b8; font-size: 12px; margin-left: auto; max-width: 50%; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
    @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`;

export const buildReplayViewerHtml = (options: ReplayViewerOptions): string => {
  const source = options.eventsSource;
  const isLive = source === "sse";

  const replaySection =
    source !== undefined
      ? `
    <div id="replay-container"><div class="status" id="status">Loading replay…</div></div>
    <script type="module">
      import rrwebPlayer from '${RRWEB_PLAYER_JS}';
      const container = document.getElementById('replay-container');
      const statusEl = document.getElementById('status');
      let player = null, allEvents = [];
      const initPlayer = (events) => {
        if (player) { player.getReplayer().addEvent(events.at(-1)); return; }
        if (events.length < 2) return;
        statusEl?.remove();
        player = new rrwebPlayer({ target: container, props: {
          events, width: ${REPLAY_PLAYER_WIDTH_PX}, height: ${REPLAY_PLAYER_HEIGHT_PX},
          autoPlay: ${isLive}, showController: ${!isLive}, ${isLive ? "liveMode: true," : ""}
        }});
        ${isLive ? "player.getReplayer().startLive();" : ""}
      };
      ${buildLoadEventsScript(source)}
    </script>`
      : "";

  const stepsSection = `
    <div id="steps-panel">
      <h2 id="run-title">Test Run</h2>
      <div id="run-status" class="run-status status-running">running</div>
      <div id="run-summary" style="display:none"></div>
      <ul id="steps-list"></ul>
    </div>
    <script>${buildStepsScript(options.steps)}</script>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.title)}</title>
  ${source !== undefined ? `<link rel="stylesheet" href="${RRWEB_PLAYER_CSS}" />` : ""}
  <style>
    :root { color-scheme: dark }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #0f172a; color: #e2e8f0 }
    h1, h2 { color: #f8fafc } a { color: #93c5fd }
    #replay-container { margin: 16px 0; border-radius: 8px; overflow: hidden }
    .status { text-align: center; padding: 16px; font-size: 14px; color: #9ca3af }
    ${stepsStyles}
  </style>
</head>
<body>
  <main style="max-width:${REPLAY_PLAYER_WIDTH_PX}px;margin:0 auto;padding:32px">
    ${options.bodyHtml ?? ""}
    ${stepsSection}
    ${replaySection}
  </main>
</body>
</html>`;
};
