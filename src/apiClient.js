const API_BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'decision_app_token';

const buildUrl = (path) => `${API_BASE}${path}`;

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
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.error || 'Request failed');
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
    list: (userId) => request(`/api/decisions${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`),
    create: (data) => request('/api/decisions', { method: 'POST', body: data }),
    update: (id, updates) => request(`/api/decisions/${id}`, { method: 'PATCH', body: updates }),
    delete: (id) => request(`/api/decisions/${id}`, { method: 'DELETE' }),
    details: (id) => request(`/api/decisions/${id}/details`),
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
