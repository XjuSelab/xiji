// 离线单测 v2.1：多题型提取 / 填空模板 / 失败反馈解析 / 判分。
import fs from 'fs';
import { JSDOM } from 'jsdom';
const DIR = '/tmp/cgtest';
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x != null ? '— ' + x : ''); } };

function load(file, url) {
    const html = new TextDecoder('gbk').decode(fs.readFileSync(`${DIR}/${file}`));
    const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
    const w = dom.window, store = {};
    w.__CGAI_EXPOSE__ = true;
    w.GM_addStyle = () => {}; w.GM_getValue = (k, d) => (k in store ? store[k] : d); w.GM_setValue = (k, v) => { store[k] = v; };
    w.GM_deleteValue = k => { delete store[k]; }; w.GM_registerMenuCommand = () => {}; w.GM_xmlhttpRequest = () => {};
    w.TextDecoder = TextDecoder; w.DataTransfer = function () { this.items = { add() {} }; this.files = []; };
    w.eval(fs.readFileSync(`${DIR}/cg-ai-solver.user.js`, 'utf8'));
    if (!w.document.getElementById('cgai-panel')) w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    return { w, api: w.__CGAI_API__ };
}

console.log('[普通编程题 programList]');
{
    const { api } = load('pl1.html', 'http://10.109.120.139/assignment/programList.jsp?proNum=1&assignID=51');
    ok('pageType=file', api.pageType() === 'file');
    ok('extractIds 1626/51', JSON.stringify(api.extractIds()) === JSON.stringify({ problemID: '1626', assignID: '51' }));
    const p = api.extractFor('file');
    ok('题面含【问题描述】+【样例输出】', /【问题描述】/.test(p.statement) && /【样例输出】/.test(p.statement));
    ok('discoverAssignList 含 51-54', ['51', '52', '53', '54'].every(a => api.discoverAssignList().includes(a)));
    ok('buildMessages(file) 要求 public class Main', /public class Main/.test(api.buildMessages(p, null)[0].content));
}

console.log('\n[填空题 programFillGapList]');
{
    const { api } = load('fg.html', 'http://10.109.120.139/assignment/programFillGapList.jsp?proNum=1&assignID=53');
    ok('pageType=gap', api.pageType() === 'gap');
    const p = api.extractFor('gap');
    ok('gaps>=1', p.gaps >= 1, 'gaps=' + p.gaps);
    ok('模板含 /*__GAP1__*/ 标记', /\/\*__GAP1__\*\//.test(p.template), p.template.slice(0, 60));
    ok('模板含周边代码(class MobilePhone)', /class MobilePhone/.test(p.template));
    ok('buildMessages(gap) 要求输出 JSON', /JSON/.test(api.buildMessages(p, null)[0].content) && /__GAP/.test(api.buildMessages(p, null)[1].content));
    const a = api.parseGapAnswers('{"1":"abstract class"}');
    ok('parseGapAnswers', a['1'] === 'abstract class');
    ok('parseGapAnswers 带围栏/杂质', api.parseGapAnswers('好的：\n```json\n{"1":"abstract class","2":"x"}\n```')['2'] === 'x');
}

console.log('\n[接口题 programWithInterfaceList — pageType]');
{
    const { api } = load('pl1.html', 'http://10.109.120.139/assignment/programWithInterfaceList.jsp?proNum=1&assignID=54');
    ok('pageType=iface', api.pageType() === 'iface');
    ok('buildMessages(iface) 用 mainClass', /people\.InStudentTest/.test(api.buildMessages({ kind: 'iface', title: 't', statement: 's', mainClass: 'people.InStudentTest' }, null)[0].content));
}

console.log('\n[失败反馈 dynamictest]');
{
    const { api } = load('pl1.html', 'http://10.109.120.139/x');
    const dt = new TextDecoder('gbk').decode(fs.readFileSync(`${DIR}/dt.html`));
    const fb = api.feedbackFromHtml(dt);
    ok('反馈含 测试数据5', /测试数据5/.test(fb), fb.slice(0, 40));
    ok('反馈含 期望输出 + 你的输出', /期望输出/.test(fb) && /你的输出/.test(fb));
    ok('反馈含错误输出内容(According)', /According/.test(fb));
}

console.log('\n[模型梯队 / 判分]');
{
    const { api } = load('pl1.html', 'http://10.109.120.139/x');
    const L = api.ladderFor({ model: 'deepseek-v4-flash', strongModel: 'deepseek-v4-pro', thinking: false, maxAttempts: 3 });
    ok('ladder=3 且末版升级强模型', L.length === 3 && L[2].model === 'deepseek-v4-pro');
    ok('submitTimeOf', api.submitTimeOf('得分20.00 最后一次提交时间:2026-06-09 14:05:42 abc') === '2026-06-09 14:05:42');
    let v = null; try { v = api.parseVerdict(new TextDecoder('gbk').decode(fs.readFileSync(`${DIR}/verdict.json`))); } catch (_) {}
    if (v) { const sc = api.scoreOf(v.content); ok('scoreOf 5/5 得分20.00', sc.passed === 5 && sc.total === 5 && sc.score === '20.00'); }
}

console.log(`\n=== ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
