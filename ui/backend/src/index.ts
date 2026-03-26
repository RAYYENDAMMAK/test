import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import { connectMongo } from './mongo-client';
import nfsRouter from './routes/nfs';
import subscribersRouter from './routes/subscribers';
import logsRouter from './routes/logs';
import pcapRouter from './routes/pcap';
import topologyRouter from './routes/topology';
import metricsRouter from './routes/metrics';
import slicesRouter from './routes/slices';
import gnbsRouter from './routes/gnbs';
import multusRouter from './routes/multus';
import authRouter from './routes/auth';
import { requireAuth } from './middleware/auth';
import { startGnbLogWatcher } from './gnb-log-watcher';
// import { validateLicense } from './license'; // LICENSE: disabled — re-enable when licensing is needed

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// LICENSE: disabled — uncomment when licensing is needed
// app.get('/api/license', async (req, res) => {
//   const info = await validateLicense();
//   const { cluster_id, ...safe } = info;
//   res.json(safe);
// });

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/nfs', requireAuth, nfsRouter);
app.use('/api/subscribers', requireAuth, subscribersRouter);
app.use('/api/logs', requireAuth, logsRouter);
app.use('/api/pcap', requireAuth, pcapRouter);
app.use('/api/topology', requireAuth, topologyRouter);
app.use('/api/metrics', requireAuth, metricsRouter);
app.use('/api/slices', requireAuth, slicesRouter);
app.use('/api/gnbs', requireAuth, gnbsRouter);
app.use('/api/multus', requireAuth, multusRouter);

// Serve frontend in production
if (isProd) {
  const publicDir = path.join(__dirname, '..', 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }
}

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

async function main() {
  await connectMongo();

  // LICENSE: disabled — uncomment when licensing is needed
  // const license = await validateLicense(true);
  // if (!license.valid) {
  //   console.error(`[license] ✗ ${license.error}`);
  //   console.error('[license] Place a valid license.jwt at /etc/ieee5g/license.jwt');
  //   console.error('[license] Starting in UNLICENSED mode — API access will be blocked');
  // }

  // Start gNB log watcher in background (does not block startup)
  startGnbLogWatcher().catch(err =>
    console.error('[gnb-watcher] Fatal error:', err)
  );

  app.listen(PORT, () => {
    console.log(`5G Core UI Backend running on port ${PORT}`);
    if (isProd) console.log(`Frontend served at http://localhost:${PORT}`);
  });
}

main().catch(console.error);
