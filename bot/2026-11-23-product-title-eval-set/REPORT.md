# 德化陶瓷商品标题评测报告

本目录包含 28 条冻结候选标题、可供 Route Handler 复用的 TypeScript 纯函数 grader、离线评测脚本、Vitest 测试和 Next.js 静态只读页。候选标题和标签均为 **AI 辅助构造并经 Codex 审阅的回归金标**，未开展独立真人实验，无用户真人标注。

代码按商品属性核对材质、工艺、产地、规格、件数、奖项等可识别声明，按各用例的必填字段和 `maxChars` 检查覆盖与长度。长度按 Unicode 码点计数，含空格和标点。忠实、覆盖、长度和合规金标任一失败，整例即失败。词汇标记和风格标签均独立于闸门。冻结集实测整例通过 15 条、预期失败 13 条、硬约束回归偏差 0 条，关键词堆砌样例 PT-12 的风格金标为失败，硬约束仍通过。

## 假设结果

### H1 支持

7 条事实金标失败全部命中，漏检 0。21 条事实金标通过的标题误杀 0，其中 6 条语序变化样例全部通过。规格、材质、奖项三类的目标样例命中 5/5。

| 用例 | 代码抓到的声明 |
| --- | --- |
| PT-02 | 标题写 350ml，属性为 250 mL |
| PT-04 | 标题写 28 厘米，属性为 18 cm |
| PT-06 | 标题写树脂，属性为白瓷 |
| PT-08 | 标题写春窑展金奖，属性为春窑展银奖 |
| PT-24 | 标题写 3 支装，输入没有件数 |
| PT-26 | 标题写非遗大师亲制，工艺属性为浮雕 |
| PT-28 | 标题写景德镇，产地属性为德化 |

通过的语序变化例包括 PT-01「250mL｜德化手拉坯白瓷茶杯」、PT-23「80毫米青瓷香插｜德化」和 PT-25「0.15升·德化白瓷浮雕盖碗」。这些用例也覆盖了 mL、毫米换算成 cm 以及升换算成 mL。

### H2 支持

| `flag_absolute_terms` | `compliance_should_fail` | 条数 |
| --- | --- | ---: |
| true | true | 4 |
| true | false | 4 |
| false | true | 0 |
| false | false | 20 |

| 用例和短语 | `flag_absolute_terms` | `compliance_should_fail` | 构造金标依据 |
| --- | --- | --- | --- |
| PT-13 本店追求做到最好 | true | false | 仅表达经营理念或目标追求 |
| PT-15 本品牌历代同系列容量最大 | true | false | 假定比较有据，范围限于同品牌同系列自我比较 |
| PT-17 「第一」牌 | true | false | 假定商标已注册，标题仅用来指代商品 |
| PT-19 2025 年福建省日用陶瓷制品制造类花瓶销量第一 | true | false | 合成用例假定具备省级地域、适用行业分类、专有产品标准和可核验证据 |
| PT-20 2025 年本店销量第一 | true | true | 假定统计范围仅为省内单店，未达到省级地域范围 |
| PT-14、PT-16、PT-18 最好的插花花瓶、全行业容量最大、行业第一 | true | true | 直接指向推销商品，构造输入没有支撑这些宣传主张 |

已读市场监管总局两份指南原文。绝对化用语指南第二条界定用语，第五条第一、二项涉及服务态度、经营理念和目标追求，第六条第一、四、六项分别涉及自我比较、商品或商标指代及限定条件下的事实信息，第七条涉及真实性证明。第六条的适用还考虑误导消费者或贬低其他经营者的客观后果。[《广告绝对化用语执法指南》（2023 年第 6 号，2023-02-25）](https://www.samr.gov.cn/ggjgs/tzgg/art/2023/art_183b5cb48d9e4f0dba67f9f912a913ba.html)

引证指南第十三条规定了第六条第六项豁免的排除情形，包括地域小于省级、行业或领域小于适用标准的行业分类、商品无专有国标或行标。PT-20 因单店地域范围触及该条第一项，标题中的年份不足以满足豁免条件。第十七条将广告中使用 AI 等手段生成的数据、资料、结论纳入自证内容，并规定广告主的真实性、准确性、合法性和举证责任。第十八条仍要求广告自证内容符合第九至十三条。合成样例及标签仅供工程回归，非法律意见。[《广告引证内容执法指南》（2026-06-03 印发，2026-06-12 发布）](https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/ggjgs/art/2026/art_8962fc1e4eb44a87b93d265af43b6940.html)

### H3 支持

实跑 `promptfoo@0.126.0` CLI，`echo` 原样返回 PT-02 的冻结标题「德化手拉坯白瓷茶杯 350ml」。三个 JavaScript 断言对实际返回文本调用同一 TypeScript grader。JSON 用例的 `threshold: 0.75` 对应 CSV 的 `__threshold`，本次实跑使用 JSON 配置。Promptfoo 汇总为 1 通过、0 失败、0 错误。

| 实际导出 | 忠实 | 覆盖 | 长度 | 整例 |
| --- | --- | --- | --- | --- |
| TypeScript | `false`，`unsupported: ["350ml"]` | `true` | `true` | `pass: false` |
| Promptfoo CLI | `pass: false`，0 分，权重 1 | `pass: true`，1 分，权重 2 | `pass: true`，1 分，权重 2 | `success: true`，`score: 0.8`，门槛 0.75 |

CLI 原因字段为 `Aggregate score 0.80 ≥ 0.75 threshold`。仓库内 `promptfoo/result.json` 保留两边导出摘录。`pnpm eval` 显示此实测记录，CI 回归退出状态由 TypeScript 硬约束的金标偏差决定。

## 复现

实际环境为 Node.js 24.22.1、pnpm 10.34.6。在 demo 目录运行：

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
NEXT_TELEMETRY_DISABLED=1 pnpm build
pnpm eval
pnpm eval:promptfoo
```

依赖可从已填充的 pnpm store 用 `pnpm install --offline --frozen-lockfile` 安装，本轮实跑成功。随后四项检查均退出 0，Vitest 共 12 个通过，Next.js 静态生成 `/`，评测打印 H1–H3、0 条回归偏差及三个 SKIPPED 项。对照脚本独立实跑成功，默认将原始导出写入忽略的 `.promptfoo/h3-*/`，可用 `pnpm eval:promptfoo /绝对路径` 指定导出目录。`pnpm start` 可查看构建后的只读页。

本次日志与原始导出在 `/workspace/scratch/codex-product-title-eval-2026-11-23/logs/`。包含 `install.log`、`test.log`、`typecheck.log`、`build.log`、`eval.log`、`promptfoo.log`、`promptfoo-export.json`、`typescript-export.json` 和 `promptfoo-summary.json`。

## 冻结与限制

- 文件为 `data/titles.jsonl`，共 28 条，dev 18 条、holdout 10 条。同一对照组在同一 split。holdout 不得用于修改风格提示词。
- 冻结时间为 **2026-11-23 09:16:06 Asia/Taipei（UTC+08:00）**。SHA-256 为 `dd9e83d6f143bfdce297cd74e386064e4585341ad0aa5a30a9cd6c2dc12c1359`。元数据在 `data/freeze.json`，测试和评测均校验原始字节。后续仅追加数据行。
- 生成 **SKIPPED**、LLM judge **SKIPPED**、H4 **SKIPPED**。本轮无密钥，未调用线上生成或线上 judge。
- 合成小样本的结果仅适用于这批回归样例。词表和正则的识别范围有限，未覆盖任意商品声明、数值表达或中文同义改写。证据范围是构造设定，结论无法外推到生产流量，也不能据此认定「已符合广告法」。
- 本轮仅本地提交，未 push。
