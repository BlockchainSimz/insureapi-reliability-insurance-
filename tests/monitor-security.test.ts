import test from "node:test";
import assert from "node:assert/strict";
import { isPrivateOrReservedIp } from "../src/monitor/security.js";
import { classifyCheck } from "../src/monitor/classification.js";

test("blocks private and reserved IPv4 ranges", () => {
  for (const ip of [
    "0.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.0.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255"
  ]) {
    assert.equal(isPrivateOrReservedIp(ip), true, ip);
  }
});

test("blocks private and special IPv6 ranges", () => {
  for (const ip of ["::", "::1", "fc00::1", "fd00::1", "fe80::1", "ff02::1", "2001:db8::1"]) {
    assert.equal(isPrivateOrReservedIp(ip), true, ip);
  }
});

test("blocks IPv4-mapped private IPv6 addresses", () => {
  assert.equal(isPrivateOrReservedIp("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateOrReservedIp("::ffff:10.0.0.1"), true);
});

test("classifies healthy HTTP checks independently from latency", () => {
  assert.deepEqual(classifyCheck(200, 100, 200, 299, 250), {
    httpHealthy: true,
    ok: true,
    status: "up",
    errorCode: null
  });

  assert.deepEqual(classifyCheck(200, 500, 200, 299, 250), {
    httpHealthy: true,
    ok: true,
    status: "degraded",
    errorCode: "LATENCY"
  });
});

test("classifies HTTP failures as down", () => {
  assert.deepEqual(classifyCheck(503, 50, 200, 299, 250), {
    httpHealthy: false,
    ok: false,
    status: "down",
    errorCode: "HTTP_STATUS"
  });
});
