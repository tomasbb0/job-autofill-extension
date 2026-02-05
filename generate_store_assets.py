#!/usr/bin/env python3
"""
Generate Chrome Web Store assets for Job Application Autofill extension
Following Chrome Web Store image guidelines
Run: python3 generate_store_assets.py
Requires: pip3 install Pillow
"""

from PIL import Image, ImageDraw, ImageFont
import os

# Create assets directory
os.makedirs('store_assets', exist_ok=True)

def create_gradient(width, height):
    """Create a black/dark gradient background"""
    img = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(img)
    
    # Black to very dark gray gradient
    for y in range(height):
        for x in range(width):
            # Calculate gradient position
            pos = (x / width + y / height) / 2
            
            # Start color: #1a1a2e (very dark blue-black)
            # End color: #0a0a0f (almost black)
            r = int(26 + (10 - 26) * pos)
            g = int(26 + (10 - 26) * pos)
            b = int(46 + (15 - 46) * pos)
            
            img.putpixel((x, y), (r, g, b))
    
    return img

def draw_lightning_bolt(draw, center_x, center_y, size, color='white'):
    """Draw a lightning bolt icon - same style as extension logo"""
    # Scale factor
    s = size / 24
    
    # Lightning bolt points (the filled lightning shape)
    points = [
        (center_x + 1*s, center_y - 10*s),   # top point
        (center_x - 5*s, center_y + 2*s),    # middle left
        (center_x - 1*s, center_y + 2*s),    # inner left
        (center_x - 3*s, center_y + 10*s),   # bottom point
        (center_x + 5*s, center_y - 2*s),    # middle right
        (center_x + 1*s, center_y - 2*s),    # inner right
    ]
    
    draw.polygon(points, fill=color)

def draw_sparkle(draw, x, y, size, color='white'):
    """Draw a small sparkle/star"""
    s = size
    # Four-pointed star
    points = [
        (x, y - s),      # top
        (x + s*0.3, y - s*0.3),
        (x + s, y),      # right
        (x + s*0.3, y + s*0.3),
        (x, y + s),      # bottom
        (x - s*0.3, y + s*0.3),
        (x - s, y),      # left
        (x - s*0.3, y - s*0.3),
    ]
    draw.polygon(points, fill=color)

# 1. Store Icon - 128x128 (following Chrome Web Store guidelines)
# Actual icon is 96x96 with 16px transparent padding on each side
print("Creating store icon (128x128)...")
icon = Image.new('RGBA', (128, 128), (0, 0, 0, 0))  # Transparent background
draw = ImageDraw.Draw(icon)

# Draw a rounded rectangle background (96x96 centered, with 16px padding)
# This leaves 16px padding on each side as per guidelines
padding = 16
bg_size = 96
corner_radius = 16

# Draw rounded rectangle background (black/dark)
for y in range(padding, padding + bg_size):
    for x in range(padding, padding + bg_size):
        # Check if inside rounded corners
        dx = min(x - padding, padding + bg_size - 1 - x)
        dy = min(y - padding, padding + bg_size - 1 - y)
        
        if dx < corner_radius and dy < corner_radius:
            # Check if inside corner radius
            corner_x = corner_radius - dx
            corner_y = corner_radius - dy
            if corner_x * corner_x + corner_y * corner_y > corner_radius * corner_radius:
                continue
        
        # Gradient from dark blue-black to almost black
        pos = ((x - padding) / bg_size + (y - padding) / bg_size) / 2
        r = int(26 + (10 - 26) * pos)
        g = int(26 + (10 - 26) * pos)
        b = int(46 + (15 - 46) * pos)
        icon.putpixel((x, y), (r, g, b, 255))

# Draw lightning bolt in center (white)
draw_lightning_bolt(draw, 64, 64, 40, 'white')

icon.save('store_assets/store_icon_128.png')
print("✓ Saved store_assets/store_icon_128.png")

# 2. Small Promo Tile - 440x280
print("Creating small promo tile (440x280)...")
promo_small = create_gradient(440, 280)
draw = ImageDraw.Draw(promo_small)

# Draw lightning bolt (larger)
draw_lightning_bolt(draw, 120, 140, 80)

# Add sparkles
draw_sparkle(draw, 180, 80, 12, 'white')
draw_sparkle(draw, 60, 200, 8, 'white')

# Add text
try:
    # Try to use a nice font
    title_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 32)
    subtitle_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 18)
except:
    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
        subtitle_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except:
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()

# Draw text on right side
draw.text((200, 100), "Job Application", fill='white', font=title_font)
draw.text((200, 140), "Autofill", fill='white', font=title_font)
draw.text((200, 190), "Apply faster with AI ⚡", fill='rgba(255,255,255,200)', font=subtitle_font)

promo_small.save('store_assets/promo_small_440x280.png')
print("✓ Saved store_assets/promo_small_440x280.png")

# 3. Marquee Promo Tile - 1400x560
print("Creating marquee promo tile (1400x560)...")
promo_large = create_gradient(1400, 560)
draw = ImageDraw.Draw(promo_large)

# Draw large lightning bolt on left
draw_lightning_bolt(draw, 250, 280, 160)

# Add sparkles
draw_sparkle(draw, 380, 150, 20, 'white')
draw_sparkle(draw, 120, 420, 15, 'white')
draw_sparkle(draw, 450, 380, 12, 'white')

# Add text
try:
    title_font_lg = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 64)
    subtitle_font_lg = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 28)
    feature_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
except:
    try:
        title_font_lg = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 64)
        subtitle_font_lg = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
        feature_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
    except:
        title_font_lg = ImageFont.load_default()
        subtitle_font_lg = ImageFont.load_default()
        feature_font = ImageFont.load_default()

draw.text((520, 160), "Job Application Autofill", fill='white', font=title_font_lg)
draw.text((520, 250), "Fill job applications instantly with AI-powered automation", fill='white', font=subtitle_font_lg)

# Feature list
features = [
    "✓ One-click autofill for all your info",
    "✓ AI-generated cover letters & responses", 
    "✓ Smart dropdown selection",
    "✓ Works on Greenhouse, Lever, Workday & more"
]
y_pos = 320
for feature in features:
    draw.text((520, y_pos), feature, fill='rgba(255,255,255,220)', font=feature_font)
    y_pos += 40

promo_large.save('store_assets/promo_marquee_1400x560.png')
print("✓ Saved store_assets/promo_marquee_1400x560.png")

# 4. Also create icons in other sizes needed
print("Creating additional icon sizes...")

# 48x48
icon_48 = create_gradient(48, 48)
draw = ImageDraw.Draw(icon_48)
draw_lightning_bolt(draw, 24, 24, 18)
icon_48.save('store_assets/icon_48.png')
print("✓ Saved store_assets/icon_48.png")

# 16x16
icon_16 = create_gradient(16, 16)
draw = ImageDraw.Draw(icon_16)
draw_lightning_bolt(draw, 8, 8, 6)
icon_16.save('store_assets/icon_16.png')
print("✓ Saved store_assets/icon_16.png")

print("\n✅ All assets created in 'store_assets' folder!")
print("\nFiles created:")
print("  - store_icon_128.png (Store Icon)")
print("  - promo_small_440x280.png (Small Promo Tile)")
print("  - promo_marquee_1400x560.png (Marquee Promo Tile)")
print("  - icon_48.png (48x48 icon)")
print("  - icon_16.png (16x16 icon)")
