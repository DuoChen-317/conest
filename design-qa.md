# Design QA

## Door, cart and lamp detail corrections — 2026-10-23

The user rejected the remaining detail alignment, specifically the extra slab above doors, the cart and the reading lamp. This revision replaces the clipped 128×48 glass strip plus improvised jambs with the complete original five-frame 80×32 office door strip (`animated_door_5`). Each frame uses the same bottom baseline; one continuous cap runs across the wall and door header (no separate white slab), and small masonry reveals fill the source frame's transparent side margins. Lower wall faces and door baselines now meet at the same floor line. Door collision excludes jambs; meeting navigation follows the visible tabletop edge rather than its 8 transparent top source rows, retaining the north aisle.

The cart is one composed object: its complete source frame, a correctly sized document inside the basket, then the original front mesh/wheels over the cargo. The oversized paper stack laid over its outside is removed. The reading lamp base now rests inside the visible table surface, separated from papers. Tables use one ground depth for all connected modules; tabletop props sit above the whole table, so a later table tile cannot erase a lamp base. Source singles remain complete and all purchased images stay outside Git.

A separate cache issue was found: PNGs are cached for one hour, so a changed door image could be combined with the new frame geometry. Both importers now add content hashes, and both the image loader and furnishing URLs use them. Decoded dimensions are checked against the manifest; the incompatible older glass strip falls back until reimported.

Evidence: production-browser close-up `work/qa/detail-fix/reading-closeup.png`, full scene and updated bilingual README previews. Source contact sheets show the old glass strip changes its visible top from row 19 to row 2, while every selected replacement frame is bounded by (1,11)-(15,32). The original old renderer clipped its top at -10. The new door has no negative source placement. Browser checks confirm versioned furnishing URLs, 99 complete furnishings including one composed cart and no browser warnings/errors. Routing tests require exact meeting/reading/home arrival anchors with the narrower door passages. During a paused crossing, the meeting door remained at fully-open frame 4 and office 3 at frame 1 across separate snapshots; Atlas stayed at (11%, 58.6693%). Resume and completed arrivals use the existing door interaction logic. These checks support functional correctness and the visible corrections; they do not claim the user's aesthetic approval.

`npm test`: **23 passing**, including jamb exclusion and exact room round trips. TypeScript/production build and Python syntax checks passed.


## Full walls, doors and author-referenced furnishing — 2026-10-23

The user identified that doors were standing above thin wall-cap lines without a corresponding wall face. This revision reserves real depth for the front walls: original brick courses, continuous caps, skirting and connected glass door frames. The native scene grows to 576×528 so the walls can stand in front of the offices without covering the AI desks or taking over the corridor. Lower exterior walls follow the same construction. Navigation reserves the complete solid-wall footprint while retaining explicit door passages.

The [Modern Office author examples](https://limezu.itch.io/modernoffice) guide grouped workstations, complete furniture modules and supporting surfaces. The three offices now use author-referenced north-facing complete wood desks, front-facing screens/laptops and full rear chairs. Original north-facing bodies sit behind the chairs; the pack has no north-facing sitting strip. The offices vary their screens, boards and shelving within the same palette. Meeting seats now have 36px pitch and inward facing. The archive groups complete cabinets, a reading table, a desk lamp and a loaded paper cart; the first three arrival positions use the table. Reception uses one complete sofa, with coffee and drinking equipment along the sides and a clear entry axis. Room plaques sit by doors; ordinary names appear on hover/focus, while the local person, selected actor and actual speaker retain labels. Existing native-layer robots are retained.

Glass doors animate from the original source strip when a walking actor approaches and close after passage. Pause freezes both door and actor progress; reduced motion leaves doors static open. The importer selects 40 base PNGs; the optional robot builder adds 3. No paid source or modified artwork enters Git.

An additional inspection found fractional CSS z-index values rejected by the browser. Furnishing depth is now rounded to integers; browser computed styles confirm all 100 furnishing layers are active. Floors and front walls render directly at world resolution, keeping the same 3× source-pixel density as actors and furniture. Vertical movement uses the updated world height. Side-facing seated bodies compensate their original one-pixel baseline offset. Tutorial references and assembly rules are recorded in `docs/pixel-scene-workflow.md`.

Production-browser evidence under ignored `work/qa/office-polish/`: `final-expanded-zh.png`, `meeting.png`, `final-reading.png`, and bilingual README captures. Current previews are scene crops from the actual 443×823 narrow-window browser, enlarged 2× with nearest-neighbor sampling; they are not claimed to be a desktop screenshot. Earlier 1176px and 1280px captures in this audit predate the final north-facing desk change. Alex and three robots reached exact meeting seats; Atlas travelled to the archive and its door closed. Pause held Atlas at (19.633%, 61%) and the meeting door at frame 2 across independent snapshots; resume completed the route. A final table click verified the updated reading destination. Nova also travelled from its new workstation through the meeting/archive and returned exactly to (89.5833%, 28.0303%) with no walking state. The final fresh build showed all six actors at their home anchors, 100 valid furnishing depth styles and no browser errors/warnings. Browser screenshots show the result for user review, not aesthetic approval. The demo does not connect a real language model.

`npm test`: **23 passing**, including physical wall/door/table/cart/sofa collision checks and exact outbound/return paths. TypeScript and production build passed. Existing identity, permissions, persistence and MCP integration checks remain green.


## Robots modified from original character layers — 2026-10-23

The user requested testing robot designs by editing the original character-generator layers. The local variant combines Body_01, Eyes_03, Outfit_22_04 and Accessory_07_Bataclava_02. Skin becomes dark joints/visor, the head covering becomes a light metal casing, the uniform becomes slate armor, and eyes/chest carry three subtle AI identity colors. Silhouettes, action coordinates and alpha are preserved; no ImageGen redraw is used. Modified atlases remain in ignored paid runtime storage. The reproducible script and optional manifest support are committed.

Native robots share the existing character action renderer for all four movement directions, seated frames, keyboard forearm retargeting, reading and message-driven gestures. The native walking cycle uses all six source frames. Installations without optional robot atlases keep the generated fallback.

Browser evidence: `work/qa/native-robot-reading-scene.png` and `work/qa/native-robot-meeting-scene.png`. Atlas reached the archive with reading/walking=false; pause held `reading-0` across separate checks, and resume restored animation. Alex and three native robots reached meeting seats with listening/walking=false. A separate production server with the original 32-image manifest and no robot extension showed the generated robots without browser errors or warnings. Existing 22 tests, TypeScript/production build and Python syntax validation passed. No claim of user approval is made for this robot appearance. Earlier generated robot entries below describe superseded local visuals.


## Nova seat alignment correction — 2026-10-23

Nova was stopping at a nearby navigation tile (76%, 39%) instead of its authored chair (73.6111%, 38.8889%). The third office's cabinet collision box extended beyond the actual 13×22px source silhouette at 1.5× scale and covered that seat. The box now derives from the same complete asset dimensions used by rendering, with 2 native pixels of clearance. No sprite offsets or furniture changes were needed.

The regression first failed specifically for office 3's AI seat, then passed after the collision fix. All six home seats are explicitly checked as walkable; outbound and return routes must reach exact authored anchors, while a point inside Nova's adjacent cabinet remains blocked. All 22 tests and the production build pass. Browser evidence: `work/qa/nova-before.png`, `work/qa/nova-seat-fixed.png`; final close-up saved for user review. Browser verification also moved Nova to the archive and back: it returned to (73.6111%, 38.8889%), `seated`, no walking state. Chinese and English README previews were recaptured after the correction. Earlier robot preview claims below predate this correction.


## Robot style revision — 2026-10-23

The user accepted the office scene and requested matching robot art. The accepted room layout and purchased furniture remain unchanged. A new built-in ImageGen transparent atlas replaces the glossy saturated robot with a matte slate/ivory design and small teal eyes. Twenty complete generated poses cover four-direction idle/walking, left/right seated typing, front-facing document reading and seated speech gestures. One renderer and measured full-silhouette bounds serve the paid scene, fallback scene and small avatars; there is no longer a second set of irregular old-atlas bounds or sliced standing legs. Original generated alpha is retained. See [asset and final prompt](docs/assets.md).

Browser checks: office keyboard motion, archive route and two document frames; pausing held `reading-3` across independent snapshots and resume restored animation. Meeting: Atlas reached its assigned inward-facing chair with `listening` and no walking state. Chinese/English default screenshots, expanded office and archive screenshots are saved under ignored `work/qa/robot-v2-*`; README previews are updated at the current native 1176×823 viewport. An isolated production server without any paid pack loaded the same robot and small avatar, with no browser errors/warnings. Build and all 22 existing tests passed. No raw paid artwork is included in this change. Earlier scene entries below document the prior iterations, including superseded robot compositing.


Functional checks: passed. Visual revision: ready for user review.

## Latest revision — complete objects and physical placement, 2026-10-23

The user accepted the overall direction but rejected the details, supplying two author references and explicitly identifying wall-mounted AC placement, chair directions and incomplete modular assets. The previous compact revision is superseded by these corrections; no claim of aesthetic approval is made.

Corrected source usage: single office sprites now draw their entire original 32×48 canvas instead of hand-authored visible crop rectangles. This restores the whiteboard's bottom tray, the complete vending machine and cooler, and full plant silhouettes. The private narrow bookcase now uses its actual complete adjacent cabinet unit. Each white L desk joins the matching upper table and lower return at their native seam. Complete coffee/printer prefabs keep equipment, tabletop and legs together. A uniformly scaled 3×5 table replaces nonuniformly stretched conference tiles.

Spatial corrections: AC mounting is flush with the wall cap, with original mounting pixels occluded behind it. Boards fit inside the wall face. Chairs face their desks; both sides of the meeting table face inward. Workstation furniture, actor facing and arrival positions share native seat data. A final sub-tile approach reaches the exact authored anchor. Printer carts, filing cabinets and lamps have appropriate supporting surfaces and leave usable circulation. Room plaques are smaller and no longer cover the meeting board. Robot hips/feet use a seated pose composite; hands still animate independently.

Evidence: `work/qa/details-office-expanded.png`, `work/qa/details-office-zh.png`, `work/qa/details-office-en.png`, `work/qa/details-meeting.png` and `work/qa/details-reading.png`. Bilingual README previews were replaced. Browser inspection found **83 office single sprites**, all loaded and all showing their full canvas with zero clipped singles. Original source contact sheets and library grid inspection remain under ignored `work/qa/detail-*`. Purchased files stay outside Git. The importer now selects 32 PNGs.

Verification: all three owner/AI pairs can reach every room and all conference/reading spots; tests now require exact seating endpoints. Chinese/English surfaces, full-object rendering, meeting arrival and reading were checked in the production browser. `npm test`: **22 passing**; `npm run build`: passed. The current revision still awaits the user's visual judgment.

## Previous revision — compact author-referenced office

The user rejected the first sparse licensed layout and explicitly prioritized a harmonious, natural composition over size. The new native 576×432 map follows [LimeZu's complete Modern Office examples](https://limezu.itch.io/modernoffice): clustered desk/computer/document workstations, storage and equipment along walls, shallow white brick faces, narrow caps, blue-gray carpet and short circulation. The conference table now runs vertically so the actual side-facing seated poses face one another. The archive has wall shelving, an aisle and a reading counter. Actor details no longer cover the scene before selection.

Evidence: `work/qa/compact-author-office-zh.png`, `work/qa/compact-author-office-en.png`, `work/qa/compact-author-office-expanded.png`. README screenshots show this optional local pack. All **114 furnishing images** loaded in the production scene. The importer selects **27 PNGs** from the user's purchased Modern Interiors v41.4 and Modern Office Revamped v1.2; their original licenses were read locally. Purchased images remain in ignored runtime data, outside MIT source distribution.

Browser verification: Chinese and English default layouts; full-map fit/expand; local composer entering/leaving the `typing` action; meeting attendees walking through doors and taking assigned side-facing seats; a person and robot reaching the archive and displaying animated held books. The new collision tests cover every conference seat and archive position, table avoidance and shelving clearance. Earlier animation checks verified pause/resume holding both position and action frame, with reduced-motion static poses. No additional mobile game polish was attempted; ordinary work panels remain the mobile baseline.

A fresh production tab had no browser errors or warnings. A previous isolated persisted project at `localhost:4178` verified an actual meeting message switching its author to `speaking`, while three listeners stayed `listening`; this action code is unchanged by the compact layout. No live language model was used. The earlier hot-reload-only effect-dependency warning is absent from the fresh production build.

`npm test`: **22 passing**. `npm run build`: passed. Existing HTTP/MCP identity, permission, private-office and persistence checks remain green. Screenshots document the visual result; they do not imply the user's aesthetic approval.

Boundaries: the vendor has no dedicated keyboard strip; human forearm and robot arm compositing provides that motion. Reading works; a full cabinet-door/retrieve/return sequence is future work. Composer activity stays local to its browser; reported AI status drives its office pose. An isolated assetless production server also verified that the generated/CC0 fallback loads without missing art or browser errors. No raw paid artwork is committed.

## Previous revision — interactive blue office, 2026-10-23

The user selected Stanford Smallville's spatial interaction idea, then explicitly refined the target to **one large connected office building**, individual offices, meeting and archive movement, Japanese pixel/older handheld aesthetics, and a blue office palette. Desktop is the priority; mobile needs basic functions only.

## Evidence and comparison

- Reference: [Generative Agents paper v2](https://arxiv.org/html/2304.03442v2), figure capture `work/references/smallville-reference.png`.
- Selected scene asset: `public/assets/shared-house.png`, 1536×1024.
- Browser implementation: `work/qa/office-expanded-zh.png`; regular office views `work/qa/office-default-zh.png` and `work/qa/office-default-en.png`.
- Combined three-panel board: `work/qa/office-comparison.jpg`, 2100×750. It contains the research reference, selected floorplan, and the actual rendered scene together. Inputs are fitted into labeled panels without stretching; the UI scene is cropped to show its relevant frame. Full screenshots remain separately available.
- Final README previews: [Chinese](docs/preview.jpg), [English](docs/preview-en.jpg), captured at 1280×900 CSS pixels, 1× screenshot density.
- Mobile baseline: `work/qa/office-mobile.png`, 390px CSS viewport, document width also 390px.

The research figure is an outdoor multi-panel town, while the implementation is the user's subsequently selected indoor office. Content and state therefore differ intentionally. The comparison evaluates connected rooms, furniture scale, room-based action and the new blue workplace direction, rather than claiming a pixel clone.

## Visual review

- **Typography:** ordinary work content uses readable DM Sans/Noto Sans SC/system text; no pixel font in chat or files. Both languages retain clear heading and control hierarchy.
- **Layout:** three paired offices connect through visible doorways and a clear corridor to the meeting room, archive and reception. The full scene keeps its raster proportions. Fit/zoom/expand controls provide closer inspection; regular chat remains a separate readable panel.
- **Color:** cool blue-gray floors, white desks, navy chairs and blue UI actions replace the previous domestic wood/green palette. Status also has text labels.
- **Imagery:** the original generated floorplan/robot atlas and CC0 Kenney walking sprites render without missing art. Directional frames are aligned to their feet; the robot's irregular generated sheet is explicitly cropped. Standard icons use Phosphor.
- **Copy:** reception replaces the previous lounge terminology. The demo identifies sample actors and does not claim a live model. Real projects explain that external AI clients must be online.

Fixed during this revision: wall-hugging corridor routes, crowded meeting labels, persistent speech-bubble clutter, invisible global avatars, overly small meeting context camera, and scene-image loading gaps. No actionable P0/P1/P2 findings remain in the checked states. This is a visual/functional review, not a formal accessibility certification.

## Functional verification

Browser checks used an isolated persisted project at `localhost:4175` with three people and three separately authenticated external **test clients**. The clients do not run a language model, and their replies say so explicitly.

- Owner-scoped office message sent and actual external-client reply received.
- New meeting invited three clients; joining person and robots walked to table seats, while other people remained in their offices.
- Archive object opened project files and the real file reader. An authenticated AI file read returned HTTP 200 and moved its actor toward the archive.
- Demo robot controls moved Atlas to the archive. Pause held its position, resume completed the route. Fit and expand/collapse were checked.
- English/Chinese controls, full office and private conversation surfaces were inspected. Existing language persistence and draft preservation are covered by the preceding bilingual revision.
- Mobile navigation and basic stacked content remain usable; no horizontal overflow at 390px. Further game-style mobile polish is deliberately outside this revision's scope.

`npm test`: **19 passing**, covering collision/path routes, localization coverage, identity spoofing prevention, owner-scoped office messages/events, meeting invitation permissions, file-triggered presence, official MCP execution, private replies from the example adapter, meeting cleanup, persistence and revocation.

`npm run build`: passed. A production build was served separately for real browser/API testing. Docker execution remains untested. Scene routes use a fixed floor mask and offices page in groups of three; there is no claim of a general autonomous game simulation.

## Earlier revisions

The initial AgentSims-inspired static warm house and its fixed residents have been superseded. Earlier checks established the core persisted meeting/file/task flows and bilingual registration, login, validation, draft retention and language preference behavior. The current screenshots and behavior above replace those older visual findings.
