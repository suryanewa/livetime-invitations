# diff.py <dirA> <dirB> frames... : per frame, pixels differing (any channel) and the max abs difference (levels), and where
import sys, numpy as np
from PIL import Image
a, b = sys.argv[1], sys.argv[2]
for i in map(int, sys.argv[3:]):
    A = np.asarray(Image.open(f'{a}/f{i:04d}.png').convert('RGB')).astype(int); B = np.asarray(Image.open(f'{b}/f{i:04d}.png').convert('RGB')).astype(int)
    d = np.abs(A - B).max(axis=2); n = int((d > 0).sum())
    ys, xs = np.nonzero(d)
    where = f' rows {ys.min()}-{ys.max()} cols {xs.min()}-{xs.max()}' if n else ''
    print(f'{i*0.016:.3f}s differing px {n:6d} max {d.max():3d} >2: {int((d > 2).sum()):5d}{where}')
