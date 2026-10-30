"""
Draws the app icon (a dumbbell) pixel by pixel and saves it as PNG files,
using only the Python standard library: no Pillow needed.

    python tools/make_icons.py

A PNG file is: a signature, then "chunks" (IHDR = size, IDAT = compressed
pixels, IEND = end). Each chunk ends with a CRC checksum.
"""

import struct
import zlib
from pathlib import Path

ICON_DIR = Path(__file__).resolve().parent.parent / "docs" / "icons"

BACKGROUND = (13, 14, 16)     # near-black, same as the app's dark background
BAR = (243, 242, 237)         # off-white
PLATE = (212, 255, 61)        # volt, the app accent colour


def dumbbell_color(x, y):
    """Return the colour for pixel (x, y) on a 0..1 x 0..1 canvas."""
    # Rectangles as (left, top, right, bottom), drawn from back to front.
    shapes = [
        ((0.18, 0.47, 0.82, 0.53), BAR),     # the bar
        ((0.22, 0.30, 0.31, 0.70), PLATE),   # big plate left
        ((0.69, 0.30, 0.78, 0.70), PLATE),   # big plate right
        ((0.14, 0.38, 0.21, 0.62), PLATE),   # small plate left
        ((0.79, 0.38, 0.86, 0.62), PLATE),   # small plate right
    ]
    color = BACKGROUND
    for (left, top, right, bottom), shape_color in shapes:
        if left <= x <= right and top <= y <= bottom:
            color = shape_color
    return color


def make_png(size):
    rows = []
    for py in range(size):
        row = bytearray([0])  # each row starts with a "filter type" byte (0 = none)
        for px in range(size):
            row.extend(dumbbell_color((px + 0.5) / size, (py + 0.5) / size))
        rows.append(bytes(row))
    pixels = zlib.compress(b"".join(rows), 9)

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", pixels) + chunk(b"IEND", b"")


def main():
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    # 180 is what iPhone uses for the home screen; 192/512 are for Android/desktop.
    for name, size in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
        (ICON_DIR / name).write_bytes(make_png(size))
        print(f"Saved {name} ({size}x{size})")


if __name__ == "__main__":
    main()
