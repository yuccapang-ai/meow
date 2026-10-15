/* 墨镜猫逐帧播放器：步态由实际移动距离驱动，其余动作按时间播放。
 * 每项是 [图集帧号, 持续秒数]。与 cool-cat-actions-v1.json 对应。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TurtleCatActions = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var clips = {
    idle: [[8, 0.6]],
    sit: [[8, 0.12], [9, 0.2], [10, 0.28], [11, 0.8], [10, 0.7], [11, 0.7], [10, 0.4]],
    groom: [[8, 0.1], [9, 0.16], [10, 0.2], [12, 0.26], [13, 0.22], [12, 0.18], [13, 0.22], [14, 0.35], [15, 0.24], [12, 0.22], [13, 0.24], [14, 0.32], [15, 0.22], [10, 0.3]],
    stretch: [[16, 0.16], [17, 0.32], [18, 0.9], [19, 0.32], [16, 0.2]],
    sleep: [[8, 0.1], [9, 0.18], [10, 0.24], [20, 0.32], [21, 0.4], [22, 0.7], [23, 0.9], [22, 0.9], [23, 0.9], [22, 0.9], [23, 0.9], [22, 0.6]],
    wake: [[22, 0.2], [21, 0.3], [20, 0.32], [10, 0.25], [9, 0.22], [8, 0.18]],
    stand: [[10, 0.16], [9, 0.22], [8, 0.18]]
  };
  var labels = { idle: '看看四周', walk: '散步中', sit: '坐着歇一会儿', groom: '舔爪洗脸', stretch: '伸个懒腰', sleep: '呼噜噜…', wake: '睡醒啦', stand: '起来走走' };
  var roomClips = {
    idle: [[0, 1]],
    sleep: [[8, 0.3], [9, 0.5], [10, 1.4], [11, 1.4], [10, 1.4], [11, 1.4], [10, 1.4], [11, 1.4]],
    wake: [[10, 0.2], [9, 0.3], [8, 0.4], [0, 0.2]],
    special: [[12, 0.55], [13, 0.45], [14, 0.55], [13, 0.4], [14, 0.55], [15, 1.1], [12, 0.4]],
    jump: [[8, 0.12], [1, 0.12], [3, 0.16], [5, 0.16], [0, 0.12], [8, 0.12], [0, 0.1]]
  };
  function create(options) {
    options = options || {};
    var sequences = options.profile === 'collection' ? roomClips : clips;
    var name = 'idle', time = 0, distance = 0, frame = sequences.idle[0][0], done = false;
    function play(next) {
      if (next !== 'walk' && !sequences[next]) throw new Error('Unknown cat action: ' + next);
      name = next; time = 0; distance = 0; done = false;
      frame = next === 'walk' ? 0 : sequences[next][0][0];
    }
    function update(dt, moved) {
      if (name === 'walk') {
        // moved 是相对于角色框宽度的真实位移。停住时不会原地滑步。
        distance += Math.max(0, moved || 0);
        frame = Math.floor(distance / 0.45 * 8) % 8;
        return;
      }
      time += Math.max(0, dt || 0);
      var sequence = sequences[name], elapsed = 0;
      for (var i = 0; i < sequence.length; i++) {
        elapsed += sequence[i][1];
        frame = sequence[i][0];
        if (time < elapsed) return;
      }
      done = true;
    }
    return {
      play: play, update: update,
      action: function () { return name; },
      frame: function () { return frame; },
      finished: function () { return done; },
      label: function () { return name === 'special' ? (options.specialLabel || '专属动作') : name === 'jump' ? '跳跃中' : labels[name]; }
    };
  }
  return { create: create };
});
