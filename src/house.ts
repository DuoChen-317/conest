import {
  officeSeats,
  meetingSeats,
  archiveSpots,
  receptionSeats,
  officeScale,
  officeCabinets,
  officeDesks,
  readingTable,
} from "./office-layout";
import { officeObjectBounds } from "./office-objects";
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
/** Licensed map is compact and uses one native 576×528 grid for art and navigation. */
export const officeWorld = { width: 1152, height: 1056 };
export function officeDestination(
  room: Room,
  office: number,
  index: number,
  robot = false,
): Point {
  const point =
    room === "office"
      ? officeSeats[office % 3][Number(robot)]
      : room === "meeting"
        ? meetingSeats[index % meetingSeats.length]
        : room === "library"
          ? archiveSpots[index % archiveSpots.length]
          : receptionSeats[index % receptionSeats.length];
  const { x, y } = point;
  return { x: x / 5.76, y: y / 5.28 };
}
export function officeFacing(
  room: Room,
  office: number,
  index: number,
  robot = false,
) {
  const seat =
    room === "office"
      ? officeSeats[office % 3][Number(robot)]
      : room === "meeting"
        ? meetingSeats[index % meetingSeats.length]
        : room === "commons"
          ? receptionSeats[index % receptionSeats.length]
          : null;
  return seat ? (seat.facing === "up" ? 2 : seat.facing === "left" ? 0 : 3) : 1;
}
export function officeWalkable(x: number, y: number) {
  const px = x * 5.76,
    py = y * 5.28;
  const inRect = (l: number, t: number, r: number, b: number) =>
    inside(px, py, l, t, r, b);
  const floor =
    inRect(24, 232, 552, 276) ||
    inRect(24, 76, 190, 190) ||
    inRect(202, 76, 382, 190) ||
    inRect(394, 76, 550, 190) ||
    inRect(104, 184, 128, 244) ||
    inRect(280, 184, 304, 244) ||
    inRect(460, 184, 484, 244) ||
    inRect(48, 272, 72, 320) ||
    inRect(280, 272, 304, 320) ||
    inRect(440, 272, 464, 404) ||
    inRect(24, 316, 222, 448) ||
    inRect(234, 316, 350, 464) ||
    inRect(362, 316, 550, 448);
  if (!floor) return false;
  if (inRect(94, 324, 170, 448)) return false;
  if (inRect(360, 284, 440, 352) || inRect(476, 284, 552, 352)) return false;
  if (
    inRect(
      readingTable.x - 2,
      readingTable.y - 2,
      readingTable.x + readingTable.width + 2,
      readingTable.y + readingTable.height + 2,
    )
  )
    return false;
  if (inRect(516, 398, 550, 431)) return false;
  if (
    inRect(236, 312, 279, 365) ||
    inRect(325, 374, 350, 423) ||
    inRect(312, 312, 352, 369)
  )
    return false;
  if (inRect(236, 390, 287, 430)) return false;
  // Collision is the actual horizontal desktop, not the old side-facing L return.
  for (const desk of officeDesks)
    if (
      inRect(
        desk.x - 2,
        desk.y - 2,
        desk.x + desk.width + 2,
        desk.y + desk.height,
      )
    )
      return false;
  for (const cabinet of officeCabinets) {
    const [, , width, height] = officeObjectBounds[cabinet.id];
    if (
      inRect(
        cabinet.x - 2,
        cabinet.y - 2,
        cabinet.x + width * officeScale + 2,
        cabinet.y + height * officeScale + 2,
      )
    )
      return false;
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
  // The grid finds the route; the final short approach reaches the authored chair anchor exactly.
  const last = path.at(-1)!;
  if (canWalk(end.x, end.y) && (last.x !== end.x || last.y !== end.y)) {
    const clear = (a: Point, b: Point) => {
      const steps = Math.max(
        1,
        Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 10),
      );
      for (let i = 0; i <= steps; i++)
        if (
          !canWalk(
            a.x + ((b.x - a.x) * i) / steps,
            a.y + ((b.y - a.y) * i) / steps,
          )
        )
          return false;
      return true;
    };
    for (const elbow of [
      { x: end.x, y: last.y },
      { x: last.x, y: end.y },
    ]) {
      if (clear(last, elbow) && clear(elbow, end)) {
        if (elbow.x !== last.x || elbow.y !== last.y) path.push(elbow);
        if (elbow.x !== end.x || elbow.y !== end.y) path.push(end);
        break;
      }
    }
  }
  const simplified: Point[] = [];
  path.forEach((p, i) => {
    const a = path[i - 1],
      b = path[i + 1];
    if (!a || !b || (a.x !== b.x && a.y !== b.y)) simplified.push(p);
  });
  return simplified;
}
