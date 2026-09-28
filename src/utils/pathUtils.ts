/**
 * Returns the last `/`-separated segment of a path, with any query string
 * removed.
 * @param value Path or URL-like string
 * @returns The trailing file name (may be empty)
 */
export function lastPathSegment(value: string): string {
  const file = value.split('/').pop() ?? value;
  return file.split('?')[0];
}
