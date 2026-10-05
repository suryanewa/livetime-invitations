# rad.py <dir> frames... : the fog's linear radiance (DEBUG=12 frames: 0.5 x radiance written raw) in the regions
import sys, numpy as np
from PIL import Image
R = {'lit': (470, 640, 530, 700), 'mid': (590, 600, 650, 680), 'shade': (760, 640, 810, 700), 'centre': (540, 880, 700, 980), 'right': (820, 860, 940, 980)}
for i in map(int, sys.argv[2:]):
    a = np.asarray(Image.open(f'{sys.argv[1]}/f{i:04d}.png').convert('L')).astype(float) / 255 * 2
    print(f'{i * 0.016:.3f}s', '  '.join(f'{k} {a[y0:y1, x0:x1][a[y0:y1, x0:x1] > 0].mean():.2f}' if (a[y0:y1, x0:x1] > 0).any() else f'{k} -' for k, (x0, y0, x1, y1) in R.items()))
