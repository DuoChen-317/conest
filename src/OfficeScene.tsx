import { useEffect, useMemo, useRef } from "react";
import { officeObjectBounds as source } from "./office-objects";
import type { SceneAssets } from "./scene-assets";
import { OfficeDoorController } from "./office-doors";
import {
  officeSeats,
  meetingSeats,
  officeScale as UNIT,
  officeClusters,
  officeCabinets,
  readingTable,
  conferenceTable,
  officeDoors,
  officeWallBands,
  officeWallCaps,
  officeDepth,
  type Seat,
} from "./office-layout";

type Prop = {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sx?: number;
  sy?: number;
  sw?: number;
  sh?: number;
  depth?: number;
  flip?: boolean;
  clipTop?: number;
};
// Bounds are layout anchors, never clipping rectangles: every office single is drawn in full.
const props: Prop[] = [];
function object(
  id: number,
  x: number,
  y: number,
  scale = UNIT,
  depth = 0,
  flip = false,
) {
  const [sx, sy, sw, sh] = source[id];
  props.push({
    file: `office-${id}.png`,
    x: x - (flip ? 32 - sx - sw : sx) * scale,
    y: y - sy * scale,
    w: 32 * scale,
    h: 48 * scale,
    depth: depth || y + sh * scale,
    flip,
  });
}
function chair(seat: Seat) {
  if (seat.facing === "up") {
    // Full rear chair covers the lower body; its contact point is below the actor's feet.
    object(102, seat.x - 12, seat.y - 18.5, UNIT, seat.y + 16);
  } else {
    object(
      seat.facing === "right" ? 104 : 103,
      seat.x - 9,
      seat.y - 34.5,
      UNIT,
      seat.y - 1,
    );
    // The sitter is in front of the backrest; only the near castors cover their feet.
    // Draw the complete chair behind them, then its original bottom rows in front.
    props.push({
      ...props[props.length - 1],
      depth: seat.y + 1,
      clipTop: 39 / 48,
    });
  }
}
function shelf(
  x: number,
  y: number,
  wide = false,
  metal = false,
  medium = false,
) {
  // The narrow cabinet is the complete neighboring single, not one cut-off column of the wide cabinet.
  props.push({
    file: "library.png",
    x,
    y,
    w: (wide ? 48 : medium ? 32 : 16) * UNIT,
    h: 48 * UNIT,
    sx: wide ? 0 : medium ? 64 : 48,
    sy: metal ? 256 : 208,
    sw: wide ? 48 : medium ? 32 : 16,
    sh: 48,
    depth: y + 48 * UNIT,
  });
}
function mountedAircon(x: number, capY: number) {
  object(165, x, capY + 3.5, UNIT, capY + 57);
}
function workstation(seat: Seat, display = 130, paper = 153) {
  const x = seat.x - 24,
    y = seat.y - 44;
  object(248, x, y);
  // Original front-facing monitor/laptop, not a rotated side-view sprite.
  object(display, x + 13, y - (display === 139 ? 4 : 9), UNIT, y + 29);
  if (display !== 139) object(124, x + 11, y + 19, UNIT, y + 29.5);
  object(
    paper,
    x + (paper === 154 ? 24 : 29),
    y + (paper === 154 ? 5 : 7),
    UNIT,
    y + 30,
  );
  object(242, x + 2, y + 12, UNIT, y + 30);
  chair(seat);
}
for (let i = 0; i < 3; i++) {
  const { left, plant, board } = officeClusters[i];
  shelf(left + 5, 27, false, i === 1, i === 2);
  // Leave the entire bookcase silhouette clear, including the wider third cabinet.
  mountedAircon(left + (i === 2 ? 60 : 36), 16);
  object(board, left + [96, 100, 104][i], 25, UNIT, 73);
  object(98, plant, 134);
  officeSeats[i].forEach((seat, j) =>
    workstation(seat, j ? [130, 139, 130][i] : [130, 130, 139][i], 153),
  );
  if (i === 1) object(163, left + 78, 34);
}
for (const cabinet of officeCabinets) object(cabinet.id, cabinet.x, cabinet.y);
// Connected conference table: identical pixel scale on both axes, one continuous top and base.
function table(x: number, y: number, rows: number) {
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < 3; col++)
      props.push({
        file: "office.png",
        x: x + col * 24,
        y: y + row * 24,
        w: 24,
        h: 24,
        sx: (6 + col) * 16,
        sy: (row === 0 ? 4 : row === rows - 1 ? 6 : 5) * 16,
        sw: 16,
        sh: 16,
        depth: y + rows * 24,
      });
}
const sharedPropsStart = props.length;
table(conferenceTable.x, conferenceTable.y - 48, conferenceTable.height / 24);
for (const seat of meetingSeats) chair({ ...seat, y: seat.y - 48 });
mountedAircon(170, 237);
object(171, 108, 237, UNIT, 277);
object(98, 197, 273);
// Tabletop items remain at the same scale as the workstations.
const conferenceDepth = conferenceTable.y + conferenceTable.height - 48 + 0.5;
object(153, 120, 302, UNIT, conferenceDepth);
object(139, 124, 352, UNIT, conferenceDepth);
// Complete cabinet units flank the entry; a full table and loaded cart define the reading area.
shelf(364, 237, true);
shelf(480, 237, true);
table(readingTable.x, readingTable.y - 48, 2);
// The table's first 8 source rows are transparent. Put the actual lamp base
// inside its visible surface, and keep all tabletop props above the complete table.
const readingDepth = readingTable.y + readingTable.height - 48 + 0.5;
object(142, 460, readingTable.y - 45, UNIT, readingDepth);
object(154, 419, readingTable.y - 33, UNIT, readingDepth);
object(153, 442, readingTable.y - 31, UNIT, readingDepth);
// A full carrier frame with cargo behind its front basket, composed as one object.
props.push({
  file: "cart.png",
  x: 507,
  y: 335,
  w: 48,
  h: 48,
  sx: 0,
  sy: 0,
  sw: 32,
  sh: 32,
  depth: 383,
});
object(99, 366, 381);
// Whole coffee/printer prefabs retain their tabletop, equipment and legs together.
object(320, 238, 266);
object(173, 327, 328);
object(175, 315, 266);
object(200, 238, 344);
object(99, 326, 381);

for (const prop of props.slice(sharedPropsStart)) {
  prop.y += 48;
  if (prop.depth) prop.depth += 48;
}

function Base({ assets }: { assets: SceneAssets }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const atlas = assets.images["room.png"];
    const floor = (
      x: number,
      y: number,
      w: number,
      h: number,
      tx = 11,
      ty = 5,
      tint = false,
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      for (let py = y; py < y + h; py += 24)
        for (let px = x; px < x + w; px += 24)
          ctx.drawImage(atlas, tx * 16, ty * 16, 16, 16, px, py, 24, 24);
      if (tint) {
        ctx.fillStyle = "rgba(69,118,177,.22)";
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();
    };
    ctx.clearRect(0, 0, 576, 528);
    ctx.fillStyle = "#c6d2dd";
    ctx.fillRect(0, 0, 576, 528);
    ctx.fillStyle = "#a6b5c5";
    ctx.fillRect(22, 24, 544, 504);
    floor(24, 24, 528, 488, 11, 5);
    for (const [x, w] of [
      [24, 168],
      [200, 184],
      [392, 160],
    ])
      floor(x, 72, w, 120, 12, 7, true);
    floor(24, 284, 200, 172, 12, 7, true);
    floor(360, 284, 192, 172, 12, 7, true);
    floor(232, 284, 120, 180, 14, 5);
    floor(280, 456, 24, 72, 14, 5);
  }, [assets]);
  return (
    <canvas
      ref={ref}
      className="house-background"
      width={1152}
      height={1056}
      aria-hidden="true"
    />
  );
}
function DocumentCart({ assets }: { assets: SceneAssets }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const cart = assets.images["cart.png"];
    ctx.clearRect(0, 0, 32, 32);
    ctx.drawImage(cart, 0, 0, 32, 32, 0, 0, 32, 32);
    // Full paper single: alpha occupies x=12..24,y=8..20 inside the basket.
    ctx.drawImage(assets.images["office-153.png"], 8, -28);
    // Original front mesh and wheels occlude the lower cargo, without losing the full cart.
    ctx.drawImage(cart, 8, 14, 20, 18, 8, 14, 20, 18);
  }, [assets]);
  return (
    <canvas
      ref={ref}
      width={32}
      height={32}
      style={{ width: 96, height: 96 }}
    />
  );
}

function Furnishing({ p, assets }: { p: Prop; assets: SceneAssets }) {
  const sx = p.sx ?? 0,
    sy = p.sy ?? 0,
    sw = p.sw ?? 32,
    sh = p.sh ?? 48;
  const full =
    p.file === "library.png"
      ? { w: 256, h: 544 }
      : p.file === "office.png"
        ? { w: 256, h: 848 }
        : p.file === "cart.png"
          ? { w: 96, h: 32 }
          : { w: 32, h: 48 };
  return (
    <span
      className="office-furnishing"
      style={{
        left: p.x * 2,
        top: p.y * 2,
        width: p.w * 2,
        height: p.h * 2,
        zIndex: officeDepth(p.depth ?? p.y + p.h),
        clipPath: p.clipTop ? `inset(${p.clipTop * 100}% 0 0)` : undefined,
        transform: p.flip ? "scaleX(-1)" : undefined,
      }}
    >
      {p.file === "cart.png" ? (
        <DocumentCart assets={assets} />
      ) : (
        <img
          src={assets.images[p.file].src}
          alt=""
          draggable={false}
          style={{
            width: (full.w / sw) * p.w * 2,
            height: (full.h / sh) * p.h * 2,
            left: (-sx / sw) * p.w * 2,
            top: (-sy / sh) * p.h * 2,
          }}
        />
      )}
    </span>
  );
}
function WallBand({
  assets,
  wall,
}: {
  assets: SceneAssets;
  wall: (typeof officeWallBands)[number];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const sheet = assets.images["room.png"];
    ctx.clearRect(0, 0, wall.width, wall.height);
    // Use the complete authored top/bottom tile pair. The old single-row repeat
    // lost the skirting and introduced a different brick phase beside each door.
    for (let x = 0; x < wall.width; x += 24)
      ctx.drawImage(sheet, 16, 176, 16, 32, x, 0, 24, 48);
  }, [assets, wall]);
  return (
    <canvas
      ref={ref}
      width={wall.width * 2}
      height={wall.height * 2}
      className="office-front-wall"
      data-wall-band={wall.y}
      style={{
        left: wall.x * 2,
        top: wall.y * 2,
        width: wall.width * 2,
        height: wall.height * 2,
        zIndex: officeDepth(wall.y + wall.height, 2),
      }}
      aria-hidden="true"
    />
  );
}

function WallCaps({ assets }: { assets: SceneAssets }) {
  const top = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);
  const outline = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1152;
    canvas.height = 1056;
    const ctx = canvas.getContext("2d")!;
    // Join the ceiling runs before outlining them, so T-junctions and corners
    // have one continuous silhouette instead of overlapping rectangle borders.
    const mask = new Uint8Array(canvas.width * canvas.height);
    for (const rect of officeWallCaps)
      for (let y = rect.y * 2; y < (rect.y + rect.height) * 2; y++)
        mask.fill(
          1,
          y * canvas.width + rect.x * 2,
          y * canvas.width + (rect.x + rect.width) * 2,
        );
    const sample = document.createElement("canvas");
    sample.width = 1;
    sample.height = 6;
    const sampling = sample.getContext("2d")!;
    sampling.drawImage(assets.images["room.png"], 24, 0, 1, 6, 0, 0, 1, 6);
    const profile = sampling.getImageData(0, 0, 1, 6).data;
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    const w = canvas.width,
      stroke = 3; // one source pixel at the scene's 3× raster scale
    for (let y = stroke; y < canvas.height - stroke; y++)
      for (let x = stroke; x < w - stroke; x++) {
        const p = y * w + x;
        if (!mask[p]) continue;
        const inside = [-stroke, 0, stroke].every((dy) =>
          [-stroke, 0, stroke].every((dx) => mask[p + dy * w + dx]),
        );
        const source = inside ? 4 : 0;
        pixels.data.set(profile.subarray(source, source + 4), p * 4);
      }
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  }, [assets]);
  useEffect(() => {
    top
      .current!.getContext("2d")!
      .drawImage(outline, 0, 0, 1152, 48, 0, 0, 1152, 48);
    front
      .current!.getContext("2d")!
      .drawImage(outline, 0, 48, 1152, 1008, 0, 0, 1152, 1008);
  }, [outline]);
  return (
    <>
      <canvas
        ref={top}
        width={1152}
        height={48}
        className="office-wall-caps"
        style={{ top: 0, zIndex: officeDepth(24, 2) }}
        aria-hidden="true"
      />
      <canvas
        ref={front}
        width={1152}
        height={1008}
        className="office-wall-caps"
        style={{ top: 48, zIndex: officeDepth(528, 2) }}
        aria-hidden="true"
      />
    </>
  );
}

function OfficeDoor({
  assets,
  door,
  doors,
}: {
  assets: SceneAssets;
  door: (typeof officeDoors)[number];
  doors: OfficeDoorController;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = ref.current!,
      ctx = node.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    // Reveal the corridor through the actual leaf cutout, rather than the brick
    // wall painted behind the closed frame. Preserve the vendor's full jambs.
    const cutout = document.createElement("canvas");
    cutout.width = 16;
    cutout.height = 32;
    const mask = cutout.getContext("2d")!;
    mask.drawImage(assets.images["door.png"], 0, 0, 16, 32, 0, 0, 16, 32);
    const closed = mask.getImageData(0, 0, 16, 32);
    mask.clearRect(0, 0, 16, 32);
    mask.drawImage(assets.images["door.png"], 64, 0, 16, 32, 0, 0, 16, 32);
    const opened = mask.getImageData(0, 0, 16, 32);
    for (let i = 0; i < closed.data.length; i += 4)
      closed.data[i + 3] = closed.data[i + 3] && !opened.data[i + 3] ? 255 : 0;
    mask.putImageData(closed, 0, 0);
    mask.globalCompositeOperation = "source-in";
    mask.drawImage(assets.images["room.png"], 176, 80, 16, 32, 0, 0, 16, 32);
    return doors.subscribe(door.id, (frame) => {
      ctx.clearRect(0, 0, 48, 96);
      ctx.drawImage(cutout, 0, 0, 48, 96);
      ctx.drawImage(
        assets.images["door.png"],
        frame * 16,
        0,
        16,
        32,
        0,
        0,
        48,
        96,
      );
      node.dataset.frame = String(frame);
    });
  }, [assets, door, doors]);
  return (
    <canvas
      ref={ref}
      width={48}
      height={96}
      className="office-door"
      data-door={door.id}
      style={{
        left: (door.x - 12) * 2,
        top: door.wallY * 2,
        width: 48,
        height: 96,
        zIndex: officeDepth(door.y, 3),
      }}
      aria-hidden="true"
    />
  );
}

export default function OfficeScene({
  assets,
  doors,
  paused,
  reduced,
}: {
  assets: SceneAssets;
  doors: OfficeDoorController;
  paused: boolean;
  reduced: boolean;
}) {
  useEffect(() => {
    if (reduced) {
      doors.reset();
      return;
    }
    if (paused) return;
    let animation = 0,
      last = 0;
    const tick = (now: number) => {
      doors.advance(last ? Math.min(now - last, 80) : 0);
      last = now;
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [doors, paused, reduced]);
  return (
    <>
      <Base assets={assets} />
      <WallCaps assets={assets} />
      {props.map((p, i) => (
        <Furnishing key={i} p={p} assets={assets} />
      ))}
      {officeWallBands.map((wall) => (
        <WallBand key={wall.y} assets={assets} wall={wall} />
      ))}
      {officeDoors.map((door) => (
        <OfficeDoor key={door.id} assets={assets} door={door} doors={doors} />
      ))}
    </>
  );
}
