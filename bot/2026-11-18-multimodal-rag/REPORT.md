# 本地多模态检索对比报告

用程序合成的陶瓷商品图，在中文、本地 CPU、无 API key 条件下，对比字幕/标题文本检索、视觉检索与简单融合。本目录是独立 demo，没有改动 11-15 / 11-16 / 11-17 的代码或报告。

数据全部为合成图（色块表示釉色、几何轮廓表示器型、图上印刷型号与容量），不是爬取的实物照片。字幕故意只写品类、型号、容量和口径，不写釉色和器型口语，以便外观问句上文本路更难、视觉路更有机会成功。16 个型号及容量/口径与 2.1 混合检索 demo 的同型号虚构规格对齐；釉色与器型是本实验新设计的视觉属性。

**样本很小（16 个 SKU、40 条查询），以下数字只在本合成集上成立，不能外推到真实商品图或大规模检索。**

## 结论一览

查询集在评测前冻结：`data/queries.json` 的 `frozenAt` 为 **2026-11-18 09:09:12 Asia/Shanghai**。冻结提交为 `af5c676`（2026-11-18 09:12:11 Asia/Shanghai）。首次评测于 **2026-11-18 09:14:01 Asia/Shanghai**，没有在看到结果后改标注。

| 假设 | 结论 | 关键数字（recall@5） |
|---|---|---|
| H1 外观问句：视觉优于字幕/标题文本检索 | **支持** | vision=0.8125，text-bge=0.3125，text-clip=0.3929 |
| H2 属性问句：文本检索不低于视觉检索 | **支持** | text-bge=1.0000，text-clip=0.5714，vision=0.5000 |
| H3 以图搜图：视觉把目标属性相同商品排进 top5，字幕检索不应轻易打平 | **支持** | vision=0.6389，caption-bge=0.3333，caption-clip=0.3611，tied=false |
| H4 融合相对纯图、纯文本 | **不确定** | 外观：fusion=0.7679（低于 vision 0.8125，高于文本）；属性：fusion=0.4286（低于 text-bge 1.0000 与 vision 0.5000） |
| H5 对齐单元测试，不下载视觉模型 | **支持** | `pnpm test` 5 个文件、9 个用例全部通过 |

完整逐查询明细见 `results.md`，机器可读结果见 `results.json`。

## 做了什么

- 可复现脚本 `scripts/generate-images.ts`（纯函数在 `lib/generate-image.ts`）：用 sharp 渲染 SVG，固定路径、无随机数。字体默认 `/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf`，可用 `FONT_PATH` 覆盖。16 张 512×512 PNG 已提交在 `public/images/`（合计约 430KB），以保证跨机器字体栅格差异不改视觉向量；若缺失可 `pnpm images` 重建。
- 4 种釉色 × 4 种器型：粉青、霁红、天青开片、米色开片；梅瓶、玉壶春瓶、天球瓶、斗笠盏。
- 40 条手工标注查询：外观 14、属性 14、以图搜图 12。以图搜图排除查询图自身，相关项是「同釉色不同器型」或「同器型不同釉色」的另外 3 件。
- 检索路：
  - `text-bge`：`Xenova/bge-small-zh-v1.5`（q8，CLS pooling，查询加前缀「为这个句子生成表示以用于检索相关文章：」，文档不加）。
  - `text-clip`：同一中文 CLIP 的文本塔，对字幕/短说明编码，无指令前缀。
  - `vision`：中文 CLIP 图向量。文本查询走文本塔，以图搜图走图像塔，同一 512 维空间，余弦相似度。
  - `fusion`：同一 CLIP 空间内，把「标题+短说明」文本向量与图向量各自 L2 归一化后相加再归一化（等价于简单平均）。
- 最小页面 + `POST /api/search`（不要把查询放进过长的 GET query string）。可输入中文文本或上传查询图，并排显示文本路 / 视觉路 / 融合路的 top5。不是聊天产品。
- H5：自写最小对齐函数 `lib/google-align.ts`，用假的 `EmbeddingModelV4` 和自定义 fetch 覆盖「`providerOptions.google.content` 必须与 `values` 等长，否则抛错」；并覆盖「`values` 为空字符串时 parts 只有图，非空时文本 part 在前」。不调用任何真实 API。

## 模型与缓存

| 模型 | 用途 | dtype | 文本前缀 | 图像预处理 | 来源 |
|---|---|---|---|---|---|
| `Xenova/bge-small-zh-v1.5` | 中文文本对照路 | q8（`model_quantized.onnx`，24,010,842 字节） | 查询使用上述检索前缀；文档不用 | 无 | Hugging Face；本机若已有 2.1 demo 的 `.model-cache` 会只读复制到本目录，不写回 2.1 |
| `Xenova/chinese-clip-vit-base-patch16` | 视觉路与融合（图/文同一空间） | q8（`model_quantized.onnx`，190,842,404 字节） | 无 | `AutoProcessor`，resize/center-crop 到 224，CLIP 均值方差 | 本次从 https://huggingface.co/Xenova/chinese-clip-vit-base-patch16 下载 |

- 缓存目录：本 demo 下的 `.model-cache/`（不提交）。本次缓存合计约 207MB（217,052,975 字节），其中两个 ONNX 权重约占 215MB。文件 SHA256 见 `model-manifest.json`。
- 该中文 CLIP 的 q8 ONNX 是单会话联合图，一次 forward 必须同时提供文本输入和 `pixel_values`。编码单一模态时，未用到的塔会传入占位输入（文本为 `"."`，图像为 8×8 空白图）。探测确认：同一段文本换占位图后 `text_embeds` 不变，同一张图换占位文本后 `image_embeds` 不变；向量已近似 L2 归一化。
- 允许设置 `HF_ENDPOINT`。若官方源返回 403，不得换镜像绕过；本次 huggingface.co 可访问，未设置镜像。
- 推理线程限制为 `intraOpNumThreads=2, interOpNumThreads=1`，避免占满 CPU。
- 未改用任何付费/远程 embedding API，也没有用假向量冒充评测结果。

## H1 外观问句（n=14）

| 路 | recall@5 | MRR@5 | nDCG@5 |
|---|---:|---:|---:|
| text-bge | 0.3125 | 0.3893 | 0.2857 |
| text-clip | 0.3929 | 0.3536 | 0.3222 |
| vision | 0.8125 | 0.9524 | 0.8402 |
| fusion | 0.7679 | 0.8095 | 0.7102 |

视觉 recall@5 和 nDCG@5 都明显高于两条文本路，假设成立。组合问句如「霁红的斗笠盏」「米色开片天球瓶」视觉可达 1.0，而 BGE 常常为 0（字幕里本来就没有这些词）。需要注意：

- 「带开片纹理的釉面」「釉面光洁没有开片的」各有 8 个相关 SKU，recall@5 理论上限是 5/8=0.625。
- 「有没有粉青色的瓷器」视觉 recall@5 只有 0.5000，会把部分天青色瓶子排进 top5（粉青与天青在合成色块上较近）。

## H2 属性问句（n=14）

| 路 | recall@5 | MRR@5 | nDCG@5 |
|---|---:|---:|---:|
| text-bge | 1.0000 | 0.8393 | 0.8802 |
| text-clip | 0.5714 | 0.2905 | 0.3597 |
| vision | 0.5000 | 0.2500 | 0.3132 |
| fusion | 0.4286 | 0.3179 | 0.3441 |

BGE 文本路 recall@5=1.0000，不低于视觉 0.5000，假设成立。型号、容量、口径都写在字幕里，且每项唯一，BGE 足够把目标送进 top5。视觉路大约一半问句能靠图上印刷文字命中，对「口径 8.2cm」「1200毫升」这类问句较弱。CLIP 文本塔好于纯视觉，但仍明显低于 BGE。

## H3 以图搜图（n=12，排除查询图自身）

| 路 | recall@5 | MRR@5 | nDCG@5 |
|---|---:|---:|---:|
| text-bge | 0.3333 | 0.5167 | 0.3301 |
| text-clip | 0.3611 | 0.4611 | 0.3257 |
| vision | 0.6389 | 0.6306 | 0.5685 |
| fusion | 0.6667 | 0.6514 | 0.5915 |

视觉平均 recall@5=0.6389，高于只用查询图字幕检索的 0.3333 / 0.3611，且没有打平，假设总体支持。每条查询有 3 个相关 SKU、k=5，并不是每条都能把 3 个都排进 top5：例如同釉色检索里，有的只有 1/3 进入 top5（器型差异大时更难）。融合在这一组上略高于纯视觉（0.6667 vs 0.6389）。

## H4 融合

预期本身不确定，结论记为**不确定**。

- 外观问句：fusion=0.7679，接近但略低于纯视觉 0.8125，明显高于文本。
- 属性问句：fusion=0.4286，低于纯视觉 0.5000，更远低于 BGE 文本 1.0000。融合发生在 CLIP 空间，吃不到 BGE 对型号/容量的优势；平均进图向量还会冲淡 CLIP 文本塔里对印刷文字的信号。

没有使用付费多模态融合 API。

## H5 单元测试

`pnpm test` 不下载、不加载视觉模型。覆盖：

- 指标手算（recall / MRR / nDCG）
- 融合与排序纯函数
- 查询冻结、字幕外观词泄漏检查
- 合成图 SVG 可复现
- 假 `EmbeddingModelV4` + 自定义 fetch：`providerOptions.google.content` 与 `values` 不等长则抛错；空字符串 values 只有图 part，非空则文本 part 在前

## 如何复现

环境（本次实测）：

- Node v24.22.1，pnpm 10.34.6
- Linux，8 核 Intel Xeon，15.6 GiB 内存
- 无 API key，未设置 `OPENAI_API_KEY` / `HF_TOKEN`
- 系统字体：`/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf`（已提交 PNG 时不需要重绘也能评测）

依赖均钉死精确版本（见 `package.json` / `pnpm-lock.yaml`）：

- next 16.4.6，react / react-dom 19.3.1，ai 7.0.173（不要升到 7.0.176），@ai-sdk/provider 4.0.38，@huggingface/transformers 4.3.2，sharp 0.35.5
- dev：typescript 7.0.2，vitest 5.1.0，tsx 4.23.15，@types/node 26.6.6，@types/react 19.3.0，@types/react-dom 19.3.0

命令（在本目录）：

```bash
pnpm install && pnpm test && pnpm typecheck && pnpm build && pnpm eval
```

- `pnpm test`：5 个文件、9 个用例通过，不下载视觉模型。
- `pnpm typecheck`：`tsc --noEmit` 无报错。
- `pnpm build`：Next.js 16.4.6 生产构建成功；`POST /api/search` 为动态路由。构建阶段不下载/加载模型。
- `pnpm images`：若 `public/images/` 缺失则重建 16 张合成图。
- `pnpm eval`：真实跑 H1–H4，写出 `results.json` 与 `results.md`。本地复核若模型已在 `.model-cache/`，可设 `MODELS_OFFLINE=1` 禁止远程下载。
- 页面：`pnpm start --port 3124` 后打开首页，或 `curl -X POST -F 'q=有没有粉青色的瓷器' http://localhost:3124/api/search`。

本次 `pnpm eval` 在模型文件与嵌入缓存都已就绪时耗时 **7.365s**。首次在空缓存上还需要从 Hugging Face 下载上述两个量化模型（合计约 215MB），下载时间取决于网络。按同一提交的合成图和同一量化权重重跑，应得到同样的 recall@5 数字。

不提交 `node_modules/`、`.next/`、`.model-cache/`、`.env`。不要把密钥写进仓库。本任务也不需要密钥。
