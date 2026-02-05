from PIL import Image, ImageDraw

def draw_lightning_bolt(draw, center_x, center_y, size, color='white'):
    """Draw a lightning bolt icon - same style as store icon"""
    s = size / 24
    
    # Lightning bolt points (the filled lightning shape - matches store icon exactly)
    points = [
        (center_x + 1*s, center_y - 10*s),   # top point
        (center_x - 5*s, center_y + 2*s),    # middle left
        (center_x - 1*s, center_y + 2*s),    # inner left
        (center_x - 3*s, center_y + 10*s),   # bottom point
        (center_x + 5*s, center_y - 2*s),    # middle right
        (center_x + 1*s, center_y - 2*s),    # inner right
    ]
    
    draw.polygon(points, fill=color)

def create_icon(size, filename):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Calculate margins and radius for rounded rectangle
    margin = size // 8
    radius = size // 4
    
    # Draw black rounded rectangle background
    draw.rounded_rectangle([margin, margin, size-margin, size-margin], radius=radius, fill='black')
    
    # Draw lightning bolt centered in the icon
    center = size // 2
    bolt_size = size * 0.7  # Scale bolt relative to icon size
    draw_lightning_bolt(draw, center, center, bolt_size, 'white')
    
    img.save(filename)
    print(f"Created {filename}")

create_icon(16, 'icon16.png')
create_icon(48, 'icon48.png')
create_icon(128, 'icon128.png')
