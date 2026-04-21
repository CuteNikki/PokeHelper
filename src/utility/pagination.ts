export function parseSortOrder(sortOrder: unknown): 'asc' | 'desc' {
  if (typeof sortOrder === 'string' && ['asc', 'desc'].includes(sortOrder)) {
    return sortOrder as 'asc' | 'desc';
  }
  return 'desc';
}
