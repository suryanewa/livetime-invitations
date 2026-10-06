# cap.py <dir> frames... : the fog cap on the returning dome (decline at 0.5 s): the steam's brightening over the no-steam twin
# (dec05n) in a 2.5 cm band (68 px) outside the cloche's silhouette (dmask/ = DEBUG 13 frames) above its widest row: area > 8 levels, p95, mean.
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
from maskutil import cloche
L = lambda d, i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
for i in map(int, sys.argv[2:]):
    m = cloche(f'dmask/f{i:04d}.png')
    if not m.any(): print(f'{i*0.016:.3f}s no mask'); continue
    ys, xs = np.nonzero(m); w = np.bincount(ys, minlength=m.shape[0]); ymid = int(np.argmax(w))
    band = nd.binary_dilation(m, iterations=68) & ~nd.binary_dilation(m, iterations=3)
    band[ymid:, :] = False
    d = L(sys.argv[1], i) - L('dec05n', i)
    v = d[band]
    if v.size == 0: print(f'{i*0.016:.3f}s empty band ymid {ymid}'); continue
    up = band.copy(); up[ymid - 80:, :] = False; u = d[up]
    print(f'{i * 0.016:.3f}s cap band: area>8 {(v > 8).sum():6d} px  p95 {np.percentile(v, 95):5.1f}  p99 {np.percentile(v, 99):5.1f}  mean {v.mean():+.2f} | over the crown and shoulders (3 cm above the rim and up): area>8 {(u > 8).sum():6d} p95 {np.percentile(u, 95):5.1f} mean {u.mean():+.2f}')
