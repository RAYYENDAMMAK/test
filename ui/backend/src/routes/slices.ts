import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { connectMongo } from '../mongo-client';
import { appsV1Api, coreV1Api, NAMESPACE } from '../k8s-client';

const router = Router();

// ── Slice Schema ─────────────────────────────────────────────────────────────
const nfAllocationSchema = new mongoose.Schema({
  name: String,
  enabled: { type: Boolean, default: true },
  cpu: { request: String, limit: String },
  memory: { request: String, limit: String },
  replicas: { type: Number, default: 1 },
}, { _id: false });

const sliceSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  sst:         { type: Number, required: true },
  sd:          { type: String, default: '' },
  color:       { type: String, default: '#3b82f6' },
  status:      { type: String, enum: ['active', 'inactive', 'draft'], default: 'draft' },

  // Data Network
  dnn:         { type: String, default: 'internet' },
  subnet:      { type: String, default: '10.45.0.0/16' },
  dns:         { type: [String], default: ['8.8.8.8', '8.8.4.4'] },

  // AMBR (aggregate max bit rate)
  ambr: {
    downlink: { value: { type: Number, default: 1 }, unit: { type: Number, default: 3 } },
    uplink:   { value: { type: Number, default: 1 }, unit: { type: Number, default: 3 } },
  },

  // QoS
  qos: {
    index:    { type: Number, default: 9 },
    arp: {
      priority_level:             { type: Number, default: 8 },
      pre_emption_capability:    { type: Number, default: 1 },
      pre_emption_vulnerability: { type: Number, default: 1 },
    },
  },

  // MTU
  mtu: { type: Number, default: 1400 },

  // Priority for NSSF
  priority: { type: Number, default: 1 },

  // Assigned NFs with per-NF resource allocations
  networkFunctions: { type: [nfAllocationSchema], default: [] },
}, { timestamps: true });

const Slice = (mongoose.models.Slice || mongoose.model('Slice', sliceSchema)) as mongoose.Model<any>;

// Ensure mongo on every request
router.use(async (_req, _res, next) => { await connectMongo(); next(); });

// ── CRUD ─────────────────────────────────────────────────────────────────────

// GET /api/slices
router.get('/', async (_req: Request, res: Response) => {
  try {
    const slices = await Slice.find().sort({ sst: 1, sd: 1 });
    res.json(slices);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/slices/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const slice = await Slice.findById(req.params.id);
    if (!slice) return res.status(404).json({ error: 'Slice not found' });
    res.json(slice);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/slices
router.post('/', async (req: Request, res: Response) => {
  try {
    const slice = new Slice(req.body);
    await slice.save();
    res.status(201).json(slice);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// PUT /api/slices/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const slice = await Slice.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!slice) return res.status(404).json({ error: 'Slice not found' });
    res.json(slice);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// DELETE /api/slices/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const slice = await Slice.findByIdAndDelete(req.params.id);
    if (!slice) return res.status(404).json({ error: 'Slice not found' });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Apply slice resources to Kubernetes ──────────────────────────────────────

// POST /api/slices/:id/apply
// Patches K8s Deployment resource limits for each NF in this slice
router.post('/:id/apply', async (req: Request, res: Response) => {
  try {
    const slice = await Slice.findById(req.params.id);
    if (!slice) return res.status(404).json({ error: 'Slice not found' });

    const results: { nf: string; status: string; error?: string }[] = [];

    for (const nfAlloc of slice.networkFunctions) {
      if (!nfAlloc.enabled) continue;
      try {
        const deploy = await appsV1Api.readNamespacedDeployment(nfAlloc.name, NAMESPACE);
        const containers = deploy.body.spec?.template?.spec?.containers || [];
        if (containers.length === 0) { results.push({ nf: nfAlloc.name, status: 'skipped', error: 'no containers' }); continue; }

        // Patch resource limits
        containers[0].resources = {
          requests: { cpu: nfAlloc.cpu?.request || '100m', memory: nfAlloc.memory?.request || '64Mi' },
          limits:   { cpu: nfAlloc.cpu?.limit   || '500m', memory: nfAlloc.memory?.limit   || '256Mi' },
        };

        // Patch replicas
        if (deploy.body.spec) deploy.body.spec.replicas = nfAlloc.replicas || 1;

        await appsV1Api.replaceNamespacedDeployment(nfAlloc.name, NAMESPACE, deploy.body);
        results.push({ nf: nfAlloc.name, status: 'applied' });
      } catch (e: any) {
        results.push({ nf: nfAlloc.name, status: 'error', error: e.message });
      }
    }

    // Update slice status
    await Slice.findByIdAndUpdate(req.params.id, { status: 'active' });

    res.json({ success: true, results });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/slices/:id/deactivate
router.post('/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const slice = await Slice.findByIdAndUpdate(req.params.id, { status: 'inactive' }, { new: true });
    if (!slice) return res.status(404).json({ error: 'Slice not found' });
    res.json({ success: true, slice });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/slices/:id/nf-status
// Returns live K8s status for each NF in the slice
router.get('/:id/nf-status', async (req: Request, res: Response) => {
  try {
    const slice = await Slice.findById(req.params.id);
    if (!slice) return res.status(404).json({ error: 'Slice not found' });

    const statuses = await Promise.all(
      slice.networkFunctions.map(async (nf: any) => {
        try {
          const deploy = await appsV1Api.readNamespacedDeployment(nf.name, NAMESPACE);
          const ready = deploy.body.status?.readyReplicas || 0;
          const desired = deploy.body.spec?.replicas || 1;
          return {
            name: nf.name,
            ready,
            desired,
            status: ready === desired ? 'Running' : ready === 0 ? 'Down' : 'Degraded',
            currentCpu: deploy.body.spec?.template?.spec?.containers?.[0]?.resources?.limits?.cpu,
            currentMemory: deploy.body.spec?.template?.spec?.containers?.[0]?.resources?.limits?.memory,
          };
        } catch {
          return { name: nf.name, ready: 0, desired: 0, status: 'Unknown' };
        }
      })
    );

    res.json(statuses);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
