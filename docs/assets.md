# Asset provenance

## Optional purchased runtime pack

The local licensed scene uses purchased LimeZu Modern Interiors v41.4 and Modern Office Revamped v1.2. Our code/importer is committed; their images stay in ignored `data/scene-assets` and are served at runtime. The scene footer credits LimeZu. See [import instructions, action coverage and license boundaries](licensed-assets.md). The generated/CC0 art below remains the distributable fallback.

## Included office assets

- `public/assets/shared-house.png` — 1536×1024, original ImageGen floorplan, revised on 2026-10-23 into a cool blue-gray workplace. Three private offices, connected corridor, conference room, archive and reception. No people or text baked into the floorplan.
- `public/assets/robot-office-v2.png` — 1122×1402 RGBA, generated with the built-in ImageGen tool on 2026-10-23. Current matte slate/gray robot, with four-direction idle/walking, dedicated seated keyboard poses, reading and seated speech gestures. The accepted office screenshot was a style reference; purchased sprites are not bundled in this sheet. The generator produced uneven gutters, so `src/robot-sprites.ts` measures complete silhouettes rather than assuming equal cells. One scale and a shared feet anchor keep the character consistent across actions. The same renderer serves both the licensed scene and assetless fallback.
- `public/assets/robot-walk.png` — 1448×1086 RGBA, legacy glossy robot atlas retained for provenance; no longer rendered.
- `public/assets/kenney/urban.png` — unchanged packed 16×16 tile atlas from [Kenney RPG Urban Pack](https://kenney.nl/assets/rpg-urban-pack), **CC0**. Human directional walking frames are selected from the atlas. The original license is included at `public/assets/kenney/LICENSE.txt`. No account, purchase or runtime asset service is required.

[Stanford's Generative Agents](https://arxiv.org/html/2304.03442v2) and [its repository](https://github.com/joonspk-research/generative_agents) informed the spatial interaction idea. Their artwork and code are not bundled. [LimeZu Modern Office](https://limezu.itch.io/modernoffice) provides the optional runtime art and the reference for compact furniture clusters, wall storage, material transitions and seated workstations. Its paid source assets are not redistributed. Kenney Roguelike Modern City was researched but is not shipped.

Generated output may not be exclusive. CoNest claims no ownership of third-party styles or research reference images. The legacy generated `office.png` and `residents.png` remain in the repository for historical provenance; the current scene uses the assets above.

## Final office edit prompt

```text
Use case: precise-object-edit / targeted materials and style revision.
Input image is EDIT TARGET. Edit this exact 1536x1024 top-down pixel floorplan into a BLUE-GRAY MODERN COLLABORATIVE OFFICE, retaining exact geometry. Do not redesign the layout.
INVARIANTS: preserve EXACT outer wall silhouette, all partition walls, door openings, corridor coordinates, floor boundaries, and each furniture footprint. Three top private offices with two workstations each, bottom-left meeting room with table and chairs, bottom-right archive with wall shelving, middle-bottom reception with open center aisle. Same strict top-down orthographic camera and building size, no perspective, no people, no text/UI. Keep all clear walking routes unobstructed and all doors open at identical pixel positions.
Only change materials, colors and equivalent office furnishing details:
- All warm wooden floors become PALE COOL BLUE-GRAY modern office carpet/tile. No woodgrain.
- Sage rugs become clean muted slate / desaturated cobalt-blue office carpets with simple modern edging.
- Brown desks become modern WHITE / LIGHT GRAY desks. Monitors stay. Chairs become navy-blue ergonomic office chairs.
- Warm beige/brown walls become cool white walls with muted blue-gray partition edges and occasional subtle blue glass accent INSIDE existing wall footprints.
- Meeting room: same table geometry in white/lightgray, blue office conference chairs, add a small dark presentation screen replacing existing left-side wall art, no domestic decorations. Table and wall display clearly recognizable.
- Library: replace warm bookcases with lightgray project archive cabinets/shelves containing orderly cool-blue/white file binders and boxes, same footprint. Retain side project-review desk with monitor/file.
- Center lounge becomes professional RECEPTION/LOBBY: same existing two sofa footprints replaced by two simple blue visitor bench seats; replace small domestic side furnishings with a compact copier and office noticeboard in same locations. Open center aisle exactly unchanged.
- Exterior garden/grass/trees become muted pale-blue architectural office paving, sparse restrained planters along outer edge only. Remove garden-household feeling, flowers and grass texture. Preserve exact building footprint and entry staircase.
STYLE: crisp friendly Japanese JRPG pixel art / older handheld 3DS-era game tile softness, small readable office details. Not photorealistic, not isometric, not chibi people. Modern blue-gray workplace, not home.
No beds, kitchen, kitchenware, household artwork, woodgrain, cozy cottage decor, decorative text, letters, numerals, logos, watermark, or extra furniture in walking routes. One targeted style/material edit, keep all geometry invariant.
```

## Current robot generation prompt

Mode: **built-in ImageGen**, transparent output, original generated alpha preserved. The first candidate remained too glossy and was rejected; this is the selected second prompt. No CLI/API fallback or programmatic art repainting was used. Source file is copied unchanged into `public/assets/robot-office-v2.png`; runtime canvas crops/positions complete frames with nearest-neighbor sampling. Robot documents are part of this generated sheet and do not require purchased book art.

```text
Use case: stylized-concept.
Asset type: transparent low-resolution sprite atlas for CoNest office game.
Input image is STYLE reference only: match its tiny muted pixel people and office furniture. Create a NEW ORIGINAL office helper robot design; do not draw the office. Robot should look at home beside those human characters.
Critical STYLE: authentic tiny 16-bit RPG sprite, approximately 16 pixels wide by 28 pixels tall, each logical pixel enlarged into a hard square. Extremely simple flat limited palette: dusty slate blue #697889, gray ivory #c6c8cb, dark desaturated outline #414457, tiny muted teal eyes #7eb2b3. Head is only 9x8 logical pixels, torso 9x9, legs 4x6 each. Human-like slender proportions, head less than one third total height, practical squat rectangular head with two small square eyes in dark screen, simple rectangular torso and jointed arms. No antenna, no round headphone ears, no glossy white, no saturated royal blue, no smile symbol, no glowing lights, no shiny highlights, no gradients, no airbrush, no antialias, no 3D, no detailed illustration, no text, no shadow. Flat clustered pixel shapes like the reference human sprites. Every frame must show same character and proportions.
Transparent canvas, 4 columns x 5 rows, 20 complete separate frames, evenly spaced generous gutters, no labels or gridlines. Each cell same size. All character feet on matching baseline.
Row 1: LEFT idle profile, FRONT/down idle, BACK/up idle, RIGHT idle profile.
Row 2: LEFT walk left foot forward, FRONT walk left foot forward, BACK walk left foot forward, RIGHT walk left foot forward.
Row 3: LEFT walk right foot forward, FRONT walk right foot forward, BACK walk right foot forward, RIGHT walk right foot forward.
Row 4: seated LEFT reaching both hands toward keyboard, seated RIGHT reaching both hands toward keyboard, same LEFT with hands slightly lowered, same RIGHT with hands slightly lowered. Knees bent and feet point toward desk, but do not draw chair, keyboard or desk.
Row 5: FRONT standing holding gray open paper folder, FRONT standing turning folder page, LEFT seated with one hand raised to talk, RIGHT seated with one hand raised to talk.
Design at a genuine very low pixel resolution, then enlarged nearest-neighbor. Strong consistent dark outlines and muted blue-gray surfaces. It must look like a tiny NPC sprite rather than a large robot illustration.
```

## Legacy robot generation prompt

```text
Use case: stylized-concept. Asset type: production WALKING SPRITE SHEET, genuine transparent PNG, exactly 1024 pixels wide × 768 pixels high.
Create ONE SAME friendly tiny blue-gray office helper ROBOT in TWELVE directional walking sprites. Low-color crisp 16-bit Japanese RPG pixel-art game sprite, flat blocky shading with dark navy pixel outlines; compact chibi proportions, square cyan display face, cobalt-blue/lightgray body, short chunky legs and small arms. White/blue/teal restrained palette. Not 3D, not glossy, no gradients.
CRITICAL GRID: exactly FOUR columns and THREE rows, twelve equal 256×256 cells. All cells aligned on a regular 256px grid, no visible grid lines. Cell centers at x128,384,640,896; y128,384,640. Every robot full-body vertically centered within its own cell, about 110px wide ×160px tall, feet baseline at local y220 (image y220,476,732). Ample empty transparent margins. Robot same body/head size and same identity in EVERY frame.
Columns are directional facings, in this order LEFT PROFILE, DOWN/FACING VIEWER FRONT, UP/FACING AWAY BACK, RIGHT PROFILE.
Rows are animation frames: ROW1 standing neutral with feet together; ROW2 walking with left foot forward and right arm forward; ROW3 walking with right foot forward and left arm forward. Actual 12 different pose/direction frames of SAME character. Left/right profiles have visible projection of robot face toward corresponding direction. Back view has no face; small panel on head back.
This is not a character lineup or 12 different robots. It is a literal grid atlas suitable for CSS sprite animation; do not vary scale, costume, head design or position across frames.
Background: truly transparent alpha, NOT white/black/checkerboard. No floor, cast shadows, glow, labels, letters, numbers, captions, borders, lines, grid, watermark. No sprite cutoffs. Pixel edges crisp. All opaque content restricted to the robot in each cell.
```

## UI assets

- [Phosphor Icons](https://github.com/phosphor-icons/react), MIT, installed library.
- [DM Sans](https://fonts.google.com/specimen/DM+Sans) and [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC), SIL Open Font License. Google Fonts when available, with system fallbacks.
