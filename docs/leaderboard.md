# 每日排行（2026-09-05 新增）

## 开关（默认关闭）

代码级开关，不暴露给玩家：`app/js/leaderboard.js` 顶部 `ENABLED_DEFAULT = false`。关闭时主页不显示「今日排行」、结算不上传也不显示名次、不探测容器用户信息接口，服务端接口不受影响。开发时可用 URL `?rank=1` 临时打开（`?rank=0` 关回，记在 `localStorage['ttddp.dev.rank']`，与 `?auto=` 同一套路）。真机验证容器允许联网、且拿到用户信息接口后再改为 `true`。

## 概览

- **服务器**：复用 BigLei3 项目的排行榜服务 —— Cloudflare Worker + D1，代码在 `C:\Users\Wu Xiangchen\Documents\ChatGPT\BigLei3\services\leaderboard`，线上地址 `https://biglei-leaderboard.biglei3.workers.dev`。原有的 BigLei3 分关榜接口（`/v1/stages/...`、`/v1/submit`）保持不变，每日榜是新增的 `/v1/daily/...` 一组接口，多游戏共用，本游戏 `game_id = ttddp`。
- **每日**：以北京时间（UTC+8）自然日为一榜，00:00 自动换榜（服务端按 `day = YYYY-MM-DD` 分表，不需要定时任务）。Cron 每天 04:17 清理 30 天前的数据。
- **成绩**：得分 = 本局最终得分（暂存区 + 盘上剩余，即 `Engine.tally().total`）。同一用户同一天只保留最高分；`runs` 记当天提交局数；名次按分数降序、同分先达者靠前。
- **客户端**：`app/js/leaderboard.js`（`window.TurtleBoard`）。结算时自动上传并在得分下方显示「今日第 N 名 · 共 M 人」；主页「今日排行」与结算页排名行都能打开榜单面板（Top 50 + 我的名次 + 刷新倒计时）。所有网络失败静默降级，不阻塞游戏。

## 用户身份（小红书用户名）

`TurtleBoard.getIdentity()` 按顺序：

1. **容器 JSBridge**：探测 `window.xhs.miniTool` 上的 `getUserInfo` / `getUserProfile` / `getLoginUserInfo` / `getCurrentUser`，只调用真实存在的函数，1.5 s 超时。返回值里按常见字段名取昵称（`nickname` / `nickName` / `name` …）、用户 id（`userId` / `user_id` / `openId` …）、头像。拿到后 `user_id = xhs-<id>`，昵称即小红书用户名，缓存到 `localStorage['ttddp.lb.profile']`。
2. **缓存**：本次容器没返回用户信息时，沿用上次拿到的小红书身份。
3. **本地匿名**：`user_id = anon-<随机 16 位 hex>`（`localStorage['ttddp.lb.uid']`），昵称默认「猫友 + 尾 4 位」，榜单面板里可自行填写（`ttddp.lb.nick`）。只有本地身份才显示昵称输入框。

> ⚠️ 当前 `minitool-zip-builder` skill 的 `jsbridge-api.md` **没有收录用户信息接口**，上面的方法名是猜测的候选。拿到官方接口名与字段后，改 `leaderboard.js` 顶部的 `USER_API_CANDIDATES` 与 `normalizeProfile()` 即可。

> ⚠️ skill 的 `device-capabilities.md` 明确写着小工具容器「纯本地、不联网」，`fetch` 被列为不可用行为。如果真机上容器 CSP 拦截了请求，客户端会退化为「今日排名 · 暂时无法连接」，游戏本身不受影响；这一点需要在真机上验证。`tools/pack.sh` 的违规扫描已把 `js/leaderboard.js` 单列，只允许它访问排行榜服务器域名。

## 接口

Base：`https://biglei-leaderboard.biglei3.workers.dev`，全部返回 JSON，允许跨域（`*`）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | `{ ok, now, day }` |
| GET | `/v1/daily/:game_id/top?limit=50&user_id=&day=` | 今日榜。`limit` 1–50；`user_id` 可选，附带 `me`；`day` 可选查历史 |
| GET | `/v1/daily/:game_id/me?user_id=` | 只查自己 |
| POST | `/v1/daily/submit` | 正文 `{ game_id, user_id, name, score, avatar? }`；`content-type` 可为 `text/plain`（省预检） |

返回：

```jsonc
// top
{ "game_id": "ttddp", "day": "2026-09-05", "now": 1788600000000, "resets_in": 36000000, "total": 12,
  "entries": [{ "rank": 1, "user_id": "xhs-…", "name": "…", "score": 61, "runs": 3, "updated_at": 1788599000000 }],
  "me": { "rank": 5, "name": "…", "score": 40, "runs": 2, "updated_at": … } /* 或 null */ }
// submit
{ "game_id": "ttddp", "day": "2026-09-05", "accepted": true, "improved": true, "best": 40, "rank": 5, "runs": 2, "total": 12, "resets_in": 36000000 }
```

校验：`game_id` `/^[a-z0-9_]{1,32}$/i`；`user_id` `/^[A-Za-z0-9_\-:.@]{1,80}$/`；昵称去控制字符、最长 24；`score` 1–1,000,000；`avatar` 只收 `https://`。错误返回 `{ error: bad_game | bad_user | bad_name | bad_score | bad_json | not_found | server_error }`。

## 数据表（D1 `biglei-leaderboard`）

```sql
CREATE TABLE IF NOT EXISTS daily_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL, day TEXT NOT NULL, user_id TEXT NOT NULL,
  name TEXT NOT NULL, avatar TEXT, score INTEGER NOT NULL,
  runs INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL,
  UNIQUE(game_id, day, user_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_scores_board ON daily_scores(game_id, day, score DESC, updated_at ASC);
CREATE INDEX IF NOT EXISTS idx_daily_scores_day ON daily_scores(day);
```

## 部署

在 `BigLei3/services/leaderboard` 目录（需要 Cloudflare 登录，`wrangler login` 会打开浏览器授权）：

```bash
cd "/c/Users/Wu Xiangchen/Documents/ChatGPT/BigLei3/services/leaderboard" && npx wrangler login
```

```bash
cd "/c/Users/Wu Xiangchen/Documents/ChatGPT/BigLei3/services/leaderboard" && npm run schema && npm run deploy
```

`npm run schema` 对线上 D1 执行 `schema.sql`（全部 `IF NOT EXISTS`，可重复执行）；`npm run deploy` 上传 Worker 并注册 Cron。本地联调：`npm run dev`（本地 D1，先 `npx wrangler d1 execute biglei-leaderboard --local --file=./schema.sql`），把 `leaderboard.js` 的 `API_BASE` 临时指到 `http://127.0.0.1:8787`。

验收：

```bash
curl -s "https://biglei-leaderboard.biglei3.workers.dev/v1/daily/ttddp/top?limit=3"
```
