// A tag shaped for the grid. Post thumbnails, post count, and hidden
// state have no backing fields in the API yet; they are optional so the
// card can render them once the schema grows.
export interface TagCardData {
  id: string;
  name: string;
  hidden?: boolean;
  postCount?: number;
  thumbnails?: string[];
}
