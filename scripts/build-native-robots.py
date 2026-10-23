#!/usr/bin/env python3
"""Build local robot variants from owned LimeZu character layers (requires Pillow)."""
import argparse
import io
import json
import zipfile
from pathlib import Path
from PIL import Image


def recolor(image, palette):
    result = image.copy()
    result.putdata([(*palette.get(p[:3], p[:3]), p[3]) for p in image.getdata()])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interiors", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path("data/scene-assets"))
    args = parser.parse_args()
    manifest_path = args.output / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("version") != 1 or not manifest.get("available"):
        raise ValueError("Import the complete office runtime pack first")
    prefix = "2_Characters/Character_Generator/"
    paths = [
        "Bodies/16x16/Body_01.png",
        "Eyes/16x16/Eyes_03.png",
        "Outfits/16x16/Outfit_22_04.png",
        "Accessories/16x16/Accessory_07_Bataclava_02.png",
    ]
    with zipfile.ZipFile(args.interiors) as archive:
        layers = []
        for path in paths:
            raw = archive.read(prefix + path)
            if len(raw) > 4 * 1024 * 1024:
                raise ValueError("Unexpected character layer size")
            layer = Image.open(io.BytesIO(raw)).convert("RGBA")
            if layer.height != 656 or layer.width not in (896, 927):
                raise ValueError("Unsupported character atlas layout")
            layers.append(layer)
    body, eyes, outfit, helmet = layers
    # Preserve all original frame coordinates, silhouettes and alpha, including
    # the body's extra rightmost pixels. No frame-by-frame generated replacements.
    body = recolor(body, {
        (191,139,120):(48,62,77), (181,121,114):(41,52,68),
        (196,157,133):(69,86,101),
    })
    helmet = recolor(helmet, {
        (113,114,158):(194,203,213), (101,100,140):(139,154,171),
        (124,125,174):(223,230,235),
    })
    names = []
    for i, accent in enumerate([(102,154,168),(111,147,181),(151,139,177)]):
        clothes = recolor(outfit, {
            (66,99,161):(107,125,143), (80,121,172):(156,172,186),
            (176,148,57):accent,
        })
        lights = recolor(eyes, {(149,157,88):accent})
        result = Image.new("RGBA", (max(p.width for p in layers), 656))
        for layer in (body, lights, clothes, helmet):
            result.alpha_composite(layer, (0,0))
        name = f"native-robot-{i}.png"
        temporary = args.output / (name + ".tmp")
        result.save(temporary, format="PNG")
        temporary.replace(args.output / name)
        manifest["images"][name] = {"width":result.width,"height":result.height}
        names.append(name)
    manifest["robots"] = names
    temporary = args.output / "manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, indent=2) + "\n")
    temporary.replace(manifest_path)
    print(f"Built {len(names)} local robot atlases in {args.output.resolve()}")


if __name__ == "__main__":
    main()
