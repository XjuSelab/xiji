// ==UserScript==
// @name         CourseGrading AI 自动解题助手 (DeepSeek)
// @namespace    https://github.com/winbeau/xiji
// @version      2.0.0
// @description  希冀(CourseGrading/educg) 编程题：提取题目→DeepSeek 生成 Java→自动提交→读判题结果；支持一键串行开刷所有作业/所有题目、失败多版本重试、自动跳题。
// @author       winbeau
// @homepageURL  https://github.com/winbeau/xiji
// @supportURL   https://github.com/winbeau/xiji/issues
// @downloadURL  https://feiyue.selab.top/cg-ai-solver.user.js
// @updateURL    https://feiyue.selab.top/cg-ai-solver.user.js
// @match        http://10.109.120.139/*
// @icon         http://10.109.120.139/images/cgicon.png
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @connect      api.deepseek.com
// @connect      10.109.120.139
// @connect      self
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';
    // 只在顶层框架运行：避免注入到判题结果 iframe(showProcessMsg/longtimerun)
    if (window.top !== window.self) return;

    /* ============================ 配置 / 存储 ============================ */
    const STORE = {
        KEY: 'ds_api_key', BASE_URL: 'ds_base_url', MODEL: 'ds_model', STRONG_MODEL: 'ds_strong_model',
        THINKING: 'ds_thinking', AUTO_SUBMIT: 'cg_auto_submit', MAX_ATTEMPTS: 'cg_max_attempts',
        SKIP_PASSED: 'cg_skip_passed', GRIND: 'cg_grind_state',
    };
    // 默认走 DeepSeek，但 Base URL / 模型可在配置页改成任意 OpenAI 兼容服务
    const DEFAULTS = { baseURL: 'https://api.deepseek.com', model: 'deepseek-v4-flash', strongModel: 'deepseek-v4-pro' };
    const MODEL_SUGGEST = ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner', 'gpt-4o-mini', 'gpt-4o', 'qwen-max'];
    const OJ = location.origin;

    const getKey = () => (GM_getValue(STORE.KEY, '') || '').trim();
    const getBaseURL = () => (GM_getValue(STORE.BASE_URL, DEFAULTS.baseURL) || DEFAULTS.baseURL).trim().replace(/\/+$/, '');
    const isDeepSeek = () => /deepseek/i.test(getBaseURL());
    const settings = () => ({
        baseURL: getBaseURL(),
        model: (GM_getValue(STORE.MODEL, DEFAULTS.model) || DEFAULTS.model).trim(),
        strongModel: (GM_getValue(STORE.STRONG_MODEL, DEFAULTS.strongModel) || '').trim(),
        thinking: GM_getValue(STORE.THINKING, true),
        autoSubmit: GM_getValue(STORE.AUTO_SUBMIT, true),
        maxAttempts: +GM_getValue(STORE.MAX_ATTEMPTS, 3),
        skipPassed: GM_getValue(STORE.SKIP_PASSED, true),
    });
    const getGrind = () => { try { return JSON.parse(GM_getValue(STORE.GRIND, '') || 'null'); } catch (_) { return null; } };
    const setGrind = g => GM_setValue(STORE.GRIND, JSON.stringify(g));
    const clearGrind = () => GM_deleteValue(STORE.GRIND);

    const isProblemPage = () => /\/assignment\/programList\.jsp/i.test(location.pathname + location.search) || /programList\.jsp/i.test(location.href);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    /* ============================ 图标（lucide 线性 SVG） ============================ */
    const svg = (p, s) => `<svg class="cgai-svg" width="${s || 16}" height="${s || 16}" viewBox="0 0 24 24" ` +
        `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
    const ICON = {
        brand:    svg('<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>', 16),
        settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 15),
        minus:    svg('<path d="M5 12h14"/>', 16),
        run:      svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 15),
        grind:    svg('<path d="m12 19-7-7 3-3 7 7-3 3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18z"/><path d="m2 2 7.586 7.586"/><circle cx="11" cy="11" r="2"/>', 15),
        stop:     svg('<rect x="6" y="6" width="12" height="12" rx="1"/>', 15),
        ok:       svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', 15),
        warn:     svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4"/><path d="M12 17h.01"/>', 15),
        err:      svg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>', 15),
        skip:     svg('<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>', 14),
        file:     svg('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M16 13H8"/><path d="M16 17H8"/>', 14),
    };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* ============================ 样式（Aurash / Notion） ============================ */
    GM_addStyle(`
        :where(#cgai-panel,#cgai-fab){
            --cg-bg:#ffffff; --cg-bg-subtle:#f7f6f3; --cg-bg-hover:#f1f1ef;
            --cg-text:#37352f; --cg-muted:#787774; --cg-faint:#9b9a97;
            --cg-border:#edece9; --cg-line:#dcdad4; --cg-link:#2383e2; --cg-accent:#0f7b6c;
            --cg-ok-fg:#0f5e54; --cg-ok-bg:rgba(15,123,108,.12); --cg-ok-bd:rgba(15,123,108,.32);
            --cg-err-fg:#b91c1c; --cg-err-bg:rgba(224,62,62,.12); --cg-err-bd:rgba(224,62,62,.32);
            --cg-busy-fg:#b35309; --cg-busy-bg:rgba(217,115,13,.12); --cg-busy-bd:rgba(217,115,13,.32);
            --cg-r-sm:6px; --cg-r-md:8px; --cg-r-lg:12px;
            --cg-shadow:0 10px 32px -8px rgba(15,15,15,.16),0 2px 6px rgba(15,15,15,.05);
            --cg-font:'Inter Tight','PingFang SC',-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;
            --cg-serif:'Source Serif 4','Noto Serif SC',Georgia,'Songti SC',serif;
            --cg-mono:'JetBrains Mono','SF Mono',Menlo,Consolas,monospace;
        }
        #cgai-panel,#cgai-panel *{box-sizing:border-box}
        .cgai-svg{display:inline-block;flex:0 0 auto;vertical-align:-2px}
        #cgai-head .cgai-badge .cgai-svg{color:var(--cg-accent)}
        #cgai-status .cgai-svg{margin-right:6px}
        #cgai-title .cgai-svg{color:var(--cg-faint);margin-right:8px;vertical-align:-3px}
        #cgai-fab .cgai-svg{vertical-align:-3px}
        #cgai-panel{position:fixed;right:22px;bottom:22px;width:460px;max-height:88vh;z-index:2147483600;
            background:var(--cg-bg);border:1px solid var(--cg-line);border-radius:var(--cg-r-lg);box-shadow:var(--cg-shadow);
            font-family:var(--cg-font);font-size:13px;line-height:1.5;color:var(--cg-text);display:flex;flex-direction:column;
            overflow:hidden;-webkit-font-smoothing:antialiased}
        #cgai-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 15px;
            background:var(--cg-bg-subtle);border-bottom:1px solid var(--cg-border);cursor:move;user-select:none}
        #cgai-head .cgai-brand{display:flex;align-items:center;gap:9px;min-width:0}
        #cgai-head .cgai-badge{width:27px;height:27px;flex:0 0 27px;display:flex;align-items:center;justify-content:center;
            background:var(--cg-ok-bg);border:1px solid var(--cg-ok-bd);border-radius:var(--cg-r-sm)}
        #cgai-head .cgai-titles{display:flex;flex-direction:column;line-height:1.15;min-width:0}
        #cgai-head .cgai-titles b{font-size:14px;font-weight:600;letter-spacing:.2px}
        #cgai-head .cgai-titles i{font-style:normal;font-size:11px;color:var(--cg-faint)}
        #cgai-head .cgai-tools{display:flex;gap:2px;flex:0 0 auto}
        #cgai-head .cgai-ic{width:24px;height:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;
            color:var(--cg-muted);border-radius:var(--cg-r-sm);transition:.15s}
        #cgai-head .cgai-ic:hover{background:var(--cg-bg-hover);color:var(--cg-text)}
        #cgai-body{padding:14px 15px;overflow:auto}
        /* 设置区 */
        .cgai-settings{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:10px 12px;margin-bottom:12px;
            background:var(--cg-bg-subtle);border:1px solid var(--cg-border);border-radius:var(--cg-r-md)}
        .cgai-settings .f{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--cg-muted)}
        .cgai-settings select,.cgai-settings input[type=number]{padding:4px 8px;border:1px solid var(--cg-line);
            border-radius:var(--cg-r-sm);font-size:12.5px;font-family:var(--cg-font);background:var(--cg-bg);color:var(--cg-text);outline:none}
        .cgai-settings input[type=number]{width:48px}
        .cgai-settings select:focus,.cgai-settings input:focus{border-color:var(--cg-link);box-shadow:0 0 0 3px rgba(35,131,226,.14)}
        .cgai-chk{display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--cg-text);font-size:12.5px}
        .cgai-chk input{accent-color:var(--cg-accent);width:14px;height:14px}
        /* 按钮 */
        .cgai-btns{display:flex;gap:9px}
        .cgai-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:10px 12px;
            border-radius:var(--cg-r-md);font-size:13.5px;font-weight:600;font-family:var(--cg-font);cursor:pointer;
            transition:.15s;letter-spacing:.2px;border:1px solid transparent}
        .cgai-btn .cgai-svg{margin:0}
        .cgai-btn-primary{background:var(--cg-text);color:#fff}
        .cgai-btn-primary:hover{background:#2b2926}
        .cgai-btn-ghost{background:var(--cg-bg);color:var(--cg-text);border-color:var(--cg-line)}
        .cgai-btn-ghost:hover{background:var(--cg-bg-hover)}
        .cgai-btn-danger{background:var(--cg-err-bg);color:var(--cg-err-fg);border-color:var(--cg-err-bd)}
        .cgai-btn-danger:hover{background:rgba(224,62,62,.18)}
        .cgai-btn:disabled{background:var(--cg-bg-subtle);color:var(--cg-faint);border-color:var(--cg-border);cursor:not-allowed}
        .cgai-btn:active{transform:translateY(.5px)}
        #cgai-title{font-family:var(--cg-serif);font-weight:600;font-size:15px;line-height:1.35;margin:13px 0 2px;word-break:break-word}
        #cgai-title:empty{display:none}
        #cgai-status{margin:10px 0 0;padding:9px 11px;border-radius:var(--cg-r-md);background:var(--cg-bg-subtle);
            border:1px solid var(--cg-border);white-space:pre-wrap;min-height:18px;font-size:12.5px}
        #cgai-status:empty{display:none}
        #cgai-status.ok{background:var(--cg-ok-bg);border-color:var(--cg-ok-bd);color:var(--cg-ok-fg)}
        #cgai-status.err{background:var(--cg-err-bg);border-color:var(--cg-err-bd);color:var(--cg-err-fg)}
        #cgai-status.busy{background:var(--cg-busy-bg);border-color:var(--cg-busy-bd);color:var(--cg-busy-fg)}
        /* 开刷进度列表 */
        #cgai-grind:empty{display:none}
        #cgai-grind{margin-top:12px}
        .cgai-ghead{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--cg-muted);font-weight:600;margin-bottom:6px}
        .cgai-glist{display:flex;flex-direction:column;gap:3px;max-height:240px;overflow:auto;padding-right:2px}
        .cgai-grow{display:flex;align-items:center;gap:8px;padding:5px 9px;border:1px solid var(--cg-border);
            border-radius:var(--cg-r-sm);background:var(--cg-bg-subtle);font-size:12px}
        .cgai-grow .gk{color:var(--cg-muted);font-variant-numeric:tabular-nums;min-width:64px}
        .cgai-grow .gt{flex:1;color:var(--cg-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cgai-grow .gs{font-weight:600;font-variant-numeric:tabular-nums}
        .cgai-grow.ok{background:var(--cg-ok-bg);border-color:var(--cg-ok-bd)} .cgai-grow.ok .gs{color:var(--cg-ok-fg)}
        .cgai-grow.fail{background:var(--cg-err-bg);border-color:var(--cg-err-bd)} .cgai-grow.fail .gs{color:var(--cg-err-fg)}
        .cgai-grow.cur{border-color:var(--cg-accent);box-shadow:0 0 0 1px var(--cg-accent) inset}
        .cgai-grow.skip{opacity:.7}
        .cgai-sec{margin-top:11px}
        .cgai-sec>summary{cursor:pointer;color:var(--cg-muted);font-weight:600;font-size:12px;outline:none;list-style:none;user-select:none}
        .cgai-sec>summary::-webkit-details-marker{display:none}
        .cgai-sec>summary::before{content:'\\25B8';display:inline-block;margin-right:6px;transition:.15s;color:var(--cg-faint)}
        .cgai-sec[open]>summary::before{transform:rotate(90deg)}
        .cgai-code{margin-top:8px;background:var(--cg-bg-subtle);color:var(--cg-text);border:1px solid var(--cg-border);
            border-radius:var(--cg-r-md);padding:11px 12px;font-family:var(--cg-mono);font-size:12px;line-height:1.55;
            white-space:pre;overflow:auto;max-height:240px;tab-size:4}
        #cgai-verdict:empty{display:none}
        #cgai-verdict{margin-top:10px}
        .cgai-vcard{background:var(--cg-bg-subtle);border:1px solid var(--cg-border);border-radius:var(--cg-r-md);
            padding:11px 12px;font-size:12.5px;line-height:1.7;color:var(--cg-text)}
        .cgai-vcard font{color:var(--cg-text)!important;font-weight:600}
        .cgai-vcard table{border-collapse:collapse;width:100%!important;margin-top:8px;font-size:12px}
        .cgai-vcard td{border:1px solid var(--cg-line);padding:5px 9px}
        .cgai-vcard tr:first-child td{background:var(--cg-bg-hover);font-weight:600;color:var(--cg-muted)}
        .cgai-vcard tr:not(:first-child) td:last-child{color:var(--cg-ok-fg);font-weight:500}
        #cgai-fab{position:fixed;right:22px;bottom:22px;z-index:2147483600;display:none;align-items:center;gap:7px;
            background:var(--cg-text);color:#fff;border-radius:999px;padding:10px 16px;font-weight:600;font-size:13px;
            font-family:var(--cg-font);cursor:pointer;box-shadow:var(--cg-shadow);transition:.15s}
        #cgai-fab:hover{transform:translateY(-1px)}
        .cgai-spin{display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-top-color:transparent;
            border-radius:50%;animation:cgaispin .7s linear infinite;vertical-align:-1px;margin-right:7px;opacity:.7}
        @keyframes cgaispin{to{transform:rotate(360deg)}}
        /* 当前模型快捷按钮 */
        .cgai-model{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border:1px solid var(--cg-line);
            border-radius:999px;background:var(--cg-bg);color:var(--cg-text);font-size:12px;font-weight:600;cursor:pointer;
            font-family:var(--cg-font);max-width:160px}
        .cgai-model:hover{background:var(--cg-bg-hover)}
        .cgai-model span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        /* 配置浮层（覆盖整个面板） */
        #cgai-config{position:absolute;inset:0;z-index:6;background:var(--cg-bg);display:none;flex-direction:column;padding:15px}
        #cgai-config.open{display:flex}
        #cgai-config .cfg-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
        #cgai-config .cfg-head b{font-size:15px;font-weight:600}
        #cgai-config .cfg-head .sub{font-size:11px;color:var(--cg-faint)}
        #cgai-config .cfg-body{flex:1;overflow:auto}
        .cgai-field{display:flex;flex-direction:column;gap:5px;margin-bottom:13px}
        .cgai-field label{font-size:12px;color:var(--cg-muted);font-weight:600}
        .cgai-field input{padding:8px 10px;border:1px solid var(--cg-line);border-radius:var(--cg-r-sm);font-size:13px;
            font-family:var(--cg-mono);background:var(--cg-bg);color:var(--cg-text);outline:none}
        .cgai-field input:focus{border-color:var(--cg-link);box-shadow:0 0 0 3px rgba(35,131,226,.14)}
        .cgai-field .hint{font-size:11px;color:var(--cg-faint);line-height:1.4}
    `);

    /* ============================ 解析 / 提取 ============================ */
    function htmlToText(html) {
        return String(html || '')
            .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<\/pre>/gi, '\n')
            .replace(/<li[^>]*>/gi, ' - ').replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
            .replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&').replace(/ /g, ' ')
            .replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }
    function extractProblem() {
        const col = document.querySelector('#cgcontainerID .col-10') || document.querySelector('.col-10') || document.body;
        const active = col.querySelector('.breadcrumb .breadcrumb-item.active');
        const title = active ? active.textContent.replace(/\s+/g, ' ').trim() : '(未取得标题)';
        const nav = col.querySelector('nav[aria-label="breadcrumb"]');
        let html = '';
        if (nav) { let n = nav.nextSibling; while (n) { if (n.nodeType === 1 && n.tagName === 'HR') break; if (n.nodeType === 1) html += n.outerHTML; else if (n.nodeType === 3) html += n.nodeValue; n = n.nextSibling; } }
        return { title, statement: htmlToText(html) };
    }
    function extractIds() {
        let problemID = '', assignID = '';
        const fr = document.getElementById('showmessageFrame');
        const src = fr ? (fr.getAttribute('src') || '') : '';
        let m = src.match(/problemID=(\d+)/); if (m) problemID = m[1];
        m = src.match(/assignID=(\d+)/); if (m) assignID = m[1];
        if (!assignID) { m = location.search.match(/assignID=(\d+)/); if (m) assignID = m[1]; }
        if (!problemID) { m = document.body.innerHTML.match(/problemID=(\d+)/); if (m) problemID = m[1]; }
        return { problemID, assignID };
    }
    // 当前页 URL 里的 assignID / proNum
    function getCur() {
        const a = (location.search.match(/assignID=(\d+)/) || [])[1] || '';
        const p = (location.search.match(/proNum=(\d+)/) || [])[1] || '';
        return { assignID: a, proNum: p };
    }
    // 本作业题目数（从页面 proNum 导航链接里取最大值）
    function discoverProNums() {
        const cur = getCur();
        let max = 0;
        document.querySelectorAll('a[href*="programList.jsp"]').forEach(a => {
            const h = a.getAttribute('href') || '';
            const ma = h.match(/assignID=(\d+)/), mp = h.match(/proNum=(\d+)/);
            if (mp && (!ma || ma[1] === cur.assignID)) max = Math.max(max, +mp[1]);
        });
        return Math.max(max, +cur.proNum || 1);
    }
    // 作业列表（从页面作业切换链接 index.jsp?assignID= 取，按 DOM 顺序去重）
    function discoverAssignList() {
        const seen = new Set(), list = [];
        document.querySelectorAll('a[href*="index.jsp"]').forEach(a => {
            const m = (a.getAttribute('href') || '').match(/assignID=(\d+)/);
            if (m && !seen.has(m[1])) { seen.add(m[1]); list.push(m[1]); }
        });
        return list;
    }
    // 从 mainActiveAssigns.jsp 拉作业列表（在非题目页 kickoff 时用）
    function fetchAssignList() {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET', url: `${OJ}/assignment/mainActiveAssigns.jsp`, responseType: 'arraybuffer', timeout: 15000,
                onload: r => {
                    let txt = ''; try { txt = new TextDecoder('gbk').decode(new Uint8Array(r.response)); } catch (_) {}
                    const seen = new Set(), list = [], re = /assignID=(\d+)/g; let m;
                    while ((m = re.exec(txt))) if (!seen.has(m[1])) { seen.add(m[1]); list.push(m[1]); }
                    resolve(list);
                },
                onerror: () => resolve([]), ontimeout: () => resolve([]),
            });
        });
    }
    function parseJavaCode(content) { const m = String(content || '').match(/```(?:java)?\s*([\s\S]*?)```/i); return (m ? m[1] : content || '').trim(); }
    function detectMainClass(code) { let m = code.match(/public\s+class\s+([A-Za-z_]\w*)/) || code.match(/\bclass\s+([A-Za-z_]\w*)/); return m ? m[1] : 'Main'; }
    function scoreOf(contentHtml) {
        const txt = htmlToText(contentHtml || '');
        const passed = (txt.match(/完全正确/g) || []).length;
        const tm = txt.match(/共有测试数据[:：]\s*(\d+)/); const total = tm ? +tm[1] : 0;
        const sm = txt.match(/得分\s*([\d.]+)/); const score = sm ? sm[1] : null;
        return { passed, total, score };
    }

    /* ============================ DeepSeek ============================ */
    function buildMessages(problem) {
        const sys = [
            'You are an expert solver for a Chinese university Java online judge (CourseGrading/educg).',
            'You will be given a programming problem in Chinese. Produce ONE complete, compilable Java program',
            'that reads from standard input and writes to standard output, matching the required output format',
            'EXACTLY as shown in the sample (including every space, blank line, and trailing whitespace).',
            '', 'Strict rules:',
            '1. Output ONLY a single fenced ```java code block. No prose before or after.',
            '2. The program MUST contain `public class Main` with `public static void main(String[] args)`.',
            '   Any helper classes must be top-level NON-public (no `public`) or nested inside Main.',
            '3. Do NOT use any `package` declaration.',
            '4. ASCII only: no Chinese characters or non-ASCII anywhere in the code unless the sample output requires them.',
            '5. Read all of stdin until EOF. Reproduce the sample output byte-for-byte.',
            '6. Only the Java standard library. Handle edge cases (empty input, extra whitespace).',
        ].join('\n');
        const user = `【题目标题】${problem.title}\n\n【题目内容】\n${problem.statement}\n\n请给出完整 Java 解法。`;
        return [{ role: 'system', content: sys }, { role: 'user', content: user }];
    }
    function callDeepSeek(problem, opts, apiKey) {
        const baseURL = getBaseURL();
        const payload = {
            model: opts.model, messages: buildMessages(problem), stream: false,
            temperature: opts.temperature ?? 0, max_tokens: 8192,
        };
        // thinking 是 DeepSeek 专有参数；其他 OpenAI 兼容端点不发，避免 400
        if (/deepseek/i.test(baseURL)) payload.thinking = { type: opts.thinking ? 'enabled' : 'disabled' };
        const body = JSON.stringify(payload);
        const host = baseURL.replace(/^https?:\/\//, '');
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST', url: baseURL + '/chat/completions', data: body, responseType: 'text', timeout: 120000,
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                onload: r => {
                    if (r.status === 401) return reject(new Error('API Key 无效 (401)，请到配置页检查'));
                    if (r.status === 0) return reject(new Error(`连不上 ${host}（浏览器是否能访问该 API？脚本猫是否已允许跨域连接？）`));
                    if (r.status !== 200) return reject(new Error(`API ${r.status}: ` + (r.responseText || '').slice(0, 160)));
                    let d; try { d = JSON.parse(r.responseText); } catch (e) { return reject(new Error('无法解析响应')); }
                    const c = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
                    if (!c) return reject(new Error('返回内容为空（max_tokens 不足或思考耗尽）'));
                    resolve(c);
                },
                onerror: r => reject(new Error(`连不上 ${host}（浏览器无法访问该 API，或脚本猫未授权跨域；status=${r && r.status}）`)),
                ontimeout: () => reject(new Error(`请求 ${host} 超时(120s)——多半是浏览器无法访问外网 API`)),
            });
        });
    }

    /* ============================ 提交 / 判题 ============================ */
    function fillAndSubmit(code, mainClass) {
        const fileInput = document.getElementById('CGFILE');
        const mainEl = document.getElementById('javamanclass');
        const btn = document.getElementById('cgSubmitBtn');
        const form = document.querySelector('form[name="upload"]');
        if (!fileInput || !btn || !form) throw new Error('未找到页面提交表单');
        if (mainEl) mainEl.value = mainClass;
        const dt = new DataTransfer();
        dt.items.add(new File([code], mainClass + '.java', { type: 'text/x-java' }));
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof form.requestSubmit === 'function') form.requestSubmit(btn); else btn.click();
    }
    function fillOnly(code, mainClass) {
        const fileInput = document.getElementById('CGFILE'), mainEl = document.getElementById('javamanclass');
        if (mainEl) mainEl.value = mainClass;
        if (fileInput) { const dt = new DataTransfer(); dt.items.add(new File([code], mainClass + '.java', { type: 'text/x-java' })); fileInput.files = dt.files; fileInput.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    function fetchVerdict(assignID, problemID) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url: `${OJ}/assignment/longtimerunJSON.jsp?assignID=${assignID}&problemID=${problemID}&_=${Date.now()}`,
                responseType: 'arraybuffer', timeout: 20000,
                onload: r => { try { resolve(new TextDecoder('gbk').decode(new Uint8Array(r.response))); } catch (e) { resolve(''); } },
                onerror: () => reject(new Error('获取判题结果失败')), ontimeout: () => reject(new Error('获取判题结果超时')),
            });
        });
    }
    function parseVerdict(text) {
        if (!text) return null;
        const s = text.indexOf('['), e = text.lastIndexOf(']'); if (s < 0 || e < 0) return null;
        let arr; try { arr = JSON.parse(text.slice(s, e + 1)); } catch (_) { return null; }
        return { ret: (arr.find(o => 'ret' in o) || {}).ret, content: (arr.find(o => 'content' in o) || {}).content || '' };
    }
    async function pollVerdict(assignID, problemID, baseline) {
        const deadline = Date.now() + 100000;
        await sleep(1500);
        let last = null;
        while (Date.now() < deadline) {
            let text = ''; try { text = await fetchVerdict(assignID, problemID); } catch (_) {}
            const v = parseVerdict(text);
            if (v && v.content && !/正在评判|排队|评判中|judging/i.test(v.content)) {
                // 若有 baseline（提交前的内容），要求与之不同，确认是新结果
                if (!baseline || v.content !== baseline) { last = v; if (v.ret === '1') return v; }
            }
            await sleep(2000);
        }
        return last;
    }

    /* ============================ 解一题（含多版本重试） ============================ */
    function ladderFor(s) {
        const strong = s.strongModel || s.model;
        const L = [{ model: s.model, thinking: s.thinking, temperature: 0 }];
        if (s.maxAttempts >= 2) L.push({ model: s.model, thinking: true, temperature: 0.5 });
        if (s.maxAttempts >= 3) L.push({ model: strong, thinking: true, temperature: 0 });
        for (let i = L.length; i < s.maxAttempts; i++) L.push({ model: strong, thinking: true, temperature: 0.3 + 0.15 * i });
        return L.slice(0, Math.max(1, s.maxAttempts));
    }
    // 解当前页这道题，返回最佳结果 {ok,score,passed,total,code,mainClass,attempt,verdict}
    async function solveCurrent(problem, ids, s, onAttempt) {
        const apiKey = getKey();
        const ladder = ladderFor(s);
        let best = null, baseline = null;
        try { baseline = (parseVerdict(await fetchVerdict(ids.assignID, ids.problemID)) || {}).content || null; } catch (_) {}
        for (let i = 0; i < ladder.length; i++) {
            const opt = ladder[i];
            onAttempt && onAttempt(i + 1, ladder.length, opt);
            let res;
            try {
                const code = parseJavaCode(await callDeepSeek(problem, opt, apiKey));
                const mainClass = detectMainClass(code);
                if (!/class\s+\w+/.test(code)) throw new Error('生成结果不是有效 Java');
                fillAndSubmit(code, mainClass);
                const v = await pollVerdict(ids.assignID, ids.problemID, baseline);
                const sc = scoreOf(v && v.content || '');
                baseline = (v && v.content) || baseline;
                res = { ok: sc.total > 0 && sc.passed === sc.total, ...sc, code, mainClass, verdict: v, attempt: i + 1 };
            } catch (e) {
                res = { ok: false, error: e.message, passed: 0, total: 0, score: null, attempt: i + 1 };
            }
            if (!best || (res.passed || 0) > (best.passed || 0)) best = res;
            if (res.ok) { best = res; break; }
        }
        return best || { ok: false, passed: 0, total: 0, error: '无结果' };
    }

    /* ============================ UI ============================ */
    let panel, fab, statusEl, titleEl, codeWrap, verdictEl, grindEl, btnSolve, btnGrind, busy = false;

    let _tick = null;
    function setStatus(text, kind, spin) { if (_tick) { clearInterval(_tick); _tick = null; } statusEl.className = kind || ''; statusEl.innerHTML = (spin ? '<span class="cgai-spin"></span>' : '') + text; }
    // 带「已用时 Ns」实时计时的忙碌状态——避免看起来像卡死
    function tickStatus(prefix, kind) {
        if (_tick) clearInterval(_tick);
        const t0 = Date.now();
        const render = () => { const s = Math.round((Date.now() - t0) / 1000); statusEl.className = kind || 'busy'; statusEl.innerHTML = '<span class="cgai-spin"></span>' + prefix + `（已用时 ${s}s）`; };
        render(); _tick = setInterval(render, 1000);
    }
    function showVerdictCard(html) { verdictEl.innerHTML = html ? '<div class="cgai-vcard">' + html + '</div>' : ''; }
    function verdictBadge(r) {
        if (r.skipped) return ICON.skip + '已满分，跳过';
        if (r.ok) return ICON.ok + `满分 · ${r.passed}/${r.total}` + (r.score ? ` · 得分 ${r.score}` : '');
        if ((r.passed || 0) > 0) return ICON.warn + `部分通过 ${r.passed}/${r.total}` + (r.score ? ` · 得分 ${r.score}` : '');
        return ICON.err + (r.error ? '失败：' + r.error : '未通过');
    }

    /* ---- 单题：解本题 ---- */
    async function runSolveCurrent() {
        if (busy) return; busy = true;
        verdictEl.innerHTML = ''; codeWrap.style.display = 'none';
        try {
            btnSolve.disabled = true; btnGrind.disabled = true;
            if (!ensureConfig()) return; const apiKey = getKey();
            const s = settings();
            setStatus('正在提取题目…', 'busy', true);
            const problem = extractProblem(), ids = extractIds();
            titleEl.innerHTML = ICON.file + '<span>' + esc(problem.title) + '</span>';
            if (!problem.statement || problem.statement.length < 5) { setStatus('未能提取题面，请确认在编程题页面。', 'err'); return; }
            if (!ids.problemID || !ids.assignID) { setStatus('未能解析 problemID/assignID。', 'err'); return; }

            if (!s.autoSubmit) {
                tickStatus(`正在调用 ${s.model} 生成代码…`);
                const code = parseJavaCode(await callDeepSeek(problem, { model: s.model, thinking: s.thinking, temperature: 0 }, apiKey));
                const mc = detectMainClass(code); fillOnly(code, mc);
                codeWrap.querySelector('.cgai-code').textContent = code;
                codeWrap.querySelector('summary').textContent = `生成代码 · 主类 ${mc}`; codeWrap.style.display = 'block';
                setStatus(`代码已生成并填入表单（主类 ${mc}）。已关闭自动提交——请检查后手动点"提 交"。`, 'ok'); return;
            }
            const r = await solveCurrent(problem, ids, s, (i, n, opt) =>
                tickStatus(`第 ${i}/${n} 版：${opt.model}${opt.thinking ? '·思考' : ''} 生成并提交中…`));
            if (r.code) { codeWrap.querySelector('.cgai-code').textContent = r.code; codeWrap.querySelector('summary').textContent = `生成代码 · 主类 ${r.mainClass} · 第 ${r.attempt} 版`; codeWrap.style.display = 'block'; }
            setStatus(verdictBadge(r), r.ok ? 'ok' : ((r.passed || 0) > 0 ? 'busy' : 'err'));
            showVerdictCard(r.verdict && r.verdict.content);
        } catch (e) { setStatus('出错：' + (e.message || e), 'err'); }
        finally { busy = false; btnSolve.disabled = !isProblemPage(); btnGrind.disabled = false; }
    }

    /* ---- 开刷：跨页状态机 ---- */
    async function startGrind() {
        if (!ensureConfig()) return;
        setStatus('正在准备作业列表…', 'busy', true);
        let assignList = isProblemPage() ? discoverAssignList() : [];
        if (!assignList.length) assignList = await fetchAssignList();
        if (!assignList.length) { setStatus('未能获取作业列表。请在某道题目页再试。', 'err'); return; }
        setGrind({ active: true, assignList, done: {}, navs: 0, startedAt: Date.now(), settings: settings() });
        navProblem(assignList[0], 1);
    }
    function stopGrind() { const g = getGrind(); if (g) { g.active = false; setGrind(g); } renderGrind(); setStatus('已停止开刷。', ''); refreshButtons(); }
    function navProblem(assignID, proNum) { location.assign(`/assignment/programList.jsp?proNum=${proNum}&assignID=${assignID}`); }
    function computeNext(assignList, cur, maxP) {
        const p = +cur.proNum;
        if (p < maxP) return { assignID: cur.assignID, proNum: p + 1 };
        const i = assignList.indexOf(cur.assignID);
        if (i >= 0 && i + 1 < assignList.length) return { assignID: assignList[i + 1], proNum: 1 };
        return null;
    }
    function gkey(a, p) { return a + ':' + p; }
    function renderGrind() {
        const g = getGrind(); if (!g) { grindEl.innerHTML = ''; return; }
        const cur = getCur(); const entries = Object.entries(g.done);
        const total = entries.length;
        const full = entries.filter(([, r]) => r.ok || r.skipped).length;
        let rows = '';
        for (const [k, r] of entries) {
            const cls = r.skipped ? 'skip' : (r.ok ? 'ok' : ((r.passed || 0) > 0 ? 'fail' : 'fail'));
            const ic = r.skipped ? ICON.skip : (r.ok ? ICON.ok : ((r.passed || 0) > 0 ? ICON.warn : ICON.err));
            const sc = r.skipped ? '跳过' : (r.total ? `${r.passed}/${r.total}` : (r.error ? '失败' : '—'));
            rows += `<div class="cgai-grow ${cls}"><span>${ic}</span><span class="gk">${esc(k)}</span><span class="gt">${esc(r.title || '')}</span><span class="gs">${sc}</span></div>`;
        }
        if (g.active && cur.assignID && cur.proNum && !g.done[gkey(cur.assignID, cur.proNum)]) {
            rows += `<div class="cgai-grow cur"><span class="cgai-spin"></span><span class="gk">${esc(cur.assignID + ':' + cur.proNum)}</span><span class="gt">处理中…</span><span class="gs"></span></div>`;
        }
        grindEl.innerHTML = `<div class="cgai-ghead"><span>${g.active ? '开刷进行中' : '开刷已停止'} · 作业 ${g.assignList.join('/')}</span><span>满分 ${full}/${total}</span></div><div class="cgai-glist">${rows}</div>`;
    }
    async function grindStep() {
        const g = getGrind(); if (!g || !g.active) return;
        if (busy) return; busy = true; refreshButtons();
        try {
            const cur = getCur();
            if (!cur.assignID || !cur.proNum) return;
            const k = gkey(cur.assignID, cur.proNum);
            const s = g.settings || settings();
            const problem = extractProblem(), ids = extractIds();
            titleEl.innerHTML = ICON.file + '<span>' + esc(problem.title) + '</span>';

            if (!g.done[k]) {
                let r;
                // 跳过已满分
                if (s.skipPassed) {
                    let pv = null; try { pv = parseVerdict(await fetchVerdict(ids.assignID, ids.problemID)); } catch (_) {}
                    const sc = scoreOf(pv && pv.content || '');
                    if (sc.total > 0 && sc.passed === sc.total) r = { skipped: true, ...sc, title: problem.title };
                }
                if (!r) {
                    renderGrind();
                    const res = await solveCurrent(problem, ids, s, (i, n, opt) =>
                        tickStatus(`开刷 ${k}：第 ${i}/${n} 版（${opt.model}${opt.thinking ? '·思考' : ''}）…`));
                    r = { ok: res.ok, passed: res.passed, total: res.total, score: res.score, error: res.error, attempt: res.attempt, title: problem.title };
                    if (res.verdict) showVerdictCard(res.verdict.content);
                }
                g.done[k] = r; setGrind(g); renderGrind();
            }
            // 下一题
            const maxP = discoverProNums();
            const next = computeNext(g.assignList, cur, maxP);
            g.navs = (g.navs || 0) + 1;
            if (next && g.navs < 80) {
                setGrind(g);
                let left = 3; setStatus(`${k} 完成。${left}s 后跳转 ${next.assignID}:${next.proNum}…`, 'busy');
                const timer = setInterval(() => {
                    const gg = getGrind(); if (!gg || !gg.active) { clearInterval(timer); return; }
                    left--; if (left <= 0) { clearInterval(timer); navProblem(next.assignID, next.proNum); }
                    else setStatus(`${k} 完成。${left}s 后跳转 ${next.assignID}:${next.proNum}…（点"停止开刷"可中断）`, 'busy');
                }, 1000);
            } else {
                g.active = false; setGrind(g); renderGrind();
                const full = Object.values(g.done).filter(r => r.ok || r.skipped).length;
                setStatus(ICON.ok + `开刷完成！满分 ${full}/${Object.keys(g.done).length} 题。`, 'ok');
            }
        } catch (e) { setStatus('开刷出错：' + (e.message || e), 'err'); }
        finally { busy = false; refreshButtons(); }
    }

    function refreshButtons() {
        const g = getGrind(); const grinding = !!(g && g.active);
        btnSolve.disabled = busy || !isProblemPage();
        if (grinding) { btnGrind.className = 'cgai-btn cgai-btn-danger'; btnGrind.innerHTML = ICON.stop + '<span>停止开刷</span>'; btnGrind.onclick = stopGrind; btnGrind.disabled = false; }
        else { btnGrind.className = 'cgai-btn cgai-btn-ghost'; btnGrind.innerHTML = ICON.grind + '<span>一键开刷全部</span>'; btnGrind.onclick = startGrind; btnGrind.disabled = busy; }
    }

    function buildPanel() {
        panel = document.createElement('div'); panel.id = 'cgai-panel';
        panel.innerHTML = `
            <div id="cgai-head">
                <div class="cgai-brand"><span class="cgai-badge">${ICON.brand}</span>
                    <span class="cgai-titles"><b>CG AI 解题</b><i>DeepSeek 自动解题 · 开刷</i></span></div>
                <span class="cgai-tools"><span class="cgai-ic" id="cgai-cfg" title="设置 API Key">${ICON.settings}</span>
                    <span class="cgai-ic" id="cgai-min" title="收起">${ICON.minus}</span></span>
            </div>
            <div id="cgai-body">
                <div class="cgai-settings">
                    <button class="cgai-model" id="cgai-modelbtn" title="打开配置（Base URL / Key / 模型）">${ICON.settings}<span id="cgai-modeltxt">模型</span></button>
                    <label class="cgai-chk"><input type="checkbox" id="cgai-think"> 思考模式</label>
                    <label class="cgai-chk"><input type="checkbox" id="cgai-auto"> 自动提交</label>
                    <label class="cgai-chk"><input type="checkbox" id="cgai-skip"> 跳过已满分</label>
                    <label class="f">重试版本 <input type="number" id="cgai-att" min="1" max="5"></label>
                </div>
                <div class="cgai-btns">
                    <button class="cgai-btn cgai-btn-primary" id="cgai-solve">${ICON.run}<span>解本题</span></button>
                    <button class="cgai-btn cgai-btn-ghost" id="cgai-grindbtn">${ICON.grind}<span>一键开刷全部</span></button>
                </div>
                <div id="cgai-title"></div>
                <div id="cgai-status"></div>
                <div id="cgai-grind"></div>
                <details class="cgai-sec" id="cgai-codewrap" style="display:none"><summary>生成代码</summary><pre class="cgai-code"></pre></details>
                <div id="cgai-verdict"></div>
            </div>
            <div id="cgai-config">
                <div class="cfg-head"><div><b>配置</b> <span class="sub">OpenAI 兼容</span></div>
                    <span class="cgai-ic" id="cfg-x" title="关闭">${ICON.minus}</span></div>
                <div class="cfg-body">
                    <div class="cgai-field"><label>API Base URL</label>
                        <input id="cfg-base" type="text" spellcheck="false" placeholder="https://api.deepseek.com">
                        <span class="hint">会调用 &lt;BaseURL&gt;/chat/completions。换成其他 OpenAI 兼容服务即可（DeepSeek 时才发送 thinking 参数）。</span></div>
                    <div class="cgai-field"><label>API Key</label>
                        <input id="cfg-key" type="password" spellcheck="false" placeholder="sk-..."></div>
                    <div class="cgai-field"><label>主模型</label>
                        <input id="cfg-model" type="text" list="cgai-models" spellcheck="false" placeholder="deepseek-v4-flash"></div>
                    <div class="cgai-field"><label>重试强模型（可选，失败时升级用）</label>
                        <input id="cfg-strong" type="text" list="cgai-models" spellcheck="false" placeholder="deepseek-v4-pro"></div>
                    <datalist id="cgai-models"></datalist>
                </div>
                <div class="cgai-btns"><button class="cgai-btn cgai-btn-primary" id="cfg-save">保存</button>
                    <button class="cgai-btn cgai-btn-ghost" id="cfg-cancel">取消</button></div>
            </div>`;
        document.body.appendChild(panel);
        fab = document.createElement('div'); fab.id = 'cgai-fab'; fab.innerHTML = ICON.brand + '<span>AI 解题</span>'; document.body.appendChild(fab);

        statusEl = panel.querySelector('#cgai-status'); titleEl = panel.querySelector('#cgai-title');
        codeWrap = panel.querySelector('#cgai-codewrap'); verdictEl = panel.querySelector('#cgai-verdict');
        grindEl = panel.querySelector('#cgai-grind'); btnSolve = panel.querySelector('#cgai-solve'); btnGrind = panel.querySelector('#cgai-grindbtn');

        const s = settings();
        const think = panel.querySelector('#cgai-think'); think.checked = s.thinking;
        const auto = panel.querySelector('#cgai-auto'); auto.checked = s.autoSubmit;
        const skip = panel.querySelector('#cgai-skip'); skip.checked = s.skipPassed;
        const att = panel.querySelector('#cgai-att'); att.value = s.maxAttempts;
        think.onchange = () => GM_setValue(STORE.THINKING, think.checked);
        auto.onchange = () => GM_setValue(STORE.AUTO_SUBMIT, auto.checked);
        skip.onchange = () => GM_setValue(STORE.SKIP_PASSED, skip.checked);
        att.onchange = () => GM_setValue(STORE.MAX_ATTEMPTS, Math.min(5, Math.max(1, +att.value || 3)));
        const dl = panel.querySelector('#cgai-models'); MODEL_SUGGEST.forEach(m => { const o = document.createElement('option'); o.value = m; dl.appendChild(o); });
        updateModelTxt();
        btnSolve.onclick = runSolveCurrent;
        panel.querySelector('#cgai-cfg').onclick = openConfig;
        panel.querySelector('#cgai-modelbtn').onclick = openConfig;
        panel.querySelector('#cfg-x').onclick = closeConfig;
        panel.querySelector('#cfg-cancel').onclick = closeConfig;
        panel.querySelector('#cfg-save').onclick = saveConfig;
        panel.querySelector('#cgai-min').onclick = () => { panel.style.display = 'none'; fab.style.display = 'flex'; };
        fab.onclick = () => { panel.style.display = 'flex'; fab.style.display = 'none'; };
        makeDraggable(panel, panel.querySelector('#cgai-head'));

        refreshButtons(); renderGrind();
        if (!isProblemPage()) setStatus('进入编程题页面可"解本题"；任意页可"一键开刷全部"。', '');
        else setStatus('就绪。点"解本题"或"一键开刷全部"。', '');
    }
    function updateModelTxt() { const t = panel && panel.querySelector('#cgai-modeltxt'); if (t) t.textContent = settings().model || '设置模型'; }
    function openConfig() {
        panel.querySelector('#cfg-base').value = getBaseURL();
        panel.querySelector('#cfg-key').value = getKey();
        panel.querySelector('#cfg-model').value = settings().model;
        panel.querySelector('#cfg-strong').value = settings().strongModel;
        panel.querySelector('#cgai-config').classList.add('open');
        setTimeout(() => panel.querySelector(getKey() ? '#cfg-base' : '#cfg-key').focus(), 30);
    }
    function closeConfig() { panel.querySelector('#cgai-config').classList.remove('open'); }
    function saveConfig() {
        const base = panel.querySelector('#cfg-base').value.trim().replace(/\/+$/, '') || DEFAULTS.baseURL;
        GM_setValue(STORE.BASE_URL, base);
        GM_setValue(STORE.KEY, panel.querySelector('#cfg-key').value.trim());
        GM_setValue(STORE.MODEL, panel.querySelector('#cfg-model').value.trim() || DEFAULTS.model);
        GM_setValue(STORE.STRONG_MODEL, panel.querySelector('#cfg-strong').value.trim());
        updateModelTxt(); closeConfig(); setStatus('配置已保存。', 'ok');
    }
    // 未填 Key 时打开配置页（取代浏览器 prompt 弹窗）
    function ensureConfig() { if (getKey()) return true; openConfig(); setStatus('请先在配置页填写 API Key 再使用。', 'busy'); return false; }
    function makeDraggable(el, handle) {
        let sx, sy, ox, oy, drag = false;
        handle.addEventListener('mousedown', e => { drag = true; sx = e.clientX; sy = e.clientY; const r = el.getBoundingClientRect(); ox = r.left; oy = r.top; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.left = ox + 'px'; el.style.top = oy + 'px'; e.preventDefault(); });
        document.addEventListener('mousemove', e => { if (!drag) return; el.style.left = (ox + e.clientX - sx) + 'px'; el.style.top = (oy + e.clientY - sy) + 'px'; });
        document.addEventListener('mouseup', () => drag = false);
    }

    /* ============================ 菜单 ============================ */
    GM_registerMenuCommand('配置 (Base URL / API Key / 模型)', () => { if (panel) openConfig(); });
    GM_registerMenuCommand('停止开刷 / 清除进度', () => { clearGrind(); if (grindEl) renderGrind(); if (statusEl) setStatus('已清除开刷进度。', ''); refreshButtons && refreshButtons(); });

    /* ============================ 测试钩子（生产无副作用） ============================ */
    if (typeof window !== 'undefined' && window.__CGAI_EXPOSE__) {
        window.__CGAI_API__ = { htmlToText, extractProblem, extractIds, getCur, discoverProNums, discoverAssignList, parseJavaCode, detectMainClass, parseVerdict, scoreOf, buildMessages, computeNext, ladderFor };
    }

    /* ============================ 启动 ============================ */
    function boot() {
        buildPanel();
        const g = getGrind();
        if (g && g.active && isProblemPage()) setTimeout(grindStep, 1200);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
