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

export interface GraphQLUpload {
  path: string;
  file: File;
}

/** Sends a GraphQL query and returns its `data`, throwing on any error. */
export async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
  uploads: GraphQLUpload[] = [],
): Promise<T> {
  const headers: Record<string, string> = {
    ...(API_KEY ? { ApiKey: API_KEY } : {}),
  };
  let body: BodyInit;

  if (uploads.length > 0) {
    const form = new FormData();
    form.append("operations", JSON.stringify({ query, variables }));
    form.append(
      "map",
      JSON.stringify(
        Object.fromEntries(uploads.map((upload, index) => [String(index), [upload.path]])),
      ),
    );
    for (const [index, upload] of uploads.entries()) {
      form.append(String(index), upload.file, upload.file.name);
    }
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ query, variables });
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers,
    body,
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

/** Resolves a relative API asset URI against the configured GraphQL endpoint. */
export function apiAssetURL(uri: string): string {
  return new URL(uri, new URL(API_URL, window.location.origin)).toString();
}
