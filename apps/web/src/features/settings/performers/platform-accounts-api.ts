import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { graphqlRequest } from "@/shared/api/graphql";

const PLATFORM_ACCOUNTS_QUERY_KEY = ["platform-accounts"] as const;
const PLATFORMS_QUERY_KEY = ["platforms"] as const;
const PAGE_SIZE = 500;

export interface AccountPlatform {
  id: string;
  name: string;
  iconUri: string | null;
}

export interface PlatformAccountPerformer {
  id: string;
  name: string;
}

export interface PlatformAccount {
  id: string;
  platform: AccountPlatform;
  platformUserId: string | null;
  handle: string;
  bio: string | null;
  studio: { id: string } | null;
  performers: PlatformAccountPerformer[];
}

interface PlatformAccountsQueryResult {
  platformAccounts: {
    edges: { node: PlatformAccount }[];
  };
}

const PLATFORM_ACCOUNT_FIELDS = /* GraphQL */ `
  id
  platform {
    id
    name
    iconUri
  }
  platformUserId
  handle
  bio
  studio {
    id
  }
  performers {
    id
    name
  }
`;

const PLATFORM_ACCOUNTS_QUERY = /* GraphQL */ `
  query PerformerPlatformAccounts($performerId: ID!, $first: Int) {
    platformAccounts(performerId: $performerId, first: $first) {
      edges {
        node {
          ${PLATFORM_ACCOUNT_FIELDS}
        }
      }
    }
  }
`;

const PLATFORM_ACCOUNT_QUERY = /* GraphQL */ `
  query PlatformAccount($platformId: ID!, $handle: String!) {
    platformAccount(platformId: $platformId, handle: $handle) {
      ${PLATFORM_ACCOUNT_FIELDS}
    }
  }
`;

export interface CreatePlatformAccountInput {
  platformId: string;
  platformUserId: string | null;
  handle: string;
  performerIds: string[];
}

export interface UpdatePlatformAccountInput {
  id: string;
  platformId: string;
  platformUserId: string | null;
  handle: string;
  bio: string | null;
  studioId: string | null;
  performerIds: string[];
}

export async function getPlatformAccount(
  platformId: string,
  handle: string,
): Promise<PlatformAccount | null> {
  const data = await graphqlRequest<{ platformAccount: PlatformAccount | null }>(
    PLATFORM_ACCOUNT_QUERY,
    { platformId, handle },
  );
  return data.platformAccount;
}

const CREATE_PLATFORM_ACCOUNT_MUTATION = /* GraphQL */ `
  mutation CreatePlatformAccount($input: CreatePlatformAccountInput!) {
    createPlatformAccount(input: $input) {
      ${PLATFORM_ACCOUNT_FIELDS}
    }
  }
`;

const UPDATE_PLATFORM_ACCOUNT_MUTATION = /* GraphQL */ `
  mutation UpdatePlatformAccount($input: UpdatePlatformAccountInput!) {
    updatePlatformAccount(input: $input) {
      ${PLATFORM_ACCOUNT_FIELDS}
    }
  }
`;

function invalidatePlatformAccounts(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: PLATFORM_ACCOUNTS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: PLATFORMS_QUERY_KEY });
}

export function usePerformerPlatformAccounts(performerId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...PLATFORM_ACCOUNTS_QUERY_KEY, performerId],
    enabled: enabled && performerId !== null,
    queryFn: async (): Promise<PlatformAccount[]> => {
      if (!performerId) return [];
      const data = await graphqlRequest<PlatformAccountsQueryResult>(PLATFORM_ACCOUNTS_QUERY, {
        performerId,
        first: PAGE_SIZE,
      });
      return data.platformAccounts.edges.map((edge) => edge.node);
    },
  });
}

export function useCreatePlatformAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePlatformAccountInput): Promise<PlatformAccount> => {
      const data = await graphqlRequest<{ createPlatformAccount: PlatformAccount }>(
        CREATE_PLATFORM_ACCOUNT_MUTATION,
        { input },
      );
      return data.createPlatformAccount;
    },
    onSuccess: () => invalidatePlatformAccounts(queryClient),
  });
}

export function useUpdatePlatformAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdatePlatformAccountInput): Promise<PlatformAccount> => {
      const data = await graphqlRequest<{ updatePlatformAccount: PlatformAccount }>(
        UPDATE_PLATFORM_ACCOUNT_MUTATION,
        { input },
      );
      return data.updatePlatformAccount;
    },
    onSuccess: () => invalidatePlatformAccounts(queryClient),
  });
}
