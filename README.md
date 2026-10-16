# 猫猫对对碰 · 猫咪房间

在对对碰中收集猫咪，让它们住进可横向浏览的房间。

在线游玩：https://yuccapang-ai.github.io/meow/

- 房间是主界面，高度保持原来大小，横向长度缩短为原来的一半，猫咪保持原尺寸。
- 摸鱼猫、灰玳瑁猫皮肤均直接可选，各九款；「去养猫」保留当前皮肤。
- 房间默认入住墨镜猫和草莓猫；墨镜猫使用已有独立动画，不占用对局九色收集名额。
- 摸鱼猫收集卡中的猫分别累计 **30 只**后解锁本体；本系列每累计 **100 只**，按顺序再开放一只已解锁本体的猫入住，开放散步和睡觉。
- 每只收集卡猫分别累计 **50 只**后学会专属动作，入住后可使用。两系列门槛一致、进度独立，旧存档保留。
- 「猫咪收集」「猫咪状态」通过系列页签查看进度、动作、精力和旅行；收集页可直接开始当前系列的对局。
- 收集进度保存在当前浏览器；对局结算累计，重播不重复计数。
- 已入住猫咪各自随机出游 1–5 分钟，家里始终至少留 3 只；「猫咪状态」可查看倒计时、在家动作并召回。
- 每次回家随机带回 **10–50 猫薄荷**和 1–2 件猫爬架；猫薄荷余额显示在房间顶部，五款同画风家具自动摆放，同款合并收藏；猫咪靠近后会独占使用并跳上、跳下。
- 「布置家具」支持鼠标或触屏自由拖动，松手自动保存；靠近边缘可移动视角，也能一键恢复默认布局。

十八只猫各有散步、睡觉、专属动作三组逐帧动画，共 288 帧。灰玳瑁系列新增吃草莓、挥爪打招呼、挥动星星棒、浇小花、揉小面团、举放大镜、送出小信封、抱小鱼玩偶和展开小地图。

## 本地运行

需要 Python 3；Windows 可双击 `start-game.cmd`，或运行：

```sh
python tools/start-game.py
```

打开 http://127.0.0.1:8765/ 。应用是纯静态 HTML/CSS/JavaScript，无需安装 npm 依赖。

## Windows PC 游戏与桌宠

需要 Node.js 22.12 或更新版本。首次运行：

```sh
cd desktop
npm install
npm start
```

安装后双击根目录 `start-desktop.cmd`（旧入口 `start-pet.cmd` 也可使用），默认进入完整猫屋。猫屋有「放甜甜圈猫到桌面」快捷入口，「猫咪收集」和「猫咪状态」的甜甜圈猫卡片也有「放到桌面」按钮，再次点击可收回。该入口仅由 Electron 加载，手机网页保持原样。

桌宠透明置顶，点击吃甜甜圈、拖动移动、右键选择睡觉、散步或「返回猫屋（收回桌宠）」，获得焦点后按 Esc 也可返回。透明区域鼠标穿透。返回时如有尚未结束的对局，沿用游戏的退出确认。

桌宠开启时关闭游戏窗口只会隐藏并静音游戏，桌宠继续陪伴；双击系统托盘图标或右键「打开游戏」可恢复。没有桌宠时关闭游戏窗口直接退出；托盘「退出游戏与桌宠」始终退出整个程序。重复启动会恢复现有游戏，不创建重复桌宠。

此版接通入口和窗口生命周期，桌宠动画尚未同步游戏精力、睡眠、旅行和奖励，也不修改收集进度。PC 游戏存档保存在 Electron 中，与普通浏览器或手机网页存档独立。

在 `desktop/` 执行 `npm test` 可用独立临时存档验证猫屋入口、桌宠开关、返回与关闭行为，以及透明素材、动画和 preload 隔离。预览截图保存到 `output/desktop/`。

## 检查和发布

需要 Node.js 20 或更新版本：

```sh
node tools/engine.test.js
node tools/cat-collection.test.js
node tools/series-ui.test.js
node tools/cat-actions.test.js
node tools/cat-travel.test.js
node tools/cat-energy.test.js
node tools/room-residents.test.js
node tools/room-life.test.js
node tools/room-arrange.test.js
node tools/audit-pages.mjs
```

推送 `main` 后，GitHub Actions 运行检查并将 `app/` 发布到 GitHub Pages。Pages 的 Source 使用 **GitHub Actions**。

源码在 `app/`；原始美术素材、逐帧源图与生成提示词在 `myasset/`；玩法和存档说明在 `docs/`。详细素材清单见 [房间猫咪动作](myasset/room-cats-v1/README.md)。
