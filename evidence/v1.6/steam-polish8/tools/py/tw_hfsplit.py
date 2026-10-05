# hfsplit.py dir a b : tn2's body mask split at y 700: spatial and temporal HF over the backdrop (upper) and the plate (lower)
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
d,a,b=sys.argv[1],int(sys.argv[2]),int(sys.argv[3])
L=lambda d,i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('L')).astype(float)
A,B,NA,NB=L(d,a),L(d,b),L(__import__('os').environ.get('TW','nos'),a),L(__import__('os').environ.get('TW','nos'),b)
m=(np.abs(NA-NB)<0.5)&(np.abs(A-NA)>15)&(np.abs(B-NB)>15)
m=nd.binary_erosion(m,iterations=6)
D=A-B; hf=D-nd.gaussian_filter(D,3); hs=A-nd.gaussian_filter(A,3)
up=m.copy(); up[700:]=False; lo=m.copy(); lo[:700]=False
print(f'{d} {a}: all T {hf[m].std():.2f} S {hs[m].std():.2f} ({m.sum()}) | upper T {hf[up].std():.2f} S {hs[up].std():.2f} ({up.sum()}) | lower T {hf[lo].std():.2f} S {hs[lo].std():.2f} ({lo.sum()})')
