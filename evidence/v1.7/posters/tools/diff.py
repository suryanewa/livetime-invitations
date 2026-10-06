"""Poster layer vs live: per scene/pose diff in the frame square and outside it, plus a sheet.
usage: python3 diff.py <capture dir> <label> <sheet out (jpg)> [<json out>]
The frame square: getFrame() in fullscreen; the centred inscribed square of the stage in the embed.
Both images are box-reduced so the frame square is ~180 px (as posters.spec reduces 720 -> 180), then
a pixel's difference is its largest channel difference; 'over' counts pixels over 24/255."""
import json, sys, os
import numpy as np
from PIL import Image, ImageDraw
d, label, sheet = sys.argv[1], sys.argv[2], sys.argv[3]
jout = sys.argv[4] if len(sys.argv) > 4 else None
meta = json.load(open(os.path.join(d, 'meta.json')))
W, H, dpr = meta['w'], meta['h'], meta['dpr']
rows, cells = [], []
for m in meta['meta']:
    sc, pose = m['scene'], m['pose']
    live = Image.open(os.path.join(d, f'{sc}-{pose}-live.png')).convert('RGB')
    post = Image.open(os.path.join(d, f'{sc}-{pose}-poster.png')).convert('RGB')
    fr = m.get('frame')
    if fr: fx, fy, fs = fr['x'], fr['y'], fr['size']
    else:
        fs = min(W, H); fx, fy = (W - fs) / 2, (H - fs) / 2
    k = max(1, round(fs * dpr / 180))
    a = np.asarray(live.reduce(k), dtype=np.int16); b = np.asarray(post.reduce(k), dtype=np.int16)
    h, w = min(a.shape[0], b.shape[0]), min(a.shape[1], b.shape[1]); a, b = a[:h, :w], b[:h, :w]
    diff = np.abs(a - b).max(axis=2)
    s = dpr / k
    x0, y0, x1, y1 = int(round(fx * s)), int(round(fy * s)), int(round((fx + fs) * s)), int(round((fy + fs) * s))
    inside = np.zeros_like(diff, dtype=bool); inside[max(0, y0):y1, max(0, x0):x1] = True
    # the edge band: the outer 9 % of the frame square (the v1.6 feather's width)
    band = inside.copy(); bw = int(round(0.09 * fs * s)); band[y0 + bw:y1 - bw, x0 + bw:x1 - bw] = False
    core = inside & ~band
    def st(mask):
        if not mask.any(): return None
        v = diff[mask]; return {'max': int(v.max()), 'over': round(float((v > 24).mean() * 100), 3), 'mean': round(float(v.mean()), 2)}
    r = {'view': label, 'scene': sc, 'pose': pose, 'frame': st(inside), 'core': st(core), 'band': st(band), 'outside': st(~inside)}
    rows.append(r)
    f = lambda x: '-' if x is None else f"max {x['max']:3d} {x['over']:6.2f}%"
    print(f"{label:6s} {sc:8s} {pose:11s} frame {f(r['frame'])} | core {f(r['core'])} | band {f(r['band'])} | outside {f(r['outside'])}")
    heat = Image.fromarray(np.clip(diff * 4, 0, 255).astype(np.uint8)).convert('RGB')
    dr = ImageDraw.Draw(heat); dr.rectangle([x0, y0, x1 - 1, y1 - 1], outline=(255, 64, 64))
    cells.append((sc, pose, Image.fromarray(a.astype(np.uint8)), Image.fromarray(b.astype(np.uint8)), heat))
if jout: json.dump(rows, open(jout, 'w'), indent=1)
# sheet: per scene a row; per pose three tiles (live, poster layer, diff x4 with the frame square in red)
cw, ch = cells[0][2].size
scale = min(1.0, 220 / max(cw, ch)); tw, th = int(cw * scale), int(ch * scale)
scenes = list(dict.fromkeys(c[0] for c in cells)); poses = list(dict.fromkeys(c[1] for c in cells))
pad, head = 6, 18
S = Image.new('RGB', (len(poses) * (3 * tw + 2 * 2 + pad) + pad, len(scenes) * (th + head) + pad + head), (250, 250, 250))
dr = ImageDraw.Draw(S)
dr.text((pad, 3), f'{label}: per pose live | poster layer | |diff| x4 (frame square red)', fill=(0, 0, 0))
for c in cells:
    i, j = scenes.index(c[0]), poses.index(c[1])
    x = pad + j * (3 * tw + 4 + pad); y = head + i * (th + head) + head
    dr.text((x, y - 14), f'{c[0]} {c[1]}', fill=(0, 0, 0))
    for t, im in enumerate(c[2:]): S.paste(im.resize((tw, th)), (x + t * (tw + 2), y))
S.save(sheet, quality=88)
