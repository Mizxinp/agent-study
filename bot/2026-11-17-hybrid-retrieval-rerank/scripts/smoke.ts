import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
const run = promisify(execFile);
const server = spawn("pnpm", ["start", "--port", "3123"], {
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => {
  log += d;
});
server.stderr.on("data", (d) => {
  log += d;
});
let code = 1;
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      await run("curl", ["--fail", "--silent", "http://localhost:3123/"]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (!ready) throw Error("服务启动超时");
  const response = await run(
    "curl",
    [
      "--fail",
      "--silent",
      "--show-error",
      "--get",
      "--data-urlencode",
      "q=DH-TC-0915的标称容积是多少？",
      "http://localhost:3123/api/search",
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const data = JSON.parse(response.stdout);
  const counts: Record<string, number> = {};
  for (const key of ["bm25", "vector", "rrf", "rerank"]) {
    if (!Array.isArray(data[key]) || data[key].length !== 5)
      throw Error(`Invalid ${key} results`);
    counts[key] = data[key].length;
  }
  const missing = await fetch("http://localhost:3123/api/search");
  const long = await fetch(
    "http://localhost:3123/api/search?q=" + "a".repeat(513),
  );
  if (missing.status !== 400 || long.status !== 400)
    throw Error("Query validation failed");
  await writeFile("api-response.json", JSON.stringify(data, null, 2));
  await writeFile(
    "api-verification.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        httpStatus: 200,
        missingQueryStatus: missing.status,
        longQueryStatus: long.status,
        counts,
        command:
          "curl --get --data-urlencode q=DH-TC-0915的标称容积是多少？ http://localhost:3123/api/search",
        exitCode: 0,
      },
      null,
      2,
    ),
  );
  console.log("API four routes", counts);
  code = 0;
} catch (error) {
  console.error(error);
} finally {
  if (server.pid) process.kill(-server.pid, "SIGTERM");
  await new Promise<void>((resolve) => {
    server.once("close", () => resolve());
    setTimeout(resolve, 2000);
  });
  await writeFile("server.log", log);
  console.log("服务已关闭");
  process.exitCode = code;
}
