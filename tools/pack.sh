#!/usr/bin/env bash
# 打包：审计 app/ 目录 → 压缩“目录内容”到 dist/ttddp.zip → 审计 zip
# 用法：bash tools/pack.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
OUT="$ROOT/dist/ttddp.zip"
# 审计脚本来自小红书小工具 skill：优先用本机用户级 skill（~/.claude/skills，所有项目共用），其次项目内副本
AUDIT="$HOME/.claude/skills/minitool-zip-builder/scripts/audit_artifact.mjs"
[ -f "$AUDIT" ] || AUDIT="$ROOT/.claude/skills/minitool-zip-builder/scripts/audit_artifact.mjs"
[ -f "$AUDIT" ] || { echo "找不到 audit_artifact.mjs，请把 minitool-zip-builder skill 装到 ~/.claude/skills/"; exit 1; }

echo "== 1. 单元测试"
node "$ROOT/tools/engine.test.js"

echo "== 1b. 重新生成占卜分布表"
node "$ROOT/tools/build-fortune.js" 20000

echo "== 1c. 重新生成音频数据（app/audio/* → app/js/audio-data.js，容器不收音频文件类型）"
node "$ROOT/tools/build-audio.js"

echo "== 2. 违规能力扫描（命中即失败）"
# 例外：js/leaderboard.js 是每日排行模块，故意联网（fetch 到 BigLei3 排行榜服务器），排除在通用扫描外，下面单独用更窄的规则检查
if grep -rnE "fetch\(|XMLHttpRequest|new WebSocket|new EventSource|RTCPeerConnection|navigator\.geolocation|navigator\.clipboard|execCommand|navigator\.(bluetooth|usb|hid|serial|getBattery|connection|credentials|locks|serviceWorker)|enumerateDevices|getDisplayMedia|new (Shared)?Worker\(|Accelerometer|Gyroscope|Magnetometer|DeviceMotionEvent|DeviceOrientationEvent|requestFullscreen|\beval\(|new Function\(|WebAssembly|window\.open\(|window\.prompt\(|\bprompt\(|type=\"module\"|<iframe|<object|<base |https?://" "$APP" --include='*.html' --include='*.js' --include='*.css' --exclude='leaderboard.js' | grep -vE "xmlns|w3\.org"; then
  echo "发现违规能力引用，见上"; exit 1
fi
# leaderboard.js：除 fetch 外不得含其他违规能力；出现的网址只能是排行榜服务器
if grep -nE "XMLHttpRequest|new WebSocket|new EventSource|RTCPeerConnection|navigator\.|execCommand|\beval\(|new Function\(|WebAssembly|window\.open\(|\bprompt\(" "$APP/js/leaderboard.js"; then
  echo "leaderboard.js 含违规能力引用，见上"; exit 1
fi
if grep -noE "https?://[A-Za-z0-9./_-]+" "$APP/js/leaderboard.js" | grep -vE "biglei-leaderboard\.biglei3\.workers\.dev"; then
  echo "leaderboard.js 只允许访问 BigLei3 排行榜服务器"; exit 1
fi
echo "扫描通过（leaderboard.js 联网模块单独放行）"

echo "== 3. 目录审计"
node "$AUDIT" "$APP"

echo "== 4. 打包（压缩目录内容，index.html 在 zip 根）"
# 类型白名单严格按 zip-artifact-spec §2（上传端实测拒收 .ogg 等音频类型）。
# app/audio/ 是音频源目录，只用于生成 js/audio-data.js，整个目录不进包；以 . 或 _ 开头的目录也不进包。
mkdir -p "$ROOT/dist"
rm -f "$OUT"
cd "$APP"
python - "$OUT" <<'PY'
import os, sys, zipfile
out = sys.argv[1]
allow = {'.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json'}
SKIP_DIRS = {'audio'}
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if not d.startswith('_') and not d.startswith('.') and not (root == '.' and d in SKIP_DIRS)]
        for f in sorted(files):
            p = os.path.join(root, f)
            ext = os.path.splitext(f)[1].lower()
            if f == '.DS_Store' or ext not in allow:
                print('SKIP (type not allowed):', p); continue
            z.write(p, os.path.relpath(p, '.').replace(os.sep, '/'))
print('written', out)
PY

echo "== 5. zip 审计"
node "$AUDIT" "$OUT"
python -m zipfile -l "$OUT"
ls -l "$OUT"
