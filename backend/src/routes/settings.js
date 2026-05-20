import { Router } from 'express';
import { getSettings, updateSettings, autoDetectOracleClient } from '../services/settingsService.js';
import { existsSync } from 'fs';

const router = Router();

router.get('/', (req, res) => {
  const settings = getSettings();
  // Detect current mode
  const clientDir = settings.oracleClientDir || process.env.ORACLE_CLIENT_LIB_DIR || '';
  res.json({
    ...settings,
    autoDetected: autoDetectOracleClient(),
    currentMode: clientDir ? 'thick' : 'thin',
    currentClientDir: clientDir,
  });
});

router.put('/', (req, res) => {
  const { oracleClientDir } = req.body;
  // Validate path if provided
  if (oracleClientDir && !existsSync(oracleClientDir)) {
    return res.status(400).json({ error: `경로를 찾을 수 없습니다: ${oracleClientDir}` });
  }
  const updated = updateSettings({ oracleClientDir: oracleClientDir || '' });
  res.json({ ...updated, restartRequired: true });
});

export default router;
