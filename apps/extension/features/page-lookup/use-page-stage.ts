import { useCallback, useEffect, useState } from "react";
import { fetchStage } from "./api";
import type { Stage } from "./types";

export function usePageStage() {
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void fetchStage(false).then(setStage);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setStage(await fetchStage(true));
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { stage, setStage, refreshing, refresh };
}
