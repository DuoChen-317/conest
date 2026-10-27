import {
  officeSeats,
  meetingSeats,
  archiveSpots,
  receptionSeats,
  officeScale,
  officeCabinets,
  officeDesks,
  readingTable,
  conferenceTable,
  frontWalls,
  officeSideWalls,
  officeDoorJambs,
  officeFootprint,
  officeChairBases,
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
  seatIndex = Number(robot),
): Point {
  const point =
    room === "office"
      ? officeSeats[office % 3][seatIndex]
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
  seatIndex = Number(robot),
) {
  const seat =
    room === "office"
      ? officeSeats[office % 3][seatIndex]
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
    // Lateral travel clears the wall face with the whole standing body. Only
    // the door approach lanes pass through its projected height.
    inRect(24, 266, 552, 276) ||
    inRect(24, 76, 190, 190) ||
    inRect(202, 76, 382, 190) ||
    inRect(394, 76, 550, 190) ||
    inRect(107, 184, 125, 272) ||
    inRect(283, 184, 301, 272) ||
    inRect(463, 184, 481, 272) ||
    inRect(51, 272, 69, 360) ||
    inRect(283, 272, 301, 360) ||
    inRect(443, 272, 461, 404) ||
    inRect(24, 358, 222, 456) ||
    inRect(234, 358, 350, 456) ||
    inRect(283, 456, 301, 520) ||
    inRect(362, 380, 550, 448);
  if (!floor) return false;
  const overlapsWall = (
    wall: { x: number; y: number; width: number; height: number },
    radiusX: number,
  ) =>
    px + radiusX > wall.x &&
    px - radiusX < wall.x + wall.width &&
    py + officeFootprint.y > wall.y &&
    py - officeFootprint.y < wall.y + wall.height;
  if (
    frontWalls.some((wall) => overlapsWall(wall, officeFootprint.x)) ||
    officeDoorJambs.some((wall) => overlapsWall(wall, officeFootprint.x)) ||
    officeSideWalls.some((wall) =>
      overlapsWall(wall, officeFootprint.sideClearance),
    )
  )
    return false;
  if (officeChairBases.some((base) => overlapsWall(base, 6))) return false;
  if (
    inRect(
      conferenceTable.x - 8,
      conferenceTable.y + 7,
      conferenceTable.x + conferenceTable.width + 8,
      conferenceTable.y + conferenceTable.height + 7,
    )
  )
    return false;
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
function clearSegment(a: Point, b: Point, canWalk: typeof walkable) {
  if (a.x !== b.x && a.y !== b.y) return false;
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 10));
  for (let i = 0; i <= steps; i++)
    if (
      !canWalk(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps)
    )
      return false;
  return true;
}
function connect(a: Point, b: Point, canWalk: typeof walkable): Point[] | null {
  for (const elbow of [
    { x: a.x, y: b.y },
    { x: b.x, y: a.y },
  ]) {
    if (clearSegment(a, elbow, canWalk) && clearSegment(elbow, b, canWalk))
      return [a, elbow, b].filter(
        (p, i, points) =>
          i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
      );
  }
  return null;
}
type NavigationGrid = { nodes: Uint8Array; edges: Int8Array };
const fixedGrids = new Map<typeof walkable, NavigationGrid>();
function navigationGrid(canWalk: typeof walkable) {
  // These two authored maps are immutable; custom/dynamic masks are never cached.
  if (canWalk !== walkable && canWalk !== officeWalkable) return undefined;
  let grid = fixedGrids.get(canWalk);
  if (!grid) {
    const nodes = new Uint8Array(10_000);
    for (let y = 0; y < 100; y++)
      for (let x = 0; x < 100; x++) nodes[y * 100 + x] = Number(canWalk(x, y));
    grid = { nodes, edges: new Int8Array(20_000) };
    fixedGrids.set(canWalk, grid);
  }
  return grid;
}
function nearest(
  point: Point,
  canWalk: typeof walkable,
  grid?: NavigationGrid,
): Point | undefined {
  const candidates: { point: Point; distance: number }[] = [];
  const startsOnFloor = canWalk(point.x, point.y);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) {
      if (!(grid ? grid.nodes[y * 100 + x] : canWalk(x, y))) continue;
      candidates.push({
        point: { x, y },
        distance: Math.hypot((x - point.x) * 1.5, y - point.y),
      });
    }
  candidates.sort((a, b) => a.distance - b.distance);
  // Only test the closest entries first. Fractional starts must have a clear
  // orthogonal connection; proximity alone can select the other side of a wall.
  return candidates.find(
    ({ point: candidate }) =>
      !startsOnFloor || connect(point, candidate, canWalk),
  )?.point;
}
export function findPath(
  start: Point,
  end: Point,
  canWalk = walkable,
): Point[] {
  const grid = navigationGrid(canWalk);
  const from = nearest(start, canWalk, grid),
    to = nearest(end, canWalk, grid);
  if (!from || !to) return [];
  const key = ({ x, y }: Point) => y * 100 + x;
  const edgeClear = (a: Point, b: Point) => {
    if (!grid) return clearSegment(a, b, canWalk);
    const index = Math.min(key(a), key(b)) * 2 + Number(a.x === b.x);
    if (!grid.edges[index])
      grid.edges[index] = clearSegment(a, b, canWalk) ? 1 : -1;
    return grid.edges[index] === 1;
  };
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
        previous.has(id) ||
        !(grid ? grid.nodes[id] : canWalk(next.x, next.y)) ||
        !edgeClear(point, next)
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
  const prefix = canWalk(start.x, start.y)
    ? connect(start, from, canWalk)
    : [from];
  const suffix = canWalk(end.x, end.y) ? connect(to, end, canWalk) : [to];
  if (!prefix || !suffix) return [];
  const complete = [...prefix.slice(0, -1), ...path, ...suffix.slice(1)];
  return complete.filter((p, i) => {
    const a = complete[i - 1],
      b = complete[i + 1];
    return !a || !b || (a.x !== b.x && a.y !== b.y);
  });
}
