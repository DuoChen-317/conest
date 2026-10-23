import test from "node:test";
import assert from "node:assert/strict";
import {
  destination,
  findPath,
  walkable,
  type Point,
  type Room,
} from "../src/house.ts";

function assertClearPath(route: Point[]) {
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
        walkable(
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
