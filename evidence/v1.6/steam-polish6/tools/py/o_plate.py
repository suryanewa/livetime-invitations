# plate.py <steamDir> <nosteamDir> frames... : plate centre / right-side levels (luma, crop px of the laptop 1240² view) vs the no-steam twin
import sys, numpy as np
from PIL import Image
S, N = sys.argv[1], sys.argv[2]
R = {'centre': (540, 880, 700, 980), 'right': (820, 860, 940, 980), 'left': (300, 880, 420, 980)}
L = lambda d, i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('RGB')).astype(float)
for i in map(int, sys.argv[3:]):
    a, b = L(S, i), L(N, i)
    la, lb = a @ [0.2126, 0.7152, 0.0722], b @ [0.2126, 0.7152, 0.0722]
    out = []
    for k, (x0, y0, x1, y1) in R.items():
        out.append(f'{k} {lb[y0:y1, x0:x1].mean():.0f}->{la[y0:y1, x0:x1].mean():.0f} ({la[y0:y1, x0:x1].mean() - lb[y0:y1, x0:x1].mean():+.0f})')
    print(f'{i * 0.016:.3f}s', '  '.join(out))
