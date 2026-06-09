// 离线单测：jsdom 加载真实页面 + 真实脚本(v2)，验证 DOM 提取 / 发现 / 判题解析 / 队列推进。
import fs from 'fs';
import { JSDOM } from 'jsdom';

const DIR = '/tmp/cgtest';
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x != null ? '— ' + x : ''); } };

const html = new TextDecoder('gbk').decode(fs.readFileSync(`${DIR}/pl1.html`));
const dom = new JSDOM(html, { url: 'http://10.109.120.139/assignment/programList.jsp?proNum=1&assignID=51', runScripts: 'outside-only' });
const w = dom.window;
const store = {};
w.__CGAI_EXPOSE__ = true;
w.GM_addStyle = () => {}; w.GM_getValue = (k, d) => (k in store ? store[k] : d); w.GM_setValue = (k, v) => { store[k] = v; };
w.GM_deleteValue = k => { delete store[k]; }; w.GM_registerMenuCommand = () => {}; w.GM_xmlhttpRequest = () => {};
w.TextDecoder = TextDecoder; w.DataTransfer = function () { this.items = { add() {} }; this.files = []; };

w.eval(fs.readFileSync(`${DIR}/cg-ai-solver.user.js`, 'utf8'));
// jsdom 下 readyState 可能为 loading，boot 挂到 DOMContentLoaded；真实浏览器 document-idle 会立即跑。
if (!w.document.getElementById('cgai-panel')) w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
const api = w.__CGAI_API__;
ok('脚本在顶层框架运行并暴露 API', api && typeof api.extractProblem === 'function');
ok('面板已构建', !!w.document.getElementById('cgai-panel'));
ok('配置浮层存在(cfg-base/cfg-key)', !!w.document.getElementById('cfg-base') && !!w.document.getElementById('cfg-key'));

console.log('\n[提取]');
const prob = api.extractProblem();
ok('标题含「字母频率统计2」', /字母频率统计2/.test(prob.title), prob.title);
ok('题面含【问题描述】+【样例输出】+【评分标准】', /【问题描述】/.test(prob.statement) && /【样例输出】/.test(prob.statement) && /【评分标准】/.test(prob.statement));
ok('题面无残留标签', !/<\/?(p|span|pre|br|div)\b/i.test(prob.statement));
const ids = api.extractIds();
ok('problemID=1626 & assignID=51', ids.problemID === '1626' && ids.assignID === '51', JSON.stringify(ids));

console.log('\n[发现 / 队列]');
const cur = api.getCur();
ok('getCur = {51,1}', cur.assignID === '51' && cur.proNum === '1', JSON.stringify(cur));
const maxP = api.discoverProNums();
ok('discoverProNums >=5（作业一 5 题）', maxP >= 5, 'maxP=' + maxP);
const al = api.discoverAssignList();
ok('discoverAssignList 含 51/52/53/54', ['51', '52', '53', '54'].every(a => al.includes(a)), JSON.stringify(al));
ok('computeNext 同作业下一题', JSON.stringify(api.computeNext(['51', '52', '53', '54'], { assignID: '51', proNum: '1' }, maxP)) === JSON.stringify({ assignID: '51', proNum: 2 }));
ok('computeNext 末题→下个作业 proNum1', JSON.stringify(api.computeNext(['51', '52', '53', '54'], { assignID: '51', proNum: String(maxP) }, maxP)) === JSON.stringify({ assignID: '52', proNum: 1 }));
ok('computeNext 最后一题→null', api.computeNext(['51', '52', '53', '54'], { assignID: '54', proNum: String(maxP) }, maxP) === null);

console.log('\n[模型梯队 / 代码 / 判分]');
const ladder = api.ladderFor({ model: 'deepseek-v4-flash', strongModel: 'deepseek-v4-pro', thinking: false, maxAttempts: 3 });
ok('ladder 长度=3', ladder.length === 3, JSON.stringify(ladder.map(l => l.model)));
ok('ladder 第3版升级到强模型', ladder[2].model === 'deepseek-v4-pro');
ok('ladder maxAttempts=1 只 1 版', api.ladderFor({ model: 'm', maxAttempts: 1 }).length === 1);
const code = api.parseJavaCode('x\n```java\npublic class Main {}\n```\n');
ok('取出代码 & 主类名', code === 'public class Main {}' && api.detectMainClass(code) === 'Main');

let v = null; try { v = api.parseVerdict(new TextDecoder('gbk').decode(fs.readFileSync(`${DIR}/verdict.json`))); } catch (_) {}
if (v) {
    const sc = api.scoreOf(v.content);
    ok('scoreOf: 5/5 满分, 得分20.00', sc.passed === 5 && sc.total === 5 && sc.score === '20.00', JSON.stringify(sc));
}

console.log(`\n=== ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
