import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
const commands = [["install"], ["test"], ["typecheck"], ["build"], ["eval"]];
const record: { command: string; exitCode: number | null; seconds: number }[] =
  [];
for (const args of commands) {
  const start = performance.now();
  console.log(`验证 pnpm ${args.join(" ")}`);
  const log = createWriteStream(`verify-${args[0]}.log`);
  const child = spawn("pnpm", args, { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => {
    process.stdout.write(d);
    log.write(d);
  });
  child.stderr.on("data", (d) => {
    process.stderr.write(d);
    log.write(d);
  });
  const exitCode = await new Promise<number | null>((resolve) =>
    child.on("close", resolve),
  );
  log.end();
  record.push({
    command: `pnpm ${args.join(" ")}`,
    exitCode,
    seconds: (performance.now() - start) / 1000,
  });
  await writeFile("verification.json", JSON.stringify(record, null, 2));
  console.log(`exit code: ${exitCode}`);
  if (exitCode !== 0) {
    process.exitCode = exitCode ?? 1;
    break;
  }
}
