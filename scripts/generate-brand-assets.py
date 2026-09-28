"""Generate launcher icons, splash art, notification icon and Play Store graphics.

Mirrors src/components/ui/BrandMark.tsx (100x100 design grid). Re-run after changing
the logo:  python scripts/generate-brand-assets.py   (requires Pillow)
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
STORE = os.path.join(ROOT, 'store')
FONTS = os.path.join(ROOT, 'node_modules', '@expo-google-fonts')

SPRUCE = (31, 92, 69, 255)
PAPER = (255, 252, 246, 255)
GREEN = (91, 195, 147, 255)
AMBER = (240, 172, 46, 255)
RED = (242, 105, 90, 255)
SS = 4  # supersampling factor for smooth edges


def draw_gauge(draw, ox, oy, scale, colors=(GREEN, AMBER, RED), needle_color=PAPER, needle=0.18):
    """Draw the gauge at offset (ox, oy) where 1 design unit = `scale` px."""
    cx, cy, r, stroke = 50, 62, 30, 9

    def p(x, y):
        return ox + x * scale, oy + y * scale

    def dot(x, y, radius, fill):
        px, py = p(x, y)
        rr = radius * scale
        draw.ellipse([px - rr, py - rr, px + rr, py + rr], fill=fill)

    outer = r + stroke / 2
    box = [*p(cx - outer, cy - outer), *p(cx + outer, cy + outer)]
    for (start, end), color in zip([(186, 228), (250, 290), (312, 354)], colors):
        draw.arc(box, start, end, fill=color, width=round(stroke * scale))
        for angle in (start, end):  # round caps
            rad = math.radians(angle)
            dot(cx + r * math.cos(rad), cy + r * math.sin(rad), stroke / 2, color)

    angle = math.radians(186 + needle * 168)
    tx, ty = cx + 23 * math.cos(angle), cy + 23 * math.sin(angle)
    draw.line([*p(cx, cy), *p(tx, ty)], fill=needle_color, width=round(6 * scale))
    dot(tx, ty, 3, needle_color)
    dot(cx, cy, 6.5, needle_color)


def render(size, background, gauge_box, rounded=0, **gauge_kwargs):
    """gauge_box = (x, y, side) of the 100-unit design grid inside the final image."""
    big = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(big)
    if background:
        if rounded:
            draw.rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=rounded * SS, fill=background)
        else:
            draw.rectangle([0, 0, size * SS, size * SS], fill=background)
    x, y, side = gauge_box
    draw_gauge(draw, x * SS, y * SS, side * SS / 100, **gauge_kwargs)
    return big.resize((size, size), Image.LANCZOS)


def save(image, *parts):
    path = os.path.join(*parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.save(path)
    print('wrote', os.path.relpath(path, ROOT))


def main():
    # iOS / legacy launcher icon: full-bleed spruce square (the OS applies its own mask).
    save(render(1024, SPRUCE, (112, 118, 800)), ASSETS, 'icon.png')
    # Android adaptive foreground: content kept inside the central 66% safe zone.
    save(render(1024, None, (162, 167, 700)), ASSETS, 'adaptive-icon.png')
    # Monochrome adaptive layer for Android 13 themed icons.
    white = (255, 255, 255, 255)
    save(render(1024, None, (162, 167, 700), colors=(white,) * 3, needle_color=white), ASSETS, 'adaptive-icon-mono.png')
    # Splash: framed mark on transparent; background colour comes from app config.
    save(render(1024, SPRUCE, (0, 0, 1024), rounded=266), ASSETS, 'splash-icon.png')
    # Notification small icon: white silhouette on transparent (Android requirement).
    save(render(96, None, (0, 1, 96), colors=(white,) * 3, needle_color=white), ASSETS, 'notification-icon.png')

    # Play Store hi-res icon (512x512, no transparency).
    save(render(512, SPRUCE, (56, 59, 400)), STORE, 'play-icon-512.png')

    # Play Store feature graphic (1024x500).
    w, h = 1024, 500
    fg = Image.new('RGBA', (w * SS, h * SS), SPRUCE)
    draw = ImageDraw.Draw(fg)
    draw_gauge(draw, 64 * SS, 72 * SS, 3.6 * SS)
    try:
        display = ImageFont.truetype(
            os.path.join(FONTS, 'bricolage-grotesque', '800ExtraBold', 'BricolageGrotesque_800ExtraBold.ttf'), 132 * SS
        )
        body = ImageFont.truetype(os.path.join(FONTS, 'figtree', '600SemiBold', 'Figtree_600SemiBold.ttf'), 40 * SS)
    except OSError:
        display = body = ImageFont.load_default()
    draw.text((470 * SS, 130 * SS), 'MOSI', font=display, fill=PAPER)
    draw.text((476 * SS, 290 * SS), 'Know before you head out.', font=body, fill=PAPER)
    draw.text((476 * SS, 345 * SS), 'Outdoor safety for Manitoba', font=body, fill=(255, 252, 246, 170))
    save(fg.resize((w, h), Image.LANCZOS).convert('RGB'), STORE, 'feature-graphic.png')


if __name__ == '__main__':
    main()
