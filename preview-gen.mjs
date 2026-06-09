// 从真实脚本抽取 CSS，配合同一套 SVG 图标生成预览页，用于视觉校验 Aurash 风格。
import fs from 'fs';
const src = fs.readFileSync(new URL('./cg-ai-solver.user.js', import.meta.url), 'utf8');
let css = src.match(/GM_addStyle\(`([\s\S]*?)`\);/)[1];
css = css.replace(/\\\\/g, '\\'); // 模板字面量里的 \\ → 运行时 \

// 与脚本一致的图标
const svg = (p, s) => `<svg class="cgai-svg" width="${s || 16}" height="${s || 16}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
    brand:    svg('<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>', 16),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 15),
    minus:    svg('<path d="M5 12h14"/>', 16),
    run:      svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 15),
    ok:       svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', 15),
    file:     svg('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M16 13H8"/><path d="M16 17H8"/>', 14),
};

const sampleCode = `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int a = n / 100, b = (n / 10) % 10, c = n % 10;
        System.out.println(c * 100 + b * 10 + a);
    }
}`;

const verdict = `<font color="#3366CC">得分20.00&nbsp;&nbsp;&nbsp;最后一次提交时间:2026-06-09 14:20:16</font><br><br>` +
    `共有测试数据:5<br>平均占用内存:46.704K&nbsp;&nbsp;平均CPU时间:0.20150S<br><br>` +
    `<table border="0" cellpadding="0" cellspacing="0" width=400>` +
    `<tr><td><b>测试数据</b></td><td><b>评判结果</b></td></tr>` +
    [1, 2, 3, 4, 5].map(i => `<tr><td>测试数据${i}</td><td>完全正确</td></tr>`).join('') +
    `</table>`;

const panel = `
  <div id="cgai-panel">
    <div id="cgai-head">
      <div class="cgai-brand">
        <span class="cgai-badge">${ICON.brand}</span>
        <span class="cgai-titles"><b>CG AI 解题</b><i>DeepSeek 自动解题</i></span>
      </div>
      <span class="cgai-tools">
        <span class="cgai-ic">${ICON.settings}</span><span class="cgai-ic">${ICON.minus}</span>
      </span>
    </div>
    <div id="cgai-body">
      <div class="row"><label>模型</label>
        <select><option>deepseek-v4-pro</option><option>deepseek-v4-flash</option></select></div>
      <div class="row"><label class="cgai-chk"><input type="checkbox" checked> 生成后自动提交</label></div>
      <button id="cgai-run">${ICON.run}<span>一键解题并提交</span></button>
      <div id="cgai-title">${ICON.file}<span>2. 数值变换</span></div>
      <div id="cgai-status" class="ok">${ICON.ok}得分 20.00  ·  通过 5/5</div>
      <details class="cgai-sec" open>
        <summary>生成代码 · 主类 Main</summary>
        <pre class="cgai-code">${sampleCode.replace(/</g, '&lt;')}</pre>
      </details>
      <div id="cgai-verdict"><div class="cgai-vcard">${verdict}</div></div>
    </div>
  </div>`;

const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  body{margin:0;min-height:100vh;background:#fbfbfa;
    background-image:radial-gradient(circle at 1px 1px, rgba(55,53,47,.06) 1px, transparent 0);background-size:22px 22px}
${css}
  #cgai-panel{position:absolute;right:48px;top:44px;max-height:none}
</style></head><body>${panel}</body></html>`;

fs.writeFileSync(new URL('./preview.html', import.meta.url), html);
console.log('wrote preview.html (' + html.length + ' bytes)');
