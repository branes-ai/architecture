#!/usr/bin/env bash
# Acceptance 1 of docs/plan/records-site: the site publishes every .md file
# under each repo's collected folders (template.md aside). Counts them with
# find, independently of collect.mjs, and compares with its manifest.
#
#   scripts/check-coverage.sh [manifest] [cache]
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
manifest=${1:-$here/site/src/generated/manifest.json}
cache=${2:-$here/.cache/sources}
json() { node -e "const m = require(process.argv[1]); $1" "$manifest" "${@:2}"; }
fail=0
for repo in $(json 'for (const r of m.repos) console.log(r.name)'); do
  dir=$cache/$repo
  [ "$repo" = architecture ] && dir=$here
  found=0
  for folder in $(json 'console.log(m.repos.find((r) => r.name === process.argv[2]).folders.join("\n"))' "$repo"); do
    if [ -d "$dir/docs/$folder" ]; then
      n=$(find "$dir/docs/$folder" -name '*.md' ! -name template.md | wc -l)
      found=$((found + n))
    fi
  done
  published=$(json 'console.log(m.repos.find((r) => r.name === process.argv[2]).pages.length)' "$repo")
  if [ "$found" -ne "$published" ]; then
    echo "check-coverage: $repo: find counts $found, the site publishes $published" >&2
    fail=1
  else
    echo "check-coverage: $repo: $published"
  fi
done
exit $fail
