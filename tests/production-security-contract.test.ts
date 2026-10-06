import test from "node:test";
import assert from "node:assert/strict";

test("production security contract", async () => {
  process.env.NODE_ENV = "production";
  process.env.AUTH_REQUIRED = "true";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;

  const mod = await import("../src/monitor/security.ts");

  await assert.rejects(() => mod.resolvePublicHttpTarget("http://127.0.0.1:8080"), /Private or reserved target blocked|Private/);
  await assert.rejects(() => mod.resolvePublicHttpTarget("http://localhost"), /Private or metadata hosts|Only HTTP/);
  await assert.rejects(() => mod.resolvePublicHttpTarget("file:///etc/passwd"), /Only HTTP/);
  await assert.rejects(() => mod.resolvePublicHttpTarget("https://user:pass@example.com"), /Credential-bearing/);
});
