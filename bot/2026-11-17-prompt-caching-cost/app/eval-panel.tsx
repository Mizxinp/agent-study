"use client";

import { useEffect, useState } from "react";

type KeyStatus = {
  keys: {
    OPENAI_API_KEY: boolean;
    ANTHROPIC_API_KEY: boolean;
    AI_GATEWAY_API_KEY: boolean;
  };
  missing: string[];
  ready: boolean;
};

export function EvalPanel() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>("");

  useEffect(() => {
    void fetch("/api/eval")
      .then((response) => response.json())
      .then(setStatus)
      .catch((error: unknown) => setLog(String(error)));
  }, []);

  async function run() {
    setBusy(true);
    setLog("正在调用评测…");
    try {
      const response = await fetch("/api/eval", { method: "POST" });
      const body = await response.json();
      setLog(JSON.stringify(body, null, 2));
    } catch (error) {
      setLog(String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>H1–H4 评测</h2>
      {status ? (
        <p className={status.ready ? "status-ok" : "status-miss"}>
          {status.ready
            ? "已检测到至少一把可用密钥（页面只显示是否存在，不显示密钥内容）。可以运行评测。"
            : `当前缺少 ${status.missing.join("、")}。H1–H4 未运行；请设置密钥后使用 pnpm eval 或点击下面的按钮。`}
        </p>
      ) : (
        <p>正在检查环境变量是否存在…</p>
      )}
      <ul>
        <li>OPENAI_API_KEY：{status?.keys.OPENAI_API_KEY ? "已设置" : "未设置"}</li>
        <li>ANTHROPIC_API_KEY：{status?.keys.ANTHROPIC_API_KEY ? "已设置" : "未设置"}</li>
        <li>AI_GATEWAY_API_KEY：{status?.keys.AI_GATEWAY_API_KEY ? "已设置" : "未设置"}</li>
      </ul>
      <button type="button" onClick={() => void run()} disabled={busy || !status?.ready}>
        {busy ? "评测中…" : "运行 H1–H4 评测"}
      </button>
      {log ? <pre className="result">{log}</pre> : null}
    </div>
  );
}
