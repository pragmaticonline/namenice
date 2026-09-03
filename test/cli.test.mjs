import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

function runCli(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["bin/namenice.mjs", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("CLI lists Organization Domains through the Namenice API", async (t) => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ domains: [{ domain: "example.com", status: "active" }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();

  const result = await runCli(["domains", "list", "--org", "42"], {
    NAMENICE_API_URL: `http://127.0.0.1:${address.port}`,
    NAMENICE_API_KEY: "nn_test",
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /example\.com\s+active/);
  assert.equal(requests[0].url, "/api/v1/domains");
  assert.equal(requests[0].headers.authorization, "Bearer nn_test");
  assert.equal(requests[0].headers["x-org"], "42");
});

test("CLI adds a DNS Record through the Namenice API", async (t) => {
  let received;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received = { request, body: JSON.parse(body) };
    response.setHeader("content-type", "application/json");
    response.writeHead(201);
    response.end(JSON.stringify({ id: 17 }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();

  const result = await runCli([
    "dns", "add", "example.com", "--host", "www", "--type", "A", "--value", "192.0.2.2", "--ttl", "300", "--org", "42",
  ], {
    NAMENICE_API_URL: `http://127.0.0.1:${address.port}`,
    NAMENICE_API_KEY: "nn_test",
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /created DNS Record 17/);
  assert.equal(received.request.method, "POST");
  assert.equal(received.request.url, "/api/v1/domains/example.com/dns");
  assert.deepEqual(received.body, { host: "www", type: "A", value: "192.0.2.2", ttl: 300 });
});
