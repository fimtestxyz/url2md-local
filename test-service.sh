#!/usr/bin/env bash
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
RESULT="result.md"
PASS=0
FAIL=0
TOTAL=0
DETAILS=""

section() {
  DETAILS+=$'\n## '"$1"$'\n\n'
}

record_pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  DETAILS+="- ✓ **$1**$2"$'\n'
}

record_fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  DETAILS+="- ✗ **$1**$2"$'\n'
}

timer_start() {
  _T_START=$(python3 -c "import time;print(time.time())")
}

timer_elapsed() {
  python3 -c "import time;print(f'{time.time()-$_T_START:.2f}')"
}

# ── Preflight ──
echo "╔══════════════════════════════════════════════════╗"
echo "║   url2md Service — Capability Test Suite         ║"
echo "║   Target: $BASE_URL                      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

if ! curl -sf "$BASE_URL/api/health" > /dev/null 2>&1; then
  echo "ERROR: Service not reachable at $BASE_URL"
  echo "Start it with:  docker compose up -d  OR  npm run serve"
  exit 1
fi
echo "Service is up."
echo ""

HEALTH_JSON=$(curl -s "$BASE_URL/api/health")

# ══════════════════════════════════════════════════════════════
echo "  1/7  Health & Infrastructure..."
section "1. Health & Infrastructure"

timer_start
HEALTH=$(curl -s -w '\n%{http_code}' "$BASE_URL/api/health")
EL=$(timer_elapsed)
H_CODE=$(echo "$HEALTH" | tail -1)
H_BODY=$(echo "$HEALTH" | sed '$d')

if [ "$H_CODE" = "200" ]; then
  record_pass "GET /api/health" " — HTTP 200 (${EL}s)"
else
  record_fail "GET /api/health" " — HTTP $H_CODE (${EL}s)"
fi

DETAILS+=$'\n**Pool status:**\n\n'
DETAILS+=$(echo "$H_BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
w=d.get('workers',{})
m=d.get('memory',{})
print('| Metric | Value |')
print('|---|---|')
print(f'| Status | {d.get(\"status\",\"?\")} |')
print(f'| Workers | {w.get(\"total\",\"?\")} total, {w.get(\"available\",\"?\")} available |')
print(f'| Memory | {m.get(\"rss\",\"?\")} RSS, {m.get(\"heapUsed\",\"?\")} heap |')
print(f'| Uptime | {d.get(\"uptime\",0):.1f}s |')
" 2>/dev/null || echo "(parse error)")
DETAILS+=$'\n'

# ══════════════════════════════════════════════════════════════
echo "  2/7  HTTP Fallback (fast path, no browser)..."
section "2. HTTP Fallback Path (static/SSR pages)"

test_convert() {
  local label="$1" url="$2"
  local opts="{}"
  if [ $# -ge 3 ]; then opts="$3"; fi
  local body_json
  body_json="{\"url\":\"${url}\",\"options\":${opts}}"

  timer_start
  local resp
  resp=$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/api/convert" \
    -H 'Content-Type: application/json' \
    -d "$body_json" 2>/dev/null || printf '\n000')
  local el
  el=$(timer_elapsed)

  local code body
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')
  [ -z "$body" ] || [ "$body" = "$code" ] && body="{}"

  if [ "$code" = "200" ]; then
    local title words provider
    title=$(echo "$body" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('title','') or '')" 2>/dev/null || true)
    words=$(echo "$body" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('wordCount',''))" 2>/dev/null || true)
    provider=$(echo "$body" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('provider',''))" 2>/dev/null || true)
    local info=" — HTTP 200 (${el}s)"
    [ -n "$title" ] && info+=$'\n'"  - Title: \`$title\`"
    [ -n "$words" ] && info+=$'\n'"  - Words: $words | Provider: \`$provider\`"
    record_pass "$label" "$info"
  else
    local cat
    cat=$(echo "$body" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('category',''))" 2>/dev/null || true)
    record_fail "$label" " — HTTP $code, category: \`$cat\` (${el}s)"
  fi
}

test_convert "CNA news article" \
  "https://www.channelnewsasia.com/business/spacex-options-debut-pulls-record-demand-investors-chase-rocket-stock-6187516"

test_convert "Wikipedia article" \
  "https://en.wikipedia.org/wiki/SpaceX"

# ══════════════════════════════════════════════════════════════
echo "  3/7  Puppeteer Path (browser rendering)..."
section "3. Puppeteer Path (browser-rendered pages)"

test_convert "example.com (Puppeteer)" \
  "https://example.com" \
  '{"qualityThreshold":10}'

test_convert "Hacker News" \
  "https://news.ycombinator.com" \
  '{"qualityThreshold":20}'

# ══════════════════════════════════════════════════════════════
echo "  4/7  Options & Customization..."
section "4. Options & Customization"

test_convert "clean=true" \
  "https://en.wikipedia.org/wiki/SpaceX" \
  '{"clean":true}'

test_convert "noImages=true" \
  "https://en.wikipedia.org/wiki/SpaceX" \
  '{"noImages":true}'

test_convert "noLinks=true" \
  "https://en.wikipedia.org/wiki/SpaceX" \
  '{"noLinks":true}'

test_convert "timeout=5" \
  "https://en.wikipedia.org/wiki/SpaceX" \
  '{"timeout":5}'

test_convert "viewport=mobile" \
  "https://en.wikipedia.org/wiki/SpaceX" \
  '{"viewport":"mobile"}'

# ══════════════════════════════════════════════════════════════
echo "  5/7  Error Handling..."
section "5. Error Handling"

test_error() {
  local label="$1" endpoint="$2" body_json="$3" expected_code="$4"

  timer_start
  local resp
  resp=$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL$endpoint" \
    -H 'Content-Type: application/json' \
    -d "$body_json" 2>/dev/null || printf '\n000')
  local el
  el=$(timer_elapsed)

  local code body
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')
  [ -z "$body" ] || [ "$body" = "$code" ] && body="{}"

  local msg
  msg=$(echo "$body" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('error','') or d.get('category',''))" 2>/dev/null || true)

  if [ "$code" = "$expected_code" ]; then
    record_pass "$label" " — HTTP $code ($msg) (${el}s)"
  else
    record_fail "$label" " — Expected $expected_code, got $code (${el}s)"
  fi
}

test_error "Missing URL → 400" \
  "/api/convert" '{}' "400"

test_error "Non-string URL → 400" \
  "/api/convert" '{"url":12345}' "400"

test_error "Empty batch array → 400" \
  "/api/batch" '{"urls":[]}' "400"

test_error "Batch >50 URLs → 400" \
  "/api/batch" \
  "$(python3 -c "import json;print(json.dumps({'urls':['https://example.com']*51}))")" \
  "400"

test_error "Non-existent domain → error" \
  "/api/convert" '{"url":"https://this-domain-does-not-exist-xyz123abc.com/page"}' "403"

# ══════════════════════════════════════════════════════════════
echo "  6/7  Batch Conversion..."
section "6. Batch Conversion"

timer_start
BATCH_RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/api/batch" \
  -H 'Content-Type: application/json' \
  -d '{
    "urls":[
      "https://en.wikipedia.org/wiki/SpaceX",
      "https://www.channelnewsasia.com/business/spacex-options-debut-pulls-record-demand-investors-chase-rocket-stock-6187516",
      "https://example.com"
    ],
    "options":{"qualityThreshold":10}
  }' 2>/dev/null || printf '\n000')
EL=$(timer_elapsed)

B_CODE=$(echo "$BATCH_RESP" | tail -1)
B_BODY=$(echo "$BATCH_RESP" | sed '$d')
[ -z "$B_BODY" ] || [ "$B_BODY" = "$B_CODE" ] && B_BODY="{}"

B_COUNT=$(echo "$B_BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('results',[])))" 2>/dev/null || echo 0)
B_OK=$(echo "$B_BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(sum(1 for r in d.get('results',[]) if r.get('success')))" 2>/dev/null || echo 0)

DETAILS+=$(echo "$B_BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for r in d.get('results',[]):
    u=r.get('url','')[:60]
    if r.get('success'):
        w=r['data'].get('wordCount',0)
        p=r['data'].get('provider','')
        print(f'- ✓ \`{u}\` — {w} words ({p})')
    else:
        print(f'- ✗ \`{u}\` — {r.get(\"error\",\"?\")}')
" 2>/dev/null || echo "(parse error)")
DETAILS+=$'\n'

if [ "$B_CODE" = "200" ] && [ "$B_COUNT" -eq 3 ]; then
  record_pass "Batch of 3 URLs" " — $B_OK/$B_COUNT succeeded (${EL}s)"
else
  record_fail "Batch of 3 URLs" " — HTTP $B_CODE, results: $B_COUNT/3 (${EL}s)"
fi

# ══════════════════════════════════════════════════════════════
echo "  7/7  Concurrency Stress Test..."
section "7. Concurrency Stress Test"

run_concurrent() {
  local label="$1" count="$2" url="$3"
  local tmpdir
  tmpdir=$(mktemp -d)

  timer_start
  for i in $(seq 1 "$count"); do
    curl -s -X POST "$BASE_URL/api/convert" \
      -H 'Content-Type: application/json' \
      -d "{\"url\":\"$url\"}" \
      -o "$tmpdir/r_$i.json" -w '%{http_code}' \
      > "$tmpdir/s_$i.txt" &
  done
  wait
  local el
  el=$(timer_elapsed)

  local ok=0 fail=0
  for i in $(seq 1 "$count"); do
    local sc
    sc=$(cat "$tmpdir/s_$i.txt" 2>/dev/null || echo "000")
    if [ "$sc" = "200" ]; then ok=$((ok + 1)); else fail=$((fail + 1)); fi
  done
  rm -rf "$tmpdir"

  if [ "$ok" -eq "$count" ]; then
    record_pass "$label" " — $ok/$count succeeded (${el}s total)"
  else
    record_fail "$label" " — $ok/$count succeeded, $fail failed (${el}s)"
  fi
}

run_concurrent "3 concurrent requests" 3 "https://en.wikipedia.org/wiki/SpaceX"
run_concurrent "5 concurrent requests" 5 "https://en.wikipedia.org/wiki/SpaceX"
run_concurrent "10 concurrent requests" 10 "https://www.channelnewsasia.com/business/spacex-options-debut-pulls-record-demand-investors-chase-rocket-stock-6187516"

# ── Post-test health ──
section "Post-Test Pool Status"
POST_HEALTH=$(curl -s "$BASE_URL/api/health")
DETAILS+=$(echo "$POST_HEALTH" | python3 -c "
import sys,json
d=json.load(sys.stdin)
w=d.get('workers',{})
m=d.get('memory',{})
print('| Metric | Value |')
print('|---|---|')
print(f'| Workers | {w.get(\"total\",\"?\")} total, {w.get(\"available\",\"?\")} available, {w.get(\"busy\",\"?\")} busy |')
print(f'| Queued | {w.get(\"queued\",\"?\")} |')
print(f'| Memory | {m.get(\"rss\",\"?\")} RSS, {m.get(\"heapUsed\",\"?\")} heap |')
" 2>/dev/null || echo "(parse error)")
DETAILS+=$'\n'

# ══════════════════════════════════════════════════════════════
# Write result.md
# ══════════════════════════════════════════════════════════════
RATE=$(( PASS * 100 / (TOTAL > 0 ? TOTAL : 1) ))
VERDICT=$( [ "$FAIL" -eq 0 ] && echo "All $TOTAL tests passed" || echo "$FAIL of $TOTAL test(s) failed" )

cat > "$RESULT" << ENDREPORT
# url2md Service Test Report

**Date:** $(date '+%Y-%m-%d %H:%M:%S')
**Target:** $BASE_URL

## Summary

| Metric | Value |
|---|---|
| Total Tests | $TOTAL |
| Passed | $PASS |
| Failed | $FAIL |
| Pass Rate | ${RATE}% |

### $VERDICT

---
$DETAILS
---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| \`/api/health\` | GET | Service health and pool status |
| \`/api/convert\` | POST | Convert a single URL to markdown |
| \`/api/batch\` | POST | Convert multiple URLs (max 50) |

### Convert Options

| Option | Type | Default | Description |
|---|---|---|---|
| \`timeout\` | number | 30 | Navigation timeout (seconds) |
| \`clean\` | boolean | false | Strip nav, footer, scripts, ads |
| \`noImages\` | boolean | false | Remove images from output |
| \`noLinks\` | boolean | false | Remove links from output |
| \`dataImages\` | boolean | true | Keep base64 data URI images |
| \`strategy\` | string | auto | Override auto-detected site strategy |
| \`viewport\` | string | desktop | mobile, tablet, or desktop |
| \`qualityThreshold\` | number | 100 | Minimum word count for valid content |

## How to Run

\`\`\`bash
# Start the service
docker compose up -d        # Docker
npm run serve               # Local

# Run the test suite
./test-service.sh

# Stop the service
docker compose down
\`\`\`
ENDREPORT

echo ""
echo "╔══════════════════════════════════════════════════╗"
printf "║  Results: %2d passed, %2d failed, %2d total          ║\n" "$PASS" "$FAIL" "$TOTAL"
printf "║  Pass Rate: %3d%%                                  ║\n" "$RATE"
echo "║  Report: result.md                               ║"
echo "╚══════════════════════════════════════════════════╝"
