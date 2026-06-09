    // 把空白可视化，让模型能看清「格式/对齐/行尾空格/末尾换行」这类肉眼不可见的差异
    function visWs(s) {
        return String(s == null ? '' : s).replace(/ /g, '·').replace(/\t/g, '⇥').replace(/\r/g, '␍').replace(/\n/g, '⏎\n');
    }
    function feedbackFromHtml(html) {
        if (!html) return '';
        let doc; try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (_) { return ''; }
        const txt = (doc.body && doc.body.textContent) || '';
        if (/编译错误|编译失败|compile error/i.test(txt) && !/成功通过编译/.test(txt)) {
            const seg = (txt.match(/编译[\s\S]{0,600}/) || [''])[0];
            return '上次提交【编译错误】：\n' + seg.trim().slice(0, 800) + '\n请修正使其能通过编译后重新输出完整答案。';
        }
        const NB = String.fromCharCode(160);
        const cases = []; let anyFmt = false;
        doc.querySelectorAll('pre[id^="wrongContent"]').forEach(w => {
            if (cases.length >= 6) return;
            const n = (w.id.match(/wrongContent(\d+)/) || [])[1];
            const r = doc.getElementById('rightContent' + n);
            const wrong = (w.textContent || '').split(NB).join(' ');
            const right = (r ? r.textContent : '').split(NB).join(' ');
            if (right === wrong) return; // 完全一致=该测试点已通过，跳过（不再用 trim 比较，否则会漏掉纯行尾空白差异）
            const fmtOnly = right.replace(/\s+/g, '') === wrong.replace(/\s+/g, '');
            if (fmtOnly) anyFmt = true;
            cases.push(`【测试点${n}】${fmtOnly ? '（内容相同，仅空白/格式不同！注意对齐方式与行尾空白）' : ''}\n期望输出:\n${visWs(right).slice(0, 700)}\n你的输出:\n${visWs(wrong).slice(0, 700)}`);
        });
        if (!cases.length) {
            if (/运行错误|超时|超时限制|段错误|runtime error|time limit/i.test(txt)) {
                const seg = (txt.match(/(运行错误|超时|段错误|内存)[\s\S]{0,300}/) || [''])[0];
                return '上次提交【运行/超时错误】：\n' + seg.trim().slice(0, 500) + '\n请修正后重新输出完整答案。';
            }
            return '上次提交未通过，但未取到具体差异。请重新审视题意与输出格式（注意空格/换行/精度）后再试。';
        }
        return `上次提交未通过。下面是各失败测试点「期望输出」对比「你的实际输出」，已把空白可视化：· =空格，⇥=制表符，⏎=每行行尾（看不到测试输入）：\n\n${cases.join('\n\n')}\n\n请严格逐字符对齐格式：每行的空格数与对齐方式（左/右对齐、字段宽度）、行尾是否有多余空格、空行、以及最后一行是否带换行，都必须与期望完全一致。${anyFmt ? '本题内容已正确，纯属格式/空白问题——务必精确复刻期望的空白布局（注意是右对齐还是左对齐、字段宽度、不要多余行尾空格、末尾换行有无）。' : ''}（· ⇥ ⏎ 只是可视标记，请输出真实的空格/制表符/换行，不要输出这些符号本身。）`;
    }
