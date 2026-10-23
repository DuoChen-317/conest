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
      y: 59 + (Math.floor(index / 5) % 2) * 10,
    };
  return { x: 49 + (index % 2) * 2, y: 59 + (Math.floor(index / 2) % 5) * 4 };
}
function nearest(point: Point): Point {
  let best = { x: 50, y: 40 },
    distance = Infinity;
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) {
      if (!walkable(x, y)) continue;
      const d = Math.hypot((x - point.x) * 1.5, y - point.y);
      if (d < distance) {
        distance = d;
        best = { x, y };
      }
    }
  return best;
}
export function findPath(start: Point, end: Point): Point[] {
  const from = nearest(start),
    to = nearest(end);
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
        !walkable(next.x, next.y) ||
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
