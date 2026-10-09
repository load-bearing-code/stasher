import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { SERVER_METADATA_QUERY_KEY } from "@/features/settings/library/library-api";
import { graphqlRequest } from "@/shared/api/graphql";

const TAGS_QUERY_KEY = ["tags"] as const;

export interface TagPerformer {
  id: string;
  name: string;
}

export interface Tag {
  id: string;
  name: string;
  description: string | null;
  performers: TagPerformer[];
}

export interface TagList {
  tags: Tag[];
  totalCount: number;
}

// The grid shows every tag at once, so fetch a generous page. Real
// pagination can come later if libraries outgrow this.
const TAGS_PAGE_SIZE = 500;

interface TagsQueryResult {
  tags: {
    edges: { node: Tag }[];
    totalCount: number;
  };
}

const TAGS_QUERY = /* GraphQL */ `
  query Tags($first: Int) {
    tags(first: $first) {
      edges {
        node {
          id
          name
          description
          performers {
            id
            name
          }
        }
      }
      totalCount
    }
  }
`;

/** Fetches the library's tags and the total tag count. */
export function useTags() {
  return useQuery({
    queryKey: TAGS_QUERY_KEY,
    queryFn: async (): Promise<TagList> => {
      const data = await graphqlRequest<TagsQueryResult>(TAGS_QUERY, {
        first: TAGS_PAGE_SIZE,
      });
      return {
        tags: data.tags.edges.map((edge) => edge.node),
        totalCount: data.tags.totalCount,
      };
    },
  });
}

const TAG_FIELDS = /* GraphQL */ `
  id
  name
  description
  performers {
    id
    name
  }
`;

export interface CreateTagInput {
  name: string;
  description?: string | null;
  performerIds?: string[];
}

export interface UpdateTagInput {
  id: string;
  name: string;
  description?: string | null;
  performerIds?: string[];
}

const CREATE_TAG_MUTATION = /* GraphQL */ `
  mutation CreateTag($input: CreateTagInput!) {
    createTag(input: $input) {
      ${TAG_FIELDS}
    }
  }
`;

const UPDATE_TAG_MUTATION = /* GraphQL */ `
  mutation UpdateTag($input: UpdateTagInput!) {
    updateTag(input: $input) {
      ${TAG_FIELDS}
    }
  }
`;

const DELETE_TAG_MUTATION = /* GraphQL */ `
  mutation DeleteTag($input: DeleteTagInput!) {
    deleteTag(input: $input)
  }
`;

/** Creates a tag and refreshes the tag list. */
export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTagInput): Promise<Tag> => {
      const data = await graphqlRequest<{ createTag: Tag }>(
        CREATE_TAG_MUTATION,
        { input },
      );
      return data.createTag;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY });
      void queryClient.invalidateQueries({
        queryKey: SERVER_METADATA_QUERY_KEY,
      });
    },
  });
}

/** Updates a tag's name, description, and performers, then refreshes. */
export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTagInput): Promise<Tag> => {
      const data = await graphqlRequest<{ updateTag: Tag }>(
        UPDATE_TAG_MUTATION,
        { input },
      );
      return data.updateTag;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY });
    },
  });
}

/** Deletes a tag by id and refreshes the tag list. */
export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<boolean> => {
      const data = await graphqlRequest<{ deleteTag: boolean }>(
        DELETE_TAG_MUTATION,
        { input: { id } },
      );
      return data.deleteTag;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY });
      void queryClient.invalidateQueries({
        queryKey: SERVER_METADATA_QUERY_KEY,
      });
    },
  });
}
