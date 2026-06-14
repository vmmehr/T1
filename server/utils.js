// Pure helpers with no internal dependencies.

export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export const parseBooleanEnv = (value, defaultValue = false) => {
  if (value === undefined) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
};

// Usernames are case-insensitive: store and compare in lowercase.
export const normalizeUsername = (value) => String(value || '').trim().toLowerCase();

export const isSupervisor = (role) => role === 'supervisor';
export const isConsultant = (role) => role === 'consultant';
export const isPsychologist = (role) => role === 'psychologist';
export const isStaff = (role) => isConsultant(role) || isPsychologist(role) || isSupervisor(role);

export const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  full_name: user.full_name,
  role: user.role,
  consultant_id: user.consultant_id,
  psychologist_id: user.psychologist_id,
});

export const parsePositiveInt = (value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
};

export const parsePositiveId = (value) => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
};

export const isUuid = (value) => (
  typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
);

export const parseIsoDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

export const getWindowStartDate = (windowValue) => {
  if (!windowValue || windowValue === 'all') return null;
  if (windowValue === '30d' || windowValue === '90d') {
    const days = windowValue === '30d' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    return startDate.toISOString();
  }
  return null;
};

export const calculateWilsonInterval = (successCount, totalCount, z = 1.96) => {
  if (totalCount <= 0) return null;
  const p = successCount / totalCount;
  const z2 = z * z;
  const denominator = 1 + z2 / totalCount;
  const center = (p + z2 / (2 * totalCount)) / denominator;
  const margin = (z / denominator)
    * Math.sqrt((p * (1 - p) + z2 / (4 * totalCount)) / totalCount);
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
};
