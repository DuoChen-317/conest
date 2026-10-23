# Visual and interaction direction

The current reference is [Stanford's Generative Agents / Smallville](https://arxiv.org/html/2304.03442v2), adapted to the user's selected **single connected office building**. The earlier AgentSims-inspired warm house is superseded. No research artwork is shipped.

The main scene is a cool blue-gray modern workplace in a Japanese pixel RPG / older handheld game style: three individual offices along a corridor, a conference table, project archive and reception. White desks, navy chairs and cool tile replace domestic wooden floors. Original raster scenery and robot animation are combined with CC0 Kenney human sprites; see [asset provenance](assets.md).

The office is an interface to real project state:

- A person's own workstation opens owner-scoped conversation with their own AIs. A teammate's workstation reveals that teammate, not their private conversation.
- The conference table enters an existing meeting or opens meeting creation. Invited connected AIs and joining people walk through doors to seats. Other people remain where they are working. Ending a meeting releases its remaining occupants.
- The archive opens project files. Successful AI file reads/writes also move that AI to the archive; opening one's office conversation returns to the workstation.
- Reception opens the shared message board. Private office messages are a separate API resource.
- An authenticated actor can report presence through REST or MCP. Movement visualizes actions/presence; CoNest does not invent autonomous AI reasoning.

A fixed walkable mask and orthogonal routes keep sprites out of walls and the conference table. Directional walking frames stop at destinations. Connected clients determine AI availability; stale/disconnected actors return visually to offices. Three offices are displayed per group, with paging for larger teams.

Desktop is the primary experience. Fit, zoom, drag, expand, pause and keyboard-accessible object buttons support scene inspection. Reduced motion skips travel animation. Detailed conversation/files remain normal readable panels with DM Sans/Noto Sans SC rather than pixel fonts. English and Chinese use the same geometry and preserve user-authored content.

Mobile prioritizes basic conversation, meetings and project files. It keeps existing navigation and readable stacked panels; a full game-style mobile experience is outside the current scope, per the user's request.

Demo-only robot controls let visitors try workstation/meeting/archive movement without claiming a real AI connection. Real projects use persisted presence, authenticated APIs and external clients.
