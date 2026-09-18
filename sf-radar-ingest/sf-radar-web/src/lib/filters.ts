/** The non-date filters behind the "Filters" dropdown. */
export interface Filters {
  freeOnly: boolean;
  openOnly: boolean;
  savedOnly: boolean;
  /** Empty = every category. */
  categories: string[];
}

export const NO_FILTERS: Filters = { freeOnly: false, openOnly: false, savedOnly: false, categories: [] };

export function activeFilterCount(f: Filters): number {
  return Number(f.freeOnly) + Number(f.openOnly) + Number(f.savedOnly) + f.categories.length;
}
