import sys, numpy as np
from PIL import Image
def gold(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.int32)
    r,g,b = a[...,0],a[...,1],a[...,2]
    m = (r-b > 45) & (r > 70) & (r < 210) & (g-b > 20)
    ys,xs = np.nonzero(m)
    return xs.min(), xs.max(), ys.min(), ys.max(), m.sum()
for p in sys.argv[1:]:
    print(p.split('/')[-1], *gold(p))
