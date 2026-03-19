import { Router, Request, Response } from 'express';
import { Subscriber, connectMongo } from '../mongo-client';

const router = Router();

// Ensure mongo connected
router.use(async (req, res, next) => {
  await connectMongo();
  next();
});

// GET /api/subscribers
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string || '';

    const filter = search ? { imsi: { $regex: search, $options: 'i' } } : {};
    const total = await Subscriber.countDocuments(filter);
    const subscribers = await Subscriber.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ imsi: 1 });

    res.json({ subscribers, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/subscribers/:imsi
router.get('/:imsi', async (req: Request, res: Response) => {
  try {
    const sub = await Subscriber.findOne({ imsi: req.params.imsi });
    if (!sub) return res.status(404).json({ error: 'Subscriber not found' });
    res.json(sub);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscribers
router.post('/', async (req: Request, res: Response) => {
  try {
    const sub = new Subscriber(req.body);
    await sub.save();
    res.status(201).json(sub);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/subscribers/:imsi
router.put('/:imsi', async (req: Request, res: Response) => {
  try {
    const sub = await Subscriber.findOneAndUpdate(
      { imsi: req.params.imsi },
      req.body,
      { new: true, runValidators: true }
    );
    if (!sub) return res.status(404).json({ error: 'Subscriber not found' });
    res.json(sub);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/subscribers/:imsi
router.delete('/:imsi', async (req: Request, res: Response) => {
  try {
    const sub = await Subscriber.findOneAndDelete({ imsi: req.params.imsi });
    if (!sub) return res.status(404).json({ error: 'Subscriber not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscribers/bulk - bulk import
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { subscribers } = req.body;
    const result = await Subscriber.insertMany(subscribers, { ordered: false });
    res.status(201).json({ inserted: result.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
