import { useEffect, useState } from "react";

export default function useCsvData(loader, deps = []) {
  const [state, setState] = useState({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    setState((prev) => ({
      data: prev.data,
      error: null,
      loading: true,
    }));

    (async () => {
      try {
        const data = await loader();
        if (!cancelled) {
          setState({ data, error: null, loading: false });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ data: null, error, loading: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, deps);

  return state;
}
