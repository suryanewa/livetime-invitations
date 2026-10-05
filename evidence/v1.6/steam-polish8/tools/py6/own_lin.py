# own_lin.py <debug12dir> frames... : the steam's own LINEAR radiance (DEBUG 12: 0.5 * L / coverage where coverage > 0.5,
# written raw), same rows / spans as own.py (rows 460-720, left 30 % lit vs right 30 % shaded): medians and their ratio.
import sys, numpy as np
from PIL import Image
for i in map(int, sys.argv[2:]):
    raw = np.asarray(Image.open(f'{sys.argv[1]}/f{i:04d}.png').convert('RGB')).astype(float)
    a = raw[..., 1] / 255 * 2
    n = np.asarray(Image.open(f"nos/f{i:04d}.png").convert("RGB")).astype(float)
    m = (a > 0.02) & (np.abs(raw - n).sum(-1) > 0) & (raw[..., 0] == raw[..., 2])
    lit, sh = [], []
    for y in range(460, 720, 2):
        xs = np.nonzero(m[y, 300:1100])[0] + 300
        if len(xs) < 80: continue
        lo, hi = xs.min(), xs.max(); q = 0.3 * (hi - lo)
        lit += list(a[y, xs[xs < lo + q]]); sh += list(a[y, xs[xs > hi - q]])
    if not lit: print(f'{i*0.016:.3f}s -'); continue
    b = a[460:900][m[460:900]]
    print(f'{i*0.016:.3f}s own linear: lit {np.median(lit):.2f} shaded {np.median(sh):.2f} ratio {np.median(lit)/max(1e-3,np.median(sh)):.2f} | body p5 {np.percentile(b,5):.2f} p50 {np.percentile(b,50):.2f} p95 {np.percentile(b,95):.2f}')
