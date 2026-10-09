import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { graphqlRequest } from "@/shared/api/graphql";

const PLATFORMS_QUERY_KEY = ["platforms"] as const;

export interface Platform {
  id: string;
  name: string;
}

export interface PlatformSummary extends Platform {
  performerCount: number;
}

export interface PlatformList {
  platforms: PlatformSummary[];
  totalCount: number;
}

// The grid shows every platform at once, so fetch a generous page. Real
// pagination can come later if the platform list outgrows this.
const PLATFORMS_PAGE_SIZE = 500;

interface PlatformsQueryResult {
  platforms: {
    edges: { node: Platform }[];
    totalCount: number;
  };
  platformAccounts: {
    edges: { node: { platform: { id: string }; performers: { id: string }[] } }[];
  };
}

const PLATFORMS_QUERY = /* GraphQL */ `
  query Platforms($first: Int) {
    platforms(first: $first) {
      edges {
        node {
          id
          name
        }
      }
      totalCount
    }
    platformAccounts(first: $first) {
      edges {
        node {
          platform {
            id
          }
          performers {
            id
          }
        }
      }
    }
  }
`;

/** Fetches the library's platforms, each with its distinct performer count. */
export function usePlatforms() {
  return useQuery({
    queryKey: PLATFORMS_QUERY_KEY,
    queryFn: async (): Promise<PlatformList> => {
      const data = await graphqlRequest<PlatformsQueryResult>(
        PLATFORMS_QUERY,
        { first: PLATFORMS_PAGE_SIZE },
      );

      const performerIdsByPlatform = new Map<string, Set<string>>();
      for (const { node } of data.platformAccounts.edges) {
        const set = performerIdsByPlatform.get(node.platform.id) ?? new Set();
        for (const performer of node.performers) set.add(performer.id);
        performerIdsByPlatform.set(node.platform.id, set);
      }

      return {
        platforms: data.platforms.edges.map(({ node }) => ({
          ...node,
          performerCount: performerIdsByPlatform.get(node.id)?.size ?? 0,
        })),
        totalCount: data.platforms.totalCount,
      };
    },
  });
}

const PLATFORM_FIELDS = /* GraphQL */ `
  id
  name
`;

export interface CreatePlatformInput {
  id: string;
  name: string;
}

export interface UpdatePlatformInput {
  id: string;
  name: string;
}

const CREATE_PLATFORM_MUTATION = /* GraphQL */ `
  mutation CreatePlatform($input: CreatePlatformInput!) {
    createPlatform(input: $input) {
      ${PLATFORM_FIELDS}
    }
  }
`;

const UPDATE_PLATFORM_MUTATION = /* GraphQL */ `
  mutation UpdatePlatform($input: UpdatePlatformInput!) {
    updatePlatform(input: $input) {
      ${PLATFORM_FIELDS}
    }
  }
`;

const DELETE_PLATFORM_MUTATION = /* GraphQL */ `
  mutation DeletePlatform($input: DeletePlatformInput!) {
    deletePlatform(input: $input)
  }
`;

/** Creates a platform and refreshes the platform list. */
export function useCreatePlatform() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePlatformInput): Promise<Platform> => {
      const data = await graphqlRequest<{ createPlatform: Platform }>(
        CREATE_PLATFORM_MUTATION,
        { input },
      );
      return data.createPlatform;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORMS_QUERY_KEY });
    },
  });
}

/** Updates a platform's name, then refreshes. */
export function useUpdatePlatform() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdatePlatformInput): Promise<Platform> => {
      const data = await graphqlRequest<{ updatePlatform: Platform }>(
        UPDATE_PLATFORM_MUTATION,
        { input },
      );
      return data.updatePlatform;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORMS_QUERY_KEY });
    },
  });
}

/** Deletes a platform by id and refreshes the platform list. */
export function useDeletePlatform() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<boolean> => {
      const data = await graphqlRequest<{ deletePlatform: boolean }>(
        DELETE_PLATFORM_MUTATION,
        { input: { id } },
      );
      return data.deletePlatform;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORMS_QUERY_KEY });
    },
  });
}
