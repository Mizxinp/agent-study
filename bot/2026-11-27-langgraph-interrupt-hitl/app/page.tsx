"use client";

import { useState, type FormEvent } from "react";

type Decision = {
  decisionId: string;
  refund: { order: string; amount: number };
  __interrupt__: unknown[];
};

async function post(path: string, owner: string, body: object) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-demo-user": owner },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

export default function Page() {
  const [owner, setOwner] = useState("manager");
  const [decision, setDecision] = useState<Decision>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [finished, setFinished] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "请求失败");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void run(async () => {
      setDecision(await post("/api/chat", owner, {
        order: fields.get("order"),
        amount: Number(fields.get("amount")),
      }));
      setFinished(false);
    });
  }

  function decide(approved: boolean) {
    if (!decision) return;
    void run(async () => {
      const result = await post("/api/approve", owner, { decisionId: decision.decisionId, approved });
      setStatus(result.status === "approved" ? "已批准，退款已记账" : "已拒绝");
      setFinished(true);
    });
  }

  return (
    <main>
      <h1>退款审批</h1>
      <form onSubmit={submit}>
        <label>演示店长<input required value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
        <label>订单号<input required name="order" defaultValue="ORDER-100" maxLength={80} /></label>
        <label>退款金额（元）<input required name="amount" type="number" min={1} max={1000000} defaultValue={100} /></label>
        <button disabled={busy}>发起审批</button>
      </form>
      {decision && <section>
        <h2>{decision.refund.order} · ¥{decision.refund.amount}</h2>
        <details open><summary>__interrupt__</summary><pre>{JSON.stringify(decision.__interrupt__, null, 2)}</pre></details>
        <div className="actions">
          <button disabled={busy || finished} onClick={() => decide(true)}>批准退款</button>
          <button disabled={busy || finished} onClick={() => decide(false)}>拒绝</button>
        </div>
      </section>}
      <p role="status">{status}</p>
    </main>
  );
}
