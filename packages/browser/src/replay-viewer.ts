import { REPLAY_PLAYER_HEIGHT_PX, REPLAY_PLAYER_WIDTH_PX } from "./constants";
import type { ViewerRunState } from "./mcp/viewer-events";

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
      if (window.__EXPECT_REPLAY_NDJSON__) {
        allEvents = window.__EXPECT_REPLAY_NDJSON__.trim().split('\\n').map(l => JSON.parse(l));
        if (allEvents.length >= 2) initPlayer(allEvents);
        else if (statusEl) statusEl.textContent = 'No replay events recorded.';
      } else {
        const res = await fetch('${escapedPath}');
        if (res.ok) {
          allEvents = (await res.text()).trim().split('\\n').map(l => JSON.parse(l));
          if (allEvents.length >= 2) initPlayer(allEvents);
          else if (statusEl) statusEl.textContent = 'No replay events recorded.';
        } else if (statusEl) statusEl.textContent = 'Failed to load replay.';
      }`;
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

  const ndjsonLoaderScript =
    source !== undefined && source !== "sse"
      ? `
    <script>
      (function(){var b=location.pathname.split('/').pop().replace(/\\.html$/,'');document.write('<scr'+'ipt src="'+b+'.ndjson.js"></scr'+'ipt>');})();
    </script>`
      : "";

  const replaySection =
    source !== undefined
      ? `
    <div id="replay-container"><div class="status" id="status">Loading replay…</div></div>
    ${ndjsonLoaderScript}
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
    .replayer-mouse {
      background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAwCAYAAABqkJjhAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAzfHTVMAAATkSURBVGje7ZnbS1xXFMZ1xtFJvGQy8dZbMknNnTTTpKm0Sby0WkqgaISWvjQKKZi/IOTBBzWmLRQ6veRBKCpiffLJB6tQ0TwE9EHjg9BiqDcUKVHQjlVR0cm35duye3KmzpzsM5NCNnxkzjpj5nf2WWuvtfdKCIVCCf8nJbwEjiewMhLDyPYRLbAEc1BOSl7bDm4FWIAlQS4ohUrmtVMBf2GABWxKMBi8PTIychmfD0AZUCrk5n3boKMFdnAm9y8tLX2zvb291NnZWYrrV6AsyAPt43dsgbYCLFwgY35+/lvYQltbW38PDQ3dge1N6DXIKx7ILmgrwGIGvbOzs4GQMvr7+2thPwMdhg7RRbRDRwvs5OxlTU9P/yBA4cehxcXFHeienp57uHcOOgJlEjpZJ7RV4OyJiYmfBGRtbW3I7/fvQg8PD7fg/nnIR+g0Qjt1QFsFzhkfH78vgcX/o0LjYbph80NHGYzaoLUBh4F+Gzom3giUzoB9LmitwEZoBObD4uLiQq4gOTqgtQMbobFe/1lYWFgM+3Eol0lGhU6MO7AZdEFBwQewn2CSOWA1K9oGbAZdXV1dBvtJ6FWr0LYCG6E3Njb+aWho+AL2U4SWqTxiaNuBzaDr6+tvwH6aqfxgNNAxATaDrqurq2Qqf53QEdUfMQM2Qiup/Cz0RqRFU0yBzaC7u7u/Yv0RUdEUc2Az6K6urq9hf0upP1LDpfK4AJtBM5Wf36v+iBuwkM/n2ylPDdB+1h+m0HEFFvJ4PKHJycldaHz+VfHpZwIxZsDie5EOuMpQeXn5RdYe6eos2wKMH9uZOaNdncm9xurq6h9MLB6mcHuAZTCZPUhRUdEuEIqhu7DdgkQC+Qz6BBI78Cuso08o6VvWHIm2FfDiXxFURmhsVqWvPibsdYKKM46LTCR5zIByi5WifYaFC6gRL0ZLS4vpyiBHTU1NA2zXoPe5Ducx6+UyiWQYzzm0AauwfX19D+Rn4QbhAnB5efkJrj+G3lVcwGs4SXKpxb4WYDGTcjQ2Nrbi/s2xsbFHPK/4z6Wso6MjAFs+dyTq3i/JcFanZx1Ws1Vzc/PPuPc5VFFWVlYt7VVVVc9AC5us3PLz86+x3Mylz7psK37kGB0dfQB7OfQRJDaeBYODg20MMNNlTgag+B6uLzBZeDjDDq0HKVNTUz9KWLz+3+iLRdA7zFTnxD5uc3Nz2biaiMALBAL/ejvcPh1jsLnD7aytAIuozZyZmfle/NDCwsIjXF+F3mPxIiNd6GRvb2+9dB0RgKq/y7GysvJXU1PTLR4HZPI3tAA7+PQH5+bmvltbW/u9pKTkCkFPszzM5mv1MlOdCQaDj82yGezz7e3t9/GdD5ksfPw7rcDCv9LhBjcqKyvP8jX6CJfJKHfTdcSPH2lra/tSBV1fX19pbW1tZNIogS5xWVPPLRy6gF2cgQz6WxZBPUrhLVsKqZzxPFHQCH8eGBj4BRnxUwbnVc7s8TC7aC0tAyeh3ARKUxZ5tXbdPfwWM1dRUXGhtLT0MoPyEkGlG+XwnGKfIVFoa8o4OQvJSkMmybDIy36ImzDZDMSj1GG6gFepF5L26URZ6dMbWV7iWV6Liou5CSWD0cuHSFPSb0RtM6uNxYQIG4pqmyyZs+hW3McV7aHg8wBHOsK9EUuNyJfN8VjrKRBH46IWXfwqAAAAAElFTkSuQmCC') !important;
      background-size: contain !important;
      background-position: top left !important;
      width: 72px !important;
      height: 72px !important;
      transition: left 0.15s cubic-bezier(0.25, 1, 0.5, 1), top 0.15s cubic-bezier(0.25, 1, 0.5, 1), width 0.2s ease-out, height 0.2s ease-out !important;
    }
    .replayer-mouse::after { display: none !important }
    .replayer-mouse.active { animation: macos-click 0.2s ease-out 1 !important }
    @keyframes macos-click { 0% { transform: scale(1) } 40% { transform: scale(0.7) } 100% { transform: scale(1) } }
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
