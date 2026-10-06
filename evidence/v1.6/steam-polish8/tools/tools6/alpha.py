# alpha.py <debug1dir> <nosdir> frames... : the steam's coverage (DEBUG=1 frames: red = 1 - T) at the plate's far rim (the rim's row
# in the no-steam twin, x 600-900) and through the core (the cloud's middle, x 560-760, y 560-700): T = 1 - coverage, medians.
import sys, numpy as np
from PIL import Image
for i in map(int, sys.argv[3:]):
    a = np.asarray(Image.open(f'{sys.argv[1]}/f{i:04d}.png').convert('RGB')).astype(float)
    n = np.asarray(Image.open(f'{sys.argv[2]}/f{i:04d}.png').convert('L')).astype(float)
    cov = a[..., 0] / 255.0
    st = (np.abs(a[..., 1] - a[..., 0]) > 3)  # composite draws red only where steam
    rim = []
    for x in range(600, 900, 4):
        y = 690 + int(np.argmin(n[690:800, x]))
        if cov[y, x] > 0.05: rim.append(1 - cov[y, x])
    core = 1 - cov[560:700, 560:760]
    print(f'{i * 0.016:.3f}s far-rim T {np.median(rim) if rim else float("nan"):.2f} ({len(rim)} cols)  core T median {np.median(core):.2f} p10 {np.percentile(core, 10):.2f} p90 {np.percentile(core, 90):.2f}')
