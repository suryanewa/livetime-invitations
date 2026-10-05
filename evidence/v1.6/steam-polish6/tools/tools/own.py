# own.py <debug14dir> frames... : the steam's own colour (DEBUG 14: tone-mapped, unpremultiplied where it covers > 1/3) across the
# body: rows y 460-720 (above the plate's far rim), per row the covered span's left 30 % (lit) and right 30 % (shaded) medians
# (luma levels) and their difference; the body's p5-p95 (y 460-900).
import sys, numpy as np
from PIL import Image
for i in map(int, sys.argv[2:]):
    a = np.asarray(Image.open(f'{sys.argv[1]}/f{i:04d}.png').convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
    m = (a > 20) & (np.asarray(Image.open(f"nos/f{i:04d}.png").convert("L")).astype(float) != a)
    lit, sh = [], []
    for y in range(460, 720, 2):
        xs = np.nonzero(m[y, 300:1100])[0] + 300
        if len(xs) < 80: continue
        lo, hi = xs.min(), xs.max(); q = 0.3 * (hi - lo)
        lit += list(a[y, xs[xs < lo + q]]); sh += list(a[y, xs[xs > hi - q]])
    b = a[460:900][m[460:900]]
    if not lit: print(f'{i*0.016:.3f}s -'); continue
    print(f'{i * 0.016:.3f}s own: lit {np.median(lit):.0f}  shaded {np.median(sh):.0f}  lit-shaded {np.median(lit) - np.median(sh):+.0f}  body p5 {np.percentile(b, 5):.0f} p95 {np.percentile(b, 95):.0f} (p5-p95 {np.percentile(b, 95) - np.percentile(b, 5):.0f})')
