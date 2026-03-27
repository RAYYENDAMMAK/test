import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import * as stream from 'stream';
import * as k8s from '@kubernetes/client-node';
import { Exec } from '@kubernetes/client-node';
import { connectMongo } from '../mongo-client';
import { coreV1Api, NAMESPACE } from '../k8s-client';

const router = Router();

// ── Schemas ───────────────────────────────────────────────────────────────────

const allowedSliceSchema = new mongoose.Schema(
  { sst: Number, sd: String },
  { _id: false }
);

const gnbRegistrySchema = new mongoose.Schema({
  gnbId:         { type: String, required: true, unique: true },
  name:          { type: String, required: true },
  type:          { type: String, enum: ['gNB', 'ng-eNB'], default: 'gNB' },
  vendor:        { type: String, default: '' },
  version:       { type: String, default: '' },
  site:          { type: String, default: '' },
  expectedIP:    { type: String, default: '' },
  maxUEs:        { type: Number, default: 128 },
  allowedSlices: { type: [allowedSliceSchema], default: [] },
  notes:         { type: String, default: '' },
}, { timestamps: true, collection: 'gnb_registry' });

const GnbRegistry =
  (mongoose.models.GnbRegistry || mongoose.model('GnbRegistry', gnbRegistrySchema)) as mongoose.Model<any>;

const gnbEventSchema = new mongoose.Schema({
  gnbId:     { type: String, required: true, index: true },
  event:     { type: String, required: true },
  remoteIP:  { type: String },
  assocId:   { type: String },
  ueCount:   { type: Number, default: 0 },
  detail:    { type: String, default: '' },
  timestamp: { type: Date, default: Date.now, index: true },
}, { collection: 'gnb_events' });

gnbEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

const GnbEvent =
  (mongoose.models.GnbEvent || mongoose.model('GnbEvent', gnbEventSchema)) as mongoose.Model<any>;

// ── SCTP types ────────────────────────────────────────────────────────────────

interface SctpAssoc {
  remoteIP: string;
  remotePort: number;
  localAddr: string;
  sctpState: string;
  assocId: string;
  streams: { in: number; out: number };
}

// ── pollAmfSctp ───────────────────────────────────────────────────────────────

async function pollAmfSctp(): Promise<SctpAssoc[]> {
  try {
    // Find AMF pod
    const podList = await coreV1Api.listNamespacedPod(
      NAMESPACE,
      undefined, undefined, undefined, undefined,
      'app=amf'
    );
    const pods = podList.body.items;
    if (!pods || pods.length === 0) {
      console.warn('[gnbs] No AMF pods found');
      return [];
    }
    const podName = pods[0].metadata?.name;
    if (!podName) {
      console.warn('[gnbs] AMF pod has no name');
      return [];
    }

    // Build exec client
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const exec = new Exec(kc);

    const output = await new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const stdoutStream = new stream.PassThrough();
      const stderrStream = new stream.PassThrough();
      stdoutStream.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      stderrStream.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      exec.exec(
        NAMESPACE,
        podName,
        'amf',
        ['cat', '/proc/net/sctp'],
        stdoutStream,
        stderrStream,
        null,
        false,
        (status: k8s.V1Status) => {
          if (status.status === 'Success') {
            resolve(stdout);
          } else {
            reject(new Error(`exec failed: ${stderr || JSON.stringify(status)}`));
          }
        }
      ).catch(reject);
    });

    // Parse /proc/net/sctp
    const lines = output.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const sstMap: Record<number, string> = {
      4: 'ESTABLISHED',
      7: 'CLOSED',
      5: 'COOKIE_ECHOED',
      6: 'COOKIE_WAIT',
    };

    const assocs: SctpAssoc[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(/\s+/);
      // col indices (0-based): 0=ASSOC, 1=sk, 2=sty, 3=sst, 4=tx_queue, 5=rx_queue,
      // 6=uid, 7=inode, 8=lport, 9=rport, 10=laddrs, <->, raddrs, ..., assoc-id
      if (cols.length < 12) continue;

      const lport = cols[8];
      if (lport !== '38412') continue;

      const sstInt = parseInt(cols[3], 16) || parseInt(cols[3], 10);
      const sctpState = sstMap[sstInt] || 'UNKNOWN';
      const rport = parseInt(cols[9], 16) || parseInt(cols[9], 10);
      const localAddr = cols[10];

      // Everything after '<->' up to the last numeric token is raddrs
      const arrowIdx = cols.indexOf('<->');
      let remoteIP = '';
      let assocId = '';
      if (arrowIdx !== -1 && arrowIdx + 1 < cols.length) {
        // raddrs follows '<->'; last column is assoc-id
        assocId = cols[cols.length - 1];
        // raddrs are between arrowIdx+1 and cols.length-2
        remoteIP = cols.slice(arrowIdx + 1, cols.length - 1).join(' ').trim();
        // Strip port suffix like ':5000' if present
        remoteIP = remoteIP.replace(/:\d+$/, '').trim();
      }

      assocs.push({
        remoteIP,
        remotePort: rport,
        localAddr,
        sctpState,
        assocId,
        streams: { in: 10, out: 10 },
      });
    }

    return assocs;
  } catch (err: any) {
    console.warn('[gnbs] pollAmfSctp failed:', err.message);
    return [];
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

router.use(async (_req, _res, next) => { await connectMongo(); next(); });

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/gnbs
router.get('/', async (_req: Request, res: Response) => {
  try {
    const registryDocs = await GnbRegistry.find().sort({ name: 1 });
    const assocs = await pollAmfSctp();
    const liveDataAvailable = assocs.length > 0;

    const gnbs: any[] = [];
    const matchedRemoteIPs = new Set<string>();

    for (const doc of registryDocs) {
      const d = doc.toObject();
      const assoc = assocs.find(a => a.remoteIP === d.expectedIP);
      if (assoc) matchedRemoteIPs.add(assoc.remoteIP);

      gnbs.push({
        ...d,
        sctpState:  assoc ? assoc.sctpState  : 'CLOSED',
        assocId:    assoc ? assoc.assocId    : '—',
        remotePort: assoc ? assoc.remotePort : 0,
        streams:    assoc ? assoc.streams    : { in: 0, out: 0 },
        liveDataAvailable,
      });
    }

    // Unregistered gNBs seen in SCTP poll
    for (const assoc of assocs) {
      if (!matchedRemoteIPs.has(assoc.remoteIP)) {
        gnbs.push({
          unregistered: true,
          gnbId:      '—',
          name:       'Unregistered gNB',
          remoteIP:   assoc.remoteIP,
          sctpState:  assoc.sctpState,
          assocId:    assoc.assocId,
          remotePort: assoc.remotePort,
          localAddr:  assoc.localAddr,
          streams:    assoc.streams,
          liveDataAvailable,
        });
      }
    }

    res.json({ gnbs, polledAt: new Date().toISOString(), liveDataAvailable });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/gnbs/live
router.get('/live', async (_req: Request, res: Response) => {
  try {
    const assocs = await pollAmfSctp();
    res.json({ assocs, polledAt: new Date().toISOString() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/gnbs/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const gnb = await GnbRegistry.findById(req.params.id);
    if (!gnb) return res.status(404).json({ error: 'gNB not found' });
    res.json(gnb);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/gnbs
router.post('/', async (req: Request, res: Response) => {
  try {
    const gnb = new GnbRegistry(req.body);
    await gnb.save();
    await new GnbEvent({ gnbId: gnb.gnbId, event: 'REGISTERED' }).save();
    res.status(201).json(gnb);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// PUT /api/gnbs/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const gnb = await GnbRegistry.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!gnb) return res.status(404).json({ error: 'gNB not found' });
    res.json(gnb);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// DELETE /api/gnbs/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const gnb = await GnbRegistry.findByIdAndDelete(req.params.id);
    if (!gnb) return res.status(404).json({ error: 'gNB not found' });
    await new GnbEvent({ gnbId: gnb.gnbId, event: 'DEREGISTERED' }).save();
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/gnbs/:id/events
router.get('/:id/events', async (req: Request, res: Response) => {
  try {
    const gnb = await GnbRegistry.findById(req.params.id);
    if (!gnb) return res.status(404).json({ error: 'gNB not found' });
    const events = await GnbEvent.find({ gnbId: gnb.gnbId })
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(events);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/gnbs/:id/events
router.post('/:id/events', async (req: Request, res: Response) => {
  try {
    const gnb = await GnbRegistry.findById(req.params.id);
    if (!gnb) return res.status(404).json({ error: 'gNB not found' });
    const { event, remoteIP, assocId, ueCount, detail } = req.body;
    const ev = new GnbEvent({ gnbId: gnb.gnbId, event, remoteIP, assocId, ueCount, detail });
    await ev.save();
    res.status(201).json(ev);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
