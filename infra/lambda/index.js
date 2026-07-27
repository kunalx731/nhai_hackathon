// Lambda handler — mirrors mock-sync-server.js exactly.
// POST /sync        body: { items: SyncQueueItem[] }  →  { syncedIds: string[] }
// GET  /attendance  ?limit=N                          →  { events: AttendanceEvent[] }
//
// Deploy: cd infra && terraform apply
// After deploy: copy api_url output into constants/aws.ts → apiEndpoint

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchWriteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = process.env.TABLE_NAME;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  const method = event.requestContext?.http?.method ?? event.httpMethod;
  let path = event.requestContext?.http?.path ?? event.path;
  // Strip stage prefix (e.g., /prod/sync -> /sync)
  path = path.replace(/^\/prod/, '');

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (method === 'POST' && path === '/sync') {
    return handleSync(event);
  }

  if (method === 'GET' && path === '/attendance') {
    return handleAttendance(event);
  }

  return {
    statusCode: 404,
    headers: CORS,
    body: JSON.stringify({ error: `No route ${method} ${path}` }),
  };
};

async function handleSync(event) {
  let body;
  try { body = JSON.parse(event.body ?? '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const items = body.items ?? [];
  if (items.length === 0) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ syncedIds: [] }) };
  }

  // DynamoDB BatchWrite limit is 25 per call
  const chunks = [];
  for (let i = 0; i < items.length; i += 25) chunks.push(items.slice(i, i + 25));

  const syncedAt = new Date().toISOString();
  for (const chunk of chunks) {
    const requests = chunk.map(item => ({
      PutRequest: { Item: { ...flattenItem(item), syncedAt } },
    }));
    await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE]: requests } }));
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ syncedIds: items.map(i => i.id) }),
  };
}

async function handleAttendance(event) {
  const limit = Math.min(
    parseInt(event.queryStringParameters?.limit ?? '100', 10),
    500
  );

  const result = await ddb.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: '#t = :type',
    ExpressionAttributeNames: { '#t': 'type' },
    ExpressionAttributeValues: { ':type': 'VERIFICATION_EVENT' },
  }));

  const events = (result.Items ?? [])
    .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
    .slice(0, limit);

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ events }) };
}

function flattenItem(item) {
  const p = item.payload ?? {};
  const base = {
    id:        item.id,
    type:      item.type,
    createdAt: item.createdAt,
  };
  if (item.type === 'VERIFICATION_EVENT') {
    return {
      ...base,
      employeeId:   p.employeeId   ?? 'unknown',
      matchedName:  p.matchedName  ?? null,
      success:      p.success      ?? false,
      livenessPass: p.livenessPass ?? false,
      matchScore:   p.matchScore   ?? 0,
      processingMs: p.processingMs ?? 0,
      timestamp:    p.timestamp    ?? item.createdAt,
    };
  }
  if (item.type === 'FACE_TEMPLATE') {
    return {
      ...base,
      employeeId:    p.employeeId ?? 'unknown',
      name:          p.name       ?? '',
      templateCount: (p.templates ?? []).length,
      timestamp:     p.createdAt  ?? item.createdAt,
    };
  }
  return base;
}
