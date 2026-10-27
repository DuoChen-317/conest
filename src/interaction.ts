import type { Room } from "./house";
export type Interaction =
  "idle" | "seated" | "typing" | "reading" | "listening" | "speaking";
export const interactionNames: Record<Interaction, string> = {
  idle: "暂时离开工位",
  seated: "坐在工位休息",
  typing: "正在敲键盘",
  reading: "正在翻阅资料",
  listening: "正在倾听讨论",
  speaking: "正在发言",
};
export function interactionFor(
  room: Room,
  status: string,
  working: boolean,
): Interaction {
  if (status === "offline") return "idle";
  if (room === "library") return "reading";
  if (room === "meeting") return "listening";
  if (room === "commons") return "seated";
  return working ? "typing" : "seated";
}

/** Scene state comes from authenticated reports; sample mode is explicit at the call site. */
export function sceneStateFor(
  actor: { robot: boolean; status?: string; last_seen?: string | null },
  presence: { room?: string; updated_at?: string | null } | undefined,
  { now = Date.now(), sample = false, working = false } = {},
) {
  const lastSeen = actor.robot ? actor.last_seen : presence?.updated_at;
  const online =
    sample ||
    (actor.status !== "offline" &&
      Boolean(lastSeen) &&
      now - Date.parse(lastSeen!) < 90_000);
  const room: Room =
    online &&
    ["office", "meeting", "library", "commons"].includes(presence?.room ?? "")
      ? (presence!.room as Room)
      : "office";
  const status = online ? (actor.status ?? "idle") : "offline";
  return {
    online,
    room,
    status,
    activity: interactionFor(
      room,
      status,
      online &&
        (actor.robot ? ["working", "thinking"].includes(status) : working),
    ),
  };
}
/** Atlas row and direction are separate from locomotion. This sheet has real seated/reading poses. */
export function humanPose(
  activity: Interaction | "walking",
  direction: number,
  frame: number,
) {
  const group = [12, 18, 6, 0][direction]; // left, down, up, right direction groups in the purchased atlas
  if (activity === "walking") return { x: (group + (frame % 6)) * 16, y: 64 };
  if (activity === "reading") return { x: (frame % 6) * 16, y: 224 };
  // The pack has side sitting rows only. North workstations use its actual back-facing
  // body behind the complete chair, as in the author's cubicle examples.
  if (direction === 2 && ["typing", "seated"].includes(activity))
    return { x: (6 + (frame % 6)) * 16, y: 32 };
  if (
    activity === "typing" ||
    activity === "seated" ||
    activity === "listening" ||
    activity === "speaking"
  )
    return {
      x: ((direction === 0 ? 6 : 0) + (frame % 6)) * 16,
      y: activity === "seated" ? 160 : 128,
    };
  return { x: (group + (frame % 6)) * 16, y: 32 };
}
