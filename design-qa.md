# Design QA

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
