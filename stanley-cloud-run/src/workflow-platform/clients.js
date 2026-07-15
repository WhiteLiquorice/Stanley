function generatedClients(baseUrl, workflow, contract) {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/workflows/${encodeURIComponent(workflow.id)}/invoke`;
  return {
    curl: `curl -X POST ${JSON.stringify(endpoint)} -H "Authorization: Bearer $STANLEY_TOKEN" -H "Content-Type: application/json" -d '{"input":{}}'`,
    javascript: `export async function runStanley(input, token) {\n  const response = await fetch(${JSON.stringify(endpoint)}, { method: 'POST', headers: { Authorization: \`Bearer \${token}\`, 'Content-Type': 'application/json' }, body: JSON.stringify({ input }) });\n  if (!response.ok) throw new Error(await response.text());\n  return response.json();\n}`,
    python: `import requests\n\ndef run_stanley(input_data, token):\n    response = requests.post(${JSON.stringify(endpoint)}, headers={"Authorization": f"Bearer {token}"}, json={"input": input_data}, timeout=300)\n    response.raise_for_status()\n    return response.json()\n`,
    openapi: { openapi: '3.1.0', info: { title: workflow.name, version: '1.0.0' }, servers: [{ url: baseUrl.replace(/\/$/, '') }], security: [{ bearerAuth: [] }], paths: { [`/v1/workflows/${workflow.id}/invoke`]: { post: { operationId: `run_${workflow.id.replace(/[^a-zA-Z0-9_]/g, '_')}`, requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['input'], properties: { input: contract.inputSchema } } } } }, responses: { 200: { description: 'Production release completed' }, 202: { description: 'Production release accepted' }, 409: { description: 'No production release has been promoted' } } } } }, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Firebase ID token' } } } },
  };
}
module.exports = { generatedClients };
