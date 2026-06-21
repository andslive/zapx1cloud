// Mirrors public.normalize_phone_br SQL function.
// Always returns the canonical Brazilian E.164-ish digits: 55 + DDD(2) + 9 + 8 digits = 13 digits
// for mobile numbers. Returns null for inputs with fewer than 8 digits.
export function normalizePhoneBR(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  let d = String(input).replace(/\D/g, '').replace(/^0+/, '');
  if (d.length < 8) return null;

  // Strip leading 55 to inspect the national portion
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    d = d.substring(2);
  }

  // National number: DDD(2) + 8 (missing 9) or 9 digits
  if (d.length === 10) {
    const ddd = d.substring(0, 2);
    const rest = d.substring(2);
    if (/^[6-9]/.test(rest)) {
      d = ddd + '9' + rest;
    }
  }

  if (d.length === 10 || d.length === 11) {
    d = '55' + d;
  }

  return d;
}

// Returns possible BR phone variants (digits only) for matching against stored
// numbers that may or may not include DDI 55 / the extra "9" mobile digit.
export function phoneVariantsBR(input: unknown): string[] {
  const raw = String(input ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (!raw) return [];

  const variants = new Set<string>();
  variants.add(raw);

  const canonical = normalizePhoneBR(raw); // 55 + DDD + 9 + 8 digits = 13
  if (canonical) {
    variants.add(canonical);                       // 5527998385883
    variants.add(canonical.substring(2));          // 27998385883 (sem DDI)

    // Legacy sem o "9" extra de celular
    if (canonical.length === 13) {
      const ddd = canonical.substring(2, 4);
      const rest = canonical.substring(5); // pula o "9"
      variants.add('55' + ddd + rest);             // 552798385883
      variants.add(ddd + rest);                    // 2798385883
    }
  }

  return Array.from(variants).filter(Boolean);
}
