import test from "node:test";
import assert from "node:assert/strict";
import {
  destination,
  findPath,
  walkable,
  officeWalkable,
  officeDestination,
  type Point,
  type Room,
} from "../src/house.ts";

function assertClearPath(route: Point[], canWalk = walkable) {
  assert.ok(route.length > 1, "Every room must be reachable");
  for (let i = 0; i < route.length; i++) {
    const a = route[i - 1] ?? route[i],
      b = route[i];
    assert.ok(
      a.x === b.x || a.y === b.y,
      "Walks follow horizontal/vertical tiles",
    );
    const count = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    for (let step = 0; step <= count; step++)
      assert.ok(
        canWalk(
          a.x + Math.sign(b.x - a.x) * step,
          a.y + Math.sign(b.y - a.y) * step,
        ),
        `Path crossed a wall or the conference table at segment ${i}`,
      );
  }
}
test("people and robots use real doorways and corridors to reach meeting chairs and archive aisles", () => {
  for (let office = 0; office < 3; office++)
    for (const robot of [false, true]) {
      const home = destination("office", office, 0, robot);
      for (const room of ["meeting", "library", "commons"] as Room[]) {
        const target = destination(
          room,
          office,
          office * 2 + Number(robot),
          robot,
        );
        const path = findPath(home, target);
        assertClearPath(path);
        assert.ok(
          path.some(
            (p, i) =>
              Math.min(p.y, (path[i - 1] ?? p).y) <= 42 &&
              Math.max(p.y, (path[i - 1] ?? p).y) >= 40,
          ),
          "Travel must use the central corridor",
        );
        assert.ok(
          Math.hypot(path.at(-1)!.x - target.x, path.at(-1)!.y - target.y) < 1,
        );
        assertClearPath(findPath(target, home));
      }
    }
});
test("routes between the meeting table and library never cut through the table or shared wall", () => {
  for (let seat = 0; seat < 8; seat++)
    assertClearPath(
      findPath(
        destination("meeting", 0, seat),
        destination("library", 0, seat),
      ),
    );
  assert.equal(walkable(22, 65), false);
  assert.equal(walkable(60, 65), false);
  assert.equal(walkable(34, 25), false);
});

test("licensed furniture leaves reachable workstations and an archive aisle without walking through shelves", () => {
  for (let office = 0; office < 3; office++)
    for (const robot of [false, true]) {
      const home = officeDestination("office", office, 0, robot);
      assert.ok(
        officeWalkable(home.x, home.y),
        `office ${office + 1} ${robot ? "AI" : "human"} seat must not be blocked by furniture`,
      );
      for (const room of ["meeting", "library", "commons"] as Room[]) {
        const target = officeDestination(
          room,
          office,
          office * 2 + Number(robot),
          robot,
        );
        const path = findPath(home, target, officeWalkable);
        assertClearPath(path, officeWalkable);
        assert.deepEqual(
          path.at(-1),
          target,
          "arrival must use the exact chair/reading anchor, not a nearby grid tile",
        );
        const returnPath = findPath(target, home, officeWalkable);
        assertClearPath(returnPath, officeWalkable);
        assert.deepEqual(
          returnPath.at(-1),
          home,
          "returning home must reach the exact seat, not the nearest unblocked tile",
        );
      }
    }
  for (let seat = 0; seat < 8; seat++) {
    const meeting = officeDestination("meeting", 0, seat);
    const archive = officeDestination("library", 0, seat);
    assertClearPath(findPath(meeting, archive, officeWalkable), officeWalkable);
    assert.deepEqual(
      findPath(archive, meeting, officeWalkable).at(-1),
      meeting,
    );
    assert.ok(officeWalkable(meeting.x, meeting.y));
    assert.ok(officeWalkable(archive.x, archive.y));
  }
  assert.equal(
    officeWalkable(23, 77),
    false,
    "the conference table blocks traversal",
  );
  assert.equal(
    officeWalkable(70, 65),
    false,
    "a real shelf occupies this floor point",
  );
  assert.equal(officeWalkable(78.5, 65), true, "the shelf aisle remains clear");
  assert.equal(
    officeWalkable(413 / 5.76, 160 / 5.28),
    false,
    "the cabinet beside Nova still blocks traversal through its real footprint",
  );
});

// Physical wall depth must stay reserved when furniture/doors are rearranged.
test("full front walls block walking except at connected door passages", () => {
  const at = (x: number, y: number) => officeWalkable(x / 5.76, y / 5.28);
  for (const x of [70, 180, 240, 350, 420, 530])
    assert.equal(at(x, 210), false, "the front wall has a solid footprint");
  for (const x of [116, 292, 472]) {
    assert.equal(at(x, 210), true, "doorways cross the whole wall depth");
    assert.equal(
      at(x, 250),
      true,
      "the corridor is clear outside every office",
    );
  }
  assert.equal(at(104, 210), false, "office door jamb is not a passage");
  assert.equal(at(48, 300), false, "meeting door jamb is not a passage");
  assert.equal(
    at(60, 300),
    true,
    "the complete lower door's inner passage stays open",
  );
  assert.equal(at(450, 395), false, "reading table blocks its real footprint");
  assert.equal(at(530, 410), false, "the loaded archive cart blocks traversal");
  assert.equal(at(260, 410), false, "the complete sofa blocks traversal");
  assert.equal(at(292, 434), true, "the reception entry axis stays clear");
});
