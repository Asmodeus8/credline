"use client";

import { useCallback, useEffect, useState } from "react";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new ApiError(data?.detail ?? "Something went wrong", res.status, data?.code);
  }
  return data as T;
}

export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body });

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<ApiError | undefined>();
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path)
      .then((d) => {
        if (live) {
          setData(d);
          setError(undefined);
        }
      })
      .catch((e) => live && setError(e instanceof ApiError ? e : new ApiError(String(e), 0)));
    return () => {
      live = false;
    };
  }, [path, version]);

  return { data, error, loading: !data && !error, reload };
}

export function idempotencyKey() {
  return crypto.randomUUID();
}
