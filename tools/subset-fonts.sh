#!/usr/bin/env bash
# How public/fonts was made.
#
# The two woff2 files in this repository are subsets: Latin, Greek, punctuation
# and a currency range, which is what takes Manrope from 140 KB to 31 KB and
# Roboto Mono from 170 KB to 48 KB. A subset is a modified copy of somebody
# else's font, so how it was made is part of the licence position, and until
# 2026-09-21 nothing here recorded it.
#
# --name-IDs='*' matters. Without it pyftsubset drops the name table records,
# including ID 0, the copyright, and ID 13, the licence description, so the
# binary stops carrying its own attribution and the only statement left is a
# text file beside it. Both of these binaries shipped that way.
#
# Usage: tools/subset-fonts.sh <manrope.ttf> <robotomono.ttf>
set -euo pipefail

UNICODES="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+0370-03FF,U+1F00-1FFF,\
U+2000-206F,U+20A0-20BF,U+2122,U+2190-2193,U+2212,U+FFFD"

OUT="$(dirname "$0")/../public/fonts"

subset() {
  python -m fontTools.subset "$1" \
    --output-file="$OUT/$2" \
    --flavor=woff2 \
    --layout-features='*' \
    --name-IDs='*' \
    --unicodes="$UNICODES"
  echo "wrote $2"
}

subset "$1" manrope-var.woff2
subset "$2" robotomono-var.woff2
