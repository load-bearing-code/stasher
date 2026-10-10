import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SERVER_METADATA_QUERY_KEY } from "@/features/settings/library/library-api";
import { graphqlRequest } from "@/shared/api/graphql";

const PERFORMERS_QUERY_KEY = ["performers"] as const;
const PERFORMERS_PAGE_SIZE = 500;

export interface Performer {
  id: string;
  name: string;
  disambiguation: string | null;
  aliases: string[];
}

export interface PerformerList {
  performers: Performer[];
  totalCount: number;
}

interface PerformersQueryResult {
  performers: {
    edges: { node: Performer }[];
    totalCount: number;
  };
}

const PERFORMER_FIELDS = /* GraphQL */ `
  id
  name
  disambiguation
  aliases
`;

const PERFORMERS_QUERY = /* GraphQL */ `
  query Performers($first: Int) {
    performers(first: $first) {
      edges {
        node {
          ${PERFORMER_FIELDS}
        }
      }
      totalCount
    }
  }
`;

export interface CreatePerformerInput {
  name: string;
  disambiguation?: string | null;
  aliases?: string[];
}

export interface UpdatePerformerInput extends CreatePerformerInput {
  id: string;
}

const CREATE_PERFORMER_MUTATION = /* GraphQL */ `
  mutation CreatePerformer($input: CreatePerformerInput!) {
    createPerformer(input: $input) {
      ${PERFORMER_FIELDS}
    }
  }
`;

const UPDATE_PERFORMER_MUTATION = /* GraphQL */ `
  mutation UpdatePerformer($input: UpdatePerformerInput!) {
    updatePerformer(input: $input) {
      ${PERFORMER_FIELDS}
    }
  }
`;

const DELETE_PERFORMER_MUTATION = /* GraphQL */ `
  mutation DeletePerformer($input: DeletePerformerInput!) {
    deletePerformer(input: $input)
  }
`;

export function usePerformers() {
  return useQuery({
    queryKey: PERFORMERS_QUERY_KEY,
    queryFn: async (): Promise<PerformerList> => {
      const data = await graphqlRequest<PerformersQueryResult>(PERFORMERS_QUERY, {
        first: PERFORMERS_PAGE_SIZE,
      });
      return {
        performers: data.performers.edges.map((edge) => edge.node),
        totalCount: data.performers.totalCount,
      };
    },
  });
}

export function useCreatePerformer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePerformerInput): Promise<Performer> => {
      const data = await graphqlRequest<{ createPerformer: Performer }>(CREATE_PERFORMER_MUTATION, {
        input,
      });
      return data.createPerformer;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PERFORMERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: SERVER_METADATA_QUERY_KEY });
    },
  });
}

export function useUpdatePerformer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdatePerformerInput): Promise<Performer> => {
      const data = await graphqlRequest<{ updatePerformer: Performer }>(UPDATE_PERFORMER_MUTATION, {
        input,
      });
      return data.updatePerformer;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PERFORMERS_QUERY_KEY });
    },
  });
}

export function useDeletePerformer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<boolean> => {
      const data = await graphqlRequest<{ deletePerformer: boolean }>(DELETE_PERFORMER_MUTATION, {
        input: { id },
      });
      return data.deletePerformer;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PERFORMERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: SERVER_METADATA_QUERY_KEY });
    },
  });
}
