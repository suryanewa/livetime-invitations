# iou.py dir frames : IoU of the steam mask (steam - clean > 10, largest component, holes filled) with the seated dome's outline above row 760; top of each
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
ref = np.load('ref/seated-outline.npy')
L = lambda d, i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('L')).astype(float)
for i in map(int, sys.argv[2:]):
    m = nd.binary_opening((L(sys.argv[1], i) - L('nos', i)) > 10, iterations=1)
    lab, n = nd.label(m); sz = nd.sum(m, lab, range(1, n + 1)); m = lab == (1 + int(np.argmax(sz))); m = nd.binary_fill_holes(m)
    a, b = m[:760], ref[:760]
    iou = (a & b).sum() / max(1, (a | b).sum())
    ys = np.nonzero(a.any(1))[0]; yr = np.nonzero(b.any(1))[0]
    print(f'{i*0.016:.3f}s IoU {iou:.2f}  steam top row {ys.min() if len(ys) else -1}  dome top row {yr.min()}')
