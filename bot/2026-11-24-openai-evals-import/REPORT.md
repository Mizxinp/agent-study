# OpenAI Evals 仪表盘 JSONL 导入对照

在 Node `v24.22.1`、pnpm `10.34.6` 下，用本地安装的 Promptfoo `0.126.0` 实际导入冻结夹具、从本地数据库导出，再和读取同一文件的独立 TypeScript 结果比较。四份有效夹具在核对字段上全部一致。实验数据来自随仓库保存的文件，运行未调用模型或 OpenAI Evals API。

## 夹具与源码

上游只读克隆根目录为 `/home/box/personal/sourceCode/promptfoo`，源码提交为 `aa4e2c6baa89f616bb361459a0410f330e16f7c7`。以下文件逐字节复制到本目录的 `fixtures/`，原件与副本的 SHA-256 相同。

| 上游相对路径 | SHA-256 |
| --- | --- |
| `test/__fixtures__/openai-evals-items.jsonl` | `4aa07a80b19f0a04b1a65675fd84b8b215686e25a16064b6377d794a9d2c892e` |
| `test/__fixtures__/openai-evals-multi-run-items.jsonl` | `5918775cd1533d58c2ce084740402ccde07d76a6fdccc604e91849022de7061c` |

另外构造了 score-only、对齐、非法行和模拟 API 列表四份夹具。独立实现对照仓库的 `src/importers/openaiEvals/{validation,convert}.ts`、`src/importers/parse.ts` 和 `src/types/results.ts`。行通过取所有 `passes` 的 AND，有判定时行评分为通过组件数除以组件总数。组件分为 0 或 1，原始 grade 作为评分数值存入 `namedScores`，原始行也保留该值。对齐键由 `data_source_idx` 和递归排序对象键后序列化所得的 SHA-256 组成，保留数组元素顺序。单 run 的 ID 后缀替换非法字符为下划线，多 run 将唯一 run ID 排序、用换行连接，再截取 SHA-256 前 24 位。

对照覆盖 eval ID、描述、配置测试及导入元数据、列的 prompt/provider 和测试及断言计数，以及行索引、状态、分数、原因、错误文本、组件和完整的原始行。比较时按列和测试索引排列结果。时间戳、令牌计数、成本和完整 provider response 不在比较范围内。独立脚本专门验证仪表盘 JSONL，CLI 另有整文件 JSON 格式分流。

## H1–H6

计数顺序为 `testPassCount / testFailCount / testErrorCount / assertPassCount / assertFailCount`。

| 假设 | 实测与结论 |
| --- | --- |
| H1 | 证实。ID 为 `openai-evals-evalrun_import_fixture`，描述为 `Imported from OpenAI Evals run evalrun_import_fixture`，`config.metadata.openaiEvalsImport.format` 为 `dashboard-output-items-jsonl`。计数 **1 / 1 / 0 / 5 / 1**。通过行的 `namedScores.Relevance=6`，对应组件分 **1**。失败行的 `failureReason=ASSERT (1)`，理由为 `Imported OpenAI eval graders failed: Relevance.`，行分 **2/3**。两行的 `metadata.openai.outputItem` 均与输入对象深度相等。 |
| H2 | 证实。仅有 `grades.Quality=0.5`，无 `passes`。行 `success=true`，`gradingResult.pass=true`，两级 score 均为 **1**，`componentResults=[]`，理由含 `did not include grader pass results`。计数 **1 / 0 / 0 / 0 / 0**。按 `src/node/doEval.ts` 的口径，这条记录会计入 successes，分母为 successes + failures + errors。单独送入该口径时为 **1/1 = 100%**，达到 95% 与默认 100% 的阈值。本轮用源码与计数推导，未重跑闸门 demo。 |
| H3 | 证实。索引 **0**、相同 item 的两行均为 `testIdx=0`。错误列 `promptIdx=0`，`failureReason=ERROR (2)`，行分 **0**，从 `sample.error.message` 取出 `Response input item missing role`。错误列计数 **0 / 0 / 1 / 0 / 0**，成功列 `promptIdx=1`，计数 **1 / 0 / 0 / 1 / 0**。两列标签分别为 `Imported OpenAI eval item (evalrun_error_fixture)` 与 `Imported OpenAI eval item (evalrun_pass_fixture)`，provider 分别为 `openai-evals:evalrun_error_fixture` 与 `openai-evals:evalrun_pass_fixture`。独立单测也覆盖字符串形式的 sample error。 |
| H4 | 证实。按夹具行序，`data_source_idx` 为 **7、7、7、8**，`testIdx` 为 **0、0、1、2**，共 **3** 个测试。前两行递归对象键顺序不同但内容相同，第三行内容变化，第四行只有索引变化。 |
| H5 | 证实。四份有效夹具的导出 `config.tests[*]` 只含 `description`、`vars` 和 `metadata`，无 `assert`，顶层 `config.assert` 和 `config.defaultTest` 也未出现。H2 夹具还显式提供一条 `testing_criteria`，导出原始行保留该字段，生成的断言仍为 **0**。**导入不是可运行评测集的迁移。** |
| H6 | 模拟 API 列表被拒绝。整文件 JSON 解析成功，外层列表对象未通过仪表盘行检测，落入 Promptfoo JSON 导出校验并报 `Unsupported eval export results format`。夹具为本地手写，未使用真实 API 响应。 |

## 真实 CLI 记录

`pnpm compare:cli` 通过本目录的绝对路径 `node_modules/.bin/promptfoo` 启动每一次命令。只给子进程传入白名单变量，以随机 `.cli-*/home` 为 HOME、`.cli-*/work` 为 cwd，并将 XDG 配置、缓存、数据目录及 `PROMPTFOO_CONFIG_DIR` 指向隔离 HOME 内。显式设置 `NODE_ENV=production`、`PROMPTFOO_DISABLE_TELEMETRY=1` 和 `PROMPTFOO_DISABLE_UPDATE=1`。脚本结束时删除隔离目录及其数据库、导出和日志。

以下命令省略本地可执行文件与夹具的绝对路径前缀。四次 export 实际使用 `export eval <ID> --output <隔离工作目录>/export.json`，每次都读取结果后才进行下一次导入。所有命令的 stderr 为空。

| 命令 | 退出码 | stdout 要点 |
| --- | ---: | --- |
| `promptfoo --version` | 0 | `0.126.0`，与本地包清单一致。 |
| `promptfoo import …/openai-evals-items.jsonl` | 0 | 成功导入 `openai-evals-evalrun_import_fixture`。 |
| `promptfoo export eval openai-evals-evalrun_import_fixture --output …/export.json` | 0 | 成功导出，独立核对输出 `MATCH`。 |
| `promptfoo import …/openai-evals-multi-run-items.jsonl` | 0 | 成功导入 `openai-evals-runs-db6ef0a45a701531da4d6397`。 |
| `promptfoo export eval openai-evals-runs-db6ef0a45a701531da4d6397 --output …/export.json` | 0 | 成功导出，独立核对输出 `MATCH`。 |
| `promptfoo import …/score-only.jsonl` | 0 | 成功导入 `openai-evals-score_only`。 |
| `promptfoo export eval openai-evals-score_only --output …/export.json` | 0 | 成功导出，独立核对输出 `MATCH`。 |
| `promptfoo import …/alignment.jsonl` | 0 | 成功导入 `openai-evals-runs-3085d6843a17bc913acf2890`。 |
| `promptfoo export eval openai-evals-runs-3085d6843a17bc913acf2890 --output …/export.json` | 0 | 成功导出，独立核对输出 `MATCH`。 |
| `promptfoo import …/invalid-row.jsonl` | 1 | `line 2 is not a valid OpenAI Evals row`，后接隔离环境中的日志位置。 |
| `promptfoo import …/api-like.json` | 1 | `Unsupported eval export results format`。 |

非法行夹具第二行的 `data_source_idx=-1`，JSON 语法合法但行 schema 不符。它与 H6 分别走 JSONL schema 拒绝和 Promptfoo JSON 格式拒绝两条路径。

## 复现

在本实验目录运行以下命令。

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
NEXT_TELEMETRY_DISABLED=1 pnpm build
pnpm analyze
pnpm compare:cli
```

| 检查 | 最终退出码 | 预期结果 |
| --- | ---: | --- |
| `pnpm test` | 0 | 6 个测试通过。 |
| `pnpm typecheck` | 0 | 无类型诊断。 |
| `NEXT_TELEMETRY_DISABLED=1 pnpm build` | 0 | 生成静态首页 `out/index.html`，展示 H1–H6。 |
| `pnpm analyze` | 0 | 输出四份有效夹具的独立计算结果，含配置、列计数和逐行结果。 |
| `pnpm compare:cli` | 0 | 打印真实命令的退出码和输出，得到 4 条 `MATCH` 和 2 次预期拒绝。 |

构建和类型检查的首次运行发现当前 Next.js 类型声明要求显式提供子进程的 `NODE_ENV`，补上后复跑。实验范围内无待解决问题，H6 结论适用于本地模拟列表。
