import * as stream from 'stream';
import * as readline from 'readline';
import mongoose from 'mongoose';
import { Log } from '@kubernetes/client-node';
import { coreV1Api, k8sConfig, NAMESPACE } from './k8s-client';
import { connectMongo } from './mongo-client';

function getGnbEventModel() {
  return mongoose.models.GnbEvent as mongoose.Model<any>;
}
function getGnbRegistryModel() {
  return mongoose.models.GnbRegistry as mongoose.Model<any>;
}

const RE_NG_SETUP    = /\[amf\]\s+INFO:.*?\[([^\]]+)\]\s+NG.?Setup/i;
const RE_SCTP_ESTAB  = /\[amf\]\s+INFO:.*?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}).*SCTP.*(?:association\s+)?established/i;
const RE_SCTP_CLOSE  = /\[amf\]\s+(?:INFO|WARNING|ERROR):.*?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})?.*SCTP.*(?:closed|disconnected|failed|timeout)/i;
const RE_IP          = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/;
const RE_GNB_ID      = /(0x[0-9A-Fa-f]+)/;
const RE_TIMESTAMP   = /^(\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+):/;

async function findAmfPod(): Promise<string | null> {
  try {
    const res = await coreV1Api.listNamespacedPod(
      NAMESPACE, undefined, undefined, undefined, undefined, 'app=amf'
    );
    const running = res.body.items.find(
      p => p.status?.phase === 'Running' && p.metadata?.name
    );
    return running?.metadata?.name ?? null;
  } catch (err: any) {
    console.warn('[gnb-watcher] findAmfPod error:', err.message);
    return null;
  }
}

async function writeEvent(
  event: string,
  remoteIP: string | null,
  gnbId: string | null,
  detail: string
): Promise<void> {
  try {
    await connectMongo();
    const GnbEvent    = getGnbEventModel();
    const GnbRegistry = getGnbRegistryModel();
    if (!GnbEvent) return; // model not registered yet

    // Try to resolve gnbId from registry
    let resolvedGnbId = gnbId || 'UNKNOWN';
    if (GnbRegistry) {
      const query = remoteIP
        ? { $or: [{ expectedIP: remoteIP }, ...(gnbId ? [{ gnbId }] : [])] }
        : gnbId ? { gnbId } : null;
      if (query) {
        const reg = await GnbRegistry.findOne(query);
        if (reg) resolvedGnbId = reg.gnbId;
      }
    }

    await GnbEvent.create({ gnbId: resolvedGnbId, event, remoteIP, detail });
    console.log(`[gnb-watcher] Event: ${event} gnbId=${resolvedGnbId} ip=${remoteIP||'—'}`);
  } catch (err: any) {
    console.warn('[gnb-watcher] writeEvent error:', err.message);
  }
}

function parseLine(line: string): void {
  // NG Setup (gNB registered itself with the AMF)
  const ngSetupMatch = RE_NG_SETUP.exec(line);
  if (ngSetupMatch) {
    const gnbName  = ngSetupMatch[1];
    const gnbId    = RE_GNB_ID.exec(line)?.[1] ?? null;
    const remoteIP = RE_IP.exec(line)?.[1] ?? null;
    writeEvent('NG_SETUP_SUCCESS', remoteIP, gnbId || gnbName, `NG Setup from ${gnbName}`);
    return;
  }

  // SCTP established
  const estabMatch = RE_SCTP_ESTAB.exec(line);
  if (estabMatch) {
    const remoteIP = estabMatch[1] ?? RE_IP.exec(line)?.[1] ?? null;
    const gnbId    = RE_GNB_ID.exec(line)?.[1] ?? null;
    writeEvent('SCTP_ESTABLISHED', remoteIP, gnbId, `SCTP association established`);
    return;
  }

  // SCTP closed/failed
  const closeMatch = RE_SCTP_CLOSE.exec(line);
  if (closeMatch) {
    const remoteIP = closeMatch[1] ?? RE_IP.exec(line)?.[1] ?? null;
    const gnbId    = RE_GNB_ID.exec(line)?.[1] ?? null;
    const isFailure = /failed|timeout/i.test(line);
    writeEvent(
      isFailure ? 'SCTP_FAILED' : 'SCTP_CLOSED',
      remoteIP, gnbId,
      line.replace(/^.*\[amf\]\s+\w+:\s*/, '').replace(/\s*\(.*\)$/, '').trim()
    );
    return;
  }
}

async function startLogStream(podName: string): Promise<void> {
  console.log(`[gnb-watcher] Starting log stream for pod ${podName}`);
  const log = new Log(k8sConfig);
  const logStream = new stream.PassThrough();

  const rl = readline.createInterface({ input: logStream, crlfDelay: Infinity });
  rl.on('line', parseLine);
  rl.on('close', () => console.log('[gnb-watcher] Log stream closed'));

  try {
    await log.log(NAMESPACE, podName, 'amf', logStream, (err) => {
      if (err) console.warn('[gnb-watcher] Log stream error:', err.message);
    }, {
      follow:      true,
      tailLines:   200,      // catch last 200 lines on connect
      sinceSeconds: 300,     // and last 5 minutes
      timestamps:  false,
    });
  } catch (err: any) {
    console.warn('[gnb-watcher] startLogStream error:', err.message);
  }
}

export async function startGnbLogWatcher(): Promise<void> {
  console.log('[gnb-watcher] Starting gNB log watcher…');
  await connectMongo();

  let retryDelay = 10_000;
  let streamStart = 0;

  while (true) {
    const podName = await findAmfPod();
    if (!podName) {
      console.warn(`[gnb-watcher] No AMF pod found, retrying in ${retryDelay/1000}s`);
      await sleep(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60_000);
      continue;
    }

    streamStart = Date.now();
    await startLogStream(podName);

    const duration = Date.now() - streamStart;
    if (duration > 30_000) {
      retryDelay = 10_000; // reset backoff after a healthy stream
    } else {
      retryDelay = Math.min(retryDelay * 2, 60_000);
    }

    console.log(`[gnb-watcher] Stream ended (${Math.round(duration/1000)}s), retrying in ${retryDelay/1000}s`);
    await sleep(retryDelay);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
