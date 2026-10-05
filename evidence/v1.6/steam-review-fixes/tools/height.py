# height.py <probeDir> <twin> <dirs,...> frames... : the seating puffs' height above the seat (cm), world-anchored:
# the brightening (B > thr over the no-steam twin) in a band of columns round the rim's front point, its weighted
# centroid row, measured from the seated rim's front point's projected row in the scale (px/su) projected there.
import sys, json, numpy as np
from PIL import Image
SEAT = np.array([0, 0.0946, 0]); R = 0.6534; SU_CM = 16.875; thr = 4
L = lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
pd, tw, dirs = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
def proj(vp, rect, P):
    M = np.array(vp).reshape(4, 4).T; c = M @ np.array([*P, 1.0]); n = c[:3] / c[3]
    x = rect['left'] + (n[0] + 1) / 2 * rect['width']; y = rect['top'] + (1 - n[1]) / 2 * rect['height']
    return (x - 180) * 2, (y - 100) * 2
print('t      ' + '  '.join(f'{d:>26s}' for d in dirs))
for i in map(int, sys.argv[4:]):
    pj = json.load(open(f'{pd}/p{i:04d}.json')); vp, rect, cam = pj['probe']['vp'], pj['rect'], np.array(pj['probe']['cam'])
    d = cam[[0, 2]] - SEAT[[0, 2]]; d /= np.linalg.norm(d)
    F = SEAT + np.array([d[0], 0, d[1]]) * (R + 0.2)
    x0, r0 = proj(vp, rect, F); _, r1 = proj(vp, rect, F + [0, 0.25, 0]); s = (r0 - r1) / 0.25
    out = []
    for dd in dirs:
        B = L(f'{dd}/f{i:04d}.png') - L(f'{tw}/f{i:04d}.png')
        H, W = B.shape; yy, xx = np.mgrid[0:H, 0:W]
        m = (B > thr) & (np.abs(xx - x0) < 250) & (yy > r0 - 0.6 * s) & (yy < r0 + 0.3 * s)
        w = np.where(m, B, 0); tot = w.sum()
        if tot <= 0: out.append(f'{"-":>26s}'); continue
        rc = (yy * w).sum() / tot
        out.append(f'h {(r0 - rc) / s * SU_CM:5.2f} cm n {int(m.sum()):5d} B {B[m].mean():4.1f}')
    print(f'{i*0.016:.3f}s ' + '  '.join(out) + f'   (front row {r0:6.1f}, {s:5.1f} px/su)')
