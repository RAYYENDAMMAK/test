import { Router, Request, Response } from 'express';
import { Subscriber, connectMongo } from '../mongo-client';

const router = Router();

router.use(async (req, res, next) => {
  await connectMongo();
  next();
});

/**
 * Normalize a subscriber doc before persisting. Open5GS distinguishes "SD absent"
 * (wildcard, matches any SD including UE's default 0xffffff) from "SD = empty string"
 * (parsed as 0x000000). An empty sd from the form is the user saying "no SD", so we
 * strip the field entirely rather than storing "".
 */
function normalizeSubscriber<T extends Record<string, any>>(doc: T): T {
  if (Array.isArray(doc?.slice)) {
    for (const s of doc.slice) {
      if (s && typeof s === 'object' && typeof s.sd === 'string' && s.sd.trim() === '') {
        delete s.sd;
      }
    }
  }
  return doc;
}

/**
 * Build a complete Open5GS subscriber document with sensible defaults.
 * Accepts flat options (key, opc, dnn, sst, sd, ...) or a pre-built slice array.
 */
function defaultSubscriber(imsi: string, opts: Record<string, any> = {}) {
  const slice: any = {
    sst: opts.sst ?? 1,
    default_indicator: true,
    session: [
      {
        name:     opts.dnn || 'internet',
        type:     opts.session_type ?? 3,
        pcc_rule: [],
        ambr: {
          downlink: { value: opts.ambr_dl_value ?? 1000000000, unit: opts.ambr_dl_unit ?? 0 },
          uplink:   { value: opts.ambr_ul_value ?? 1000000000, unit: opts.ambr_ul_unit ?? 0 },
        },
        qos: {
          index: opts.qos_index ?? 9,
          arp: {
            priority_level:            opts.arp_priority     ?? 8,
            pre_emption_capability:    opts.pre_emption_cap  ?? 1,
            pre_emption_vulnerability: opts.pre_emption_vuln ?? 2,
          },
        },
      },
    ],
  };
  // Only attach sd if caller supplied a non-empty value
  if (opts.sd && String(opts.sd).trim()) slice.sd = String(opts.sd).trim();

  return {
    imsi,
    msisdn:     opts.msisdn     ? [opts.msisdn] : [],
    imeisv:     opts.imeisv     || '',
    mme_host:   [],
    mme_realm:  [],
    purge_flag: [],
    security: {
      k:   opts.key || opts.k || '465B5CE8B199B49FAA5F0A2EE238A6BC',
      op:  opts.op  || null,
      opc: opts.opc || 'E8ED289DEBA952E4283B54E88E6183CA',
      amf: opts.amf || '8000',
      sqn: opts.sqn ?? 0,
    },
    ambr: {
      downlink: { value: opts.ambr_dl_value ?? 1000000000, unit: opts.ambr_dl_unit ?? 0 },
      uplink:   { value: opts.ambr_ul_value ?? 1000000000, unit: opts.ambr_ul_unit ?? 0 },
    },
    slice: opts.slice || [slice],
    access_restriction_data:     32,
    subscriber_status:           0,
    operator_determined_barring: 0,
    network_access_mode:         0,
    subscribed_rau_tau_timer:    12,
    schema_version:              1,
  };
}

// GET /api/subscribers
router.get('/', async (req: Request, res: Response) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit  = Math.min(200, parseInt(req.query.limit as string) || 20);
    const search = (req.query.search as string || '').trim();

    const filter = search ? { imsi: { $regex: search, $options: 'i' } } : {};
    const [total, subscribers] = await Promise.all([
      Subscriber.countDocuments(filter),
      Subscriber.find(filter).sort({ imsi: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);

    res.json({ subscribers, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/subscribers/:imsi
router.get('/:imsi', async (req: Request, res: Response) => {
  try {
    const imsi = req.params.imsi.replace(/^imsi-/, '');
    const sub  = await Subscriber.findOne({ imsi }).lean();
    if (!sub) return res.status(404).json({ error: 'Subscriber not found' });
    res.json(sub);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscribers
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body || !body.imsi) return res.status(400).json({ error: 'imsi is required' });

    const imsi = body.imsi.replace(/^imsi-/, '');

    const existing = await Subscriber.findOne({ imsi }).lean();
    if (existing) return res.status(409).json({ error: `Subscriber ${imsi} already exists` });

    // If caller supplied a full slice array use it directly, otherwise build from flat opts
    const doc = body.slice
      ? { ...body, imsi }
      : defaultSubscriber(imsi, body);

    normalizeSubscriber(doc);
    const created = await Subscriber.create(doc);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/subscribers/bulk — generate subscribers from startImsi + numOfUe
// Body: { startImsi, numOfUe, key?, opc?, dnn?, sst?, sd?, ... }
// Also accepts: { subscribers: [...] } for full-document bulk insert (legacy)
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Legacy: full-document array
    if (Array.isArray(body.subscribers)) {
      const docs = body.subscribers.map(normalizeSubscriber);
      const result = await Subscriber.insertMany(docs, { ordered: false });
      return res.status(201).json({ created: result.length, skipped: 0 });
    }

    const { startImsi, numOfUe, ...opts } = body;
    if (!startImsi || !numOfUe) {
      return res.status(400).json({ error: 'startImsi and numOfUe are required' });
    }

    const count   = Math.min(parseInt(numOfUe), 1000);
    const baseNum = BigInt(startImsi);
    const docs: any[] = [];

    for (let i = 0; i < count; i++) {
      const imsi = String(baseNum + BigInt(i)).padStart(15, '0');
      const exists = await Subscriber.findOne({ imsi }).lean();
      if (!exists) docs.push(defaultSubscriber(imsi, opts));
    }

    if (docs.length === 0) {
      return res.status(409).json({ error: 'All subscribers in range already exist' });
    }

    const result = await Subscriber.insertMany(docs, { ordered: false });
    res.status(201).json({ created: result.length, skipped: count - result.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/subscribers/:imsi
router.put('/:imsi', async (req: Request, res: Response) => {
  try {
    const imsi = req.params.imsi.replace(/^imsi-/, '');
    const body = normalizeSubscriber({ ...req.body });
    const sub  = await Subscriber.findOneAndUpdate(
      { imsi },
      { $set: { ...body, imsi } },
      { new: true, upsert: false, runValidators: true }
    ).lean();
    if (!sub) return res.status(404).json({ error: 'Subscriber not found' });
    res.json(sub);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/subscribers/bulk — bulk delete by IMSI array
// Body: { imsis: ['001010000000001', ...] }
router.delete('/bulk', async (req: Request, res: Response) => {
  try {
    const { imsis } = req.body;
    if (!Array.isArray(imsis) || imsis.length === 0) {
      return res.status(400).json({ error: 'imsis array is required' });
    }
    const result = await Subscriber.deleteMany({ imsi: { $in: imsis } });
    res.json({ deleted: result.deletedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/subscribers/:imsi
router.delete('/:imsi', async (req: Request, res: Response) => {
  try {
    const imsi = req.params.imsi.replace(/^imsi-/, '');
    const sub  = await Subscriber.findOneAndDelete({ imsi });
    if (!sub) return res.status(404).json({ error: 'Subscriber not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;