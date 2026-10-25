#!/usr/bin/env bash
# Renders the README screenshots with headless Chrome, Chromium or Edge – the Linux/macOS counterpart of screenshots.ps1.
# Start the dev server first (npm run dev), then: bash scripts/screenshots.sh
# The demo scenes live in src/devShots.ts (http://localhost:5173/?shot=<name>).
# Plugin packages render their own screenshots: --query adds URL parameters (e.g. "package=<folder>" installs
# plugins/<folder>/dist first), --out picks the folder (relative to the current one) and --name the file name.
#
#   bash scripts/screenshots.sh [--url http://localhost:5173] [--width 1600] [--height 900]
#                               [--shots "palette,tour"] [--query "package=openscad"] [--out dir] [--name file]
#
# Every scene is driven over the DevTools protocol and photographed as soon as it reports itself ready
# (document.body.dataset.shotReady) – scripts/capture-shot.mjs does that with Node.js 22 (the dev server needs it anyway).
set -euo pipefail

url='http://localhost:5173'
width=1600
height=900
shots='hero,night,scripts,terrain,mesh,measure,palette,tour,convert,plugins,text3d,translations'
query=''
out=''
name=''
while [ $# -gt 0 ]; do
  case "$1" in
    --url) url="$2"; shift 2 ;;
    --width) width="$2"; shift 2 ;;
    --height) height="$2"; shift 2 ;;
    --shots) shots="$2"; shift 2 ;;
    --query) query="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --name) name="$2"; shift 2 ;;
    -h | --help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

IFS=',' read -r -a shot_list <<< "$shots"
if [ -n "$name" ] && [ "${#shot_list[@]}" -ne 1 ]; then
  echo '--name needs exactly one shot' >&2
  exit 1
fi
extra=''
if [ -n "$query" ]; then
  extra="&${query#[&?]}"
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -n "$out" ]; then
  out_dir="$(pwd)/$out"
else
  out_dir="$root/docs/screenshots"
fi
mkdir -p "$out_dir"

# seconds a scene may take until it is ready – fonts and plugin packages with WebAssembly take longer
wait_for() {
  case "$1" in
    script) echo 120 ;;
    convert | plugins) echo 90 ;;
    text3d | translations) echo 60 ;;
    *) if [[ "$query" == *package=* ]]; then echo 120; else echo 30; fi ;;
  esac
}

browser=''
for candidate in "${CHROME:-}" google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable \
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' '/Applications/Chromium.app/Contents/MacOS/Chromium' \
  '/c/Program Files/Google/Chrome/Application/chrome.exe' '/c/Program Files (x86)/Google/Chrome/Application/chrome.exe' \
  '/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'; do
  if [ -n "$candidate" ] && command -v "$candidate" > /dev/null 2>&1; then
    browser="$candidate"
    break
  fi
done
if [ -z "$browser" ]; then
  echo 'Chrome, Chromium or Edge not found (set CHROME=/path/to/chrome)' >&2
  exit 1
fi

tmp="$(mktemp -d)"
chrome_pid=''
# Chrome is closed over the DevTools protocol (Browser.close) by scripts/capture-shot.mjs – that works on every system,
# also in Git Bash on Windows, where $! is not the Windows process id. kill is only the fallback.
stop_chrome() {
  if [ -n "$chrome_pid" ]; then
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$chrome_pid" 2> /dev/null || break
      sleep 0.5
    done
    kill "$chrome_pid" 2> /dev/null || true
    wait "$chrome_pid" 2> /dev/null || true
    chrome_pid=''
  fi
}
cleanup() {
  stop_chrome
  rm -rf "$tmp"
}
trap cleanup EXIT

port=9332
for shot in "${shot_list[@]}"; do
  port=$((port + 1)) # a port of its own per scene, so a Chrome that is still closing cannot answer
  shot="$(echo "$shot" | tr -d '[:space:]')"
  [ -z "$shot" ] && continue
  file="$out_dir/${name:-$shot}.png"
  echo "rendering $shot ..."
  # fresh profile per scene: no autosave or settings left over from the previous one
  "$browser" --headless=new --user-data-dir="$tmp/profile-$shot" --remote-debugging-port=$port --window-size="$width,$height" \
    --hide-scrollbars --force-device-scale-factor=1 --use-angle=swiftshader --enable-unsafe-swiftshader --no-first-run about:blank \
    > /dev/null 2>&1 &
  chrome_pid=$!
  node "$root/scripts/capture-shot.mjs" "$port" "$url/?shot=$shot$extra" "$width" "$height" "$(wait_for "$shot")" "$file" "$shot"
  stop_chrome
done
echo "done - ${#shot_list[@]} screenshots in $out_dir"
