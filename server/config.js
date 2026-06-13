import 'dotenv/config';

import { parseBooleanEnv } from './utils.js';

export const port = Number(process.env.PORT || 4000);

export const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}

if (['local-dev-secret', 'change-this-local-secret'].includes(jwtSecret)) {
  throw new Error('JWT_SECRET must be a strong non-default value');
}

// Restrict cross-origin access to known frontends. The production frontend is
// served same-origin (nginx proxies /api), so this never blocks the real app;
// it only stops other browser origins from scripting the API. Configure extra
// origins via CORS_ORIGIN (comma-separated).
export const allowedOrigins = (process.env.CORS_ORIGIN || 'https://tyek.ir')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const allowPublicSignup = parseBooleanEnv(process.env.ALLOW_PUBLIC_SIGNUP, true);

export const VALID_DECISION_STATUS = new Set(['pending', 'success', 'fail']);
export const FINAL_DECISION_STATUSES = new Set(['success', 'fail']);
export const COMMENT_VISIBILITY_VALUES = new Set(['public', 'staff_private', 'psychologist_private']);
export const COMMENT_STEP_SCOPES = new Set(['definition', 'analysis', 'strategy']);
