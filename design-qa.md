# Design QA

final result: passed

## Target and evidence

- Selected visual reference: https://github.com/py499372727/AgentSims/raw/main/cover.png
- Source capture: `work/qa/reference.jpg`, 1280 × 720.
- Implementation: `work/qa/desktop-final.jpg`, 1280 × 720; full browser-rendered preview: [docs/preview.jpg](docs/preview.jpg).
- Combined full-view comparison: `work/qa/comparison-final.jpg`, 2560 × 760 (two unscaled 1280 × 720 images plus labels).
- Focused before/after work panels: `work/qa/readability-final.jpg`, 1510 × 460. Both crops are from the same actual meeting with the same content at the same viewport.
- Mobile: `work/qa/mobile.jpg`, 390 × 1439; `work/qa/mobile-meeting.jpg`, 390 × 1302; final task-board capture: `work/qa/mobile-tasks-final.jpg`.
- CSS viewports: desktop 1280 × 720, mobile 390 × 844; screenshot density 1×, no image-density normalization required. Horizontal document width was 390px in office, meeting, file and task screens.
- State: full-view screenshots use the explicitly labeled demo space; interaction tests use a separately created local QA account and real persisted project. Research reference is a multi-screen composite, not an identical application/content state. Comparisons evaluate the agreed style and hierarchy, not pixel-level cloning.

Raw research/reference captures and QA scratch boards stay in ignored `work/`; only CoNest's own preview is shipped.

## Comparison history and findings

1. Initial full comparison confirmed the selected top-down rooms, furniture, selectable residents and contextual information surfaces. An intentional lighter work UI surrounds the original warm pixel map; the source's stacked research callouts are not copied.
2. **[P2, fixed] Small/pale working-panel metadata.** The initial actual meeting capture showed supporting text with too little visual weight. Meeting/file metadata was increased to 11px, task content to 12–13px, and supporting foregrounds darkened. `readability-final.jpg` shows the post-fix meeting against its original state; the 390px task board remains within viewport width.
3. No actionable P0/P1/P2 findings remain in the checked states.

## Required visual surfaces

- **Typography:** DM Sans/Noto Sans SC with system fallbacks; clear page/panel/content hierarchy, no pixel font for documents or discussions. Supporting work text was corrected as above. Small map legends are miniature spatial annotations with full-size navigation alternatives.
- **Layout/spacing:** desktop sidebar, project bar, primary map and secondary rail are aligned. The map uses its native 3:2 ratio. Mobile stacks panels and retains bottom navigation without horizontal page overflow. Meeting header, editor and version selector were inspected in actual use.
- **Color:** slate navigation, forest actions, pale surfaces and wood map preserve an intentional spatial/work separation. Status uses text plus color. Supporting work text was darkened; no claim of a formal WCAG audit is made.
- **Imagery:** original raster house and six-character alpha sheet render without missing assets or visible background halos. No game art is approximated with CSS/div/SVG drawings. Standard icons come from Phosphor.
- **Copy/content:** actions describe real behavior, agent ownership is explicit, disconnected clients are labeled, demo data is clearly disclosed. Summary requests explain the need for an online external client. Decision proposals are distinguished from confirmed results.

## Functional verification

Browser-tested: signup; create project; create meeting; send message; pause and resume (disabled composer while paused); propose and confirm decision; create meeting-linked task; create document; save v2; read v1; create agent credential and return to an unconnected-agent state. Mobile office/navigation, meeting, file list and task board were inspected. Browser application error/warning log: empty in the checked session.

`npm test`: 10 passing checks (suite plus nine integration scenarios), including two independent AI identities, permissions, private-file/event filtering, version conflict/history, meeting controls, human approvals, official MCP client tool execution, quiet local adapter and persistence/revocation/logout.

`npm run build`: passed. Production process was separately started on port 4175; health, HTML, built JavaScript and office-image delivery passed. Runtime dependency audit: 0 vulnerabilities reported. Docker files are provided but Docker execution was not tested.

## Follow-up polish

- [P3] Residents currently occupy selectable fixed positions. Free movement and pathfinding are documented future features.
- [P3] Wider screens could show richer meeting presence details alongside the map.

## Implementation checklist

- [x] Selected reference and rendered implementation opened and compared together.
- [x] Working-panel readability fixed and recaptured.
- [x] Core persisted flow tested in browser and API/MCP clients.
- [x] Desktop/mobile layouts checked; viewport reset after testing.
- [x] Preview, protocol boundaries and untested Docker execution documented honestly.

## Chinese / English follow-up — 2026-10-23

Both languages were checked in the welcome screen, workspace, meetings, files/editor, tasks, people/AI and connection guide. English text now wraps in narrow meeting controls and the mobile welcome headline retains its intended line breaks. The language selector is available before login and in the project header. Desktop was checked at 1280px; mobile welcome and workspace/meeting layouts were checked at 390px and 320px respectively. The 320px workspace had matching viewport/document widths, with no horizontal page overflow. Viewport overrides were reset after checking.

Browser checks confirmed language persistence after reload, immediate translation of a real failed-login response, and preservation of registration fields and unsent message drafts when switching. An isolated real project on port 4174 verified that user-written Chinese/English project details and messages stay unchanged in an English interface. Test data is in ignored `work/qa/i18n-runtime`, separate from normal runtime data. No model was needed.

`npm test`: 15 passing checks, including localization preference fallback, literal interpolation, translation coverage/placeholder parity, localized demo seeds and API errors, plus the existing HTTP/MCP integration scenarios. The validation response now includes an additive `VALIDATION_ERROR` code so the UI can translate it without parsing Zod's English messages. `npm run build`: passed.

The README has linked English and Simplified Chinese editions, each with a corresponding current screenshot: `docs/preview-en.jpg` and `docs/preview.jpg`. Other technical documents remain in English and are labeled accordingly in the Chinese README.
