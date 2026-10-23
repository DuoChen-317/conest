export type Room = "office" | "meeting" | "library" | "commons";
export type Point = { x: number; y: number };
export const officeDoors = [18.5, 50, 80.8];
export const roomNames: Record<Room, string> = {
  office: "专属办公室",
  meeting: "会议室",
  library: "资料室",
  commons: "接待区",
};
const inside = (
  x: number,
  y: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
) => x >= left && x <= right && y >= top && y <= bottom;

// Walkable floor follows the inspected raster, including real doorway gaps.
export function walkable(x: number, y: number) {
  const floor =
    inside(x, y, 6, 40, 94, 42) ||
    inside(x, y, 6, 18, 31, 30) ||
    inside(x, y, 36, 18, 65, 30) ||
    inside(x, y, 68, 18, 94, 30) ||
    inside(x, y, 17, 30, 20, 40) ||
    inside(x, y, 48, 30, 52, 40) ||
    inside(x, y, 79, 30, 82, 40) ||
    inside(x, y, 22, 42, 26, 50) ||
    inside(x, y, 48, 42, 52, 50) ||
    inside(x, y, 76, 42, 80, 50) ||
    inside(x, y, 7, 50, 38, 79) ||
    inside(x, y, 66, 50, 87, 74) ||
    inside(x, y, 48, 50, 52, 85);
  return floor && !inside(x, y, 13, 61, 33, 70);
}
export function destination(
  room: Room,
  office: number,
  index: number,
  robot = false,
): Point {
  if (room === "office")
    return {
      x: officeDoors[office % 3] + (robot ? 4 : -4),
      y: 20 + (robot && index > 0 ? (index % 2) * 4 : 0),
    };
  if (room === "meeting")
    return {
      x: [16.5, 21, 25.5, 30][index % 4],
      y: Math.floor(index / 4) % 2 ? 74 : 58,
    };
  if (room === "library")
    return {
      x: 68 + (index % 5) * 4,
      y: 65 + (Math.floor(index / 5) % 2) * 6,
    };
  return { x: 49 + (index % 2) * 2, y: 59 + (Math.floor(index / 2) % 5) * 4 };
}
/** Licensed map is compact and uses one native 576×432 grid for art and navigation. */
export const officeWorld = { width: 1152, height: 864 };
export function officeDestination(
  room: Room,
  office: number,
  index: number,
  robot = false,
): Point {
  let x: number, y: number;
  if (room === "office") {
    x = (robot ? 126 : 80) + (office % 3) * 180;
    y = robot ? 146 : 98;
  } else if (room === "meeting") {
    x = index % 2 ? 168 : 96;
    y = 282 + (Math.floor(index / 2) % 4) * 32;
  } else if (room === "library") {
    x = 408 + (index % 4) * 32;
    y = 346 + (Math.floor(index / 4) % 2) * 20;
  } else {
    x = index % 2 ? 324 : 260;
    y = 320 + (Math.floor(index / 2) % 3) * 28;
  }
  return { x: x / 5.76, y: y / 4.32 };
}
export function officeWalkable(x: number, y: number) {
  const px = x * 5.76,
    py = y * 4.32;
  const inRect = (l: number, t: number, r: number, b: number) =>
    inside(px, py, l, t, r, b);
  const floor =
    inRect(24, 200, 552, 228) ||
    inRect(24, 76, 190, 184) ||
    inRect(202, 76, 382, 184) ||
    inRect(394, 76, 550, 184) ||
    inRect(104, 184, 128, 212) ||
    inRect(280, 184, 304, 212) ||
    inRect(460, 184, 484, 212) ||
    inRect(48, 224, 72, 272) ||
    inRect(280, 224, 304, 272) ||
    inRect(440, 224, 464, 356) ||
    inRect(24, 268, 222, 400) ||
    inRect(234, 268, 350, 416) ||
    inRect(362, 268, 550, 400);
  if (!floor) return false;
  if (inRect(100, 266, 164, 394)) return false;
  if (inRect(360, 250, 440, 330) || inRect(476, 250, 552, 330)) return false;
  if (inRect(362, 368, 406, 408) || inRect(506, 368, 550, 408)) return false;
  if (inRect(432, 374, 488, 408)) return false;
  // Feet may approach the chair; they never pass through the desktop, sofa or cabinet.
  for (let i = 0; i < 3; i++) {
    for (const [seat, feet] of [
      [80 + i * 180, 98],
      [126 + i * 180, 146],
    ])
      if (inRect(seat + 5, feet - 23, seat + 59, feet + 6)) return false;
    const left = [24, 204, 396][i];
    if (inRect(left + 3, 140, left + 49, 183)) return false;
    if (inRect(left + 130, 156, left + 157, 187)) return false;
  }
  return true;
}
function nearest(point: Point, canWalk: typeof walkable): Point {
  let best = { x: 50, y: 40 },
    distance = Infinity;
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) {
      if (!canWalk(x, y)) continue;
      const d = Math.hypot((x - point.x) * 1.5, y - point.y);
      if (d < distance) {
        distance = d;
        best = { x, y };
      }
    }
  return best;
}
export function findPath(
  start: Point,
  end: Point,
  canWalk = walkable,
): Point[] {
  const from = nearest(start, canWalk),
    to = nearest(end, canWalk);
  const key = ({ x, y }: Point) => y * 100 + x;
  const queue = [from],
    previous = new Map<number, Point | null>([[key(from), null]]);
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i];
    if (key(point) === key(to)) break;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: point.x + dx, y: point.y + dy },
        id = key(next);
      if (
        next.x < 0 ||
        next.y < 0 ||
        next.x >= 100 ||
        next.y >= 100 ||
        !canWalk(next.x, next.y) ||
        previous.has(id)
      )
        continue;
      previous.set(id, point);
      queue.push(next);
    }
  }
  if (!previous.has(key(to))) return [];
  const path: Point[] = [];
  for (
    let point: Point | null = to;
    point;
    point = previous.get(key(point)) ?? null
  )
    path.unshift(point);
  const simplified: Point[] = [];
  path.forEach((p, i) => {
    const a = path[i - 1],
      b = path[i + 1];
    if (!a || !b || (a.x !== b.x && a.y !== b.y)) simplified.push(p);
  });
  return simplified;
}
