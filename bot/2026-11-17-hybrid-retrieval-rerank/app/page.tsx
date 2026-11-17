"use client";
import { useState } from "react";
type Item = {
  id: string;
  title: string;
  section: string;
  score: number;
  text: string;
};
export default function Page() {
  const [q, setQ] = useState("DH-TC-0915的标称容积是多少？"),
    [result, setResult] = useState<Record<string, Item[]>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main>
      <h1>混合检索与重排实验</h1>
      <p>16 份合成商品文档 · BM25 / BGE 向量 / RRF / Cross-encoder</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/search?q=" + encodeURIComponent(q));
            const data = await r.json();
            if (!r.ok) throw Error(data.error);
            setResult(data);
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          maxLength={512}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button disabled={busy}>{busy ? "检索中…" : "检索"}</button>
      </form>
      <p role="alert">{error}</p>
      <div className="columns">
        {[
          ["bm25", "BM25"],
          ["vector", "向量"],
          ["rrf", "RRF 融合"],
          ["rerank", "重排后"],
        ].map(([key, title]) => (
          <section key={key}>
            <h2>{title}</h2>
            {result[key]?.map((x) => (
              <article key={x.id}>
                <small>
                  {x.id} · {x.score.toFixed(4)}
                </small>
                <h3>{x.title}</h3>
                <b>{x.section}</b>
                <p>{Array.from(x.text).slice(0, 60).join("")}…</p>
              </article>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
