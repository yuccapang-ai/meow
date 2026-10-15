/* 猫猫对对碰 · 规则引擎（纯逻辑，无 DOM）
 * 经典脚本：挂到 window.TurtleEngine；Node 下通过 module.exports 导出供模拟脚本使用。
 * 目标基线 ES2017 / Chrome 61。
 */
(function (root) {
  'use strict';

  var DEFAULT_CONFIG = {
    colors: 9,
    cells: 9,
    startPacks: 20,
    shakeLimit: 1, // 一轮零消除后最多可摇晃次数；用尽仍无消除则 Run 结束。Infinity = 不限
    reward: { pair: 1, line: 5, clear: 5, slam: 5, lucky: 1 } // lucky：发牌时每抽到一只幸运色额外返还（与之后是否消除无关）
  };

  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  function mergeConfig(cfg) {
    var out = { reward: {} };
    var k;
    for (k in DEFAULT_CONFIG) if (k !== 'reward') out[k] = DEFAULT_CONFIG[k];
    for (k in DEFAULT_CONFIG.reward) out.reward[k] = DEFAULT_CONFIG.reward[k];
    if (cfg) {
      for (k in cfg) {
        if (k === 'reward') continue;
        out[k] = cfg[k];
      }
      if (cfg.reward) for (k in cfg.reward) out.reward[k] = cfg.reward[k];
    }
    return out;
  }

  /* 可复现的随机源（mulberry32）：同一种子产生同一序列，回放用。返回 [0,1) 的函数 */
  function seededRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomColor(state) {
    return Math.floor(state.rng() * state.cfg.colors);
  }

  function zeros(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(0);
    return a;
  }

  /* 对子配对：对碰不要求相邻，只要两只同色同时在盘上即可。
   * 每种颜色按格子编号从小到大两两配对，剩余的单只不成对。返回互不共用格子的对子列表。 */
  function pairUp(alive) {
    var byColor = {}, pairs = [], i, c;
    for (i = 0; i < 9; i++) {
      c = alive[i];
      if (c === null || c === undefined) continue;
      (byColor[c] || (byColor[c] = [])).push(i);
    }
    for (c in byColor) {
      var list = byColor[c];
      for (i = 0; i + 1 < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
    }
    pairs.sort(function (a, b) { return a[0] - b[0]; });
    return pairs;
  }

  /* 全盘判定。board: 长度 9 的数组，null 为空格，否则为颜色索引。
   * 顺序：大满贯 → 连线 → 对子 → 清空。前一步消除的格子在后一步视为不存在。
   * 幸运色加成不在这里算：它在 deal() 抽到时即时发放。 */
  function evaluate(board, cfg) {
    cfg = mergeConfig(cfg);
    var R = cfg.reward;
    var res = {
      slam: false, lines: [], pairs: [], clear: false,
      removed: [],
      reward: { slam: 0, lines: 0, pairs: 0, clear: 0, total: 0 }
    };
    var filled = 0, i;
    for (i = 0; i < 9; i++) if (board[i] !== null && board[i] !== undefined) filled++;
    if (filled === 0) return res;

    var alive = board.slice();

    // 1. 大满贯
    if (filled === 9) {
      var seen = {}, distinct = true;
      for (i = 0; i < 9; i++) { if (seen[board[i]]) { distinct = false; break; } seen[board[i]] = true; }
      if (distinct) {
        res.slam = true;
        res.reward.slam = R.slam;
        for (i = 0; i < 9; i++) { res.removed.push(i); alive[i] = null; }
      }
    }

    if (!res.slam) {
      // 2. 连线（在同一盘面上一并判定）
      var l, line;
      for (l = 0; l < LINES.length; l++) {
        line = LINES[l];
        var c = alive[line[0]];
        if (c !== null && c === alive[line[1]] && c === alive[line[2]]) res.lines.push(line);
      }
      for (l = 0; l < res.lines.length; l++) {
        line = res.lines[l];
        for (var t = 0; t < 3; t++) {
          if (alive[line[t]] !== null) { res.removed.push(line[t]); alive[line[t]] = null; }
        }
      }
      res.reward.lines = res.lines.length * R.line;

      // 3. 对子（不要求相邻，同色两只即成对）
      res.pairs = pairUp(alive);
      for (var p = 0; p < res.pairs.length; p++) {
        res.removed.push(res.pairs[p][0], res.pairs[p][1]);
        alive[res.pairs[p][0]] = alive[res.pairs[p][1]] = null;
      }
      res.reward.pairs = res.pairs.length * R.pair;
    }

    // 4. 清空
    if (res.removed.length > 0 && res.removed.length === filled) {
      res.clear = true;
      res.reward.clear = R.clear;
    }
    res.reward.total = res.reward.slam + res.reward.lines + res.reward.pairs + res.reward.clear;
    return res;
  }

  /* 盘面是否存在任何打乱后可能成立的消除：只要有某颜色 ≥ 2 只即可。
   * 注意：对碰已不要求相邻，一轮零消除意味着盘上颜色两两不同，此时打乱也无法凑出连线，
   * 所以正常流程下零消除后不会再进入摇晃；本函数保留作为兜底判断。 */
  function canEverMatch(board) {
    var seen = {};
    for (var i = 0; i < 9; i++) {
      if (board[i] === null) continue;
      if (seen[board[i]]) return true;
      seen[board[i]] = true;
    }
    return false;
  }

  function hasEmpty(board) {
    for (var i = 0; i < 9; i++) if (board[i] === null) return true;
    return false;
  }

  /* ---------- Run 状态机 ---------- */

  /* rng：可选的随机源函数（返回 [0,1)），缺省 Math.random。
   * 传入 seededRandom(seed) 即可让整局可复现：一局的走向只由 种子 + 幸运色 + 配置 决定
   * （玩家唯一的决策「摇晃」是必选项，不摇等于弃局），回放据此重跑。 */
  function startRun(cfg, rng) {
    cfg = mergeConfig(cfg);
    return {
      cfg: cfg,
      rng: rng || Math.random,
      board: [null, null, null, null, null, null, null, null, null],
      packs: cfg.startPacks,
      round: 0,
      earned: 0,
      spent: 0,
      bestRound: 0,
      counts: { slam: 0, lines: 0, pairs: 0, clear: 0, shakes: 0, lucky: 0 }, // lucky：本局抽到的幸运色数量
      stash: zeros(cfg.colors), // 暂存区：每种颜色累计被消除的数量
      lucky: null,         // 幸运色索引，开局由玩家选择
      pendingShake: false, // 本轮零消除，等待玩家摇晃
      shakesUsed: 0,       // 本轮已摇晃次数
      ended: null // null | 'empty'（卡包耗尽） | 'nomatch'（摇晃用尽仍零消除）
    };
  }

  /* 判定结果落账到 state；返回是否进入「等待摇晃」 */
  function settle(state, res) {
    for (var r = 0; r < res.removed.length; r++) {
      state.stash[state.board[res.removed[r]]]++; // 被消除的棋子进暂存区
      state.board[res.removed[r]] = null;
    }
    state.packs += res.reward.total;
    state.earned += res.reward.total;
    if (res.reward.total > state.bestRound) state.bestRound = res.reward.total;
    if (res.slam) state.counts.slam++;
    state.counts.lines += res.lines.length;
    state.counts.pairs += res.pairs.length;
    if (res.clear) state.counts.clear++;

    if (res.removed.length === 0) {
      // 只有在打乱后有可能消除时才值得摇；孤龟 / 全不同色（未满盘）不提供摇晃
      if (state.shakesUsed < state.cfg.shakeLimit && canEverMatch(state.board)) {
        state.pendingShake = true;
        return true;
      }
      state.pendingShake = false;
      // 零消除只会发生在填格时卡包耗尽（盘未满）；若幸运返还让手上又有了卡包，且盘上还有空格，
      // 下一轮仍能继续发牌，不能在这里结束（否则返还的卡包就被吞掉了）
      if (state.packs > 0 && hasEmpty(state.board)) return false;
      state.ended = 'nomatch';
      return false;
    }
    state.pendingShake = false;
    if (state.packs <= 0) state.ended = 'empty';
    return false;
  }

  /* 执行一轮：填格（抽到幸运色即时 +reward.lucky）→ 判定 → 结算。
   * 返回 { filled, board, result, lucky, luckyBonus, needShake, ended }；
   * lucky 为本次填格中抽到幸运色的格子，luckyBonus 为其返还的卡包数（已计入 packs / earned）。
   * Run 已结束或正在等待摇晃时返回 null */
  function deal(state) {
    if (state.ended || state.pendingShake) return null;
    if (state.packs <= 0) { state.ended = 'empty'; return null; }
    state.shakesUsed = 0;
    var filled = [], lucky = [];
    for (var i = 0; i < 9 && state.packs > 0; i++) {
      if (state.board[i] === null) {
        var c = randomColor(state);
        state.board[i] = c;
        state.packs--;
        state.spent++;
        filled.push(i);
        if (state.lucky !== null && c === state.lucky) lucky.push(i);
      }
    }
    state.round++;
    var luckyBonus = lucky.length * state.cfg.reward.lucky;
    state.packs += luckyBonus;
    state.earned += luckyBonus;
    state.counts.lucky += lucky.length;
    var snapshot = state.board.slice(); // 填充后、消除前的盘面，供 UI 播放动画
    var res = evaluate(state.board, state.cfg);
    var needShake = settle(state, res);
    if (res.reward.total + luckyBonus > state.bestRound) state.bestRound = res.reward.total + luckyBonus;
    return { filled: filled, board: snapshot, result: res, lucky: lucky, luckyBonus: luckyBonus, needShake: needShake, ended: state.ended };
  }

  /* 摇晃棋盘：随机打乱全部格子（含空格），再判定并结算。
   * 返回 { moves:[{from,to}], board, result, needShake, ended }；非等待摇晃状态返回 null */
  function shake(state) {
    if (state.ended || !state.pendingShake) return null;
    var perm = [0, 1, 2, 3, 4, 5, 6, 7, 8], i, j, tmp, identity;
    do {
      for (i = 8; i > 0; i--) {
        j = Math.floor(state.rng() * (i + 1));
        tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
      }
      identity = true;
      for (i = 0; i < 9; i++) if (perm[i] !== i && state.board[i] !== null) { identity = false; break; }
    } while (identity);

    var old = state.board.slice();
    var next = [null, null, null, null, null, null, null, null, null];
    var moves = [];
    for (i = 0; i < 9; i++) {
      next[perm[i]] = old[i];
      if (old[i] !== null && perm[i] !== i) moves.push({ from: i, to: perm[i] });
    }
    state.board = next;
    state.shakesUsed++;
    state.counts.shakes++;
    state.pendingShake = false;

    var snapshot = next.slice();
    var res = evaluate(state.board, state.cfg);
    var needShake = settle(state, res);
    return { moves: moves, board: snapshot, result: res, needShake: needShake, ended: state.ended };
  }

  function setLucky(state, color) {
    state.lucky = (color === null || color === undefined) ? null : color;
  }

  /* 得分统计：每种颜色的持有数 = 暂存区 + 盘上剩余；total 即最终得分（不看轮次）。
   * top：按数量降序（同数按颜色索引升序）取前 topN（默认 3）名，数量为 0 的不计入。 */
  function tally(state, topN) {
    var n = state.cfg.colors, counts = state.stash.slice(), i;
    var stashed = 0, onBoard = 0;
    for (i = 0; i < n; i++) stashed += counts[i];
    for (i = 0; i < 9; i++) {
      if (state.board[i] !== null) { counts[state.board[i]]++; onBoard++; }
    }
    var order = [];
    for (i = 0; i < n; i++) order.push(i);
    order.sort(function (a, b) { return counts[b] - counts[a] || a - b; });
    var top = [];
    var limit = topN || 3;
    for (i = 0; i < order.length && top.length < limit; i++) {
      if (counts[order[i]] > 0) top.push({ color: order[i], count: counts[order[i]] });
    }
    return { counts: counts, stashed: stashed, onBoard: onBoard, total: stashed + onBoard, top: top };
  }

  var Engine = {
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    LINES: LINES,
    mergeConfig: mergeConfig,
    seededRandom: seededRandom,
    evaluate: evaluate,
    pairUp: pairUp,
    canEverMatch: canEverMatch,
    startRun: startRun,
    setLucky: setLucky,
    tally: tally,
    deal: deal,
    shake: shake
  };

  root.TurtleEngine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : this);
