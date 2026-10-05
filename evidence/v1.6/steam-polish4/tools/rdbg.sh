#!/bin/zsh
# rdbg.sh <tag> : DEBUG 1 (coverage) and DEBUG 14 (own colour) frames 0.43-0.90 s
cd ${0:a:h}
VIEW=laptop CLIP=180,100,620,620 WARM=2000 DEBUG=1 ONLY=27,30,34,38,42,46 ./run.sh $1/d1 accept
VIEW=laptop CLIP=180,100,620,620 WARM=2000 DEBUG=14 ONLY=30,34,38,42,46,56 ./run.sh $1/d14 accept
