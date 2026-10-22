#!/usr/bin/env node
/**
 * MCP over stdio for clients that cannot talk HTTP: passes every JSON-RPC line from stdin to the
 * dev server's /mcp endpoint and writes the answers to stdout. The dev server (npm run dev) and one
 * open tab of the app must be running.
 *
 *   node src/plugins/builtin/remote/server/mcpStdio.mjs            (server: http://localhost:5173)
 *   S3D_URL=http://localhost:5174 node src/plugins/builtin/remote/server/mcpStdio.mjs
 */
import { createInterface } from 'node:readline';

const endpoint = `${(process.env.S3D_URL ?? 'http://localhost:5173').replace(/\/$/, '')}/mcp`;

const write = (message) => process.stdout.write(JSON.stringify(message) + '\n');

const forward = async (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(message),
    });
    if (response.status === 202) {
      return;
    }
    const answer = await response.json();
    write(answer);
  } catch (error) {
    if (message?.id === undefined) {
      return;
    } // notifications get no answer
    write({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32000,
        message: `Shap3D.ai dev server not reachable at ${endpoint} – start it with "npm run dev" (${error?.cause?.code ?? error?.message ?? error})`,
      },
    });
  }
};

createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim()) {
    forward(line);
  }
});
