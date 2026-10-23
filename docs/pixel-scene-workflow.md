# Pixel scene assembly / 像素场景拼装

CoNest uses the 16px LimeZu source set at 3 world pixels per source pixel. The map grid is 576×528 native / 1152×1056 world pixels. UI fit/zoom scales the whole scene together.

CoNest 使用 16px 原始素材，每个素材像素对应 3 个世界像素。拼装时固定这一比例；适应窗口和缩放只作用于完整场景。

## Assembly rules / 拼装规则

- Keep original singles complete, including transparent margins. Record visible bounds separately for placement. / 完整保留单件及透明边距，定位范围单独记录。
- Join matching desk/table modules into one structure before placing screens, keyboards and papers. / 先拼完整桌体，再摆显示器、键盘和纸张。
- Use feet or furniture bases as ground anchors. Side-facing seated rows end one source pixel above the standing baseline; compensate once in the renderer. North workstations use a real north-facing body behind a full rear chair. / 脚底和家具落地点作为锚点；侧向坐姿的底线差异由动作渲染器统一处理；朝上的工位采用原始背向人物与完整椅背遮挡。
- Depth values written to CSS must be integers. Verify computed styles, not only source expressions. / CSS 层级必须是整数，检查浏览器实际计算值。
- Render floors and walls at world resolution. Avoid an intermediate 1.5× raster, which creates alternating pixel widths before enlargement. / 地板墙体直接按世界分辨率绘制，避免先以 1.5 倍栅格化造成像素宽度不一致。
- Keep the complete door animation frame and common baseline; use the original frame instead of adding a second lintel. Compose cart cargo behind its front mesh. Place a lamp by its base on the visible tabletop, accounting for transparent atlas padding. / 门动画保留完整帧和共同底线，不叠加第二套门框；货物放在车篮前框后方，灯座按可见桌面定位，计入图集透明边距。
- Build wall caps, faces, corners, skirting and doorway openings together. Collision follows the solid footprint, not the image rectangle. / 墙顶、墙面、转角、踢脚线和门洞一起构建，碰撞范围按实体占地设置。
- Check home, travelling, seated, reading, speaking and paused states in both languages. / 检查回工位、移动、落座、阅读、发言、暂停及双语状态。

## Primary references / 参考

- [LimeZu Modern Office examples](https://limezu.itch.io/modernoffice): composition and complete furniture combinations.
- [Phaser official sprites-and-images skill](https://github.com/phaserjs/phaser/blob/master/skills/sprites-and-images/SKILL.md): image origin, frame selection, scale, flip and depth. This project keeps its React/canvas renderer; no Phaser dependency is added.
- [Phaser official tilemaps skill](https://github.com/phaserjs/phaser/blob/master/skills/tilemaps/SKILL.md): tile dimensions, margins, spacing and separate layers.
- [Tiled: Working with Objects](https://doc.mapeditor.org/en/stable/manual/objects/): explicit object alignment and complete tile objects.
- [Godot: Using TileMaps](https://docs.godotengine.org/en/stable/tutorials/2d/using_tilemaps.html): separate visual/collision layers and Y-sort origin.

These links are learning references. No third-party skill or tool is installed globally.
