# 混合检索与重排实验报告

所有主结果来自冻结标签下的本地真实推理；验证记录、模型配置及逐查询明细均保存在本目录。

## 做了什么与数据

实现 TypeScript 纯函数 BM25 Okapi、两种中文分词、余弦向量检索、RRF/RSF、AI SDK v4 本地模型适配器、共享检索流水线与四列搜索页面。评测覆盖 H1–H6，输出各类型、总体、逐查询命中、参数敏感性、延迟原始记录与确定性检查。

16 份合成商品文档、112 块，平均 133.47 字符。分块规则来自 `lib/chunk.ts:1–4`：最大160字符，复用上一块最后一句，只有该句不超过60字符且不超过总块长时才复用。数据在评测前的本地冻结提交：8c862f1f584f3f65a2e047fafbfe5fc8f732e9de；查询 finalizedAt 为 2026-11-17T21:49:56+08:00，在跑结果前已单独提交。未发布任何提交。每类16查询、共48条；单次运行，合成数据，样本量小。

正文含重复模板，无上下文块可能无法区分商品，这是 H4 的刻意条件，也是重要的数据质量局限。paraphrase 标签只按来源商品给出，同类跨商品可能提供相似答案，按当前政策仍算未命中；不得由结果倒推修改标签。

## 模型与实现

嵌入 Xenova/bge-small-zh-v1.5，q8，CLS pooling，normalize=true；查询前缀“为这个句子生成表示以用于检索相关文章：”，文档不加。经 AI SDK `embedMany()` 调用本地 EmbeddingModelV4，batch4，不并行；缓存 hash 包含模型、dtype、pooling、指令与完整文本。额外比较查询无前缀。

重排 Xenova/bge-reranker-base，q8，batch4 顺序执行，max_length=256；tokenizer text_pair，logits sigmoid。ONNX intraOpNumThreads=2、interOpNumThreads=1。模型单例懒加载，构建期不加载模型。

RRF rank从1起，分数 Σ1/(k+rank)。RSF 每路 min-max 后按 alpha 向量权重融合，恒定路为1，缺失路0；同分按 id 字典序。BM25 对查询 token 去重。完整公式为：

$$\mathrm{BM25}(q,d)=\sum_{t\in\mathrm{unique}(q)}\mathrm{idf}(t)\frac{f(t,d)(k_1+1)}{f(t,d)+k_1(1-b+b|d|/\mathrm{avgdl})},\quad \mathrm{idf}(t)=\ln\left(1+\frac{N-\mathrm{df}(t)+0.5}{\mathrm{df}(t)+0.5}\right)$$

其中 k1=1.2、b=0.75，N为块数，df为包含token的块数，f为词频，|d|和avgdl按token计。BM25保留零分文档补足top30；两路召回候选深度固定30，融合后再取前30重排。RRF只看rank，因此也会给零分文档rank贡献，这是当前实现的局限，未依据结果修改算法。所有类型按来源商品标注，相同事实若来自其他商品仍不算命中。未安装可选 jieba，按验收仅比 bigram 与 Intl.Segmenter。

<!-- GENERATED:START -->

## 结果 H1–H6

本次运行时间戳：2026-11-17 22:07:17 Asia/Shanghai（UTC+8）。完整按类型指标、所有参数及逐查询top5见 [results.md](results.md)；原始分数、延迟数组见 [results.json](results.json)。以下数字直接读取该文件。

### H1：融合优于单路——不支持

H1分三子项（recall@5）：(i) exact BM25 0.656250 < vector 0.750000，不支持精确查询BM25更优；(ii) paraphrase vector 0.375000 > BM25 0.218750，支持向量更优；(iii) hybrid总体0.437500 < vector 0.583333，不支持融合优于单路。

|方法|类型|recall@5|MRR@10|nDCG@5|
|---|---|---:|---:|---:|
|bm25|all|0.437500|0.394643|0.375293|
|bm25|exact|0.656250|0.665179|0.649178|
|bm25|paraphrase|0.218750|0.312500|0.232291|
|bm25|anaphora|0.437500|0.206250|0.244411|
|vector|all|0.583333|0.416055|0.427243|
|vector|exact|0.750000|0.573165|0.610199|
|vector|paraphrase|0.375000|0.438542|0.345887|
|vector|anaphora|0.625000|0.236458|0.325645|
|rrf-60|all|0.437500|0.376728|0.356629|
|rrf-60|exact|0.656250|0.629340|0.621094|
|rrf-60|paraphrase|0.218750|0.277778|0.208715|
|rrf-60|anaphora|0.437500|0.223065|0.240078|

### H2：k=60近优且参数不关键——不支持；alpha存在敏感性——支持

本例 k=1 的总体 recall@5 高于60，60与100相同，因此本数据不支持60近优。RSF在alpha=0.75时总体recall@5最高；这是在同一小测试集上的描述性选择，不是验证集调参结果，不可外推最佳权重。

|方法|类型|recall@5|MRR@10|nDCG@5|
|---|---|---:|---:|---:|
|rrf-1|all|0.562500|0.443287|0.444247|
|rrf-10|all|0.458333|0.407804|0.379277|
|rrf-60|all|0.437500|0.376728|0.356629|
|rrf-100|all|0.437500|0.376620|0.356629|

alpha敏感性表（alpha为向量权重）：

|方法|类型|recall@5|MRR@10|nDCG@5|
|---|---|---:|---:|---:|
|rsf-0|all|0.437500|0.394643|0.375293|
|rsf-0.25|all|0.541667|0.428902|0.427417|
|rsf-0.5|all|0.583333|0.439368|0.448793|
|rsf-0.75|all|0.614583|0.440013|0.460081|
|rsf-1|all|0.583333|0.416055|0.427243|

### H3：重排改善——支持本样本结果，泛化不确定

仅对原始text的RRF(k=60)前30候选交叉编码重排并保留全部30条；页面/API仍仅展示前5。recall@5和nDCG@5用前5，MRR@10用前10，计时包含全部排序。

|方法|类型|recall@5|MRR@10|nDCG@5|
|---|---|---:|---:|---:|
|rrf-60|all|0.437500|0.376728|0.356629|
|rrf-60|exact|0.656250|0.629340|0.621094|
|rrf-60|paraphrase|0.218750|0.277778|0.208715|
|rrf-60|anaphora|0.437500|0.223065|0.240078|
|rerank|all|0.656250|0.598669|0.590984|
|rerank|exact|0.718750|0.691319|0.673357|
|rerank|paraphrase|0.375000|0.404167|0.360629|
|rerank|anaphora|0.875000|0.700521|0.738967|

|类型|Δrecall@5|ΔMRR@10|ΔnDCG@5|
|---|---:|---:|---:|
|all|0.218750|0.221941|0.234355|
|exact|0.062500|0.061979|0.052263|
|paraphrase|0.156250|0.126389|0.151914|
|anaphora|0.437500|0.477455|0.498889|

一整轮全部48查询warmup，不计入延迟；随后3轮，每轮48条，共144条实际推理记录。百分位采用nearest-rank（排序后ceil(p*n)项），单位ms。

|轮次|n|p50|p95|mean|
|---|---:|---:|---:|---:|
|1|48|619.774763|698.009317|631.503676|
|2|48|630.864086|705.118892|632.729742|
|3|48|630.392696|720.661413|637.494150|
|合并|144|629.693830|706.264452|633.909189|

机器：Intel(R) Xeon(R) Processor，8逻辑核，总内存15.63 GiB，linux，Node v24.22.1；ONNX设置 {"intraOpNumThreads":2,"interOpNumThreads":1}。延迟包含SDK、tokenize、batch推理和排序，不含查询嵌入与最初召回。无并行查询。

### H4：确定性上下文改善指代检索——支持本样本结果

这是Contextual Retrieval的低成本确定性变体；无LLM。anaphora所有三路均达到1，但重复模板与商品标题捷径使此结果不能泛化到真实语料；context-vector在exact类也出现下降，不能宣称所有类型都受益。

|方法|类型|recall@5|MRR@10|nDCG@5|
|---|---|---:|---:|---:|
|bm25|all|0.437500|0.394643|0.375293|
|bm25|exact|0.656250|0.665179|0.649178|
|bm25|paraphrase|0.218750|0.312500|0.232291|
|bm25|anaphora|0.437500|0.206250|0.244411|
|context-bm25|all|0.729167|0.701389|0.686512|
|context-bm25|exact|0.968750|1.000000|0.975822|
|context-bm25|paraphrase|0.218750|0.312500|0.239965|
|context-bm25|anaphora|1.000000|0.791667|0.843750|
|vector|all|0.583333|0.416055|0.427243|
|vector|exact|0.750000|0.573165|0.610199|
|vector|paraphrase|0.375000|0.438542|0.345887|
|vector|anaphora|0.625000|0.236458|0.325645|
|context-vector|all|0.781250|0.607259|0.622506|
|context-vector|exact|0.468750|0.241567|0.241559|
|context-vector|paraphrase|0.875000|0.642708|0.672093|
|context-vector|anaphora|1.000000|0.937500|0.953866|
|rrf-60|all|0.437500|0.376728|0.356629|
|rrf-60|exact|0.656250|0.629340|0.621094|
|rrf-60|paraphrase|0.218750|0.277778|0.208715|
|rrf-60|anaphora|0.437500|0.223065|0.240078|
|context-rrf|all|0.781250|0.678125|0.694825|
|context-rrf|exact|1.000000|0.854167|0.892616|
|context-rrf|paraphrase|0.343750|0.284375|0.269243|
|context-rrf|anaphora|1.000000|0.895833|0.922616|

### H5：分词影响——支持有小幅差异，优劣泛化不确定

Intl.Segmenter相对bigram的总体recall@5小幅上升，exact和paraphrase没有改变。只比较这两种分词，不增加jieba。

|方法|类型|recall@5|MRR@10|nDCG@5|
|---|---|---:|---:|---:|
|bm25|all|0.437500|0.394643|0.375293|
|bm25|exact|0.656250|0.665179|0.649178|
|bm25|paraphrase|0.218750|0.312500|0.232291|
|bm25|anaphora|0.437500|0.206250|0.244411|
|segmenter|all|0.458333|0.364120|0.363831|
|segmenter|exact|0.656250|0.647569|0.641504|
|segmenter|paraphrase|0.218750|0.252083|0.187954|
|segmenter|anaphora|0.500000|0.192708|0.262034|

分词示例：

- 德化白瓷茶具 DH-TC-0915
  - bigram：["德化","化白","白瓷","瓷茶","茶具","dh-tc-0915","dh","tc","0915"]
  - Intl：["dh-tc-0915","dh","tc","0915","德","化","白","瓷","茶具"]

- 温水清洗，180ml
  - bigram：["温水","水清","清洗","180ml"]
  - Intl：["温水","清洗","180ml"]

额外消融：本样本不支持“加BGE前缀必然提高recall”。主结果遵循模型卡加前缀，无前缀仅是消融。

|方法|类型|recall@5|MRR@10|nDCG@5|
|---|---|---:|---:|---:|
|vector|all|0.583333|0.416055|0.427243|
|vector|exact|0.750000|0.573165|0.610199|
|vector|paraphrase|0.375000|0.438542|0.345887|
|vector|anaphora|0.625000|0.236458|0.325645|
|vector-no-prefix|all|0.604167|0.406771|0.430001|
|vector-no-prefix|exact|0.781250|0.576042|0.617873|
|vector-no-prefix|paraphrase|0.406250|0.426563|0.361741|
|vector-no-prefix|anaphora|0.625000|0.217708|0.310390|

### H6：SDK行为——支持接口编排与索引校验，不支持核心自动排序

实测正常适配器排序且topN与文档映射正确；故意未排序的[.1,.9]原样保留；越界99抛AI_InvalidResponseDataError；空documents不调用doRerank（计数器0）。测试还确认adapter的topN、空分数、数量不匹配和非有限分数验证。排序是适配器责任。

以下引用均来自实际安装ai@7.0.173，直接采用提供方ranking，map映射；独立校验索引，空列表提前返回。

`node_modules/ai/dist/index.js:20578–20578`：
```js
					const ranking = modelResponse.ranking;
```

`node_modules/ai/dist/index.js:20634–20638`：
```js
					ranking: ranking.map((ranking) => ({
						originalIndex: ranking.index,
						score: ranking.relevanceScore,
						document: documents[ranking.index]
					})),
```

`node_modules/ai/dist/index.js:20658–20662`：
```js
function validateRankingIndices({ ranking, documents }) {
	for (const { index } of ranking) if (!Number.isInteger(index) || index < 0 || index >= documents.length) throw new InvalidResponseDataError$1({
		data: ranking,
		message: `Invalid ranking index ${index}. Expected an integer between 0 and ${documents.length - 1}.`
	});
```

`node_modules/ai/dist/index.js:20477–20477`：
```js
	if (documents.length === 0) {
```

`node_modules/ai/dist/index.js:20513–20522`：
```js
		return new DefaultRerankResult({
			originalDocuments: [],
			ranking: [],
			providerMetadata: void 0,
			response: {
				timestamp: /* @__PURE__ */ new Date(),
				modelId: model.modelId
			}
		});
	}
```

node_modules/@ai-sdk/provider/dist/index.d.ts:6051–6074规定提供方ranking应降序；6107–6123定义RerankingModelV4。

embedMany()在node_modules/ai/dist/index.js:13420；本地EmbeddingModelV4声明maxEmbeddingsPerCall=4、supportsParallelCalls=false，由SDK分批调用。cosineSimilarity在同文件14840行，计算点积除以范数乘积，lib/vector.ts直接调用该导出。

## 标注修正

未发现。未改原始标签。paraphrase仅按来源商品标注，跨商品相似答案是已知政策局限。若后续发现疑点，只允许独立data/label-corrections.json（query id到修正relevant数组映射），eval同时输出原始和修正metrics，冻结标签仍为主结果。

## 怎么跑与依赖

Node v24.22.1，pnpm 10.34.6。

`pnpm install && pnpm test && pnpm typecheck && pnpm build && pnpm eval`

启动：`pnpm start --port 3123`；访问页面或 `curl --get --data-urlencode 'q=DH-TC-0915的标称容积是多少？' http://localhost:3123/api/search`。本次复核设置MODELS_OFFLINE=1，禁止模型远程下载，默认全新评测且未使用恢复。评测后运行`pnpm report`更新本报告。构建阶段不下载/加载模型。test共24个用例，均不下载模型。eval预期输出results.json、results.md、eval-checkpoint.json，每条查询/每轮有进度；恢复中断用`EVAL_RESUME=1 pnpm eval`，仅接受数据及配置fingerprint匹配的checkpoint，恢复仍先预热全部查询。

评测时缓存目录：`/workspace/agent-study/bot/2026-11-17-hybrid-retrieval-rerank/.model-cache`；`du -sk` 输出：`316776	/workspace/agent-study/bot/2026-11-17-hybrid-retrieval-rerank/.model-cache`（KiB）。模型q8 ONNX文件分别24,010,842与279,301,077字节，加上tokenizer/config约308 MiB；嵌入缓存另约3.3 MiB。下载走默认huggingface.co，未用镜像，未遇明确访问拒绝。首轮含首次下载的完整评测耗时见下面记录；下载子阶段没有独立计时，不将总时长冒充纯下载耗时。HF_ENDPOINT可配置合法公开源，但明确403或网络拒绝后不得切源绕过。

首次完整评测（含下载、初始化、预热与3轮测量）：135.205秒。

当前results对应评测：124.873秒。

|命令|exit code|耗时秒|
|---|---:|---:|
|pnpm install|0|0.540|
|pnpm test|0|0.996|
|pnpm typecheck|0|0.657|
|pnpm build|0|2.808|
|pnpm eval|0|126.006|

API实测：HTTP 200，四路条数 {"bm25":5,"vector":5,"rrf":5,"rerank":5}，缺q状态 400，超长状态 400；服务已关闭。

### 依赖精确版本

版本同时核对package.json与pnpm-lock.yaml解析项。

|包|package.json固定版本|安装/lockfile实际版本|
|---|---|---|
|next|16.4.6|16.4.6|
|react|19.3.1|19.3.1|
|react-dom|19.3.1|19.3.1|
|ai|7.0.173|7.0.173|
|@ai-sdk/provider|4.0.38|4.0.38|
|@huggingface/transformers|4.3.2|4.3.2|
|typescript|7.0.2|7.0.2|
|@types/node|26.6.6|26.6.6|
|@types/react|19.3.0|19.3.0|
|@types/react-dom|19.3.0|19.3.0|
|vitest|5.1.0|5.1.0|
|tsx|4.23.15|4.23.15|
|onnxruntime-node|传递依赖|1.30.0|
|sharp|传递依赖|0.35.5|
|protobufjs|传递依赖|7.6.6|

包管理器10.34.6；pnpm.onlyBuiltDependencies已允许onnxruntime-node、sharp、protobufjs。已实际执行onnxruntime-node/protobufjs postinstall。

同一输入真实推理两次：嵌入最大绝对差 0，重排sigmoid分数最大绝对差 0；仅说明该输入和本次配置观测为确定，非跨硬件保证。

## 评测协议修正（非标注修正）

旧协议raw-rrf30-top5-v1虽给同样30候选打分，但SDK topN=5截断了用于MRR@10的列表，漏计第6–10名。新协议raw-rrf30-full30-v2完整保留30条，重新预热并真实测量3轮；标签、候选、模型打分均不变。原实验结果保留：[原results.md](artifacts/initial-top5-only/results.md)、[原results.json](artifacts/initial-top5-only/results.json)、[原verification](artifacts/initial-top5-only/verification.json)、[首次下载运行](artifacts/first-run.json)。

|类型|旧MRR@10（被截断）|新MRR@10|旧recall@5|新recall@5|旧nDCG@5|新nDCG@5|
|---|---:|---:|---:|---:|---:|---:|
|all|0.582986|0.598669|0.656250|0.656250|0.590984|0.590984|
|exact|0.668750|0.691319|0.718750|0.718750|0.673357|0.673357|
|paraphrase|0.387500|0.404167|0.375000|0.375000|0.360629|0.360629|
|anaphora|0.692708|0.700521|0.875000|0.875000|0.738967|0.738967|

<!-- GENERATED:END -->

## 可复现性与局限

无随机采样，检索同分按 id；重排同分保持输入候选顺序（输入已稳定）。每轮每查询打印进度，并增量写 checkpoint。延迟先完整 warmup 一轮再测3轮，CPU本地运行，不能外推其他硬件。新协议保存完整30条重排，MRR@10使用前10，历史截断结果仅作为协议修正对照。ONNX 确定性用同一输入真实重复推理两次比较最大绝对误差。

H4 是 Contextual Retrieval 的低成本确定性变体，用标题、型号与小节拼接，不使用 LLM 生成上下文，不可直接复现或宣称 Anthropic 结果。

参考：[Anthropic](https://www.anthropic.com/engineering/contextual-retrieval)、[RRF SIGIR 2009](https://cormack.uwaterloo.ca/cormack/cormacksigir09-rrf.pdf)、[Weaviate](https://weaviate.io/blog/hybrid-search-explained)、[BGE 嵌入模型卡](https://huggingface.co/BAAI/bge-small-zh-v1.5)、[BGE 重排模型卡](https://huggingface.co/BAAI/bge-reranker-base)、[AI SDK reranking](https://ai-sdk.dev/docs/ai-sdk-core/reranking)。

指定背景参考：[Weaviate hybrid search](https://docs.weaviate.io/weaviate/concepts/search/hybrid-search)、[BGE v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3)、[AI SDK reranking](https://ai-sdk.dev/docs/ai-sdk-core/reranking)。v2-m3仅作背景阅读，本实验实际用Xenova/bge-reranker-base。已安装ai@7.0.173；评审指定commit为0e8e0543aeda7d4dd4ce6eade0d5b7d5a43644c1，已从该commit读取 `packages/ai/src/rerank/rerank.ts` 与 `packages/ai/src/embed/embed-many.ts`，并与安装包 `dist/index.js.map` 的对应 sourcesContent 逐字节比对，两文件一致（SHA-256见 [source-verification.json](source-verification.json)）。这验证这两个函数源码对应关系，不声称对整包做了逐文件核验。H6证据针对实际安装版本。

## 独立复核与就绪状态

- Codex CLI 烟雾测试成功；Cloudflare egress `loc=US`，无需任何地域绕过。主要实现与修正经 Codex 完成，再由协调执行者复核。
- 编码代理依据自建合成事实逐条编写并核对标签，未使用检索分数或事后模型判分来改标；这不是人类受试者标注的真实业务数据集。冻结后 docs/chunks/queries 的 SHA-256 未变。
- 独立重算 checkpoint 中17种方法×4类×3指标，共204项与 results.json 一致（容差 1e-12）；协议修正前后48条重排 top5 的 ID、分数和标签逐项完全一致。原始结果在 artifacts/ 中保留。
- 模型缓存不提交；[model-manifest.json](model-manifest.json) 记录本次下载的8个模型/tokenizer/config文件的字节数及SHA-256，便于发现以后远端 `main` 更新。模型下载没有固定 revision，严格跨时间复现时需比对该清单。
- 事后描述性分层（不是预注册假设，不用于替代H1）：exact中答案块确实含型号的10条，BM25/vector/RRF recall@5分别为1.00/0.90/1.00；其他6条答案块缺型号，使主H1同时混入上下文缺失。未改任何标签或主结果，样本很小，不能据此重写H1结论。
- 当前仅本地就绪；未push、发布、合并或创建PR，等待用户授权。11-15/11-16/已有11-17目录和本地main未修改。
