import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, '../data');
const SETTINGS_FILE = join(DATA_DIR, 'settings.json');

const DEFAULTS = { oracleClientDir: '' };

export function getSettings() {
  try {
    if (existsSync(SETTINGS_FILE))
      return { ...DEFAULTS, ...JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch {}
  return { ...DEFAULTS };
}

export function updateSettings(updates) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const updated = { ...getSettings(), ...updates };
  writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

// Auto-detect Oracle Instant Client from common locations
export function autoDetectOracleClient() {
  const candidates = [];

  if (process.env.ORACLE_HOME) {
    candidates.push(
      join(process.env.ORACLE_HOME, 'lib'),
      join(process.env.ORACLE_HOME, 'bin'),
      process.env.ORACLE_HOME,
    );
  }

  if (process.env.LD_LIBRARY_PATH) {
    for (const p of process.env.LD_LIBRARY_PATH.split(':'))
      if (/oracle|instantclient/i.test(p)) candidates.push(p);
  }

  // Linux
  for (const ver of ['21', '19', '18', '12.2', '12.1', '11.2']) {
    candidates.push(`/usr/lib/oracle/${ver}/client64/lib`);
    candidates.push(`/usr/lib/oracle/${ver}/client/lib`);
  }
  for (const ver of ['21_1', '21_3', '19_3', '19_19', '18_3', '12_2', '11_2']) {
    candidates.push(`/opt/oracle/instantclient_${ver}`);
  }
  candidates.push('/opt/oracle/instantclient', '/usr/local/lib');

  // Windows
  if (os.platform() === 'win32') {
    for (const drive of ['C:', 'D:', 'E:']) {
      for (const ver of ['21_1', '21_3', '19_3', '19_19', '18_3', '12_2', '11_2']) {
        candidates.push(`${drive}\\oracle\\instantclient_${ver}`);
        candidates.push(`${drive}\\instantclient_${ver}`);
      }
      candidates.push(`${drive}\\oracle\\product\\19.0.0\\client_1\\bin`);
      candidates.push(`${drive}\\oracle\\product\\21.0.0\\client_1\\bin`);
      candidates.push(`${drive}\\app\\oracle\\product\\19.0.0.0.0\\client_1\\bin`);
    }
  }

  for (const c of candidates)
    if (existsSync(c)) return c;

  return null;
}
