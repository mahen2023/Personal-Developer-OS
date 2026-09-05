/** "1 issue" / "3 issues". Headlines are read far too often to get this wrong. */
export function plural(count: number, singular: string, many = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : many}`;
}
