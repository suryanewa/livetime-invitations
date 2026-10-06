# search.py [n] [seed] : random search over the light's weights on the cached terms (pre.pkl, from opt.py's precompute) for
# the largest own-colour lit − shaded at 0.608 / 0.672 / 0.736 s with the lit side ≥ LIT, no steam darker than the wall at
# any frame (≤ DARK px over 1/3 coverage) and the shade's p1 ≥ P1.
import sys, os, pickle, numpy as np
exec(open(os.path.join(os.path.dirname(__file__), 'opt.py')).read().split("if __name__ == '__main__':")[0].split('data = {}')[0])
src = open(os.path.join(os.path.dirname(__file__), 'opt.py')).read()
exec(src[src.index('def srgb'):src.index('def own_img')]); exec(src[src.index('def fast'):])
P, data = pickle.load(open('pre.pkl', 'rb'))
n = int(sys.argv[1]) if len(sys.argv) > 1 else 800; rng = np.random.default_rng(int(sys.argv[2]) if len(sys.argv) > 2 else 1)
LIT = float(os.environ.get('LIT', 246)); DARK = int(os.environ.get('DARK', 60)); P1 = float(os.environ.get('P1', 200)); BACK = os.environ.get('BACK')
fix = eval(os.environ.get('FIX', '{}'))
best = []
for i in range(n):
    KT = os.environ.get('KEYT', 'key')
    w = {KT: rng.uniform(1.0, 5.0), 'ms': rng.choice([0.0, 0.3, 0.6, 1.0]), 'room': rng.uniform(0.2, 1.4), 'bounce': rng.choice([1.0, 1.5, 2.0]), 'back': float(BACK) if BACK else rng.choice([0.0, 0.5, 1.0])}
    if os.environ.get('RX'):
        rf = rng.uniform(0.3, 1.0); w['roomx'] = w['room'] * (1 - rf); w['room'] *= rf
    if os.environ.get('KW'): w[os.environ['KW']] = rng.uniform(0.0, float(os.environ.get('KWMAX', 4.0)))
    e = rng.uniform(0.45, 1.0); a = rng.choice([0.5, 0.6, 0.7, 0.76]); shape = rng.choice([0, 1])
    w.update({k: v for k, v in fix.items() if k in w}); e = fix.get('e', e); a = fix.get('a', a); shape = fix.get('shape', shape)
    r = fast(P, w, e, a, shape)
    sep = [r[f][0] - r[f][1] for f in (38, 42, 46)]
    ok = all(r[f][4] <= DARK for f in r) and r[38][0] >= LIT and all(r[f][5] >= P1 for f in r)
    if ok: best.append((min(sep), sep, [round(r[f][2] - r[f][3]) for f in (38, 42, 46)], [round(r[f][0]) for f in (38, 46, 56)], {k: round(float(v), 2) for k, v in w.items()}, round(e, 3), a, shape, [r[f][4] for f in r]))
best.sort(key=lambda b: -b[0])
for b in best[:12]: print(round(b[0], 1), [round(s) for s in b[1]], 'top', b[2], 'lit', b[3], b[4], 'e', b[5], 'a', b[6], 'shape', b[7], 'dark', b[8])
print(len(best), 'feasible of', n)
