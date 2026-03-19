import { Router, Request, Response } from 'express';
import { coreV1Api, k8sConfig, NAMESPACE } from '../k8s-client';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import * as k8s from '@kubernetes/client-node';

const router = Router();

const PCAP_DIR = process.env.PCAP_DIR || '/tmp/pcaps';
if (!fs.existsSync(PCAP_DIR)) fs.mkdirSync(PCAP_DIR, { recursive: true });

interface CaptureSession {
  id: string;
  pod: string;
  container?: string;
  interface: string;
  filter: string;
  startTime: string;
  status: 'running' | 'stopped' | 'error';
  filePath: string;
  pid?: number;
}

const sessions: Map<string, CaptureSession> = new Map();

// GET /api/pcap/sessions
router.get('/sessions', (req: Request, res: Response) => {
  res.json(Array.from(sessions.values()));
});

// POST /api/pcap/start
router.post('/start', async (req: Request, res: Response) => {
  const { pod, container, interface: iface = 'any', filter = '', duration = 60 } = req.body;
  if (!pod) return res.status(400).json({ error: 'pod is required' });

  const id = uuidv4();
  const filePath = path.join(PCAP_DIR, `${id}.pcap`);

  const session: CaptureSession = {
    id, pod, container, interface: iface, filter,
    startTime: new Date().toISOString(),
    status: 'running',
    filePath,
  };
  sessions.set(id, session);

  try {
    const exec = new k8s.Exec(k8sConfig);
    const ws = await exec.exec(
      NAMESPACE, pod,
      container || pod,
      ['tcpdump', '-i', iface, '-w', '-', ...(filter ? [filter] : [])],
      new stream.PassThrough(),
      process.stderr as any,
      process.stdin as any,
      false
    );

    res.json({ id, status: 'started', message: `PCAP capture started on pod ${pod}` });
  } catch (err: any) {
    session.status = 'error';
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pcap/stop/:id
router.post('/stop/:id', (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  session.status = 'stopped';
  res.json({ success: true, session });
});

// GET /api/pcap/download/:id
router.get('/download/:id', (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!fs.existsSync(session.filePath)) {
    return res.status(404).json({ error: 'PCAP file not found' });
  }
  res.download(session.filePath, `capture-${session.id}.pcap`);
});

// DELETE /api/pcap/sessions/:id
router.delete('/sessions/:id', (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (fs.existsSync(session.filePath)) fs.unlinkSync(session.filePath);
  sessions.delete(req.params.id);
  res.json({ success: true });
});

// GET /api/pcap/pods - list capturable pods
router.get('/pods', async (req: Request, res: Response) => {
  try {
    const pods = await coreV1Api.listNamespacedPod(NAMESPACE);
    const result = pods.body.items
      .filter(p => p.status?.phase === 'Running')
      .map(p => ({
        name: p.metadata?.name,
        app: p.metadata?.labels?.app,
        containers: p.spec?.containers?.map(c => c.name),
        podIP: p.status?.podIP,
      }));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
