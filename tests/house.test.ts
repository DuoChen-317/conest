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
import {
  officeChairBases,
  meetingSeats,
  officeDoors as sceneDoors,
  officeWallBands,
  frontWalls,
} from "../src/office-layout.ts";

test("doors share their wall's floor baseline and all room faces use one native tile-pair height", () => {
  for (const door of sceneDoors) {
    const band = officeWallBands.find((wall) => wall.y === door.wallY);
    assert.ok(band);
    assert.equal(
      door.y,
      band.y + band.height,
      `${door.id} must not float above or below its room's skirting`,
    );
  }
  assert.ok(frontWalls.every((wall) => wall.height === 48));
});

test("lateral corridor travel and meeting seats leave visible headroom below the wall", () => {
  for (const seat of meetingSeats) assert.ok(seat.y - 33 > 324);
  const route = findPath(
    officeDestination("office", 0, 0),
    officeDestination("library", 0, 0),
    officeWalkable,
  );
  assert.ok(route.length > 1);
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i];
    const insideApproach = sceneDoors
      .filter((door) => door.id.startsWith("office-"))
      .some(
        (door) =>
          Math.abs(a.x * 5.76 - door.x) <= 9 &&
          Math.abs(b.x * 5.76 - door.x) <= 9,
      );
    if (
      !insideApproach &&
      a.y === b.y &&
      a.x !== b.x &&
      a.y * 5.28 > 232 &&
      a.y * 5.28 < 276
    )
      assert.ok(
        a.y * 5.28 - 33 > 232,
        "heads cannot paint over the office wall during lateral travel",
      );
  }
});

test("chair bases block walking while leaving the seat's front approach clear", () => {
  for (const base of officeChairBases) {
    assert.equal(
      officeWalkable(
        (base.x + base.width / 2) / 5.76,
        (base.y + base.height / 2) / 5.28,
      ),
      false,
    );
    assert.equal(
      officeWalkable(
        (base.x + base.width / 2) / 5.76,
        (base.y + base.height + 4) / 5.28,
      ),
      true,
      "the seat can be approached from the front",
    );
  }
});

function assertClearPath(route: Point[], canWalk = walkable) {
  assert.ok(route.length > 1, "Every room must be reachable");
  for (let i = 0; i < route.length; i++) {
    const a = route[i - 1] ?? route[i],
      b = route[i];
    assert.ok(
      a.x === b.x || a.y === b.y,
      "Walks follow horizontal/vertical tiles",
    );
    const count = Math.ceil((Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) * 10);
    for (let step = 0; step <= count; step++)
      assert.ok(
        canWalk(
          a.x + ((b.x - a.x) * step) / Math.max(1, count),
          a.y + ((b.y - a.y) * step) / Math.max(1, count),
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

test("wall faces, jambs and side walls reserve room for the whole actor footprint", () => {
  const at = (x: number, y: number) => officeWalkable(x / 5.76, y / 5.28);
  for (const point of [
    [70, 187],
    [180, 190],
    [188, 160],
    [220, 360],
    [364, 430],
    [470, 330],
  ])
    assert.equal(
      at(point[0], point[1]),
      false,
      `the actor must clear the wall at ${point}`,
    );
  for (const [x, y] of [
    [116, 210],
    [292, 210],
    [472, 210],
    [60, 300],
    [292, 300],
    [452, 320],
  ]) {
    assert.equal(at(x, y), true, "door centers remain passable");
    assert.equal(at(x - 7, y), false, "feet cannot overlap the left jamb");
    assert.equal(at(x + 7, y), false, "feet cannot overlap the right jamb");
  }
});

test("retargeting a fractional position at a wall corner or doorway never cuts diagonally", () => {
  const starts = [
    [180, 181],
    [116, 225],
    [292, 275],
    [60, 320],
    [452, 340],
  ];
  for (const [x, y] of starts) {
    const start = { x: x / 5.76, y: y / 5.28 };
    assert.ok(officeWalkable(start.x, start.y));
    for (const room of ["meeting", "library", "commons"] as Room[]) {
      const end = officeDestination(room, 0, 0);
      const route = findPath(start, end, officeWalkable);
      assert.deepEqual(
        route[0],
        start,
        "the actual in-flight position must be part of the checked route",
      );
      assert.deepEqual(route.at(-1), end);
      assertClearPath(route, officeWalkable);
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
  assert.equal(
    at(292, 504),
    true,
    "the entrance passage reaches its threshold",
  );
  assert.equal(at(260, 460), false, "the entrance's side wall remains solid");
  assert.equal(at(470, 330), false, "the tall library wall blocks traversal");
  assertClearPath(
    findPath(
      { x: 292 / 5.76, y: 512 / 5.28 },
      officeDestination("library", 0, 0),
      officeWalkable,
    ),
    officeWalkable,
  );
});
