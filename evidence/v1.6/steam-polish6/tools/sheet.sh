#!/bin/zsh
# sheet.sh <dir> <out.png> <crop WxH+X+Y|none> <cols> <cellW> frame-indices...  (label = time in s)
dir=$1; out=$2; crop=$3; cols=$4; cell=$5; shift 5
args=()
for i in "$@"; do f="$dir/$(printf 'f%04d.png' $i)"; t=$(printf '%.3fs' $(( i * 0.016 ))); args+=(-label "$t" "$f"); done
if [ "$crop" = none ]; then magick montage -font /System/Library/Fonts/Helvetica.ttc -pointsize 18 "${args[@]}" -tile ${cols}x -geometry ${cell}x${cell}+2+2 PNG24:$out
else magick montage -font /System/Library/Fonts/Helvetica.ttc -pointsize 18 "${args[@]}" -crop $crop -tile ${cols}x -geometry ${cell}x${cell}+2+2 PNG24:$out; fi
