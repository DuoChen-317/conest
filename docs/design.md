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

## Licensed interaction revision

The locally imported LimeZu art uses real tiled floors, individually layered office furniture, and separate character action rows. This replaces the single raster background on installations with purchased packs. Own-composer typing, reported AI work state, archive presence and actual meeting message timestamps choose work/read/listen/speak actions. Forearm retargeting supplies the keyboard motion absent from the vendor atlas. The generated/CC0 scene remains the public-repository fallback. See [runtime assets](licensed-assets.md).

### Author-referenced composition

The first licensed-art layout was rejected for being sparse and boxy. The replacement follows LimeZu's [complete Office scenes](https://limezu.itch.io/modernoffice): compact rooms, desk/monitor/keyboard/document clusters, wall-mounted equipment, adjacent storage and plants, and a short circulation route. The native map is now 576×432; making the building larger is not a design goal. White brick, blue-gray carpet, pale corridor flooring, white desks and green plants form the palette. A vertical conference table matches the available side-facing seated poses. The archive retains an aisle and a reading counter. Actor details open on selection instead of permanently covering the scene.

Research also inspected [level-design](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/tree/main/skills/disciplines/level-design) for movement metrics and reachable layouts, and [pixel-art](https://github.com/ervareza/agent-skill-pixel-art) for grid/scale consistency. The existing purchased art remains the visual source; no third-party generation scripts were executed.

### Object integrity and placement

After source-image review, office single PNGs render whole; bounds anchor their visible silhouette without deleting pixels. Atlas selections use full cabinet units. L-shaped desks join the original upper and lower return modules at the native tile seam. AC units sit behind the wall cap, boards retain their trays, and devices sit on complete tables/carts. Native seat data controls furniture, avatar facing and exact arrival. The two sides of the conference table face inward. This replaces the earlier incomplete crop rectangles and approximate grid seating.
