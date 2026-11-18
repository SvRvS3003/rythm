#!/bin/zsh

set -u
cd "${0:a:h}/.."
rounds=${1:-1}
log=$(mktemp -d)
step() { local name=$1; shift; if "$@" > "$log/$name.${r:-0}.log" 2>&1; then echo "  pass $name"; else echo "  FAIL $name (log: $log/$name.${r:-0}.log)"; tail -15 "$log/$name.${r:-0}.log"; return 1; fi; }
stop() { pkill -f "wrangler dev --port 8787"; pkill -f "node_modules/@cloudflare/workerd-darwin-64/bin/workerd"; return 0; }
trap stop EXIT

step typecheck npm run typecheck || exit 1
step build npm run build || exit 1
step migrations npx wrangler d1 migrations apply rythm --local || exit 1
stop
npx wrangler dev --port 8787 > "$log/worker.log" 2>&1 &
for i in {1..60}; do curl -s -o /dev/null http://127.0.0.1:8787/ && break; sleep 1; done
curl -s -o /dev/null http://127.0.0.1:8787/ || { echo "  FAIL worker did not start (log: $log/worker.log)"; exit 1; }

fails=0
for r in $(seq 1 $rounds); do
  echo "round $r/$rounds"
  step unit npm test || fails=$((fails + 1))
  for t in userapi e2e ui ios tide cutoff switching; do
    npx wrangler d1 execute rythm --local --command "DELETE FROM attempts" > /dev/null 2>&1
    if [[ $t = ui || $t = tide ]]; then step $t node test/$t.ts "$log"; else step $t node test/$t.ts; fi || fails=$((fails + 1))
  done
done
echo "$fails failure(s) in $rounds round(s)"
exit $((fails > 0))
