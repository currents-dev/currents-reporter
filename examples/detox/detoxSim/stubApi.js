const http = require('http');
const zlib = require('zlib');

/**
 * Stands in for the Currents API so the POC can be run offline: it prints the
 * artifacts each instance carries, hands back upload URLs for them, and reports
 * what actually gets uploaded.
 */
const PORT = 4567;
const uploaded = [];

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('error', reject);
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

const parseRunPayload = (req, body) => {
  const raw =
    req.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(body) : body;
  return JSON.parse(raw.toString('utf8'));
};

const collectArtifacts = (instances) =>
  instances.flatMap((instance) => [
    ...(instance.artifacts ?? []).map((a) => ({ ...a, on: instance.spec })),
    ...instance.results.tests.flatMap((test) => [
      ...(test.artifacts ?? []).map((a) => ({
        ...a,
        on: test.title.join(' > '),
      })),
      ...test.attempts.flatMap((attempt) =>
        (attempt.artifacts ?? []).map((a) => ({
          ...a,
          on: `${test.title.join(' > ')} [attempt ${attempt.attempt}]`,
        }))
      ),
    ]),
  ]);

const server = http.createServer(async (req, res) => {
  const body = await readBody(req);

  if (req.method === 'POST' && req.url.endsWith('/v1/runs')) {
    const payload = parseRunPayload(req, body);
    const artifacts = collectArtifacts(payload.instances ?? []);

    console.log(
      `\n[stub] POST /v1/runs framework=${payload.framework.type}` +
        ` origin=${payload.framework.frameworkConfig?.originFramework ?? '-'}` +
        ` instances=${(payload.instances ?? []).length}` +
        ` tests=${(payload.fullTestSuite ?? []).reduce((n, g) => n + g.tests.length, 0)}`
    );

    artifacts.forEach((artifact) =>
      console.log(
        `[stub]   ${artifact.type.padEnd(10)} ${artifact.name.padEnd(24)} ${artifact.on}`
      )
    );

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        runId: 'stub-run-id',
        groupId: payload.group,
        machineId: payload.machineId,
        ciBuildId: payload.ciBuildId,
        dashboardUrl: `http://localhost:${PORT}`,
        runUrl: `http://localhost:${PORT}/run/stub-run-id`,
        isNewRun: true,
        cancellation: null,
        warnings: [],
        artifactUploadUrls: artifacts.map((artifact, index) => ({
          artifactId: `artifact-${index}`,
          path: artifact.path,
          uploadUrl: `http://localhost:${PORT}/upload/${index}?path=${encodeURIComponent(artifact.path)}`,
          readUrl: `http://localhost:${PORT}/read/${index}`,
        })),
      })
    );
    return;
  }

  if (req.method === 'PUT' && req.url.startsWith('/upload/')) {
    const path = decodeURIComponent(
      new URL(req.url, `http://localhost:${PORT}`).searchParams.get('path')
    );
    uploaded.push({
      path,
      bytes: body.length,
      contentType: req.headers['content-type'],
    });
    console.log(
      `[stub]   uploaded ${path} (${body.length} bytes, ${req.headers['content-type']})`
    );
    res.writeHead(200).end();
    return;
  }

  console.log(`[stub] unhandled ${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
});

server.listen(PORT, () =>
  console.log(`[stub] listening on http://localhost:${PORT}`)
);

process.on('SIGTERM', () => {
  console.log(`\n[stub] ${uploaded.length} artifacts uploaded`);
  process.exit(0);
});
