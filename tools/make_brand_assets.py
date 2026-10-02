"""Derive every app icon and in-app logo from the two brand masters.

Masters (transparent PNG, kept in app/assets/brand/):
  cheqer-emblem.png   the gold Q magnifier with the Hebrew and the open book
  cheqer-header.png   the "Cheqer" wordmark with the emblem as its Q

Run from the repo root after replacing either master:
  python tools/make_brand_assets.py

Needs Pillow and numpy. Safe to re-run; it overwrites its outputs.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "app" / "assets" / "brand"
OUT = ROOT / "app" / "assets" / "images"

NAVY = (30, 42, 58)      # theme splashBg #1E2A3A
CREAM = (243, 237, 223)  # theme splashInk #F3EDDF
SIZE = 1024


def load(name: str) -> Image.Image:
    """Open a master, lift its alpha to full strength, trim empty margins."""
    im = Image.open(BRAND / name).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    # Background removal left the solid areas at ~250/255; without this the
    # gold goes slightly muddy over a dark ground.
    peak = np.percentile(a[..., 3][a[..., 3] > 0], 90)
    a[..., 3] = np.clip(a[..., 3] * (255.0 / peak), 0, 255)
    # Drop the faint haze the removal left around the artwork.
    a[..., 3][a[..., 3] < 8] = 0
    im = Image.fromarray(a.astype(np.uint8))
    return im.crop(im.getbbox())


def place(im: Image.Image, *, box: float | None = None, circle: float | None = None) -> Image.Image:
    """Centre the artwork on a SIZE canvas.

    box: the longer side fills this fraction of the canvas (square icons).
    circle: every pixel stays within this radius, as a fraction of the
    canvas, measured from the centre (round launcher masks; the handle
    sticks out one corner, so the bounding box alone would be clipped).
    """
    if box is not None:
        scale = box * SIZE / max(im.size)
    else:
        ys, xs = np.nonzero(np.asarray(im)[..., 3] > 40)
        reach = np.hypot(xs - im.width / 2, ys - im.height / 2).max()
        scale = circle * SIZE / reach
    w, h = round(im.width * scale), round(im.height * scale)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(im.resize((w, h), Image.LANCZOS), ((SIZE - w) // 2, (SIZE - h) // 2))
    return canvas


def on_navy(im: Image.Image) -> Image.Image:
    bg = Image.new("RGBA", im.size, NAVY + (255,))
    bg.alpha_composite(im)
    return bg.convert("RGB")


def reversed_header(im: Image.Image) -> Image.Image:
    """The wordmark for dark grounds: navy letters become cream, gold stays."""
    a = np.asarray(im).astype(np.float32)
    r, b = a[..., 0], a[..., 2]
    navy = np.clip((b - r + 10) / 50.0, 0, 1)[..., None]
    a[..., :3] = a[..., :3] * (1 - navy) + np.array(CREAM, np.float32) * navy
    return Image.fromarray(a.astype(np.uint8))


def fit_width(im: Image.Image, width: int) -> Image.Image:
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def main() -> None:
    emblem = load("cheqer-emblem.png")
    header = load("cheqer-header.png")

    # Store / iOS icon: opaque, emblem filling most of the square.
    on_navy(place(emblem, box=0.78)).save(OUT / "icon.png")

    # Android adaptive icon: launchers show a circle of radius 0.33 at most.
    fg = place(emblem, circle=0.32)
    fg.save(OUT / "android-icon-foreground.png")
    mono = np.asarray(fg).copy()
    mono[..., :3] = 255
    Image.fromarray(mono).save(OUT / "android-icon-monochrome.png")

    # Native splash: Android 12+ masks it to the same circle as the icon.
    fg.save(OUT / "splash-icon.png")

    # Web favicon and in-app marks.
    place(emblem, box=0.98).resize((192, 192), Image.LANCZOS).save(OUT / "favicon.png")
    place(emblem, box=0.98).resize((512, 512), Image.LANCZOS).save(OUT / "cheqer-emblem.png")
    fit_width(header, 1000).save(OUT / "cheqer-header.png")
    fit_width(reversed_header(header), 1000).save(OUT / "cheqer-header-dark.png")

    for f in ("icon", "android-icon-foreground", "android-icon-monochrome", "splash-icon",
              "favicon", "cheqer-emblem", "cheqer-header", "cheqer-header-dark"):
        p = OUT / f"{f}.png"
        print(f"{p.relative_to(ROOT)}  {Image.open(p).size}")


if __name__ == "__main__":
    main()
