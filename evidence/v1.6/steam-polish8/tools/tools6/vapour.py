# vapour.py <dir> <refdir> frames... : the steam's summed brightening over the frame (luma above the no-steam twin, levels x px),
# and its ratio to the reference build's (polish 1: ../judge-steam2/lap) at the same frame.
import sys, numpy as np
from PIL import Image
L = lambda d, i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
for i in map(int, sys.argv[3:]):
    n = L('nos', i)
    a = np.clip(L(sys.argv[1], i) - n, 0, None).sum(); b = np.clip(L(sys.argv[2], i) - n, 0, None).sum()
    print(f'{i * 0.016:.3f}s brightening {a / 1e6:.2f} M  ref {b / 1e6:.2f} M  ratio {a / max(b, 1):.2f}')
