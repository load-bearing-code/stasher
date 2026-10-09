// The toolbar's segmented control doubles as a sort and a filter:
// "most-used" and "name" sort all visible tags, while "hidden" narrows
// the grid to hidden tags only.
export type TagSortMode = "most-used" | "name" | "hidden";

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
