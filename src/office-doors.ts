import { officeDoors } from "./office-layout";
import type { Point } from "./house";

export type OfficeDoor = (typeof officeDoors)[number];
export type DoorTransit = { door: OfficeDoor; direction: 1 | -1 };
export const doorEntryY = ({ door, direction }: DoorTransit) =>
  direction === 1 ? door.wallY - 4 : door.y + 34;
export const doorExitY = ({ door, direction }: DoorTransit) =>
  direction === 1 ? door.y + 34 : door.wallY - 4;
export const doorCleared = (transit: DoorTransit, point: Point) =>
  transit.direction * (point.y * 5.28 - doorExitY(transit)) >= -0.001;

/** Only a vertical route through a door may request it; corridor passers cannot. */
export function doorOnSegment(from: Point, to: Point): DoorTransit | undefined {
  if (Math.abs(from.x - to.x) > 0.0001 || from.y === to.y) return;
  const x = from.x * 5.76,
    a = from.y * 5.28,
    b = to.y * 5.28;
  const direction = b > a ? 1 : -1;
  const door = officeDoors
    .filter(
      (door) =>
        Math.abs(x - door.x) <= 3.01 &&
        ((Math.min(a, b) <= door.wallY + 0.001 &&
          Math.max(a, b) >= door.y - 0.001) ||
          (a >= door.wallY && a <= door.y && (b < door.wallY || b > door.y))),
    )
    .sort((a, b) => (a.wallY - b.wallY) * direction)[0];
  return door ? { door, direction } : undefined;
}

type DoorState = {
  frame: number;
  motion: number;
  closeAfter: number;
  actors: Set<string>;
  listeners: Set<(frame: number) => void>;
};

/** One clock per scene, with one reservation per actual traversing actor. */
export class OfficeDoorController {
  private now = 0;
  private states = new Map<string, DoorState>();
  private state(id: string) {
    let state = this.states.get(id);
    if (!state) {
      state = {
        frame: 0,
        motion: 0,
        closeAfter: 0,
        actors: new Set(),
        listeners: new Set(),
      };
      this.states.set(id, state);
    }
    return state;
  }
  frame(id: string) {
    return this.state(id).frame;
  }
  request(id: string, actor: string) {
    this.state(id).actors.add(actor);
  }
  releaseActor(actor: string) {
    for (const state of this.states.values())
      if (state.actors.delete(actor) && !state.actors.size)
        state.closeAfter = this.now + 450;
  }
  subscribe(id: string, listener: (frame: number) => void) {
    const state = this.state(id);
    state.listeners.add(listener);
    listener(state.frame);
    return () => {
      state.listeners.delete(listener);
    };
  }
  advance(elapsed: number) {
    const previousTime = this.now;
    this.now += elapsed;
    for (const state of this.states.values()) {
      const target = state.actors.size
        ? 4
        : this.now >= state.closeAfter
          ? 0
          : state.frame;
      if (state.frame === target) {
        state.motion = 0;
        continue;
      }
      state.motion += state.actors.size
        ? elapsed
        : Math.max(0, this.now - Math.max(previousTime, state.closeAfter));
      while (state.motion >= 65 && state.frame !== target) {
        state.motion -= 65;
        state.frame += Math.sign(target - state.frame);
        for (const listener of state.listeners) listener(state.frame);
      }
    }
  }
  reset() {
    for (const state of this.states.values()) {
      state.actors.clear();
      state.frame = 0;
      state.motion = 0;
      state.closeAfter = 0;
      for (const listener of state.listeners) listener(0);
    }
  }
}
