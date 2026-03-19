import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import { coreV1Api, NAMESPACE } from './k8s-client';

export interface LicenseInfo {
  valid: boolean;
  institution: string;
  cluster_id: string;
  features: string[];
  max_gnbs: number;
  expires_at: Date | null;
  days_remaining: number;
  error?: string;
}

// Public key is bundled with the backend (committed to repo)
const PUBLIC_KEY_PATH = path.join(__dirname, 'license-public.pem');

// License file location (env override or default)
const LICENSE_PATH = process.env.LICENSE_FILE || '/etc/ieee5g/license.jwt';

let _cachedLicense: LicenseInfo | null = null;
let _lastCheck = 0;
const CACHE_TTL = 3600_000; // re-check every hour

/** Read the cluster UID from kube-system namespace */
async function getClusterUID(): Promise<string | null> {
  try {
    const res = await coreV1Api.readNamespace('kube-system');
    return res.body.metadata?.uid ?? null;
  } catch {
    return null;
  }
}

/** Validate the license JWT and return LicenseInfo */
export async function validateLicense(force = false): Promise<LicenseInfo> {
  const now = Date.now();
  if (!force && _cachedLicense && (now - _lastCheck) < CACHE_TTL) {
    return _cachedLicense;
  }

  const fail = (error: string): LicenseInfo => ({
    valid: false, institution: '', cluster_id: '', features: [],
    max_gnbs: 0, expires_at: null, days_remaining: 0, error,
  });

  // 1. Read public key
  if (!fs.existsSync(PUBLIC_KEY_PATH)) {
    return fail('License public key not found. Run scripts/generate-keypair.sh first.');
  }
  const publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');

  // 2. Read license file
  if (!fs.existsSync(LICENSE_PATH)) {
    return fail(`License file not found at ${LICENSE_PATH}. Contact ieee-testbed for a license.`);
  }
  const token = fs.readFileSync(LICENSE_PATH, 'utf8').trim();

  // 3. Verify JWT signature
  let decoded: any;
  try {
    decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
  } catch (err: any) {
    return fail(`Invalid license signature: ${err.message}`);
  }

  // 4. Verify cluster ID
  const clusterUID = await getClusterUID();
  if (clusterUID && decoded.cluster_id !== clusterUID) {
    return fail(`License is not valid for this cluster. Expected ${decoded.cluster_id}, got ${clusterUID}.`);
  }

  // 5. Check expiry
  const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : null;
  const daysRemaining = expiresAt
    ? Math.floor((expiresAt.getTime() - Date.now()) / 86400_000)
    : 9999;

  if (daysRemaining < 0) {
    return fail(`License expired on ${expiresAt?.toISOString().slice(0,10)}.`);
  }

  const info: LicenseInfo = {
    valid: true,
    institution: decoded.institution || 'Unknown',
    cluster_id: decoded.cluster_id,
    features: decoded.features || [],
    max_gnbs: decoded.max_gnbs || 0,
    expires_at: expiresAt,
    days_remaining: daysRemaining,
  };

  _cachedLicense = info;
  _lastCheck = now;

  if (daysRemaining <= 30) {
    console.warn(`[license] ⚠ License expires in ${daysRemaining} days (${expiresAt?.toISOString().slice(0,10)})`);
  } else {
    console.log(`[license] ✓ Licensed to: ${info.institution} · expires in ${daysRemaining} days`);
  }

  return info;
}

/** Express middleware — rejects requests if license is invalid */
export async function requireLicense(
  req: any, res: any, next: any
): Promise<void> {
  const info = await validateLicense();
  if (!info.valid) {
    res.status(403).json({ error: 'License error', detail: info.error });
    return;
  }
  (req as any).license = info;
  next();
}

/** Check if a specific feature is licensed */
export async function hasFeature(feature: string): Promise<boolean> {
  const info = await validateLicense();
  return info.valid && info.features.includes(feature);
}
