export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.message || "This request could not be completed. Please try again.",
      response.status,
      error.code,
    );
  }
  return response.json();
}
export const post = <T = any>(url: string, data: unknown) =>
  api<T>(url, { method: "POST", body: JSON.stringify(data) });
