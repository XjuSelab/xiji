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

console.log('\n[同 assign 双题型：proNum 跨题型重复]');
{
    const { api } = load('pl1.html', 'http://10.109.120.139/x');
    const html = '<a href="programFillGapList.jsp?proNum=1&assignID=53">a</a>' +
        '<a href="programWithInterfaceList.jsp?proNum=1&assignID=53">b</a>' +
        '<a href="programFillGapList.jsp?proNum=2&assignID=53">c</a>' +
        '<a href="programList.jsp?proNum=1&assignID=99">other</a>';
    const items = api.parseAssignProblems(html, '53');
    ok('保留3题(两类的 proNum=1 都不丢)', items.length === 3, JSON.stringify(items.map(i => i.page + ':' + i.proNum)));
    ok('proNum=1 有两条(不同题型)', items.filter(i => i.proNum === 1).length === 2);
    const k1 = api.itemKey(items.find(i => /FillGap/.test(i.page) && i.proNum === 1));
    const k2 = api.itemKey(items.find(i => /Interface/.test(i.page) && i.proNum === 1));
    ok('itemKey 含页型→两条 key 不冲突', k1 !== k2, k1 + ' vs ' + k2);
    ok('不串入别的 assign(99)', !items.some(i => i.assignID === '99'));
}

console.log('\n[接口题 programWithInterfaceList — pageType]');
{
    const { api } = load('pl1.html', 'http://10.109.120.139/assignment/programWithInterfaceList.jsp?proNum=1&assignID=54');
    ok('pageType=iface', api.pageType() === 'iface');
    ok('buildMessages(iface): 主类/包 + 不重定义接口', (() => { const c = api.buildMessages({ kind: 'iface', title: 't', statement: 's', mainClass: 'people.InStudentTest' }, null)[0].content; return /InStudentTest/.test(c) && /package people/.test(c) && /NOT redefine/i.test(c); })());
}

console.log('\n[失败反馈 dynamictest]');
{
    const { api } = load('pl1.html', 'http://10.109.120.139/x');
    const dt = new TextDecoder('gbk').decode(fs.readFileSync(`${DIR}/dt.html`));
    const fb = api.feedbackFromHtml(dt);
    ok('反馈含 测试点5', /测试点5/.test(fb), fb.slice(0, 50));
    ok('反馈含 期望输出 + 实际输出', /期望输出/.test(fb) && /实际输出/.test(fb));
    ok('反馈含错误输出内容(According)', /According/.test(fb));
}

console.log('\n[模型梯队 / 判分]');
{
    const { api } = load('pl1.html', 'http://10.109.120.139/x');
    const L = api.planFor({ model: 'deepseek-v4-flash', strongModel: 'deepseek-v4-pro', thinking: false, maxAttempts: 3 });
    ok('plan=3', L.length === 3);
    ok('v1 normal / v2 fix 同模型(flash)', L[0].mode === 'normal' && L[1].mode === 'fix' && L[0].model === 'deepseek-v4-flash' && L[1].model === 'deepseek-v4-flash');
    ok('v3=面向样例·同模型(不升级)', L[2].mode === 'sample' && L[2].model === 'deepseek-v4-flash' && !L[2].escalate);
    const L4 = api.planFor({ model: 'deepseek-v4-flash', strongModel: 'deepseek-v4-pro', thinking: false, maxAttempts: 4 });
    ok('版本≥4 时 v3 面向样例 / v4 升级强模型', L4[2].mode === 'sample' && L4[3].mode === 'escalate' && L4[3].model === 'deepseek-v4-pro');
    ok('maxAttempts=1 只 normal 不升级', (() => { const p = api.planFor({ model: 'm', strongModel: 'big', maxAttempts: 1 }); return p.length === 1 && p[0].mode === 'normal' && p[0].model === 'm'; })());
    ok('submitTimeOf', api.submitTimeOf('得分20.00 最后一次提交时间:2026-06-09 14:05:42 abc') === '2026-06-09 14:05:42');
    let v = null; try { v = api.parseVerdict(new TextDecoder('gbk').decode(fs.readFileSync(`${DIR}/verdict.json`))); } catch (_) {}
    if (v) { const sc = api.scoreOf(v.content); ok('scoreOf 5/5 得分20.00', sc.passed === 5 && sc.total === 5 && sc.score === '20.00'); }
}

console.log(`\n=== ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
