import sys, glob, numpy as np
from PIL import Image
d=sys.argv[1]; box=tuple(map(int,sys.argv[2].split(',')))
fs=sorted(glob.glob(d+'/f*.jpg'))
prev=None; out=[]
for f in fs:
    im=Image.open(f).convert('L').crop(box); im=im.resize((im.width//4, im.height//4), Image.BOX)
    a=np.asarray(im).astype(float)
    if prev is not None: out.append((int(f[-8:-4]), np.abs(a-prev).mean()))
    prev=a
arr=np.array(out)
open(d+'/../fdiff-'+d.rstrip('/').split('/')[-2]+'.txt','w').write('\n'.join('%d\t%.3f\t%.3f'%(i,i*0.016,v) for i,v in arr))
# summary per 0.25 s window
for k in range(0, 48):
    m=(arr[:,0]*0.016>=k*0.25)&(arr[:,0]*0.016<(k+1)*0.25)
    if m.any(): print('%.2f-%.2f s: mean %.2f max %.2f'%(k*0.25,(k+1)*0.25,arr[m,1].mean(),arr[m,1].max()))
# spikes: frame diff > 2.5x median of +-3 neighbours
sp=[]
for j in range(3,len(arr)-3):
    nb=np.r_[arr[j-3:j,1],arr[j+1:j+4,1]]
    if arr[j,1]>2.5*np.median(nb) and arr[j,1]>0.3: sp.append((arr[j,0]*0.016, arr[j,1], np.median(nb)))
print('spikes (>2.5x local median, >0.3):', ' '.join('%.3f:%.2f/%.2f'%s for s in sp) or 'none')
