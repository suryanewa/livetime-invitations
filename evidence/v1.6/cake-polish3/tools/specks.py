# specks.py <img> <rings.json> [label]: isolated highlights on the top coat: pixels brighter than their 7x7 median by > T luma
# (T = 8, 14, 20), inside the top's outline; and the share of them lying in runs along the arcs (count only)
import sys, json, numpy as np
from PIL import Image, ImageDraw, ImageFilter
img = Image.open(sys.argv[1]).convert('RGB'); im = np.asarray(img).astype(float)
J = json.load(open(sys.argv[2])); H, W, _ = im.shape
tp = np.array(J['top']); cen = tp.mean(0); tp = cen + (tp - cen) * 0.88  # 1.2 cm in from the tier edge, then ~0.88 of that
mk = Image.new('L', (W, H), 0); ImageDraw.Draw(mk).polygon([tuple(p) for p in tp], fill=1); top = np.asarray(mk) > 0
# keep away from the candles (their 0.5 cm ring)
ck = Image.new('L', (W, H), 0); d = ImageDraw.Draw(ck)
for c in J['cands']:
  ring = [r for r in c['rings'] if r['cm'] == 1][0]; d.polygon([tuple(p) for p in ring['pts']], fill=1)
  # and the candle itself (base to tip, as wide as its 0.5 cm ring)
  if 'tip' in c:
    r5 = np.array([r for r in c['rings'] if r['cm'] == 0.5][0]['pts']); hw = (r5[:, 0].max() - r5[:, 0].min()) / 2
    (bx, by), (tx, ty) = c['base'], c['tip']; d.polygon([(bx - hw, by), (bx + hw, by), (tx + hw, ty), (tx - hw, ty)], fill=1)
top &= np.asarray(ck) == 0
from scipy import ndimage as nd
R, G, B = im[..., 0], im[..., 1], im[..., 2]
if 'cocoa' in sys.argv[1]: coat = (R > G + 12) & (G > B + 2) & (R < 170) & (R > 30)
else: coat = (B > R + 20) & (B > 140)
coat = nd.binary_erosion(nd.binary_closing(coat, np.ones((5, 5))), np.ones((5, 5)))
top &= coat
L = 0.2126 * im[..., 0] + 0.7152 * im[..., 1] + 0.0722 * im[..., 2]
med = np.asarray(Image.fromarray(L.clip(0, 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(7))).astype(float)
ex = L - med
out = [f"{sys.argv[3] if len(sys.argv) > 3 else sys.argv[1]}: top px {top.sum()}"]
for T in (8, 14, 20):
  out.append(f">{T}: {int((top & (ex > T)).sum())}")
nw = ~nd.binary_dilation(im.min(-1) >= 150, np.ones((7, 7)))  # away from the sugar pearls (white) and their edges
out.append('| not pearls: ' + ' '.join(f">{T}: {int((top & nw & (ex > T)).sum())}" for T in (8, 14, 20)))
out.append(f"hp sigma {ex[top].std():.2f} max {ex[top].max():.0f}")
print('  '.join(out))
if len(sys.argv) > 4:
  o = im.copy(); o[top & (ex > 14) & nw] = [0, 255, 0]; o[~top] *= 0.5
  Image.fromarray(o.clip(0, 255).astype(np.uint8)).save(sys.argv[4])
