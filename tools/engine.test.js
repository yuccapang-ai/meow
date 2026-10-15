// 引擎单元测试：node tools/engine.test.js
const E = require('../app/js/engine.js');
let fails = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); }
  else console.log('ok  ', name);
}
const _ = null;

// 大满贯：9 色各不同 → slam 5 + clear 5 = 10
let r = E.evaluate([0, 1, 2, 3, 4, 5, 6, 7, 8]);
eq('slam total', r.reward.total, 10);
eq('slam removed', r.removed.length, 9);

// 一条横线 + 其余不同色 → +5，不清空
r = E.evaluate([0, 0, 0, 1, 2, 3, 4, 5, 6]);
eq('line total', r.reward.total, 5);
eq('line pairs', r.pairs.length, 0);

// L 形三连 → 1 对
r = E.evaluate([0, 0, _, 0, _, _, _, _, _]);
eq('L shape pairs', r.pairs.length, 1);
eq('L shape not clear', r.clear, false);

// 2x2 → 2 对，且清空 → 2 + 5
r = E.evaluate([0, 0, _, 0, 0, _, _, _, _]);
eq('2x2 pairs', r.pairs.length, 2);
eq('2x2 total', r.reward.total, 7);

// 同色四只（非直线）→ 2 对
r = E.evaluate([0, 0, _, _, _, 0, _, _, 0]);
eq('four same colour pairs', r.pairs.length, 2);

// 对碰不要求相邻：两个角同色 → 1 对
r = E.evaluate([0, _, _, _, _, _, _, _, 0]);
eq('non-adjacent pair', r.pairs.length, 1);
eq('non-adjacent pair cells', r.pairs[0], [0, 8]);
eq('non-adjacent pair total', r.reward.total, 6);

// 同色三只不成线 → 1 对 + 1 只剩下，不清空
r = E.evaluate([0, _, 0, _, _, _, 0, _, _]);
eq('three same colour not in line pairs', r.pairs.length, 1);
eq('three same colour not clear', r.clear, false);

// 同色五只（无成线）→ 2 对
r = E.evaluate([0, _, 0, 0, _, 0, _, 0, _]);
eq('five same colour pairs', r.pairs.length, 2);

// 连线优先于对子：一列同色 + 一只同色挂在旁边 → 线消掉后那只孤龟不成对，只有 +5
r = E.evaluate([0, 0, _, 0, _, _, 0, _, _]);
eq('line eats neighbour total', r.reward.total, 5);
eq('line eats neighbour lines', r.lines.length, 1);
eq('line eats neighbour pairs', r.pairs.length, 0);
// 一行同色 + 另一色一对，且全部消光 → 5 + 1 + 清空 5 = 11
r = E.evaluate([0, 0, 0, 1, 1, _, _, _, _]);
eq('line plus pair plus clear total', r.reward.total, 11);
// 一行同色 + 另一色一对 + 一只孤龟 → 5 + 1，不清空
r = E.evaluate([0, 0, 0, 1, 1, 2, _, _, _]);
eq('line plus pair total', r.reward.total, 6);
// 填满后 deal 返回填充快照
const s0 = E.startRun({ startPacks: 9 });
const d0 = E.deal(s0);
eq('deal snapshot has 9 colors', d0.board.filter(function (c) { return c !== null; }).length, 9);

// 满盘，0 号色在两个角 → 不相邻也成对，+1
r = E.evaluate([0, 1, 2, 3, 4, 5, 6, 7, 0]);
eq('corner pair removed', r.removed.length, 2);
eq('corner pair total', r.reward.total, 1);

// 无消除：满盘 8 色，且没有任何同色 → 不可能（9 格 9 色是大满贯），改用未满盘全不同色
r = E.evaluate([0, 1, 2, 3, 4, 5, 6, 7, _]);
eq('no match', r.removed.length, 0);

// 部分填充：只有两格同色 → 清空 1 + 5
r = E.evaluate([0, 0, _, _, _, _, _, _, _]);
eq('partial clear', r.reward.total, 6);

// 斜线
r = E.evaluate([3, 1, 2, 4, 3, 5, 6, 7, 3]);
eq('diag line', r.lines.length, 1);

// 两条同色线共享中心：横中线 + 竖中线 → 2 条线 +10，剩 4 角不同色
r = E.evaluate([1, 0, 2, 0, 0, 0, 3, 0, 4]);
eq('cross lines', r.lines.length, 2);
eq('cross total', r.reward.total, 10);

// deal 流程：卡包不足只填 3 格
const s = E.startRun({ startPacks: 3 });
const d = E.deal(s);
eq('partial fill count', d.filled.length, 3);
eq('round advanced', s.round, 1);

// 等待摇晃状态下不能发牌；摇晃后两只同色必成对（+1+5 清空）
const s2 = E.startRun({ startPacks: 2 });
s2.board = [0, null, null, null, null, null, null, null, 0];
s2.pendingShake = true;
eq('deal while pending is null', E.deal(s2), null);
const sh2 = E.shake(s2);
eq('shake returns moves', Array.isArray(sh2.moves), true);
eq('shake resolves', sh2.result.removed.length, 2);
eq('shake after resolve is null', E.shake(s2), null);

// 一轮零消除后盘上颜色两两不同 → 不进入摇晃，直接结束
const s6 = E.startRun({ startPacks: 20, shakeLimit: Infinity });
s6.board = [0, 1, 2, 3, 4, 5, 6, 7, 0];
E.deal(s6); // 满盘无空位，只判定
eq('zero-elim board has no duplicates', new Set(s6.board.filter(c => c !== null)).size, s6.board.filter(c => c !== null).length);

// shake 保持颜色多重集不变
const s3 = E.startRun({ startPacks: 20 });
s3.board = [0, 1, 2, 3, 4, 5, 6, 7, 0];
s3.pendingShake = true;
const sh3 = E.shake(s3);
const sorted = (arr) => arr.filter(c => c !== null).slice().sort();
eq('shake keeps multiset', sorted(sh3.board), sorted([0, 1, 2, 3, 4, 5, 6, 7, 0]));
eq('shake counted', s3.counts.shakes, 1);
eq('shake not pending when not needed', E.shake(E.startRun()), null);

// shakeLimit = Infinity 且盘面有同色 → 摇到消为止，不会因零消除结束
const s4 = E.startRun({ startPacks: 20, shakeLimit: Infinity });
s4.board = [0, 1, 2, 3, 4, 5, 6, 7, 0];
s4.pendingShake = true;
let guard = 0;
while (s4.pendingShake && guard++ < 200) E.shake(s4);
eq('infinite shake eventually matches', s4.ended === null && s4.pendingShake === false, true);

// 幸运色：抽到即 +1，与消除无关。判定本身不含幸运加成
r = E.evaluate([0, 0, 0, 1, 2, 3, 4, 5, 6]);
eq('evaluate has no lucky reward', r.reward.lucky, undefined);
eq('line total without lucky', r.reward.total, 5);
// 只有 1 色 → 9 格全是幸运色：抽到 9 只 → +9，判定 8 线 +40，清空 +5
const sL = E.startRun({ startPacks: 20, colors: 1 });
E.setLucky(sL, 0);
let dL = E.deal(sL);
eq('lucky drawn cells', dL.lucky, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
eq('lucky bonus on draw', dL.luckyBonus, 9);
eq('lucky counted on draw', sL.counts.lucky, 9);
eq('lucky bonus in packs', sL.packs, 20 - 9 + 9 + 45);
eq('lucky bonus in earned', sL.earned, 9 + 45);
eq('bestRound includes lucky', sL.bestRound, 54);
// 幸运色不是抽到的颜色 → 无加成
const sLb = E.startRun({ startPacks: 20, colors: 1 });
E.setLucky(sLb, 3);
dL = E.deal(sLb);
eq('lucky absent on draw', [dL.lucky.length, dL.luckyBonus, sLb.counts.lucky], [0, 0, 0]);
// 没选幸运色 → 无加成
const sLc = E.startRun({ startPacks: 20, colors: 1 });
dL = E.deal(sLc);
eq('no lucky chosen', dL.luckyBonus, 0);
// 孤龟不可能匹配 → 不进入摇晃，直接结束
const s5 = E.startRun({ startPacks: 1, shakeLimit: Infinity });
E.deal(s5);
eq('hopeless board ends immediately', s5.ended, 'nomatch');
// 零消除但幸运返还让卡包 > 0 且盘上有空格 → 不结束，下一轮继续发牌（回归：返还的卡包曾被直接吞掉）
const sR = E.startRun({ startPacks: 1, colors: 1 });
E.setLucky(sR, 0);
let d6 = E.deal(sR);
eq('lucky refund keeps run alive', [d6.luckyBonus, sR.packs, sR.ended, d6.needShake], [1, 1, null, false]);
d6 = E.deal(sR);
eq('refunded pack is dealt next round', [d6 !== null, d6.filled.length, d6.board[1]], [true, 1, 0]);
eq('refund round can still match', [d6.result.pairs.length, sR.stash[0]], [1, 2]);
// 没有幸运返还、卡包为 0 的零消除仍然结束
const sRb = E.startRun({ startPacks: 1, colors: 9 });
E.deal(sRb);
eq('no refund still ends', [sRb.packs, sRb.ended], [0, 'nomatch']);

// 暂存区与得分：被消除的棋子按颜色进 stash；得分 = 暂存区 + 盘上剩余（= 开出的总数）
const s7 = E.startRun({ startPacks: 20 });
s7.board = [0, 0, 0, 1, 1, 2, 3, 4, 5]; // 满盘：deal 不填格，只判定
E.deal(s7);
eq('stash after line + pair', s7.stash, [3, 2, 0, 0, 0, 0, 0, 0, 0]);
eq('board keeps the loners', s7.board, [null, null, null, null, null, 2, 3, 4, 5]);
let t = E.tally(s7);
eq('tally counts', t.counts, [3, 2, 1, 1, 1, 1, 0, 0, 0]);
eq('tally total = stashed + onBoard', [t.stashed, t.onBoard, t.total], [5, 4, 9]);
eq('tally top3', t.top, [{ color: 0, count: 3 }, { color: 1, count: 2 }, { color: 2, count: 1 }]);
// 同数按颜色索引排序；数量为 0 的不进 top
const s8 = E.startRun();
s8.stash = [0, 2, 0, 2, 0, 0, 0, 0, 0];
t = E.tally(s8);
eq('tally ties by colour index', t.top, [{ color: 1, count: 2 }, { color: 3, count: 2 }]);
eq('tally topN', E.tally(s8, 1).top.length, 1);
// 整局跑完：得分恒等于开出的卡包数
const s9 = E.startRun({ startPacks: 20 });
E.setLucky(s9, 0);
while (!s9.ended) { if (s9.pendingShake) E.shake(s9); else if (!E.deal(s9)) break; }
eq('score equals spent', E.tally(s9).total, s9.spent);
// 摇晃后的消除也进暂存区
const s10 = E.startRun({ startPacks: 2 });
s10.board = [4, null, null, null, null, null, null, null, 4];
s10.pendingShake = true;
E.shake(s10);
eq('shake removal goes to stash', s10.stash[4], 2);

// 可复现：同一种子 + 同一幸运色 → 整局（含摇晃）逐步一致；不同种子应产生不同走向
function runSeeded(seed, lucky) {
  const st = E.startRun({ startPacks: 20 }, E.seededRandom(seed));
  E.setLucky(st, lucky);
  const trace = [];
  let g = 0;
  while (!st.ended && g++ < 500) {
    if (st.pendingShake) { trace.push(['s', E.shake(st).board]); continue; }
    const d = E.deal(st);
    if (!d) break;
    trace.push(['d', d.board]);
  }
  return { trace, spent: st.spent, stash: st.stash, board: st.board, ended: st.ended };
}
eq('seeded run replays identically', runSeeded(123456, 4), runSeeded(123456, 4));
eq('seeded rng in [0,1)', E.seededRandom(7)() < 1 && E.seededRandom(7)() >= 0, true);
eq('seeded rng deterministic', E.seededRandom(99)(), E.seededRandom(99)());
{
  let differ = false;
  for (let k = 1; k <= 20 && !differ; k++) differ = JSON.stringify(runSeeded(k, 0).trace) !== JSON.stringify(runSeeded(k + 1000, 0).trace);
  eq('different seeds diverge', differ, true);
}
// 缺省仍用 Math.random
eq('default rng is Math.random', E.startRun().rng, Math.random);

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
