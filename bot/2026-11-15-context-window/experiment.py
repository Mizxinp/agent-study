"""
最小实验：长对话"长期事实回忆"下 4 种上下文管理策略的 token 占用 vs 事实召回率。
- 无 LLM、无付费 API；token 计数用 tiktoken o200k_base（GPT-4o/4.1 系列分词器，作为通用近似）。
- 指标是"上下文级召回"：问题提出时，喂给模型的上下文里是否包含该事实的【最新正确值】
  （必要条件，不等于模型一定答对）；同时统计"冲突"：上下文同时含有过期值/干扰值。
"""
import random, re, json, math, statistics, sys
from collections import Counter
import tiktoken, jieba
from rank_bm25 import BM25Okapi

jieba.setLogLevel(60)
ENC = tiktoken.get_encoding("o200k_base")
def ntok(s): return len(ENC.encode(s))

# ---------- 合成数据：一个 1688 批发客户与德化陶瓷店客服的长期多轮对话 ----------
SLOTS = {
    "收货城市":   ["泉州", "厦门", "成都", "杭州", "郑州", "昆明", "西安", "长沙", "南宁", "合肥"],
    "釉色":       ["中国白", "青花", "天目黑", "汝窑天青", "哑光米黄", "霁蓝", "窑变红"],
    "订购数量":   ["120套", "200套", "350套", "500套", "800套", "1000套"],
    "单价预算":   ["18元", "25元", "32元", "45元", "60元", "88元"],
    "发票抬头":   ["闽南茶仓贸易有限公司", "蜀山茶馆管理有限公司", "西湖礼品有限公司", "中原酒店用品有限公司", "滇红文化传播有限公司"],
    "交货日期":   ["12月5日", "12月18日", "1月8日", "1月20日", "2月3日"],
    "Logo工艺":   ["釉下彩印", "釉上贴花", "激光雕刻", "金边描字"],
    "包装要求":   ["牛皮纸盒", "天地盖礼盒", "珍珠棉内托", "木箱"],
    "联系人电话": ["138%04d%04d", "159%04d%04d", "186%04d%04d"],
    "器型":       ["盖碗", "主人杯", "公道杯", "侧把壶", "香炉"],
    "开票税点":   ["3个点", "6个点", "9个点", "13个点"],
    "物流方式":   ["德邦物流", "顺丰快运", "专线零担", "自提"],
}
STATE_TPL = ["我们这边{slot}定一下，是{val}。", "记一下，我的{slot}是{val}。", "{slot}就按{val}来。"]
UPDATE_TPL = ["不好意思，{slot}要改一下，改成{val}，之前那个作废。", "更正：{slot}换成{val}。"]
DISTRACT_TPL = ["我朋友上次在别家订，{slot}是{val}，你们参考下就行，不是我们的。",
                "隔壁店的客户{slot}好像是{val}，跟我们无关。"]
ASSIST_ACK = ["好的，已记录。", "收到，我这边备注好了。", "明白，稍后给您确认单。"]
FILLER_U = ["德化白瓷和景德镇的有什么区别？", "你们仓库周末有人吗？", "这款{q}烧成温度多少度？",
            "{q}能不能放洗碗机？", "最近窑厂排期紧不紧？", "样品能先寄一个吗？运费谁出？",
            "高白泥和普通白泥差价大吗？", "{q}的容量大概多少毫升？", "你们有没有做过酒店的单子？",
            "拼多多店和1688店价格一样吗？", "釉面有针孔算不算质量问题？", "{q}底款可以定制吗？"]
FILLER_A = ["德化白瓷以高白、温润著称，胎质细腻，透光性好；景德镇品类更杂，彩瓷更多。具体看您的用途，茶具礼品选德化比较多。",
            "仓库周末正常发货，店面周日下午休息，有急事可以直接电话联系。我们一般当天下午四点前的单子当天出库。",
            "常规高温白瓷烧成温度在1300度左右，釉面硬度高，日常使用不容易划伤，也比较好清洗。",
            "可以放洗碗机，但描金描银的款式建议手洗，避免金边磨损，长期机洗会让金线变暗。",
            "这两个月是旺季，窑厂排期大概要两到三周，定制款会更久一些，建议尽早确认打样。",
            "样品可以先寄，样品费下单后可抵扣，运费第一次我们承担，后续寄样需要您到付。",
            "高白泥成本高一些，大约贵15%到20%，但白度和透光度明显更好，送礼客户更喜欢。",
            "常见的规格是110到150毫升，我们也可以按您的需求开模，开模费另算，量大可以减免。",
            "做过不少酒店和茶馆的单子，可以提供案例图片，也支持统一刻字和定制包装。",
            "两个店价格体系不同，1688主要是批发价，起订量更高；拼多多是零售价，单件也能买。",
            "少量针孔属于正常工艺现象，如果影响使用或者数量超出约定比例，我们包退换。",
            "底款可以定制，一般用釉下彩印或者金边描字，起订量在100件以上比较划算。"]

NOISY_U = ["上周发{city}那批{q}，物流单号{num}查不到了，帮忙看下？", "{q}有没有{glaze}的现货？大概要{qty}。",
           "你们{q}批发价{price}能不能再便宜点？", "{city}有个茶馆问{q}，{qty}起订吗？", "SKU DH-{num4} 的{q}还有货吗？",
           "上次那个{pack}的样式挺好看，{price}一个是吧？", "{logo}的效果图能不能发我看看？", "{city}那边最近{ship}慢不慢？"]
NOISY_A = ["帮您查了，单号{num}在{city}中转，预计明后天到。", "{glaze}的{q}现货不多，{qty}需要排产大约两周。",
           "{q}批发价{price}已经是底价了，量到{qty}可以再谈。", "{qty}起订的，{city}的客户可以走{ship}。",
           "DH-{num4} 还有库存，{glaze}款剩得不多。", "对，{pack}单价{price}，{logo}另算。",
           "{logo}的效果图稍后发您，打样一般三到五天。", "{ship}到{city}一般三到四天，旺季会慢一点。"]

def gen_conversation(seed, n_filler=260, n_updates=8, n_distract=10, noisy=True):
    rng = random.Random(seed)
    def val(slot):
        v = rng.choice(SLOTS[slot])
        return v % (rng.randint(0, 9999), rng.randint(0, 9999)) if "%" in v else v
    events = []
    truth, history_vals = {}, {s: [] for s in SLOTS}
    # 初始陈述
    for s in SLOTS:
        events.append(("state", s, val(s)))
    for _ in range(n_updates):
        events.append(("update", rng.choice(list(SLOTS)), None))
    for _ in range(n_distract):
        events.append(("distract", rng.choice(list(SLOTS)), None))
    rng.shuffle(events)
    # 保证 update 在该 slot 的 state 之后：简单处理——把 state 排到前 60% 的随机位置
    fillers = list(range(n_filler))
    timeline = []
    states = [e for e in events if e[0] == "state"]
    others = [e for e in events if e[0] != "state"]
    # 放置：state 均匀散布在全程，update/distract 随机
    slots_pos = sorted(rng.sample(range(n_filler), len(events)))
    rng.shuffle(states)
    seq = states + others
    # 让 others 尽量靠后：按位置排序后把 state 放前段
    seq_sorted = []
    st_i, ot_i = 0, 0
    for i, p in enumerate(slots_pos):
        frac = i / len(slots_pos)
        if (st_i < len(states) and (frac < 0.7 or ot_i >= len(others))) :
            seq_sorted.append((p, states[st_i])); st_i += 1
        else:
            seq_sorted.append((p, others[ot_i])); ot_i += 1
    pos_map = dict()
    for p, e in seq_sorted: pos_map.setdefault(p, []).append(e)
    msgs = []
    for t in range(n_filler):
        q = rng.choice(SLOTS["器型"])
        if noisy and rng.random() < 0.5:
            kw = dict(q=q, city=rng.choice(SLOTS["收货城市"]), glaze=rng.choice(SLOTS["釉色"]), qty=rng.choice(SLOTS["订购数量"]),
                      price=rng.choice(SLOTS["单价预算"]), pack=rng.choice(SLOTS["包装要求"]), logo=rng.choice(SLOTS["Logo工艺"]),
                      ship=rng.choice(SLOTS["物流方式"]), num=str(rng.randint(10**11, 10**12)), num4=str(rng.randint(1000, 9999)))
            k = rng.randrange(len(NOISY_U))
            msgs.append({"role": "user", "text": NOISY_U[k].format(**kw), "turn": t})
            msgs.append({"role": "assistant", "text": NOISY_A[k].format(**kw), "turn": t})
        else:
            k = rng.randrange(len(FILLER_U))
            msgs.append({"role": "user", "text": FILLER_U[k].format(q=q), "turn": t})
            msgs.append({"role": "assistant", "text": FILLER_A[k], "turn": t})
        for kind, s, v in pos_map.get(t, []):
            if kind == "update" and s not in truth:
                kind = "state"
            if kind in ("state", "update"):
                v = val(s)
                while truth.get(s) == v: v = val(s)
                tpl = rng.choice(STATE_TPL if kind == "state" else UPDATE_TPL)
                if s in truth: history_vals[s].append(truth[s])
                truth[s] = v
                msgs.append({"role": "user", "text": tpl.format(slot=s, val=v), "turn": t, "fact": s})
            else:
                v = val(s)
                msgs.append({"role": "user", "text": rng.choice(DISTRACT_TPL).format(slot=s, val=v), "turn": t, "distract": (s, v)})
            msgs.append({"role": "assistant", "text": rng.choice(ASSIST_ACK), "turn": t})
    distract_vals = {s: [] for s in SLOTS}
    for m in msgs:
        if "distract" in m: distract_vals[m["distract"][0]].append(m["distract"][1])
    # 每个事实的最后一次陈述位置（用于按"距今多远"分桶）
    last_pos = {}
    for i, m in enumerate(msgs):
        if m.get("fact"): last_pos[m["fact"]] = i
    return msgs, truth, history_vals, distract_vals, last_pos

PARA_Q = {"收货城市": "这批货最后要发到哪里？", "釉色": "客户想要什么颜色的瓷？", "订购数量": "客户一共要多少？",
          "单价预算": "客户能接受一个多少钱？", "发票抬头": "开票写哪家公司？", "交货日期": "客户要求什么时候到货？",
          "Logo工艺": "客户的标志用什么方式做上去？", "包装要求": "客户要怎么包？", "联系人电话": "客户怎么联系？",
          "器型": "客户要的是哪种茶具？", "开票税点": "税要开多少？", "物流方式": "用什么方式运过去？"}

def render(m): return ("用户：" if m["role"] == "user" else "客服：") + m["text"]

# ---------- 策略 ----------
def strat_full(msgs, query, budget):
    return "\n".join(render(m) for m in msgs)

def strat_window(msgs, query, budget):
    out, used = [], 0
    for m in reversed(msgs):
        t = ntok(render(m)) + 1
        if used + t > budget: break
        out.append(render(m)); used += t
    return "\n".join(reversed(out))

def tokenize_zh(s): return [w for w in jieba.lcut(s) if w.strip() and not re.fullmatch(r"[，。？、：！,.?:]+", w)]

def strat_summary(msgs, query, budget, recent_frac=0.4, chunk=40):
    """模拟"滚动压缩"：超预算时，把最老的一段消息 + 旧摘要 一起做抽取式摘要（无领域规则：
    句子得分=平均IDF，偏好含稀有词的句子），摘要上限 = (1-recent_frac)*budget。"""
    df = Counter(); docs = [set(tokenize_zh(m["text"])) for m in msgs]
    for d in docs: df.update(d)
    N = len(msgs)
    def score(sent):
        toks = tokenize_zh(sent)
        if not toks: return 0
        return sum(math.log(N / (1 + df.get(w, 0))) for w in toks) / len(toks)
    sum_cap = int(budget * (1 - recent_frac))
    summary, window = [], []
    for m in msgs:
        window.append(render(m))
        if sum(ntok(x) + 1 for x in window) + sum(ntok(x) + 1 for x in summary) > budget:
            # 压缩：把最老的 chunk 条从窗口移出，与已有摘要合并后重新抽取
            evicted, window = window[:chunk], window[chunk:]
            pool = summary + evicted
            ranked = sorted(range(len(pool)), key=lambda i: -score(pool[i]))
            keep, used = set(), 0
            for i in ranked:
                t = ntok(pool[i]) + 1
                if used + t <= sum_cap: keep.add(i); used += t
            summary = [pool[i] for i in sorted(keep)]  # 保持时间顺序
    return "[早期对话摘要]\n" + "\n".join(summary) + "\n[最近对话]\n" + "\n".join(window)

def strat_bm25(msgs, query, budget, recent_frac=0.4):
    """检索式按需召回：最近窗口(recent_frac*budget) + BM25 从更早历史召回 top 消息填满剩余预算。"""
    recent = strat_window(msgs, query, int(budget * recent_frac))
    n_recent = recent.count("\n") + 1 if recent else 0
    older = msgs[: len(msgs) - n_recent]
    if not older: return recent
    corpus = [tokenize_zh(m["text"]) for m in older]
    bm = BM25Okapi(corpus)
    scores = bm.get_scores(tokenize_zh(query))
    ranked = sorted(range(len(older)), key=lambda i: -scores[i])
    keep, used, cap = [], 0, budget - ntok(recent)
    for i in ranked:
        if scores[i] <= 0: break
        t = ntok(render(older[i])) + 1
        if used + t > cap: continue
        keep.append(i); used += t
    keep.sort()
    return "[检索到的历史]\n" + "\n".join(render(older[i]) for i in keep) + "\n[最近对话]\n" + recent

def strat_bm25_recency(msgs, query, budget, recent_frac=0.4):
    """BM25 + 时间衰减：同分附近偏向更新的消息（处理'知识更新'）。score *= (0.5 + 0.5*pos/len)"""
    recent = strat_window(msgs, query, int(budget * recent_frac))
    n_recent = recent.count("\n") + 1 if recent else 0
    older = msgs[: len(msgs) - n_recent]
    if not older: return recent
    bm = BM25Okapi([tokenize_zh(m["text"]) for m in older])
    raw = bm.get_scores(tokenize_zh(query))
    L = len(older)
    scores = [raw[i] * (0.5 + 0.5 * i / L) for i in range(L)]
    ranked = sorted(range(L), key=lambda i: -scores[i])
    keep, used, cap = [], 0, budget - ntok(recent)
    for i in ranked:
        if raw[i] <= 0: break
        t = ntok(render(older[i])) + 1
        if used + t > cap: continue
        keep.append(i); used += t
    keep.sort()
    return "[检索到的历史]\n" + "\n".join(render(older[i]) for i in keep) + "\n[最近对话]\n" + recent

NOTE_PATTERNS = [re.compile(r"(?:我们这边|记一下，我的)?(\S+?)(?:定一下，是|是|就按|要改一下，改成|换成)(.+?)(?:来)?[。，]")]
def strat_notes(msgs, query, budget, recent_frac=0.4):
    """结构化笔记（模拟 memory tool / 记忆整理）：只从【用户陈述自己信息】的消息里抽取 slot→最新值，覆盖旧值；
    + 最近窗口。注意：抽取规则由实验者按模板编写，相当于"理想的记忆写入"，是上界而非真实 LLM 表现。"""
    notes = {}
    for m in msgs:
        if m["role"] != "user" or "distract" in m: continue
        txt = m["text"].replace("不好意思，", "").replace("更正：", "")
        for s in SLOTS:
            if s in txt:
                mm = re.search(re.escape(s) + r"(?:定一下，是|是|就按|要改一下，改成|换成)(.+?)(?:来|，之前那个作废)?。", txt)
                if mm: notes[s] = mm.group(1)
    note_txt = "[客户档案(笔记)]\n" + "\n".join(f"{k}: {v}" for k, v in notes.items())
    recent = strat_window(msgs, query, budget - ntok(note_txt))
    return note_txt + "\n[最近对话]\n" + recent

STRATS = {"full(全量)": strat_full, "window(滑窗裁剪)": strat_window, "summary(抽取式滚动摘要)": strat_summary,
          "bm25(检索召回)": strat_bm25, "bm25+recency": strat_bm25_recency, "notes(结构化笔记,上界)": strat_notes}

QUERY_INDEPENDENT = {"full(全量)", "window(滑窗裁剪)", "summary(抽取式滚动摘要)", "notes(结构化笔记,上界)"}
def evaluate(seeds=range(10), budgets=(800, 1500, 3000), noisy=True, para=False):
    rows, by_age = [], {}
    meta = []
    for seed in seeds:
        msgs, truth, hist, distr, last_pos = gen_conversation(seed, noisy=noisy)
        total_tok = sum(ntok(render(m)) + 1 for m in msgs)
        meta.append((len(msgs), total_tok))
        for B in budgets:
            for name, fn in STRATS.items():
                if name.startswith("full") and B != budgets[0]: continue
                hit = conflict = 0; toks = []; cache = None
                for s, v in truth.items():
                    q = PARA_Q[s] if para else f"客户最终确认的{s}是什么？"
                    if name in QUERY_INDEPENDENT:
                        if cache is None: cache = fn(msgs, q, B)
                        ctx = cache
                    else:
                        ctx = fn(msgs, q, B)
                    toks.append(ntok(ctx))
                    ok = v in ctx
                    stale = any(x in ctx for x in hist[s] + distr[s] if x != v)
                    hit += ok; conflict += (ok and stale)
                    age = (len(msgs) - last_pos[s]) / len(msgs)
                    bucket = "近(后1/3)" if age < 1/3 else ("中(中1/3)" if age < 2/3 else "远(前1/3)")
                    key = (name, "-" if name.startswith("full") else B, bucket)
                    by_age.setdefault(key, []).append(ok)
                rows.append({"seed": seed, "budget": "-" if name.startswith("full") else B, "strategy": name,
                             "recall": hit / len(truth), "conflict": conflict / len(truth), "avg_tokens": statistics.mean(toks)})
    return rows, by_age, meta

def report(title, rows, by_age, meta):
    agg = {}
    for r in rows: agg.setdefault((r["strategy"], r["budget"]), []).append(r)
    print(f"\n### {title}")
    print(f"对话规模：平均 {statistics.mean(m[0] for m in meta):.0f} 条消息，{statistics.mean(m[1] for m in meta):.0f} tokens（o200k_base）；10 个随机种子 × 12 个事实（含 8 次更新、10 条干扰）")
    print("| 策略 | 预算(tokens) | 平均上下文tokens | 事实召回率(含最新值) | 冲突率(同时含旧值/干扰值) |")
    print("|---|---|---|---|---|")
    for (s, b), rs in agg.items():
        rec = [r["recall"] for r in rs]
        print(f"| {s} | {b} | {statistics.mean(r['avg_tokens'] for r in rs):.0f} | {statistics.mean(rec)*100:.1f}% (±{statistics.pstdev(rec)*100:.1f}) | {statistics.mean(r['conflict'] for r in rs)*100:.1f}% |")
    print("\n按事实'最后一次陈述距今'分桶的召回率（预算1500）：")
    print("| 策略 | 近(后1/3) | 中(中1/3) | 远(前1/3) |"); print("|---|---|---|---|")
    for name in STRATS:
        b = "-" if name.startswith("full") else 1500
        cells = []
        for bk in ["近(后1/3)", "中(中1/3)", "远(前1/3)"]:
            v = by_age.get((name, b, bk), [])
            cells.append(f"{sum(v)/len(v)*100:.0f}% (n={len(v)})" if v else "n/a")
        print(f"| {name} | " + " | ".join(cells) + " |")
    return rows

if __name__ == "__main__":
    allr = {}
    for title, kw in [("A. 模板化闲聊（易：闲聊重复、事实句词汇稀有）", dict(noisy=False, para=False)),
                      ("B. 多样化闲聊（难：闲聊里也有城市/价格/釉色/单号等稀有词）+ 原词提问", dict(noisy=True, para=False)),
                      ("C. 多样化闲聊 + 改写提问（问题不含槽位原词）", dict(noisy=True, para=True))]:
        rows, by_age, meta = evaluate(**kw)
        allr[title] = report(title, rows, by_age, meta)
        sys.stdout.flush()
    json.dump(allr, open("results.json", "w"), ensure_ascii=False, indent=1)
