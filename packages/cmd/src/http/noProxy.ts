// Copied from axios 1.20.0, lib/helpers/shouldBypassProxy.js (MIT license,
// Copyright (c) 2014-present Matt Zabriskie & Collaborators), with types added
// and the NO_PROXY value passed in. axios applied it after proxy-from-env, and
// sent a request it matched directly: CIDR ranges, localhost, 127.0.0.1 and ::1
// as one host, and IPv4 written in other forms.
const LOOPBACK_HOSTNAMES = new Set(['localhost', '0.0.0.0']);

const trimTrailingDots = (value: string) => {
  let end = value.length;

  while (end && value.charCodeAt(end - 1) === 46) {
    end--;
  }

  return end === value.length ? value : value.slice(0, end);
};

const isIPv4Loopback = (host: string) => {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  if (parts[0] !== '127') return false;
  return parts.every(
    (p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255
  );
};

const parseIPv4Octet = (text: string): number | null => {
  if (/^0[xX][0-9a-fA-F]+$/.test(text)) {
    const n = parseInt(text.slice(2), 16);
    return Number.isFinite(n) ? n : null;
  }
  if (text.length > 1 && /^0[0-7]+$/.test(text)) {
    const n = parseInt(text, 8);
    return Number.isFinite(n) ? n : null;
  }
  if (text.length > 1 && /^0[0-9]+$/.test(text)) {
    return null;
  }
  if (/^[0-9]+$/.test(text)) {
    const n = parseInt(text, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const normalizeIPAddress = (host: string) => {
  if (typeof host !== 'string' || !host || host.indexOf(':') !== -1) {
    return host;
  }

  let h = host;
  if (h.charAt(0) === '[' && h.charAt(h.length - 1) === ']') {
    h = h.slice(1, -1);
  }
  h = trimTrailingDots(h);

  if (!/^[0-9.xXa-fA-F]+$/.test(h)) return host;

  const parts = h.split('.');

  if (parts.some((p) => p === '')) return host;

  if (parts.length === 4) {
    const octets = parts.map(parseIPv4Octet);
    if (octets.some((n) => n === null || n < 0 || n > 255)) return host;
    return octets.join('.');
  }

  if (parts.length > 4) {
    return host;
  }

  if (parts.length === 1) return host;

  const literalOctets = parts.slice(0, -1);
  const tail = parts[parts.length - 1];
  const tailSlots = 4 - literalOctets.length;

  const tailValue = parseIPv4Octet(tail);
  if (tailValue === null) return host;
  const maxTail = (1 << (8 * tailSlots)) - 1;
  if (tailValue < 0 || tailValue > maxTail) return host;

  const tailOctets: number[] = new Array(tailSlots).fill(0);
  for (let i = tailSlots - 1, v = tailValue; i >= 0; i--, v >>= 8) {
    tailOctets[i] = v & 0xff;
  }

  const literal = literalOctets.map(parseIPv4Octet);
  if (literal.some((n) => n === null || n < 0 || n > 255)) return host;

  return [...literal, ...tailOctets].join('.');
};

const isIPv6ZeroGroup = (group: string) => /^0{1,4}$/.test(group);

const isIPv6Unspecified = (host: string) => {
  if (host === '::') return true;

  const compressionIndex = host.indexOf('::');

  if (compressionIndex !== -1) {
    if (compressionIndex !== host.lastIndexOf('::')) return false;

    const left = host.slice(0, compressionIndex);
    const right = host.slice(compressionIndex + 2);
    const leftGroups = left ? left.split(':') : [];
    const rightGroups = right ? right.split(':') : [];
    const explicitGroups = leftGroups.length + rightGroups.length;

    return (
      explicitGroups < 8 &&
      leftGroups.every(isIPv6ZeroGroup) &&
      rightGroups.every(isIPv6ZeroGroup)
    );
  }

  const groups = host.split(':');
  return groups.length === 8 && groups.every(isIPv6ZeroGroup);
};

const isIPv6Loopback = (host: string) => {
  if (host === '::1') return true;

  const v4MappedDotted = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4MappedDotted) return isIPv4Loopback(v4MappedDotted[1]);

  const v4MappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (v4MappedHex) {
    const high = parseInt(v4MappedHex[1], 16);
    return high >= 0x7f00 && high <= 0x7fff;
  }

  const groups = host.split(':');
  if (groups.length === 8) {
    for (let i = 0; i < 7; i++) {
      if (!/^0+$/.test(groups[i])) return false;
    }
    return /^0*1$/.test(groups[7]);
  }

  return false;
};

const isLoopback = (host: string) => {
  if (!host) return false;
  if (LOOPBACK_HOSTNAMES.has(host)) return true;
  if (isIPv4Loopback(host)) return true;
  if (isIPv6Unspecified(host)) return true;
  return isIPv6Loopback(host);
};

const DEFAULT_PORTS: Record<string, number> = {
  http: 80,
  https: 443,
  ws: 80,
  wss: 443,
  ftp: 21,
};

const parseNoProxyEntry = (entry: string): [string, number] => {
  let entryHost = entry;
  let entryPort = 0;

  if (entryHost.charAt(0) === '[') {
    const bracketIndex = entryHost.indexOf(']');

    if (bracketIndex !== -1) {
      const host = entryHost.slice(1, bracketIndex);
      const rest = entryHost.slice(bracketIndex + 1);

      if (rest.charAt(0) === ':' && /^\d+$/.test(rest.slice(1))) {
        entryPort = Number.parseInt(rest.slice(1), 10);
      }

      return [host, entryPort];
    }
  }

  const firstColon = entryHost.indexOf(':');
  const lastColon = entryHost.lastIndexOf(':');

  if (
    firstColon !== -1 &&
    firstColon === lastColon &&
    /^\d+$/.test(entryHost.slice(lastColon + 1))
  ) {
    entryPort = Number.parseInt(entryHost.slice(lastColon + 1), 10);
    entryHost = entryHost.slice(0, lastColon);
  }

  return [entryHost, entryPort];
};

const IPV4_MAPPED_DOTTED_RE =
  /^(?:::|(?:0{1,4}:){1,4}:|(?:0{1,4}:){5})ffff:(\d+\.\d+\.\d+\.\d+)$/i;
const IPV4_MAPPED_HEX_RE =
  /^(?:::|(?:0{1,4}:){1,4}:|(?:0{1,4}:){5})ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

const unmapIPv4MappedIPv6 = (host: string) => {
  if (typeof host !== 'string' || host.indexOf(':') === -1) return host;

  const dotted = host.match(IPV4_MAPPED_DOTTED_RE);
  if (dotted) return dotted[1];

  const hex = host.match(IPV4_MAPPED_HEX_RE);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
  }

  return host;
};

const IPV4_OCTET_RE = /^(?:0|[1-9]\d{0,2})$/;

const ipv4ToBytes = (host: string) => {
  const parts = host.split('.');

  return parts.length === 4 &&
    parts.every((part) => IPV4_OCTET_RE.test(part) && Number(part) <= 255)
    ? parts.map(Number)
    : null;
};

const IPV6_GROUP_RE = /^[0-9a-f]{1,4}$/i;

const ipv6ToBytes = (host: string) => {
  const halves = host.split('::');

  if (halves.length > 2) {
    return null;
  }

  const groups = halves[0] ? halves[0].split(':') : [];

  if (halves.length === 2) {
    const rear = halves[1] ? halves[1].split(':') : [];
    const missing = 8 - groups.length - rear.length;

    if (missing < 1) {
      return null;
    }

    groups.push(...new Array(missing).fill('0'), ...rear);
  }

  if (
    groups.length !== 8 ||
    groups.some((group) => !IPV6_GROUP_RE.test(group))
  ) {
    return null;
  }

  return groups.flatMap((group) => {
    const value = Number.parseInt(group, 16);
    return [(value >> 8) & 0xff, value & 0xff];
  });
};

const ipToBytes = (host: string) => {
  if (typeof host !== 'string' || !host) {
    return null;
  }

  return host.indexOf(':') !== -1 ? ipv6ToBytes(host) : ipv4ToBytes(host);
};

const normalizeNoProxyHost = (hostname: string) => {
  if (!hostname) {
    return hostname;
  }

  if (
    hostname.charAt(0) === '[' &&
    hostname.charAt(hostname.length - 1) === ']'
  ) {
    hostname = hostname.slice(1, -1);
  }

  const trimmed = trimTrailingDots(hostname);

  const ipv4 = normalizeIPAddress(trimmed);
  if (ipv4 !== trimmed) {
    return ipv4;
  }

  return unmapIPv4MappedIPv6(trimmed);
};

const normalizeCidrBase = (input: string) => {
  let base = input;
  const startsBracket = base.charAt(0) === '[';
  const endsBracket = base.charAt(base.length - 1) === ']';
  const hasBracket = base.includes('[') || base.includes(']');

  if (startsBracket || endsBracket) {
    if (!startsBracket || !endsBracket) {
      return null;
    }

    base = base.slice(1, -1);

    if (base.indexOf(':') === -1 || base.includes('[') || base.includes(']')) {
      return null;
    }
  } else if (hasBracket) {
    return null;
  }

  if (!base || base.charAt(base.length - 1) === '.') {
    return null;
  }

  const wasIPv6 = base.indexOf(':') !== -1;

  if (wasIPv6) {
    try {
      base = new URL(`http://[${base}]/`).hostname.slice(1, -1);
    } catch (_err) {
      return null;
    }
  } else {
    base = normalizeIPAddress(base);

    if (!ipv4ToBytes(base)) {
      return null;
    }
  }

  return { normalized: unmapIPv4MappedIPv6(base), wasIPv6 };
};

const CIDR_ENTRY_RE = /^(.+)\/(0|[1-9]\d{0,2})$/;

const parseCidrEntry = (entry: string) => {
  if (entry.indexOf('/') === -1) {
    return undefined;
  }

  const match = CIDR_ENTRY_RE.exec(entry);

  if (!match) {
    return null;
  }

  let prefix = Number(match[2]);
  const parsedBase = normalizeCidrBase(match[1]);

  if (!parsedBase) {
    return null;
  }

  const { normalized, wasIPv6 } = parsedBase;

  if (wasIPv6 && normalized.indexOf(':') === -1) {
    if (prefix < 96) {
      return null;
    }

    prefix -= 96;
  }

  const bytes = ipToBytes(normalized);

  if (!bytes || prefix > bytes.length * 8) {
    return null;
  }

  return { bytes, prefix };
};

const isInSubnet = (
  addressBytes: number[],
  networkBytes: number[],
  prefix: number
) => {
  const fullBytes = prefix >> 3;

  for (let i = 0; i < fullBytes; i++) {
    if (addressBytes[i] !== networkBytes[i]) {
      return false;
    }
  }

  const remainingBits = prefix & 7;

  if (remainingBits) {
    const mask = (0xff << (8 - remainingBits)) & 0xff;

    if ((addressBytes[fullBytes] & mask) !== (networkBytes[fullBytes] & mask)) {
      return false;
    }
  }

  return true;
};

export function shouldBypassProxy(location: string, noProxyValue: string) {
  let parsed: URL;

  try {
    parsed = new URL(location);
  } catch (_err) {
    return false;
  }

  const noProxy = noProxyValue.toLowerCase();

  if (!noProxy) {
    return false;
  }

  if (noProxy === '*') {
    return true;
  }

  const port =
    Number.parseInt(parsed.port, 10) ||
    DEFAULT_PORTS[parsed.protocol.split(':', 1)[0]] ||
    0;

  const hostname = normalizeNoProxyHost(parsed.hostname.toLowerCase());
  const hostnameBytes = ipToBytes(hostname);

  return noProxy.split(/[\s,]+/).some((entry) => {
    if (!entry) {
      return false;
    }

    if (entry === '*') {
      return true;
    }

    const cidr = parseCidrEntry(entry);

    if (cidr !== undefined) {
      return (
        cidr !== null &&
        !!hostnameBytes &&
        hostnameBytes.length === cidr.bytes.length &&
        isInSubnet(hostnameBytes, cidr.bytes, cidr.prefix)
      );
    }

    let [entryHost, entryPort] = parseNoProxyEntry(entry);

    entryHost = normalizeNoProxyHost(entryHost);

    if (!entryHost) {
      return false;
    }

    if (entryPort && entryPort !== port) {
      return false;
    }

    if (entryHost.charAt(0) === '*') {
      entryHost = entryHost.slice(1);
    }

    if (entryHost.charAt(0) === '.') {
      return hostname.endsWith(entryHost);
    }

    return (
      hostname === entryHost || (isLoopback(hostname) && isLoopback(entryHost))
    );
  });
}
