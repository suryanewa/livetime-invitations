"""Defect crops: live | poster layer before | poster layer after, stacked, at device pixels."""
import json, sys
from PIL import Image, ImageDraw
def crop(view, scene, pose, rel, out, scale=1.0):
    m = json.load(open(f'before/{view}/meta.json'))
    dpr = m['dpr']
    fr = next(x for x in m['meta'] if x['scene'] == scene and x['pose'] == pose).get('frame')
    W, H = m['w'], m['h']
    if fr: fx, fy, fs = fr['x'], fr['y'], fr['size']
    else: fs = min(W, H); fx, fy = (W - fs) / 2, (H - fs) / 2
    # rel: (x0, y0, x1, y1) in frame-square fractions (may run outside it)
    box = tuple(int(round((f + r * fs) * dpr)) for f, r in zip((fx, fy, fx, fy), rel))
    ims = [Image.open(f'{d}/{view}/{scene}-{pose}-{k}.png').convert('RGB').crop(box) for d, k in (('after', 'live'), ('before', 'poster'), ('after', 'poster'))]
    w, h = ims[0].size
    S = Image.new('RGB', (w, 3 * h + 2 * 4 + 3 * 18), (255, 255, 255)); dr = ImageDraw.Draw(S)
    for i, (im, lab) in enumerate(zip(ims, ('live', 'poster layer v1.7 (9 % feather, bare backdrop / cover-crop)', 'poster layer v1.7 posters (frame square, 2 % inner feather, backdrop with the scene)'))):
        y = i * (h + 18 + 4); dr.text((4, y + 3), f'{view} {scene} {pose}: {lab}', fill=(0, 0, 0)); S.paste(im, (0, y + 18))
    if scale != 1: S = S.resize((int(S.width * scale), int(S.height * scale)))
    S.save(out, quality=90)
crop('laptop', 'sports', 'guest-ready', (-0.05, -0.04, 1.05, 0.22), 'crop-laptop-sports-board-top.jpg', 0.6)
crop('laptop', 'sports', 'accepted', (0.0, 0.72, 1.0, 1.03), 'crop-laptop-sports-accepted-bottom.jpg', 0.6)
crop('phone', 'sports', 'host-ready', (0.0, 0.70, 1.0, 1.05), 'crop-phone-sports-host-bottom.jpg', 0.5)
crop('laptop', 'business', 'accepted', (0.0, -0.3, 1.0, 0.25), 'crop-laptop-business-lanyard.jpg', 0.6)
crop('3x2', 'sports', 'host-ready', (-0.25, 0.0, 1.25, 1.0), 'crop-3x2-sports-host.jpg', 0.5)
crop('3x4', 'sports', 'declined', (0.0, -0.1667, 1.0, 1.1667), 'crop-3x4-sports-declined.jpg', 0.5)
