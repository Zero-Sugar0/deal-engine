// ISO 3166-1 countries and territories; labels come from the browser's CLDR data.
const countryCodes =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  );
// All ISO 639-1 languages. Language names deliberately do not imply a country.
const languageCodes =
  'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'.split(
    ' ',
  );
const regions = new Intl.DisplayNames(['en'], { type: 'region' });
const languages = new Intl.DisplayNames(['en'], { type: 'language' });

export const countryOptions = countryCodes
  .map((code) => {
    const name = regions.of(code) ?? code;
    const flag = String.fromCodePoint(
      ...[...code].map((letter) => 127397 + letter.charCodeAt(0)),
    );
    return { value: name, label: `${flag} ${name}` };
  })
  .sort((a, b) => a.value.localeCompare(b.value));

export const languageOptions = languageCodes
  .map((code) => {
    const name = languages.of(code) ?? code;
    let native = name;
    try {
      native =
        new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? name;
    } catch {
      /* Use the English name if a locale is unavailable. */
    }
    return {
      value: name,
      label: native === name ? name : `${name} · ${native}`,
    };
  })
  .sort((a, b) => a.value.localeCompare(b.value));
