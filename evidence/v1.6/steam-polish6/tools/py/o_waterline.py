# waterline.py <dir> frames... : a horizontal edge across the plate (0.74–1.0 s): per column of the plate's middle, the
# strongest vertical step over 3 px (levels), its median across columns, and the share of columns with a step > 12 levels
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
x0, x1, y0, y1 = 400, 860, 820, 1000
for i in map(int, sys.argv[2:]):
    a = np.asarray(Image.open(f'{sys.argv[1]}/f{i:04d}.png').convert('L')).astype(float)[y0:y1, x0:x1]
    a = nd.gaussian_filter(a, 1.0)
    step = np.abs(a[3:] - a[:-3]).max(0)
    print(f'{i * 0.016:.3f}s median step {np.median(step):.1f}  p90 {np.percentile(step, 90):.1f}  columns > 12: {100 * (step > 12).mean():.0f}%')
