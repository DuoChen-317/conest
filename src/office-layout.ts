/** Native pixel coordinates shared by furniture, arrival positions and facing. */
export const officeScale = 1.5;
export type Facing = "left" | "right";
export type Seat = { x: number; y: number; facing: Facing };
export const officeSeats: Seat[][] = [0, 1, 2].map((i) => [
  { x: 144 + i * 180, y: 112, facing: "left" },
  { x: 64 + i * 180, y: 168, facing: "right" },
]);
export const meetingSeats: Seat[] = Array.from({ length: 8 }, (_, i) => ({
  x: i % 2 ? 180 : 84,
  y: 300 + Math.floor(i / 2) * 32,
  facing: i % 2 ? "left" : "right",
}));
export const archiveSpots = [
  [384, 320],
  [416, 320],
  [448, 320],
  [480, 320],
  [512, 320],
  [392, 354],
  [416, 354],
  [504, 354],
].map(([x, y]) => ({ x, y }));
export const receptionSeats: Seat[] = [
  { x: 260, y: 365, facing: "right" },
  { x: 324, y: 365, facing: "left" },
];
/** The 32px-wide return is completed by the lower 16px module on its open side. */
export function deskParts(seat: Seat) {
  const mirror = seat.facing === "left";
  const x = mirror ? seat.x - 55 : seat.x + 7;
  const y = seat.y - 36;
  return [
    { id: 263, x, y, flip: mirror },
    { id: 262, x: mirror ? x : x + 24, y: y + 24, flip: mirror },
  ];
}
