import { Router, Request, Response } from 'express';
import * as http from 'http';
import * as https from 'https';
import { k8sConfig, NAMESPACE } from '../k8s-client';
import { coreV1Api } from '../k8s-client';

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

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: string) => {
    res.write(`data: ${JSON.stringify({ line: data, ts: new Date().toISOString() })}\n\n`);
  };

  try {
    const cluster = k8sConfig.getCurrentCluster();
    const server = cluster?.server || 'https://kubernetes.default.svc';
    const token = k8sConfig.getCurrentUser()?.token;

    const params = new URLSearchParams({
      follow: 'true',
      tailLines: '50',
      ...(container ? { container } : {}),
    });

    const url = new URL(
      `/api/v1/namespaces/${NAMESPACE}/pods/${pod}/log?${params}`,
      server
    );

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      rejectUnauthorized: false,
    };

    const proto = url.protocol === 'https:' ? https : http;
    const k8sReq = proto.request(options, (k8sRes) => {
      k8sRes.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        lines.forEach(sendEvent);
      });
      k8sRes.on('end', () => res.end());
    });

    k8sReq.on('error', (err) => {
      sendEvent(`[ERROR] ${err.message}`);
      res.end();
    });

    k8sReq.end();

    req.on('close', () => {
      k8sReq.destroy();
    });
  } catch (err: any) {
    sendEvent(`[ERROR] ${err.message}`);
    res.end();
  }
});

export default router;
