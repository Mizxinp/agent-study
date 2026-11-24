import { createHash } from "node:crypto";
import { evaluate } from "../lib/evaluation";
import { frozenQuestions, rows } from "../lib/frozen";
import { promote } from "../lib/promotion";
import { withVerifiedFrozen } from "./verify-frozen";

const rate = (count: number, n: number) => `${count}/${n} (${(100 * count / n).toFixed(2)}%)`;

withVerifiedFrozen(() => {
  const { h1, h2 } = evaluate(rows);
  console.log("H1 skuSet = SKU 数组、格式合法、无重复（允许空数组）；noToolError = 无显式 toolResults.error");
  for (const { pipeline, rule, n, pass, goldPass, passGoldFail, failGoldPass } of h1) {
    console.log(`${pipeline} ${rule} pass=${rate(pass, n)} goldPass=${rate(goldPass, n)} pass&goldFail=${rate(passGoldFail, n)} fail&goldPass=${rate(failGoldPass, n)}`);
  }
  const { n, localPass, goldPass } = h2;
  console.log(`H2 agentic 首步有 search 调用，同一步 search 结果有非空 summary 且无 error。local=${rate(localPass, n)} exact=${rate(goldPass, n)} gap=${(100 * (localPass - goldPass) / n).toFixed(2)} pp`);
  const output = promote(rows, frozenQuestions);
  const sha256 = createHash("sha256").update(JSON.stringify(output, null, 2) + "\n").digest("hex");
  console.log(`H3 cases=${output.cases.length} traces=${output.cases.reduce((n, item) => n + item.traces.length, 0)} sha256=${sha256}`);
  console.log("冻结源与副本字节相同，SHA-256 与 Git blob 验证通过。");
});
