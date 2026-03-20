const RRWEB_PLAYER_VERSION = "2.0.0-alpha.18";
const RRWEB_PLAYER_CSS = `https://cdn.jsdelivr.net/npm/rrweb-player@${RRWEB_PLAYER_VERSION}/dist/style.css`;
const RRWEB_PLAYER_JS = `https://cdn.jsdelivr.net/npm/rrweb-player@${RRWEB_PLAYER_VERSION}/dist/rrweb-player.js`;

type EventsSource = "sse" | { ndjsonPath: string };

interface ReplayViewerOptions {
  title: string;
  bodyHtml?: string;
  eventsSource?: EventsSource;
}

const buildLoadEventsScript = (source: EventsSource): string => {
  if (source === "sse") {
    return `
      const res = await fetch('/latest.json');
      if (res.ok) { allEvents = await res.json(); if (allEvents.length >= 2) initPlayer(allEvents); }
      const es = new EventSource('/events');
      es.onmessage = (msg) => { try { for (const e of JSON.parse(msg.data)) { allEvents.push(e); if (player) player.getReplayer().addEvent(e); } if (!player && allEvents.length >= 2) initPlayer(allEvents); } catch {} };
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
          events, width: 960, height: 540,
          autoPlay: ${isLive}, showController: ${!isLive}, ${isLive ? "liveMode: true," : ""}
        }});
        ${isLive ? "player.getReplayer().startLive();" : ""}
      };
      ${buildLoadEventsScript(source)}
    </script>`
      : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${options.title}</title>
  ${source !== undefined ? `<link rel="stylesheet" href="${RRWEB_PLAYER_CSS}" />` : ""}
  <style>
    :root { color-scheme: dark }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #0f172a; color: #e2e8f0 }
    h1, h2 { color: #f8fafc } a { color: #93c5fd }
    #replay-container { margin: 16px 0; border-radius: 8px; overflow: hidden }
    .status { text-align: center; padding: 16px; font-size: 14px; color: #9ca3af }
  </style>
</head>
<body>
  <main style="max-width:960px;margin:0 auto;padding:32px">
    ${options.bodyHtml ?? ""}
    ${replaySection}
  </main>
</body>
</html>`;
};
