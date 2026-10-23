# Design QA

final result: passed

## Current revision — interactive blue office, 2026-10-23

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
