import { useEffect, useRef } from "react";
import { officeObjectBounds as source } from "./office-objects";
import type { SceneAssets } from "./scene-assets";
import {
  officeSeats,
  meetingSeats,
  receptionSeats,
  deskParts,
  officeScale as UNIT,
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
    depth: depth || Math.round((y + sh * scale) / 4.32),
    flip,
  });
}
function chair(seat: Seat) {
  object(
    seat.facing === "right" ? 104 : 103,
    seat.x - 9,
    seat.y - 34.5,
    UNIT,
    seat.y / 4.32 + 1,
  );
}
function shelf(x: number, y: number, wide = false) {
  // The narrow cabinet is the complete neighboring single, not one cut-off column of the wide cabinet.
  props.push({
    file: "library.png",
    x,
    y,
    w: (wide ? 48 : 16) * UNIT,
    h: 48 * UNIT,
    sx: wide ? 0 : 48,
    sy: 208,
    sw: wide ? 48 : 16,
    sh: 48,
    depth: (y + 42 * UNIT) / 4.32 + 3,
  });
}
function mountedAircon(x: number, capY: number) {
  object(165, x, capY + 3.5, UNIT, 7);
}
function workstation(seat: Seat) {
  const mirror = seat.facing === "left",
    depth = seat.y / 4.32;
  chair(seat);
  // Top with an open return + the matching lower module, joined at the native 16px seam.
  for (const part of deskParts(seat))
    object(part.id, part.x, part.y, UNIT, depth + 3, part.flip);
  const onDesk = (id: number, dx: number, dy: number) => {
    const width = source[id][2] * UNIT;
    object(
      id,
      mirror ? seat.x - dx - width : seat.x + dx,
      seat.y + dy,
      UNIT,
      depth + 4,
      mirror,
    );
  };
  onDesk(129, 25, -53.5);
  onDesk(124, 9, -24);
  onDesk(242, 38, -25);
  onDesk(153, 34, -10);
}
for (let i = 0; i < 3; i++) {
  const left = [24, 204, 396][i];
  shelf(left + 5, 27);
  mountedAircon(left + 28, 16);
  object(i === 1 ? 171 : 170, left + 96, 25, UNIT, 15);
  object(98, left + 135, 66);
  for (const seat of officeSeats[i]) workstation(seat);
  object(323, left + 126, 143);
  object(168, left + 4, 148);
}
// Connected 3×5 conference table: identical pixel scale on both axes, one continuous top and base.
for (let row = 0; row < 5; row++)
  for (let col = 0; col < 3; col++)
    props.push({
      file: "office.png",
      x: 96 + col * 24,
      y: 280 + row * 24,
      w: 24,
      h: 24,
      sx: (6 + col) * 16,
      sy: (row === 0 ? 4 : row === 4 ? 6 : 5) * 16,
      sw: 16,
      sh: 16,
      depth: Math.round((304 + row * 24) / 4.32) + 2,
    });
for (const seat of meetingSeats) chair(seat);
mountedAircon(170, 228);
object(171, 108, 237, UNIT, 58);
object(98, 197, 273);
// Tabletop items remain at the same scale as the workstations.
object(153, 120, 306, UNIT, 78);
object(242, 123, 354, UNIT, 90);
// Full cabinet units flank the aisle. The reading counter also includes its return module.
shelf(364, 237, true);
shelf(480, 237, true);
object(263, 434, 356, UNIT, 96);
object(262, 458, 380, UNIT, 98);
object(142, 458, 342, UNIT, 99);
object(153, 438, 357, UNIT, 99);
object(242, 462, 383, UNIT, 99);
object(99, 366, 381);
object(173, 528, 350);
// Whole coffee/printer prefabs retain their tabletop, equipment and legs together.
object(320, 238, 266);
object(175, 315, 266);
for (const seat of receptionSeats) chair(seat);
object(99, 238, 381);
object(99, 326, 381);

function Base({ assets }: { assets: SceneAssets }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
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
    ctx.clearRect(0, 0, 576, 432);
    ctx.fillStyle = "#c6d2dd";
    ctx.fillRect(0, 0, 576, 432);
    ctx.fillStyle = "#a6b5c5";
    ctx.fillRect(22, 24, 544, 400);
    floor(24, 24, 528, 392, 11, 5);
    for (const [x, w] of [
      [24, 168],
      [200, 184],
      [392, 160],
    ])
      floor(x, 72, w, 120, 12, 7, true);
    floor(24, 236, 200, 172, 12, 7, true);
    floor(360, 236, 192, 172, 12, 7, true);
    floor(232, 236, 120, 180, 14, 5);
    const wallFace = (x: number, y: number, w: number, h: number) => {
      floor(x, y, w, h, 5, 11);
      ctx.fillStyle = "#61748d";
      ctx.fillRect(x, y + h - 3, w, 3);
      ctx.fillStyle = "rgba(32,42,62,.16)";
      ctx.fillRect(x, y + h, w, 5);
    };
    // Original brick faces and white cutaway caps, rather than freehand colored boxes.
    wallFace(24, 24, 528, 48);
    for (const [x, w] of [
      [24, 24],
      [72, 208],
      [304, 136],
      [464, 88],
    ])
      wallFace(x, 236, w, 36);
    // Taller archive wall accommodates the complete tall cabinets, with their bases at the floor.
    wallFace(360, 236, 80, 60);
    wallFace(464, 236, 88, 60);
    const wall = (x: number, y: number, w: number, h = 8) => {
      ctx.fillStyle = "#424d64";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#eff0f6";
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = "#b8bfd0";
      if (w > h) ctx.fillRect(x + 1, y + h - 3, w - 2, 2);
      else ctx.fillRect(x + w - 3, y + 1, 2, h - 2);
    };
    wall(16, 16, 544);
    wall(16, 24, 8, 392);
    wall(552, 24, 8, 392);
    wall(192, 24, 8, 176);
    wall(384, 24, 8, 176);
    for (const [x, right] of [
      [24, 104],
      [128, 280],
      [304, 460],
      [484, 552],
    ])
      wall(x, 192, right - x);
    for (const [x, right] of [
      [24, 48],
      [72, 280],
      [304, 440],
      [464, 552],
    ])
      wall(x, 228, right - x);
    wall(224, 236, 8, 180);
    wall(352, 236, 8, 180);
    wall(24, 408, 208);
    wall(352, 408, 200);
    wall(232, 416, 48);
    wall(304, 416, 48);
    floor(280, 416, 24, 16, 14, 5);
  }, [assets]);
  return (
    <canvas
      ref={ref}
      className="house-background"
      width={576}
      height={432}
      aria-hidden="true"
    />
  );
}
function Furnishing({ p }: { p: Prop }) {
  const sx = p.sx ?? 0,
    sy = p.sy ?? 0,
    sw = p.sw ?? 32,
    sh = p.sh ?? 48;
  const full =
    p.file === "library.png"
      ? { w: 256, h: 544 }
      : p.file === "office.png"
        ? { w: 256, h: 848 }
        : { w: 32, h: 48 };
  return (
    <span
      className="office-furnishing"
      style={{
        left: p.x * 2,
        top: p.y * 2,
        width: p.w * 2,
        height: p.h * 2,
        zIndex: p.depth ?? Math.round((p.y + p.h) / 4.32),
        transform: p.flip ? "scaleX(-1)" : undefined,
      }}
    >
      <img
        src={`/scene-assets/${p.file}`}
        alt=""
        draggable={false}
        style={{
          width: (full.w / sw) * p.w * 2,
          height: (full.h / sh) * p.h * 2,
          left: (-sx / sw) * p.w * 2,
          top: (-sy / sh) * p.h * 2,
        }}
      />
    </span>
  );
}
export default function OfficeScene({ assets }: { assets: SceneAssets }) {
  return (
    <>
      <Base assets={assets} />
      <div
        className="office-mount-cap"
        style={{ left: 32, top: 32, width: 1088 }}
      />
      {[
        [24, 48],
        [72, 280],
        [304, 440],
        [464, 552],
      ].map(([x, r]) => (
        <div
          key={x}
          className="office-mount-cap"
          style={{ left: x * 2, top: 456, width: (r - x) * 2 }}
        />
      ))}
      {props.map((p, i) => (
        <Furnishing key={i} p={p} />
      ))}
    </>
  );
}
