/**
 * Who may use the dev server's own endpoints (/api, /mcp, /__ai_proxy, /__convert). They can change the model, run
 * scripts in the open tab, reach other servers and start programs, so:
 *
 *  - the Host header must be this computer – a website that points its own name at 127.0.0.1 (DNS rebinding) is refused.
 *    Vite's `server.allowedHosts` does not help: it runs after the middlewares of plugins
 *  - the connection must come from this computer, or carry the token S3D_REMOTE_TOKEN (Authorization: Bearer …) – so
 *    `vite --host` does not open them to the network. S3D_REMOTE_TRUST_NETWORK=1 is for containers whose port is only
 *    published on the host's 127.0.0.1: there every connection comes from the container network
 *  - browsers may only ask from the app itself: no other website, not even another port of this computer
 *
 * S3D_ALLOWED_HOSTS: further host names (comma separated), e.g. behind a reverse proxy.
 */
import type { IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const hostnameOf = (host: string) => {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
};

const isLocalName = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');

const isAllowedHost = (hostname: string) =>
  isLocalName(hostname) ||
  (process.env.S3D_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .includes(hostname);

const isLoopback = (address: string | undefined) =>
  !!address && (address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.'));

const hasToken = (req: IncomingMessage, token: string) => {
  const given = Buffer.from(req.headers.authorization ?? '');
  const wanted = Buffer.from(`Bearer ${token}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
};

/** why a request is refused – null when it may go on */
export const refusal = (req: IncomingMessage): string | null => {
  const host = req.headers.host ?? '';
  const hostname = hostnameOf(host);
  if (!hostname || !isAllowedHost(hostname)) {
    return 'Host not allowed (see S3D_ALLOWED_HOSTS).';
  }
  const token = process.env.S3D_REMOTE_TOKEN;
  if (!isLoopback(req.socket.remoteAddress)) {
    const allowed = token ? hasToken(req, token) : process.env.S3D_REMOTE_TRUST_NETWORK === '1';
    if (!allowed) {
      return 'Only from this computer (or with the token S3D_REMOTE_TOKEN).';
    }
  }
  const site = req.headers['sec-fetch-site'];
  // "none": typed into the address bar – that can only read
  const fromAddressBar = site === 'none' && (req.method === 'GET' || req.method === 'HEAD');
  if (site && site !== 'same-origin' && !fromAddressBar) {
    return 'Only requests from the app itself (no other websites).';
  }
  const origin = req.headers.origin;
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      /* "null" and the like */
    }
    if (originHost !== host) {
      return 'Only requests from the app itself (no other websites).';
    }
  }
  return null;
};
