/** Upper bound on registry items read per list: 10 calls of 50. Beyond it the UI says so. */
export const REGISTRY_CAP = 500;
export const REGISTRY_PAGE = 50;

/** The `(offset, limit)` calls needed to read a registry of `total` items, never more than `cap` items. */
export function pageRanges(total: bigint, pageSize: number = REGISTRY_PAGE, cap: number = REGISTRY_CAP) {
  const size = BigInt(pageSize);
  const wanted = total < BigInt(cap) ? total : BigInt(cap);
  const pages: { offset: bigint; limit: bigint }[] = [];
  for (let offset = 0n; offset < wanted; offset += size) pages.push({ offset, limit: size });
  return { pages, truncated: total > BigInt(cap) };
}
