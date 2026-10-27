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

## Updating an existing installation

Keep the existing project directory, Compose project name, environment/override files and persistent data location. Back up SQLite using the method above before applying a version with database changes.

For the included Docker Compose deployment, run in the same directory used to start it:

```sh
git pull --ff-only origin main
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:4173/api/health
```

Use the configured host port if it differs from 4173. Rebuilding replaces the application container while retaining the existing `conest-data` volume. Do not delete that volume. The licensed runtime artwork remains in the existing data directory/volume; Git updates do not include purchased artwork.

For a direct Node.js installation, run `git pull --ff-only origin main`, `npm ci` and `npm run build`, then restart the existing systemd/PM2 service using its current service name and environment. If it runs in the foreground, stop that process and run `npm start` with the same `DATA_DIR`, port and other environment variables. Starting a second process does not replace the old one.
