# tops.py <on> <off> <rings.json> [label]: over top-coat pixels (blue in the off frame, inside the top's outline 1.2 cm in from
# the tier's edge, outside every candle's 0.3 cm footprint) mean lift R/G/B, hue on/off, share > 3 deg off
import sys, json, numpy as np
from PIL import Image, ImageDraw
on = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float); off = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(float)
J = json.load(open(sys.argv[3])); H, W, _ = on.shape
mk = Image.new('L', (W, H), 0); ImageDraw.Draw(mk).polygon([tuple(p) for p in J['top']], fill=1); poly = np.asarray(mk) > 0
b = off; m = poly & (b[..., 2] > b[..., 0] + 25) & (b[..., 2] > 150) & ((b.max(-1) - b.min(-1)) / np.maximum(b.max(-1), 1) > 0.15)
def hue(c):
  r, g, bb = c[..., 0], c[..., 1], c[..., 2]; mx = c.max(-1); mn = c.min(-1); d = np.maximum(mx - mn, 1e-6)
  return np.where(mx == bb, 240 + 60 * (r - g) / d, np.where(mx == g, 120 + 60 * (bb - r) / d, (60 * (g - bb) / d) % 360))
a = on[m]; bb = off[m]; ha, hb = hue(a), hue(bb); d = a - bb
lab = sys.argv[4] if len(sys.argv) > 4 else sys.argv[1]
print(f"{lab}: top n={m.sum()} lift R/G/B {d[:,0].mean():+.1f}/{d[:,1].mean():+.1f}/{d[:,2].mean():+.1f} (median R {np.median(d[:,0]):+.1f}) hue on {np.median(ha):.1f} off {np.median(hb):.1f}; |dhue|>3 {np.mean(np.abs(ha - hb) > 3)*100:.0f}% (>+3 {np.mean(ha - hb > 3)*100:.0f}%) >6 {np.mean(np.abs(ha - hb) > 6)*100:.0f}%")
