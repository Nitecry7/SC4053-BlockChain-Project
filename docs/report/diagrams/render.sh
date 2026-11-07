#!/usr/bin/env bash
# Renders every docs/report/diagrams/NN-name.mmd to NN-name.svg and NN-name.png (2x), with the shared theme.
#   bash docs/report/diagrams/render.sh                 # all diagrams
#   bash docs/report/diagrams/render.sh 05              # only those whose name starts with 05
# Needs Node and network access the first time (npx downloads @mermaid-js/mermaid-cli).
# If Puppeteer has no bundled Chrome (npm 11 skips install scripts), point it at an installed browser:
#   MMDC_PUPPETEER_CONFIG=/path/to/pptr.json bash docs/report/diagrams/render.sh
#   where pptr.json is {"executablePath": "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"}
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
MMDC="npx -y @mermaid-js/mermaid-cli@11.4.2"
PP=()
[ -n "${MMDC_PUPPETEER_CONFIG:-}" ] && PP=(-p "$MMDC_PUPPETEER_CONFIG")
for src in ${1:-}*.mmd; do
  name="${src%.mmd}"
  $MMDC "${PP[@]}" -c mermaid-config.json -b white -i "$src" -o "$name.svg"
  $MMDC "${PP[@]}" -c mermaid-config.json -b white -s 2 -i "$src" -o "$name.png"
  echo "rendered $name"
done
