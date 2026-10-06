# body.py <dir> <nosteamDir> frames... : the held fog's body over the backdrop (lit left / shaded right / crown) vs the backdrop, luma and R-B
import sys, numpy as np
from PIL import Image
S, N = sys.argv[1], sys.argv[2]
R = {'lit': (470, 640, 530, 700), 'mid': (590, 600, 650, 680), 'shade': (760, 640, 810, 700)}
L = lambda d, i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('RGB')).astype(float)
for i in map(int, sys.argv[3:]):
    a, b = L(S, i), L(N, i)
    out = []
    for k, (x0, y0, x1, y1) in R.items():
        ra, rb = a[y0:y1, x0:x1].reshape(-1, 3), b[y0:y1, x0:x1].reshape(-1, 3)
        la, lb = ra @ [0.2126, 0.7152, 0.0722], rb @ [0.2126, 0.7152, 0.0722]
        out.append(f'{k} {la.mean():.0f} (bg {lb.mean():.0f}, {la.mean() - lb.mean():+.0f}) R-B {(ra[:, 0] - ra[:, 2]).mean():+.1f}')
    print(f'{i * 0.016:.3f}s', '  '.join(out))
