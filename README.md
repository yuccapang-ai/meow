# 猫猫对对碰 · 猫咪房间

在对对碰中收集猫咪，让它们住进可横向浏览的房间。

在线游玩：https://yuccapang-ai.github.io/meow/

- 房间是主界面，高度保持原来大小，横向长度缩短为原来的一半，猫咪保持原尺寸。
- 甜甜圈猫默认入住，开放散步和睡觉。
- 其余八只猫分别累计 **30 只**后入住，开放散步和睡觉。
- 每只猫分别累计 **50 只**后解锁专属动作。
- 「猫咪收集」展示每只猫的进度，并可点选已解锁动作。
- 收集进度保存在当前浏览器；对局结算累计，重播不重复计数。

九只猫各有散步、睡觉、专属动作三组逐帧动画，共 144 帧。专属动作包括吃甜甜圈、敲键盘、听歌打拍子、喝咖啡、拍照、煎蛋、举哑铃、画画和吹派对喇叭。

## 本地运行

需要 Python 3；Windows 可双击 `start-game.cmd`，或运行：

```sh
python tools/start-game.py
```

打开 http://127.0.0.1:8765/ 。应用是纯静态 HTML/CSS/JavaScript，无需安装 npm 依赖。

## 检查和发布

需要 Node.js 20 或更新版本：

```sh
node tools/engine.test.js
node tools/cat-collection.test.js
node tools/cat-actions.test.js
node tools/room-residents.test.js
node tools/audit-pages.mjs
```

推送 `main` 后，GitHub Actions 运行检查并将 `app/` 发布到 GitHub Pages。Pages 的 Source 使用 **GitHub Actions**。

源码在 `app/`；原始美术素材、逐帧源图与生成提示词在 `myasset/`；玩法和存档说明在 `docs/`。详细素材清单见 [房间猫咪动作](myasset/room-cats-v1/README.md)。
