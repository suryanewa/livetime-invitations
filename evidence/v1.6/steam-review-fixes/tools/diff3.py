# diff3.py <base> <new> frames... : signed luma change (new - base): pixels changed, max |d|, pixels over 2 levels,
# brighter / darker counts, and the changed pixels' row range
import sys, numpy as np
from PIL import Image
L = lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
a, b = sys.argv[1], sys.argv[2]
for i in map(int, sys.argv[3:]):
    d = L(f'{b}/f{i:04d}.png') - L(f'{a}/f{i:04d}.png')
    n = int((np.abs(d) > 0.5).sum())
    if not n: print(f'{i*0.016:.3f}s identical'); continue
    ys, xs = np.nonzero(np.abs(d) > 0.5)
    print(f'{i*0.016:.3f}s changed {n:6d} max|d| {np.abs(d).max():5.1f} >2 {int((np.abs(d) > 2).sum()):5d} brighter>2 {int((d > 2).sum()):5d} darker>2 {int((d < -2).sum()):5d} mean {d[np.abs(d) > 0.5].mean():+5.2f} rows {ys.min()}-{ys.max()}')
