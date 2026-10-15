# 房间猫咪动作 v1

基于 myasset/cat_1.png 至 cat_9.png，使用内置 imagegen 生成逐帧素材。
每只猫 4×4 共 16 帧：0–7 散步，8–11 睡觉，12–15 专属动作。
提示词指定可移除纯色背景，本批内置工具返回的原图已有有效透明通道；统一裁切、缩放、脚底对齐后输出透明 WebP，不重复去底。
不通过变形或晃动替代步态。
甜甜圈猫默认入住，其余猫各自累计 30 只入住；每只猫累计 50 只解锁专属动作。

| 原图 | 猫咪 | 专属动作 | 图集 |
| --- | --- | --- | --- |
| cat_1.png | 甜甜圈猫 | 吃甜甜圈 | donut-actions-v1.webp |
| cat_2.png | 码农猫 | 敲键盘 | coder-actions-v1.webp |
| cat_3.png | 音乐猫 | 听歌打拍子 | music-actions-v1.webp |
| cat_4.png | 咖啡猫 | 喝咖啡 | coffee-actions-v1.webp |
| cat_5.png | 摄影猫 | 拍照片 | photo-actions-v1.webp |
| cat_6.png | 厨师猫 | 煎鸡蛋 | chef-actions-v1.webp |
| cat_7.png | 健身猫 | 举哑铃 | fitness-actions-v1.webp |
| cat_8.png | 画家猫 | 画爪印 | painter-actions-v1.webp |
| cat_9.png | 派对猫 | 吹派对喇叭 | party-actions-v1.webp |

最终游戏素材：`../../app/assets/room/cats/`（9 份 WebP + 9 份 JSON 帧描述）。
原始生成图：本目录 `*-source-v1.png`；米色底检查图：`*-preview-v1.png`。
完整生成提示词：本目录 `01-donut.prompt.txt` 至 `09-party.prompt.txt`。
生成方式：内置 imagegen，逐只参考原始 cat_N.png 生成；没有使用 API / CLI 回退。
整理工具：`../../tools/build-room-cats.cjs`，依赖 sharp；每格 256px，4×4，脚底 y=232。
