# ownlin.py <d12dir> frames : the steam's own LINEAR radiance (DEBUG 12: 0.5 * L where coverage > 0.5) on own.py's spans
# (rows 460-720, left 30 % = lit, right 30 % = shaded), medians and p10/p90, and the ratio lit/shaded.
import sys, numpy as np
from PIL import Image
for i in map(int, sys.argv[2:]):
    a = np.asarray(Image.open(f'{sys.argv[1]}/f{i:04d}.png').convert('L')).astype(float) * 2 / 255
    m = a > 0.02
    lit, sh = [], []
    for y in range(460, 720, 2):
        xs = np.nonzero(m[y, 300:1100])[0] + 300
        if len(xs) < 80: continue
        lo, hi = xs.min(), xs.max(); q = 0.3 * (hi - lo)
        lit += list(a[y, xs[xs < lo + q]]); sh += list(a[y, xs[xs > hi - q]])
    b = a[460:900][m[460:900]]
    if not lit: print(f'{i*0.016:.3f}s -'); continue
    p = lambda v, k: np.percentile(v, k)
    print(f'{i*0.016:.3f}s linear own: lit {np.median(lit):.2f} (p10 {p(lit,10):.2f} p90 {p(lit,90):.2f})  shaded {np.median(sh):.2f} (p10 {p(sh,10):.2f} p90 {p(sh,90):.2f})  ratio {np.median(lit)/max(np.median(sh),1e-3):.2f} | body p5 {p(b,5):.2f} p50 {p(b,50):.2f} p95 {p(b,95):.2f}')
