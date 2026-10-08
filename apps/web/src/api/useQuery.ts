import { useCallback, useEffect, useRef, useState } from "react";
import { describeError } from "./client";

/**
 * Minimal async read hook: one loader, an abortable request, an explicit
 * loading/failed/ready state, and a manual reload. `deps` must list everything
 * the loader reads (the loader itself is held in a ref so it cannot restart the
 * request loop).
 */
export type QueryState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "failed"; message: string };

export type Query<T> = {
  state: QueryState<T>;
  reload: () => void;
};

export function useQuery<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): Query<T> {
  const [state, setState] = useState<QueryState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ status: "loading" });
    loadRef.current(controller.signal).then(
      (data) => {
        if (active) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setState({ status: "failed", message: describeError(error) });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { state, reload };
}
