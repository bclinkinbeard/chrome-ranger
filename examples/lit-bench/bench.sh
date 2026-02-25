#!/usr/bin/env bash
set -euo pipefail

# Install matching chromedriver for this Chrome version.
# Tachometer uses WebDriver, so chromedriver must match the Chrome binary.
CHROMEDRIVER_PATH=$(npx --yes @puppeteer/browsers install chromedriver@"$CHROME_VERSION" \
  --path /tmp/chromedriver-cache 2>/dev/null | tail -1)

# Generate a Tachometer config that uses chrome-ranger's Chrome binary
CONFIG=$(mktemp /tmp/tach-XXXXXX.json)
trap "rm -f $CONFIG" EXIT

cat > "$CONFIG" << EOF
{
  "sampleSize": 20,
  "timeout": 0,
  "benchmarks": [
    {
      "url": "packages/benchmarks/lit-html/kitchen-sink/index.html",
      "measurement": [
        { "mode": "performance", "entryName": "kitchen-sink" }
      ],
      "browser": {
        "name": "chrome",
        "binary": "$CHROME_BIN",
        "headless": true
      }
    }
  ]
}
EOF

# Run Tachometer. JSON output to stdout, progress noise to stderr.
CHROMEDRIVER_PATH="$CHROMEDRIVER_PATH" \
  npx tachometer --config "$CONFIG" --json-file /dev/stdout 2>/dev/null
