/* 猫猫对对碰 · 皮肤套系
 * 每个套系提供 9 个「款式」，对应引擎里的 9 个颜色索引 0..8。
 * 新增套系：把 9 张 256×256 透明图放到 app/skins/<id>/1..9.webp，在 SKINS 里加一条即可。
 * 每个款式可选 fx（消除特效预设名，见 fx.js PRESETS）、color（主题色，用于飘字 / HUD 闪色）、word（飘字口头语）；
 * 不写则用默认 pop 特效与套系颜色。
 * 套系级字段：unlock = 单局历史最高分达到多少只后解锁（0 / 不写 = 默认开放）；dev = 测试套系，只在 ?skins=all 下出现在列表里。
 * 经典脚本，挂到 window.TurtleSkin。ES2017 / Chrome 61。 */
(function (root) {
  'use strict';

  var SKINS = [
    {
      id: 'turtle',
      name: '经典乌龟',
      noun: '乌龟',
      dev: true,              // 测试套系：不开放给玩家，URL 带 ?skins=all 才出现在列表里
      type: 'svg',            // 用 index.html 里的 SVG symbol + CSS 颜色类
      symbol: '#t-turtle',
      wipe: 'turtle',        // 页面转场剪影（见 wipe.js SHAPES）
      colors: ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac'],
      items: [
        { name: '红龟' }, { name: '橙龟' }, { name: '黄龟' },
        { name: '绿龟' }, { name: '青龟' }, { name: '蓝龟' },
        { name: '靛龟' }, { name: '紫龟' }, { name: '粉龟' }
      ]
    },
    {
      id: 'cats',
      name: '摸鱼猫',
      noun: '猫猫',
      unlock: 0,              // 默认开放
      type: 'image',          // 包内图片
      dir: './skins/cats/',
      ext: '.webp',
      wipe: 'cat',
      items: [
        { name: '甜甜圈猫', file: '1', fx: 'donut',   color: '#f06595', word: '啵！',
          news: { pair: '吃出了隐藏款甜甜圈', line: '包场了整家甜品店' },
          fortune: ['三分甜也不错呀~', '还剩半个，明天再吃', '最甜的就是你啦~', '扫荡整家甜品店！'],
          theme: { ribbon: '甜品店打烊', tagline: "SWEET RUN, SWEET RECORD" } },
        { name: '码农猫',   file: '2', fx: 'code',    color: '#2f9e44', word: '</>',
          news: { pair: '修好了一个史诗级 bug', line: '一键上线零报错' },
          fortune: ['事已至此，先睡觉吧', '佛祖保佑，编译全过', 'CatGPT 5.6 就是你', 'Bug清空，全组鼓掌'],
          theme: { ribbon: 'BUILD PASSED', tagline: "COMMIT · PUSH · DEPLOY" } },
        { name: '音乐猫',   file: '3', fx: 'music',   color: '#4c6ef5', word: '♪♫',
          news: { pair: '即兴来了一段 solo', line: '开了场万人演唱会' },
          fortune: ['叮叮铛铛叮叮铛', '啦啦啦~啦啦啦~', '现场嗨唱，掌声不断', '万人合唱，今晚封神'],
          theme: { ribbon: '演唱会散场', tagline: "ENCORE! ENCORE!" } },
        { name: '咖啡猫',   file: '4', fx: 'coffee',  color: '#8d5524', word: '呼~',
          news: { pair: '拉出了完美拿铁花', line: '连开三家咖啡分店' },
          fortune: ['喝点苦的也不错QwQ', '再来一杯吧~', '一杯下去，精神满格', '是时候开家分店了！'],
          theme: { ribbon: '咖啡时间结束', tagline: "LATTE ART & CHILL" } },
        { name: '摄影猫',   file: '5', fx: 'photo',   color: '#495057', word: '咔嚓',
          news: { pair: '抓拍到了绝美瞬间', line: '个人影展火爆开幕' },
          fortune: ['记得带上自拍杆', '随手拍拍，尽兴就好', '光线正好，张张出片', '影展级大片，今晚刷屏'],
          theme: { ribbon: '快门落下', tagline: "SNAPSHOT OF THE DAY" } },
        { name: '厨师猫',   file: '6', fx: 'chef',    color: '#f08c00', word: '滋~',
          news: { pair: '煎出了完美溏心蛋', line: '拿下了米其林三星' },
          fortune: ['蛋煎焦了，点外卖吧', '家常滋味就是最棒的', '火候正好，全桌光盘', '今天我是米其林！'],
          theme: { ribbon: '今日打烊', tagline: "CHEF'S SPECIAL" } },
        { name: '健身猫',   file: '7', fx: 'gym',     color: '#e8590c', word: '嘿！',
          news: { pair: '刷新了深蹲个人纪录', line: '斩获健美大赛冠军' },
          fortune: ['记得劳逸结合哦', '完成了日常训练，不错', '破了个人纪录，冲', '完美体格，全场闪光！'],
          theme: { ribbon: '训练结束', tagline: "ONE MORE REP!" } },
        { name: '画家猫',   file: '8', fx: 'painter', color: '#ae3ec9', word: '刷~',
          news: { pair: '画出了稀世珍品', line: '画作拍出了天价' },
          fortune: ['出门找找灵感吧', '随手涂鸦，也还不错', '灵感爆发，停不下来', '稀世珍品，拍出天价'],
          theme: { ribbon: '画展闭幕', tagline: "MASTERPIECE UNVEILED" } },
        { name: '派对猫',   file: '9', fx: 'party',   color: '#f03e3e', word: '砰！',
          news: { pair: '点燃了全场气氛', line: '办了场通宵狂欢派对' },
          fortune: ['今天还是早点睡', '小聚一下，也挺好', '气氛正嗨，全场跟跳', '通宵狂欢，今晚是主角'],
          theme: { ribbon: '派对散场', tagline: "PARTY NEVER ENDS" } }
      ]
    },
    {
      id: 'tortie',
      name: '灰玳瑁猫',
      noun: '猫猫',
      unlock: 0,
      type: 'image',
      dir: './skins/tortie/',
      ext: '.webp',
      wipe: 'cat',
      items: [
        { name: '草莓猫', file: '1', fx: 'donut', color: '#e87891', word: '甜！',
          news: { pair: '摘到了最甜的草莓', line: '装满了一整篮草莓' } },
        { name: '水手猫', file: '2', fx: 'rain', color: '#4a89b9', word: '嗨～',
          news: { pair: '向远处的小船挥爪', line: '带着伙伴一起出航' } },
        { name: '星星猫', file: '3', fx: 'party', color: '#9677b4', word: '闪！',
          news: { pair: '点亮了一颗小星星', line: '把夜空装进口袋' } },
        { name: '园丁猫', file: '4', fx: 'carrot', color: '#7f9b72', word: '开花',
          news: { pair: '给小花浇了点水', line: '种出了一整片花园' } },
        { name: '面包猫', file: '5', fx: 'chef', color: '#c79b60', word: '揉揉',
          news: { pair: '揉出了一团软面包', line: '面包店今天全售罄' } },
        { name: '侦探猫', file: '6', fx: 'peek', color: '#9c8872', word: '发现',
          news: { pair: '发现了小鱼干的线索', line: '解开了所有小谜题' } },
        { name: '邮差猫', file: '7', fx: 'heart', color: '#4c9898', word: '来信',
          news: { pair: '送出了一封暖暖的信', line: '把好消息送到每一家' } },
        { name: '抱抱猫', file: '8', fx: 'blanket', color: '#d99c9b', word: '抱抱',
          news: { pair: '抱紧了小鱼玩偶', line: '收获了一屋子的拥抱' } },
        { name: '探险猫', file: '9', fx: 'book', color: '#c88651', word: '出发',
          news: { pair: '在地图上标记了宝藏', line: '探索了整座小岛' } }
      ].map(function (item) {
        item.fortune = ['先歇一会儿，明天再来', '收获一点小快乐', '今天的好运满满当当', '猫猫伙伴都为你鼓掌！'];
        item.theme = { ribbon: item.name + '的小收获', tagline: 'LITTLE PAWS, BIG ADVENTURES' };
        return item;
      })
    },
    {
      id: 'pengci',
      name: '碰瓷猫',
      noun: '猫猫',
      unlock: 60,             // 单局历史最高 60 只解锁（每局中位数约 48 只、P90 约 64 只，见 tools/simulate.js）
      type: 'image',
      dir: './skins/pengci/',
      ext: '.webp',
      wipe: 'cat',
      /* 套系 2「碰瓷猫」：每款专属 fx（见 fx.js PRESETS / game.css out-*），消除动作统一先「哎哟」歪倒一下再接各自动作 */
      items: [
        { name: '啃萝卜猫', file: '1', fx: 'carrot', color: '#f76707', word: '嘎吱',
          news: { pair: '啃掉了一整根胡萝卜', line: '包圆了整片菜园' },
          fortune: ['萝卜没了，明天再啃', '啃了半根，也算加餐', '嘎吱嘎吱，越啃越香', '菜园包圆，兔子失业'],
          theme: { ribbon: '菜园收工', tagline: "CRUNCH TIME" } },
        { name: '躺平猫',   file: '2', fx: 'flat',   color: '#82c91e', word: '躺~',
          news: { pair: '成功躺平了一整天', line: '把整条沙发都躺满了' },
          fortune: ['今天也没躺平', '小躺一会儿，也不错', '躺得刚刚好，舒服', '躺赢全场，天下第一'],
          theme: { ribbon: '躺平结束', tagline: "LIE FLAT, WIN BIG" } },
        { name: '偷看猫',   file: '3', fx: 'peek',   color: '#868e96', word: '瞄~',
          news: { pair: '偷偷瞄到了小鱼干', line: '看穿了所有人的底牌' },
          fortune: ['啥也没看见……', '瞄到一点点，够了', '看得清清楚楚', '一眼看穿，全场底牌'],
          theme: { ribbon: '偷看结束', tagline: "PEEK-A-BOO" } },
        { name: '纸箱猫',   file: '4', fx: 'box',    color: '#e67700', word: '嗖！',
          news: { pair: '钻进了一个新纸箱', line: '把快递站都搬回家了' },
          fortune: ['纸箱太小，进不去', '找到个合身的箱子', '箱箱都合身，随便钻', '纸箱王国，我是国王'],
          theme: { ribbon: '纸箱到货', tagline: "IF I FITS, I SITS" } },
        { name: '墨镜猫',   file: '5', fx: 'cool',   color: '#343a40', word: '酷~',
          news: { pair: '摆出了最酷的姿势', line: '酷倒了整条街' },
          fortune: ['墨镜掉了，有点尬', '还行，挺酷的', '酷得有点过分了', '全场最酷，无人能敌'],
          theme: { ribbon: '装酷结束', tagline: "TOO COOL FOR YOU" } },
        { name: '奶茶猫',   file: '6', fx: 'boba',   color: '#9c6644', word: '嘬~',
          news: { pair: '嘬到了最后一颗珍珠', line: '喝空了整条奶茶街' },
          fortune: ['珍珠没吸到，气', '半糖去冰，刚刚好', '珍珠满杯，嘬到爽', '奶茶自由，喝到打嗝'],
          theme: { ribbon: '奶茶喝完', tagline: "BOBA O'CLOCK" } },
        { name: '推车猫',   file: '7', fx: 'cart',   color: '#f59f00', word: '哼~',
          news: { pair: '坐着购物车逛了一圈', line: '把整个超市都推走了' },
          fortune: ['购物车空空的', '买了点小零食，开心', '购物车塞满，满载而归', '整个超市都是我的'],
          theme: { ribbon: '超市打烊', tagline: "SHOP TILL YOU DROP" } },
        { name: '比心猫',   file: '8', fx: 'heart',  color: '#e64980', word: '❤',
          news: { pair: '收到了一颗大爱心', line: '把爱心撒满了全场' },
          fortune: ['今天没人爱我QwQ', '收到一颗小爱心', '爱心满满，暖暖的', '全场都在为你心动'],
          theme: { ribbon: '爱心派送完毕', tagline: "LOVE DELIVERED" } },
        { name: '雨衣猫',   file: '9', fx: 'rain',   color: '#1971c2', word: '哗~',
          news: { pair: '穿着雨衣踩了个水坑', line: '把整条街的水坑都踩遍了' },
          fortune: ['忘带伞，淋成猫饼', '小雨绵绵，慢慢走', '雨过天晴，出彩虹', '踩遍水坑，雨中之王'],
          theme: { ribbon: '雨停了', tagline: "RAIN OR SHINE" } }
      ]
    },
    {
      id: 'weekend',
      name: '卷卷猫',
      noun: '猫猫',
      unlock: 80,             // 单局历史最高 80 只解锁
      type: 'image',
      dir: './skins/weekend/',
      ext: '.webp',
      wipe: 'cat',
      /* 套系 3「卷卷猫」：橘猫的休息日。消除动作统一先「伸个懒腰」再接各自动作（见 game.css out-*） */
      items: [
        { name: '汉堡猫',   file: '1', fx: 'burger',  color: '#f08c00', word: '啊呜',
          news: { pair: '一口咬掉半个汉堡', line: '包场了整家快餐店' },
          fortune: ['汉堡掉地上了QwQ', '薯条分你一根', '加倍芝士，超满足', '快餐店今天被我包场'],
          theme: { ribbon: '快餐店打烊', tagline: "BURGER TIME" } },
        { name: '毯子猫',   file: '2', fx: 'blanket', color: '#f783ac', word: '暖~',
          news: { pair: '裹成了一只粉色蛋卷', line: '在被窝里躺过了整个冬天' },
          fortune: ['被窝太暖，起不来', '再赖五分钟就好', '裹紧毯子，暖到心里', '周末就该这样躺赢'],
          theme: { ribbon: '被窝打烊', tagline: "STAY COZY" } },
        { name: '观影猫',   file: '3', fx: 'movie',   color: '#364fc7', word: '哇哦',
          news: { pair: '被 3D 特效吓掉了爆米花', line: '刷完了整个系列电影' },
          fortune: ['爆米花撒了一地', '电影一般，爆米花不错', '全程高能，看得过瘾', '年度最佳，二刷走起'],
          theme: { ribbon: '电影散场', tagline: "ROLL CREDITS" } },
        { name: '自拍猫',   file: '4', fx: 'selfie',  color: '#7048e8', word: '茄子~',
          news: { pair: '拍出了今日最佳自拍', line: '自拍刷爆了朋友圈' },
          fortune: ['手抖拍糊了', '角度还行，凑合发', '张张都能当头像', '刷爆朋友圈的自拍'],
          theme: { ribbon: '自拍收工', tagline: "SAY CHEESE" } },
        { name: '泡澡猫',   file: '5', fx: 'bath',    color: '#22b8cf', word: '哗啦',
          news: { pair: '泡出了满缸泡泡', line: '把澡堂唱成了 KTV' },
          fortune: ['水凉了，快出来', '泡一泡，舒服一点', '泡到指尖起皱，满足', '澡堂 KTV 今日之星'],
          theme: { ribbon: '泡完澡了', tagline: "BUBBLE TIME" } },
        { name: '购物猫',   file: '6', fx: 'shop',    color: '#fab005', word: '买！',
          news: { pair: '拎回了两大袋战利品', line: '把整条商业街买空了' },
          fortune: ['钱包空了……', '买了点小东西，开心', '满载而归，全是心头好', '整条街都被我买空了'],
          theme: { ribbon: '商场打烊', tagline: "RETAIL THERAPY" } },
        { name: '续杯猫',   file: '7', fx: 'refill',  color: '#a9713e', word: '续杯！',
          news: { pair: '续了今天第三杯奶茶', line: '把奶茶店的珍珠喝断货了' },
          fortune: ['珍珠卡吸管了', '半糖去冰，刚刚好', '第二杯半价，续！', '奶茶续命，今天无敌'],
          theme: { ribbon: '第三杯喝完', tagline: "ONE MORE CUP" } },
        { name: '读书猫',   file: '8', fx: 'book',    color: '#1971c2', word: '翻页~',
          news: { pair: '翻到了最精彩的一页', line: '一口气读完了整套书' },
          fortune: ['看两页就睡着了', '读了一章，有点收获', '越读越上头，停不下来', '一口气读完，醍醐灌顶'],
          theme: { ribbon: '合上书本', tagline: "THE LAST PAGE" } },
        { name: '开车猫',   file: '9', fx: 'drive',   color: '#f03e3e', word: '嘟嘟',
          news: { pair: '一脚油门冲出了车库', line: '开着小红车环游了全城' },
          fortune: ['忘带车钥匙了……', '兜兜风，也挺好', '一路绿灯，畅通无阻', '环游全城，我是车神'],
          theme: { ribbon: '到站了', tagline: "ROAD TRIP OVER" } }
      ]
    }
  ];

  var DEFAULT_ID = 'cats';
  var STORAGE_KEY = 'ttddp.skin.v1';
  /* 测试套系开关：URL 带 ?skins=all 显示（记住），?skins=player 恢复只看玩家套系 */
  var DEV_KEY = 'ttddp.dev.skins';
  var showDev = (function () {
    try {
      var m = /[?&]skins=(all|player)/.exec(location.search);
      if (m) localStorage.setItem(DEV_KEY, m[1] === 'all' ? '1' : '0');
      return localStorage.getItem(DEV_KEY) === '1';
    } catch (e) { return false; }
  })();
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var XLINK_NS = 'http://www.w3.org/1999/xlink';

  function byId(id) {
    for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i];
    return null;
  }

  var current = (function () {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && byId(saved) && (showDev || !byId(saved).dev)) return byId(saved);
    } catch (e) { /* ignore */ }
    return byId(DEFAULT_ID) || SKINS[0];
  })();

  var listeners = [];

  function get() { return current; }
  /* 玩家可见的套系列表（含未解锁的）；测试套系只在 showDev 时出现 */
  function list() {
    var out = [];
    for (var i = 0; i < SKINS.length; i++) if (showDev || !SKINS[i].dev) out.push(SKINS[i]);
    return out;
  }
  /* 历史最高 best 只时某套系是否已解锁 */
  function isUnlocked(skin, best) { return !skin.unlock || (best | 0) >= skin.unlock; }
  /* 历史最高 best 只时下一个待解锁的套系（门槛最低的那个），全解锁则 null */
  function nextLocked(best) {
    var ls = list(), pick = null;
    for (var i = 0; i < ls.length; i++) {
      if (isUnlocked(ls[i], best)) continue;
      if (!pick || ls[i].unlock < pick.unlock) pick = ls[i];
    }
    return pick;
  }

  function set(id) {
    var s = byId(id);
    if (!s || s === current) return false;
    current = s;
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* ignore */ }
    for (var i = 0; i < listeners.length; i++) listeners[i](s);
    return true;
  }

  function onChange(fn) { listeners.push(fn); }

  /* 图片型套系某款式的包内路径 */
  function src(idx, skin) {
    skin = skin || current;
    if (skin.type !== 'image') return null;
    return skin.dir + skin.items[idx].file + skin.ext;
  }

  function itemName(idx, skin) { return (skin || current).items[idx].name; }

  /* 某款式的消除特效信息 { id, color, word }，缺省回退到 pop + 套系颜色 */
  function fx(idx, skin) {
    skin = skin || current;
    var it = skin.items[idx] || {};
    return {
      id: it.fx || 'pop',
      color: it.color || (skin.colors && skin.colors[idx]) || '#e8590c',
      word: it.word || '碰！'
    };
  }

  /* 某款式的播报模板 { pair, line }，用于滚动新闻：<款式名> + 模板 */
  function news(idx, skin) {
    skin = skin || current;
    var it = skin.items[idx] || {};
    var n = it.news || {};
    return { pair: n.pair || '碰上了同伴', line: n.line || '排成了一条龙' };
  }

  /* 某款式的 4 档运势短句（末吉 / 小吉 / 中吉 / 大吉），用于结算占卜 */
  var FORTUNE_DEFAULT = ['慢慢爬，明天再来', '稳稳当当，小有收获', '顺风顺水，越爬越快', '一路狂飙，龟中之王'];
  function fortune(idx, skin) {
    skin = skin || current;
    var it = skin.items[idx] || {};
    return it.fortune || FORTUNE_DEFAULT;
  }

  /* 某款式的结算主题 { ribbon: 顶部标签文字, tagline: 斜体英文标语 }，缺省用通用文案 */
  function theme(idx, skin) {
    skin = skin || current;
    var it = skin.items[idx] || {};
    var t = it.theme || {};
    return { ribbon: t.ribbon || 'RUN 结束', tagline: t.tagline || 'PAIR & MATCH' };
  }

  /* 确保容器内有 img + svg 两个子节点（各套系类型复用同一个容器） */
  function mount(container) {
    if (container.__sprite) return container.__sprite;
    container.classList.add('sprite');
    var img = document.createElement('img');
    img.className = 'sprite__img';
    img.alt = '';
    img.draggable = false;
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'sprite__svg turtle');
    var use = document.createElementNS(SVG_NS, 'use');
    svg.appendChild(use);
    container.appendChild(img);
    container.appendChild(svg);
    container.__sprite = { img: img, svg: svg, use: use };
    return container.__sprite;
  }

  /* 把某款式画到容器里；idx 为 null 时清空 */
  function paint(container, idx, skin) {
    skin = skin || current;
    var h = mount(container);
    container.classList.remove('sprite--svg', 'sprite--image');
    if (idx === null || idx === undefined) return;
    container.classList.add('sprite--' + skin.type);
    if (skin.type === 'svg') {
      h.use.setAttributeNS(XLINK_NS, 'xlink:href', skin.symbol);
      h.use.setAttribute('href', skin.symbol);
      h.svg.setAttribute('class', 'sprite__svg turtle turtle--c' + idx);
    } else {
      var s = src(idx, skin);
      if (h.img.getAttribute('src') !== s) h.img.setAttribute('src', s);
      h.img.alt = skin.items[idx].name;
    }
  }

  /* 预加载当前套系全部图片，避免首次发牌时闪一下。done(loadedImages[]) 总会被调用 */
  function preload(skin, done) {
    skin = skin || current;
    var result = [];
    if (skin.type !== 'image') { if (done) done(result); return; }
    var pending = skin.items.length, finished = false;
    function one() {
      pending--;
      if (pending === 0 && !finished) { finished = true; if (done) done(result); }
    }
    for (var i = 0; i < skin.items.length; i++) {
      var im = new Image();
      result.push(im);
      im.onload = one;
      im.onerror = one;
      im.src = src(i, skin);
    }
    setTimeout(function () { if (!finished) { finished = true; if (done) done(result); } }, 4000);
  }

  root.TurtleSkin = {
    SKINS: SKINS,
    get: get, list: list, set: set, onChange: onChange, isUnlocked: isUnlocked, nextLocked: nextLocked,
    src: src, itemName: itemName, fx: fx, news: news, fortune: fortune, theme: theme,
    mount: mount, paint: paint, preload: preload
  };
})(window);
