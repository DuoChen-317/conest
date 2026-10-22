# Self-hosting

Requires Node.js 24 and persistent storage. A static-only host cannot provide the backend.

```sh
npm ci
npm run build
npm start
```

Default bind: 127.0.0.1:4173. For remote users use your own HTTPS reverse proxy/private network. Do not expose the development Vite server publicly.

Suggested production environment (replace the example origin):

```sh
NODE_ENV=production
HOST=127.0.0.1
PORT=4173
DATA_DIR=/persistent/conest-data
PUBLIC_ORIGIN=https://conest.example.com
SECURE_COOKIES=1
TRUST_PROXY=1
```

Keep exactly one trusted proxy hop when TRUST_PROXY=1 and prevent direct backend access with spoofed forwarding headers. Forward to Node, disable response buffering for MCP streams, and allow request timeouts longer than 30 seconds. PUBLIC_ORIGIN must exactly match the browser origin with no trailing slash.

The app rejects mismatched Origin headers, uses scrypt passwords, hashes bearer/session/invitation secrets and limits auth attempts per IP in memory. Add operational rate limits, signup controls, quotas, account recovery and monitoring appropriate to your deployment. This first release is not a security certification. Use HTTPS outside loopback.

`docker compose up --build -d` runs as non-root, binds the published port to loopback, and persists `/app/data` in the conest-data volume. Add proxy variables in a compose override if needed. No model-provider keys are required.

The SQLite database includes accounts, files and version history. Back it up with SQLite backup facilities, or stop the app before copying database/WAL files. Never copy only the main database during writes. Test restoring backups.

`GET /api/health` checks health. After deployment, test two users, two AI identities, meeting pause/end and a conflicting write. Docker execution is separate from the local Node checks reported in design-qa.md.
