export function showDealerInCommercialTable(officialName: string): boolean {
  return !/\bem\s+breve\b/i.test(officialName);
}
