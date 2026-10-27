/** Native pixel coordinates shared by furniture, arrival positions and facing. */
export const officeScale = 1.5;
export type Facing = "left" | "right" | "up";
export type Seat = { x: number; y: number; facing: Facing };
export const officeSeats: Seat[][] = [24, 204, 396].map((left) => [
  { x: left + 56, y: 148, facing: "up" },
  { x: left + 120, y: 148, facing: "up" },
]);
export const officeDesks = officeSeats.flat().map((seat) => ({
  x: seat.x - 24,
  y: seat.y - 44,
  width: 48,
  height: 28.5,
}));
export const meetingSeats: Seat[] = Array.from({ length: 6 }, (_, i) => ({
  x: i % 2 ? 180 : 84,
  y: 360 + Math.floor(i / 2) * 36,
  facing: i % 2 ? "left" : "right",
}));
export const archiveSpots = [
  [432, 446],
  [456, 446],
  [480, 446],
  [400, 416],
  [380, 384],
  [412, 384],
  [492, 384],
  [524, 384],
].map(([x, y]) => ({ x, y }));
export const receptionSeats: Seat[] = [
  { x: 250, y: 434, facing: "right" },
  { x: 274, y: 434, facing: "left" },
];
export const officeClusters = [
  {
    left: 24,
    plant: 159,
    board: 170,
    storage: 323,
    storageX: 28,
    storageY: 144,
  },
  {
    left: 204,
    plant: 339,
    board: 171,
    storage: 168,
    storageX: 208,
    storageY: 144,
  },
  {
    left: 396,
    plant: 528,
    board: 172,
    storage: 323,
    storageX: 400,
    storageY: 144,
  },
];
export const officeCabinets = officeClusters.flatMap((c) => [
  { id: 168, x: c.left + 4, y: 108 },
  { id: c.storage, x: c.storageX, y: c.storageY },
]);
export const readingTable = { x: 416, y: 390, width: 72, height: 48 };
export const conferenceTable = { x: 96, y: 324, width: 72, height: 96 };
export const officeDoors = [
  { id: "office-0", x: 116, y: 232, wallY: 184 },
  { id: "office-1", x: 292, y: 232, wallY: 184 },
  { id: "office-2", x: 472, y: 232, wallY: 184 },
  { id: "meeting", x: 60, y: 324, wallY: 276 },
  { id: "commons", x: 292, y: 324, wallY: 276 },
  { id: "library", x: 452, y: 324, wallY: 276 },
  { id: "entrance", x: 292, y: 504, wallY: 456 },
];
export const frontWalls = [
  ...[
    [24, 104],
    [128, 280],
    [304, 460],
    [484, 552],
  ].map(([x, r]) => ({ x, y: 184, width: r - x, height: 48 })),
  { x: 24, y: 276, width: 24, height: 48 },
  { x: 72, y: 276, width: 208, height: 48 },
  { x: 304, y: 276, width: 56, height: 48 },
  { x: 360, y: 276, width: 80, height: 48 },
  { x: 464, y: 276, width: 88, height: 48 },
  { x: 24, y: 456, width: 256, height: 48 },
  { x: 304, y: 456, width: 248, height: 48 },
];

// Side walls reserve the silhouette; doorway jambs occlude the sprite's shoulders.
export const officeSideWalls = [
  { x: 15, y: 24, width: 9, height: 480 },
  { x: 552, y: 24, width: 9, height: 480 },
  { x: 192, y: 24, width: 9, height: 160 },
  { x: 384, y: 24, width: 9, height: 160 },
  { x: 224, y: 285, width: 9, height: 171 },
  { x: 352, y: 285, width: 9, height: 171 },
];

// The vendor's front wall is a complete 16×32 pair; its ceiling profile is 6px.
// All faces and closed doors share this height and the same floor baseline.
export const officeWallBands = [24, 184, 276, 456].map((y) => ({
  x: 24,
  y,
  width: 528,
  height: 32 * officeScale,
}));
export const officeWallCaps = [
  { x: 15, y: 15, width: 546, height: 6 * officeScale },
  ...officeWallBands.slice(1).map((band) => ({
    x: 15,
    y: band.y,
    width: 546,
    height: 6 * officeScale,
  })),
  ...officeSideWalls,
];
export const officeDoorJambs = officeDoors.flatMap((door) => [
  { x: door.x - 12, y: door.wallY, width: 3, height: door.y - door.wallY },
  { x: door.x + 9, y: door.wallY, width: 3, height: door.y - door.wallY },
]);
export const officeFootprint = { x: 6, y: 3, sideClearance: 12 };

/** Every scene layer uses the same native ground coordinate, at quarter-pixel precision. */
export function officeDepth(groundY: number, layer = 0) {
  return Math.round(groundY * 4) + layer;
}

// The chair base occupies floor space. Its tall back is handled by depth sorting.
// The seat anchor stays accessible from the aisle immediately in front of it.
export const officeChairBases = [...officeSeats.flat(), ...meetingSeats].map(
  (seat) => ({ x: seat.x - 10, y: seat.y - 13, width: 20, height: 9 }),
);
