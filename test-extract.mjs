// 离线单测：用 jsdom 加载真实页面 + 真实脚本，验证 DOM 提取 / 判题解析。
// 运行：在 /tmp/cgtest 下 `node test-extract.mjs`
import fs from 'fs';
import { JSDOM } from 'jsdom';

const DIR = '/tmp/cgtest';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓', name); }
    else { fail++; console.log('  ✗', name, extra != null ? '\n      ' + extra : ''); }
}

// 1. 读真实页面（GBK -> UTF-8）
const htmlBuf = fs.readFileSync(`${DIR}/pl1.html`);
const html = new TextDecoder('gbk').decode(htmlBuf);

// 2. jsdom 构造页面
const dom = new JSDOM(html, {
    url: 'http://10.109.120.139/assignment/programList.jsp?proNum=1&assignID=51',
    runScripts: 'outside-only',
});
const w = dom.window;

// 3. 注入 GM 桩 + 测试标志
const store = {};
w.__CGAI_EXPOSE__ = true;
w.GM_addStyle = () => {};
w.GM_getValue = (k, d) => (k in store ? store[k] : d);
w.GM_setValue = (k, v) => { store[k] = v; };
w.GM_registerMenuCommand = () => {};
w.GM_xmlhttpRequest = () => {};
w.TextDecoder = TextDecoder;
w.DataTransfer = function () { this.items = { add() {} }; this.files = []; };

// 4. 跑真实脚本
const src = fs.readFileSync(`${DIR}/cg-ai-solver.user.js`, 'utf8');
w.eval(src);
const api = w.__CGAI_API__;
ok('脚本暴露内部函数', api && typeof api.extractProblem === 'function');

// 5. DOM 提取
const prob = api.extractProblem();
console.log('\n[extractProblem]');
ok('标题含「字母频率统计2」', /字母频率统计2/.test(prob.title), 'got: ' + prob.title);
ok('题面含【问题描述】', /【问题描述】/.test(prob.statement));
ok('题面含【输入形式】', /【输入形式】/.test(prob.statement));
ok('题面含【样例输入】', /【样例输入】/.test(prob.statement));
ok('题面含【样例输出】', /【样例输出】/.test(prob.statement));
ok('题面含【评分标准】', /【评分标准】/.test(prob.statement));
ok('题面长度合理(>200)', prob.statement.length > 200, 'len=' + prob.statement.length);
ok('题面不含残留 html 标签', !/<\/?(p|span|pre|br|div)\b/i.test(prob.statement));

const ids = api.extractIds();
console.log('\n[extractIds]');
ok('problemID=1626', ids.problemID === '1626', JSON.stringify(ids));
ok('assignID=51', ids.assignID === '51', JSON.stringify(ids));

// 6. 代码块解析
console.log('\n[parseJavaCode / detectMainClass]');
const fenced = '解释...\n```java\npublic class Main {\n  public static void main(String[] a){}\n}\n```\n后记';
const code = api.parseJavaCode(fenced);
ok('剥离围栏取出代码', code.startsWith('public class Main') && !/```/.test(code), code.slice(0, 30));
ok('主类名=Main', api.detectMainClass(code) === 'Main');
ok('非Main主类名识别', api.detectMainClass('public class Solution {') === 'Solution');
ok('无围栏时返回原文', api.parseJavaCode('public class X{}') === 'public class X{}');

// 7. 判题 JSON 解析（真实数据）
console.log('\n[parseVerdict]');
let verdict = null;
try {
    const vbuf = fs.readFileSync(`${DIR}/verdict.json`);
    const vtext = new TextDecoder('gbk').decode(vbuf);
    verdict = api.parseVerdict(vtext);
} catch (e) { console.log('  (verdict.json 缺失，跳过)'); }
if (verdict) {
    ok('ret=1', verdict.ret === '1', JSON.stringify(verdict.ret));
    ok('content 含 得分', /得分/.test(verdict.content));
    ok('content 含 完全正确', /完全正确/.test(verdict.content));
    const txt = api.htmlToText(verdict.content);
    const passed = (txt.match(/完全正确/g) || []).length;
    ok('解析出 5 个完全正确', passed === 5, 'passed=' + passed);
}

console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
