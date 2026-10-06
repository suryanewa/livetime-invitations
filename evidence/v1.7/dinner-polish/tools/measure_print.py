"""Measure the card's print in a still: card bbox (cream mask), text lines (row profile of ink), per line: height,
ink px (luma<=90 and <=170), median horizontal stroke run (device px), contrast (min luma vs paper)."""
import sys, numpy as np
from PIL import Image
def luma(a): return 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
def measure(path, region=None):
    im = np.asarray(Image.open(path).convert('RGB')).astype(float)
    if region: x0,y0,x1,y1 = region; im = im[y0:y1, x0:x1]
    r,g,b = im[...,0], im[...,1], im[...,2]
    cream = (r-b > 9) & (r > 200) & (r-b < 30)
    ys, xs = np.nonzero(cream)
    # robust bbox: rows/cols with many cream pixels
    rows = np.nonzero(cream.sum(1) > cream.sum(1).max()*0.5)[0]; cols = np.nonzero(cream.sum(0) > cream.sum(0).max()*0.5)[0]
    y0, y1, x0, x1 = rows.min(), rows.max(), cols.min(), cols.max()
    W, H = x1-x0+1, y1-y0+1
    L = luma(im)
    card = L[y0+4:y1-4, x0+4:x1-4]
    paper = np.median(card)
    out = [f'{path}: card bbox x {x0}-{x1} y {y0}-{y1} (W {W} H {H} px, {W/100:.2f} px/mm), frame width {im.shape[1]} -> card {W/im.shape[1]*100:.1f}% ; paper luma {paper:.1f} (rgb {np.median(im[y0+4:y1-4,x0+4:x1-4].reshape(-1,3),axis=0)})']
    ink = card < paper - 25
    prof = ink.sum(1)
    lines = []; inl = False
    for i,v in enumerate(prof):
        if v>0 and not inl: s=i; inl=True
        if v==0 and inl: lines.append((s,i)); inl=False
    if inl: lines.append((s,len(prof)))
    out.append(f'  ink(luma<=90) px inside card: {(card<=90).sum()}, ink(<=170): {(card<=170).sum()}; lines: {len(lines)}')
    for (a,b_) in lines:
        seg = card[a:b_]; m = seg < paper-25
        cs = np.nonzero(m.any(0))[0]
        runs=[]
        for row in m:
            c=0
            for v in row:
                if v: c+=1
                elif c: runs.append(c); c=0
            if c: runs.append(c)
        # vertical runs too
        vr=[]
        for col in m.T:
            c=0
            for v in col:
                if v: c+=1
                elif c: vr.append(c); c=0
        out.append(f'  line y {a+y0+4}-{b_+y0+4} h {b_-a}px ({(b_-a)/(W/100):.2f} mm)  x {cs.min()+x0+4}-{cs.max()+x0+4} w {cs.max()-cs.min()+1}px  minL {seg.min():.0f}  ink<=90 {(seg<=90).sum()}  stroke(h-run median) {np.median(runs) if runs else 0:.1f}px p25 {np.percentile(runs,25) if runs else 0:.1f}')
    return out
if __name__ == '__main__':
    reg = tuple(map(int, sys.argv[2].split(','))) if len(sys.argv)>2 else None
    print('\n'.join(measure(sys.argv[1], reg)))
