"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useState } from "react";
export default function Page() {
  const [clientId, setClientId] = useState(""),
    [strategy, setStrategy] = useState("add-only"),
    [input, setInput] = useState(""),
    [memory, setMemory] = useState<{
      busy?: boolean;
      error?: string;
      events?: unknown[];
    }>({});
  useEffect(() => setClientId(crypto.randomUUID()), []);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { clientId, strategy },
      }),
    [clientId, strategy],
  );
  const { messages, sendMessage, status, error } = useChat({
    id: `${clientId}:${strategy}`,
    transport,
  });
  useEffect(() => {
    if (!clientId) return;
    let active = true;
    const poll = async () => {
      try {
        const r = await fetch(
          `/api/memory?clientId=${clientId}&strategy=${strategy}`,
        );
        const data = await r.json();
        if (active) setMemory(data);
      } catch {
        if (active) setMemory({ error: "Cannot reach server" });
      }
    };
    void poll();
    const timer = setInterval(poll, 1200);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [clientId, strategy]);
  const busy = status === "streaming" || status === "submitted" || memory.busy;
  return (
    <main>
      <h1>Agent 记忆写入策略</h1>
      <p>
        每轮回复后写入；进程重启会清空。切换策略使用独立记忆。仅用于本地实验。
      </p>
      <label>
        策略{" "}
        <select
          disabled={busy}
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
        >
          <option>add-only</option>
          <option>crud</option>
        </select>
      </label>
      {(memory.error || error) && (
        <p role="alert" style={{ color: "crimson" }}>
          {memory.error ||
            "Chat failed. Check server API key and model configuration."}
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        <section>
          <h2>对话</h2>
          {messages.map((m) => (
            <p key={m.id}>
              <b>{m.role}: </b>
              {m.parts.map((p, i) =>
                p.type === "text" ? <span key={i}>{p.text}</span> : null,
              )}
            </p>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) {
                void sendMessage({ text: input });
                setInput("");
              }
            }}
          >
            <textarea
              aria-label="消息"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button disabled={!clientId || busy || !!memory.error}>发送</button>
          </form>
        </section>
        <aside>
          <h2>记忆事件 {memory.busy ? "（写入中）" : ""}</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(memory.events ?? [], null, 2)}
          </pre>
        </aside>
      </div>
    </main>
  );
}
