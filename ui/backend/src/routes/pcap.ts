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
  duration: number;
  startTime: string;
  status: 'running' | 'stopped' | 'error';
  filePath: string;
}

const sessions: Map<string, CaptureSession> = new Map();
const activeExecSockets: Map<string, { close: () => void }> = new Map();

function finalizeSession(session: CaptureSession, status: CaptureSession['status']) {
  session.status = status;
  activeExecSockets.delete(session.id);
}

function getCaptureCommand(iface: string, filter: string, duration: number): string[] {
  const safeDuration = Math.max(1, Math.floor(duration));

  return [
    'sh',
    '-c',
    `
set -eu
IFACE="$1"
FILTER="$2"
DURATION="$3"

if [ -n "$FILTER" ]; then
  tcpdump -U -i "$IFACE" -w - "$FILTER" &
else
  tcpdump -U -i "$IFACE" -w - &
fi

PID="$!"
sleep "$DURATION"
kill -INT "$PID" 2>/dev/null || true
wait "$PID"
`,
    'pcap-capture',
    iface,
    filter,
    String(safeDuration),
  ];
}

async function ensureTcpdumpAvailable(pod: string, containerName: string): Promise<void> {
  const exec = new k8s.Exec(k8sConfig);
  const stdout = new stream.PassThrough();
  const stderr = new stream.PassThrough();
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  stdout.on('data', chunk => stdoutChunks.push(chunk.toString()));
  stderr.on('data', chunk => stderrChunks.push(chunk.toString()));

  await exec.exec(
    NAMESPACE,
    pod,
    containerName,
    ['sh', '-c', 'command -v tcpdump'],
    stdout,
    stderr,
    null,
    false,
  );

  await new Promise<void>((resolve, reject) => {
    stdout.on('end', resolve);
    stderr.on('end', resolve);
    stdout.on('error', reject);
    stderr.on('error', reject);
    setTimeout(resolve, 500);
  });

  if (!stdoutChunks.join('').trim()) {
    const detail = stderrChunks.join('').trim();
    throw new Error(detail || `tcpdump is not installed in container "${containerName}"`);
  }
}

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
  const safeDuration = Math.max(1, Number(duration) || 60);

  const session: CaptureSession = {
    id, pod, container, interface: iface, filter,
    duration: safeDuration,
    startTime: new Date().toISOString(),
    status: 'running',
    filePath,
  };
  sessions.set(id, session);

  try {
    // Get the actual container name - default to first container in pod
    let containerName = container;
    if (!containerName) {
      const podRes = await coreV1Api.readNamespacedPod(pod, NAMESPACE);
      const containers = podRes.body.spec?.containers || [];
      if (containers.length === 0) {
        throw new Error('No containers found in pod');
      }
      containerName = containers[0].name;
    }

    await ensureTcpdumpAvailable(pod, containerName);

    const exec = new k8s.Exec(k8sConfig);
    const stdout = new stream.PassThrough();
    const stderr = new stream.PassThrough();
    const fileStream = fs.createWriteStream(filePath);
    const stderrChunks: string[] = [];
    stdout.pipe(fileStream);
    stderr.on('data', chunk => stderrChunks.push(chunk.toString()));

    const socket = await exec.exec(
      NAMESPACE,
      pod,
      containerName,
      getCaptureCommand(iface, filter, safeDuration),
      stdout,
      stderr,
      null,
      false,
      (status: k8s.V1Status) => {
        console.log(`[pcap] exec completed: ${JSON.stringify(status)}`);
        const code = Number((status as any)?.details?.causes?.find((cause: any) => cause.reason === 'ExitCode')?.message ?? 0);
        fileStream.end();
        finalizeSession(session, code === 0 || session.status === 'stopped' ? 'stopped' : 'error');
      }
    );
    activeExecSockets.set(id, socket);
    socket.onclose = () => {
      fileStream.end();
      if (session.status === 'running') {
        finalizeSession(session, 'stopped');
      }
    };
    socket.onerror = (err: any) => {
      fileStream.destroy(err instanceof Error ? err : undefined);
      finalizeSession(session, 'error');
    };
    fileStream.on('error', () => finalizeSession(session, 'error'));
    fileStream.on('close', () => {
      if (fs.existsSync(filePath)) {
        try {
          if (fs.statSync(filePath).size === 0) fs.unlinkSync(filePath);
        } catch {}
      }
      if (session.status === 'running') {
        const stderrText = stderrChunks.join('').trim();
        finalizeSession(session, stderrText ? 'error' : 'stopped');
      }
    });

    res.json({ id, status: 'started', message: `PCAP capture started on pod ${pod}` });
  } catch (err: any) {
    session.status = 'error';
    console.error('[pcap] start failed:', err.message, err.body?.message || '');
    res.status(500).json({ error: err.body?.message || err.message });
  }
});

// POST /api/pcap/stop/:id
router.post('/stop/:id', (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  if (session.status !== 'running') {
    return res.json({ success: true, session });
  }

  const socket = activeExecSockets.get(req.params.id);
  if (!socket) {
    return res.status(409).json({ error: 'Capture is still finalizing; try again in a moment' });
  }

  socket.close();
  res.json({ success: true, message: 'Stop requested' });
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
  const socket = activeExecSockets.get(req.params.id);
  if (socket) {
    socket.close();
    activeExecSockets.delete(req.params.id);
  }
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
