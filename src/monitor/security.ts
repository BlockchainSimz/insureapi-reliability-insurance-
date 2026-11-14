import dns from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export type ResolvedTarget = {
  url: string;
  hostname: string;
  addresses: string[];
};

function ipv4ToParts(ip: string) {
  return ip.split(".").map(Number);
}

export function isPrivateOrReservedIp(ip: string) {
  const normalized = ip.toLowerCase();
  const mapped = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;

  if (net.isIP(mapped) === 4) {
    const [a, b] = ipv4ToParts(mapped);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && b >= 18 && b <= 19)
    );
  }

  if (net.isIP(normalized) === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8:")
    );
  }

  return true;
}

export async function resolvePublicHttpTarget(raw: string, maxLength = 2048): Promise<ResolvedTarget> {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > maxLength) {
    throw new Error("Invalid URL");
  }

  const parsed = new URL(raw);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP(S) URLs are supported");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Credential-bearing URLs are not allowed");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Private or metadata hosts are not allowed");
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some(record => isPrivateOrReservedIp(record.address))) {
    throw new Error("Private or reserved target blocked");
  }

  return {
    url: parsed.toString(),
    hostname,
    addresses: records.map(record => record.address)
  };
}

export function pinnedAgents(target: ResolvedTarget) {
  const lookup = (
    _hostname: string,
    options: { all?: boolean },
    callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void
  ) => {
    const address = target.addresses[0];
    const family = net.isIP(address);
    if (!family) return callback(new Error("Resolved address is invalid"), "", 0);
    if (options.all) return callback(null, address, family);
    return callback(null, address, family);
  };

  return {
    httpAgent: new http.Agent({ keepAlive: true, lookup }),
    httpsAgent: new https.Agent({ keepAlive: true, lookup })
  };
}
