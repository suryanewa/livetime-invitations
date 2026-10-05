# domeviz.py dir frame out.png : the brightening over the clean twin (x4) with the seated outline (red) and domefill's outside band (blue tint) and cove mask
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
O=np.load('ref/seated-outline.npy'); sel=np.zeros_like(O); sel[:690]=True
out=nd.binary_dilation(O,iterations=40)&~nd.binary_dilation(O,iterations=4)&sel
edge=O^nd.binary_erosion(O)
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
d,i,o=sys.argv[1],int(sys.argv[2]),sys.argv[3]
A=L(f'{d}/f{i:04d}.png'); N=L(f'nos/f{i:04d}.png')
cove=(N>150)&(N<215)&(np.abs(N-nd.uniform_filter(N,9))<2)
B=np.clip((A-N)*3,0,255)
img=np.stack([B,B,B],-1)
img[out&cove,2]=np.clip(img[out&cove,2]+70,0,255)
img[~cove]*=0.5
img[nd.binary_dilation(edge,iterations=1)]=[255,0,0]
Image.fromarray(img[300:800,150:1100].astype(np.uint8)).save(o)
