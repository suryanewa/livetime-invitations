# opt.py <termsDir> : the light's balance offline. The steam's own linear radiance per light at unit weight (terms.sh: key,
# octaves, room, bounce, back light; DEBUG 16 at known exposures) and its coverage (DEBUG 1); the own colour for any weights
# through the steam's tone curve, the judge's own.py / owntop.py on it, and the composite over the clean twin for dark.py.
import sys, os, json, itertools, numpy as np
from PIL import Image
D = sys.argv[1]; FR = [38, 42, 46, 56, 62, 70, 78]
EXP = {'key': 2, 'ms': 8, 'room': 4, 'bounce': 4, 'back': 4}
if os.path.exists(f'{sys.argv[1]}/t_roomx'): EXP['roomx'] = 4
EXP.update({os.path.basename(t)[2:]: 2 for t in __import__('glob').glob(f'{sys.argv[1]}/t_key?*')})
L = lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float)
data = {}
for f in FR:
    if not os.path.exists(f'{D}/d1/f{f:04d}.png'): continue
    N = L(f'nos/f{f:04d}.png') @ [0.2126, 0.7152, 0.0722]
    a1 = L(f'{D}/d1/f{f:04d}.png')
    box = np.abs(a1 @ [0.2126, 0.7152, 0.0722] - N) > 0  # inside the steam's box (DEBUG 1 replaces the scene)
    alpha = np.where(box, a1[..., 0] / 255, 0.0)
    terms = {}
    for t, e in EXP.items():
        v = L(f'{D}/t_{t}/f{f:04d}.png')[..., 0]
        terms[t] = np.where(alpha > 0.33, v * 4 / 255 / e, 0.0)
    data[f] = dict(N=N, alpha=alpha, terms=terms)
def srgb(x): x = np.clip(x, 0, 1); return np.where(x <= 0.0031308, 12.92 * x, 1.055 * x ** (1 / 2.4) - 0.055) * 255
def tone(x, a, shape):
    off = np.where(x < 0.08, x - 6.25 * x * x, 0.04); y = x - off
    d = 1 - a
    sh = 1 - d * np.exp(-(y - a) / d) if shape == 1 else 1 - d * d / (y + d - a)
    return np.where(y < a, y, sh)
def own_img(f, w, e, a, shape):
    t = data[f]['terms']; Lsum = sum(w.get(k, 0) * t[k] for k in t)
    C = srgb(tone(e * Lsum, a, shape)); return np.where(data[f]['alpha'] > 0.33, C, 0.0)
def ownpy(C, N):
    m = (C > 20); lit, sh = [], []
    for y in range(460, 720, 2):
        xs = np.nonzero(m[y, 300:1100])[0] + 300
        if len(xs) < 80: continue
        lo, hi = xs.min(), xs.max(); q = 0.3 * (hi - lo)
        lit += list(C[y, xs[xs < lo + q]]); sh += list(C[y, xs[xs > hi - q]])
    if not lit: return None
    b = C[460:900][m[460:900]]
    return np.median(lit), np.median(sh), np.percentile(b, 5), np.percentile(b, 95)
def owntop(C):
    m = C > 20; m[:300] = False; m[740:] = False; top, bot = [], []
    for x in range(250, 1150, 2):
        ys = np.nonzero(m[:, x])[0]
        if len(ys) < 60: continue
        lo, hi = ys.min(), ys.max(); q = 0.3 * (hi - lo); top += list(C[ys[ys < lo + q], x]); bot += list(C[ys[ys > hi - q], x])
    return (np.median(top), np.median(bot)) if top else (0, 0)
def dark(f, C):
    N = data[f]['N']; al = data[f]['alpha']; A = al * C + (1 - al) * N
    st = np.zeros_like(N, bool); st[:700] = True; m = st & (N < 250) & (al > 0.33)  # (the own colour is known where it covers > 1/3)
    return int(((A - N) < -3)[m].sum())
def evaluate(w, e, a, shape, frames=FR, verbose=False):
    out = {}
    for f in frames:
        if f not in data: continue
        C = own_img(f, w, e, a, shape); o = ownpy(C, data[f]['N']); tp = owntop(C)
        out[f] = dict(own=None if o is None else (round(o[0]), round(o[1]), round(o[0] - o[1]), round(o[2])), top=(round(tp[0]), round(tp[1]), round(tp[0] - tp[1])), dark=dark(f, C))
    return out
if __name__ == '__main__':
    cfg = json.loads(sys.argv[2]) if len(sys.argv) > 2 else None
    if cfg:
        r = evaluate(cfg['w'], cfg['e'], cfg['a'], cfg.get('shape', 1))
        for f, v in r.items(): print(f'{f*0.016:.3f}s', v)

# ── fast search: the spans are fixed by the coverage mask, so precompute their pixels ──
def precompute():
    P = {}
    for f, d in data.items():
        m = d['alpha'] > 0.33
        lit, sh = [], []
        for y in range(460, 720, 2):
            xs = np.nonzero(m[y, 300:1100])[0] + 300
            if len(xs) < 80: continue
            lo, hi = xs.min(), xs.max(); q = 0.3 * (hi - lo)
            lit += [(y, x) for x in xs[xs < lo + q]]; sh += [(y, x) for x in xs[xs > hi - q]]
        mt = m.copy(); mt[:300] = False; mt[740:] = False; top, bot = [], []
        for x in range(250, 1150, 2):
            ys = np.nonzero(mt[:, x])[0]
            if len(ys) < 60: continue
            lo, hi = ys.min(), ys.max(); q = 0.3 * (hi - lo); top += [(y, x) for y in ys[ys < lo + q]]; bot += [(y, x) for y in ys[ys > hi - q]]
        st = np.zeros_like(m); st[:700] = True; dk = np.nonzero(st & (d['N'] < 250) & m)
        idx = lambda l: tuple(np.array(l).T) if l else (np.array([], int), np.array([], int))
        P[f] = dict(lit=idx(lit), sh=idx(sh), top=idx(top), bot=idx(bot), dk=dk)
    return P
def fast(P, w, e, a, shape=1):
    r = {}
    for f, p in P.items():
        t = data[f]['terms']
        def C(ix): return srgb(tone(e * sum(w[k] * t[k][ix] for k in w), a, shape))
        if len(p['lit'][0]) == 0: continue
        cl, cs, ct, cb, cd = C(p['lit']), C(p['sh']), C(p['top']), C(p['bot']), C(p['dk'])
        al = data[f]['alpha'][p['dk']]; N = data[f]['N'][p['dk']]
        r[f] = (np.median(cl), np.median(cs), np.median(ct) if len(ct) else 0, np.median(cb) if len(cb) else 0, int((al * (cd - N) < -3).sum()), np.percentile(cd, 1) if len(cd) else 0)
    return r
