import { useEffect, useRef } from "react";
import type { SceneAssets } from "./scene-assets";
import { humanPose, type Interaction } from "./interaction";
export default function ResidentAnimation({
  assets,
  character,
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
  character?: string;
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
    const ctx = canvas.current!.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const sheet =
      assets.images[
        character ?? assets.characters[skin % assets.characters.length]
      ];
    let raf = 0,
      last = 0,
      lastPose = -1;
    const paint = (frame: number) => {
      const speaking = activity === "listening" && Date.now() < speakingUntil;
      const action = walking ? "walking" : speaking ? "speaking" : activity;
      ctx.clearRect(0, 0, 64, 64);
      canvas.current!.dataset.pose = `${action}-${frame}`;
      const pose = humanPose(action, direction, frame);
      // Source sit rows end at pixel 31; walk/idle/read use baseline 32.
      // Keep the actual sole on the shared seat anchor through action changes.
      const seated = pose.y === 128 || pose.y === 160;
      ctx.save();
      ctx.translate(0, seated ? 2 : 0);
      ctx.drawImage(sheet, pose.x, pose.y, 16, 32, 16, 0, 32, 64);
      if (action === "typing" && direction === 2) {
        // Retarget both original wrists onto the north workstation's keyboard.
        for (const x of [2, 10])
          ctx.drawImage(
            sheet,
            pose.x + x,
            pose.y + 20,
            3,
            3,
            16 + x * 2,
            32 + (frame % 2) * 2,
            6,
            6,
          );
      } else if (action === "typing") {
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
      ctx.restore();
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
      if (lastPose !== pose) {
        paint(f);
        lastPose = pose;
      }
      if (!paused && !reduced) raf = requestAnimationFrame(tick);
    };
    const ready = () =>
      paint(walking ? walkFrame : Math.floor(timeline.current / 170) % 6);
    ready();
    if (!paused && !reduced) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [
    assets,
    character,
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
