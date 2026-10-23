# Asset provenance

## Optional purchased runtime pack

The local licensed scene uses purchased LimeZu Modern Interiors v41.4 and Modern Office Revamped v1.2. Our code/importer is committed; their images stay in ignored `data/scene-assets` and are served at runtime. The scene footer credits LimeZu. See [import instructions, action coverage and license boundaries](licensed-assets.md). The generated/CC0 art below remains the distributable fallback.

## Included office assets

- `public/assets/shared-house.png` — 1536×1024, original ImageGen floorplan, revised on 2026-10-23 into a cool blue-gray workplace. Three private offices, connected corridor, conference room, archive and reception. No people or text baked into the floorplan.
- `public/assets/robot-walk.png` — 1448×1086 RGBA, original ImageGen directional robot atlas. Four directions × three walk poses. The generator did not follow the requested 1024×768 dimensions or equal baselines; `SceneSprite` explicitly crops and aligns each actual frame. This is the retained first generation, not the rejected subsequent edit.
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

## Retained robot generation prompt

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
