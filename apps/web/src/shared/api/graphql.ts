// Minimal GraphQL-over-fetch client. The API serves GraphQL at a single
// POST endpoint and authenticates via an `ApiKey` header (both optional
// in local dev). CORS on the server already permits these headers.

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080/graphql";
const API_KEY = import.meta.env.VITE_API_KEY ?? "";

/** The GraphQL endpoint this client talks to. */
export const apiEndpoint = API_URL;

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

/** Sends a GraphQL query and returns its `data`, throwing on any error. */
export async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { ApiKey: API_KEY } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  if (!json.data) {
    throw new Error("response contained no data");
  }
  return json.data;
}
