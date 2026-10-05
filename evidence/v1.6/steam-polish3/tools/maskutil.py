import numpy as np
from PIL import Image
from scipy import ndimage as nd
def cloche(path):
    a = np.asarray(Image.open(path).convert('RGB'))
    m = (a >= 254).all(-1)
    lab, n = nd.label(m)
    if n == 0: return m
    sz = nd.sum(m, lab, range(1, n + 1)); return lab == (1 + int(np.argmax(sz)))
