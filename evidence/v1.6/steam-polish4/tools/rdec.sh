#!/bin/zsh
# rdec.sh <tag> : decline at 0.5 s, frames 36-60
cd ${0:a:h}
VIEW=laptop CLIP=180,100,620,620 WARM=2000 SCHEDULE=500:decline ONLY=$(seq -s, 36 60) ./run.sh $1/dec accept
