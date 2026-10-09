/** Returns `singular` when `count` is 1, `plural` (or `singular + "s"`) otherwise. */
export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}
