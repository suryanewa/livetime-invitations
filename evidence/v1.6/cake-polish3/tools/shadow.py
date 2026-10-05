# shadow.py <on> <noshadow> <rings.json> [label]: the candles' key shadows on the top coat: pixels darkened >= 6 % by the
# shadows (on vs noshadow), within 3 cm of a candle (the halos); against the lit coat round them (darkened < 1 %, same zone)
import sys, json, colorsys, numpy as np
from PIL import Image, ImageDraw
on = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float); ns = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(float)
J = json.load(open(sys.argv[3])); H, W, _ = on.shape
mk = Image.new('L', (W, H), 0); d = ImageDraw.Draw(mk); d.polygon([tuple(p) for p in J['top']], fill=1); top = np.asarray(mk) > 0
zk = Image.new('L', (W, H), 0); dz = ImageDraw.Draw(zk)
for c in J['cands']:
  ring = [r for r in c['rings'] if r['cm'] == 3][0]; dz.polygon([tuple(p) for p in ring['pts']], fill=1)
zone = np.asarray(zk) > 0
L = lambda a: 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
dark = 1 - L(on) / np.maximum(L(ns), 1)
coat = (ns[..., 2] > ns[..., 0] + 25) & (ns[..., 2] > 150)
sh = top & zone & coat & (dark > 0.06); lit = top & zone & coat & (dark < 0.01)
def hs(m): c = np.median(on[m], 0); h, s, v = colorsys.rgb_to_hsv(*(c / 255)); return c, h * 360, s
cs, hS, sS = hs(sh); cl, hL, sL = hs(lit)
print(f"{sys.argv[4] if len(sys.argv) > 4 else sys.argv[1]}: shadow n={sh.sum()} rgb {cs[0]:.0f},{cs[1]:.0f},{cs[2]:.0f} h{hS:.1f} s{sS:.3f} | lit n={lit.sum()} rgb {cl[0]:.0f},{cl[1]:.0f},{cl[2]:.0f} h{hL:.1f} s{sL:.3f} | dh {hS - hL:+.1f} ds {sS - sL:+.3f} | shadow depth {np.median(dark[sh])*100:.1f}%")
