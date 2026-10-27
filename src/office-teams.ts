/** A member may occupy several two-seat offices with their AI assistants. */
export type OfficeTeam = {
  ownerId: string;
  actorIds: string[];
  part: number;
  parts: number;
};

export function assignOffices(
  members: { id: string }[],
  agents: { id: string; owner_id: string }[],
): OfficeTeam[] {
  return members.flatMap((member) => {
    const actors = [
      member.id,
      ...agents
        .filter((agent) => agent.owner_id === member.id)
        .map((agent) => agent.id),
    ];
    const parts = Math.ceil(actors.length / 2);
    return Array.from({ length: parts }, (_, part) => ({
      ownerId: member.id,
      actorIds: actors.slice(part * 2, part * 2 + 2),
      part: part + 1,
      parts,
    }));
  });
}

/** Keep an existing resident in place when somebody enters or leaves the room. */
export function reserveRoomSeat(seats: Map<string, number>, actorId: string) {
  const existing = seats.get(actorId);
  if (existing !== undefined) return existing;
  const used = new Set(seats.values());
  let seat = 0;
  while (used.has(seat)) seat++;
  seats.set(actorId, seat);
  return seat;
}
