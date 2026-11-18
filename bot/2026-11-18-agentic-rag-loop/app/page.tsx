"use client";
import { useState } from "react";

type Ev = Record<string, unknown> & { type: string };

export default function Page() {
  const [question, setQuestion] = useState("和DH-TC-0915同釉色、标称容积更大的商品有哪些？");
  const [pipeline, setPipeline] = useState<"fixed" | "agentic">("agentic");
  const [events, setEvents] = useState<Ev[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask() {
    setBusy(true);
    setEvents([]);
    setError("");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, pipeline }),
      });
      if (!res.ok || !res.body) {
        setError(`${res.status} ${JSON.stringify(await res.json().catch(() => ({})))}`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) if (l.trim()) setEvents((xs) => [...xs, JSON.parse(l) as Ev]);
      }
    } finally {
      setBusy(false);
    }
  }

  const answer = events.find((e) => e.type === "answer");
  const text = events.filter((e) => e.type === "text").map((e) => e.text).join("");
  return (
    <main>
      <h1>Agentic RAG 循环 vs 固定单次 RAG（合成陶瓷商品）</h1>
      <p style={{ color: "#666" }}>所有商品与价格均为合成虚构数据。fixed = 混合检索 top8 + 一次生成；agentic = search / filterProducts / answer 工具循环（最多 6 步）。</p>
      <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} style={{ width: "100%" }} />
      <div style={{ margin: "8px 0" }}>
        {(["fixed", "agentic"] as const).map((p) => (
          <label key={p} style={{ marginRight: 16 }}>
            <input type="radio" checked={pipeline === p} onChange={() => setPipeline(p)} /> {p}
          </label>
        ))}
        <button onClick={ask} disabled={busy}>{busy ? "运行中…" : "提问"}</button>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {answer && (
        <section style={{ background: "#f4f8ff", padding: 12 }}>
          <b>答案：</b>{(answer.skus as string[]).length ? (answer.skus as string[]).join("、") : "无（信息不足）"}
          <div>{String(answer.rationale ?? "")}</div>
        </section>
      )}
      {text && <p>{text}</p>}
      <h3>每步轨迹</h3>
      <ol>
        {events.filter((e) => e.type !== "text").map((e, i) => (
          <li key={i} style={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
            {e.type === "tool-call" ? `step ${e.step} 调用 ${e.toolName}(${JSON.stringify(e.input)})`
              : e.type === "tool-result" ? `step ${e.step} ${e.toolName} → ${e.output}`
              : JSON.stringify(e)}
          </li>
        ))}
      </ol>
    </main>
  );
}
