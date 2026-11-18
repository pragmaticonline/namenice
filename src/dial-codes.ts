import { COUNTRIES } from "./countries.ts";

/* Country calling codes keyed by ISO alpha-2. Values are digits only
   ("1", "66") to match the stored phone_cc format.
   Sources: Wikipedia's alphabetical list of telephone country codes
   (193 direct + 13 alias matches); NANP members and special territories
   resolved to their administering plan (44 entries). */
export const DIAL_CODES: Record<string, string> = {
  AF:"93", // Afghanistan
  AX:"358", // Åland Islands
  AL:"355", // Albania
  DZ:"213", // Algeria
  AS:"1", // American Samoa
  AD:"376", // Andorra
  AO:"244", // Angola
  AI:"1", // Anguilla
  AQ:"672", // Antarctica
  AG:"1", // Antigua and Barbuda
  AR:"54", // Argentina
  AM:"374", // Armenia
  AW:"297", // Aruba
  AU:"61", // Australia
  AT:"43", // Austria
  AZ:"994", // Azerbaijan
  BS:"1", // Bahamas
  BH:"973", // Bahrain
  BD:"880", // Bangladesh
  BB:"1", // Barbados
  BY:"375", // Belarus
  BE:"32", // Belgium
  BZ:"501", // Belize
  BJ:"229", // Benin
  BM:"1", // Bermuda
  BT:"975", // Bhutan
  BO:"591", // Bolivia
  BQ:"599", // Bonaire, Sint Eustatius and Saba
  BA:"387", // Bosnia and Herzegovina
  BW:"267", // Botswana
  BV:"47", // Bouvet Island
  BR:"55", // Brazil
  IO:"246", // British Indian Ocean Territory
  BN:"673", // Brunei
  BG:"359", // Bulgaria
  BF:"226", // Burkina Faso
  BI:"257", // Burundi
  CV:"238", // Cabo Verde
  KH:"855", // Cambodia
  CM:"237", // Cameroon
  CA:"1", // Canada
  KY:"1", // Cayman Islands
  CF:"236", // Central African Republic
  TD:"235", // Chad
  CL:"56", // Chile
  CN:"86", // China
  CX:"61", // Christmas Island
  CC:"61", // Cocos Islands
  CO:"57", // Colombia
  KM:"269", // Comoros
  CG:"242", // Congo
  CD:"243", // Congo, Democratic Republic of the
  CK:"682", // Cook Islands
  CR:"506", // Costa Rica
  CI:"225", // Côte d'Ivoire
  HR:"385", // Croatia
  CU:"53", // Cuba
  CW:"599", // Curaçao
  CY:"357", // Cyprus
  CZ:"420", // Czechia
  DK:"45", // Denmark
  DJ:"253", // Djibouti
  DM:"1", // Dominica
  DO:"1", // Dominican Republic
  EC:"593", // Ecuador
  EG:"20", // Egypt
  SV:"503", // El Salvador
  GQ:"240", // Equatorial Guinea
  ER:"291", // Eritrea
  EE:"372", // Estonia
  SZ:"268", // Eswatini
  ET:"251", // Ethiopia
  FK:"500", // Falkland Islands
  FO:"298", // Faroe Islands
  FJ:"679", // Fiji
  FI:"358", // Finland
  FR:"33", // France
  GF:"594", // French Guiana
  PF:"689", // French Polynesia
  TF:"262", // French Southern Territories
  GA:"241", // Gabon
  GM:"220", // Gambia
  GE:"995", // Georgia
  DE:"49", // Germany
  GH:"233", // Ghana
  GI:"350", // Gibraltar
  GR:"30", // Greece
  GL:"299", // Greenland
  GD:"1", // Grenada
  GP:"590", // Guadeloupe
  GU:"1", // Guam
  GT:"502", // Guatemala
  GG:"44", // Guernsey
  GN:"224", // Guinea
  GW:"245", // Guinea-Bissau
  GY:"592", // Guyana
  HT:"509", // Haiti
  HM:"672", // Heard Island and McDonald Islands
  VA:"379", // Holy See
  HN:"504", // Honduras
  HK:"852", // Hong Kong
  HU:"36", // Hungary
  IS:"354", // Iceland
  IN:"91", // India
  ID:"62", // Indonesia
  IR:"98", // Iran
  IQ:"964", // Iraq
  IE:"353", // Ireland
  IM:"44", // Isle of Man
  IL:"972", // Israel
  IT:"39", // Italy
  JM:"1", // Jamaica
  JP:"81", // Japan
  JE:"44", // Jersey
  JO:"962", // Jordan
  KZ:"7", // Kazakhstan
  KE:"254", // Kenya
  KI:"686", // Kiribati
  KP:"850", // North Korea
  KR:"82", // South Korea
  KW:"965", // Kuwait
  KG:"996", // Kyrgyzstan
  LA:"856", // Laos
  LV:"371", // Latvia
  LB:"961", // Lebanon
  LS:"266", // Lesotho
  LR:"231", // Liberia
  LY:"218", // Libya
  LI:"423", // Liechtenstein
  LT:"370", // Lithuania
  LU:"352", // Luxembourg
  MO:"853", // Macao
  MG:"261", // Madagascar
  MW:"265", // Malawi
  MY:"60", // Malaysia
  MV:"960", // Maldives
  ML:"223", // Mali
  MT:"356", // Malta
  MH:"692", // Marshall Islands
  MQ:"596", // Martinique
  MR:"222", // Mauritania
  MU:"230", // Mauritius
  YT:"262", // Mayotte
  MX:"52", // Mexico
  FM:"691", // Micronesia
  MD:"373", // Moldova
  MC:"377", // Monaco
  MN:"976", // Mongolia
  ME:"382", // Montenegro
  MS:"1", // Montserrat
  MA:"212", // Morocco
  MZ:"258", // Mozambique
  MM:"95", // Myanmar
  NA:"264", // Namibia
  NR:"674", // Nauru
  NP:"977", // Nepal
  NL:"31", // Netherlands
  NC:"687", // New Caledonia
  NZ:"64", // New Zealand
  NI:"505", // Nicaragua
  NE:"227", // Niger
  NG:"234", // Nigeria
  NU:"683", // Niue
  NF:"672", // Norfolk Island
  MK:"389", // North Macedonia
  MP:"1", // Northern Mariana Islands
  NO:"47", // Norway
  OM:"968", // Oman
  PK:"92", // Pakistan
  PW:"680", // Palau
  PS:"970", // Palestine
  PA:"507", // Panama
  PG:"675", // Papua New Guinea
  PY:"595", // Paraguay
  PE:"51", // Peru
  PH:"63", // Philippines
  PN:"64", // Pitcairn
  PL:"48", // Poland
  PT:"351", // Portugal
  PR:"1", // Puerto Rico
  QA:"974", // Qatar
  RE:"262", // Réunion
  RO:"40", // Romania
  RU:"7", // Russia
  RW:"250", // Rwanda
  BL:"590", // Saint Barthélemy
  SH:"290", // Saint Helena
  KN:"1", // Saint Kitts and Nevis
  LC:"1", // Saint Lucia
  MF:"590", // Saint Martin (French)
  PM:"508", // Saint Pierre and Miquelon
  VC:"1", // Saint Vincent and the Grenadines
  WS:"685", // Samoa
  SM:"378", // San Marino
  ST:"239", // Sao Tome and Principe
  SA:"966", // Saudi Arabia
  SN:"221", // Senegal
  RS:"381", // Serbia
  SC:"248", // Seychelles
  SL:"232", // Sierra Leone
  SG:"65", // Singapore
  SX:"1", // Sint Maarten (Dutch)
  SK:"421", // Slovakia
  SI:"386", // Slovenia
  SB:"677", // Solomon Islands
  SO:"252", // Somalia
  ZA:"27", // South Africa
  GS:"500", // South Georgia
  SS:"211", // South Sudan
  ES:"34", // Spain
  LK:"94", // Sri Lanka
  SD:"249", // Sudan
  SR:"597", // Suriname
  SJ:"47", // Svalbard and Jan Mayen
  SE:"46", // Sweden
  CH:"41", // Switzerland
  SY:"963", // Syria
  TW:"886", // Taiwan
  TJ:"992", // Tajikistan
  TZ:"255", // Tanzania
  TH:"66", // Thailand
  TL:"670", // Timor-Leste
  TG:"228", // Togo
  TK:"690", // Tokelau
  TO:"676", // Tonga
  TT:"1", // Trinidad and Tobago
  TN:"216", // Tunisia
  TR:"90", // Turkey
  TM:"993", // Turkmenistan
  TC:"1", // Turks and Caicos Islands
  TV:"688", // Tuvalu
  UG:"256", // Uganda
  UA:"380", // Ukraine
  AE:"971", // United Arab Emirates
  GB:"44", // United Kingdom
  US:"1", // United States
  UM:"1", // US Minor Outlying Islands
  UY:"598", // Uruguay
  UZ:"998", // Uzbekistan
  VU:"678", // Vanuatu
  VE:"58", // Venezuela
  VN:"84", // Vietnam
  VG:"1", // Virgin Islands, British
  VI:"1", // Virgin Islands, US
  WF:"681", // Wallis and Futuna
  EH:"212", // Western Sahara
  YE:"967", // Yemen
  ZM:"260", // Zambia
  ZW:"263", // Zimbabwe
};

export function dialCodeFor(countryCode: string | null | undefined): string | null {
  const dial = DIAL_CODES[(countryCode || "").toUpperCase()];
  return typeof dial === "string" ? dial : null;
}

/* Short display names for the phone-code dropdown only, so the longest
   options don't stretch the box. The country dropdown keeps full names. */
const PHONE_SHORT_NAMES: Record<string, string> = {
  "Bonaire, Sint Eustatius and Saba": "Caribbean Netherlands",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  "British Indian Ocean Territory": "British Indian Ocean Terr.",
  "Central African Republic": "Central African Rep.",
  "Congo, Democratic Republic of the": "DR Congo",
  "Dominican Republic": "Dominican Rep.",
  "French Southern Territories": "French Southern Terr.",
  "Heard Island and McDonald Islands": "Heard Island",
  "Northern Mariana Islands": "N. Mariana Islands",
  "Saint Kitts and Nevis": "St. Kitts and Nevis",
  "Saint Vincent and the Grenadines": "St. Vincent & Grenadines",
  "Sao Tome and Principe": "São Tomé & Príncipe",
  "South Georgia and the South Sandwich Islands": "South Georgia",
  "Turks and Caicos Islands": "Turks & Caicos Islands",
  "US Minor Outlying Islands": "US Outlying Islands",
  "Virgin Islands, British": "British Virgin Islands",
  "Virgin Islands, US": "US Virgin Islands",
};

export function phoneDisplayName(name: string): string {
  return PHONE_SHORT_NAMES[name] || name;
}

function escapeOption(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* "Thailand (+66)" options in COUNTRIES order. Selection prefers the entry
   matching both country and dial code (so shared codes like +1 show the
   right country), then any entry with the dial code, then the country. */
export function phoneCcOptions(preferCountry: string | null | undefined, preferDial: string | null | undefined): string {
  const country = (preferCountry || "").toUpperCase();
  const dial = (preferDial || "").replace(/\D/g, "");
  let selected = "US";
  if (country && dial && DIAL_CODES[country] === dial) selected = country;
  else if (dial) {
    const byDial = COUNTRIES.find((entry) => DIAL_CODES[entry.code] === dial);
    if (byDial) selected = byDial.code;
  } else if (DIAL_CODES[country]) selected = country;
  return COUNTRIES.map(({ code, name }) => {
    const codeDial = DIAL_CODES[code] || "";
    return `<option value="${codeDial}" data-country="${code}"${code === selected ? " selected" : ""}>${escapeOption(phoneDisplayName(name))} (+${codeDial})</option>`;
  }).join("");
}
