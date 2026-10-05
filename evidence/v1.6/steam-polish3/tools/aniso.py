# aniso.py <dir> frames... : the edge's anisotropy (laptop 1240² view): the steam-only image (steam - no-steam twin, 1 px blur,
# high-passed at 6 px ~ 2.2 mm) in the edge band (steam contribution 8..90 levels, eroded off static changes), its structure
# tensor averaged per sector about the foot (right wall 12-60 deg, crown 60-120, left wall 120-168): the long axis's length
# ratio sqrt(lmax/lmin) and its angle from vertical (deg), and sqrt(<gx^2>/<gy^2>) (vertical streaks > 1).
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
C = (620.0, 790.0)
import os
SIG = float(os.environ.get('SIG', 3)); LO = float(os.environ.get('LO', 0)); IN0 = int(os.environ.get('IN0', 8)); IN1 = int(os.environ.get('IN1', 40)); YMAX = int(os.environ.get('YMAX', 700))
L = lambda d, i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
H, W = 1240, 1240
yy, xx = np.mgrid[0:H, 0:W]; ang = np.degrees(np.arctan2(C[1] - yy, xx - C[0]))
for i in map(int, sys.argv[2:]):
    s, n = L(sys.argv[1], i), L('nos', i)
    D = nd.gaussian_filter(s - n, 1.0)
    hp = (nd.gaussian_filter(D, LO) if LO > 0 else D) - nd.gaussian_filter(D, SIG)
    gy, gx = np.gradient(hp)
    m0 = nd.binary_opening((s - n) > 10, iterations=1); lab, k = nd.label(m0); sz = nd.sum(m0, lab, range(1, k + 1)); m0 = lab == (1 + int(np.argmax(sz)))
    m0 = nd.binary_fill_holes(m0)
    band = nd.binary_erosion(m0, iterations=IN0) & ~nd.binary_erosion(m0, iterations=IN1) & (yy < YMAX) & ~nd.binary_dilation(nd.gaussian_gradient_magnitude(n, 2.0) > 1.5, iterations=6)
    out = []
    for name, (a0, a1) in {'R wall': (12, 60), 'crown': (60, 120), 'L wall': (120, 168)}.items():
        m = band & (ang >= a0) & (ang < a1)
        if m.sum() < 200: out.append(f'{name}: -'); continue
        jxx, jyy, jxy = (gx[m] ** 2).mean(), (gy[m] ** 2).mean(), (gx[m] * gy[m]).mean()
        tr, det = jxx + jyy, jxx * jyy - jxy ** 2
        l1 = tr / 2 + np.sqrt(max(tr * tr / 4 - det, 0)); l2 = tr / 2 - np.sqrt(max(tr * tr / 4 - det, 0))
        # eigenvector of l1 = dominant gradient direction; the features' long axis is perpendicular to it
        th = 0.5 * np.degrees(np.arctan2(2 * jxy, jxx - jyy))  # gradient direction from +x
        long_from_vertical = ((th + 90) - 90 + 90) % 180 - 90  # gradient horizontal (th=0) -> long axis vertical (0)
        out.append(f'{name}: {np.sqrt(l1 / max(l2, 1e-9)):.2f}:1 @{th:+.0f} gx/gy {np.sqrt(jxx / max(jyy, 1e-9)):.2f} ({m.sum()} px)')
    print(f'{i * 0.016:.3f}s', ' | '.join(out))
