# gush.py <dir> frames... : the release outside the cloche's silhouette (mask/ = DEBUG 13 frames, the cloche white): the steam's
# brightening over the no-steam twin outside the silhouette (dilated 3 px): its area (px > 8 levels) and p95; and on the cloche's
# flank (inside the silhouette, eroded 3 px): its p95 and mean (the wash).
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
from maskutil import cloche
L = lambda d, i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
for i in map(int, sys.argv[2:]):
    m = cloche(f'mask/f{i:04d}.png')
    d = L(sys.argv[1], i) - L('nos', i)
    out = ~nd.binary_dilation(m, iterations=3); inn = nd.binary_erosion(m, iterations=3)
    s = out & (d > 8)
    fl = d[inn]
    print(f'{i * 0.016:.3f}s outside: area {s.sum():6d} px  p95 {np.percentile(d[s], 95) if s.any() else 0:5.1f}  p50 {np.percentile(d[s], 50) if s.any() else 0:5.1f} | flank: p95 {np.percentile(fl, 95):5.1f} mean {fl.mean():+.1f} px>8 {(fl > 8).sum()}')
