// Reads settings from environment variables (and .env if present). All API keys are optional.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');

export function loadConfig(env = process.env) {
  if (env === process.env && existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const port = Number(env.PORT) || 5173;
  // Render sets RENDER=true. There the app must listen on all interfaces and sits behind Render's proxy,
  // whether the service runs the Dockerfile or plain Node.
  const onRender = clean(env.RENDER) === 'true';
  return Object.freeze({
    root: ROOT,
    port,
    serpapiKey: clean(env.SERPAPI_KEY),
    travelpayoutsToken: clean(env.TRAVELPAYOUTS_TOKEN),
    travelpayoutsMarker: clean(env.TRAVELPAYOUTS_MARKER),
    geoapifyKey: clean(env.GEOAPIFY_KEY),
    viatorKey: clean(env.VIATOR_KEY),
    ryanair: clean(env.RYANAIR).toLowerCase() !== 'off',
    contactEmail: clean(env.CONTACT_EMAIL),
    // Online deployment (see DEPLOY.md). Locally all of these can stay empty.
    host: clean(env.HOST) || (onRender ? '0.0.0.0' : '127.0.0.1'),
    trustProxy: clean(env.TRUST_PROXY) ? clean(env.TRUST_PROXY) === '1' : onRender,
  });
}
