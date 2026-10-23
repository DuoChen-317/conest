import { useEffect, useRef } from "react";
import type { SceneAssets } from "./scene-assets";
import { humanPose, type Interaction } from "./interaction";
let robotImage: HTMLImageElement | undefined;
const bounds = [
  [
    [106, 44, 274, 355],
    [80, 44, 282, 355],
    [80, 44, 281, 355],
    [88, 44, 257, 355],
  ],
  [
    [106, 33, 274, 348],
    [80, 32, 282, 349],
    [80, 32, 281, 349],
    [88, 33, 257, 349],
  ],
  [
    [106, 14, 274, 317],
    [80, 14, 282, 322],
    [80, 14, 281, 322],
    [88, 14, 257, 317],
  ],
];
export default function ResidentAnimation({
  assets,
  robot,
  skin,
  activity,
  direction,
  walkFrame = 0,
  size = 64,
  paused = false,
  reduced = false,
  walking = false,
  speakingUntil = 0,
}: {
  assets: SceneAssets;
  robot: boolean;
  skin: number;
  activity: Interaction;
  direction: number;
  walkFrame?: number;
  size?: number;
  paused?: boolean;
  reduced?: boolean;
  walking?: boolean;
  speakingUntil?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const timeline = useRef(0);
  useEffect(() => {
    if (!robotImage) {
      robotImage = new Image();
      robotImage.src = "/assets/robot-walk.png";
    }
    const ctx = canvas.current!.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const sheet =
      assets.images[assets.characters[skin % assets.characters.length]];
    let raf = 0,
      last = 0,
      lastPose = -1;
    const paint = (frame: number) => {
      const speaking = activity === "listening" && Date.now() < speakingUntil;
      const action = walking ? "walking" : speaking ? "speaking" : activity;
      ctx.clearRect(0, 0, 64, 64);
      canvas.current!.dataset.pose = `${action}-${frame}`;
      if (!robot) {
        const pose = humanPose(action, direction, frame);
        ctx.drawImage(sheet, pose.x, pose.y, 16, 32, 16, 0, 32, 64);
        if (action === "typing") {
          // Retarget the purchased sitter's actual raster forearm/hand, keeping torso and legs seated.
          // A narrow mask removes the original outer hand so there is no doubled limb.
          const left = direction === 0;
          const sx = pose.x + (left ? 0 : 11),
            sy = pose.y + 21;
          ctx.clearRect(left ? 16 : 40, 42, 8, 8);
          ctx.drawImage(
            sheet,
            sx,
            sy,
            5,
            4,
            left ? 9 : 46,
            40 + (frame % 2) * 2,
            10,
            8,
          );
        }
        if (action === "speaking") {
          // A short hand gesture uses the same character's gift/offer pose as a limb overlay.
          ctx.save();
          ctx.beginPath();
          ctx.rect(14, 32, 38, 16);
          ctx.clip();
          if (direction === 0) {
            ctx.translate(64, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(
            sheet,
            (frame % 6) * 16,
            320,
            16,
            32,
            16,
            -(frame % 2) * 2,
            32,
            64,
          );
          ctx.restore();
        }
      } else if (robotImage?.complete && robotImage.naturalWidth) {
        const row = walking ? walkFrame % 3 : 0;
        const dir = activity === "reading" && !walking ? 1 : direction;
        ctx.save();
        if (skin % 3 === 2) ctx.filter = "hue-rotate(30deg)";
        const seated =
          !walking &&
          ["seated", "typing", "listening", "speaking"].includes(action);
        const drawRobot = (frame: number) => {
          const [l, t, r, b] = bounds[frame][dir],
            height = b - t,
            width = r - l,
            scale = 54 / height;
          const x = 32 - (width * scale) / 2;
          if (!seated)
            ctx.drawImage(
              robotImage!,
              dir * 362 + l,
              frame * 362 + t,
              width,
              height,
              x,
              10,
              width * scale,
              54,
            );
          else {
            // Keep the head/torso proportions. Lower the hips into the seat and bend the feet toward the desk.
            const hip = Math.round(height * 0.78);
            ctx.drawImage(
              robotImage!,
              dir * 362 + l,
              frame * 362 + t,
              width,
              hip,
              x,
              16,
              width * scale,
              hip * scale,
            );
            ctx.drawImage(
              robotImage!,
              dir * 362 + l,
              frame * 362 + t + hip,
              width,
              height - hip,
              x + (dir === 0 ? -5 : 5),
              54,
              width * scale,
              10,
            );
          }
        };
        drawRobot(row);
        if (
          !walking &&
          (action === "typing" || action === "reading" || action === "speaking")
        ) {
          // Only the articulated arm band changes; feet/head stay fixed at the interaction slot.
          const r = (frame % 2) + 1;
          const armY = seated ? 37 : 33;
          ctx.beginPath();
          ctx.rect(dir === 0 ? 6 : 28, armY, 30, 18);
          ctx.clip();
          ctx.clearRect(dir === 0 ? 6 : 28, armY, 30, 18);
          drawRobot(r);
        }
        ctx.restore();
        if (!walking && action === "reading") {
          // A real animated book layer from the purchased pack is held in front of the robot.
          ctx.drawImage(
            assets.images["book.png"],
            (frame % 6) * 16,
            224,
            16,
            32,
            13,
            5,
            38,
            62,
          );
        }
      }
    };
    const tick = (now: number) => {
      if (last && !paused && !reduced)
        timeline.current += Math.min(80, now - last);
      last = now;
      const f = walking
        ? walkFrame
        : reduced
          ? 0
          : Math.floor(timeline.current / 170) % 6;
      const pose = f + (Date.now() < speakingUntil ? 100 : 0);
      if (lastPose !== pose || !robotImage?.complete) {
        paint(f);
        lastPose = pose;
      }
      if (!paused && !reduced) raf = requestAnimationFrame(tick);
    };
    const ready = () =>
      paint(walking ? walkFrame : Math.floor(timeline.current / 170) % 6);
    ready();
    robotImage.addEventListener("load", ready);
    if (!paused && !reduced) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      robotImage?.removeEventListener("load", ready);
    };
  }, [
    assets,
    robot,
    skin,
    activity,
    direction,
    walkFrame,
    paused,
    reduced,
    walking,
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
