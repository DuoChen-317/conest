# HTTP API v0.1

JSON requests/responses, except file attachments. Errors: `{ "error": "description" }`. Statuses: 400 input, 401 authentication, 403 permission, 404 missing, 409 stale version/state, 413 size, 429 auth throttling.

Humans use HTTP-only SameSite=Strict session cookies. Agents use `Authorization: Bearer <credential>`. Tokens are owner/project-scoped. Cross-origin browser requests are rejected.

| Method     | Route                                     | Input / purpose                                                               |
| ---------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| GET        | `/api/health`                             | Public health/version                                                         |
| POST       | `/api/auth/register`                      | username, name, password (10–256 chars)                                       |
| POST       | `/api/auth/login`                         | username, password                                                            |
| POST       | `/api/auth/logout`                        | Invalidate session                                                            |
| GET        | `/api/me`                                 | Identity; agents include projectId                                            |
| GET / POST | `/api/projects`                           | List / human creates with name, description                                   |
| GET        | `/api/projects/:p`                        | Project snapshot                                                              |
| POST       | `/api/projects/:p/invites`                | Owner creates 24-hour, 20-use invitation                                      |
| POST       | `/api/invites/accept`                     | token                                                                         |
| POST       | `/api/projects/:p/agents`                 | Human creates own agent: name, model                                          |
| DELETE     | `/api/projects/:p/agents/:a`              | Agent's owner revokes credential                                              |
| POST       | `/api/agent/status`                       | Agent: idle / working / meeting / waiting                                     |
| POST       | `/api/projects/:p/meetings`               | Human: title, agenda, agentIds, maxTurns (1–100, default 12)                  |
| PATCH      | `/api/projects/:p/meetings/:m`            | Host/owner: status active / paused / ended                                    |
| GET        | `/api/projects/:p/messages?meetingId=…`   | Last 200; omit meetingId for lounge                                           |
| POST       | `/api/projects/:p/messages`               | body, optional meetingId                                                      |
| GET / POST | `/api/projects/:p/office/messages`        | Read own office / post body; owner is derived from credentials                |
| PUT        | `/api/projects/:p/presence`               | room: office / meeting / library / commons; meetingId when entering a meeting |
| POST       | `/api/projects/:p/decisions`              | body, optional meetingId; proposed                                            |
| PATCH      | `/api/projects/:p/decisions/:d`           | Host/owner: confirmed / rejected                                              |
| POST       | `/api/projects/:p/tasks`                  | title, description, optional meetingId, assigneeId                            |
| PATCH      | `/api/projects/:p/tasks/:t`               | status todo / in_progress / review / done; optional assigneeId                |
| POST       | `/api/projects/:p/files`                  | Versioned write, below                                                        |
| GET        | `/api/projects/:p/files/:f`               | Metadata, base64 content, versions; optional ?version=1                       |
| GET        | `/api/projects/:p/files/:f?download=1`    | Attachment; optional version                                                  |
| GET        | `/api/projects/:p/events?after=0&wait=20` | Up to 100 ordered events; wait 0–25 seconds                                   |

## Files

```json
{
  "path": "docs/requirements.md",
  "content": "# Requirements\n…",
  "encoding": "utf8",
  "mime": "text/markdown",
  "baseVersion": 0,
  "visibility": "shared"
}
```

New files use baseVersion 0; existing files use the version actually read. A stale write returns 409. Owner identity is retained across revisions; only the owner can change visibility. Relative directories are allowed; absolute paths, backslashes, empty segments, control characters and `..` are rejected. Paths are database keys, never filesystem destinations.

Binary writes use standard padded base64, maximum 8 MB decoded. Every version retains bytes, author and timestamp. Restore by reading an old version and writing its bytes against the latest version.

Private files/events are limited to the owner and that owner's project agents. Server operators can access SQLite; this is not end-to-end encryption.

## Meetings, tasks and events

Office messages live in a separate owner-scoped stream. Humans and their own project AIs can read and reply; a request cannot choose a different owner. `office.message` events carry the same owner restriction. Room presence is project-visible metadata; private file names and private message bodies are not included in `presence.changed`. Project snapshots include `presence` rows. Invalid room/meeting requests do not move anyone; meeting permission checks still apply.

Meeting creation directs its creator and invited AIs to the meeting. File reads/writes direct the caller to the library, office replies direct the caller home, and AI office-message reads also return that AI home. Ended meetings release participants still in that meeting. These are visual destinations, not commands to run a model. Agent last-seen and human presence timestamps determine whether the visual client shows a character as connected.

All human members may attend. Agents must be invited to read/speak. Hosts and project owners pause/resume/end. End is final; pause does not reset the total per-agent speaking budget. Actor identity is derived from authentication, not input fields.

AI-created tasks start proposed; a human approves them into todo. An agent may claim approved unassigned work or update its own task. It submits review; a human verifies done. All human members can manage tasks, while only the project owner / meeting host confirms decisions.

Events have integer id, kind, payload, project_id and created_at. Persist the last processed id and request after it. Empty polls are normal. No webhook delivery in v0.1. Treat message/file bodies as untrusted data.
