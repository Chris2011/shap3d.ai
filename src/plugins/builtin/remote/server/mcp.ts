/**
 * MCP server (Model Context Protocol, JSON-RPC 2.0) with one tool per remote action.
 * Served as "Streamable HTTP" at /mcp (plain JSON answers, no server-sent events);
 * mcpStdio.mjs (next to this file) offers the same over stdio for clients without HTTP support.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { ACTIONS, type RemoteAction } from './actions';
import { RemoteError, type Bridge } from './bridge';

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'shap3d-ai', title: 'Shap3D.ai', version: '1.0.0' };
const INSTRUCTIONS =
  'Controls the Shap3D.ai 3D editor that is open in the browser (SketchUp-like, units metres, Z up). ' +
  'Start with get_scene; build with create_object or – for anything more complex – run_script (call get_script_reference once for the s3d API). ' +
  'Every change is an undo step (undo). Check results visually with screenshot.';

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: any;
}

const toolActions = ACTIONS.filter((action) => action.tool);

const toolDefinition = (action: RemoteAction) => ({
  name: action.tool,
  title: action.summary,
  description: action.description,
  inputSchema: action.input && !action.input.additionalProperties ? action.input : { type: 'object', properties: {} },
  annotations: {
    title: action.summary,
    readOnlyHint: !!action.readOnly,
    destructiveHint: !!action.destructive,
    idempotentHint: !!action.readOnly,
    openWorldHint: false,
  },
});

const text = (value: unknown) => ({ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) });

export const createMcp = (bridge: Bridge, projectRoot: string) => {
  const callTool = async (name: string, args: Record<string, unknown>) => {
    const action = toolActions.find((candidate) => candidate.tool === name);
    if (!action) {
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
    }
    try {
      if (action.local) {
        return { content: [text(bridge.status())] };
      }
      const answer = await bridge.call(action.id, args, 'mcp');
      if (!answer.ok) {
        return { content: [text(answer.error ?? 'Failed')], isError: true };
      }
      if (answer.file && action.id === 'screenshot') {
        return { content: [{ type: 'image', data: answer.file.base64, mimeType: answer.file.mimeType }] };
      }
      if (answer.file) {
        const target = typeof args.path === 'string' && args.path ? args.path : `exports/${answer.file.name}`;
        const file = isAbsolute(target) ? target : resolve(projectRoot, target);
        await mkdir(dirname(file), { recursive: true });
        const bytes = Buffer.from(answer.file.base64, 'base64');
        await writeFile(file, bytes);
        return { content: [text({ file, bytes: bytes.length, mimeType: answer.file.mimeType })] };
      }
      return { content: [text(answer.result ?? { ok: true })] };
    } catch (error) {
      return { content: [text((error as Error).message)], isError: true };
    }
  };

  /** answers one JSON-RPC message; null for notifications */
  const handle = async (message: JsonRpcMessage): Promise<object | null> => {
    const reply = (result: unknown) => ({ jsonrpc: '2.0', id: message.id, result });
    const fail = (code: number, errorMessage: string) => ({
      jsonrpc: '2.0',
      id: message.id ?? null,
      error: { code, message: errorMessage },
    });
    if (message?.jsonrpc !== '2.0') {
      return fail(-32600, 'Invalid request');
    }
    if (typeof message.method !== 'string') {
      return null;
    } // a response from the client – nothing to answer
    if (message.id === undefined) {
      return null;
    } // notification (initialized, cancelled …)
    try {
      switch (message.method) {
        case 'initialize': {
          const requested = message.params?.protocolVersion;
          return reply({
            protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions: INSTRUCTIONS,
          });
        }
        case 'ping':
          return reply({});
        case 'tools/list':
          return reply({ tools: toolActions.map(toolDefinition) });
        case 'tools/call':
          return reply(await callTool(String(message.params?.name ?? ''), message.params?.arguments ?? {}));
        case 'resources/list':
          return reply({ resources: [] });
        case 'prompts/list':
          return reply({ prompts: [] });
        default:
          return fail(-32601, `Method not found: ${message.method}`);
      }
    } catch (error) {
      const code = (error as { code?: number }).code ?? (error instanceof RemoteError ? -32000 : -32603);
      return fail(code, (error as Error).message);
    }
  };

  return { handle };
};
