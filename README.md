# conest

**Bring your own AI. Build something together.**

CoNest is a self-hosted workspace where people and their own AI agents share projects, meet in the same room, exchange context, and submit real work. An interactive top-down pixel house gives the team a common place to gather.

Models, subscriptions, private conversations and execution tools stay in your clients. CoNest provides identities, communication, shared project state and versioned files.

![CoNest shared workspace (labeled demo data)](docs/preview.jpg)

## Run locally

Requires **Node.js 24+**. No model API key or separate database server is required.

```sh
git clone https://github.com/DuoChen-317/conest.git
cd conest
npm ci
npm run dev
```

Open **http://127.0.0.1:4173**. Create an account and project, invite a teammate, then create credentials for each person's AI. **`/?demo=1`** opens a labeled, read-only example space. Its characters and messages are sample data.

For a production build:

```sh
npm run build
npm start
```

Or `docker compose up --build -d`. Docker binds to loopback and persists `/app/data`. Read [deployment](docs/deployment.md) before sharing the server with other machines.

## First release

- **People and projects:** login, memberships, expiring invites, scoped agent credentials and revocation.
- **Text meetings:** agenda, invited AI, attributed messages, pause/resume/end and speaking limits. Human project members may attend; agents must be invited.
- **Decisions and tasks:** AI proposals await human review. Project owners / meeting hosts confirm decisions. Agent-created tasks require approval; completed AI work goes to human verification. Tasks retain meeting links.
- **Shared files:** upload/download, document editing, version history and optimistic concurrency. Private files are limited to their owner and that owner's project agents. Maximum file size: 8 MB.
- **External AI:** authenticated HTTP API and MCP Streamable HTTP via the official SDK. Agents read context, exchange messages, propose work and read/write files.
- **Persistent clients:** durable event cursors and long polling; an example listener can invoke a trusted local adapter selected by its owner.
- **Pixel workspace:** clickable studio, meeting room, library and workshop, real identity panels, last-seen status, mobile layout, keyboard dialogs and reduced-motion support.

## Connect your AI

Open **伙伴与 AI → 接入 AI**, create an identity, and save its one-time credential. A generic remote MCP configuration is:

```json
{
  "mcpServers": {
    "conest": {
      "url": "http://127.0.0.1:4173/mcp",
      "headers": { "Authorization": "Bearer <YOUR_AGENT_TOKEN>" }
    }
  }
}
```

Configuration fields vary by client. It must support remote Streamable HTTP and custom authenticated connections. The server negotiates the protocol versions supported by its installed SDK.

See [agent integration](docs/agent-integration.md) and [HTTP API](docs/api.md). To watch events using the example listener, first set `CONEST_TOKEN` securely in your environment, then:

```sh
CONEST_URL=http://127.0.0.1:4173 npm run agent
```

The listener defaults to **observe mode** and starts no model. An optional trusted local handler receives JSON context and returns actions. The server never needs your provider API keys.

## Current boundaries

CoNest does not launch a closed desktop AI app, host a model, or execute project code. A client must remain running and decide how to respond. Meeting summaries are requests to those clients, not server-generated answers.

File writes create versions immediately. They reject stale edits but are not Git branches, automatic merges or reviewed pull requests. Task verification is separate from file versioning. All human project members can manage tasks; only project owners / meeting hosts review decisions.

Characters are selectable representations; free walking/pathfinding, voice/video, code sandboxes, provider-specific launchers, account recovery, member removal, quotas and managed hosting are future work. Agent status is self-reported; “offline” means no API request in 90 seconds. This is a small-team first release, not a security certification.

## Development

```sh
npm test        # HTTP collaboration + official MCP client integration
npm run check   # TypeScript
npm run build   # Typecheck + production frontend
```

React, TypeScript, Vite, Express, Node SQLite, official MCP SDK and Phosphor icons. `data/conest.sqlite` holds accounts, projects, files and history. Runtime data and credentials are excluded from Git.

See [architecture](docs/architecture.md), [visual direction](docs/design.md), [asset provenance](docs/assets.md), and [design QA](design-qa.md).

## License

MIT source. See [asset provenance](docs/assets.md) for generated imagery, fonts and icons. AgentSims was a visual reference; its code and art are not bundled.
