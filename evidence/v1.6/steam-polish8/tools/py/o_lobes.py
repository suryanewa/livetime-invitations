# lobes.py <steamDir> <nosteamDir> frames... : lobes per 10 cm of the dome's outline above the plate (laptop 1240² view, 27 px/cm)
# The outline is the steam mask's boundary in polar coordinates about the dome's foot centre, from the left
# rim over the crown to the right rim; detrended over ≈ 1.5 cm of arc; lobes are peaks ≥ PROM px.
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage as nd
from scipy.signal import find_peaks
S, N = sys.argv[1], sys.argv[2]
PXCM, PROM = 27.0, float(os.environ.get('PROM', 2.0))
C = (620.0, 790.0)  # the dome's foot centre on screen (crop px)
L = lambda d, i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('L')).astype(float)
for i in map(int, sys.argv[3:]):
    a, b = L(S, i), L(N, i)
    m = (a - b) > float(os.environ.get('THR', 10))
    m = nd.binary_opening(m, iterations=1)
    lab, n = nd.label(m); sizes = nd.sum(m, lab, range(1, n + 1)); m = lab == (1 + int(np.argmax(sizes)))
    out = {}
    dbg = np.stack([a] * 3, -1).astype(np.uint8) if os.environ.get('DBG') else None
    for name, (t0, t1) in {'right wall': (12, 60), 'crown': (60, 120), 'left wall': (120, 168)}.items():
        th = np.radians(np.arange(t0, t1, 0.25))
        r = []
        for t in th:
            rr = np.arange(40, 700)
            x = (C[0] + rr * np.cos(t)).astype(int); y = (C[1] - rr * np.sin(t)).astype(int)
            ok = (x >= 0) & (x < m.shape[1]) & (y >= 0) & (y < m.shape[0])
            hit = np.nonzero(m[y[ok], x[ok]])[0]
            r.append(rr[ok][hit.max()] if len(hit) else np.nan)
        r = np.array(r, float); ok = ~np.isnan(r); r, thv = r[ok], th[ok]
        if dbg is not None:
            for rr_, t in zip(r, thv): dbg[int(C[1] - rr_ * np.sin(t)), int(C[0] + rr_ * np.cos(t))] = (255, 0, 160)
        arc = np.hypot(np.diff(r), r[1:] * np.diff(thv)).sum() / PXCM
        sig = 1.5 * PXCM / max(1.0, np.mean(r) * np.radians(0.25))  # ≈ 1.5 cm of arc in samples
        dev = r - nd.gaussian_filter1d(r, sig)
        k = len(find_peaks(dev, prominence=PROM)[0])
        out[name] = f'{10 * k / arc:.1f}/10cm ({k} in {arc:.1f} cm, rms {dev.std():.1f}px)'
    if dbg is not None: Image.fromarray(dbg).save(os.environ['DBG'] + f'-{i}.png')
    print(f'{i * 0.016:.3f}s', '  '.join(f'{k}: {v}' for k, v in out.items()))
