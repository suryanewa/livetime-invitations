#!/bin/zsh
# run.sh <outDir> [ENV=...] -- 165 s hard cap
cd /Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v17-dinner-polish/evidence/v1.7/dinner-polish/tools
perl -e 'alarm 165; exec @ARGV' node --no-warnings --experimental-transform-types jf.ts "$@" 2>&1 | grep -v -i 'experimental\|trace-warnings' | tail -6
