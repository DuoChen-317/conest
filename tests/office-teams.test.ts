import test from "node:test";
import assert from "node:assert/strict";
import { assignOffices, reserveRoomSeat } from "../src/office-teams.ts";
import { officeDestination, officeWalkable, findPath } from "../src/house.ts";

test("room occupants retain their chairs when another actor arrives or returns", () => {
  const seats = new Map<string, number>();
  assert.equal(reserveRoomSeat(seats, "pixel"), 0);
  assert.equal(reserveRoomSeat(seats, "alex"), 1);
  assert.equal(reserveRoomSeat(seats, "pixel"), 0);
  assert.equal(reserveRoomSeat(seats, "alex"), 1);
});

test("each person and AI gets a unique workstation across office pages", () => {
  const members = [{ id: "alice" }, { id: "bob" }, { id: "carol" }];
  const agents = Array.from({ length: 9 }, (_, i) => ({
    id: `ai-${i}`,
    owner_id: i < 7 ? "alice" : "bob",
  }));
  const offices = assignOffices(members, agents);
  const assigned = offices.flatMap((office) => office.actorIds);
  assert.deepEqual(
    assigned.slice().sort(),
    [...members, ...agents].map((a) => a.id).sort(),
  );
  assert.equal(new Set(assigned).size, assigned.length);
  assert.equal(
    offices.filter((office) => office.ownerId === "alice").length,
    4,
  );
  assert.deepEqual(offices.at(-1)?.actorIds, ["carol"]);

  const occupied = new Set<string>();
  offices.forEach((office, index) => {
    office.actorIds.forEach((id, seat) => {
      const target = officeDestination(
        "office",
        index % 3,
        0,
        id.startsWith("ai-"),
        seat,
      );
      const key = `${Math.floor(index / 3)}:${target.x}:${target.y}`;
      assert.ok(
        !occupied.has(key),
        "assistants cannot stack on another actor's chair",
      );
      occupied.add(key);
      assert.ok(officeWalkable(target.x, target.y));
      const route = findPath(
        officeDestination("library", 0, 0),
        target,
        officeWalkable,
      );
      assert.deepEqual(
        route.at(-1),
        target,
        "every assigned AI can return to its own chair",
      );
    });
  });
});

test("adding and removing assistants retains owner grouping without losing people", () => {
  const members = [{ id: "alice" }, { id: "bob" }];
  const agents = ["one", "two", "three"].map((id) => ({
    id,
    owner_id: "alice",
  }));
  assert.deepEqual(assignOffices(members, []), [
    { ownerId: "alice", actorIds: ["alice"], part: 1, parts: 1 },
    { ownerId: "bob", actorIds: ["bob"], part: 1, parts: 1 },
  ]);
  assert.deepEqual(assignOffices(members, agents).slice(0, 2), [
    { ownerId: "alice", actorIds: ["alice", "one"], part: 1, parts: 2 },
    { ownerId: "alice", actorIds: ["two", "three"], part: 2, parts: 2 },
  ]);
  assert.deepEqual(
    assignOffices(
      members,
      agents.filter((a) => a.id !== "two"),
    )[1].actorIds,
    ["three"],
  );
});
