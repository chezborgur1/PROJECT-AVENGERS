#!/bin/bash
# Rebuild, convert and rasterize. Scratch helper; not part of the deliverable.
set -e
cd "$(dirname "$0")"
node build-deck.js
python3 /root/.claude/skills/synced/9488611f-533e-4a4e-a7db-3d27cfc06d7d_1c4ec00c-4815-46b3-96f7-9a90ccea73a3/pptx/scripts/office/soffice.py --headless --convert-to pdf --outdir . deck.pptx >/dev/null 2>&1
python3 -c "
import pymupdf; d=pymupdf.open('deck.pdf'); print('pages', len(d)); [p.get_pixmap(dpi=100).save(f'page-{i+1:02d}.png') for i,p in enumerate(d)]"
