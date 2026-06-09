// 端到端生成器：用真实脚本的提取+提示词，调真实 DeepSeek，产出 <Main>.java + meta.json。
import fs from 'fs';
import { JSDOM } from 'jsdom';

const DIR = '/tmp/cgtest';
const proNum = process.argv[2] || '2';
const assignID = process.argv[3] || '51';
const MODEL = process.argv[4] || 'deepseek-v4-pro';

const html = new TextDecoder('gbk').decode(fs.readFileSync(`${DIR}/pl_${proNum}.html`));
const dom = new JSDOM(html, {
    url: `http://10.109.120.139/assignment/programList.jsp?proNum=${proNum}&assignID=${assignID}`,
    runScripts: 'outside-only',
});
const w = dom.window;
const store = {};
w.__CGAI_EXPOSE__ = true;
w.GM_addStyle = () => {}; w.GM_getValue = (k, d) => (k in store ? store[k] : d);
w.GM_setValue = (k, v) => { store[k] = v; }; w.GM_registerMenuCommand = () => {};
w.GM_xmlhttpRequest = () => {}; w.TextDecoder = TextDecoder;
w.DataTransfer = function () { this.items = { add() {} }; this.files = []; };
w.eval(fs.readFileSync(`${DIR}/cg-ai-solver.user.js`, 'utf8'));
const api = w.__CGAI_API__;

const prob = api.extractProblem();
const ids = api.extractIds();
console.error('TITLE :', prob.title);
console.error('IDS   :', JSON.stringify(ids), '| statement chars:', prob.statement.length);

const KEY = fs.readFileSync(`${DIR}/ds_key`, 'utf8').trim();
const messages = api.buildMessages(prob);

const t0 = Date.now();
const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
    body: JSON.stringify({ model: MODEL, messages, stream: false, temperature: 0, max_tokens: 8192 }),
});
const data = await resp.json();
if (resp.status !== 200) { console.error('DeepSeek error', resp.status, JSON.stringify(data).slice(0, 300)); process.exit(1); }
const content = data.choices[0].message.content || '';
console.error(`MODEL :${MODEL}  耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s  reasoning_tokens=${data.usage.completion_tokens_details?.reasoning_tokens}  finish=${data.choices[0].finish_reason}`);

const code = api.parseJavaCode(content);
const mainClass = api.detectMainClass(code);
if (!/class\s+\w+/.test(code)) { console.error('生成结果非有效 Java:\n', content.slice(0, 300)); process.exit(1); }

fs.mkdirSync(`${DIR}/sol`, { recursive: true });
fs.writeFileSync(`${DIR}/sol/${mainClass}.java`, code);
fs.writeFileSync(`${DIR}/meta.json`, JSON.stringify({ mainClass, problemID: ids.problemID, assignID: ids.assignID, title: prob.title }));
console.error('MAIN  :', mainClass, '| 代码行数:', code.split('\n').length);
console.error('---- 生成代码（前 25 行）----');
console.error(code.split('\n').slice(0, 25).join('\n'));
