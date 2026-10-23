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
export const meetingSeats: Seat[] = Array.from({ length: 8 }, (_, i) => ({
  x: i % 2 ? 180 : 84,
  y: 340 + Math.floor(i / 2) * 36,
  facing: i % 2 ? "left" : "right",
}));
export const archiveSpots = [
  [432, 446],
  [456, 446],
  [480, 446],
  [400, 416],
  [380, 368],
  [412, 368],
  [492, 368],
  [524, 368],
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
export const readingTable = { x: 416, y: 374, width: 72, height: 48 };
export const officeDoors = [
  { id: "office-0", x: 116, y: 232 },
  { id: "office-1", x: 292, y: 232 },
  { id: "office-2", x: 472, y: 232 },
  { id: "meeting", x: 60, y: 320 },
  { id: "commons", x: 292, y: 320 },
  { id: "library", x: 452, y: 320 },
  { id: "entrance", x: 292, y: 512 },
];
export const frontWalls = [
  ...[
    [24, 104],
    [128, 280],
    [304, 460],
    [484, 552],
  ].map(([x, r]) => ({ x, y: 184, width: r - x })),
  { x: 24, y: 456, width: 208 },
  { x: 352, y: 456, width: 200 },
  { x: 232, y: 464, width: 48 },
  { x: 304, y: 464, width: 48 },
];
