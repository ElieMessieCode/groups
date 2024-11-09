import type { ProblemDetails } from '../types/index.js';

export class ApiError extends Error {
  public readonly status: number;
  public readonly title: string;
  public readonly detail: string;
  public readonly invalidParams?: Array<{ name: string; reason: string }>;
  public readonly conflictingConstraint?: unknown;

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title || 'Une erreur est survenue');
    this.name = 'ApiError';
    this.status = problem.status;
    this.title = problem.title;
    this.detail = problem.detail;
    this.invalidParams = problem.invalidParams;
    this.conflictingConstraint = problem.conflictingConstraint;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('x-session-token')) {
    headers.set('x-session-token', token);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'include'
  });

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json') || contentType.includes('application/problem+json');

  if (!response.ok) {
    if (isJson) {
      const errorData = (await response.json()) as ProblemDetails;
      throw new ApiError(errorData);
    }
    const text = await response.text();
    throw new ApiError({
      status: response.status,
      title: response.statusText || 'Erreur HTTP',
      detail: text || `Erreur serveur (${response.status})`,
      type: `https://httpstatuses.com/${response.status}`
    });
  }

  if (isJson) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' })
};
