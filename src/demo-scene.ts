import type { Room } from "./house";

// Only the sample office uses this loop. Real projects keep their reported presence.
export function demoPhaseAt(elapsed: number) {
  const time = elapsed % 32_000;
  return time < 1500
    ? 0
    : time < 5000
      ? 1
      : time < 15_000
        ? 2
        : time < 20_000
          ? 3
          : 4;
}

export function demoRoomFor(actorId: string, phase: number): Room | undefined {
  if (actorId === "demo-human")
    return phase === 1 || phase === 2 ? "meeting" : "office";
  if (actorId === "a1")
    return phase === 2 || phase === 3 ? "library" : "office";
  return undefined;
}
