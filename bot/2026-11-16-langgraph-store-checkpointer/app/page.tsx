"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import type { StoreItemView } from "@/lib/serialize";
import {
  DEFAULT_USER_ID,
  THREAD_A,
  THREAD_B,
} from "@/lib/runtime";
import {
  isSystemMessage,
  isUserMessage,
} from "@/lib/facts";

type SessionPayload = {
  userId: string;
  threads: Record<string, string[]>;
  facts: StoreItemView[];
};

const HINT_A = "记住：喜欢的颜色=蓝色";
const HINT_B = "我还记得什么？";

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
}

function stripPrefix(line: string): string {
  return line.replace(/^(用户|系统)[：:]/u, "");
}

export default function Page() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [draftA, setDraftA] = useState(HINT_A);
  const [draftB, setDraftB] = useState(HINT_B);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/session?userId=${encodeURIComponent(DEFAULT_USER_ID)}`,
    );
    if (!response.ok) throw new Error(`加载失败：${response.status}`);
    setSession((await response.json()) as SessionPayload);
  }, []);

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载失败");
    });
  }, [load]);

  async function send(threadId: string, text: string) {
    setPending(threadId);
    setError(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          userId: DEFAULT_USER_ID,
          text,
        }),
      });
      const payload = (await response.json()) as SessionPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
      setSession(payload);
      if (threadId === THREAD_A) setDraftA("");
      if (threadId === THREAD_B) setDraftB("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setPending(null);
    }
  }

  async function resetDemo() {
    setPending("reset");
    setError(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true, userId: DEFAULT_USER_ID }),
      });
      const payload = (await response.json()) as SessionPayload;
      setSession(payload);
      setDraftA(HINT_A);
      setDraftB(HINT_B);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "重置失败");
    } finally {
      setPending(null);
    }
  }

  const threads = session?.threads ?? { [THREAD_A]: [], [THREAD_B]: [] };
  const facts = session?.facts ?? [];

  return (
    <main className="page">
      <header>
        <h1>LangGraph 两层记忆：Store vs Checkpointer</h1>
        <p>
          同一个 <code>userId</code> 下有两个对话线程。线程状态由
          <code>MemorySaver</code>（Checkpointer）按 <code>thread_id</code>{" "}
          隔离；事实写在 <code>InMemoryStore</code> 里，所有线程共享。无需 API
          key：输入匹配 <code>记住：k=v</code> 时，确定性节点会把事实 put 进
          Store。
        </p>
      </header>

      <div className="meta">
        <span className="chip">userId = {DEFAULT_USER_ID}</span>
        <span className="chip">@langchain/langgraph@1.7.4</span>
        <span className="chip">MemorySaver + InMemoryStore</span>
      </div>

      <div className="legend">
        <div>
          <strong>线程状态互相隔离。</strong> 在 A
          里说的话不会出现在 B 的消息列表里，反之亦然。这是 Checkpointer
          按 thread 保存的图状态。
        </div>
        <div>
          <strong>Store 跨线程共享。</strong> 在 A 里用{" "}
          <code>记住：喜欢的颜色=蓝色</code> 写入的事实，会出现在右侧列表里，B
          也能看到——但看不到 A 的对话。
        </div>
      </div>

      <div className="grid">
        <ThreadColumn
          kind="a"
          title="线程 A"
          threadId={THREAD_A}
          messages={threads[THREAD_A] ?? []}
          draft={draftA}
          onDraft={setDraftA}
          onSend={(text) => send(THREAD_A, text)}
          pending={pending}
          placeholder={HINT_A}
        />
        <ThreadColumn
          kind="b"
          title="线程 B"
          threadId={THREAD_B}
          messages={threads[THREAD_B] ?? []}
          draft={draftB}
          onDraft={setDraftB}
          onSend={(text) => send(THREAD_B, text)}
          pending={pending}
          placeholder={HINT_B}
        />
        <section className="card s">
          <div className="card-h">
            <h2>共享 Store</h2>
            <p>namespace = [{DEFAULT_USER_ID}, facts]</p>
          </div>
          <div className="facts">
            {facts.length === 0 ? (
              <div className="empty">
                还没有事实。在线程 A 发送
                <br />
                <code>记住：喜欢的颜色=蓝色</code>
              </div>
            ) : (
              facts.map((item) => (
                <article className="fact" key={`${item.namespace.join("/")}:${item.key}`}>
                  <div className="k">{item.key}</div>
                  <div className="v">
                    {typeof item.value.text === "string"
                      ? item.value.text
                      : JSON.stringify(item.value)}
                  </div>
                  <div className="ts">
                    createdAt: {formatTime(item.createdAt)}
                    <br />
                    updatedAt: {formatTime(item.updatedAt)}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="toolbar">
        <p className="hint">
          内存演示：刷新页面（同一进程）会保留数据；重启{" "}
          <code>pnpm dev</code> 或点右侧按钮会清空。
        </p>
        <button type="button" onClick={resetDemo} disabled={pending !== null}>
          清空演示数据
        </button>
      </div>
      {error ? <p className="err">{error}</p> : null}
    </main>
  );
}

function ThreadColumn(props: {
  kind: "a" | "b";
  title: string;
  threadId: string;
  messages: string[];
  draft: string;
  onDraft: (value: string) => void;
  onSend: (text: string) => void;
  pending: string | null;
  placeholder: string;
}) {
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = props.draft.trim();
    if (!text) return;
    props.onSend(text);
  }

  return (
    <section className={`card ${props.kind}`}>
      <div className="card-h">
        <h2>{props.title}</h2>
        <p>thread_id = {props.threadId}</p>
      </div>
      <div className="messages">
        {props.messages.length === 0 ? (
          <div className="empty">这个线程还没有消息（Checkpointer 状态为空）。</div>
        ) : (
          props.messages.map((line, index) => {
            const role = isUserMessage(line)
              ? "user"
              : isSystemMessage(line)
                ? "system"
                : "system";
            return (
              <div className={`bubble ${role}`} key={`${index}-${line}`}>
                <span className="who">{role === "user" ? "用户" : "系统（确定性节点）"}</span>
                {stripPrefix(line)}
              </div>
            );
          })
        )}
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <input
          value={props.draft}
          onChange={(event) => props.onDraft(event.target.value)}
          placeholder={props.placeholder}
          disabled={props.pending !== null}
        />
        <button type="submit" disabled={props.pending !== null}>
          发送
        </button>
      </form>
    </section>
  );
}
