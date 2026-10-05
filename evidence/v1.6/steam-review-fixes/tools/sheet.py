# sheet.py <out.png> <crop y0,y1,x0,x1> <scale> <twin> <label:dir,...> frames... : rows per dir of the frame crop, then rows of
# the steam's brightening over the no-steam twin (x4, 0 = black), each tile labelled with its time
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
out, crop, sc, tw = sys.argv[1], [int(v) for v in sys.argv[2].split(',')], float(sys.argv[3]), sys.argv[4]
dirs = [d.split(':') for d in sys.argv[5].split(',')]; frames = [int(v) for v in sys.argv[6:]]
y0, y1, x0, x1 = crop
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
RGB = lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float)
def tile(a, text):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((int((x1 - x0) * sc), int((y1 - y0) * sc)), Image.LANCZOS)
    ImageDraw.Draw(im).text((8, 6), text, fill=(200, 30, 30), font=font); return np.asarray(im)
rows = []
for label, d in dirs:
    rows.append(np.concatenate([tile(RGB(f'{d}/f{i:04d}.png')[y0:y1, x0:x1], f'{label} {i*0.016:.3f}s') for i in frames], 1))
for label, d in dirs:
    t = []
    for i in frames:
        B = (RGB(f'{d}/f{i:04d}.png') - RGB(f'{tw}/f{i:04d}.png')) @ [0.2126, 0.7152, 0.0722]
        g = np.clip(B * 4, 0, 255)[y0:y1, x0:x1]
        t.append(tile(np.stack([g] * 3, -1), f'{label} x4 {i*0.016:.3f}s'))
    rows.append(np.concatenate(t, 1))
sep = lambda r: np.concatenate([r, np.full((4, r.shape[1], 3), 255, np.uint8)], 0)
Image.fromarray(np.concatenate([sep(r) for r in rows], 0)).save(out, optimize=True)
print(out, rows[0].shape)
