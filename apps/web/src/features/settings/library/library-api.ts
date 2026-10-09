import { useQuery } from "@tanstack/react-query";
import { graphqlRequest } from "@/shared/api/graphql";

export interface ServerMetadata {
  version: string;
  endpoint: string;
  itemCounts: {
    tags: number;
    performers: number;
    platforms: number;
  };
}

export const SERVER_METADATA_QUERY_KEY = ["serverMetadata"] as const;

const SERVER_METADATA_QUERY = /* GraphQL */ `
  query ServerMetadata {
    serverMetadata {
      version
      endpoint
      itemCounts {
        tags
        performers
        platforms
      }
    }
  }
`;

/** Fetches the connected library's version, endpoint, and item counts. */
export function useServerMetadata() {
  return useQuery({
    queryKey: SERVER_METADATA_QUERY_KEY,
    queryFn: () =>
      graphqlRequest<{ serverMetadata: ServerMetadata }>(
        SERVER_METADATA_QUERY,
      ).then((data) => data.serverMetadata),
  });
}
