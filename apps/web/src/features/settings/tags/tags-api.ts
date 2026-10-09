import { useQuery } from "@tanstack/react-query";
import { graphqlRequest } from "@/shared/api/graphql";

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
    queryKey: ["tags"],
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
