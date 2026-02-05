#!/usr/bin/env python3
"""
Generate Chrome Web Store screenshots for Job Application Autofill extension
Requirements: pip3 install Pillow
Dimensions: 1280x800 or 640x400
"""

from PIL import Image, ImageDraw, ImageFont
import os

# Create store_assets directory if it doesn't exist
os.makedirs('store_assets', exist_ok=True)

def get_font(size, bold=False):
    """Try to get a nice font, fall back to default"""
    font_paths = [
        "/System/Library/Fonts/SF-Pro-Display-Regular.otf",
        "/System/Library/Fonts/SFNSDisplay.ttf", 
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    bold_paths = [
        "/System/Library/Fonts/SF-Pro-Display-Bold.otf",
        "/System/Library/Fonts/SFNSDisplay.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    
    paths = bold_paths if bold else font_paths
    for path in paths:
        try:
            return ImageFont.truetype(path, size)
        except:
            continue
    return ImageFont.load_default()

def draw_rounded_rect(draw, coords, radius, fill=None, outline=None, width=1):
    """Draw a rounded rectangle"""
    x1, y1, x2, y2 = coords
    draw.rounded_rectangle(coords, radius=radius, fill=fill, outline=outline, width=width)

def create_screenshot_1():
    """Screenshot 1: Extension popup with profile data"""
    width, height = 1280, 800
    img = Image.new('RGB', (width, height), '#f5f5f5')
    draw = ImageDraw.Draw(img)
    
    # Background gradient simulation
    for y in range(height):
        gray = int(245 - (y / height) * 10)
        draw.line([(0, y), (width, y)], fill=(gray, gray, gray + 5))
    
    # Draw browser chrome mockup at top
    draw.rectangle([0, 0, width, 80], fill='#dee1e6')
    draw.rectangle([0, 75, width, 80], fill='#ccc')
    
    # URL bar
    draw_rounded_rect(draw, [200, 20, 900, 55], 8, fill='white', outline='#ccc')
    url_font = get_font(14)
    draw.text((220, 30), "jobs.greenhouse.io/company/apply", fill='#333', font=url_font)
    
    # Browser dots
    draw.ellipse([30, 30, 45, 45], fill='#ff5f57')
    draw.ellipse([55, 30, 70, 45], fill='#febc2e')
    draw.ellipse([80, 30, 95, 45], fill='#28c840')
    
    # Extension popup (main focus)
    popup_x, popup_y = 780, 85
    popup_w, popup_h = 420, 580
    
    # Popup shadow
    draw.rounded_rectangle([popup_x+5, popup_y+5, popup_x+popup_w+5, popup_y+popup_h+5], 
                          radius=12, fill='#00000033')
    
    # Popup background
    draw.rounded_rectangle([popup_x, popup_y, popup_x+popup_w, popup_y+popup_h], 
                          radius=12, fill='white', outline='#e0e0e0')
    
    # Header
    draw.rectangle([popup_x, popup_y, popup_x+popup_w, popup_y+60], fill='white')
    draw.rounded_rectangle([popup_x, popup_y, popup_x+popup_w, popup_y+30], radius=12, fill='white')
    
    # Header icon and text
    title_font = get_font(18, bold=True)
    subtitle_font = get_font(12)
    draw.text((popup_x+50, popup_y+15), "Job Autofill", fill='#000', font=title_font)
    draw.text((popup_x+50, popup_y+38), "Fill applications instantly", fill='#888', font=subtitle_font)
    
    # Lightning icon in header
    draw.rounded_rectangle([popup_x+12, popup_y+12, popup_x+40, popup_y+48], radius=6, fill='#000')
    # Simple lightning bolt
    lightning_points = [
        (popup_x+28, popup_y+18), (popup_x+20, popup_y+32), (popup_x+25, popup_y+32),
        (popup_x+22, popup_y+42), (popup_x+32, popup_y+28), (popup_x+27, popup_y+28)
    ]
    draw.polygon(lightning_points, fill='white')
    
    # Site toggle
    toggle_y = popup_y + 65
    draw.rectangle([popup_x, toggle_y, popup_x+popup_w, toggle_y+45], fill='#fafafa')
    draw.line([popup_x, toggle_y+45, popup_x+popup_w, toggle_y+45], fill='#eee')
    site_font = get_font(13, bold=True)
    small_font = get_font(11)
    draw.text((popup_x+40, toggle_y+8), "greenhouse.io", fill='#000', font=site_font)
    draw.text((popup_x+40, toggle_y+25), "Enable for this site", fill='#666', font=small_font)
    # Toggle switch (on)
    draw.rounded_rectangle([popup_x+popup_w-60, toggle_y+12, popup_x+popup_w-20, toggle_y+34], radius=11, fill='#22c55e')
    draw.ellipse([popup_x+popup_w-42, toggle_y+14, popup_x+popup_w-24, toggle_y+32], fill='white')
    
    # Autofill button
    btn_y = toggle_y + 50
    draw.rounded_rectangle([popup_x, btn_y, popup_x+popup_w, btn_y+50], radius=0, fill='#000')
    btn_font = get_font(15, bold=True)
    draw.text((popup_x+140, btn_y+15), "⚡ Autofill This Page", fill='white', font=btn_font)
    
    # Tabs
    tab_y = btn_y + 55
    tab_font = get_font(12)
    tabs = ['Parameters', 'Docs', 'AI', 'Settings']
    tab_w = popup_w // 4
    for i, tab in enumerate(tabs):
        tx = popup_x + i * tab_w
        color = '#000' if i == 0 else '#888'
        draw.text((tx + 25, tab_y + 8), tab, fill=color, font=tab_font)
        if i == 0:
            draw.line([tx+10, tab_y+30, tx+tab_w-10, tab_y+30], fill='#000', width=2)
    draw.line([popup_x, tab_y+32, popup_x+popup_w, tab_y+32], fill='#eee')
    
    # Section header
    section_y = tab_y + 45
    draw.rounded_rectangle([popup_x+15, section_y, popup_x+popup_w-15, section_y+40], radius=8, fill='#fafafa')
    section_font = get_font(11, bold=True)
    draw.text((popup_x+45, section_y+12), "PERSONAL INFO", fill='#666', font=section_font)
    
    # Form fields
    fields = [
        ("First Name", "Tomás"),
        ("Last Name", "Batalha"),
        ("Full Name", "Tomás Batalha"),
        ("Email", "tomas.b.batalha@gmail.com"),
        ("Phone", "+351936124118"),
    ]
    
    field_y = section_y + 50
    field_font = get_font(11)
    value_font = get_font(13)
    
    for label, value in fields:
        # Field container
        draw.rounded_rectangle([popup_x+15, field_y, popup_x+popup_w-15, field_y+60], 
                              radius=8, outline='#e5e5e5', fill='white')
        # Drag handle dots
        for dy in [20, 28, 36]:
            draw.ellipse([popup_x+22, field_y+dy-2, popup_x+26, field_y+dy+2], fill='#ccc')
            draw.ellipse([popup_x+30, field_y+dy-2, popup_x+34, field_y+dy+2], fill='#ccc')
        # Label and value
        draw.text((popup_x+45, field_y+8), label, fill='#888', font=field_font)
        draw.rounded_rectangle([popup_x+45, field_y+25, popup_x+popup_w-25, field_y+50], 
                              radius=4, outline='#e5e5e5', fill='white')
        draw.text((popup_x+52, field_y+30), value, fill='#000', font=value_font)
        field_y += 68
    
    # Fake job application form on the left side
    form_x, form_y = 50, 100
    form_w = 680
    
    # Form card
    draw.rounded_rectangle([form_x, form_y, form_x+form_w, form_y+580], radius=12, fill='white', outline='#e0e0e0')
    
    # Form header
    header_font = get_font(24, bold=True)
    draw.text((form_x+30, form_y+25), "Software Engineer - Application", fill='#000', font=header_font)
    draw.text((form_x+30, form_y+60), "Acme Corp • San Francisco, CA", fill='#666', font=get_font(14))
    
    # Progress bar
    draw.rounded_rectangle([form_x+30, form_y+95, form_x+form_w-30, form_y+103], radius=4, fill='#e5e5e5')
    draw.rounded_rectangle([form_x+30, form_y+95, form_x+200, form_y+103], radius=4, fill='#22c55e')
    draw.text((form_x+form_w-100, form_y+88), "Step 1 of 3", fill='#888', font=small_font)
    
    # Form fields with autofill buttons
    form_fields = [
        ("First Name *", "Tomás", True),
        ("Last Name *", "Batalha", True),
        ("Email *", "tomas.b.batalha@gmail.com", True),
        ("Phone *", "+351936124118", True),
        ("LinkedIn URL", "linkedin.com/in/tomasbatalha", True),
    ]
    
    fy = form_y + 130
    for label, value, filled in form_fields:
        draw.text((form_x+30, fy), label, fill='#333', font=get_font(12))
        # Input field
        input_fill = '#f0fdf4' if filled else 'white'
        input_outline = '#22c55e' if filled else '#e5e5e5'
        draw.rounded_rectangle([form_x+30, fy+20, form_x+form_w-100, fy+55], 
                              radius=6, fill=input_fill, outline=input_outline)
        draw.text((form_x+40, fy+30), value, fill='#000', font=get_font(13))
        
        # Autofill button (green check if filled)
        if filled:
            draw.rounded_rectangle([form_x+form_w-90, fy+22, form_x+form_w-35, fy+53], 
                                  radius=6, fill='#22c55e')
            draw.text((form_x+form_w-75, fy+30), "✓", fill='white', font=get_font(16, bold=True))
        else:
            draw.rounded_rectangle([form_x+form_w-90, fy+22, form_x+form_w-35, fy+53], 
                                  radius=6, fill='#000')
            draw.text((form_x+form_w-82, fy+29), "Fill", fill='white', font=get_font(12))
        
        fy += 80
    
    # Tagline at bottom
    tagline_font = get_font(16, bold=True)
    draw.text((form_x+150, form_y+530), "🚀 Filled 5 fields instantly!", fill='#22c55e', font=tagline_font)
    
    img.save('store_assets/screenshot_1_popup.png', 'PNG')
    print("✓ Created store_assets/screenshot_1_popup.png (1280x800)")

def create_screenshot_2():
    """Screenshot 2: AI-powered responses"""
    width, height = 1280, 800
    img = Image.new('RGB', (width, height), '#f5f5f5')
    draw = ImageDraw.Draw(img)
    
    # Background
    for y in range(height):
        gray = int(245 - (y / height) * 10)
        draw.line([(0, y), (width, y)], fill=(gray, gray, gray + 5))
    
    # Main card
    card_x, card_y = 100, 80
    card_w, card_h = 1080, 620
    draw.rounded_rectangle([card_x+6, card_y+6, card_x+card_w+6, card_y+card_h+6], radius=16, fill='#00000022')
    draw.rounded_rectangle([card_x, card_y, card_x+card_w, card_y+card_h], radius=16, fill='white')
    
    # Header
    header_font = get_font(22, bold=True)
    draw.text((card_x+40, card_y+30), "Why do you want to work at Acme Corp?", fill='#000', font=header_font)
    draw.text((card_x+40, card_y+65), "Cover letter / Motivation", fill='#888', font=get_font(13))
    
    # AI button (highlighted)
    ai_btn_x = card_x + card_w - 180
    # Gradient-like purple button
    draw.rounded_rectangle([ai_btn_x, card_y+30, ai_btn_x+140, card_y+65], radius=8, fill='#667eea')
    draw.text((ai_btn_x+20, card_y+40), "✨ Fill with AI", fill='white', font=get_font(13, bold=True))
    
    # Text area with AI-generated content
    textarea_y = card_y + 100
    draw.rounded_rectangle([card_x+40, textarea_y, card_x+card_w-40, textarea_y+380], 
                          radius=12, fill='#fafafa', outline='#667eea', width=2)
    
    ai_response = """Dear Hiring Team,

I am excited to apply for the Software Engineer position at Acme Corp. With my background in full-stack development and passion for building scalable applications, I believe I would be a valuable addition to your team.

During my time at my current role, I have:
• Led the development of a microservices architecture serving 1M+ users
• Implemented CI/CD pipelines reducing deployment time by 60%
• Mentored junior developers and conducted code reviews

What draws me to Acme Corp is your commitment to innovation and your mission to democratize technology. I'm particularly impressed by your recent work on [specific project], which aligns perfectly with my interests in distributed systems.

I would love the opportunity to contribute to your team and help build products that make a real difference.

Best regards,
Tomás Batalha"""
    
    # Draw the AI response text
    y_offset = textarea_y + 20
    text_font = get_font(13)
    for line in ai_response.split('\n'):
        draw.text((card_x+60, y_offset), line, fill='#333', font=text_font)
        y_offset += 22
    
    # AI indicator
    draw.rounded_rectangle([card_x+60, textarea_y+350, card_x+220, textarea_y+370], radius=4, fill='#f0f4ff')
    draw.text((card_x+70, textarea_y+352), "✨ Generated by AI", fill='#667eea', font=get_font(11))
    
    # Character count
    draw.text((card_x+card_w-150, textarea_y+350), "1,247 / 2,000", fill='#888', font=get_font(11))
    
    # Feature callouts at bottom
    features = [
        ("🎯", "Tailored to Job", "AI reads job description"),
        ("📄", "Uses Your CV", "Matches your experience"),
        ("⚡", "One Click", "Generate in seconds"),
    ]
    
    feat_y = card_y + card_h - 100
    feat_x = card_x + 100
    for icon, title, desc in features:
        draw.text((feat_x, feat_y), icon, fill='#000', font=get_font(28))
        draw.text((feat_x+45, feat_y+5), title, fill='#000', font=get_font(14, bold=True))
        draw.text((feat_x+45, feat_y+25), desc, fill='#888', font=get_font(11))
        feat_x += 300
    
    # Main headline
    headline_font = get_font(20, bold=True)
    draw.text((width//2 - 200, height - 60), "AI-Powered Cover Letters & Responses", fill='#667eea', font=headline_font)
    
    img.save('store_assets/screenshot_2_ai.png', 'PNG')
    print("✓ Created store_assets/screenshot_2_ai.png (1280x800)")

def create_screenshot_3():
    """Screenshot 3: Feature overview"""
    width, height = 1280, 800
    img = Image.new('RGB', (width, height), '#000')
    draw = ImageDraw.Draw(img)
    
    # Dark gradient background
    for y in range(height):
        val = int(15 + (y / height) * 10)
        draw.line([(0, y), (width, y)], fill=(val, val, val+5))
    
    # Main title
    title_font = get_font(42, bold=True)
    draw.text((width//2 - 280, 60), "Job Autofill", fill='white', font=title_font)
    
    subtitle_font = get_font(20)
    draw.text((width//2 - 220, 120), "Fill job applications 10x faster", fill='#888', font=subtitle_font)
    
    # Lightning bolt icon
    bolt_x, bolt_y = width//2 - 350, 70
    draw.rounded_rectangle([bolt_x, bolt_y, bolt_x+50, bolt_y+50], radius=10, fill='white')
    bolt_points = [
        (bolt_x+28, bolt_y+8), (bolt_x+18, bolt_y+28), (bolt_x+24, bolt_y+28),
        (bolt_x+22, bolt_y+42), (bolt_x+34, bolt_y+22), (bolt_x+28, bolt_y+22)
    ]
    draw.polygon(bolt_points, fill='#000')
    
    # Feature cards
    features = [
        ("⚡", "One-Click Fill", "Fill entire forms with a single click. Your profile data is saved and ready to use.", "#22c55e"),
        ("🤖", "AI Responses", "Generate tailored cover letters and answers to open-ended questions.", "#667eea"),
        ("📄", "Smart CV Match", "Automatically suggests the best CV for each job application.", "#f59e0b"),
        ("🎯", "Field Detection", "Intelligently detects form fields on any job board.", "#ec4899"),
    ]
    
    card_w, card_h = 280, 200
    start_x = 80
    card_y = 220
    
    for i, (icon, title, desc, color) in enumerate(features):
        cx = start_x + i * (card_w + 20)
        
        # Card background
        draw.rounded_rectangle([cx, card_y, cx+card_w, card_y+card_h], radius=16, fill='#1a1a2e')
        
        # Icon circle
        draw.ellipse([cx+20, card_y+20, cx+70, card_y+70], fill=color)
        draw.text((cx+35, card_y+30), icon, fill='white', font=get_font(24))
        
        # Title and description
        draw.text((cx+20, card_y+90), title, fill='white', font=get_font(16, bold=True))
        
        # Word wrap description
        words = desc.split()
        lines = []
        current_line = ""
        for word in words:
            if len(current_line + " " + word) < 30:
                current_line += " " + word if current_line else word
            else:
                lines.append(current_line)
                current_line = word
        lines.append(current_line)
        
        dy = card_y + 120
        for line in lines:
            draw.text((cx+20, dy), line, fill='#aaa', font=get_font(12))
            dy += 18
    
    # Supported sites
    sites_y = 480
    draw.text((width//2 - 100, sites_y), "Works with:", fill='#666', font=get_font(14))
    
    sites = ["Greenhouse", "Lever", "Workday", "LinkedIn", "Indeed", "& 50+ more"]
    site_x = 200
    for site in sites:
        draw.rounded_rectangle([site_x, sites_y+35, site_x+120, sites_y+65], radius=20, fill='#1a1a2e')
        draw.text((site_x+15, sites_y+42), site, fill='#888', font=get_font(12))
        site_x += 140
    
    # Stats
    stats_y = 600
    stats = [("10x", "Faster Applications"), ("50+", "Supported Sites"), ("100%", "Privacy First")]
    stat_x = 250
    for value, label in stats:
        draw.text((stat_x, stats_y), value, fill='#22c55e', font=get_font(48, bold=True))
        draw.text((stat_x, stats_y+60), label, fill='#888', font=get_font(14))
        stat_x += 300
    
    img.save('store_assets/screenshot_3_features.png', 'PNG')
    print("✓ Created store_assets/screenshot_3_features.png (1280x800)")

# Generate all screenshots
print("Generating Chrome Web Store screenshots (1280x800)...")
create_screenshot_1()
create_screenshot_2()
create_screenshot_3()
print("\n✅ All screenshots saved to store_assets/")
