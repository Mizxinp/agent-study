# 本地混合检索与重排

使用 16 份合成商品文档、112 块、48 个冻结查询，比较 BM25、BGE 向量、RRF/RSF 与 cross-encoder。所有推理在 CPU 本地运行，无 API key。

- `data/`：冻结数据；不应重建或修改。
- `lib/`：分词、BM25、融合、指标、模型适配器、共享流水线。
- `tests/`：无模型下载的单元测试。
- `scripts/eval.ts`：真实评测及增量 checkpoint。
- `app/`：Next 页面及 GET `/api/search?q=`。
- `results.json` / `results.md`：真实结果；`REPORT.md`：实验报告。

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm eval
pnpm start --port 3123
```

首次 eval 或搜索需要从 Hugging Face 下载公开模型到 `.model-cache/`。推理设置 2 个 CPU 线程，顺序 batch=4。可通过 `HF_ENDPOINT` 设置合法公开源；遇到明确拒绝时应停止，不得更换下载方式绕过。首次运行耗时与网络及 CPU 有关，失败详情保存在 `eval-error.json`；延迟进度在 `eval-checkpoint.json`，原始结果不可用伪造分数替代。

中断后可运行 `EVAL_RESUME=1 pnpm eval`；仅复用配置和数据 fingerprint 匹配的真实延迟记录，仍先执行完整 warmup。默认 `pnpm eval` 为全新评测。`pnpm exec tsx scripts/verify.ts` 依次验证五步，并把退出码和耗时写到 `verification.json`。

`pnpm eval`生成results.json和results.md；`pnpm report`读取结果及验证记录，幂等更新REPORT.md的HTML标记区间。当前协议raw-rrf30-full30-v2保存完整30条重排，页面/API仅显示5条；查询最多512字符。已有模型缓存时使用`MODELS_OFFLINE=1`禁止远程下载。
