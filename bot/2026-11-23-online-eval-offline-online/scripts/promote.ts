import { writeFileSync } from "node:fs";
import { frozenQuestions, rows } from "../lib/frozen";
import { serializePromotion } from "../lib/promotion";
import { withVerifiedFrozen } from "./verify-frozen";

const [outputPath] = process.argv.slice(2);
withVerifiedFrozen(() => {
  const output = serializePromotion(rows, frozenQuestions);
  if (outputPath) writeFileSync(outputPath, output, { flag: "wx" });
  else process.stdout.write(output);
});
