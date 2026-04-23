import { Router, Request, Response } from 'express';
import * as stream from 'stream';
import { k8sConfig, NAMESPACE } from '../k8s-client';
import { coreV1Api } from '../k8s-client';
import { Log } from '@kubernetes/client-node';

const router = Router();

// GET /api/logs/:pod?tail=100 - fetch recent logs
router.get('/:pod', async (req: Request, res: Response) => {
  const { pod } = req.params;
  const tail = parseInt(req.query.tail as string) || 200;
  const container = req.query.container as string | undefined;

  try {
    const logRes = await coreV1Api.readNamespacedPodLog(
      pod, NAMESPACE, container, false, undefined, undefined, undefined, undefined, undefined, tail
    );
    res.json({ logs: logRes.body });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs/:pod/stream - Server-Sent Events log streaming
router.get('/:pod/stream', async (req: Request, res: Response) => {
  const { pod } = req.params;
  const container = req.query.container as string | undefined;

  console.log(`[logs] Starting SSE stream for pod ${pod} (namespace: ${NAMESPACE})`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: string) => {
    res.write(`data: ${JSON.stringify({ line: data, ts: new Date().toISOString() })}\n\n`);
  };

  const log = new Log(k8sConfig);
  const logStream = new stream.PassThrough();

  logStream.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    lines.forEach(sendEvent);
  });

  let k8sReq: any = null;

  try {
    k8sReq = await log.log(NAMESPACE, pod, container || '', logStream, (err) => {
      if (err) {
        console.error(`[logs] Log stream error for ${pod}:`, err.message);
        sendEvent(`[ERROR] ${err.message}`);
      }
      res.end();
    }, {
      follow: true,
      tailLines: 50,
      timestamps: false,
    });

    req.on('close', () => {
      console.log(`[logs] Client closed connection for ${pod}`);
      if (k8sReq && typeof k8sReq.abort === 'function') k8sReq.abort();
      if (k8sReq && typeof k8sReq.destroy === 'function') k8sReq.destroy();
      logStream.destroy();
    });
  } catch (err: any) {
    console.error(`[logs] Failed to start log stream for ${pod}:`, err);
    sendEvent(`[ERROR] ${err.message}`);
    res.end();
  }
});

// ── Loki proxy ────────────────────────────────────────────────────────────────
// GET /api/logs/loki/query?nf=amf&since=1h&limit=500
// GET /api/logs/loki/query?query={nf="amf"}&start=...&end=...&limit=500
// GET /api/logs/loki/labels   — list label names
// GET /api/logs/loki/ready    — health check

const LOKI_URL = process.env.LOKI_URL || 'http://loki-svc:3100';

router.get('/loki/ready', async (_req: Request, res: Response) => {
  try {
    const resp = await fetch(`${LOKI_URL}/ready`);
    const text = await resp.text();
    res.json({ ready: resp.ok, status: text.trim() });
  } catch (err: any) {
    res.json({ ready: false, status: err.message });
  }
});

router.get('/loki/labels', async (_req: Request, res: Response) => {
  try {
    const resp = await fetch(`${LOKI_URL}/loki/api/v1/labels`);
    const json = await resp.json() as any;
    res.json(json);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/loki/query', async (req: Request, res: Response) => {
  try {
    const {
      nf,
      query,
      since = '1h',
      start,
      end,
      limit = '500',
      direction = 'backward',
    } = req.query as Record<string, string>;

    // Build LogQL expression
    const logql = query || (nf ? `{namespace="open5gs",nf="${nf}"}` : `{namespace="open5gs"}`);

    const now   = Date.now() * 1_000_000;              // nanoseconds
    const sinceMs: Record<string, number> = {
      '15m': 15 * 60, '30m': 30 * 60, '1h': 3600,
      '3h': 3 * 3600, '6h': 6 * 3600, '24h': 24 * 3600,
    };
    const offsetSec = sinceMs[since] ?? 3600;
    const startNs = start ? String(Number(start) * 1_000_000) : String(now - offsetSec * 1_000_000_000);
    const endNs   = end   ? String(Number(end)   * 1_000_000) : String(now);

    const params = new URLSearchParams({
      query:     logql,
      start:     startNs,
      end:       endNs,
      limit:     limit,
      direction: direction,
    });

    const resp = await fetch(`${LOKI_URL}/loki/api/v1/query_range?${params}`);
    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(resp.status).json({ error: txt });
    }
    const json = await resp.json() as any;

    // Flatten streams → [{ts, nf, line}] sorted chronologically
    const lines: { ts: string; nfLabel: string; line: string }[] = [];
    for (const stream of json.data?.result ?? []) {
      const nfLabel: string = stream.stream?.nf || stream.stream?.container || stream.stream?.pod || 'unknown';
      for (const [tsNs, msg] of stream.values ?? []) {
        lines.push({ ts: new Date(Number(BigInt(tsNs) / 1_000_000n)).toISOString(), nfLabel, line: msg });
      }
    }
    lines.sort((a, b) => a.ts < b.ts ? -1 : 1);

    res.json({ lines, total: lines.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
