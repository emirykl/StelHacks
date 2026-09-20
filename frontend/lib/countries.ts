/**
 * The countries, as codes.
 *
 * ISO 3166-1 alpha-2 and nothing else, because the name of a country is a
 * display decision and this is data. A profile that stored "Turkey" could not
 * be shown as "Türkiye" to somebody reading in Turkish, and two people picking
 * the same place from the same list would be stored differently the day the
 * list's spelling changed.
 *
 * The names come from `Intl.DisplayNames`, which every runtime this product
 * targets already ships. Shipping a table of two hundred and fifty names would
 * be shipping a worse copy of one the platform has, in one language.
 */

/* Kept as one string rather than an array literal so the list reads as data
   rather than as two hundred and fifty lines of source. */
const CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO " +
  "FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE " +
  "JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO " +
  "MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW " +
  "PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM " +
  "TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW";

export const COUNTRY_CODES: string[] = CODES.split(" ");

const KNOWN = new Set(COUNTRY_CODES);

export function isCountry(code: string): boolean {
  return KNOWN.has(code);
}

/**
 * The country's name, or the code when the runtime has no name for it.
 *
 * Falling back to the code rather than to nothing: a profile that says "TR" is
 * still telling a reader something, and one that silently drops the field is
 * not.
 */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Every country, named and in the order a person would look through them. */
export function countriesByName(): { code: string; name: string }[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  );
}

/** Where somebody is, in the one line a profile shows. */
export function placeOf(country: string | null, city: string | null): string | null {
  const parts = [city, country === null ? null : countryName(country)].filter(
    (one): one is string => one !== null && one.length > 0,
  );

  return parts.length === 0 ? null : parts.join(", ");
}
