# puffs.py <dir> <twin> <rowmin> frames... : the steam's brightening over its no-steam twin below row <rowmin>:
# area > 8 levels, max, its change from the previous frame, and the brightening-weighted centroid row and the 10th-percentile row (the puffs' top).
import sys, numpy as np
from PIL import Image
L = lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
d, tw, r0 = sys.argv[1], sys.argv[2], int(sys.argv[3]); prev = None
for i in map(int, sys.argv[4:]):
    B = L(f'{d}/f{i:04d}.png') - L(f'{tw}/f{i:04d}.png'); B[:r0] = 0
    m = B > 8; a = int(m.sum()); mx = B.max()
    ch = '' if prev is None or prev == 0 else f' ({(a - prev) / prev * 100:+4.0f} %)'
    rows = np.nonzero(m)[0]
    cen = (np.arange(B.shape[0])[:, None] * np.clip(B, 0, None) * m).sum() / max(1e-6, (np.clip(B, 0, None) * m).sum()) if a else float('nan')
    top = np.percentile(rows, 10) if a else float('nan')
    print(f'{i*0.016:.3f}s area>8 {a:6d}{ch:9s} max {mx:5.1f} centroid {cen:6.1f} top10 {top:6.1f}')
    prev = a
