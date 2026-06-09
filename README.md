# CourseGrading AI 自动解题助手（脚本猫 / 油猴脚本）

在内网 **CourseGrading (educg)** 判题平台的编程题页面，一键完成：
**提取完整题目 → DeepSeek 生成 Java → 自动填表上传 → 轮询并显示判题结果**。

UI 设计语言参照 [Aurash](../Aurash/) 的 Notion 风格 token 体系（暖白底、近黑文字、细描边、克制配色、6/8/12 圆角、lucide 线性图标）。

![面板预览](docs/screenshot.png)

> 已在真实平台端到端验证：problem 1444「数值变换」由 DeepSeek 生成、自动提交，得分 **20.00 / 5 个测试点全部「完全正确」**。

## 文件

| 文件 | 说明 |
|---|---|
| `cg-ai-solver.user.js` | **主交付物**：脚本猫 / Tampermonkey 用户脚本 |
| `preview-gen.mjs` | 从脚本抽取 CSS 生成预览页（`node preview-gen.mjs` → `preview.html`），纯 node 可独立运行 |
| `test-extract.mjs` | jsdom 离线单测（19 项，校验 DOM 提取 / 判题解析） |
| `gen.mjs` / `e2e.sh` | 端到端验证（jsdom 提取 + 真实 DeepSeek + 真实提交） |

> 开发脚本（`test-extract.mjs` / `gen.mjs` / `e2e.sh`）依赖 WSL 本地抓取的页面/判题 fixtures，且凭据从环境变量读取（`CG_USER` / `CG_PASS`），**仓库内不含任何账号或 API Key**。

## 安装

1. 浏览器装 **脚本猫 (ScriptCat)** 或 Tampermonkey 扩展（用能访问该内网的那个浏览器）。
2. 新建脚本，把 `cg-ai-solver.user.js` 全部内容粘进去，保存。
3. 打开任意一道编程题页面 `…/assignment/programList.jsp?proNum=N&assignID=XX`，右下角出现 **CG AI 解题** 面板。

## 使用

1. 首次点「一键解题并提交」会弹窗要求输入 **DeepSeek API Key**（`sk-` 开头），保存到脚本本地存储。之后可在面板设置图标或脚本菜单里修改。
2. 面板可选模型（`deepseek-v4-pro` 推荐 / `deepseek-v4-flash` 更快）。
3. 勾选「生成后自动提交」= 全自动；取消勾选 = 只生成并填好表单，由你检查后手动点页面「提 交」。
4. 点按钮后：提取题目 → 调用 DeepSeek（推理模型约 10–40 秒）→ 自动提交 → 显示得分与每个测试点结果。

## 工作原理（已验证的接口契约）

- **题目提取**：从页面 DOM `.col-10` 内、面包屑与第一个 `<hr>` 之间取标题+题面；`problemID` 取自 `#showmessageFrame` 的 `src`。
- **生成**：`POST https://api.deepseek.com/chat/completions`，`max_tokens=8192`（v4 是推理模型，token 不足会导致 `content` 为空），`temperature=0`，要求只输出一个 ```java 代码块、`public class Main`、无 package、纯 ASCII。
- **提交**：用 `DataTransfer` 把生成代码写入页面真实文件框 `#CGFILE`，填 `#javamanclass`（主类名），点 `#cgSubmitBtn` —— 复用页面原生 `filesubmit()`（自动带 `wtime`、cookie、Referer，multipart 上传 `FILE1` 到 `showProcessMsg.jsp?...&doSubmit=true&progLanguage=java&javaMainCLass=<Main>`）。
- **判题**：轮询 `GET longtimerunJSON.jsp?assignID&problemID` → `[{"ret":"1"},{"content":"...得分..完全正确.."}]`（GBK，脚本用 `TextDecoder('gbk')` 解码）。

## 限制 / 注意

- 仅适配 Java 课程（平台锁定 `progLanguage=java`）。
- 题面纯文本提取，**图片描述**的题目模型看不到。
- 生成代码强制 **ASCII**；若某题要求输出中文，需手动处理（文件按 UTF-8 上传）。
- 一次没过可再点一次（temperature=0，可换 pro/flash 重试或人工微调）。
- API Key 仅存于脚本猫本地存储，只发往 DeepSeek 官方域名。
