const RAW_API_BASE = import.meta.env.VITE_API_URL || '';

const API_BASE = RAW_API_BASE.replace(/\/+$/, '');

function buildUrl(path: string) {
  let normalizedPath = path.startsWith('/')
    ? path
    : `/${path}`;

  /*
   * Supports both styles:
   *
   * api('/orders')
   * api('/api/v1/orders')
   *
   * Both will correctly resolve to:
   * /api/v1/orders
   */

  const baseAlreadyHasApiV1 =
    API_BASE.endsWith('/api/v1');

  if (baseAlreadyHasApiV1) {
    if (normalizedPath === '/api/v1') {
      normalizedPath = '';
    } else if (
      normalizedPath.startsWith('/api/v1/')
    ) {
      normalizedPath = normalizedPath.slice(
        '/api/v1'.length,
      );
    }

    return `${API_BASE}${normalizedPath}`;
  }

  if (
    normalizedPath !== '/api/v1' &&
    !normalizedPath.startsWith('/api/v1/')
  ) {
    normalizedPath = `/api/v1${normalizedPath}`;
  }

  return `${API_BASE}${normalizedPath}`;
}

export async function api(
  path: string,
  opts: RequestInit = {},
) {
  const token = localStorage.getItem('token');

  const url = buildUrl(path);

  const headers = new Headers(opts.headers);

  if (
    opts.body &&
    !headers.has('Content-Type')
  ) {
    headers.set(
      'Content-Type',
      'application/json',
    );
  }

  if (token) {
    headers.set(
      'Authorization',
      `Bearer ${token}`,
    );
  }

  let response: Response;

  try {
    response = await fetch(url, {
      ...opts,
      headers,
    });
  } catch (error) {
    console.error(
      'API network error:',
      url,
      error,
    );

    throw new Error(
      'Unable to connect to ServiceOS API.',
    );
  }

  let data: any = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    console.error(
      'API request failed:',
      {
        url,
        status: response.status,
        data,
      },
    );

    if (response.status === 401) {
      throw new Error(
        data?.error?.message ||
          'Your session is invalid or expired. Please sign in again.',
      );
    }

    if (response.status === 403) {
      throw new Error(
        data?.error?.message ||
          'You do not have permission to perform this action.',
      );
    }

    throw new Error(
      data?.error?.message ||
        `Request failed with status ${response.status}`,
    );
  }

  return data;
}