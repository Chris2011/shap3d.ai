/** Builds the OpenAPI 3.1 document of the REST API from the action list. */
import { ACTIONS, inputProperties, pathParameters, usesQuery, type JsonSchema, type RemoteAction } from './actions';

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const operation = (action: RemoteAction) => {
  const properties = inputProperties(action);
  const required = new Set((action.input?.required as string[] | undefined) ?? []);
  const inPath = pathParameters(action);
  const parameters = Object.entries(properties)
    .filter(([name]) => inPath.includes(name) || (usesQuery(action) && name !== 'path'))
    .map(([name, schema]) => ({
      name,
      in: inPath.includes(name) ? 'path' : 'query',
      required: inPath.includes(name) || required.has(name),
      description: schema.description,
      schema: { ...schema, description: undefined },
    }));

  let requestBody: unknown;
  if (!usesQuery(action) && action.input) {
    const bodyProperties = Object.fromEntries(Object.entries(properties).filter(([name]) => !inPath.includes(name)));
    const bodyRequired = [...required].filter((name) => !inPath.includes(name));
    const schema: JsonSchema = action.input.additionalProperties
      ? action.input
      : { type: 'object', properties: bodyProperties, ...(bodyRequired.length ? { required: bodyRequired } : {}) };
    requestBody = { required: bodyRequired.length > 0 || !!action.input.additionalProperties, content: { 'application/json': { schema } } };
  }

  const success = action.binary
    ? {
        description: 'The file',
        content: Object.fromEntries(action.binary.mimeTypes.map((type) => [type, { schema: { type: 'string', format: 'binary' } }])),
      }
    : { description: 'Result', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } };

  return {
    operationId: action.id.replace(/\.(\w)/g, (_, letter: string) => letter.toUpperCase()),
    tags: [action.tag],
    summary: action.summary,
    description: action.description + (action.tool ? `\n\nMCP tool: \`${action.tool}\`` : ''),
    ...(action.tool ? { 'x-mcp-tool': action.tool } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses: {
      200: success,
      400: errorResponse('Invalid parameters or the action failed in the app'),
      404: errorResponse('Unknown object or command'),
      503: errorResponse('No Shap3D.ai tab is connected'),
      504: errorResponse('The app did not answer in time'),
    },
  };
};

export const buildOpenApi = (serverUrl: string) => {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const action of ACTIONS) {
    paths[action.path] ??= {};
    paths[action.path][action.method.toLowerCase()] = operation(action);
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Shap3D.ai Remote API',
      version: '1.0.0',
      description:
        'Controls the Shap3D.ai editor that is open in the browser. The dev server (`npm run dev`) forwards every request over its WebSocket to the open tab ' +
        '(the most recently active one) and returns the answer – so keep one tab of the app open. Units are metres, Z is up. ' +
        'Changes are normal undo steps in the app. The same actions are available as MCP tools at `/mcp`.',
    },
    servers: [{ url: `${serverUrl}/api` }],
    tags: [...new Set(ACTIONS.map((action) => action.tag))].map((name) => ({ name })),
    paths,
    components: {
      schemas: {
        Error: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
      },
    },
  };
};
