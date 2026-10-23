import { useEffect, useState } from "react";
import { requiredSceneImages } from "./office-objects";

export type SceneAssets = {
  images: Record<string, HTMLImageElement>;
  characters: string[];
  robots: string[];
  credit: string;
};
let cached: Promise<SceneAssets | null> | undefined;
function load(): Promise<SceneAssets | null> {
  return (cached ??= fetch("/scene-assets/manifest.json")
    .then(async (response) => {
      if (!response.ok) return null;
      const manifest = await response.json();
      if (
        !manifest.available ||
        manifest.version !== 1 ||
        !Array.isArray(manifest.characters) ||
        manifest.characters.length === 0
      )
        return null;
      const images: SceneAssets["images"] = {};
      await Promise.all(
        Object.keys(manifest.images).map(async (name) => {
          if (!/^[a-z0-9-]+\.png$/.test(name))
            throw new Error("Invalid scene asset name");
          const image = new Image();
          image.src = `/scene-assets/${name}`;
          await image.decode();
          images[name] = image;
        }),
      );
      if (
        ![...requiredSceneImages, ...manifest.characters].every(
          (name) => images[name],
        )
      )
        return null;
      return {
        images,
        characters: manifest.characters,
        robots: Array.isArray(manifest.robots)
          ? manifest.robots.filter(
              (name: unknown) => typeof name === "string" && images[name],
            )
          : [],
        credit: manifest.credit,
      };
    })
    .catch(() => null));
}
export function useSceneAssets() {
  const [assets, setAssets] = useState<SceneAssets | null>(null);
  useEffect(() => {
    let active = true;
    void load().then((value) => {
      if (active) setAssets(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return assets;
}
