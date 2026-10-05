# flank.py <dir> frames... : the body's light across it (laptop 1240² view): the dense steam (> 30 levels above the no-steam twin)
# between y 460 and 720 (above the plate's far rim), off the cloche (no-steam structure masked); per row, the steam's span's left
# 30 % (lit: the key is front-left) and right 30 % (shaded): their medians and difference (levels); the dense body's p5-p95.
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
L = lambda d, i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
for i in map(int, sys.argv[2:]):
    s, n = L(sys.argv[1], i), L('nos', i)
    clean = ~nd.binary_dilation(nd.gaussian_gradient_magnitude(n, 2.0) > 1.5, iterations=6)
    m = ((s - n) > 30)
    lit, sh, body = [], [], []
    for y in range(460, 720, 2):
        xs = np.nonzero(m[y, 300:1100])[0] + 300
        if len(xs) < 80: continue
        a, b = xs.min(), xs.max(); q = 0.3 * (b - a)
        ok = clean[y, xs]
        row = s[y]
        lit += list(row[xs[ok & (xs < a + q)]]); sh += list(row[xs[ok & (xs > b - q)]]); body += list(row[xs[ok]])
    if not body or not lit or not sh: print(f'{i*0.016:.3f}s -'); continue
    print(f'{i * 0.016:.3f}s lit {np.median(lit):.0f}  shaded {np.median(sh):.0f}  lit-shaded {np.median(lit) - np.median(sh):+.0f}  ({len(lit)}/{len(sh)} px)  body p5-p95 {np.percentile(body, 95) - np.percentile(body, 5):.0f}')
