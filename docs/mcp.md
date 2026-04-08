# MCP Clients

> Installation examples for MCP clients

Expect supports all MCP clients that implement the stdio transport. Below are configuration examples for popular clients. If your client isn't listed, check its documentation for MCP server installation.

## Available Tools

The Expect MCP server provides eight tools for browser-based testing and validation:

| Tool                      | Description                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **open**                  | Navigate to a URL, launching a browser if needed. Supports headed mode, cookie syncing from local browsers, CDP connections, and cross-browser engines (Chromium, WebKit, Firefox). |
| **playwright**            | Execute Playwright code in the Node.js context with access to `page`, `context`, `browser`, and `ref()` globals. Use `return` to collect data. Supports `snapshotAfter` for automatic ARIA snapshots after DOM changes. |
| **screenshot**            | Capture the current page state. Modes: `screenshot` (PNG image), `snapshot` (ARIA accessibility tree with element refs), `annotated` (PNG with numbered labels on interactive elements). |
| **console_logs**          | Get browser console log messages. Filter by type (`error`, `warning`, `log`). Optionally clear after reading.                                 |
| **network_requests**      | Get captured HTTP requests with automatic issue detection — flags 4xx/5xx failures, duplicate requests, and mixed content.                     |
| **performance_metrics**   | Collect Core Web Vitals (FCP, LCP, CLS, INP), navigation timing (TTFB), Long Animation Frames (LoAF) with script attribution, and resource breakdown. |
| **accessibility_audit**   | Run a WCAG accessibility audit using axe-core + IBM Equal Access. Returns violations sorted by severity with CSS selectors and fix guidance.   |
| **close**                 | Close the browser and end the session. Flushes session video and screenshots to disk.                                                          |

---

## Claude Code

Run this command. See [Claude Code MCP docs](https://docs.anthropic.com/en/docs/claude-code/mcp) for more info.

```sh
claude mcp add --scope user expect -- npx -y expect-cli@latest mcp
```

---

## Cursor

Go to: `Settings` -> `Cursor Settings` -> `MCP` -> `Add new global MCP server`

Paste the following into your `~/.cursor/mcp.json` file, or create `.cursor/mcp.json` in your project folder. See [Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol) for more info.

```json
{
  "mcpServers": {
    "expect": {
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## VS Code

Add this to your VS Code MCP config file. See [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) for more info.

```json
"mcp": {
  "servers": {
    "expect": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## Windsurf

Add this to your Windsurf MCP config file. See [Windsurf MCP docs](https://docs.windsurf.com/windsurf/cascade/mcp) for more info.

```json
{
  "mcpServers": {
    "expect": {
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## Claude Desktop

Open Claude Desktop and navigate to `Settings` > `Developer` > `Edit Config`. Add the following to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "expect": {
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## Opencode

Add this to your Opencode configuration file. See [Opencode MCP docs](https://opencode.ai/docs/mcp-servers) for more info.

```json
"mcp": {
  "expect": {
    "type": "local",
    "command": ["npx", "-y", "expect-cli@latest", "mcp"],
    "enabled": true
  }
}
```

---

## OpenAI Codex

See [OpenAI Codex](https://github.com/openai/codex) for more information.

```toml
[mcp_servers.expect]
command = "npx"
args = ["-y", "expect-cli@latest", "mcp"]
startup_timeout_sec = 20
```

---

## Google Antigravity

Add this to your Antigravity MCP config file. See [Antigravity MCP docs](https://antigravity.google/docs/mcp) for more info.

```json
{
  "mcpServers": {
    "expect": {
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## Roo Code

Add this to your Roo Code MCP configuration file. See [Roo Code MCP docs](https://docs.roocode.com/features/mcp/using-mcp-in-roo) for more info.

```json
{
  "mcpServers": {
    "expect": {
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## Kilo Code

Create `.kilocode/mcp.json`:

```json
{
  "mcpServers": {
    "expect": {
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"],
      "alwaysAllow": [],
      "disabled": false
    }
  }
}
```

---

## Cline

1. Open **Cline**.
2. Click the hamburger menu to enter the **MCP Servers** section.
3. Choose **Installed** tab.
4. Click **Edit Configuration**.
5. Add expect to `mcpServers`:

```json
{
  "mcpServers": {
    "expect": {
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## Copilot Coding Agent

Add the following configuration to Repository -> Settings -> Copilot -> Coding agent -> MCP configuration:

```json
{
  "mcpServers": {
    "expect": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

See the [official GitHub documentation](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/agents/copilot-coding-agent/extending-copilot-coding-agent-with-mcp) for more info.

---

## Copilot CLI

Open `~/.copilot/mcp-config.json` and add:

```json
{
  "mcpServers": {
    "expect": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## Gemini CLI

See [Gemini CLI Configuration](https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html) for details.

Open `~/.gemini/settings.json` and add:

```json
{
  "mcpServers": {
    "expect": {
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## Trae

Use the **Add manually** feature and fill in the JSON configuration. See [Trae documentation](https://docs.trae.ai/ide/model-context-protocol?_lang=en) for more details.

```json
{
  "mcpServers": {
    "expect": {
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## JetBrains AI Assistant

See [JetBrains AI Assistant Documentation](https://www.jetbrains.com/help/ai-assistant/configure-an-mcp-server.html) for details.

1. Go to `Settings` -> `Tools` -> `AI Assistant` -> `Model Context Protocol (MCP)`
2. Click `+ Add`.
3. Click on `Command` in the top-left corner and select the **As JSON** option.
4. Add this configuration:

```json
{
  "mcpServers": {
    "expect": {
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

5. Click `Apply` to save.

---

## Qwen Code

See [Qwen Code MCP Configuration](https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/) for details.

#### Using CLI

```sh
qwen mcp add expect -- npx -y expect-cli@latest mcp
```

#### Manual Configuration

Open `~/.qwen/settings.json` and add:

```json
{
  "mcpServers": {
    "expect": {
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## Amp

Run this command in your terminal. See [Amp MCP docs](https://ampcode.com/manual#mcp) for more info.

```sh
amp mcp add expect -- npx -y expect-cli@latest mcp
```

---

## Visual Studio 2022

See [Visual Studio MCP Servers documentation](https://learn.microsoft.com/visualstudio/ide/mcp-servers?view=vs-2022) for details.

```json
{
  "inputs": [],
  "servers": {
    "expect": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## Qodo Gen

See [Qodo Gen docs](https://docs.qodo.ai/qodo-documentation/qodo-gen/qodo-gen-chat/agentic-mode/agentic-tools-mcps) for details.

1. Open Qodo Gen chat panel in VSCode or IntelliJ.
2. Click **Connect more tools**.
3. Click **+ Add new MCP**.
4. Add the configuration:

```json
{
  "mcpServers": {
    "expect": {
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## Factory

See [Factory MCP docs](https://docs.factory.ai/cli/configuration/mcp) for more info.

```sh
droid mcp add expect -- npx -y expect-cli@latest mcp
```

---

## Crush

Add this to your Crush configuration file. See [Crush MCP docs](https://github.com/charmbracelet/crush#mcps) for more info.

```json
{
  "$schema": "https://charm.land/crush.json",
  "mcp": {
    "expect": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```

---

## Rovo Dev CLI

Edit your Rovo Dev CLI MCP config:

```bash
acli rovodev mcp
```

```json
{
  "mcpServers": {
    "expect": {
      "command": "npx",
      "args": ["-y", "expect-cli@latest", "mcp"]
    }
  }
}
```
