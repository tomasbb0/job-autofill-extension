from PIL import Image, ImageDraw

def create_icon(size, filename):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    margin = size // 8
    radius = size // 4
    draw.rounded_rectangle([margin, margin, size-margin, size-margin], radius=radius, fill='black')
    
    s = size / 24
    points = [
        (13*s, 3*s),
        (4*s, 14*s),
        (11*s, 14*s),
        (11*s, 21*s),
        (20*s, 10*s),
        (13*s, 10*s),
        (13*s, 3*s)
    ]
    draw.polygon(points, fill='white')
    
    img.save(filename)
    print(f"Created {filename}")

create_icon(16, 'icon16.png')
create_icon(48, 'icon48.png')
create_icon(128, 'icon128.png')
