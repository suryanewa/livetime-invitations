import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
d=sys.argv[1]; i0,i1=int(sys.argv[2]),int(sys.argv[3]); fx,fy,fs=map(float,sys.argv[4].split(','))
ext = sys.argv[5] if len(sys.argv)>5 else 'jpg'
prevW=None
for i in range(i0,i1+1):
    im=np.asarray(Image.open(f'{d}/f{i:04d}.{ext}').convert('RGB')).astype(float)
    r,g,b=im[...,0],im[...,1],im[...,2]
    m=(r-b>=9)&(r-b<=22)&(r>215)
    m=ndi.binary_opening(m, iterations=1)
    lab,n=ndi.label(m)
    if n==0: print(i,'none'); continue
    sizes=ndi.sum(m,lab,range(1,n+1)); k=np.argmax(sizes)+1
    # fill holes (the print) and take the hull of the blob
    blob=ndi.binary_fill_holes(lab==k)
    ys,xs=np.nonzero(blob)
    x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max(); W=x1-x0+1; H=y1-y0+1
    # corners: extreme points of x+y, x-y
    s=xs+ys; t=xs-ys
    TL=(xs[s.argmin()],ys[s.argmin()]); BR=(xs[s.argmax()],ys[s.argmax()]); TR=(xs[t.argmax()],ys[t.argmax()]); BL=(xs[t.argmin()],ys[t.argmin()])
    topw=np.hypot(TR[0]-TL[0],TR[1]-TL[1]); botw=np.hypot(BR[0]-BL[0],BR[1]-BL[1])
    roll=np.degrees(np.arctan2(TR[1]-TL[1],TR[0]-TL[0])); rollb=np.degrees(np.arctan2(BR[1]-BL[1],BR[0]-BL[0]))
    cx,cy=xs.mean(),ys.mean()
    g='' if prevW is None else '%.4f'%(botw/prevW)
    print('%d\t%.3f\tarea %d\tbottom-w %.0f top-w %.0f (keystone %.3f) H %d\tfill(bottom-w/frame) %.3f\tcentre off (%.1f, %.1f)\troll top %.2f bottom %.2f deg\tgrowth %s'%(i,i*0.016,len(xs),botw,topw,topw/botw,H,botw/fs,cx-(fx+fs/2),cy-(fy+fs/2),roll,rollb,g))
    prevW=botw
