# 皮肤套系

游戏里的 9 种「颜色」在表现层是 9 个「款式」，由皮肤套系决定长什么样。引擎只认索引 0..8，与皮肤无关。

## 现有套系

| id | 名称 | 类型 | 资源 |
| --- | --- | --- | --- |
| `turtle` | 经典乌龟（测试套系，不开放给玩家；URL 带 `?skins=all` 才出现在列表，`?skins=player` 恢复） | svg | `index.html` 内的 `#t-turtle` symbol + 9 个颜色 |
| `cats` | 摸鱼猫（默认开放） | image | `app/skins/cats/1.webp` … `9.webp`（源文件在 `myasset/cat_1..9.png`） |
| `pengci` | 碰瓷猫（单局历史最高 60 只解锁） | image | `app/skins/pengci/1.webp` … `9.webp`（源文件在 `myasset/cat2nd_1..9.png`）。九款各有专属 fx（carrot / flat / peek / box / cool / boba / cart / heart / rain），消除动作统一先「哎哟」歪倒一下（碰瓷梗）再接各自动作 |
| `weekend` | 卷卷猫（单局历史最高 80 只解锁） | image | `app/skins/weekend/1.webp` … `9.webp`（源文件在 `myasset/cat3rd_1..9.png`）。九款专属 fx（burger / blanket / movie / selfie / bath / shop / refill / book / drive），消除动作统一先「伸个懒腰」再接各自动作 |

默认套系 `cats`，玩家在首页「皮肤」里切换，选择存 `localStorage`（键 `ttddp.skin.v1`）。

## 解锁

- 解锁条件是**单局历史最高分**（结算的「只」数，存档 `ttddp.best.v2` 的 `score`）。套系的 `unlock` 字段是门槛（0 / 不写 = 默认开放）：碰瓷猫 60、卷卷猫 80。参考 `node tools/simulate.js 20000 20`：每局中位数 48 只、P90 64 只。
- 累计获得的猫猫数仍然记录在 `cats` 字段并显示在首页，但不参与解锁。
- 未解锁的套系在皮肤列表里灰显、名字后带「未解锁」、下面一条小进度条和「单局 60 只解锁 · 历史最高 48」，点了只抖一下；选幸运款时的左右切换也会跳过它。
- 只要还有套系没解锁，结算流程变成：先弹「皮肤解锁进度」（结算横幅同规格）：目标套系的剪影用首页同款 Q 弹轮播，进度条深色 = 历史最高（破纪录时从旧纪录涨到新纪录）、浅色 = 本局得分。涨满门槛则：白闪、标题带换「新套系解锁！」、底纹换成该套系首款的结算主题、剪影恢复彩色重新落下、落地时放该款粒子 + 彩纸。点任意位置 / 「查看结算」或 3.5 秒（解锁时 6 秒）后进入结算页；结算页「再来一局」下方还有一条小进度条 + 文字。全部解锁后两处都不再出现。
- 调试：控制台 `TTDDP.setBest(n)` 改历史最高，`TTDDP.previewUnlock(旧纪录, 新纪录, 本局得分)` 直接预览弹层。

## 代码里用到皮肤的位置

- 棋盘格子、首页三只吉祥物、幸运款标签、开局选幸运款、结果页幸运款：都通过 `TurtleSkin.paint(container, idx)` 渲染，同一个容器可在 svg / image 类型间切换。
- 战绩图（`share.js`）：图片套系用 `drawImage` 画包内图片；若容器把 canvas 判为跨源导致 `toDataURL` 失败，自动退回无图版本。
- 款式名（`TurtleSkin.itemName(idx)`）用于选款按钮的文字和结果页。
