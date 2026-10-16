# 灰玳瑁小猫动作素材 v2

以用户确认的 `../tortie-v1/nine-skins-preview-v3.png` 为造型基准，逐只使用内置 image_gen 生成。保持深灰底毛、少量灰米色斑、黄绿色眼睛、灰色爪尖，以及九款已确认配饰。

## 查看

直接打开本目录的 `preview.html`，可以切换九只猫的散步、睡觉和专属动作，也可以暂停播放。预览使用同目录素材，不需要联网。系统开启减少动画时默认展示静态帧。

三张合辑：`nine-walk.gif`、`nine-sleep.gif`、`nine-special.gif`。另有相同内容的动画 WebP。

## 素材清单

| 顺序 | 标识 | 皮肤 | 专属动作 |
| --- | --- | --- | --- |
| 1 | strawberry | 草莓猫 | 吃草莓 |
| 2 | sailor | 水手猫 | 挥爪打招呼 |
| 3 | wizard | 星星猫 | 挥动星星棒 |
| 4 | garden | 园丁猫 | 浇小花 |
| 5 | baker | 面包猫 | 揉小面团 |
| 6 | detective | 侦探猫 | 举放大镜 |
| 7 | postman | 邮差猫 | 送出小信封 |
| 8 | cozy | 抱抱猫 | 抱小鱼玩偶 |
| 9 | explorer | 探险猫 | 展开小地图 |

每只 16 帧，9 只共 144 帧；每只导出三组动画，共 27 组。

- `*-approved.png`：从已确认九宫格中裁出的单只造型参考。
- `01-strawberry.prompt.txt` 至 `09-explorer.prompt.txt`：完整生成提示词。
- `*-source-v2.png`：内置 image_gen 返回的原始动作图。
- `*-preview-v2.png`：重新分帧、统一缩放及脚底对齐后的米色底检查图。
- `*-walk.webp`、`*-sleep.webp`、`*-special.webp`：单只透明背景循环动画。
- `*-poster.png`：各动作的静态预览。
- `manifest.json`：皮肤、图集、帧说明及预览路径索引。
- `../../app/assets/room/tortie/*-actions-v2.webp` 和同名 PNG：游戏用透明 4×4 图集。
- `../../app/assets/room/tortie/*-actions-v2.json`：每帧位置与动作分组。
- `../../app/skins/tortie/1.webp` 至 `9.webp`：256×256 透明静态图标，由各自专属动作首帧导出。

已接入游戏，皮肤 ID 为 `tortie`（灰玳瑁猫），九款皮肤直接可选。房间住户使用 `tortie-<标识>`，与摸鱼猫采用相同的本体 30、系列入住名额每 100、专属动作 50 的门槛，两系列独立累计；草莓猫默认入住。收集和状态界面均可通过系列页签查看，完整规则见 `../../docs/cat-room.md`。

## 动作规格

图集为 1024×1024，每格 256×256，脚底基准 y=232；帧索引从 0 开始。

- 散步：0–7，八个步态姿势，预览每帧 120 毫秒，朝右；游戏中可按现有播放器用移动距离驱动，并水平翻转为朝左。
- 睡觉：8–11，包括伏下、垂头、闭眼蜷睡、呼吸。预览将最后两帧重复，再从入睡动作开始循环。
- 专属动作：12–15，四个关键姿势。预览序列为 12、13、14、13、14、15。

坐姿专属动作使用两只前爪及两只落地后脚；行走使用四肢步态，睡眠姿势允许后脚自然被身体和尾巴遮挡。

## 整理与校验

`../../tools/build-tortie-cats.cjs` 使用 sharp 按透明轮廓识别每只完整角色，再裁切、统一缩放和对齐。分帧识别保留单独的花盆、水滴等道具，并隔离相邻角色。所有动作姿势来自生成原图。

`../../tools/audit-tortie-assets.cjs` 检查九只角色的图集规格、144 个非空帧、透明边距、八个不同的行走帧、四个不同的专属动作帧、27 个动画的帧数与时长，以及预览链接。四肢与毛色另外通过逐帧检查图进行目视检查。

在已安装 sharp 的 Node.js 环境，从项目根目录运行：

```sh
node tools/build-tortie-cats.cjs
node tools/audit-tortie-assets.cjs
```

支持仅整理指定猫，如 `node tools/build-tortie-cats.cjs strawberry sailor`；仅重建合辑使用 `node tools/build-tortie-cats.cjs gallery`。

生成方式：内置 image_gen。未使用 API / CLI 回退。原始生成图具备有效透明通道，整理时保留透明度。
