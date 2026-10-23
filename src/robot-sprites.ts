import type { Interaction } from "./interaction";

export const robotSheet = "/assets/robot-office-v2.png";

// Measured complete silhouettes, including the generated sheet's uneven gutters.
// Keep a small transparent rim; never cut a character at an assumed cell edge.
const frames = [
  [
    [121, 63, 102, 213],
    [382, 63, 109, 213],
    [636, 63, 113, 213],
    [900, 63, 102, 213],
  ],
  [
    [111, 324, 107, 221],
    [371, 324, 121, 221],
    [629, 324, 121, 221],
    [904, 324, 107, 221],
  ],
  [
    [111, 589, 107, 220],
    [372, 589, 124, 220],
    [630, 589, 121, 220],
    [904, 589, 107, 220],
  ],
  [
    [93, 860, 116, 202],
    [384, 864, 113, 198],
    [636, 864, 106, 198],
    [913, 860, 107, 202],
  ],
  [
    [106, 1109, 126, 227],
    [372, 1109, 125, 227],
    [608, 1113, 134, 215],
    [908, 1115, 137, 213],
  ],
] as const;

export function robotPose(
  action: Interaction | "walking",
  direction: number,
  frame: number,
) {
  const dir = Math.max(0, Math.min(3, direction));
  let row = 0,
    column = dir;
  if (action === "walking") row = [0, 1, 0, 2][frame % 4];
  else if (action === "reading") {
    row = 4;
    column = Math.floor(frame / 3) % 2;
  } else if (action === "speaking") {
    row = 4;
    column = dir === 0 ? 2 : 3;
  } else if (dir === 2 && ["typing", "seated"].includes(action)) {
    // North-facing workstation: keep the full rear silhouette behind the chair.
    row = 0;
    column = 2;
  } else if (["typing", "seated", "listening"].includes(action)) {
    row = 3;
    column =
      (dir === 0 ? 0 : 1) +
      (action === "typing" ? (Math.floor(frame / 2) % 2) * 2 : 0);
  }
  const [x, y, width, height] = frames[row][column];
  // One scale for every pose keeps heads/limbs consistent while hips bend naturally.
  return {
    x,
    y,
    width,
    height,
    drawWidth: Math.round(width * 0.25),
    drawHeight: Math.round(height * 0.25),
  };
}
