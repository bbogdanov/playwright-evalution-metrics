#!/usr/bin/env bash
# Stops every process a benchmark run owns.
#
# Killing only the `playwright test` parent leaves worker processes alive, and a
# surviving worker keeps appending to results/raw after the directory has been
# cleared for the next run. That silently mixes two runs - possibly with
# different strategy matrices - into one results set, which is the worst kind of
# bug here because nothing errors.
set -u
patterns=(
  'node_modules/.bin/playwright'
  'playwright/lib/worker/workerProcessEntry.js'
  'playwright/lib/cli'
  'chrome-linux/chrome'
)
for pat in "${patterns[@]}"; do
  ps -eo pid,args | grep -F "$pat" | grep -v grep | awk '{print $1}' | while read -r pid; do
    kill -9 "$pid" 2>/dev/null
  done
done
sleep 1
remaining=$(ps -eo args | grep -F 'playwright/lib/worker' | grep -cv grep)
echo "stop-bench: ${remaining} worker(s) remaining"
