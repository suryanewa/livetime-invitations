# falloff2.py <on> <off> <rings.json>: per candle and ring, median R lift, the halo's hue (on) and its shift from the coat's own (off)
import sys, json, colorsys, numpy as np
from PIL import Image
on = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float); off = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(float)
J = json.load(open(sys.argv[3])); H, W, _ = on.shape
def hue(c): return colorsys.rgb_to_hsv(*(np.clip(c, 0, 255) / 255))[0] * 360
agg = {}
for i, c in enumerate(J['cands']):
  row = []
  for r in c['rings']:
    pts = np.array(r['pts']); x = np.clip(pts[:, 0].round().astype(int), 0, W - 1); y = np.clip(pts[:, 1].round().astype(int), 0, H - 1)
    a, b = on[y, x], off[y, x]; k = (b[:, 2] > b[:, 0] + 25) & (b[:, 2] > 150)
    if k.sum() < 6: row.append(f"{r['cm']:>3}cm  -"); continue
    d = np.median(a[k] - b[k], 0); ha = hue(np.median(a[k], 0)); hb = hue(np.median(b[k], 0))
    agg.setdefault(r['cm'], []).append((d[0], d[1], d[2], ha, ha - hb))
    row.append(f"{r['cm']:>3}cm {d[0]:+3.0f}R {ha:5.1f}({ha - hb:+4.1f})")
  print(f"c{i}: " + ' | '.join(row))
print('ranges: ' + ' | '.join(f"{cm}cm R {min(v[0] for v in L):+.0f}..{max(v[0] for v in L):+.0f} G {min(v[1] for v in L):+.0f}..{max(v[1] for v in L):+.0f} hue {min(v[3] for v in L):.1f}-{max(v[3] for v in L):.1f} dh {min(v[4] for v in L):+.1f}..{max(v[4] for v in L):+.1f}" for cm, L in sorted(agg.items()) if cm in (0.5, 1, 2, 3)))
