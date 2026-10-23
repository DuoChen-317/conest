# Optional licensed game assets

CoNest can use purchased **LimeZu Modern Interiors** and **Modern Office Revamped** as a local runtime pack. The repository includes only our importer, scene layout and animation code. The purchased PNGs, atlases and source archives are not part of the MIT source distribution.

## Import

Requires Python 3 (standard library only). With your own purchased archives:

```sh
python3 scripts/import-scene-assets.py \
  --interiors /path/to/moderninteriors-win.zip \
  --office /path/to/Modern_Office_Revamped_v1.2.zip
npm run dev
```

The importer selects 40 images used by the scene and writes them plus their original licenses into `data/scene-assets/`, which is ignored by Git. It never executes tools from either archive and does not extract arbitrary archive paths. `manifest.json` is written last. This supports the inspected Modern Interiors v41.4 and Modern Office Revamped v1.2 archive structures.

The server serves this runtime directory at `/scene-assets/`. The browser loads the manifest and images, then switches from the included scene to the licensed one. Reload after importing. Re-run the importer when updating an older pack: incomplete packs fall back to the included scene rather than showing desks or appliances with missing modules. No frontend rebuild is required for the art. For a custom output directory, pass `--output /path/to/art` and set `SCENE_ASSET_DIR=/path/to/art` when starting the server; otherwise assets live under `DATA_DIR/scene-assets` (default `data/scene-assets`). Include that runtime directory in your own deployment volume. Publishing or bundling the purchased source archives in GitHub/releases is not supported.

When no licensed pack is installed, or a required image fails to load, the included generated office and CC0 Kenney walking characters remain available. The seated/reading/hand animations described below require the optional pack.

## Robots built from original character layers

With the paid runtime pack imported, the optional robot builder uses the original Body_01, Eyes_03, Outfit_22_04 and Accessory_07_Bataclava_02 layers. It remaps skin to dark mechanical joints, the head covering to a light metal casing, clothing to slate armor and eyes/chest details to three restrained identity colors. Original silhouettes, alpha and action coordinates are preserved; the wider 927px body canvas is retained without trimming. This is a local modification of purchased art, not newly generated character artwork.

The builder requires Pillow in your Python environment (`python3 -m pip install Pillow` if needed):

```sh
python3 scripts/build-native-robots.py --interiors /path/to/moderninteriors-win.zip
```

Use `--output` to match a custom runtime directory. Run it again after reimporting the base pack. It adds three PNGs and an optional `robots` manifest list under ignored `data/scene-assets`; purchased source and modified atlases must remain outside public Git/releases. No external character-generator executable is needed. Reload the page after building. Installations without these optional robot atlases keep the included generated design.

## Implemented scene behavior

- A compact 576×528 native layout follows the author's scene composition: workstations and accessories form clusters, storage sits against walls, and the hallway takes only the space needed for circulation. A shared pixel scale keeps people, furniture and materials coherent.
- Floor tiles, walls, desks, computers, chairs, conference table and shelves are separate scene elements. Furniture depth and actor feet determine occlusion while walking.
- Office single sprites are rendered as complete original 32×48 PNGs, including transparent margins. Layout bounds only place them; they do not crop visible pixels. Office workstations use complete front-facing desks and rear chairs; cabinet selections use complete units from the atlas. Whiteboard trays, equipment sides and appliance bases remain intact.
- Human actors use the actual purchased idle, walk, seated and reading rows. The example layout uses three premade identities.
- Office desks face north, using front-facing monitors/laptops and complete back chairs. The pack has side-facing seated rows, so north workstations place the original north-facing body behind its chair, as in the author examples.
- An online person rests at their workstation. Typing in their office composer triggers a keyboard action. This draft signal stays in that browser; it is not a claim of monitoring their other applications.
- Online AI actors with reported `working`/`thinking` status use the keyboard at their office workstation. Unconnected actors remain inactive.
- People and native-layer robots reaching the archive use the same original book-reading animation. The generated fallback robot has separate document-reading frames.
- Meeting attendees use assigned seats with explicit facing. Furniture and arrival anchors share the same layout data, and the final approach reaches the exact seat rather than stopping on a nearby navigation tile. An actual new meeting message triggers a short speaking gesture; listeners remain seated. A message's author and timestamp drive this, not generated speech.
- The purchased pack has no dedicated typing strip. Our animation retargets the seated character's forearm pixels onto the keyboard, for both people and native-layer robots. Both use original seated body frames and share the same action renderer; only the forearm is retargeted. This is a composited keyboard motion, not an additional vendor-provided strip. The generated fallback robot keeps its own keyboard poses.
- Full-height brick front walls, continuous caps and skirting connect to glass door frames. Doors open for approaching actors and close after passage; collision masks reserve the complete wall footprint and its door passages.
- Ordinary nameplates appear on hover/focus; the local person, selected actor and actual speaker remain identified. Door-side room plaques leave equipment visible.
- Scene pause stops doors, locomotion and action animation. Reduced-motion preference disables motion; accessible buttons and ordinary work panels remain available.

The archive combines complete shelves, a reading table and a loaded paper cart; an elaborate cabinet-door/pick-up/put-back sequence is not implemented. The optional AI characters have metal casing, dark joints and visor-like faces derived from original layers, retaining distinct AI identities rather than using unmodified human avatars.

## Credits and licenses

- [LimeZu Modern Interiors](https://limezu.itch.io/moderninteriors), purchased full version: permits commercial/noncommercial project use and editing; requires credit and restricts redistribution of the assets.
- [LimeZu Modern Office](https://limezu.itch.io/modernoffice), purchased version: permits commercial/noncommercial project use and editing; restricts redistribution of the assets; the website requires credit (the archive says attribution is appreciated); CoNest provides visible credit.

The original license texts from your archives are copied with the runtime pack. A visible LimeZu attribution appears in the scene footer. These assets are governed by their own terms, not CoNest's MIT license. Screenshots show them used within CoNest; they are not downloadable art packs.

Assembly rules and tutorial references: [Pixel scene workflow / 像素场景拼装](pixel-scene-workflow.md).
