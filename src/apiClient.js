const API_BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'decision_app_token';

const buildUrl = (path) => `${API_BASE}${path}`;
const buildQueryString = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
};

export const tokenStorage = {
  get() {
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

const request = async (path, { method = 'GET', body, auth = true } = {}) => {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (auth) {
    const token = tokenStorage.get();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(buildUrl(path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }

  return payload;
};

export const api = {
  auth: {
    signup: (data) => request('/api/auth/signup', { method: 'POST', body: data, auth: false }),
    login: (username, password) =>
      request('/api/auth/login', { method: 'POST', body: { username, password }, auth: false }),
    me: () => request('/api/auth/me'),
  },
  profiles: {
    getAllConsultants: () => request('/api/profiles/consultants', { auth: false }),
    getClientsForConsultant: (consultantId) => request(`/api/profiles/${consultantId}/clients`),
    assignClientToConsultant: (clientId, consultantId) =>
      request(`/api/profiles/${clientId}/consultant`, { method: 'PATCH', body: { consultantId } }),
    getAllUsers: () => request('/api/profiles/users'),
  },
  decisions: {
    list: (userId) => request(`/api/decisions${buildQueryString({ userId })}`),
    create: (data) => request('/api/decisions', { method: 'POST', body: data }),
    update: (id, updates) => request(`/api/decisions/${id}`, { method: 'PATCH', body: updates }),
    delete: (id) => request(`/api/decisions/${id}`, { method: 'DELETE' }),
    details: (id) => request(`/api/decisions/${id}/details`),
    archive: (params = {}) => request(`/api/decisions/archive${buildQueryString(params)}`),
    stats: (params = {}) => request(`/api/decisions/stats${buildQueryString(params)}`),
  },
  decisionItems: {
    create: (data) => request('/api/decision-items', { method: 'POST', body: data }),
    update: (id, updates) => request(`/api/decision-items/${id}`, { method: 'PATCH', body: updates }),
    delete: (id) => request(`/api/decision-items/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    create: (data) => request('/api/tasks', { method: 'POST', body: data }),
    update: (id, updates) => request(`/api/tasks/${id}`, { method: 'PATCH', body: updates }),
    delete: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
  },
  comments: {
    create: (data) => request('/api/comments', { method: 'POST', body: data }),
  },
};
