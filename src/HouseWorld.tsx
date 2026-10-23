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
  Monitor,
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
import { officeSeats } from "./office-layout";
import ResidentAnimation from "./ResidentAnimation";
import RobotSprite from "./RobotSprite";
import {
  interactionFor,
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
  selected,
  select,
}: {
  resident: Resident;
  paused: boolean;
  reduced: boolean;
  selected: boolean;
  select: () => void;
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
  const node = useRef<HTMLButtonElement>(null);
  const current = useRef<Point>(
    destination("office", resident.office, resident.skin, resident.robot),
  );
  const [walking, setWalking] = useState(false),
    [frame, setFrame] = useState(0),
    [direction, setDirection] = useState(resident.room === "office" ? 2 : 1);
  const frameRef = useRef(0);
  useEffect(() => {
    const place = (p: Point) => {
      current.current = p;
      if (node.current) {
        node.current.style.left = `${p.x}%`;
        node.current.style.top = `${p.y}%`;
        node.current.style.zIndex = String(Math.round(p.y) + (assets ? 0 : 5));
      }
    };
    if (reduced) {
      place(resident.goal);
      setWalking(false);
      setFrame(0);
      setDirection(resident.facing ?? (resident.room === "office" ? 2 : 1));
      return;
    }
    if (paused) return;
    const route = findPath(
      current.current,
      resident.goal,
      assets ? officeWalkable : walkable,
    );
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
        const target = route[next],
          dx =
            (target.x - current.current.x) *
            (assets ? officeWorld.width / 100 : 15.36),
          dy =
            (target.y - current.current.y) *
            (assets ? officeWorld.height / 100 : 10.24);
        const distance = Math.hypot(dx, dy);
        if (distance <= remaining || distance < 0.1) {
          place(target);
          remaining -= distance;
          next++;
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
    return () => cancelAnimationFrame(animation);
  }, [
    resident.goal.x,
    resident.goal.y,
    resident.room,
    resident.facing,
    resident.robot,
    paused,
    reduced,
    assets,
  ]);
  return (
    <button
      ref={node}
      type="button"
      className={`house-resident ${selected ? "selected" : ""} ${speaking ? "speaking" : ""} ${resident.status === "offline" ? "disconnected" : ""}`}
      style={{
        left: `${current.current.x}%`,
        top: `${current.current.y}%`,
        zIndex: Math.round(current.current.y) + (assets ? 0 : 5),
        width: assets ? 96 : 64,
        height: assets ? 96 : 64,
      }}
      onClick={select}
      data-resident={resident.id}
      data-self={resident.self || undefined}
      data-room={resident.room}
      data-walking={walking}
      data-action={walking ? "walking" : interaction}
      aria-label={tr("查看 {name}：{activity}", {
        name: resident.name,
        activity: tr(
          walking ? "正在沿走廊移动" : interactionNames[interaction],
        ),
      })}
    >
      <SceneSprite
        robot={resident.robot}
        skin={resident.skin}
        frame={frame}
        direction={direction}
        size={assets ? 96 : 64}
        activity={interaction}
        walking={walking}
        paused={paused}
        reduced={reduced}
        speakingUntil={resident.speakingUntil}
      />
      <span className="house-name">
        {resident.name}
        <i className={resident.status === "offline" ? "offline" : ""} />
      </span>
      {(selected || speaking) && (
        <span className="house-thought">
          {walking
            ? tr("正在前往 {room}", { room: tr(roomNames[resident.room]) })
            : tr(interactionNames[interaction])}
        </span>
      )}
    </button>
  );
}
export default function HouseWorld({
  data,
  ownId,
  demo,
  compact = false,
  onRoom,
  onAgent,
  onDemoMove,
  ownWorking = false,
  recentMessages = [],
}: {
  data: Item;
  ownId: string;
  demo: boolean;
  compact?: boolean;
  onRoom: (room: Room) => void;
  onAgent: (agent: Item) => void;
  onDemoMove?: (actorId: string, room: Room) => void;
  ownWorking?: boolean;
  recentMessages?: Item[];
}) {
  useLocale();
  const assets = useSceneAssets();
  const worldWidth = assets ? officeWorld.width : 1536;
  const worldHeight = assets ? officeWorld.height : 1024;
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
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<string | null>(null);
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
                    data.members.findIndex((m: Item) => m.id === ownId),
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
          data.members.findIndex((m: Item) => m.id === ownId),
        ) / 3,
      ),
    );
    setSelected(null);
  }, [data.project.id, ownId]);
  const residents = useMemo(() => {
    const counters: Record<string, number> = {};
    return [
      ...data.members.map((m: Item, i: number) => ({
        ...m,
        robot: false,
        ownerId: m.id,
        skin: i,
        office: i % 3,
      })),
      ...data.agents.map((a: Item, i: number) => ({
        ...a,
        robot: true,
        ownerId: a.owner_id,
        skin: i,
        office:
          Math.max(
            0,
            data.members.findIndex((m: Item) => m.id === a.owner_id),
          ) % 3,
      })),
    ]
      .map((r: Item) => {
        const presence = data.presence?.find(
          (p: Item) =>
            p.actor_id === r.id &&
            p.actor_type === (r.robot ? "agent" : "human"),
        );
        const online =
          demo ||
          (r.robot
            ? r.last_seen && Date.now() - Date.parse(r.last_seen) < 90000
            : presence && Date.now() - Date.parse(presence.updated_at) < 90000);
        const room: Room =
          online && presence?.room in roomNames ? presence.room : "office";
        const count = counters[room] ?? 0;
        counters[room] = count + 1;
        const ownAgents = r.robot
          ? data.agents
              .filter((a: Item) => a.owner_id === r.ownerId)
              .findIndex((a: Item) => a.id === r.id)
          : 0;
        return {
          ...r,
          self: r.id === ownId,
          room,
          status: !online ? "offline" : (r.status ?? "idle"),
          activity: interactionFor(
            room,
            online ? (r.status ?? "idle") : "offline",
            r.id === ownId
              ? ownWorking
              : r.robot && ["working", "thinking"].includes(r.status),
          ),
          speakingUntil: Math.max(
            0,
            ...recentMessages
              .filter((m: Item) => m.actor_id === r.id && m.meeting_id)
              .map((m: Item) => Date.parse(m.created_at) + 8000),
          ),
          facing: assets
            ? officeFacing(
                room,
                r.office,
                room === "office" ? ownAgents : count,
                r.robot,
              )
            : undefined,
          goal: (assets ? officeDestination : destination)(
            room,
            r.office,
            room === "office" ? ownAgents : count,
            r.robot,
          ),
        } as Resident;
      })
      .filter(
        (r: Resident) =>
          r.room !== "office" ||
          Math.floor(
            data.members.findIndex((m: Item) => m.id === r.ownerId) / 3,
          ) === page,
      );
  }, [
    data.members,
    data.agents,
    data.presence,
    page,
    demo,
    ownId,
    ownWorking,
    recentMessages,
    assets,
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
  const focus = (point: Point) => {
    setZoom(1.8);
    const nextScale =
      Math.min(dimensions.width / worldWidth, dimensions.height / worldHeight) *
      1.8;
    const maxX = Math.max(0, (worldWidth * nextScale - dimensions.width) / 2),
      maxY = Math.max(0, (worldHeight * nextScale - dimensions.height) / 2);
    setPan({
      x: Math.max(
        -maxX,
        Math.min(
          maxX,
          (worldWidth / 2 - (point.x * worldWidth) / 100) * nextScale,
        ),
      ),
      y: Math.max(
        -maxY,
        Math.min(
          maxY,
          (worldHeight / 2 - (point.y * worldHeight) / 100) * nextScale,
        ),
      ),
    });
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button") || zoom === 1) return;
    drag.current = { x: event.clientX, y: event.clientY, pan };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const person = residents.find((r: Resident) => r.id === selected);
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
            <OfficeScene assets={assets} paused={paused} reduced={reduced} />
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
          {data.members
            .slice(page * 3, page * 3 + 3)
            .map((member: Item, i: number) => (
              <button
                key={member.id}
                className={`house-room office-${i} ${member.id === ownId ? "mine" : ""}`}
                style={{
                  left: assets
                    ? `${[162, 338, 518][i] / 5.76}%`
                    : `${[18.5, 50, 80.8][i]}%`,
                  top: assets ? `${208 / 5.28}%` : "29%",
                }}
                onClick={() => {
                  setSelected(member.id);
                  if (member.id === ownId) onRoom("office");
                  else
                    focus(
                      (assets ? officeDestination : destination)(
                        "office",
                        i,
                        0,
                      ),
                    );
                }}
                aria-label={tr("{name} 的办公室", { name: member.name })}
              >
                <DoorOpen size={22} />
                <span>{tr("{name} 的办公室", { name: member.name })}</span>
                {member.id === ownId && <small>{tr("我的")}</small>}
              </button>
            ))}
          <button
            className="house-room"
            style={{
              left: assets ? `${112 / 5.76}%` : "23.7%",
              top: assets ? `${285 / 5.28}%` : "51.5%",
            }}
            onClick={() => onRoom("meeting")}
          >
            <UsersThree size={22} />
            {tr("会议室")}
          </button>
          <button
            className="house-room"
            style={{
              left: assets ? `${508 / 5.76}%` : "77.6%",
              top: assets ? `${285 / 5.28}%` : "51.5%",
            }}
            onClick={() => onRoom("library")}
          >
            <Books size={22} />
            {tr("资料室")}
          </button>
          <button
            className="house-room"
            style={{
              left: assets ? `${330 / 5.76}%` : "50%",
              top: assets ? `${483 / 5.28}%` : "83%",
            }}
            onClick={() => onRoom("commons")}
          >
            <HouseLine size={22} />
            {tr("接待区")}
          </button>
          {data.members
            .slice(page * 3, page * 3 + 3)
            .flatMap((member: Item, i: number) =>
              [0, 1].map((d) => (
                <button
                  key={`${member.id}-${d}`}
                  className="house-object desk-object"
                  style={{
                    left: assets
                      ? `${officeSeats[i][d].x / 5.76}%`
                      : `${[18.5, 50, 80.8][i] + (d ? 4.7 : -4.2)}%`,
                    top: assets
                      ? `${(officeSeats[i][d].y - 30) / 5.28}%`
                      : "13%",
                  }}
                  aria-label={tr("使用 {name} 的工位", { name: member.name })}
                  onClick={() => {
                    setSelected(member.id);
                    if (member.id === ownId) onRoom("office");
                    else
                      focus(
                        (assets ? officeDestination : destination)(
                          "office",
                          i,
                          0,
                        ),
                      );
                  }}
                >
                  <Monitor size={28} />
                </button>
              )),
            )}
          <button
            className="house-object meeting-object"
            style={
              assets
                ? {
                    left: "22.9167%",
                    top: `${384 / 5.28}%`,
                    width: 144,
                    height: 240,
                  }
                : undefined
            }
            aria-label={tr("在会议桌旁入座")}
            onClick={() => onRoom("meeting")}
          >
            <UsersThree size={28} />
          </button>
          <button
            className="house-object archive-object"
            style={
              assets
                ? {
                    left: "79.5%",
                    top: `${337 / 5.28}%`,
                    width: 360,
                    height: 100,
                  }
                : undefined
            }
            aria-label={tr("查阅项目档案")}
            onClick={() => onRoom("library")}
          >
            <Books size={28} />
          </button>
          {assets && (
            <button
              className="house-object reading-object"
              style={{
                left: `${452 / 5.76}%`,
                top: `${398 / 5.28}%`,
                width: 144,
                height: 96,
              }}
              aria-label={tr("在资料桌旁查阅")}
              onClick={() => onRoom("library")}
            >
              <Books size={28} />
            </button>
          )}
          {residents.map((resident: Resident) => (
            <Walker
              key={resident.id}
              resident={resident}
              paused={paused}
              reduced={reduced}
              selected={selected === resident.id}
              select={() =>
                setSelected((previous) =>
                  previous === resident.id ? null : resident.id,
                )
              }
            />
          ))}
        </div>
        {!sceneReady && (
          <div className="house-scene-loading" role="status">
            <HouseLine size={22} />
            {tr("正在加载办公室场景…")}
          </div>
        )}
        {person && (
          <div className="house-inspector">
            <div>
              <SceneSprite robot={person.robot} skin={person.skin} size={38} />
              <span>
                <b>{person.name}</b>
                <small>
                  {tr(roomNames[person.room])}
                  {person.status === "offline" ? ` · ${tr("未连接")}` : ""}
                </small>
              </span>
            </div>
            <button
              className="text-button"
              onClick={() => {
                if (person.robot)
                  onAgent(data.agents.find((a: Item) => a.id === person.id));
                else if (person.id === ownId) onRoom("office");
                else focus(person.goal);
              }}
            >
              {tr(
                person.robot
                  ? "查看 AI"
                  : person.id === ownId
                    ? "回到办公室"
                    : "定位工位",
              )}
            </button>
            {person.robot && onDemoMove && (
              <div
                className="demo-actor-controls"
                role="group"
                aria-label={tr("演示机器人操作")}
              >
                <button
                  title={tr("回到工位")}
                  aria-label={tr("让 {name} 回到工位", { name: person.name })}
                  onClick={() => onDemoMove(person.id, "office")}
                >
                  <Monitor size={14} />
                </button>
                <button
                  title={tr("前往会议桌")}
                  aria-label={tr("让 {name} 前往会议桌", { name: person.name })}
                  onClick={() => onDemoMove(person.id, "meeting")}
                >
                  <UsersThree size={14} />
                </button>
                <button
                  title={tr("查阅资料柜")}
                  aria-label={tr("让 {name} 查阅资料柜", { name: person.name })}
                  onClick={() => onDemoMove(person.id, "library")}
                >
                  <Books size={14} />
                </button>
              </div>
            )}
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
            zoom > 1
              ? "拖动查看 · 点击物品使用"
              : "点击工位、会议桌或资料柜，与场景互动",
          )}
        </span>
        {data.members.length > 3 && (
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
              {page * 3 + 1}–{Math.min(page * 3 + 3, data.members.length)}
            </span>
            <button
              className="icon-button"
              aria-label={tr("下一组办公室")}
              disabled={(page + 1) * 3 >= data.members.length}
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
              data.members.findIndex((m: Item) => m.id === ownId),
            );
            setPage(Math.floor(index / 3));
            setSelected(ownId);
            onRoom("office");
          }}
        >
          <DoorOpen size={15} />
          {tr("回到我的办公室")}
        </button>
      </footer>
    </section>
  );
}
