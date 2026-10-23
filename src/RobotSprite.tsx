import { useEffect, useRef } from "react";
import type { Interaction } from "./interaction";
import { robotPose, robotSheet } from "./robot-sprites";

let sheet: HTMLImageElement | undefined;

export default function RobotSprite({
  skin,
  activity,
  direction,
  walkFrame,
  size,
  walking,
  paused,
  reduced,
  speakingUntil,
}: {
  skin: number;
  activity: Interaction;
  direction: number;
  walkFrame: number;
  size: number;
  walking: boolean;
  paused: boolean;
  reduced: boolean;
  speakingUntil: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const timeline = useRef(0);
  useEffect(() => {
    if (!sheet) {
      sheet = new Image();
      sheet.src = robotSheet;
    }
    const ctx = canvas.current!.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    let raf = 0,
      last = 0,
      previous = "";
    const paint = () => {
      if (!sheet?.complete || !sheet.naturalWidth) return;
      const action = walking
        ? "walking"
        : activity === "listening" && Date.now() < speakingUntil
          ? "speaking"
          : activity;
      const frame = walking
        ? walkFrame
        : reduced
          ? 0
          : Math.floor(timeline.current / 170) % 6;
      const key = `${action}-${frame}`;
      if (key === previous) return;
      previous = key;
      canvas.current!.dataset.pose = key;
      const p = robotPose(action, direction, frame);
      ctx.clearRect(0, 0, 64, 64);
      ctx.save();
      // Identity accents remain restrained: muted teal, blue and lilac on the same casing.
      ctx.filter =
        skin % 3 === 2
          ? "hue-rotate(20deg)"
          : skin % 3 === 1
            ? "hue-rotate(-15deg)"
            : "none";
      ctx.drawImage(
        sheet,
        p.x,
        p.y,
        p.width,
        p.height,
        Math.round(32 - p.drawWidth / 2),
        64 - p.drawHeight,
        p.drawWidth,
        p.drawHeight,
      );
      ctx.restore();
    };
    const tick = (now: number) => {
      if (last) timeline.current += Math.min(80, now - last);
      last = now;
      paint();
      raf = requestAnimationFrame(tick);
    };
    paint();
    sheet.addEventListener("load", paint);
    if (!paused && !reduced) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      sheet?.removeEventListener("load", paint);
    };
  }, [
    skin,
    activity,
    direction,
    walkFrame,
    walking,
    paused,
    reduced,
    speakingUntil,
  ]);
  return (
    <span
      className="scene-sprite licensed-sprite"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <canvas
        ref={canvas}
        width={64}
        height={64}
        style={{ width: size, height: size }}
      />
    </span>
  );
}
