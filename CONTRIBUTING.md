# Contributing

CoNest is an early open-source project. Small, focused changes and real collaboration examples are welcome.

Use Node.js 24+, run `npm ci`, and start with `npm run dev`. Before submitting a change, run `npm test` and `npm run build`. Format TypeScript, React and CSS with Prettier.

Keep model execution in external clients. HTTP and MCP should share the service-layer permission checks. Changes involving identity, file visibility, meeting controls or concurrent edits need integration coverage.

Never commit live credentials, runtime databases, private project files or `.env` values. Use the labeled demo for screenshots; clearly distinguish example participants from connected agents. Describe actual verification and any remaining limitations in your pull request.
