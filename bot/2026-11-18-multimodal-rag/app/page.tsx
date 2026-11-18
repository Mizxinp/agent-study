"use client";
import { useState } from "react";

type Hit = { id: string; score: number; caption?: string; image?: string };
type Payload = {
  lanes?: Record<string, Hit[]>;
  error?: string;
};

const LANES: [string, string][] = [
  ["text-bge", "文本检索（BGE 字幕）"],
  ["vision", "视觉检索（中文 CLIP）"],
  ["fusion", "融合检索（字幕+图平均）"],
];

export default function Page() {
  const [q, setQ] = useState("有没有粉青色的瓷器");
  const [result, setResult] = useState<Payload>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = e.currentTarget;
      const data = new FormData(form);
      const r = await fetch("/api/search", { method: "POST", body: data });
      const json = (await r.json()) as Payload;
      if (!r.ok) throw Error(json.error || r.statusText);
      setResult(json);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>本地多模态检索对比</h1>
      <p className="note">
        16 件程序合成的陶瓷商品图（非实物爬图）。字幕只写型号与容量，故意不写釉色和器型。
        对比字幕文本检索、视觉检索、简单融合。无云端 API。
      </p>
      <form onSubmit={onSubmit}>
        <input
          type="text"
          name="q"
          maxLength={512}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="输入中文查询，或只上传查询图"
        />
        <input
          type="file"
          name="image"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
        />
        <button disabled={busy}>{busy ? "检索中…" : "检索"}</button>
      </form>
      {fileName ? <p className="note">已选查询图：{fileName}</p> : null}
      <p role="alert">{error}</p>
      <div className="columns">
        {LANES.map(([key, title]) => (
          <section key={key}>
            <h2>{title}</h2>
            {result.lanes?.[key]?.map((x) => (
              <article key={x.id}>
                <small>
                  {x.id} · {x.score.toFixed(4)}
                </small>
                {x.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={x.image} alt={x.id} />
                ) : null}
                <p>{x.caption}</p>
              </article>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
