import { useEffect, useRef } from "react";
import type { SceneAssets } from "./scene-assets";

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
// Coordinates are in the native 576×432 game world. Floors, furnishings and people are separate layers.
const props: Prop[] = [];
const put = (id: number, x: number, y: number, options: Partial<Prop> = {}) =>
  props.push({ file: `office-${id}.png`, x, y, w: 32, h: 48, ...options });
const source: Record<number, number[]> = {
  263: [0, 16, 32, 19],
  153: [4, 36, 12, 12],
  165: [3, 35, 26, 13],
  228: [0, 26, 10, 15],
  242: [0, 38, 10, 10],
  98: [1, 9, 14, 37],
  99: [2, 21, 12, 25],
  103: [2, 21, 12, 23],
  104: [2, 21, 12, 23],
  116: [4, 27, 25, 14],
  124: [0, 41, 16, 5],
  129: [0, 33, 16, 15],
  130: [0, 34, 16, 14],
  142: [0, 17, 15, 17],
  149: [0, 17, 15, 19],
  170: [0, 16, 32, 24],
  171: [0, 16, 32, 24],
  173: [3, 11, 12, 36],
  174: [0, 17, 16, 31],
  200: [0, 16, 32, 32],
};
function crop(
  id: number,
  x: number,
  y: number,
  scale = 1,
  extra: Partial<Prop> = {},
) {
  const [sx, sy, sw, sh] = source[id];
  put(id, x, y, { sx, sy, sw, sh, w: sw * scale, h: sh * scale, ...extra });
}
// The author's scenes are composed as working clusters, with one shared pixel scale.
const UNIT = 1.5;
function shelf(x: number, y: number, depth: number, wide = false) {
  props.push({
    file: "library.png",
    x,
    y,
    w: wide ? 72 : 24,
    h: 72,
    sx: 0,
    sy: 208,
    sw: wide ? 48 : 16,
    sh: 48,
    depth,
  });
}
function desk(seat: number, feet: number, variant: number) {
  const depth = feet / 4.32;
  crop(103, seat - 10, feet - 29, UNIT, { depth: depth + 1 });
  crop(263, seat + 7, feet - 21, UNIT, { depth: depth + 6 });
  crop(124, seat + 10, feet - 16, 1, { depth: depth + 8 });
  crop(variant % 2 ? 130 : 129, seat + 28, feet - 35, UNIT, {
    depth: depth + 8,
  });
  crop(242, seat + 39, feet - 10, 0.65, { depth: depth + 8 });
  crop(153, seat + 9, feet - 21, 0.75, { depth: depth + 9 });
  crop(228, seat + 47, feet - 29, 0.85, { depth: depth + 9 });
}
// Private offices: wall storage, an owner/AI workstation pair, and a small review corner.
for (let i = 0; i < 3; i++) {
  const left = [24, 204, 396][i],
    human = 80 + i * 180,
    robot = 126 + i * 180;
  shelf(left + 5, 34, 23);
  crop(165, left + 46, 28, UNIT, { depth: 12 });
  crop(i === 1 ? 171 : 170, left + 95, 31, UNIT, { depth: 16 });
  crop(98, left + 135, 51, UNIT, { depth: 28 });
  desk(human, 98, i);
  desk(robot, 146, i + 1);
  crop(200, left + 6, 143, 1.25, { depth: 44 });
  crop(142, left + 45, 146, 1.2, { depth: 44 });
  crop(149, left + 133, 159, 1.25, { depth: 49 });
  crop(99, left + 113, 166, 1.2, { depth: 49 });
}
// A vertical conference table lets both sides use the actual side-facing seated poses.
for (let row = 0; row < 6; row++)
  for (let col = 0; col < 3; col++)
    props.push({
      file: "office.png",
      x: 104 + col * 18,
      y: 270 + row * 20,
      w: 18,
      h: 20,
      sx: (6 + col) * 16,
      sy: (row === 0 ? 4 : row === 5 ? 6 : 5) * 16,
      sw: 16,
      sh: 16,
      depth: Math.round((290 + row * 20) / 4.32) + 5,
    });
for (let row = 0; row < 4; row++) {
  const feet = 282 + row * 32;
  crop(103, 86, feet - 29, UNIT, { depth: feet / 4.32 + 1 });
  crop(104, 158, feet - 29, UNIT, { depth: feet / 4.32 + 1 });
}
crop(171, 101, 237, UNIT, { depth: 58 });
crop(165, 36, 239, UNIT, { depth: 58 });
crop(98, 197, 243, UNIT, { depth: 66 });
crop(149, 36, 348, UNIT, { depth: 87 });
crop(99, 198, 366, UNIT, { depth: 91 });
crop(153, 121, 293, 1, { depth: 75 });
crop(242, 137, 335, 1, { depth: 85 });
// The archive has a real doorway/aisle between wall shelving and a shared reading counter.
shelf(364, 254, 76, true);
shelf(480, 254, 76, true);
crop(116, 442, 238, 1.2, { depth: 58 });
for (const x of [366, 510]) {
  props.push({
    file: "library.png",
    x,
    y: 370,
    w: 36,
    h: 36,
    sx: 0,
    sy: 208,
    sw: 48,
    sh: 48,
    depth: 98,
  });
}
crop(263, 436, 378, UNIT, { depth: 98 });
crop(142, 467, 363, 1, { depth: 99 });
crop(153, 444, 376, 0.8, { depth: 99 });
// Reception stays small: seating around a clear route from the entrance to the corridor.
crop(200, 238, 284, 1.25, { depth: 78 });
crop(200, 310, 284, 1.25, { depth: 78 });
crop(174, 320, 239, 1.4, { depth: 67 });
crop(173, 322, 269, 1.4, { depth: 75 });
crop(149, 240, 349, 1.4, { depth: 90 });
crop(98, 240, 375, UNIT, { depth: 99 });
crop(98, 324, 375, UNIT, { depth: 99 });

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
      floor(x, 60, w, 132, 12, 7, true);
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
    wallFace(24, 24, 528, 36);
    for (const [x, w] of [
      [24, 24],
      [72, 208],
      [304, 136],
      [464, 88],
    ])
      wallFace(x, 236, w, 25);
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
      {props.map((p, i) => (
        <Furnishing key={i} p={p} />
      ))}
    </>
  );
}
