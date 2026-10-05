# ownarea.py <debug1dir> frames : the condensate's own extent, whatever is behind it (DEBUG 1: the march's coverage in red):
# area with coverage > 0.15 (k px), Σ coverage (k), the coverage-weighted centroid row, and its widest row (px).
import sys, numpy as np
from PIL import Image
for i in map(int, sys.argv[2:]):
    raw = np.asarray(Image.open(f'{sys.argv[1]}/f{i:04d}.png').convert('RGB')).astype(float)
    n = np.asarray(Image.open(f'nos/f{i:04d}.png').convert('RGB')).astype(float)
    m = (np.abs(raw - n).sum(-1) > 0) & (raw[..., 1] == 0) & (raw[..., 2] == 0)
    a = np.where(m, raw[..., 0] / 255, 0)
    M = a > 0.15; ys = np.indices(a.shape)[0]
    rows = [r for r in M if r.sum() > 20]; w = max([np.ptp(np.nonzero(r)[0]) for r in rows], default=0)
    print(f'{i*0.016:.3f}s own area {M.sum()/1e3:6.1f} k  sum cov {a.sum()/1e3:6.1f} k  centroid row {(a*ys).sum()/max(a.sum(),1):5.0f}  widest {w:4d} px ({w/733:.2f} plate)')
