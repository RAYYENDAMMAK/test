import { Router, Request, Response } from 'express';
import * as http from 'http';
import * as https from 'https';

const router = Router();

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus-svc:9090';
const GRAFANA_URL = process.env.GRAFANA_URL || 'http://grafana-svc:3000';

async function queryPrometheus(query: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/v1/query?query=${encodeURIComponent(query)}`, PROMETHEUS_URL);
    const proto = url.protocol === 'https:' ? https : http;
    proto.get(url.toString(), (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from Prometheus')); }
      });
    }).on('error', reject);
  });
}

// GET /api/metrics/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const queries = {
      amf_ue_count: 'open5gs_amf_ue_total',
      smf_session_count: 'open5gs_smf_session_total',
      upf_bytes_in: 'open5gs_upf_rx_bytes_total',
      upf_bytes_out: 'open5gs_upf_tx_bytes_total',
    };

    const results: Record<string, any> = {};
    await Promise.allSettled(
      Object.entries(queries).map(async ([key, query]) => {
        try {
          const r = await queryPrometheus(query);
          results[key] = r?.data?.result?.[0]?.value?.[1] || '0';
        } catch {
          results[key] = '0';
        }
      })
    );

    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/metrics/grafana - return Grafana URL for embedding
router.get('/grafana', (req: Request, res: Response) => {
  res.json({ url: GRAFANA_URL });
});

// GET /api/metrics/prometheus-proxy - proxy prometheus queries
router.get('/query', async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query) return res.status(400).json({ error: 'q parameter required' });
  try {
    const result = await queryPrometheus(query);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
