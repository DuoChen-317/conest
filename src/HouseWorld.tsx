import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  ArrowsOut,
  ArrowsIn,
  Plus,
  Minus,
  Pause,
  Play,
  Crosshair,
  DoorOpen,
  Books,
  UsersThree,
  HouseLine,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import { tr, useLocale } from "./i18n";
import {
  destination,
  findPath,
  officeWalkable,
  officeDestination,
  officeFacing,
  officeWorld,
  walkable,
  roomNames,
  type Point,
  type Room,
} from "./house";
import type { Item } from "./api";
import { useSceneAssets } from "./scene-assets";
import OfficeScene from "./OfficeScene";
import { officeDepth } from "./office-layout";
import { assignOffices, reserveRoomSeat } from "./office-teams";
import { demoPhaseAt, demoRoomFor } from "./demo-scene";
import {
  OfficeDoorController,
  doorOnSegment,
  doorEntryY,
  doorCleared,
  type DoorTransit,
} from "./office-doors";
import ResidentAnimation from "./ResidentAnimation";
import RobotSprite from "./RobotSprite";
import {
  sceneStateFor,
  interactionNames,
  type Interaction,
} from "./interaction";

export function SceneSprite({
  robot = false,
  skin = 0,
  frame = 0,
  direction = 1,
  size = 64,
  activity = "idle",
  walking = false,
  paused = false,
  reduced = false,
  speakingUntil = 0,
}: {
  robot?: boolean;
  skin?: number;
  frame?: number;
  direction?: number;
  size?: number;
  activity?: Interaction;
  walking?: boolean;
  paused?: boolean;
  reduced?: boolean;
  speakingUntil?: number;
}) {
  const assets = useSceneAssets();
  const nativeRobot =
    robot && assets?.robots.length
      ? assets.robots[skin % assets.robots.length]
      : undefined;
  if (assets && (!robot || nativeRobot))
    return (
      <ResidentAnimation
        assets={assets}
        character={nativeRobot}
        skin={skin}
        activity={activity}
        direction={direction}
        walkFrame={frame}
        size={size}
        walking={walking}
        paused={paused}
        reduced={reduced}
        speakingUntil={speakingUntil}
      />
    );
  if (robot)
    return (
      <RobotSprite
        {...{
          skin,
          activity,
          direction,
          walkFrame: frame,
          size,
          walking,
          paused,
          reduced,
          speakingUntil,
        }}
      />
    );
  return (
    <span
      className="scene-sprite"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="scene-sprite-inner"
        style={{ transform: `scale(${size / 64})` }}
      >
        <span
          className="human-frame"
          style={{
            backgroundPosition: `${((23 + direction) / 26) * 100}% ${(((skin % 6) * 3 + frame) / 17) * 100}%`,
          }}
        />
      </span>
    </span>
  );
}
type Resident = {
  id: string;
  name: string;
  robot: boolean;
  skin: number;
  ownerId: string;
  office: number;
  officePage: number;
  room: Room;
  status: string;
  model?: string;
  goal: Point;
  activity: Interaction;
  speakingUntil: number;
  facing?: number;
  self?: boolean;
};
function Walker({
  resident,
  paused,
  reduced,
  doors,
}: {
  resident: Resident;
  paused: boolean;
  reduced: boolean;
  doors: OfficeDoorController;
}) {
  const assets = useSceneAssets();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    const remaining = resident.speakingUntil - Date.now();
    setSpeaking(remaining > 0);
    if (remaining > 0) {
      const timer = setTimeout(() => setSpeaking(false), remaining);
      return () => clearTimeout(timer);
    }
  }, [resident.speakingUntil]);
  const interaction =
    speaking && resident.room === "meeting" ? "speaking" : resident.activity;
  const node = useRef<HTMLDivElement>(null);
  const current = useRef<Point>(resident.goal);
  const coordinateSystem = useRef(Boolean(assets));
  const [walking, setWalking] = useState(false),
    [waitingForDoor, setWaitingForDoor] = useState(false),
    [frame, setFrame] = useState(0),
    [direction, setDirection] = useState(resident.room === "office" ? 2 : 1);
  const frameRef = useRef(0);
  useEffect(() => {
    let transit: DoorTransit | undefined;
    const place = (p: Point) => {
      current.current = p;
      if (transit && doorCleared(transit, p)) {
        doors.releaseActor(resident.id);
        transit = undefined;
      }
      if (node.current) {
        node.current.style.left = `${p.x}%`;
        node.current.style.top = `${p.y}%`;
        node.current.style.zIndex = String(
          assets ? officeDepth(p.y * 5.28) : Math.round(p.y) + 5,
        );
      }
    };
    if (
      reduced ||
      resident.status === "offline" ||
      (current.current.x === resident.goal.x &&
        current.current.y === resident.goal.y) ||
      coordinateSystem.current !== Boolean(assets)
    ) {
      coordinateSystem.current = Boolean(assets);
      place(resident.goal);
      setWalking(false);
      setWaitingForDoor(false);
      setFrame(0);
      setDirection(resident.facing ?? (resident.room === "office" ? 2 : 1));
      return;
    }
    if (paused) {
      setWalking(false);
      return;
    }
    const canWalk = assets ? officeWalkable : walkable;
    const route = findPath(current.current, resident.goal, canWalk);
    // Recover an old/invalid anchor without animating a straight line through a wall.
    if (!canWalk(current.current.x, current.current.y) && route[0])
      place(route[0]);
    let next = 0,
      last = 0,
      tick = 0,
      animation = 0;
    setWalking(route.length > 1);
    const move = (now: number) => {
      const elapsed = last ? Math.min(now - last, 64) : 0;
      last = now;
      let remaining = elapsed * 0.22;
      while (next < route.length) {
        let target = route[next];
        let gate = false;
        const passage = assets
          ? doorOnSegment(current.current, target)
          : undefined;
        if (passage && !transit) {
          const entry = doorEntryY(passage) / 5.28;
          if (passage.direction * (current.current.y - entry) >= -0.0001) {
            transit = passage;
            doors.request(passage.door.id, resident.id);
          } else if (passage.direction * (target.y - entry) > 0) {
            target = { x: target.x, y: entry };
            gate = true;
          }
        }
        if (transit && doors.frame(transit.door.id) < 4) {
          setWalking(false);
          setWaitingForDoor(true);
          setFrame(0);
          setDirection(transit.direction === 1 ? 1 : 2);
          animation = requestAnimationFrame(move);
          return;
        }
        setWalking(true);
        setWaitingForDoor(false);
        const dx =
            (target.x - current.current.x) *
            (assets ? officeWorld.width / 100 : 15.36),
          dy =
            (target.y - current.current.y) *
            (assets ? officeWorld.height / 100 : 10.24);
        const distance = Math.hypot(dx, dy);
        if (distance <= remaining || distance < 0.1) {
          place(target);
          remaining -= distance;
          if (!gate) next++;
          continue;
        }
        setDirection(
          Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 3) : dy < 0 ? 2 : 1,
        );
        place({
          x:
            current.current.x +
            ((target.x - current.current.x) * remaining) / distance,
          y:
            current.current.y +
            ((target.y - current.current.y) * remaining) / distance,
        });
        break;
      }
      if (next >= route.length) {
        setWalking(false);
        setWaitingForDoor(false);
        setFrame(0);
        setDirection(
          resident.facing ??
            (resident.room === "office"
              ? 2
              : resident.room === "meeting" && resident.goal.y > 65
                ? 2
                : 1),
        );
        return;
      }
      tick += elapsed;
      const pose =
        Math.floor(tick / 120) %
        (assets && (!resident.robot || assets.robots.length)
          ? 6
          : resident.robot
            ? 4
            : 3);
      if (frameRef.current !== pose) {
        frameRef.current = pose;
        setFrame(pose);
      }
      animation = requestAnimationFrame(move);
    };
    animation = requestAnimationFrame(move);
    return () => {
      cancelAnimationFrame(animation);
      doors.releaseActor(resident.id);
    };
  }, [
    resident.goal.x,
    resident.goal.y,
    resident.room,
    resident.facing,
    resident.robot,
    resident.status,
    paused,
    reduced,
    assets,
    doors,
    resident.id,
  ]);
  return (
    <div
      ref={node}
      role="img"
      className={`house-resident ${speaking ? "speaking" : ""} ${resident.status === "offline" ? "disconnected" : ""}`}
      style={{
        left: `${current.current.x}%`,
        top: `${current.current.y}%`,
        zIndex: assets
          ? officeDepth(current.current.y * 5.28)
          : Math.round(current.current.y) + 5,
        width: assets ? 96 : 64,
        height: assets ? 96 : 64,
      }}
      data-resident={resident.id}
      data-self={resident.self || undefined}
      data-room={resident.room}
      data-walking={walking}
      data-action={
        waitingForDoor ? "waiting-door" : walking ? "walking" : interaction
      }
      aria-label={tr("{name}：{activity}", {
        name: resident.name,
        activity: tr(
          resident.status === "offline"
            ? "未连接"
            : waitingForDoor
              ? "等待开门"
              : walking
                ? "正在沿走廊移动"
                : interactionNames[interaction],
        ),
      })}
    >
      <SceneSprite
        robot={resident.robot}
        skin={resident.skin}
        frame={frame}
        direction={direction}
        size={assets ? 96 : 64}
        activity={waitingForDoor ? "idle" : interaction}
        walking={walking}
        paused={paused}
        reduced={reduced}
        speakingUntil={resident.speakingUntil}
      />
      <span className="house-name">
        {resident.name}
        <i className={resident.status === "offline" ? "offline" : ""} />
      </span>
      {speaking && (
        <span className="house-thought">
          {walking
            ? tr("正在前往 {room}", { room: tr(roomNames[resident.room]) })
            : tr(interactionNames[interaction])}
        </span>
      )}
    </div>
  );
}
export default function HouseWorld({
  data,
  ownId,
  demo,
  compact = false,
  ownWorking = false,
  recentMessages = [],
}: {
  data: Item;
  ownId: string;
  demo: boolean;
  compact?: boolean;
  ownWorking?: boolean;
  recentMessages?: Item[];
}) {
  useLocale();
  const assets = useSceneAssets();
  const doors = useMemo(() => new OfficeDoorController(), [data.project.id]);
  const worldWidth = assets ? officeWorld.width : 1536;
  const worldHeight = assets ? officeWorld.height : 1024;
  const offices = useMemo(
    () => assignOffices(data.members, data.agents),
    [data.members, data.agents],
  );
  useEffect(() => {
    if (assets) setSceneReady(true);
  }, [assets]);
  const viewport = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; pan: Point } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 580 }),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState<Point>({ x: 0, y: 0 }),
    [expanded, setExpanded] = useState(false),
    [paused, setPaused] = useState(false),
    [reduced, setReduced] = useState(false),
    [page, setPage] = useState(0);
  const [demoPhase, setDemoPhase] = useState(0);
  const demoElapsed = useRef(0);
  useEffect(() => {
    if (!demo || !assets || paused || reduced) return;
    let animation = 0;
    let last = performance.now();
    let phase = demoPhaseAt(demoElapsed.current);
    const tick = (now: number) => {
      // Hidden tabs suspend playback instead of skipping destinations on return.
      demoElapsed.current += Math.min(now - last, 100);
      last = now;
      const next = demoPhaseAt(demoElapsed.current);
      if (next !== phase) {
        phase = next;
        setDemoPhase(next);
      }
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [demo, assets, paused, reduced]);
  const visibleOffices = offices.slice(page * 3, page * 3 + 3);
  const [sceneReady, setSceneReady] = useState(false);
  useEffect(() => {
    const mobile = dimensions.width < 600 && !compact && !expanded;
    const factor = compact && !expanded ? 1.85 : mobile ? 1.6 : 1;
    const fit =
      Math.min(dimensions.width / worldWidth, dimensions.height / worldHeight) *
      factor;
    setZoom(factor);
    setPan({
      x: mobile
        ? Math.max(
            -Math.max(0, (worldWidth * fit - dimensions.width) / 2),
            Math.min(
              Math.max(0, (worldWidth * fit - dimensions.width) / 2),
              (50 -
                [18.5, 50, 80.8][
                  Math.max(
                    0,
                    offices.findIndex((office) => office.ownerId === ownId),
                  ) % 3
                ]) *
                (worldWidth / 100) *
                fit,
            ),
          )
        : 0,
      y:
        compact && !expanded
          ? -Math.min(
              Math.max(0, (worldHeight * fit - dimensions.height) / 2),
              123 * fit,
            )
          : 0,
    });
  }, [
    compact,
    expanded,
    dimensions.width,
    dimensions.height,
    worldWidth,
    worldHeight,
  ]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    setPage(
      Math.floor(
        Math.max(
          0,
          offices.findIndex((office) => office.ownerId === ownId),
        ) / 3,
      ),
    );
  }, [data.project.id, ownId]);
  useEffect(() => {
    setPage((current) =>
      Math.min(current, Math.max(0, Math.ceil(offices.length / 3) - 1)),
    );
  }, [offices.length]);
  const roomSeats = useMemo(
    () => new Map<Room, Map<string, number>>(),
    [data.project.id],
  );
  const residents = useMemo(() => {
    const actorIds = new Set(
      [...data.members, ...data.agents].map((actor: Item) => actor.id),
    );
    for (const seats of roomSeats.values())
      for (const actorId of seats.keys())
        if (!actorIds.has(actorId)) seats.delete(actorId);
    return [
      ...data.members.map((m: Item, i: number) => ({
        ...m,
        robot: false,
        ownerId: m.id,
        skin: i,
      })),
      ...data.agents.map((a: Item, i: number) => ({
        ...a,
        robot: true,
        ownerId: a.owner_id,
        skin: i,
      })),
    ]
      .map((r: Item) => {
        const officeIndex = offices.findIndex((office) =>
          office.actorIds.includes(r.id),
        );
        const office = Math.max(0, officeIndex) % 3;
        const seatIndex = Math.max(
          0,
          offices[officeIndex]?.actorIds.indexOf(r.id) ?? 0,
        );
        const reportedPresence = data.presence?.find(
          (p: Item) =>
            p.actor_id === r.id &&
            p.actor_type === (r.robot ? "agent" : "human"),
        );
        const sampleRoom = demo ? demoRoomFor(r.id, demoPhase) : undefined;
        const presence = sampleRoom
          ? { ...reportedPresence, room: sampleRoom }
          : reportedPresence;
        const { room, status, activity } = sceneStateFor(
          { robot: r.robot, last_seen: r.last_seen, status: r.status },
          presence,
          { sample: demo, working: r.id === ownId && ownWorking },
        );
        if (!roomSeats.has(room)) roomSeats.set(room, new Map());
        const count = reserveRoomSeat(roomSeats.get(room)!, r.id);
        return {
          ...r,
          office,
          officePage: Math.floor(officeIndex / 3),
          self: r.id === ownId,
          room,
          status,
          activity,
          speakingUntil: Math.max(
            0,
            ...recentMessages
              .filter((m: Item) => m.actor_id === r.id && m.meeting_id)
              .map((m: Item) => Date.parse(m.created_at) + 8000),
          ),
          facing: assets
            ? officeFacing(room, office, count, r.robot, seatIndex)
            : undefined,
          goal: assets
            ? officeDestination(room, office, count, r.robot, seatIndex)
            : destination(
                room,
                office,
                count,
                room === "office" ? seatIndex === 1 : r.robot,
              ),
        } as Resident;
      })
      .filter((r: Resident) => r.room !== "office" || r.officePage === page);
  }, [
    data.members,
    data.agents,
    data.presence,
    page,
    demo,
    demoPhase,
    ownId,
    ownWorking,
    recentMessages,
    assets,
    offices,
    roomSeats,
  ]);
  const scale =
    Math.min(dimensions.width / worldWidth, dimensions.height / worldHeight) *
    zoom;
  const limit = (p: Point): Point => ({
    x: Math.max(
      -Math.max(0, (worldWidth * scale - dimensions.width) / 2),
      Math.min(Math.max(0, (worldWidth * scale - dimensions.width) / 2), p.x),
    ),
    y: Math.max(
      -Math.max(0, (worldHeight * scale - dimensions.height) / 2),
      Math.min(Math.max(0, (worldHeight * scale - dimensions.height) / 2), p.y),
    ),
  });
  useEffect(() => {
    setPan((p) => limit(p));
  }, [scale, dimensions.width, dimensions.height]);
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button") || zoom === 1) return;
    drag.current = { x: event.clientX, y: event.clientY, pan };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  return (
    <section
      className={`house-world ${assets ? "licensed" : ""} ${compact && !expanded ? "compact" : ""} ${expanded ? "expanded" : ""}`}
      aria-label={tr("共享办公室场景")}
    >
      <header className="house-toolbar">
        <div>
          <HouseLine size={18} />
          <h2>{tr("共享办公室")}</h2>
          <span>
            {tr("{count} 位伙伴 · {agents} 个 AI", {
              count: data.members.length,
              agents: data.agents.length,
            })}
          </span>
        </div>
        <div className="house-controls">
          <button
            className="icon-button"
            aria-label={tr("缩小场景")}
            onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
            disabled={zoom <= 1}
          >
            <Minus size={17} />
          </button>
          <span className="house-zoom">{Math.round(zoom * 100)}%</span>
          <button
            className="icon-button"
            aria-label={tr("放大场景")}
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            disabled={zoom >= 3}
          >
            <Plus size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={tr("显示完整办公室")}
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            <Crosshair size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={tr(paused ? "继续场景动画" : "暂停场景动画")}
            aria-pressed={paused}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            className="icon-button"
            aria-label={tr(expanded ? "收起场景" : "展开场景")}
            aria-pressed={expanded}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <ArrowsIn size={17} /> : <ArrowsOut size={17} />}
          </button>
        </div>
      </header>
      <div
        ref={viewport}
        className="house-viewport"
        style={{ touchAction: zoom > 1 ? "none" : "pan-y" }}
        onPointerDown={pointerDown}
        onPointerMove={(event) => {
          if (drag.current)
            setPan(
              limit({
                x: drag.current.pan.x + event.clientX - drag.current.x,
                y: drag.current.pan.y + event.clientY - drag.current.y,
              }),
            );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          className="house-floor"
          style={
            {
              width: worldWidth,
              height: worldHeight,
              transform: `translate(-50%,-50%) translate(${pan.x}px,${pan.y}px) scale(${scale})`,
              "--house-label-size": `${Math.min(60, 11 / scale)}px`,
            } as React.CSSProperties
          }
        >
          {assets ? (
            <OfficeScene
              assets={assets}
              doors={doors}
              paused={paused}
              reduced={reduced}
            />
          ) : (
            <img
              className="house-background"
              src="/assets/shared-house.png"
              onLoad={() => setSceneReady(true)}
              alt={tr(
                "蓝灰色办公室平面图：三间专属办公室通过走廊连接会议室、资料室和接待区",
              )}
              draggable={false}
            />
          )}
          {visibleOffices.map((office, i) => {
            const member = data.members.find(
              (m: Item) => m.id === office.ownerId,
            )!;
            const label =
              office.parts > 1
                ? tr("{name} 的办公室 · {index}/{count}", {
                    name: member.name,
                    index: office.part,
                    count: office.parts,
                  })
                : tr("{name} 的办公室", { name: member.name });
            return (
              <div
                key={`${member.id}-${office.part}`}
                className={`house-room office-${i} ${member.id === ownId ? "mine" : ""}`}
                style={{
                  left: assets
                    ? `${[162, 338, 518][i] / 5.76}%`
                    : `${[18.5, 50, 80.8][i]}%`,
                  top: assets ? `${208 / 5.28}%` : "29%",
                }}
                aria-label={label}
              >
                <DoorOpen size={22} />
                <span>
                  {office.parts > 1
                    ? `${member.name} · ${office.part}/${office.parts}`
                    : label}
                </span>
                {member.id === ownId && <small>{tr("我的")}</small>}
              </div>
            );
          })}
          <div
            className="house-room"
            style={{
              left: assets ? `${112 / 5.76}%` : "23.7%",
              top: assets ? `${285 / 5.28}%` : "51.5%",
            }}
          >
            <UsersThree size={22} />
            {tr("会议室")}
          </div>
          <div
            className="house-room"
            style={{
              left: assets ? `${508 / 5.76}%` : "77.6%",
              top: assets ? `${285 / 5.28}%` : "51.5%",
            }}
          >
            <Books size={22} />
            {tr("资料室")}
          </div>
          <div
            className="house-room"
            style={{
              left: assets ? `${330 / 5.76}%` : "50%",
              top: assets ? `${483 / 5.28}%` : "83%",
            }}
          >
            <HouseLine size={22} />
            {tr("接待区")}
          </div>
          {residents.map((resident: Resident) => (
            <Walker
              key={resident.id}
              resident={resident}
              paused={paused}
              reduced={reduced}
              doors={doors}
            />
          ))}
        </div>
        {!sceneReady && (
          <div className="house-scene-loading" role="status">
            <HouseLine size={22} />
            {tr("正在加载办公室场景…")}
          </div>
        )}
      </div>
      <footer className="house-footer">
        {assets && (
          <small className="scene-credit">
            Art ·{" "}
            <a href="https://limezu.itch.io/" target="_blank" rel="noreferrer">
              LimeZu
            </a>
          </small>
        )}
        <span>
          {tr(
            demo
              ? "自动演示 · 人物按示例状态移动"
              : zoom > 1
                ? "拖动查看 · 状态自动同步"
                : "人物与 AI 状态自动同步",
          )}
        </span>
        {offices.length > 3 && (
          <div>
            <button
              className="icon-button"
              aria-label={tr("上一组办公室")}
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <CaretLeft size={16} />
            </button>
            <span>
              {page * 3 + 1}–{Math.min(page * 3 + 3, offices.length)} /{" "}
              {offices.length}
            </span>
            <button
              className="icon-button"
              aria-label={tr("下一组办公室")}
              disabled={(page + 1) * 3 >= offices.length}
              onClick={() => setPage((p) => p + 1)}
            >
              <CaretRight size={16} />
            </button>
          </div>
        )}
        <button
          className="text-button"
          onClick={() => {
            const index = Math.max(
              0,
              offices.findIndex((office) => office.ownerId === ownId),
            );
            setPage(Math.floor(index / 3));
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          <DoorOpen size={15} />
          {tr("查看我的办公室")}
        </button>
      </footer>
    </section>
  );
}
