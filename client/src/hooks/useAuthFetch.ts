import { useCallback } from "react";

export function useAuthFetch(token: string) {
  return useCallback(
    (url: string, opts?: RequestInit) =>
      fetch(url, {
        ...opts,
        headers: {
          ...opts?.headers,
          Authorization: `Bearer ${token}`,
        },
      }),
    [token]
  );
}
