# 本地多模态检索对比（合成陶瓷商品图）

用程序生成的陶瓷商品图，在中文、本地 CPU、无 API key 条件下对比：

- 字幕/标题文本检索（`Xenova/bge-small-zh-v1.5`）
- 视觉检索（`Xenova/chinese-clip-vit-base-patch16`，图向量与中文文本查询同一空间）
- 简单融合（同一 CLIP 空间内，标题短说明与图向量 L2 平均）

数据全部为合成图，不是爬取的实物照片。字幕故意只写品类、型号、容量和口径，不写釉色和器型。

完整实验说明、依赖版本、复现命令和评测数字见 [REPORT.md](REPORT.md)。查询集冻结于 `data/queries.json`（`frozenAt`）。

```bash
pnpm install && pnpm test && pnpm typecheck && pnpm build && pnpm eval
```

启动页面：`pnpm images && pnpm dev`（或 `pnpm start`）。检索走 `POST /api/search`，不要把查询放到过长的 GET query string。
