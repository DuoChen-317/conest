import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { tr } from "./i18n";
import {
  chatWidthBounds,
  clampChatWidth,
  clampSceneHeight,
  defaultChatWidth,
  parseWorkspacePreference,
  workspacePreferenceKey,
} from "./workspace-layout";

export default function OfficeWorkspace({
  active,
  scene,
  children,
}: {
  active: boolean;
  scene: ReactNode;
  children: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const scenePane = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [measuredHeight, setMeasuredHeight] = useState(600);
  const [settings, setSettings] = useState(() => {
    try {
      return parseWorkspacePreference(
        localStorage.getItem(workspacePreferenceKey),
      );
    } catch {
      return parseWorkspacePreference(null);
    }
  });
  const drag = useRef<{
    axis: "width" | "height";
    x: number;
    y: number;
    start: number;
  } | null>(null);
  useEffect(() => {
    if (!active || !container.current) return;
    const viewport = scenePane.current?.querySelector(".house-viewport");
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === container.current)
          setWidth(entry.contentRect.width);
        else setMeasuredHeight(Math.round(entry.contentRect.height));
      }
    });
    observer.observe(container.current);
    if (viewport) observer.observe(viewport);
    return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    try {
      localStorage.setItem(workspacePreferenceKey, JSON.stringify(settings));
    } catch {
      /* Keep usable when browser storage is unavailable. */
    }
  }, [settings]);
  if (!active)
    return (
      <div className="house-room-view">
        <div ref={scenePane} className="office-scene-pane">
          {scene}
        </div>
      </div>
    );
  const chatWidth = clampChatWidth(settings.chatWidth, width);
  const bounds = chatWidthBounds(width);
  const percent = (chat: number) =>
    Math.round(((width - 14 - chat) / Math.max(1, width - 14)) * 100);
  const resizeWidth = (value: number) =>
    setSettings((s) => ({ ...s, chatWidth: clampChatWidth(value, width) }));
  const resizeHeight = (value: number) =>
    setSettings((s) => ({ ...s, sceneHeight: clampSceneHeight(value) }));
  const currentHeight = () =>
    scenePane.current?.querySelector(".house-viewport")?.getBoundingClientRect()
      .height ?? 600;
  return (
    <div
      ref={container}
      className="house-and-office office-workspace"
      style={
        {
          "--office-chat-width": `${chatWidth}px`,
          ...(settings.sceneHeight === null
            ? {}
            : { "--office-scene-height": `${settings.sceneHeight}px` }),
        } as CSSProperties
      }
    >
      <div ref={scenePane} className="office-scene-pane">
        {scene}
        <div
          role="separator"
          tabIndex={0}
          aria-label={tr("调整办公室高度")}
          aria-orientation="horizontal"
          aria-valuemin={320}
          aria-valuemax={1000}
          aria-valuenow={settings.sceneHeight ?? measuredHeight}
          title={tr("拖动调整高度；上下方向键调整，双击恢复自动高度。")}
          className="office-height-handle"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.focus({ preventScroll: true });
            drag.current = {
              axis: "height",
              x: e.clientX,
              y: e.clientY,
              start: currentHeight(),
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current?.axis === "height")
              resizeHeight(drag.current.start + e.clientY - drag.current.y);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onDoubleClick={() =>
            setSettings((s) => ({ ...s, sceneHeight: null }))
          }
          onKeyDown={(e) => {
            if (
              ["ArrowUp", "ArrowDown", "Home", "End", "Escape"].includes(e.key)
            ) {
              e.preventDefault();
              if (e.key === "Escape" || e.key === "Home")
                setSettings((s) => ({ ...s, sceneHeight: null }));
              else
                resizeHeight(
                  e.key === "End"
                    ? 1000
                    : currentHeight() + (e.key === "ArrowDown" ? 32 : -32),
                );
            }
          }}
        >
          <span aria-hidden="true" />
        </div>
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-label={tr("调整办公室与聊天宽度")}
        aria-orientation="vertical"
        aria-valuemin={percent(bounds.max)}
        aria-valuemax={percent(bounds.min)}
        aria-valuenow={percent(chatWidth)}
        aria-valuetext={tr("办公室宽度 {percent}%", {
          percent: percent(chatWidth),
        })}
        title={tr("拖动调整宽度；左右方向键调整，双击恢复默认比例。")}
        className="office-width-handle"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.focus({ preventScroll: true });
          drag.current = {
            axis: "width",
            x: e.clientX,
            y: e.clientY,
            start: chatWidth,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current?.axis === "width")
            resizeWidth(drag.current.start - (e.clientX - drag.current.x));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onDoubleClick={() => resizeWidth(defaultChatWidth)}
        onKeyDown={(e) => {
          if (
            ["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(e.key)
          ) {
            e.preventDefault();
            resizeWidth(
              e.key === "Escape"
                ? defaultChatWidth
                : e.key === "Home"
                  ? bounds.max
                  : e.key === "End"
                    ? bounds.min
                    : chatWidth + (e.key === "ArrowLeft" ? 24 : -24),
            );
          }
        }}
      >
        <span aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}
