# Agentic RAG 循环 vs 固定单次 RAG：评测结果

- 模型：anthropic / claude-haiku-5-5（host api.creative-reasoning.com），temperature 未设置，重复 3 次，并发 1
- 问题集：40 条，冻结于 2026-11-18T21:05:27+08:00
- 开始 2026-11-18T13:35:27.326Z，结束 2026-11-19T00:51:30.381Z，耗时 40563s

## 汇总

| 题型 | 路线 | n | 精确匹配准确率 | 平均 F1 | 拒答率(答空集) | 未作答率 | 平均 token(入/出/总) | 净延迟 p50/p95 ms | 墙钟延迟 p50/p95 ms | 平均步数 | 每轮准确率 | 错误 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 单跳 | fixed | 39 | 0.9487 | 0.9829 | 0 | 0 | 2365.3846/162.7179/2528.1026 | 3169/6094 | 3169/6094 | 1 | 0.9231 / 0.9231 / 1 | 0 |
| 单跳 | agentic | 39 | 1 | 1 | 0 | 0 | 5169.7949/323.641/5493.4359 | 7259/19283 | 7600/59948 | 2.2051 | 1 / 1 / 1 | 0 |
| 多跳/比较 | fixed | 42 | 0.4048 | 0.4345 | 0.3095 | 0 | 2255.2143/214.6667/2469.881 | 3119/5677 | 3119/5677 | 1 | 0.4286 / 0.4286 / 0.3571 | 0 |
| 多跳/比较 | agentic | 42 | 1 | 1 | 0 | 0 | 8691.5/558/9249.5 | 12459/27983 | 12514/33103 | 3.0476 | 1 / 1 / 1 | 0 |
| Null | fixed | 39 | 0.9744 | 0.9744 | 0.9744 | 0 | 2248.4615/189.2821/2437.7436 | 3169/6144 | 3169/6144 | 1 | 1 / 0.9231 / 1 | 0 |
| Null | agentic | 39 | 0.8974 | 0.8974 | 0.8974 | 0.1026 | 9734.2821/557.1538/10291.4359 | 10949/28354 | 11002/28354 | 3.2308 | 0.9231 / 0.8462 / 0.9231 | 0 |
| 全部 | fixed | 120 | 0.7667 | 0.7882 | 0.425 | 0 | 2288.825/189.5333/2478.3583 | 3167/5765 | 3167/5765 | 1 | 0.775 / 0.75 / 0.775 | 0 |
| 全部 | agentic | 120 | 0.9667 | 0.9667 | 0.2917 | 0.0333 | 7885.85/481.5583/8367.4083 | 9623/23700 | 10703/33222 | 2.8333 | 0.975 / 0.95 / 0.975 | 0 |

## 配对比较（同题同轮，agentic 对 fixed）

| 题型 | agentic 赢 | fixed 赢 | 平 | 符号检验 p（双侧） |
|---|---|---|---|---|
| 单跳 | 2 | 0 | 37 | 0.5 |
| 多跳/比较 | 25 | 0 | 17 | 0 |
| Null | 1 | 4 | 34 | 0.375 |
| 全部 | 28 | 4 | 88 | 0 |

agentic 工具调用次数：{"search":196,"filterProducts":109,"answer":118}；第 1 步除 search 外还并行调用了其他工具的次数：66；第 1 步多工具并行次数：69

## 逐题明细

| 题 | 类型 | 轮 | 路线 | 标准答案 | 预测 | 对 | F1 | token | 净延迟 ms | 墙钟 ms | 失败请求 | 步数 | 工具轨迹 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| m01 | 多跳/比较 | 1 | agentic | DH-BW-0321,DH-HP-1152 | DH-BW-0321,DH-HP-1152 | ✓ | 1 | 7738 | 21756 | 21756 | 0 | 3 | search+filterProducts → filterProducts → answer |
| m01 | 多跳/比较 | 1 | fixed | DH-BW-0321,DH-HP-1152 | DH-CP-1374 | ✗ | 0 | 2372 | 3819 | 3819 | 0 | 1 | answer |
| m01 | 多跳/比较 | 2 | agentic | DH-BW-0321,DH-HP-1152 | DH-BW-0321,DH-HP-1152 | ✓ | 1 | 7454 | 13136 | 13136 | 0 | 3 | search+filterProducts → filterProducts → answer |
| m01 | 多跳/比较 | 2 | fixed | DH-BW-0321,DH-HP-1152 | DH-CP-1374 | ✗ | 0 | 2312 | 2535 | 2535 | 0 | 1 | answer |
| m01 | 多跳/比较 | 3 | agentic | DH-BW-0321,DH-HP-1152 | DH-BW-0321,DH-HP-1152 | ✓ | 1 | 7246 | 12547 | 12547 | 0 | 3 | search+filterProducts → filterProducts → answer |
| m01 | 多跳/比较 | 3 | fixed | DH-BW-0321,DH-HP-1152 | DH-CP-1374 | ✗ | 0 | 2352 | 3049 | 3049 | 0 | 1 | answer |
| m02 | 多跳/比较 | 1 | agentic | DH-TC-1137,DH-BW-0543,DH-CP-1374 | DH-TC-1137,DH-BW-0543,DH-CP-1374 | ✓ | 1 | 7219 | 7860 | 7860 | 0 | 3 | search+filterProducts → filterProducts → answer |
| m02 | 多跳/比较 | 1 | fixed | DH-TC-1137,DH-BW-0543,DH-CP-1374 | DH-CP-1374 | ✗ | 0.5 | 2178 | 5816 | 5816 | 0 | 1 | answer |
| m02 | 多跳/比较 | 2 | agentic | DH-TC-1137,DH-BW-0543,DH-CP-1374 | DH-TC-1137,DH-BW-0543,DH-CP-1374 | ✓ | 1 | 7209 | 22585 | 22585 | 0 | 3 | search+filterProducts → filterProducts → answer |
| m02 | 多跳/比较 | 2 | fixed | DH-TC-1137,DH-BW-0543,DH-CP-1374 | DH-CP-1374 | ✗ | 0.5 | 2180 | 5402 | 5402 | 0 | 1 | answer |
| m02 | 多跳/比较 | 3 | agentic | DH-TC-1137,DH-BW-0543,DH-CP-1374 | DH-TC-1137,DH-BW-0543,DH-CP-1374 | ✓ | 1 | 7227 | 6869 | 6869 | 0 | 3 | search+filterProducts → filterProducts → answer |
| m02 | 多跳/比较 | 3 | fixed | DH-TC-1137,DH-BW-0543,DH-CP-1374 | DH-BW-0654,DH-CP-1374,DH-CP-1485,DH-TC-1248,DH-HP-1263 | ✗ | 0.25 | 2237 | 2816 | 2816 | 0 | 1 | answer |
| m03 | 多跳/比较 | 1 | agentic | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 4690 | 5657 | 5657 | 0 | 2 | search+filterProducts → answer |
| m03 | 多跳/比较 | 1 | fixed | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 2399 | 3681 | 3681 | 0 | 1 | answer |
| m03 | 多跳/比较 | 2 | agentic | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 4704 | 7534 | 7534 | 0 | 2 | search+filterProducts → answer |
| m03 | 多跳/比较 | 2 | fixed | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 2399 | 6595 | 6595 | 0 | 1 | answer |
| m03 | 多跳/比较 | 3 | agentic | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 4702 | 5841 | 5841 | 0 | 2 | search+filterProducts → answer |
| m03 | 多跳/比较 | 3 | fixed | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 2398 | 2468 | 2468 | 0 | 1 | answer |
| m04 | 多跳/比较 | 1 | agentic | DH-TC-1248 | DH-TC-1248 | ✓ | 1 | 4869 | 9106 | 9106 | 0 | 2 | search+filterProducts → answer |
| m04 | 多跳/比较 | 1 | fixed | DH-TC-1248 | DH-TC-1248 | ✓ | 1 | 2377 | 2495 | 2495 | 0 | 1 | answer |
| m04 | 多跳/比较 | 2 | agentic | DH-TC-1248 | DH-TC-1248 | ✓ | 1 | 4881 | 9058 | 9058 | 0 | 2 | search+filterProducts → answer |
| m04 | 多跳/比较 | 2 | fixed | DH-TC-1248 | DH-TC-1248 | ✓ | 1 | 2377 | 2418 | 2418 | 0 | 1 | answer |
| m04 | 多跳/比较 | 3 | agentic | DH-TC-1248 | DH-TC-1248 | ✓ | 1 | 4876 | 5881 | 5881 | 0 | 2 | search+filterProducts → answer |
| m04 | 多跳/比较 | 3 | fixed | DH-TC-1248 | DH-TC-1248 | ✓ | 1 | 2383 | 3073 | 3073 | 0 | 1 | answer |
| m05 | 多跳/比较 | 1 | agentic | DH-BW-0432,DH-BW-0543,DH-BW-0654 | DH-BW-0432,DH-BW-0543,DH-BW-0654 | ✓ | 1 | 10684 | 18364 | 18364 | 0 | 4 | search → filterProducts → filterProducts → answer |
| m05 | 多跳/比较 | 1 | fixed | DH-BW-0432,DH-BW-0543,DH-BW-0654 | 无 | ✗ | 0 | 2760 | 2271 | 2271 | 0 | 1 | answer |
| m05 | 多跳/比较 | 2 | agentic | DH-BW-0432,DH-BW-0543,DH-BW-0654 | DH-BW-0432,DH-BW-0543,DH-BW-0654 | ✓ | 1 | 10685 | 14553 | 14553 | 0 | 4 | search → filterProducts → filterProducts → answer |
| m05 | 多跳/比较 | 2 | fixed | DH-BW-0432,DH-BW-0543,DH-BW-0654 | 无 | ✗ | 0 | 2749 | 2007 | 2007 | 0 | 1 | answer |
| m05 | 多跳/比较 | 3 | agentic | DH-BW-0432,DH-BW-0543,DH-BW-0654 | DH-BW-0432,DH-BW-0543,DH-BW-0654 | ✓ | 1 | 10703 | 185427 | 4869304 | 1 | 4 | search → filterProducts → filterProducts → answer |
| m05 | 多跳/比较 | 3 | fixed | DH-BW-0432,DH-BW-0543,DH-BW-0654 | 无 | ✗ | 0 | 2759 | 2878 | 2878 | 0 | 1 | answer |
| m06 | 多跳/比较 | 1 | agentic | DH-BW-0654 | DH-BW-0654 | ✓ | 1 | 10500 | 19545 | 19545 | 0 | 4 | search → filterProducts → filterProducts → answer |
| m06 | 多跳/比较 | 1 | fixed | DH-BW-0654 | 无 | ✗ | 0 | 2660 | 2266 | 2266 | 0 | 1 | answer |
| m06 | 多跳/比较 | 2 | agentic | DH-BW-0654 | DH-BW-0654 | ✓ | 1 | 10391 | 14164 | 14164 | 0 | 4 | search → filterProducts → filterProducts → answer |
| m06 | 多跳/比较 | 2 | fixed | DH-BW-0654 | 无 | ✗ | 0 | 2663 | 2379 | 2379 | 0 | 1 | answer |
| m06 | 多跳/比较 | 3 | agentic | DH-BW-0654 | DH-BW-0654 | ✓ | 1 | 10353 | 12948 | 12948 | 0 | 4 | search → filterProducts → filterProducts → answer |
| m06 | 多跳/比较 | 3 | fixed | DH-BW-0654 | 无 | ✗ | 0 | 2662 | 4801 | 4801 | 0 | 1 | answer |
| m07 | 多跳/比较 | 1 | agentic | DH-XP-0827 | DH-XP-0827 | ✓ | 1 | 5753 | 12727 | 12727 | 0 | 2 | search+search+filterProducts → answer |
| m07 | 多跳/比较 | 1 | fixed | DH-XP-0827 | DH-XP-0827 | ✓ | 1 | 2165 | 2843 | 2843 | 0 | 1 | answer |
| m07 | 多跳/比较 | 2 | agentic | DH-XP-0827 | DH-XP-0827 | ✓ | 1 | 5741 | 8217 | 8217 | 0 | 2 | search+search+filterProducts → answer |
| m07 | 多跳/比较 | 2 | fixed | DH-XP-0827 | DH-XP-0827 | ✓ | 1 | 2180 | 2900 | 2900 | 0 | 1 | answer |
| m07 | 多跳/比较 | 3 | agentic | DH-XP-0827 | DH-XP-0827 | ✓ | 1 | 5741 | 5776 | 5776 | 0 | 2 | search+search+filterProducts → answer |
| m07 | 多跳/比较 | 3 | fixed | DH-XP-0827 | DH-XP-0827 | ✓ | 1 | 2150 | 2999 | 2999 | 0 | 1 | answer |
| m08 | 多跳/比较 | 1 | agentic | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 4574 | 12438 | 12438 | 0 | 2 | search+filterProducts → answer |
| m08 | 多跳/比较 | 1 | fixed | DH-BW-0321 | DH-BW-0654 | ✗ | 0 | 2251 | 3449 | 3449 | 0 | 1 | answer |
| m08 | 多跳/比较 | 2 | agentic | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 4580 | 10755 | 10755 | 0 | 2 | search+filterProducts → answer |
| m08 | 多跳/比较 | 2 | fixed | DH-BW-0321 | DH-BW-0654 | ✗ | 0 | 2272 | 3565 | 3565 | 0 | 1 | answer |
| m08 | 多跳/比较 | 3 | agentic | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 4530 | 6152 | 6152 | 0 | 2 | search+filterProducts → answer |
| m08 | 多跳/比较 | 3 | fixed | DH-BW-0321 | DH-BW-0543,DH-BW-0654 | ✗ | 0 | 2246 | 2387 | 2387 | 0 | 1 | answer |
| m09 | 多跳/比较 | 1 | agentic | DH-BW-0543,DH-BP-0938,DH-CP-1374 | DH-BW-0543,DH-BP-0938,DH-CP-1374 | ✓ | 1 | 4574 | 16116 | 16116 | 0 | 2 | search+filterProducts → answer |
| m09 | 多跳/比较 | 1 | fixed | DH-BW-0543,DH-BP-0938,DH-CP-1374 | DH-CP-1374,DH-BW-0543,DH-BP-0938 | ✓ | 1 | 2283 | 3164 | 3164 | 0 | 1 | answer |
| m09 | 多跳/比较 | 2 | agentic | DH-BW-0543,DH-BP-0938,DH-CP-1374 | DH-BW-0543,DH-BP-0938,DH-CP-1374 | ✓ | 1 | 4596 | 20767 | 20767 | 0 | 2 | search+filterProducts → answer |
| m09 | 多跳/比较 | 2 | fixed | DH-BW-0543,DH-BP-0938,DH-CP-1374 | DH-CP-1374,DH-BW-0543,DH-BP-0938 | ✓ | 1 | 2247 | 2637 | 2637 | 0 | 1 | answer |
| m09 | 多跳/比较 | 3 | agentic | DH-BW-0543,DH-BP-0938,DH-CP-1374 | DH-BW-0543,DH-BP-0938,DH-CP-1374 | ✓ | 1 | 4598 | 9207 | 9207 | 0 | 2 | search+filterProducts → answer |
| m09 | 多跳/比较 | 3 | fixed | DH-BW-0543,DH-BP-0938,DH-CP-1374 | DH-CP-1374,DH-BW-0543,DH-BP-0938 | ✓ | 1 | 2259 | 3208 | 3208 | 0 | 1 | answer |
| m10 | 多跳/比较 | 1 | agentic | DH-TC-0915 | DH-TC-0915 | ✓ | 1 | 11387 | 15528 | 15528 | 0 | 4 | search → filterProducts → search → answer |
| m10 | 多跳/比较 | 1 | fixed | DH-TC-0915 | DH-BP-0938 | ✗ | 0 | 2710 | 2726 | 2726 | 0 | 1 | answer |
| m10 | 多跳/比较 | 2 | agentic | DH-TC-0915 | DH-TC-0915 | ✓ | 1 | 11690 | 23355 | 23355 | 0 | 4 | search → filterProducts → search → answer |
| m10 | 多跳/比较 | 2 | fixed | DH-TC-0915 | DH-BP-0938 | ✗ | 0 | 2756 | 5692 | 5692 | 0 | 1 | answer |
| m10 | 多跳/比较 | 3 | agentic | DH-TC-0915 | DH-TC-0915 | ✓ | 1 | 11420 | 12005 | 12005 | 0 | 4 | search → filterProducts → search → answer |
| m10 | 多跳/比较 | 3 | fixed | DH-TC-0915 | DH-BP-0938 | ✗ | 0 | 2751 | 4268 | 4268 | 0 | 1 | answer |
| m11 | 多跳/比较 | 1 | agentic | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 12065 | 28227 | 38241 | 1 | 4 | search → filterProducts → search → answer |
| m11 | 多跳/比较 | 1 | fixed | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 2587 | 3609 | 3609 | 0 | 1 | answer |
| m11 | 多跳/比较 | 2 | agentic | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 12014 | 12053 | 12053 | 0 | 4 | search → filterProducts → search → answer |
| m11 | 多跳/比较 | 2 | fixed | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 2573 | 3014 | 3014 | 0 | 1 | answer |
| m11 | 多跳/比较 | 3 | agentic | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 11983 | 15138 | 15138 | 0 | 4 | search → filterProducts → search → answer |
| m11 | 多跳/比较 | 3 | fixed | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 2616 | 3455 | 3455 | 0 | 1 | answer |
| m12 | 多跳/比较 | 1 | agentic | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 4521 | 9006 | 9006 | 0 | 2 | search+filterProducts → answer |
| m12 | 多跳/比较 | 1 | fixed | DH-HP-1263 | 无 | ✗ | 0 | 2555 | 5143 | 5143 | 0 | 1 | answer |
| m12 | 多跳/比较 | 2 | agentic | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 4537 | 8664 | 8664 | 0 | 2 | search+filterProducts → answer |
| m12 | 多跳/比较 | 2 | fixed | DH-HP-1263 | 无 | ✗ | 0 | 2554 | 3226 | 3226 | 0 | 1 | answer |
| m12 | 多跳/比较 | 3 | agentic | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 4534 | 7310 | 7310 | 0 | 2 | search+filterProducts → answer |
| m12 | 多跳/比较 | 3 | fixed | DH-HP-1263 | 无 | ✗ | 0 | 2546 | 2991 | 2991 | 0 | 1 | answer |
| m13 | 多跳/比较 | 1 | agentic | DH-BP-0938 | DH-BP-0938 | ✓ | 1 | 40247 | 31130 | 31130 | 0 | 6 | search → search+search → search+search+filterProducts → filterProducts+search → search+search → answer |
| m13 | 多跳/比较 | 1 | fixed | DH-BP-0938 | 无 | ✗ | 0 | 2821 | 3507 | 3507 | 0 | 1 | answer |
| m13 | 多跳/比较 | 2 | agentic | DH-BP-0938 | DH-BP-0938 | ✓ | 1 | 25987 | 23190 | 33207 | 1 | 5 | search → search+search → search+search → filterProducts → answer |
| m13 | 多跳/比较 | 2 | fixed | DH-BP-0938 | 无 | ✗ | 0 | 2824 | 3466 | 3466 | 0 | 1 | answer |
| m13 | 多跳/比较 | 3 | agentic | DH-BP-0938 | DH-BP-0938 | ✓ | 1 | 35737 | 19381 | 19381 | 0 | 6 | search → search+search → search+filterProducts → search+filterProducts → search → answer |
| m13 | 多跳/比较 | 3 | fixed | DH-BP-0938 | 无 | ✗ | 0 | 2817 | 4067 | 4067 | 0 | 1 | answer |
| m14 | 多跳/比较 | 1 | agentic | DH-CP-1485 | DH-CP-1485 | ✓ | 1 | 7129 | 12480 | 12480 | 0 | 3 | search+filterProducts → filterProducts → answer |
| m14 | 多跳/比较 | 1 | fixed | DH-CP-1485 | DH-CP-1485 | ✓ | 1 | 2453 | 2642 | 2642 | 0 | 1 | answer |
| m14 | 多跳/比较 | 2 | agentic | DH-CP-1485 | DH-CP-1485 | ✓ | 1 | 7210 | 8791 | 8791 | 0 | 3 | search+filterProducts → filterProducts → answer |
| m14 | 多跳/比较 | 2 | fixed | DH-CP-1485 | DH-CP-1485 | ✓ | 1 | 2428 | 3538 | 3538 | 0 | 1 | answer |
| m14 | 多跳/比较 | 3 | agentic | DH-CP-1485 | DH-CP-1485 | ✓ | 1 | 7200 | 11937 | 21970 | 1 | 3 | search+filterProducts → filterProducts → answer |
| m14 | 多跳/比较 | 3 | fixed | DH-CP-1485 | 无 | ✗ | 0 | 2474 | 3378 | 3378 | 0 | 1 | answer |
| n01 | Null | 1 | agentic | 无 | 无 | ✓ | 1 | 4518 | 11825 | 11825 | 0 | 2 | search+filterProducts → answer |
| n01 | Null | 1 | fixed | 无 | 无 | ✓ | 1 | 2354 | 3325 | 3325 | 0 | 1 | answer |
| n01 | Null | 2 | agentic | 无 | 无 | ✓ | 1 | 8533 | 9602 | 9602 | 0 | 3 | search+filterProducts → search → answer |
| n01 | Null | 2 | fixed | 无 | 无 | ✓ | 1 | 2361 | 2195 | 2195 | 0 | 1 | answer |
| n01 | Null | 3 | agentic | 无 | 无 | ✓ | 1 | 9368 | 9263 | 9263 | 0 | 3 | search+filterProducts → search → answer |
| n01 | Null | 3 | fixed | 无 | 无 | ✓ | 1 | 2335 | 2644 | 2644 | 0 | 1 | answer |
| n02 | Null | 1 | agentic | 无 | 无 | ✓ | 1 | 4456 | 9131 | 9131 | 0 | 2 | search+filterProducts → answer |
| n02 | Null | 1 | fixed | 无 | 无 | ✓ | 1 | 2667 | 3800 | 3800 | 0 | 1 | answer |
| n02 | Null | 2 | agentic | 无 | 无 | ✓ | 1 | 4449 | 9086 | 9086 | 0 | 2 | search+filterProducts → answer |
| n02 | Null | 2 | fixed | 无 | 无 | ✓ | 1 | 2667 | 2361 | 2361 | 0 | 1 | answer |
| n02 | Null | 3 | agentic | 无 | 无 | ✓ | 1 | 4467 | 6701 | 6701 | 0 | 2 | search+filterProducts → answer |
| n02 | Null | 3 | fixed | 无 | 无 | ✓ | 1 | 2664 | 3129 | 3129 | 0 | 1 | answer |
| n03 | Null | 1 | agentic | 无 | 无 | ✓ | 1 | 8245 | 15538 | 15538 | 0 | 3 | search+filterProducts → filterProducts → answer |
| n03 | Null | 1 | fixed | 无 | 无 | ✓ | 1 | 2011 | 2512 | 2512 | 0 | 1 | answer |
| n03 | Null | 2 | agentic | 无 | 无 | ✓ | 1 | 4119 | 7740 | 7740 | 0 | 2 | search+filterProducts → answer |
| n03 | Null | 2 | fixed | 无 | 无 | ✓ | 1 | 2034 | 2395 | 2395 | 0 | 1 | answer |
| n03 | Null | 3 | agentic | 无 | 无 | ✓ | 1 | 4105 | 5716 | 5716 | 0 | 2 | search+filterProducts → answer |
| n03 | Null | 3 | fixed | 无 | 无 | ✓ | 1 | 2003 | 3231 | 3231 | 0 | 1 | answer |
| n04 | Null | 1 | agentic | 无 | 无 | ✓ | 1 | 6806 | 10949 | 10949 | 0 | 3 | search+filterProducts → filterProducts → answer |
| n04 | Null | 1 | fixed | 无 | 无 | ✓ | 1 | 2063 | 4990 | 4990 | 0 | 1 | answer |
| n04 | Null | 2 | agentic | 无 | （未作答） | ✗ | 0 | 8295 | 17724 | 17724 | 0 | 3 | search+filterProducts → filterProducts → answer |
| n04 | Null | 2 | fixed | 无 | 无 | ✓ | 1 | 2050 | 3419 | 3419 | 0 | 1 | answer |
| n04 | Null | 3 | agentic | 无 | （未作答） | ✗ | 0 | 6841 | 10651 | 10651 | 0 | 3 | search+filterProducts → filterProducts → answer |
| n04 | Null | 3 | fixed | 无 | 无 | ✓ | 1 | 2052 | 2881 | 2881 | 0 | 1 | answer |
| n05 | Null | 1 | agentic | 无 | 无 | ✓ | 1 | 10287 | 16411 | 16411 | 0 | 3 | search+search → search → answer |
| n05 | Null | 1 | fixed | 无 | 无 | ✓ | 1 | 2748 | 5684 | 5684 | 0 | 1 | answer |
| n05 | Null | 2 | agentic | 无 | 无 | ✓ | 1 | 18856 | 29962 | 29962 | 0 | 5 | search → search → search → search → answer |
| n05 | Null | 2 | fixed | 无 | 无 | ✓ | 1 | 2746 | 4972 | 4972 | 0 | 1 | answer |
| n05 | Null | 3 | agentic | 无 | 无 | ✓ | 1 | 10332 | 10313 | 10313 | 0 | 3 | search+search → search → answer |
| n05 | Null | 3 | fixed | 无 | 无 | ✓ | 1 | 2751 | 3146 | 3146 | 0 | 1 | answer |
| n06 | Null | 1 | agentic | 无 | 无 | ✓ | 1 | 4103 | 10467 | 20482 | 1 | 2 | search+filterProducts → answer |
| n06 | Null | 1 | fixed | 无 | 无 | ✓ | 1 | 2310 | 2675 | 2675 | 0 | 1 | answer |
| n06 | Null | 2 | agentic | 无 | 无 | ✓ | 1 | 4151 | 11425 | 11425 | 0 | 2 | search+filterProducts → answer |
| n06 | Null | 2 | fixed | 无 | 无 | ✓ | 1 | 2295 | 2307 | 2307 | 0 | 1 | answer |
| n06 | Null | 3 | agentic | 无 | 无 | ✓ | 1 | 4214 | 8325 | 8325 | 0 | 2 | search+filterProducts → answer |
| n06 | Null | 3 | fixed | 无 | 无 | ✓ | 1 | 2318 | 3650 | 3650 | 0 | 1 | answer |
| n07 | Null | 1 | agentic | 无 | 无 | ✓ | 1 | 9284 | 14834 | 14834 | 0 | 3 | search+filterProducts → search → answer |
| n07 | Null | 1 | fixed | 无 | 无 | ✓ | 1 | 2209 | 3009 | 3009 | 0 | 1 | answer |
| n07 | Null | 2 | agentic | 无 | 无 | ✓ | 1 | 9271 | 8970 | 8970 | 0 | 3 | search+filterProducts → search → answer |
| n07 | Null | 2 | fixed | 无 | 无 | ✓ | 1 | 2182 | 2295 | 2295 | 0 | 1 | answer |
| n07 | Null | 3 | agentic | 无 | 无 | ✓ | 1 | 13623 | 13823 | 13823 | 0 | 4 | search+filterProducts → search → filterProducts → answer |
| n07 | Null | 3 | fixed | 无 | 无 | ✓ | 1 | 2176 | 4743 | 4743 | 0 | 1 | answer |
| n08 | Null | 1 | agentic | 无 | 无 | ✓ | 1 | 8302 | 14031 | 14031 | 0 | 3 | search → search → answer |
| n08 | Null | 1 | fixed | 无 | 无 | ✓ | 1 | 2743 | 3064 | 3064 | 0 | 1 | answer |
| n08 | Null | 2 | agentic | 无 | 无 | ✓ | 1 | 19533 | 18209 | 18209 | 0 | 5 | search → search → search → search → answer |
| n08 | Null | 2 | fixed | 无 | 无 | ✓ | 1 | 2724 | 3963 | 3963 | 0 | 1 | answer |
| n08 | Null | 3 | agentic | 无 | 无 | ✓ | 1 | 13402 | 15654 | 15654 | 0 | 4 | search → search → search → answer |
| n08 | Null | 3 | fixed | 无 | 无 | ✓ | 1 | 2730 | 4449 | 4449 | 0 | 1 | answer |
| n09 | Null | 1 | agentic | 无 | 无 | ✓ | 1 | 7024 | 9904 | 9904 | 0 | 3 | search → filterProducts → answer |
| n09 | Null | 1 | fixed | 无 | 无 | ✓ | 1 | 2161 | 3989 | 3989 | 0 | 1 | answer |
| n09 | Null | 2 | agentic | 无 | 无 | ✓ | 1 | 6911 | 11002 | 11002 | 0 | 3 | search → filterProducts → answer |
| n09 | Null | 2 | fixed | 无 | DH-TC-0915 | ✗ | 0 | 2197 | 3047 | 3047 | 0 | 1 | answer |
| n09 | Null | 3 | agentic | 无 | 无 | ✓ | 1 | 6865 | 8663 | 8663 | 0 | 3 | search → filterProducts → answer |
| n09 | Null | 3 | fixed | 无 | 无 | ✓ | 1 | 2157 | 3957 | 3957 | 0 | 1 | answer |
| n10 | Null | 1 | agentic | 无 | 无 | ✓ | 1 | 7556 | 7841 | 7841 | 0 | 3 | search+filterProducts → filterProducts → answer |
| n10 | Null | 1 | fixed | 无 | 无 | ✓ | 1 | 2454 | 3118 | 3118 | 0 | 1 | answer |
| n10 | Null | 2 | agentic | 无 | 无 | ✓ | 1 | 7342 | 11942 | 11942 | 0 | 3 | search+filterProducts → filterProducts → answer |
| n10 | Null | 2 | fixed | 无 | 无 | ✓ | 1 | 2402 | 3153 | 3153 | 0 | 1 | answer |
| n10 | Null | 3 | agentic | 无 | 无 | ✓ | 1 | 7519 | 8820 | 8820 | 0 | 3 | search+filterProducts → filterProducts → answer |
| n10 | Null | 3 | fixed | 无 | 无 | ✓ | 1 | 2439 | 3395 | 3395 | 0 | 1 | answer |
| n11 | Null | 1 | agentic | 无 | （未作答） | ✗ | 0 | 26767 | 22963 | 22963 | 0 | 6 | search → search → search → search → search → search |
| n11 | Null | 1 | fixed | 无 | 无 | ✓ | 1 | 2614 | 3719 | 3719 | 0 | 1 | answer |
| n11 | Null | 2 | agentic | 无 | （未作答） | ✗ | 0 | 26703 | 33423 | 12641455 | 1 | 6 | search → search → search → search → search → search |
| n11 | Null | 2 | fixed | 无 | 无 | ✓ | 1 | 2632 | 10285 | 10285 | 0 | 1 | answer |
| n11 | Null | 3 | agentic | 无 | 无 | ✓ | 1 | 13296 | 13555 | 13555 | 0 | 4 | search → search → search → answer |
| n11 | Null | 3 | fixed | 无 | 无 | ✓ | 1 | 2674 | 3738 | 3738 | 0 | 1 | answer |
| n12 | Null | 1 | agentic | 无 | 无 | ✓ | 1 | 27629 | 28175 | 28175 | 0 | 6 | search → search → search → search → search → answer |
| n12 | Null | 1 | fixed | 无 | 无 | ✓ | 1 | 2711 | 3169 | 3169 | 0 | 1 | answer |
| n12 | Null | 2 | agentic | 无 | 无 | ✓ | 1 | 20075 | 21004 | 21004 | 0 | 5 | search → search → search → search → answer |
| n12 | Null | 2 | fixed | 无 | 无 | ✓ | 1 | 2705 | 3053 | 3053 | 0 | 1 | answer |
| n12 | Null | 3 | agentic | 无 | 无 | ✓ | 1 | 19999 | 16161 | 16161 | 0 | 5 | search → search → search → search → answer |
| n12 | Null | 3 | fixed | 无 | 无 | ✓ | 1 | 2712 | 2113 | 2113 | 0 | 1 | answer |
| n13 | Null | 1 | agentic | 无 | 无 | ✓ | 1 | 11809 | 8995 | 8995 | 0 | 3 | search+filterProducts → search → answer |
| n13 | Null | 1 | fixed | 无 | 无 | ✓ | 1 | 2668 | 3598 | 3598 | 0 | 1 | answer |
| n13 | Null | 2 | agentic | 无 | 无 | ✓ | 1 | 6149 | 7143 | 7143 | 0 | 2 | search+filterProducts → answer |
| n13 | Null | 2 | fixed | 无 | 无 | ✓ | 1 | 2675 | 11168 | 11168 | 0 | 1 | answer |
| n13 | Null | 3 | agentic | 无 | 无 | ✓ | 1 | 6162 | 7552 | 7552 | 0 | 2 | search+filterProducts → answer |
| n13 | Null | 3 | fixed | 无 | 无 | ✓ | 1 | 2678 | 2975 | 2975 | 0 | 1 | answer |
| s01 | 单跳 | 1 | agentic | DH-BW-0432 | DH-BW-0432 | ✓ | 1 | 4347 | 8789 | 8789 | 0 | 2 | search+filterProducts → answer |
| s01 | 单跳 | 1 | fixed | DH-BW-0432 | DH-BW-0432 | ✓ | 1 | 2442 | 5762 | 5762 | 0 | 1 | answer |
| s01 | 单跳 | 2 | agentic | DH-BW-0432 | DH-BW-0432 | ✓ | 1 | 4361 | 8743 | 297978 | 1 | 2 | search+filterProducts → answer |
| s01 | 单跳 | 2 | fixed | DH-BW-0432 | DH-BW-0432 | ✓ | 1 | 2443 | 3209 | 3209 | 0 | 1 | answer |
| s01 | 单跳 | 3 | agentic | DH-BW-0432 | DH-BW-0432 | ✓ | 1 | 4337 | 9205 | 9205 | 0 | 2 | search+filterProducts → answer |
| s01 | 单跳 | 3 | fixed | DH-BW-0432 | DH-BW-0432 | ✓ | 1 | 2441 | 3916 | 3916 | 0 | 1 | answer |
| s02 | 单跳 | 1 | agentic | DH-BP-0938 | DH-BP-0938 | ✓ | 1 | 5951 | 9644 | 9644 | 0 | 2 | search+filterProducts → answer |
| s02 | 单跳 | 1 | fixed | DH-BP-0938 | DH-BP-0938 | ✓ | 1 | 2307 | 3250 | 3250 | 0 | 1 | answer |
| s02 | 单跳 | 2 | agentic | DH-BP-0938 | DH-BP-0938 | ✓ | 1 | 5869 | 20888 | 20888 | 0 | 2 | search+filterProducts → answer |
| s02 | 单跳 | 2 | fixed | DH-BP-0938 | DH-BP-0938 | ✓ | 1 | 2308 | 2761 | 2761 | 0 | 1 | answer |
| s02 | 单跳 | 3 | agentic | DH-BP-0938 | DH-BP-0938 | ✓ | 1 | 5859 | 6449 | 6449 | 0 | 2 | search+filterProducts → answer |
| s02 | 单跳 | 3 | fixed | DH-BP-0938 | DH-BP-0938 | ✓ | 1 | 2306 | 3140 | 3140 | 0 | 1 | answer |
| s03 | 单跳 | 1 | agentic | DH-BP-1049 | DH-BP-1049 | ✓ | 1 | 4328 | 6066 | 6066 | 0 | 2 | search → answer |
| s03 | 单跳 | 1 | fixed | DH-BP-1049 | DH-BP-1049 | ✓ | 1 | 2717 | 2605 | 2605 | 0 | 1 | answer |
| s03 | 单跳 | 2 | agentic | DH-BP-1049 | DH-BP-1049 | ✓ | 1 | 4324 | 13541 | 13541 | 0 | 2 | search → answer |
| s03 | 单跳 | 2 | fixed | DH-BP-1049 | DH-BP-1049 | ✓ | 1 | 2717 | 2535 | 2535 | 0 | 1 | answer |
| s03 | 单跳 | 3 | agentic | DH-BP-1049 | DH-BP-1049 | ✓ | 1 | 4321 | 6318 | 6318 | 0 | 2 | search → answer |
| s03 | 单跳 | 3 | fixed | DH-BP-1049 | DH-BP-1049 | ✓ | 1 | 2717 | 3863 | 3863 | 0 | 1 | answer |
| s04 | 单跳 | 1 | agentic | DH-CP-1485 | DH-CP-1485 | ✓ | 1 | 13396 | 19105 | 19105 | 0 | 4 | search → search → search → answer |
| s04 | 单跳 | 1 | fixed | DH-CP-1485 | DH-CP-1485 | ✓ | 1 | 2623 | 9081 | 9081 | 0 | 1 | answer |
| s04 | 单跳 | 2 | agentic | DH-CP-1485 | DH-CP-1485 | ✓ | 1 | 23130 | 23464 | 33500 | 1 | 5 | search → search+search → search → search → answer |
| s04 | 单跳 | 2 | fixed | DH-CP-1485 | DH-CP-1485 | ✓ | 1 | 2627 | 4016 | 4016 | 0 | 1 | answer |
| s04 | 单跳 | 3 | agentic | DH-CP-1485 | DH-CP-1485 | ✓ | 1 | 13230 | 13332 | 13332 | 0 | 4 | search → search → search → answer |
| s04 | 单跳 | 3 | fixed | DH-CP-1485 | DH-CP-1485 | ✓ | 1 | 2678 | 3191 | 3191 | 0 | 1 | answer |
| s05 | 单跳 | 1 | agentic | DH-TC-1137 | DH-TC-1137 | ✓ | 1 | 4156 | 5968 | 5968 | 0 | 2 | search → answer |
| s05 | 单跳 | 1 | fixed | DH-TC-1137 | DH-TC-1137 | ✓ | 1 | 2635 | 3576 | 3576 | 0 | 1 | answer |
| s05 | 单跳 | 2 | agentic | DH-TC-1137 | DH-TC-1137 | ✓ | 1 | 4174 | 6812 | 6812 | 0 | 2 | search → answer |
| s05 | 单跳 | 2 | fixed | DH-TC-1137 | DH-TC-1137 | ✓ | 1 | 2643 | 2754 | 2754 | 0 | 1 | answer |
| s05 | 单跳 | 3 | agentic | DH-TC-1137 | DH-TC-1137 | ✓ | 1 | 4177 | 5840 | 5840 | 0 | 2 | search → answer |
| s05 | 单跳 | 3 | fixed | DH-TC-1137 | DH-TC-1137 | ✓ | 1 | 2676 | 3047 | 3047 | 0 | 1 | answer |
| s06 | 单跳 | 1 | agentic | DH-TC-1026 | DH-TC-1026 | ✓ | 1 | 4392 | 6583 | 6583 | 0 | 2 | search → answer |
| s06 | 单跳 | 1 | fixed | DH-TC-1026 | DH-TC-1026 | ✓ | 1 | 2796 | 3169 | 3169 | 0 | 1 | answer |
| s06 | 单跳 | 2 | agentic | DH-TC-1026 | DH-TC-1026 | ✓ | 1 | 4410 | 6921 | 6921 | 0 | 2 | search → answer |
| s06 | 单跳 | 2 | fixed | DH-TC-1026 | DH-TC-1026 | ✓ | 1 | 2784 | 4261 | 4261 | 0 | 1 | answer |
| s06 | 单跳 | 3 | agentic | DH-TC-1026 | DH-TC-1026 | ✓ | 1 | 8289 | 7600 | 7600 | 0 | 3 | search → search → answer |
| s06 | 单跳 | 3 | fixed | DH-TC-1026 | DH-TC-1026 | ✓ | 1 | 2808 | 2881 | 2881 | 0 | 1 | answer |
| s07 | 单跳 | 1 | agentic | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 4143 | 6651 | 6651 | 0 | 2 | search+filterProducts → answer |
| s07 | 单跳 | 1 | fixed | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 1986 | 3564 | 3564 | 0 | 1 | answer |
| s07 | 单跳 | 2 | agentic | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 4144 | 10202 | 20215 | 1 | 2 | search+filterProducts → answer |
| s07 | 单跳 | 2 | fixed | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 1984 | 3639 | 3639 | 0 | 1 | answer |
| s07 | 单跳 | 3 | agentic | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 4162 | 6066 | 6066 | 0 | 2 | search+filterProducts → answer |
| s07 | 单跳 | 3 | fixed | DH-HP-1263 | DH-HP-1263 | ✓ | 1 | 1965 | 1770 | 1770 | 0 | 1 | answer |
| s08 | 单跳 | 1 | agentic | DH-XP-0716 | DH-XP-0716 | ✓ | 1 | 4189 | 6377 | 6377 | 0 | 2 | search+filterProducts → answer |
| s08 | 单跳 | 1 | fixed | DH-XP-0716 | DH-XP-0716 | ✓ | 1 | 1972 | 2413 | 2413 | 0 | 1 | answer |
| s08 | 单跳 | 2 | agentic | DH-XP-0716 | DH-XP-0716 | ✓ | 1 | 4179 | 9834 | 9834 | 0 | 2 | search+filterProducts → answer |
| s08 | 单跳 | 2 | fixed | DH-XP-0716 | DH-XP-0716 | ✓ | 1 | 1987 | 2937 | 2937 | 0 | 1 | answer |
| s08 | 单跳 | 3 | agentic | DH-XP-0716 | DH-XP-0716 | ✓ | 1 | 4201 | 6312 | 6312 | 0 | 2 | search+filterProducts → answer |
| s08 | 单跳 | 3 | fixed | DH-XP-0716 | DH-XP-0716 | ✓ | 1 | 1980 | 2071 | 2071 | 0 | 1 | answer |
| s09 | 单跳 | 1 | agentic | DH-BW-0543 | DH-BW-0543 | ✓ | 1 | 4451 | 8495 | 8495 | 0 | 2 | search → answer |
| s09 | 单跳 | 1 | fixed | DH-BW-0543 | DH-BW-0543 | ✓ | 1 | 2801 | 3128 | 3128 | 0 | 1 | answer |
| s09 | 单跳 | 2 | agentic | DH-BW-0543 | DH-BW-0543 | ✓ | 1 | 4462 | 6654 | 6654 | 0 | 2 | search → answer |
| s09 | 单跳 | 2 | fixed | DH-BW-0543 | DH-BW-0543 | ✓ | 1 | 2795 | 2077 | 2077 | 0 | 1 | answer |
| s09 | 单跳 | 3 | agentic | DH-BW-0543 | DH-BW-0543 | ✓ | 1 | 4424 | 4777 | 4777 | 0 | 2 | search → answer |
| s09 | 单跳 | 3 | fixed | DH-BW-0543 | DH-BW-0543 | ✓ | 1 | 2800 | 3228 | 3228 | 0 | 1 | answer |
| s10 | 单跳 | 1 | agentic | DH-XP-0827 | DH-XP-0827 | ✓ | 1 | 4309 | 6818 | 6818 | 0 | 2 | search → answer |
| s10 | 单跳 | 1 | fixed | DH-XP-0827 | DH-XP-0827,DH-HP-1152 | ✗ | 0.6667 | 2725 | 4140 | 4140 | 0 | 1 | answer |
| s10 | 单跳 | 2 | agentic | DH-XP-0827 | DH-XP-0827 | ✓ | 1 | 4327 | 7259 | 7259 | 0 | 2 | search → answer |
| s10 | 单跳 | 2 | fixed | DH-XP-0827 | DH-XP-0827,DH-HP-1152 | ✗ | 0.6667 | 2755 | 4581 | 4581 | 0 | 1 | answer |
| s10 | 单跳 | 3 | agentic | DH-XP-0827 | DH-XP-0827 | ✓ | 1 | 4313 | 5826 | 5826 | 0 | 2 | search → answer |
| s10 | 单跳 | 3 | fixed | DH-XP-0827 | DH-XP-0827 | ✓ | 1 | 2676 | 2645 | 2645 | 0 | 1 | answer |
| s11 | 单跳 | 1 | agentic | DH-BW-0654 | DH-BW-0654 | ✓ | 1 | 4118 | 9921 | 9921 | 0 | 2 | search → answer |
| s11 | 单跳 | 1 | fixed | DH-BW-0654 | DH-BW-0654 | ✓ | 1 | 2480 | 3570 | 3570 | 0 | 1 | answer |
| s11 | 单跳 | 2 | agentic | DH-BW-0654 | DH-BW-0654 | ✓ | 1 | 4165 | 7894 | 17910 | 1 | 2 | search → answer |
| s11 | 单跳 | 2 | fixed | DH-BW-0654 | DH-BW-0654 | ✓ | 1 | 2480 | 2768 | 2768 | 0 | 1 | answer |
| s11 | 单跳 | 3 | agentic | DH-BW-0654 | DH-BW-0654 | ✓ | 1 | 4145 | 6457 | 16482 | 1 | 2 | search → answer |
| s11 | 单跳 | 3 | fixed | DH-BW-0654 | DH-BW-0654 | ✓ | 1 | 2469 | 2195 | 2195 | 0 | 1 | answer |
| s12 | 单跳 | 1 | agentic | DH-TC-1248 | DH-TC-1248 | ✓ | 1 | 4321 | 9573 | 19589 | 1 | 2 | search+filterProducts → answer |
| s12 | 单跳 | 1 | fixed | DH-TC-1248 | DH-TC-1248 | ✓ | 1 | 2493 | 3009 | 3009 | 0 | 1 | answer |
| s12 | 单跳 | 2 | agentic | DH-TC-1248 | DH-TC-1248 | ✓ | 1 | 4320 | 6036 | 6036 | 0 | 2 | search+filterProducts → answer |
| s12 | 单跳 | 2 | fixed | DH-TC-1248 | DH-TC-1248 | ✓ | 1 | 2493 | 2857 | 2857 | 0 | 1 | answer |
| s12 | 单跳 | 3 | agentic | DH-TC-1248 | DH-TC-1248 | ✓ | 1 | 4393 | 9454 | 7211675 | 1 | 2 | search+filterProducts → answer |
| s12 | 单跳 | 3 | fixed | DH-TC-1248 | DH-TC-1248 | ✓ | 1 | 2490 | 300468 | 300468 | 0 | 1 | answer |
| s13 | 单跳 | 1 | agentic | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 4384 | 11528 | 11528 | 0 | 2 | search → answer |
| s13 | 单跳 | 1 | fixed | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 2870 | 4443 | 4443 | 0 | 1 | answer |
| s13 | 单跳 | 2 | agentic | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 5684 | 7269 | 17284 | 1 | 2 | search+search → answer |
| s13 | 单跳 | 2 | fixed | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 2871 | 3219 | 3219 | 0 | 1 | answer |
| s13 | 单跳 | 3 | agentic | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 4359 | 6427 | 6427 | 0 | 2 | search → answer |
| s13 | 单跳 | 3 | fixed | DH-BW-0321 | DH-BW-0321 | ✓ | 1 | 2856 | 2742 | 2742 | 0 | 1 | answer |
