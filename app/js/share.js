/* 猫猫对对碰 · 战绩图（Canvas 2D 渲染）+ JSBridge 存相册
 * 仅在 Run 结束后按需调用，不参与首屏。ES2017 / Chrome 61。
 * 依赖 skins.js（window.TurtleSkin）：图片套系直接 drawImage 包内图片；矢量套系用 Canvas 手绘乌龟。 */
(function (root) {
  'use strict';

  var Skin = root.TurtleSkin;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hexToRgba(hex, a) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return 'rgba(216,85,44,' + a + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
  }

  /* 运势票签（呼应结算页 .fortune__stamp 的票签样式）：主题色实心、内嵌双层描边、两侧打孔、微倾斜；
   * 末吉留白反色，大吉外圈再加一道描边。tier: 0 末吉 / 1 小吉 / 2 中吉 / 3 大吉 */
  function drawFortuneStamp(ctx, cx, cy, text, tier, acc) {
    var w = 220, h = 82, paper = '#f4e7cc', isZero = tier === 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-4 * Math.PI / 180);
    if (!isZero) {
      ctx.fillStyle = 'rgba(46,45,40,0.28)';
      roundRect(ctx, -w / 2 + 3, -h / 2 + 6, w, h, 16); ctx.fill();
    }
    ctx.fillStyle = isZero ? paper : acc;
    roundRect(ctx, -w / 2, -h / 2, w, h, 16); ctx.fill();
    if (isZero) {
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 5; ctx.strokeStyle = acc;
      roundRect(ctx, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 12); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.lineWidth = 5; ctx.strokeStyle = paper;
      roundRect(ctx, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 12); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = acc;
      roundRect(ctx, -w / 2 + 9, -h / 2 + 9, w - 18, h - 18, 9); ctx.stroke();
    }
    if (tier === 3) {
      ctx.lineWidth = 4; ctx.strokeStyle = paper;
      roundRect(ctx, -w / 2 - 6, -h / 2 - 6, w + 12, h + 12, 20); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = acc;
      roundRect(ctx, -w / 2 - 11, -h / 2 - 11, w + 22, h + 22, 24); ctx.stroke();
    }
    var holes = [-w / 2, w / 2];
    for (var i = 0; i < holes.length; i++) {
      ctx.fillStyle = paper;
      ctx.beginPath(); ctx.arc(holes[i], 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = acc;
      ctx.beginPath(); ctx.arc(holes[i], 0, 9, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = isZero ? acc : paper;
    ctx.font = '900 34px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var chars = String(text).split(''), gap = 40, totalW = (chars.length - 1) * gap;
    for (i = 0; i < chars.length; i++) ctx.fillText(chars[i], -totalW / 2 + i * gap, 2);
    ctx.restore();
  }

  /* 简笔乌龟（俯视），矢量套系用 */
  function drawTurtle(ctx, cx, cy, size, color, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot || 0);
    var s = size / 100;
    ctx.scale(s, s);
    ctx.translate(-50, -50);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    var legs = [[22, 34, -38], [78, 34, 38], [22, 74, 38], [78, 74, -38]];
    for (var i = 0; i < legs.length; i++) {
      ctx.save(); ctx.translate(legs[i][0], legs[i][1]); ctx.rotate(legs[i][2] * Math.PI / 180);
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(50, 86); ctx.lineTo(44, 97); ctx.lineTo(56, 97); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(50, 17, 13, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#24332c';
    ctx.beginPath(); ctx.arc(45, 15, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(55, 15, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(50, 54, 32, 33, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(50, 53, 30, 31, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(50, 38); ctx.lineTo(62, 45); ctx.lineTo(62, 60); ctx.lineTo(50, 67); ctx.lineTo(38, 60); ctx.lineTo(38, 45); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(40, 36, 8, 4, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* 画第 idx 款：images 为预载好的图片数组（图片套系），为 null 时退回矢量乌龟 / 色块 */
  function drawItem(ctx, idx, cx, cy, size, rot, skin, images) {
    if (skin.type === 'image') {
      var im = images && images[idx];
      if (im && im.complete && im.naturalWidth > 0) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot || 0);
        ctx.drawImage(im, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        // 图片不可用：画一个柔和色块占位
        ctx.save(); ctx.fillStyle = 'rgba(31,58,45,0.12)';
        ctx.beginPath(); ctx.arc(cx, cy, size / 2.4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    } else {
      drawTurtle(ctx, cx, cy, size, skin.colors[idx], rot);
    }
  }

  /* 生成战绩卡，返回 canvas（同步；images 可为 null）
   * 套用结算主题：强调色 / 标题带 / 运势票签 / 页脚标语都跟着 Top1 款式走，呼应结算页 --acc 的主题化处理 */
  function renderCard(stats, images) {
    var skin = Skin.get();
    var themeIdx = (stats.themeIdx !== null && stats.themeIdx !== undefined) ? stats.themeIdx : (stats.lucky || 0);
    var themeFx = Skin.fx(themeIdx, skin), themeInfo = Skin.theme(themeIdx, skin);
    var acc = themeFx.color;
    var tier = stats.fortuneTier != null ? stats.fortuneTier : 2;
    var W = 900, H = 1320;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#f4e7cc'); bg.addColorStop(1, '#ece0c0');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // 外框 + 底部格纹（外层保持品牌绿，主题色只作用在结果卡内部，呼应结算页遮罩不变、banner 才换色）
    ctx.strokeStyle = '#93ad7f'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10);
    ctx.fillStyle = '#93ad7f';
    for (var gx0 = 0; gx0 < W; gx0 += 30) {
      for (var gy0 = H - 30; gy0 < H; gy0 += 30) {
        if (((gx0 / 30) + (gy0 / 30)) % 2 === 0) ctx.fillRect(gx0, gy0, 30, 30);
      }
    }

    // 装饰：9 款围成一圈
    for (var i = 0; i < 9; i++) {
      var ang = (i / 9) * Math.PI * 2;
      var rot = skin.type === 'image' ? (Math.sin(ang) * 0.25) : (ang + Math.PI / 2);
      drawItem(ctx, i, W / 2 + Math.cos(ang) * 360, 250 + Math.sin(ang) * 130, skin.type === 'image' ? 120 : 90, rot, skin, images);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#7d9a6a';
    ctx.font = '900 84px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('猫猫对对碰', W / 2, 300);
    ctx.font = '500 30px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#7d9a6a';
    ctx.fillText('•  MY RUN · ' + skin.name + '  •', W / 2, 350);

    // 结果卡：外层描边 + 结果标题带都用主题色（对应结算页 .banner { border-color: var(--acc) }）
    ctx.fillStyle = acc;
    roundRect(ctx, 84, 412, 732, 764, 26); ctx.fill();
    ctx.fillStyle = '#f4e7cc';
    roundRect(ctx, 92, 420, 716, 748, 20); ctx.fill();
    ctx.font = '900 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    var ribbonText = themeInfo.ribbon, rw = ctx.measureText(ribbonText).width + 80, rh = 52;
    ctx.fillStyle = acc;
    roundRect(ctx, W / 2 - rw / 2, 396, rw, rh, 26); ctx.fill();
    ctx.fillStyle = '#f4e7cc';
    ctx.fillText(ribbonText, W / 2, 432);

    // 运势票签：主题色实心票签，呼应结算页 fortune__stamp
    drawFortuneStamp(ctx, W / 2, 508, stats.fortune, tier, acc);

    // 大数字：最终得分（只）= 暂存区 + 盘上剩余
    var numFont = '900 170px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    var unitFont = '700 44px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    var numStr = String(stats.score);
    ctx.font = numFont;
    var nw = ctx.measureText(numStr).width;
    ctx.font = unitFont;
    var uw = ctx.measureText('只').width;
    var x0 = W / 2 - (nw + 14 + uw) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = acc;
    ctx.font = numFont;
    ctx.fillText(numStr, x0, 712);
    ctx.fillStyle = '#2e2d28';
    ctx.font = unitFont;
    ctx.fillText('只', x0 + nw + 14, 712);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5f7c4b';
    ctx.font = '700 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('暂存区 ' + stats.stashed + ' 只 + 棋盘剩余 ' + stats.onBoard + ' 只', W / 2, 758);
    ctx.font = 'italic 500 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#6e6c62';
    ctx.fillText(stats.reasonText, W / 2, 796);
    if (stats.fortuneLine) {
      ctx.font = '800 28px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#2e2d28';
      ctx.fillText(stats.fortuneLine, W / 2, 834);
    }

    // Top3：持有数量最多的三款，第一名用主题色
    var top = stats.top || [];
    var tw = 210, th = 164, tgap = 20, ty = 872;
    var tx0 = W / 2 - (top.length * tw + (top.length - 1) * tgap) / 2;
    for (var k = 0; k < top.length; k++) {
      var tx = tx0 + k * (tw + tgap), first = k === 0;
      ctx.fillStyle = first ? acc : '#93ad7f';
      roundRect(ctx, tx, ty, tw, th, 16); ctx.fill();
      ctx.fillStyle = '#ece0c0';
      roundRect(ctx, tx + 3, ty + 3, tw - 6, th - 6, 14); ctx.fill();
      ctx.fillStyle = first ? acc : '#2e2d28';
      roundRect(ctx, tx + tw / 2 - 44, ty - 14, 88, 28, 14); ctx.fill();
      ctx.fillStyle = '#f4e7cc';
      ctx.font = '900 16px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('TOP ' + (k + 1), tx + tw / 2, ty + 6);
      drawItem(ctx, top[k].color, tx + tw / 2, ty + 66, 78, 0, skin, images);
      ctx.fillStyle = first ? acc : '#2e2d28';
      ctx.font = '900 34px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(String(top[k].count), tx + tw / 2, ty + 130);
      ctx.fillStyle = '#5f7c4b';
      ctx.font = '700 18px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(Skin.itemName(top[k].color), tx + tw / 2, ty + 154);
    }

    // 过程数据一行：卡片边框换成主题色的浅色调（呼应结算页 .tally__item 用 --acc-soft / --acc-faint）
    var items = [['轮次', stats.rounds], ['卡包赚取', stats.earned], ['连线', stats.lines], ['对子', stats.pairs]];
    var cellW = 168, cellH = 78, gap = 12, gy = 1058;
    var gx = W / 2 - (items.length * cellW + (items.length - 1) * gap) / 2;
    for (k = 0; k < items.length; k++) {
      var cx = gx + k * (cellW + gap);
      ctx.fillStyle = hexToRgba(acc, 0.45);
      roundRect(ctx, cx, gy, cellW, cellH, 14); ctx.fill();
      ctx.fillStyle = hexToRgba(acc, 0.08);
      roundRect(ctx, cx + 3, gy + 3, cellW - 6, cellH - 6, 12); ctx.fill();
      ctx.fillStyle = '#2e2d28';
      ctx.font = '800 32px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(String(items[k][1]), cx + cellW / 2, gy + 42);
      ctx.fillStyle = '#5f7c4b';
      ctx.font = '700 18px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(items[k][0], cx + cellW / 2, gy + 68);
    }

    if (stats.lucky !== null && stats.lucky !== undefined) {
      drawItem(ctx, stats.lucky, W / 2 - 150, 1156, 56, 0, skin, images);
      ctx.fillStyle = '#5f7c4b';
      ctx.font = '700 24px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('幸运款 ' + Skin.itemName(stats.lucky) + ' · 加成 +' + stats.luckyBonus, W / 2 - 112, 1164);
      ctx.textAlign = 'center';
    }

    if (stats.newRecord) {
      ctx.fillStyle = acc;
      roundRect(ctx, W / 2 - 120, 1178, 240, 44, 22); ctx.fill();
      ctx.fillStyle = '#f4e7cc';
      ctx.font = '800 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('新纪录！', W / 2, 1209);
    }

    // 页脚标语：主题英文标语（对应结算页 .banner__tagline）+ 邀战 CTA
    ctx.fillStyle = acc;
    ctx.font = 'italic 900 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(themeInfo.tagline, W / 2, 1246);
    ctx.fillStyle = '#2e2d28';
    ctx.font = 'italic 700 22px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('你能比我收集更多吗？', W / 2, 1278);
    return canvas;
  }

  /* 加载图片、渲染、导出 dataURL。若包内图片让 canvas 被判为跨源（toDataURL 抛错），改用无图版本重画。
   * 返回 Promise<{ canvas, dataUrl }>，不 reject。 */
  function buildCard(stats) {
    return new Promise(function (resolve) {
      Skin.preload(null, function (images) {
        var canvas = renderCard(stats, images);
        var dataUrl;
        try {
          dataUrl = canvas.toDataURL('image/png');
        } catch (e) {
          canvas = renderCard(stats, null);
          dataUrl = canvas.toDataURL('image/png');
        }
        resolve({ canvas: canvas, dataUrl: dataUrl });
      });
    });
  }

  function hasBridge() {
    return !!(root.xhs && root.xhs.miniTool && typeof root.xhs.miniTool.saveImageToPhotosAlbum === 'function');
  }

  /* 保存到相册。返回 Promise<{ok, msg, dataUrl}>，不 reject。 */
  function saveToAlbum(dataUrl) {
    if (!hasBridge()) {
      return Promise.resolve({ ok: false, msg: '当前环境不支持保存到相册', dataUrl: dataUrl });
    }
    var bridge = root.xhs.miniTool;
    var p;
    if (typeof bridge.writeTempFile === 'function') {
      p = bridge.writeTempFile({ data: dataUrl }).then(function (res) {
        return bridge.saveImageToPhotosAlbum({ filePath: res.filePath });
      });
    } else {
      p = bridge.saveImageToPhotosAlbum({ filePath: dataUrl });
    }
    return p.then(function () {
      return { ok: true, msg: '已保存到相册', dataUrl: dataUrl };
    }, function (err) {
      var m = (err && err.errMsg) ? err.errMsg : '保存失败';
      return { ok: false, msg: m, dataUrl: dataUrl };
    });
  }

  root.TurtleShare = { renderCard: renderCard, buildCard: buildCard, saveToAlbum: saveToAlbum, hasBridge: hasBridge };
})(window);
