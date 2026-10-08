import { useCallback, useEffect, useState } from "react";
import { type ConnectionStatus, fetchStatus } from "./api";

export function useStashConnection() {
  const [connection, setConnection] = useState<ConnectionStatus>("checking");
  const [stashUrl, setStashUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setConnection("checking");
    const status = await fetchStatus();
    setConnection(status.connection);
    setStashUrl(status.stashUrl);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { connection, stashUrl, refresh };
}
