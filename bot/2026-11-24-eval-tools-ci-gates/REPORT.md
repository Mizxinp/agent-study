# 3.2 评测工具与 CI 闸门离线对照实验

实跑时间为 2026-11-24 09:00–09:04，Asia/Taipei（UTC+8）。本地安装的版本为 `promptfoo@0.126.0`，源码和 CI 文档对照固定到上游提交 `aa4e2c6baa89f616bb361459a0410f330e16f7c7`。

对 H1–H3 用真实 CLI 执行确定性夹具，读取真实导出后用 TypeScript 独立核验每行及汇总计数。H4 直接读 2.3 的冻结布尔结果。静态首页展示各口径的结果。

## H1 支持 · 同一份数据在 95% 阈值下可红可绿

10 题各三轮，共 30 条显式 trial。每条带 `qid` 和 `trial`，echo 回放各行冻结输出，再用 `equals` 断言。前九题均为三次通过，q10 为一过两败。

| 口径 | 结果 | 95% 闸门 |
| --- | --- | --- |
| CLI 展开通过率 | 28/30 = 93.33% | 失败，实跑退出 100 |
| 按题 pass@3（至少过一次） | 10/10 = 100% | 通过 |
| 按题 pass^3（三次全过） | 9/10 = 90% | 失败 |

导出计数为 28 成功、2 失败、0 错误。stdout 汇总为 `28 passed (93.33%)`、`2 failed (6.67%)`、`0 errors (0%)`，末尾为 `Pass rate 93.33% is below the threshold of 95%`。stderr 为空。CLI 的默认阈值为 100%，本实验显式设为 95%；通过率严格小于阈值才触发比例闸门。恰好 95% 放行，TypeScript 测试覆盖该边界。失败测试退出码沿用默认值 100。[CLI 计算](https://github.com/promptfoo/promptfoo/blob/aa4e2c6baa89f616bb361459a0410f330e16f7c7/src/node/doEval.ts#L1048-L1050) · [阈值与退出码](https://github.com/promptfoo/promptfoo/blob/aa4e2c6baa89f616bb361459a0410f330e16f7c7/src/node/doEval.ts#L1273-L1295)

按 `getWilsonScoreInterval` 的 Wilson score 公式，设 p = 成功数 / n、z = `1.959963984540054`、d = 1 + z²/n；中心为 (p + z²/(2n))/d，半宽为 z√((p(1−p) + z²/(4n))/n)/d，边界截到 [0, 1]。先核对官方单测的 2/3 得 `[0.2077, 0.9385]`，再算 q10 的 1/3 得 `[0.0615, 0.7923]`。这是单题三次回放的比例区间。默认 CLI 闸门仅用展开通过率比较阈值，不使用 Wilson 区间。[公式](https://github.com/promptfoo/promptfoo/blob/aa4e2c6baa89f616bb361459a0410f330e16f7c7/src/util/eval/repeatStability.ts) · [官方测试](https://github.com/promptfoo/promptfoo/blob/aa4e2c6baa89f616bb361459a0410f330e16f7c7/test/util/eval/repeatStability.test.ts)

## H2 支持 · 文档 jq 与 CLI 分母不同

本地 JS provider 在 q19、q20 返回 `{ error: 'Frozen provider error' }`，其余 18 行返回能通过断言的输出。`runEval` 收到 `response.error` 后提前返回，写入 `success=false` 和 `failureReason=ERROR`（导出为 2）。引擎计入 `testErrorCount`，`Eval.getStats()` 汇总到 `errors`。H1 的两行已返回正常输出，走断言后判失败，导出的 `failureReason=ASSERT`（1）计入 `failures`。[错误分类](https://github.com/promptfoo/promptfoo/blob/aa4e2c6baa89f616bb361459a0410f330e16f7c7/src/evaluator/runEval.ts#L1031-L1036) · [统计汇总](https://github.com/promptfoo/promptfoo/blob/aa4e2c6baa89f616bb361459a0410f330e16f7c7/src/models/eval.ts#L1454-L1482)

导出为 18 成功、0 失败、2 错误。实际 jq 输出 `100`，与 TS 的 18/(18+0) 一致，按文档公式通过。CLI 用 18/(18+0+2) = 90%，实跑退出 100。stdout 汇总为 `18 passed (90.00%)`、`0 failed (0%)`、`2 errors (10.00%)`，末尾为 `Pass rate 90.00% is below the threshold of 95%`。stderr 为空。[钉版 CI 文档](https://github.com/promptfoo/promptfoo/blob/aa4e2c6baa89f616bb361459a0410f330e16f7c7/site/docs/integrations/ci-cd.md#L109-L124)

## H3 支持 · 0.126.0 拒绝文档旗标

普通命令对同一份全过夹具导出 1 成功、0 失败、0 错误，退出 0。加入 `--fail-on-error` 后 CLI 在解析选项时拒绝，精确退出码为 **1**，没有生成导出。该版本的 Commander 命令未登记此选项，主程序会在错误后显示帮助。[选项注册](https://github.com/promptfoo/promptfoo/blob/aa4e2c6baa89f616bb361459a0410f330e16f7c7/src/commands/eval.ts#L31-L181) · [主程序](https://github.com/promptfoo/promptfoo/blob/aa4e2c6baa89f616bb361459a0410f330e16f7c7/src/main.ts#L72)

stdout 完整内容为空（0 字节）。stderr 完整内容如下。

```text
error: unknown option '--fail-on-error'

Usage: promptfoo eval [options] [command]

Evaluate prompts

Options:
  -c, --config <paths...>                           Path to configuration file or cloud config UUID. Automatically loads promptfooconfig.yaml
  -a, --assertions <path>                           Path to assertions file
  -p, --prompts <paths...>                          Paths to prompt files (.txt)
  -r, --providers <name or path...>                 One of: openai:chat, openai:completion, openai:<model name>, or path to custom API caller module
  -t, --tests <path>                                Path to CSV with test cases
  -v, --vars <path>                                 Path to CSV with test cases (alias for --tests)
  --model-outputs <path>                            Path to JSON containing list of LLM output strings
  --prompt-prefix <path>                            This prefix is prepended to every prompt
  --prompt-suffix <path>                            This suffix is appended to every prompt.
  --var <key=value>                                 Set a variable in key=value format (default: {})
  --tag <key=value>                                 Set an eval tag in key=value format. Can be specified multiple times; CLI tags override config tags.
  -j, --max-concurrency <number>                    Maximum number of concurrent API calls (default: 4)
  --repeat <number>                                 Number of times to run each test (default: 1)
  --delay <number>                                  Delay between each test (in milliseconds) (default: 0)
  --no-cache                                        Do not read or write results to disk cache
  --remote                                          Force remote inference wherever possible (used for red teams) (default: false)
  --safe-mode                                       Disable dynamic inline JavaScript execution for transforms and assertions
  -n, --filter-first-n <number>                     Only run the first N tests
  --filter-pattern <pattern>                        Only run tests whose description matches the regular expression pattern
  --filter-range <start:end>                        Only run tests whose zero-based index is in the range. End is exclusive (e.g. 0:10, 10:20, 10:, :10)
  --filter-prompts <pattern>                        Only run tests with prompts whose id or label matches the regex pattern
  --filter-providers, --filter-targets <providers>  Only run tests with these providers (regex match)
  --filter-sample <number>                          Only run a random sample of N tests
  --filter-sample-seed <number>                     Numeric seed used to make --filter-sample repeatable
  --filter-failing <path or id>                     Path to json output file or eval ID to filter non-passing tests from (failures + errors)
  --filter-failing-only <path or id>                Path to json output file or eval ID to filter assertion failures from (excludes errors)
  --filter-errors-only <path or id>                 Path to json output file or eval ID to filter error tests from
  --filter-metadata <key=value>                     Only run tests whose metadata matches key=value. Comma-separated values use OR, and \, is a literal comma; repeated flags use AND, even for the same key (e.g. --filter-metadata type=unit,integration --filter-metadata env=prod)
  -o, --output <paths...>                           Path to output file (csv, html, json, jsonl, txt, xml, yaml, yml, junit.xml), default is no output file
  --table                                           Output table in CLI (default: true)
  --no-table                                        Do not output table in CLI
  --table-cell-max-length <number>                  Truncate console table cells to this length
  --share                                           Create a shareable URL
  --no-share                                        Do not share, this overrides the config file
  --resume [evalId]                                 Resume a paused/incomplete evaluation. Defaults to latest when omitted
  --retry-errors                                    Retry all ERROR results from the latest evaluation
  --no-write                                        Do not write results to promptfoo directory
  --grader <provider>                               Model that will grade outputs
  --suggest-prompts <number>                        Generate N new prompts (1-50) and append them to the prompt list
  -w, --watch                                       Watch for changes in config and re-run
  -x, --extension <paths...>                        Extension hooks to run (e.g., file://handler.js:afterAll)
  --description <description>                       Description of the eval run
  --no-progress-bar                                 Do not show progress bar
  --env-file, --env-path <path>                     Path(s) to .env file(s). Repeat the flag or use comma-separated values for multiple files. (default: [])
  -h, --help                                        display help for command

Commands:
  setup [options] [configDirectory]                 Start browser UI and open to eval setup
```

## H4 支持 · 两个切片均复现 3.1

历史数据来自 `origin/main` 快照 `37bc3eefe3536fe2cb70b94ff1ee5dd3eab481b7` 下的 `bot/2026-11-18-agentic-rag-loop/results.json`，首次纳入提交为 `f6f5d160777acc6cf77034b845105fdf3eb068ad`。题型已在每条记录内，分析只需复制这一文件。[源文件](https://github.com/Mizxinp/agent-study/blob/37bc3eefe3536fe2cb70b94ff1ee5dd3eab481b7/bot/2026-11-18-agentic-rag-loop/results.json)

复制前核验源文件，复制后核验副本并以 `cmp` 比较字节。实验后再次核验两份文件，并与基线 Git blob 比较。

| 校验 | 源文件与副本共同取值 |
| --- | --- |
| SHA-256 | `067821e5a441e8a9f15292faf06c9d5e2a38b30ad145400b927a5f89a530aa5f` |
| Git blob | `fd761b71959e7bfdf7f5728c9d074aca3b7abed0` |

按 qid 升序、题内按 run 升序排序。每个切片、每种重采样单位各自用 Mulberry32 种子 `20261121` 初始化，重采样 10,000 次。每次放回抽取与原样本等量的单位，用 `floor(U × n)` 选下标。按 trial 抽每行 0/1，按题抽每题三轮正确率，两者均在抽样后取均值。均值排序后在零基下标 `(10000 − 1) × p` 线性插值，取 p 为 0.025 和 0.975。宽度为上界减下界。

| 切片 | 题 / trial | 单次成功率 | pass@3 | pass^3 | trial 95% 区间（宽度） | 题级 95% 区间（宽度） |
| --- | --- | --- | --- | --- | --- | --- |
| all/fixed | 40 / 120 | 0.7667 | 0.8000 | 0.7250 | [0.6917, 0.8417]（0.1500） | [0.6417, 0.8833]（0.2417） |
| multi/fixed | 14 / 42 | 0.4048 | 0.4286 | 0.3571 | [0.2619, 0.5476]（0.2857） | [0.1667, 0.6429]（0.4762） |

与 3.1 的三个比例、两个区间宽度逐项比对，两个切片的十个值均在四位小数上一致。两个切片按题重采样的区间均更宽，保留了同一题的三轮共同被抽中的结构。

## 复现

在本实验目录运行。环境为 Node.js 24.22.1、pnpm 10.34.6、jq 1.7。先准备已有的 pnpm CLI 和 lockfile 对应的本地包缓存，将 `LOG_DIR` 指向用于保留证据的外部目录。

```sh
export COREPACK_ENABLE_NETWORK=0
export npm_config_offline=true
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
NEXT_TELEMETRY_DISABLED=1 pnpm build
pnpm analyze
pnpm replay "$LOG_DIR"
jq '.results.stats.successes / (.results.stats.successes + .results.stats.failures) * 100' "$LOG_DIR/h2/export.json"
```

安装、6 个测试、类型检查、静态构建、分析和回放包装脚本均退出 0，首页产物为 `out/index.html`。分析会核验源与副本的双哈希，重算表中指标，并亲自调用 jq 对照。回放包装脚本核对安装版本，再于每次独立的工作目录和 HOME 下调用本地安装包的 CLI。它显式检查四个子进程退出码，顺序为 100、100、0、1。单次子进程实际使用的命令形状如下，H3 的旗标加在 `eval` 后，其他参数相同。

```sh
node "$PROMPTFOO_CLI" eval -c suite.json -o export.json \
  --no-cache --no-share --no-write --no-progress-bar
```

回放环境仅传入 `PATH`、`HOME`、`CI`、`NODE_ENV`、`PROMPTFOO_DISABLE_TELEMETRY`、`PROMPTFOO_DISABLE_UPDATE`、`PROMPTFOO_PASS_RATE_THRESHOLD`。阈值设为 95，失败退出码未覆盖。各组在外部证据目录记录命令、stdout、stderr、退出码和实际存在的导出；`fixtures/exports/` 中三份导出是实际 CLI 文件的逐字节副本，`exits.json` 保存实跑退出记录及 H3 的完整输出。

H1、H2、H3 对照组的导出中，`tokenUsage.prompt`、`completion`、`total` 以及 assertions 对应项均为 0。`numRequests` 分别为 30、20、1，计的是本地 provider 调用。评测只执行 echo、本地 JS 和字符串相等断言，没有模型 API 请求。H3 带旗标的命令未进入评测。2.3 仅使用冻结字节。首次在新 HOME 构建时，Corepack 触发了 pnpm 发行包下载。最终验收使用已缓存的 pnpm、关闭 Corepack 网络并配置 pnpm 离线模式重新跑过。
