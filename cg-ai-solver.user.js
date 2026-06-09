// ==UserScript==
// @name         CourseGrading AI 自动解题助手 (DeepSeek)
// @namespace    https://github.com/winbeau/xiji
// @version      1.1.0
// @description  在 CourseGrading(educg) 编程题页面：提取完整题目 → DeepSeek 生成 Java → 自动填表提交 → 轮询并显示判题结果。
// @author       winbeau
// @homepageURL  https://github.com/winbeau/xiji
// @supportURL   https://github.com/winbeau/xiji/issues
// @downloadURL  https://feiyue.selab.top/cg-ai-solver.user.js
// @updateURL    https://feiyue.selab.top/cg-ai-solver.user.js
// @match        http://10.109.120.139/assignment/programList.jsp*
// @icon         http://10.109.120.139/images/cgicon.png
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @connect      api.deepseek.com
// @connect      10.109.120.139
// @connect      self
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* ============================ 配置 ============================ */
    const STORE = {
        KEY: 'ds_api_key',
        MODEL: 'ds_model',
        AUTO_SUBMIT: 'cg_auto_submit',
    };
    const DEFAULT_MODEL = 'deepseek-v4-pro';
    const MODELS = ['deepseek-v4-pro', 'deepseek-v4-flash'];
    const DS_ENDPOINT = 'https://api.deepseek.com/chat/completions';
    const OJ_BASE = location.origin; // http://10.109.120.139

    const getKey = () => (GM_getValue(STORE.KEY, '') || '').trim();
    const getModel = () => GM_getValue(STORE.MODEL, DEFAULT_MODEL);
    const getAutoSubmit = () => GM_getValue(STORE.AUTO_SUBMIT, true);

    /* ===================== 图标（lucide 线性 SVG，currentColor 描边） ===================== */
    const svg = (p, s) => `<svg class="cgai-svg" width="${s || 16}" height="${s || 16}" viewBox="0 0 24 24" ` +
        `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
    const ICON = {
        brand:    svg('<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>', 16),     // code-xml
        settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 15),
        minus:    svg('<path d="M5 12h14"/>', 16),
        run:      svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 15),                       // zap
        ok:       svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', 15),                        // check-circle
        warn:     svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4"/><path d="M12 17h.01"/>', 15),
        err:      svg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>', 15),         // x-circle
        file:     svg('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M16 13H8"/><path d="M16 17H8"/>', 14),
    };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* ============================ 样式 ============================ */
    GM_addStyle(`
        /* ===== Aurash / Notion 设计令牌 ===== */
        :where(#cgai-panel,#cgai-fab){
            --cg-bg:#ffffff; --cg-bg-subtle:#f7f6f3; --cg-bg-hover:#f1f1ef;
            --cg-text:#37352f; --cg-muted:#787774; --cg-faint:#9b9a97;
            --cg-border:#edece9; --cg-line:#dcdad4; --cg-link:#2383e2;
            --cg-accent:#0f7b6c;
            --cg-ok-fg:#0f5e54; --cg-ok-bg:rgba(15,123,108,.12); --cg-ok-bd:rgba(15,123,108,.32);
            --cg-err-fg:#b91c1c; --cg-err-bg:rgba(224,62,62,.12); --cg-err-bd:rgba(224,62,62,.32);
            --cg-busy-fg:#b35309; --cg-busy-bg:rgba(217,115,13,.12); --cg-busy-bd:rgba(217,115,13,.32);
            --cg-code-bg:rgba(135,131,120,.12); --cg-code-fg:#eb5757;
            --cg-r-sm:6px; --cg-r-md:8px; --cg-r-lg:12px;
            --cg-shadow:0 10px 32px -8px rgba(15,15,15,.16),0 2px 6px rgba(15,15,15,.05);
            --cg-font:'Inter Tight','PingFang SC',-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;
            --cg-serif:'Source Serif 4','Noto Serif SC',Georgia,'Songti SC',serif;
            --cg-mono:'JetBrains Mono','SF Mono',Menlo,Consolas,monospace;
        }
        #cgai-panel,#cgai-panel *{box-sizing:border-box}
        .cgai-svg{display:inline-block;flex:0 0 auto;vertical-align:-2px}
        #cgai-head .cgai-badge .cgai-svg{color:var(--cg-accent)}
        #cgai-run .cgai-svg{margin-right:7px}
        #cgai-status .cgai-svg{margin-right:6px}
        #cgai-title .cgai-svg{color:var(--cg-faint);margin-right:8px;vertical-align:-3px}
        #cgai-fab .cgai-svg{vertical-align:-3px}
        #cgai-panel{position:fixed;right:22px;bottom:22px;width:380px;max-height:82vh;z-index:2147483600;
            background:var(--cg-bg);border:1px solid var(--cg-line);border-radius:var(--cg-r-lg);
            box-shadow:var(--cg-shadow);font-family:var(--cg-font);font-size:13px;line-height:1.5;color:var(--cg-text);
            display:flex;flex-direction:column;overflow:hidden;-webkit-font-smoothing:antialiased}
        /* header */
        #cgai-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 14px;
            background:var(--cg-bg-subtle);border-bottom:1px solid var(--cg-border);cursor:move;user-select:none}
        #cgai-head .cgai-brand{display:flex;align-items:center;gap:9px;min-width:0}
        #cgai-head .cgai-badge{width:26px;height:26px;flex:0 0 26px;display:flex;align-items:center;justify-content:center;
            background:var(--cg-ok-bg);border:1px solid var(--cg-ok-bd);border-radius:var(--cg-r-sm);font-size:14px}
        #cgai-head .cgai-titles{display:flex;flex-direction:column;line-height:1.15;min-width:0}
        #cgai-head .cgai-titles b{font-size:13.5px;font-weight:600;letter-spacing:.2px;color:var(--cg-text)}
        #cgai-head .cgai-titles i{font-style:normal;font-size:11px;color:var(--cg-faint)}
        #cgai-head .cgai-tools{display:flex;gap:2px;align-items:center;flex:0 0 auto}
        #cgai-head .cgai-ic{width:24px;height:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;
            color:var(--cg-muted);border-radius:var(--cg-r-sm);font-size:14px;transition:.15s}
        #cgai-head .cgai-ic:hover{background:var(--cg-bg-hover);color:var(--cg-text)}
        /* body */
        #cgai-body{padding:14px;overflow:auto}
        #cgai-body .row{display:flex;gap:9px;align-items:center;margin-bottom:11px}
        #cgai-body label{color:var(--cg-muted);white-space:nowrap;font-size:12.5px}
        #cgai-body label.cgai-chk{display:flex;align-items:center;gap:7px;cursor:pointer;color:var(--cg-text)}
        #cgai-body label.cgai-chk input{accent-color:var(--cg-accent);width:14px;height:14px}
        #cgai-body select,#cgai-body input[type=text]{flex:1;min-width:0;padding:6px 9px;color:var(--cg-text);
            background:var(--cg-bg);border:1px solid var(--cg-line);border-radius:var(--cg-r-sm);font-size:13px;
            font-family:var(--cg-font);outline:none;transition:.15s}
        #cgai-body select:focus,#cgai-body input[type=text]:focus{border-color:var(--cg-link);
            box-shadow:0 0 0 3px rgba(35,131,226,.14)}
        /* primary button (shadcn new-york: dark) */
        #cgai-run{width:100%;display:flex;align-items:center;justify-content:center;padding:10px 12px;
            border:1px solid transparent;border-radius:var(--cg-r-md);
            background:var(--cg-text);color:#fff;font-size:13.5px;font-weight:600;font-family:var(--cg-font);
            cursor:pointer;transition:.15s;letter-spacing:.2px}
        #cgai-run:hover{background:#2b2926}
        #cgai-run:active{transform:translateY(.5px)}
        #cgai-run:disabled{background:var(--cg-bg-subtle);color:var(--cg-faint);border-color:var(--cg-border);cursor:not-allowed}
        /* problem title — serif, editorial */
        #cgai-title{font-family:var(--cg-serif);font-weight:600;font-size:15px;line-height:1.35;
            margin:13px 0 2px;color:var(--cg-text);word-break:break-word}
        #cgai-title:empty{display:none}
        /* status pill */
        #cgai-status{margin:10px 0 0;padding:9px 11px;border-radius:var(--cg-r-md);background:var(--cg-bg-subtle);
            border:1px solid var(--cg-border);color:var(--cg-text);white-space:pre-wrap;min-height:18px;font-size:12.5px}
        #cgai-status:empty{display:none}
        #cgai-status.ok{background:var(--cg-ok-bg);border-color:var(--cg-ok-bd);color:var(--cg-ok-fg)}
        #cgai-status.err{background:var(--cg-err-bg);border-color:var(--cg-err-bd);color:var(--cg-err-fg)}
        #cgai-status.busy{background:var(--cg-busy-bg);border-color:var(--cg-busy-bd);color:var(--cg-busy-fg)}
        /* code */
        .cgai-sec{margin-top:11px}
        .cgai-sec>summary{cursor:pointer;color:var(--cg-muted);font-weight:600;font-size:12px;outline:none;
            list-style:none;user-select:none}
        .cgai-sec>summary::-webkit-details-marker{display:none}
        .cgai-sec>summary::before{content:'\\25B8';display:inline-block;margin-right:6px;transition:.15s;color:var(--cg-faint)}
        .cgai-sec[open]>summary::before{transform:rotate(90deg)}
        .cgai-code{margin-top:8px;background:var(--cg-bg-subtle);color:var(--cg-text);border:1px solid var(--cg-border);
            border-radius:var(--cg-r-md);padding:11px 12px;font-family:var(--cg-mono);font-size:12px;line-height:1.55;
            white-space:pre;overflow:auto;max-height:240px;tab-size:4}
        /* verdict card */
        #cgai-verdict{margin-top:10px}
        #cgai-verdict:empty{display:none}
        .cgai-vcard{background:var(--cg-bg-subtle);border:1px solid var(--cg-border);
            border-radius:var(--cg-r-md);padding:11px 12px;font-size:12.5px;line-height:1.7;color:var(--cg-text)}
        .cgai-vcard font{color:var(--cg-text)!important;font-weight:600}
        .cgai-vcard table{border-collapse:collapse;width:100%!important;margin-top:8px;font-size:12px}
        .cgai-vcard td{border:1px solid var(--cg-line);padding:5px 9px}
        .cgai-vcard tr:first-child td{background:var(--cg-bg-hover);font-weight:600;color:var(--cg-muted)}
        .cgai-vcard tr:not(:first-child) td:last-child{color:var(--cg-ok-fg);font-weight:500}
        /* FAB pill */
        #cgai-fab{position:fixed;right:22px;bottom:22px;z-index:2147483600;display:none;align-items:center;gap:7px;
            background:var(--cg-text);color:#fff;border-radius:999px;padding:10px 16px;font-weight:600;font-size:13px;
            font-family:var(--cg-font);cursor:pointer;box-shadow:var(--cg-shadow);transition:.15s}
        #cgai-fab:hover{transform:translateY(-1px)}
        /* spinner */
        .cgai-spin{display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-top-color:transparent;
            border-radius:50%;animation:cgaispin .7s linear infinite;vertical-align:-1px;margin-right:7px;opacity:.7}
        @keyframes cgaispin{to{transform:rotate(360deg)}}
    `);

    /* ============================ 工具函数 ============================ */
    function htmlToText(html) {
        return html
            .replace(/<br\s*\/?>(?=)/gi, '\n')
            .replace(/<\/(p|div|li|h\d|tr)>/gi, '\n')
            .replace(/<\/pre>/gi, '\n')
            .replace(/<li[^>]*>/gi, ' - ')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
            .replace(/&amp;/gi, '&')
            .replace(/ /g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    // 从 DOM 提取完整题目（标题 + 题面，到第一个 <hr> 为止）
    function extractProblem() {
        const col = document.querySelector('#cgcontainerID .col-10') ||
                    document.querySelector('.col-10') || document.body;
        // 标题
        const active = col.querySelector('.breadcrumb .breadcrumb-item.active');
        const title = active ? active.textContent.replace(/\s+/g, ' ').trim() : '(未取得标题)';
        // 题面：面包屑 nav 之后到 <hr> 之前的所有元素
        const nav = col.querySelector('nav[aria-label="breadcrumb"]');
        let html = '';
        if (nav) {
            let n = nav.nextSibling;
            while (n) {
                if (n.nodeType === 1 && n.tagName === 'HR') break;
                if (n.nodeType === 1) html += n.outerHTML;
                else if (n.nodeType === 3) html += n.nodeValue;
                n = n.nextSibling;
            }
        }
        const statement = htmlToText(html);
        return { title, statement };
    }

    // 从页面解析 problemID / assignID
    function extractIds() {
        let problemID = '', assignID = '';
        const fr = document.getElementById('showmessageFrame');
        const src = fr ? (fr.getAttribute('src') || '') : '';
        let m = src.match(/problemID=(\d+)/); if (m) problemID = m[1];
        m = src.match(/assignID=(\d+)/); if (m) assignID = m[1];
        if (!assignID) { m = location.search.match(/assignID=(\d+)/); if (m) assignID = m[1]; }
        if (!problemID) {
            // 兜底：在内联脚本里找 problemID=
            m = document.body.innerHTML.match(/problemID=(\d+)/); if (m) problemID = m[1];
        }
        return { problemID, assignID };
    }

    // 解析 LLM 返回里的 java 代码块
    function parseJavaCode(content) {
        if (!content) return '';
        let m = content.match(/```(?:java)?\s*([\s\S]*?)```/i);
        let code = m ? m[1] : content;
        return code.trim();
    }
    function detectMainClass(code) {
        let m = code.match(/public\s+class\s+([A-Za-z_]\w*)/);
        if (m) return m[1];
        m = code.match(/\bclass\s+([A-Za-z_]\w*)/);
        return m ? m[1] : 'Main';
    }

    function gmPost(url, headers, body, timeout) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST', url, headers, data: body,
                timeout: timeout || 120000, responseType: 'text',
                onload: r => resolve(r),
                onerror: r => reject(new Error('网络错误: ' + (r && r.statusText || ''))),
                ontimeout: () => reject(new Error('请求超时（模型生成时间过长）')),
            });
        });
    }

    // 构造发给 DeepSeek 的消息（独立函数，便于离线复用同一套提示词）
    function buildMessages(problem) {
        const sys = [
            'You are an expert solver for a Chinese university Java online judge (CourseGrading/educg).',
            'You will be given a programming problem in Chinese. Produce ONE complete, compilable Java program',
            'that reads from standard input and writes to standard output, matching the required output format',
            'EXACTLY as shown in the sample (including every space, blank line, and trailing whitespace).',
            '',
            'Strict rules:',
            '1. Output ONLY a single fenced ```java code block. No prose before or after.',
            '2. The program MUST contain `public class Main` with `public static void main(String[] args)`.',
            '   Any helper classes must be top-level NON-public (no `public` modifier) or nested inside Main.',
            '3. Do NOT use any `package` declaration.',
            '4. ASCII only: no Chinese characters or non-ASCII anywhere in the code (no Chinese comments/strings).',
            '   The judge compiles the file; keep identifiers/strings ASCII unless the sample output itself',
            '   requires specific characters.',
            '5. Read all of stdin until EOF. Reproduce the sample output byte-for-byte.',
            '6. Only the Java standard library. Handle edge cases (empty input, extra whitespace).',
        ].join('\n');
        const user = `【题目标题】${problem.title}\n\n【题目内容】\n${problem.statement}\n\n请给出完整 Java 解法。`;
        return [{ role: 'system', content: sys }, { role: 'user', content: user }];
    }

    // 调用 DeepSeek 生成 Java
    async function callDeepSeek(problem, model, apiKey) {
        const payload = JSON.stringify({
            model,
            messages: buildMessages(problem),
            stream: false,
            temperature: 0,
            max_tokens: 8192,
        });
        const r = await gmPost(DS_ENDPOINT,
            { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
            payload, 180000);
        if (r.status === 401) throw new Error('API Key 无效 (401)，请重新设置。');
        if (r.status !== 200) throw new Error('DeepSeek 返回 ' + r.status + ': ' + (r.responseText || '').slice(0, 200));
        let data;
        try { data = JSON.parse(r.responseText); }
        catch (e) { throw new Error('无法解析 DeepSeek 响应'); }
        const msg = data.choices && data.choices[0] && data.choices[0].message;
        const content = msg && msg.content;
        if (!content) throw new Error('DeepSeek 返回内容为空（可能 max_tokens 不足）');
        return content;
    }

    // 用 DataTransfer 把生成的 java 写入页面真实文件输入框，并触发原生提交
    function fillAndSubmit(code, mainClass) {
        const fileInput = document.getElementById('CGFILE');
        const mainClassInput = document.getElementById('javamanclass');
        const btn = document.getElementById('cgSubmitBtn');
        const form = document.querySelector('form[name="upload"]');
        if (!fileInput || !btn || !form) throw new Error('未找到页面提交表单元素');

        if (mainClassInput) mainClassInput.value = mainClass;

        const file = new File([code], mainClass + '.java', { type: 'text/x-java' });
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));

        // 复用页面 filesubmit()（会追加 wtime 并 post 到 showmessage iframe）
        if (typeof form.requestSubmit === 'function') {
            form.requestSubmit(btn);
        } else {
            btn.click();
        }
    }

    // 轮询判题结果（GBK 解码）
    function fetchVerdict(assignID, problemID) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${OJ_BASE}/assignment/longtimerunJSON.jsp?assignID=${assignID}&problemID=${problemID}&_=${Date.now()}`,
                responseType: 'arraybuffer',
                timeout: 20000,
                onload: r => {
                    try {
                        const text = new TextDecoder('gbk').decode(new Uint8Array(r.response));
                        resolve(text);
                    } catch (e) { resolve(''); }
                },
                onerror: () => reject(new Error('获取判题结果失败')),
                ontimeout: () => reject(new Error('获取判题结果超时')),
            });
        });
    }
    function parseVerdict(text) {
        if (!text) return null;
        const s = text.indexOf('['), e = text.lastIndexOf(']');
        if (s < 0 || e < 0) return null;
        let arr;
        try { arr = JSON.parse(text.slice(s, e + 1)); } catch (_) { return null; }
        const ret = (arr.find(o => 'ret' in o) || {}).ret;
        const content = (arr.find(o => 'content' in o) || {}).content || '';
        return { ret, content };
    }
    async function pollVerdict(assignID, problemID, onTick) {
        const deadline = Date.now() + 90000;
        let last = null;
        await sleep(1500);
        while (Date.now() < deadline) {
            let text = '';
            try { text = await fetchVerdict(assignID, problemID); } catch (_) {}
            const v = parseVerdict(text);
            if (v) {
                last = v;
                const inProgress = /正在评判|排队|评判中|judging/i.test(v.content) || !v.content;
                if (onTick) onTick(v);
                if (v.ret === '1' && v.content && !inProgress) return v;
            }
            await sleep(2000);
        }
        return last;
    }
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    /* ============================ UI ============================ */
    let panel, statusEl, runBtn, titleEl, codeWrap, verdictEl, modelSel, autoChk;

    function setStatus(text, kind, spin) {
        statusEl.className = kind || '';
        statusEl.innerHTML = (spin ? '<span class="cgai-spin"></span>' : '') + text;
    }

    function ensureKey() {
        let key = getKey();
        if (key) return key;
        key = (prompt('首次使用：请输入你的 DeepSeek API Key（以 sk- 开头）。\n之后可在脚本菜单里修改。', '') || '').trim();
        if (key) GM_setValue(STORE.KEY, key);
        return key;
    }

    async function run() {
        verdictEl.innerHTML = '';
        codeWrap.style.display = 'none';
        try {
            runBtn.disabled = true;

            const apiKey = ensureKey();
            if (!apiKey) { setStatus('未提供 API Key，已取消。', 'err'); runBtn.disabled = false; return; }

            // 1. 提取题目
            setStatus('正在提取题目…', 'busy', true);
            const problem = extractProblem();
            const ids = extractIds();
            titleEl.innerHTML = ICON.file + '<span>' + esc(problem.title) + '</span>';
            if (!problem.statement || problem.statement.length < 5) {
                setStatus('未能提取到题面，请确认当前在编程题页面。', 'err'); runBtn.disabled = false; return;
            }
            if (!ids.problemID || !ids.assignID) {
                setStatus('未能解析 problemID/assignID。', 'err'); runBtn.disabled = false; return;
            }

            // 2. 调用 DeepSeek
            const model = getModel();
            setStatus(`正在调用 ${model} 生成 Java 代码…（推理模型，约需 10–40 秒）`, 'busy', true);
            const raw = await callDeepSeek(problem, model, apiKey);
            const code = parseJavaCode(raw);
            const mainClass = detectMainClass(code);
            if (!/class\s+\w+/.test(code)) { setStatus('生成结果不像有效 Java 代码。', 'err'); runBtn.disabled = false; return; }

            // 展示代码
            codeWrap.querySelector('.cgai-code').textContent = code;
            codeWrap.querySelector('summary').textContent = `生成代码 · 主类 ${mainClass}`;
            codeWrap.style.display = 'block';

            if (!getAutoSubmit()) {
                fillAndFillOnly(code, mainClass);
                setStatus(`代码已生成并填入表单（主类 ${mainClass}）。\n已关闭自动提交——请检查后手动点页面的“提 交”。`, 'ok');
                runBtn.disabled = false; return;
            }

            // 3. 自动提交
            setStatus(`正在提交（主类 ${mainClass}.java）…`, 'busy', true);
            fillAndSubmit(code, mainClass);

            // 4. 轮询结果
            setStatus('已提交，正在等待判题…', 'busy', true);
            const v = await pollVerdict(ids.assignID, ids.problemID, (tick) => {
                if (tick && tick.content) setStatus('判题中…', 'busy', true);
            });
            if (!v || !v.content) { setStatus('提交完成，但未取到判题结果（可在页面下方“运行结果”查看）。', 'ok'); runBtn.disabled = false; return; }

            showVerdict(v.content);
        } catch (err) {
            setStatus('出错：' + (err && err.message || err), 'err');
        } finally {
            runBtn.disabled = false;
        }
    }

    // 只填表不提交
    function fillAndFillOnly(code, mainClass) {
        const fileInput = document.getElementById('CGFILE');
        const mainClassInput = document.getElementById('javamanclass');
        if (mainClassInput) mainClassInput.value = mainClass;
        if (fileInput) {
            const file = new File([code], mainClass + '.java', { type: 'text/x-java' });
            const dt = new DataTransfer(); dt.items.add(file);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function showVerdict(contentHtml) {
        const txt = htmlToText(contentHtml);
        const passed = (txt.match(/完全正确/g) || []).length;
        const totalM = txt.match(/共有测试数据[:：]\s*(\d+)/);
        const total = totalM ? +totalM[1] : null;
        const scoreM = txt.match(/得分\s*([\d.]+)/);
        const score = scoreM ? scoreM[1] : null;
        const allOk = total != null && passed === total && passed > 0;
        let head = '';
        if (score != null) head += `得分 ${score}`;
        if (total != null) head += `${head ? '  ·  ' : ''}通过 ${passed}/${total}`;
        const vicon = allOk ? ICON.ok : (passed > 0 ? ICON.warn : ICON.err);
        setStatus(vicon + (head || '判题完成'),
                  allOk ? 'ok' : (passed > 0 ? 'busy' : 'err'));
        verdictEl.innerHTML = '<div class="cgai-vcard">' + contentHtml + '</div>'; // OJ 可信 HTML（含表格）
    }

    function buildPanel() {
        panel = document.createElement('div');
        panel.id = 'cgai-panel';
        panel.innerHTML = `
            <div id="cgai-head">
                <div class="cgai-brand">
                    <span class="cgai-badge">${ICON.brand}</span>
                    <span class="cgai-titles"><b>CG AI 解题</b><i>DeepSeek 自动解题</i></span>
                </div>
                <span class="cgai-tools">
                    <span class="cgai-ic" id="cgai-cfg" title="设置 API Key">${ICON.settings}</span>
                    <span class="cgai-ic" id="cgai-min" title="收起">${ICON.minus}</span>
                </span>
            </div>
            <div id="cgai-body">
                <div class="row">
                    <label>模型</label>
                    <select id="cgai-model"></select>
                </div>
                <div class="row">
                    <label class="cgai-chk"><input type="checkbox" id="cgai-auto"> 生成后自动提交</label>
                </div>
                <button id="cgai-run">${ICON.run}<span>一键解题并提交</span></button>
                <div id="cgai-title"></div>
                <div id="cgai-status"></div>
                <details class="cgai-sec" id="cgai-codewrap" style="display:none">
                    <summary>生成代码</summary>
                    <pre class="cgai-code"></pre>
                </details>
                <div id="cgai-verdict"></div>
            </div>`;
        document.body.appendChild(panel);

        const fab = document.createElement('div');
        fab.id = 'cgai-fab';
        fab.innerHTML = ICON.brand + '<span>AI 解题</span>';
        document.body.appendChild(fab);

        statusEl = panel.querySelector('#cgai-status');
        runBtn = panel.querySelector('#cgai-run');
        titleEl = panel.querySelector('#cgai-title');
        codeWrap = panel.querySelector('#cgai-codewrap');
        verdictEl = panel.querySelector('#cgai-verdict');
        modelSel = panel.querySelector('#cgai-model');
        autoChk = panel.querySelector('#cgai-auto');

        MODELS.forEach(m => {
            const o = document.createElement('option');
            o.value = m; o.textContent = m;
            if (m === getModel()) o.selected = true;
            modelSel.appendChild(o);
        });
        autoChk.checked = getAutoSubmit();

        modelSel.addEventListener('change', () => GM_setValue(STORE.MODEL, modelSel.value));
        autoChk.addEventListener('change', () => GM_setValue(STORE.AUTO_SUBMIT, autoChk.checked));
        runBtn.addEventListener('click', run);
        panel.querySelector('#cgai-cfg').addEventListener('click', changeKey);
        panel.querySelector('#cgai-min').addEventListener('click', () => {
            panel.style.display = 'none'; fab.style.display = 'block';
        });
        fab.addEventListener('click', () => { panel.style.display = 'flex'; fab.style.display = 'none'; });

        makeDraggable(panel, panel.querySelector('#cgai-head'));
        setStatus('就绪。点击上方按钮即可解题。', '');
    }

    function changeKey() {
        const cur = getKey();
        const k = (prompt('设置 / 修改 DeepSeek API Key：', cur) || '').trim();
        if (k) { GM_setValue(STORE.KEY, k); setStatus('API Key 已更新。', 'ok'); }
    }

    function makeDraggable(el, handle) {
        let sx, sy, ox, oy, drag = false;
        handle.addEventListener('mousedown', e => {
            drag = true; sx = e.clientX; sy = e.clientY;
            const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
            el.style.right = 'auto'; el.style.bottom = 'auto';
            el.style.left = ox + 'px'; el.style.top = oy + 'px';
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!drag) return;
            el.style.left = (ox + e.clientX - sx) + 'px';
            el.style.top = (oy + e.clientY - sy) + 'px';
        });
        document.addEventListener('mouseup', () => drag = false);
    }

    /* ============================ 菜单 ============================ */
    GM_registerMenuCommand('设置 DeepSeek API Key', changeKey);
    GM_registerMenuCommand('切换模型 (pro/flash)', () => {
        const next = getModel() === 'deepseek-v4-pro' ? 'deepseek-v4-flash' : 'deepseek-v4-pro';
        GM_setValue(STORE.MODEL, next);
        if (modelSel) modelSel.value = next;
        alert('已切换模型为：' + next);
    });

    /* ============================ 测试钩子（生产环境无副作用） ============================ */
    // 仅当外部显式设置 window.__CGAI_EXPOSE__ 时才暴露内部纯函数，便于离线单测；
    // 真实油猴环境下该标志不存在，等同 no-op。
    if (typeof window !== 'undefined' && window.__CGAI_EXPOSE__) {
        window.__CGAI_API__ = { htmlToText, extractProblem, extractIds, parseJavaCode, detectMainClass, parseVerdict, buildMessages };
    }

    /* ============================ 启动 ============================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildPanel);
    } else {
        buildPanel();
    }
})();
