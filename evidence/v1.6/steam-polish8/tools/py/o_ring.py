# ring.py <dir> <nosteamDir> frames... : contrast inside the cap/ring (0.9-1.3 s): luma p95 - p5 over the dense steam (> 30 above the background) in the ring's box, and its lit-top vs shaded-underside difference
import sys, numpy as np
from PIL import Image
S, N = sys.argv[1], sys.argv[2]
for i in map(int, sys.argv[3:]):
    a = np.asarray(Image.open(f'{S}/f{i:04d}.png').convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
    b = np.asarray(Image.open(f'{N}/f{i:04d}.png').convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
    x0, x1, y0, y1 = 430, 980, 380, 800
    A, B = a[y0:y1, x0:x1], b[y0:y1, x0:x1]
    m = (A - B) > 30
    if m.sum() < 100: print(f'{i * 0.016:.3f}s -'); continue
    v = A[m]
    print(f'{i * 0.016:.3f}s dense steam {m.sum()} px  luma p5 {np.percentile(v, 5):.0f} p50 {np.percentile(v, 50):.0f} p95 {np.percentile(v, 95):.0f}  contrast p95-p5 {np.percentile(v, 95) - np.percentile(v, 5):.0f}')
