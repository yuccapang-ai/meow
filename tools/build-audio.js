// 生成音频数据文件：node tools/build-audio.js
// 小工具容器的 zip 只允许 html / css / js / 图片 / 字体 / json，音频文件（ogg / mp3 / wav）会被拒收；
// <audio> 又不接受 data: / blob: 源。因此把 app/audio/ 下的音频以 base64 写进 app/js/audio-data.js，
// 运行时由 sound.js 用 Web Audio 的 decodeAudioData 直接解码内存字节（不经过任何资源加载，不受 CSP media-src 约束）。
// 下划线开头的目录（_orig 备份、_cand 候选）不参与。pack.sh 会自动执行本脚本。
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'app', 'audio');
const OUT = path.join(__dirname, '..', 'app', 'js', 'audio-data.js');
const KIB = 1024, MIB = 1024 * KIB;
const WARN_BYTES = 100 * KIB;   // performance-budget：单条解码后 > 100 KiB 提示风险
const LIMIT_BYTES = 1 * MIB;    // > 1 MiB 不允许内嵌

const files = fs.readdirSync(SRC).filter((f) => /\.(ogg|mp3|wav)$/i.test(f)).sort();
const seen = {};
const entries = [];
let total = 0;
for (const f of files) {
  const key = path.parse(f).name;
  if (seen[key]) throw new Error(`音频文件名冲突（去掉扩展名后重复）：${seen[key]} 与 ${f}`);
  seen[key] = f;
  const buf = fs.readFileSync(path.join(SRC, f));
  total += buf.length;
  if (buf.length > LIMIT_BYTES) throw new Error(`${f} 为 ${(buf.length / MIB).toFixed(2)} MiB，超过单条 Base64 1 MiB 上限，请先压缩`);
  if (buf.length > WARN_BYTES) console.warn(`WARN: ${f} 为 ${(buf.length / KIB).toFixed(0)} KiB，超过 100 KiB 建议值`);
  entries.push(`    ${JSON.stringify(key)}: ${JSON.stringify(buf.toString('base64'))}`);
}

const out = `/* 猫猫对对碰 · 音频数据（自动生成，勿手改）
 * 由 tools/build-audio.js 把 app/audio/ 下 ${files.length} 个文件以 base64 内嵌，原始合计 ${(total / KIB).toFixed(0)} KiB。
 * 键为文件名去掉扩展名；sound.js 用 decodeAudioData 解码（容器 zip 不允许音频文件类型，<audio> 也不接受 data: 源）。
 * 生成时间 ${new Date().toISOString().slice(0, 10)} */
window.TurtleAudioData = {
  files: {
${entries.join(',\n')}
  }
};
`;
fs.writeFileSync(OUT, out, 'utf8');
console.log(`audio-data.js written: ${files.length} files, raw ${(total / KIB).toFixed(0)} KiB, js ${(fs.statSync(OUT).size / KIB).toFixed(0)} KiB`);
