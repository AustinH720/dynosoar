from PIL import Image, ImageDraw
import math

size = 512
img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

bg = (88, 80, 236, 255)  # indigo ~ hsl(243,72%,58%) roughly
radius = 110
draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=bg)

cx, cy = size / 2, size / 2
white = (255, 255, 255, 255)
r_dot = 34
draw.ellipse([cx - r_dot, cy - r_dot, cx + r_dot, cy + r_dot], fill=white)

# radiating hub lines (4 directions), rounded caps via thick lines
line_len_inner = 62
line_len_outer = 168
width = 34
for angle_deg in [0, 90, 180, 270]:
    a = math.radians(angle_deg)
    x1 = cx + line_len_inner * math.cos(a)
    y1 = cy + line_len_inner * math.sin(a)
    x2 = cx + line_len_outer * math.cos(a)
    y2 = cy + line_len_outer * math.sin(a)
    draw.line([x1, y1, x2, y2], fill=white, width=width)
    draw.ellipse([x2 - width/2, y2 - width/2, x2 + width/2, y2 + width/2], fill=white)

img.save("/home/user/workspace/command-center-app/client/public/favicon.png")
print("saved")
