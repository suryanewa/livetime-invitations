# cov.py <debug1dir> frames : coverage (DEBUG 1: red = 1 - T) by depth inside the steam's outline (distance transform of the
# largest covered component, cov > THR, holes filled), above the plate's far rim (y < 700): mean coverage per depth ring.
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage as nd
THR = float(os.environ.get('THR', 0.08)); YMAX = int(os.environ.get('YMAX', 700))
rings = [(4, 16), (16, 32), (32, 64), (64, 128), (128, 400)]
for i in map(int, sys.argv[2:]):
    a = np.asarray(Image.open(f'{sys.argv[1]}/f{i:04d}.png').convert('RGB')).astype(float)
    box = (a[..., 1] < 3) & (a[..., 2] < 3)
    cov = np.where(box, a[..., 0] / 255.0, 0.0)
    m = nd.binary_opening(cov > THR, iterations=1)
    lab, n = nd.label(m); sz = nd.sum(m, lab, range(1, n + 1)); m = lab == (1 + int(np.argmax(sz)))
    m = nd.binary_fill_holes(m)
    dt = nd.distance_transform_edt(m)
    sel = np.zeros_like(m); sel[:YMAX] = True
    out = []
    vals = {}
    for r0, r1 in rings:
        k = m & sel & (dt >= r0) & (dt < r1)
        vals[(r0, r1)] = cov[k].mean() if k.sum() > 50 else float('nan')
        out.append(f'{r0}-{r1}: {vals[(r0, r1)]:.2f}')
    ring = cov[m & sel & (dt >= 27) & (dt < 54)].mean(); core = cov[m & sel & (dt >= 64)].mean() if (m & sel & (dt >= 64)).sum() > 50 else float('nan')
    print(f'{i * 0.016:.3f}s', ' | '.join(out), f'|| 1-2 cm ring {ring:.2f} core(>64) {core:.2f} ratio {core / ring:.2f}')
