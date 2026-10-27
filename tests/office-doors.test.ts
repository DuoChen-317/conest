import test from "node:test";
import assert from "node:assert/strict";
import {
  OfficeDoorController,
  doorOnSegment,
  doorCleared,
  doorEntryY,
} from "../src/office-doors.ts";
import { findPath, officeDestination, officeWalkable } from "../src/house.ts";
const point = (x: number, y: number) => ({ x: x / 5.76, y: y / 5.28 });

test("only an actual through-door segment requests opening; passing nearby or stopping short does not", () => {
  assert.equal(doorOnSegment(point(40, 269), point(530, 269)), undefined);
  assert.equal(doorOnSegment(point(116, 150), point(116, 175)), undefined);
  assert.equal(doorOnSegment(point(100, 150), point(100, 270)), undefined);
  const route = findPath(
    officeDestination("office", 0, 0),
    officeDestination("meeting", 0, 1),
    officeWalkable,
  );
  const passages = route.flatMap((p, i) =>
    i ? (doorOnSegment(route[i - 1], p) ?? []) : [],
  );
  assert.deepEqual(
    passages.map((p) => p.door.id),
    ["office-0", "meeting"],
  );
  const entry = passages[0];
  assert.equal(doorEntryY(entry), 180);
  assert.equal(
    doorCleared(entry, point(116, 240)),
    false,
    "keep open while the body still overlaps the frame",
  );
  assert.equal(doorCleared(entry, point(116, 266)), true);
});

test("aligned doors are encountered in travel order in both directions, including a resumed passage", () => {
  assert.equal(
    doorOnSegment(point(292, 148), point(292, 434))?.door.id,
    "office-1",
  );
  assert.equal(
    doorOnSegment(point(292, 266), point(292, 434))?.door.id,
    "commons",
  );
  assert.equal(
    doorOnSegment(point(292, 434), point(292, 148))?.door.id,
    "commons",
  );
  assert.equal(
    doorOnSegment(point(292, 272), point(292, 148))?.door.id,
    "office-1",
  );
  assert.equal(
    doorOnSegment(point(60, 300), point(60, 269))?.door.id,
    "meeting",
  );
});

test("doors start closed, play all source frames, wait for the entire passage, then close", () => {
  const doors = new OfficeDoorController();
  const frames: number[] = [];
  const unsubscribe = doors.subscribe("meeting", (frame) => frames.push(frame));
  doors.advance(10_000);
  assert.deepEqual(frames, [0]);
  doors.request("meeting", "alex");
  for (let i = 0; i < 4; i++) doors.advance(65);
  assert.deepEqual(frames, [0, 1, 2, 3, 4]);
  doors.advance(5000);
  assert.equal(
    doors.frame("meeting"),
    4,
    "an active passage cannot close on its actor",
  );
  doors.releaseActor("alex");
  doors.advance(400);
  assert.equal(doors.frame("meeting"), 4);
  for (let i = 0; i < 5; i++) doors.advance(65);
  assert.deepEqual(frames, [0, 1, 2, 3, 4, 3, 2, 1, 0]);
  assert.equal(doors.frame("library"), 0, "unrelated doors stay closed");
  unsubscribe();
});

test("multiple actors hold one door; reversal and cancellation recover without leaving it open", () => {
  const doors = new OfficeDoorController();
  doors.request("meeting", "alex");
  doors.request("meeting", "atlas");
  doors.advance(260);
  doors.releaseActor("alex");
  doors.advance(1000);
  assert.equal(doors.frame("meeting"), 4);
  doors.releaseActor("atlas");
  doors.advance(450);
  doors.advance(65);
  assert.ok(doors.frame("meeting") < 4);
  doors.request("meeting", "pixel");
  doors.advance(260);
  assert.equal(doors.frame("meeting"), 4);
  doors.releaseActor("pixel");
  doors.advance(1000);
  assert.equal(doors.frame("meeting"), 0);
  doors.request("meeting", "alex");
  doors.advance(130);
  doors.reset();
  assert.equal(
    doors.frame("meeting"),
    0,
    "reduced motion clears pending animation",
  );
});
