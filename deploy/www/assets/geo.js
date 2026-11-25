/* ============================================================
   LUMIÈRE · 全球化地理映射（全球版）
   国家码 → 语言 / 货币 / 支付方式 / 旗帜
   110+ 货币 · 150+ 国家 · 41 语言
   数据表驱动，汇率以 CNY 为基准（2026 参考值，可接实时汇率 API 替换）
   ============================================================ */

/* 货币数据表：CODE ~ 符号 ~ 名称 ~ 1CNY兑换 ~ 小数位 */
const CURRENCY_DATA = `
CNY~¥~人民币~1~0
USD~$~US Dollar~0.139~2
EUR~€~Euro~0.128~2
GBP~£~British Pound~0.109~2
JPY~¥~Japanese Yen~21.5~0
KRW~₩~Korean Won~193~0
AED~AED~UAE Dirham~0.510~2
SAR~SAR~Saudi Riyal~0.521~2
QAR~QAR~Qatari Riyal~0.507~2
KWD~KWD~Kuwaiti Dinar~0.043~3
BHD~BHD~Bahraini Dinar~0.053~3
OMR~OMR~Omani Rial~0.054~3
JOD~JOD~Jordanian Dinar~0.099~3
TND~DT~Tunisian Dinar~0.423~3
EGP~E£~Egyptian Pound~6.70~2
MAD~DH~Moroccan Dirham~1.35~2
DZD~DA~Algerian Dinar~19.0~2
LYD~LYD~Libyan Dinar~0.675~2
LBP~LBP~Lebanese Pound~15000~0
SYP~SYP~Syrian Pound~1750~0
YER~YER~Yemeni Rial~35.5~2
IQD~IQD~Iraqi Dinar~183~0
IRR~IRR~Iranian Rial~5900~0
ILS~₪~Israeli Shekel~0.510~2
TRY~₺~Turkish Lira~4.05~2
RUB~₽~Russian Ruble~13.5~2
CHF~CHF~Swiss Franc~0.124~2
SEK~kr~Swedish Krona~1.42~2
NOK~kr~Norwegian Krone~1.48~2
DKK~kr~Danish Krone~0.95~2
UAH~₴~Ukrainian Hryvnia~5.90~2
BYN~BYN~Belarusian Ruble~0.45~2
MDL~MDL~Moldovan Leu~2.30~2
PLN~zł~Polish Zloty~0.55~2
CZK~Kč~Czech Koruna~3.15~2
HUF~Ft~Hungarian Forint~49~0
RON~lei~Romanian Leu~0.64~2
BGN~лв~Bulgarian Lev~0.250~2
RSD~din~Serbian Dinar~14.8~2
BAM~KM~Bosnian Mark~0.250~2
MKD~ден~Macedonian Denar~7.90~2
ALL~L~Albanian Lek~13.9~2
KZT~₸~Kazakhstan Tenge~63~0
UZS~UZS~Uzbekistan Som~1680~0
TMT~TMT~Turkmen Manat~0.49~2
TJS~TJS~Tajik Somoni~1.50~2
KGS~KGS~Kyrgyz Som~12.4~2
GEL~₾~Georgian Lari~0.38~2
AMD~AMD~Armenian Dram~55~0
AZN~₼~Azerbaijan Manat~0.24~2
MNT~₮~Mongolian Tögrög~490~0
INR~₹~Indian Rupee~11.7~0
PKR~₨~Pakistani Rupee~39~0
BDT~৳~Bangladeshi Taka~17~2
NPR~Rs~Nepalese Rupee~19~2
LKR~Rs~Sri Lankan Rupee~43~0
MVR~MVR~Maldivian Rufiyaa~2.30~2
AFN~؋~Afghan Afghani~9.50~0
ISK~kr~Icelandic Krona~19.5~0
HKD~HK$~Hong Kong Dollar~1.08~2
MOP~MOP$~Macanese Pataca~1.11~2
TWD~NT$~New Taiwan Dollar~4.48~0
SGD~S$~Singapore Dollar~0.180~2
MYR~RM~Malaysian Ringgit~0.62~2
THB~฿~Thai Baht~4.85~2
VND~₫~Vietnamese Dong~3540~0
IDR~Rp~Indonesian Rupiah~2210~0
PHP~₱~Philippine Peso~8.10~2
KHR~៛~Cambodian Riel~570~0
LAK~₭~Lao Kip~3000~0
MMK~K~Myanmar Kyat~3000~0
BND~B$~Brunei Dollar~0.180~2
AUD~A$~Australian Dollar~0.210~2
NZD~NZ$~New Zealand Dollar~0.230~2
FJD~FJ$~Fijian Dollar~0.330~2
PGK~K~Papua New Guinea Kina~0.55~2
CAD~C$~Canadian Dollar~0.19~2
MXN~Mex$~Mexican Peso~2.43~2
BRL~R$~Brazilian Real~0.71~2
ARS~AR$~Argentine Peso~900~0
CLP~CL$~Chilean Peso~135~0
COP~COL$~Colombian Peso~570~0
PEN~S/~Peruvian Sol~0.52~2
UYU~$U~Uruguayan Peso~5.7~2
PYG~₲~Paraguayan Guarani~1100~0
BOB~Bs~Bolivian Boliviano~0.97~2
VES~Bs~Venezuelan Bolivar~130~2
GYD~GY$~Guyanese Dollar~29~2
SRD~SRD~Surinamese Dollar~5.4~2
CRC~₡~Costa Rican Colon~72~2
PAB~B/.~Panamanian Balboa~0.139~2
GTQ~Q~Guatemalan Quetzal~1.08~2
HNL~L~Honduran Lempira~3.45~2
NIO~C$~Nicaraguan Cordoba~5.10~2
DOP~RD$~Dominican Peso~8.50~2
CUP~CUP~Cuban Peso~3.36~2
JMD~J$~Jamaican Dollar~21~2
TTD~TT$~Trinidad Dollar~1.90~2
HTG~G~Haitian Gourde~18~2
NGN~₦~Nigerian Naira~210~2
GHS~GH₵~Ghanaian Cedi~15~2
KES~KSh~Kenyan Shilling~18~2
TZS~TSh~Tanzanian Shilling~370~0
UGX~USh~Ugandan Shilling~510~0
ETB~Br~Ethiopian Birr~15~2
ZAR~R~South African Rand~2.55~2
XOF~CFA~West African CFA Franc~82~0
XAF~CFA~Central African CFA Franc~82~0
CDF~FC~Congolese Franc~390~2
RWF~FRw~Rwandan Franc~180~0
ZMW~ZK~Zambian Kwacha~3.9~2
ZWL~Z$~Zimbabwean Dollar~0.03~2
MUR~MUR~Mauritian Rupee~6.1~2
MGA~Ar~Malagasy Ariary~650~0
BWP~P~Botswana Pula~1.85~2
NAD~N$~Namibian Dollar~2.55~2
MZN~MT~Mozambican Metical~9.2~2
AOA~Kz~Angolan Kwanza~125~2
MRU~MRU~Mauritanian Ouguiya~5.6~2
SDG~SDG~Sudanese Pound~85~2
SOS~S~Somali Shilling~81~2
XCD~$~Eastern Caribbean dollar~0.13~2
AAD~$~Antarctican dollar~0.13~2
AWG~ƒ~Aruban florin~0.13~2
BBD~Bds$~Barbadian dollar~0.13~2
BZD~$~Belize dollar~0.13~2
BMD~$~Bermudian dollar~0.13~2
BTN~Nu.~Bhutanese ngultrum~0.13~2
BIF~FBu~Burundian franc~0.13~2
CVE~$~Cape Verdean escudo~0.13~2
KYD~$~Cayman Islands dollar~0.13~2
KMF~CF~Comorian franc~0.13~2
XCG~Cg~Caribbean guilder~0.13~2
DJF~Fdj~Djiboutian franc~0.13~2
ERN~Nfk~Eritrean nakfa~0.13~2
SZL~E~Lilangeni~0.13~2
FKP~£~Falkland Islands pound~0.13~2
XPF~₣~CFP franc~0.13~2
GIP~£~Gibraltar pound~0.13~2
GNF~FG~Guinean franc~0.13~2
LSL~L~Lesotho loti~0.13~2
LRD~$~Liberian dollar~0.13~2
MWK~MK~Malawian kwacha~0.13~2
KPW~₩~North Korean Won~0.13~2
SHP~£~Saint Helena pound~0.13~2
WST~SAT~Samoan tālā~0.13~2
STN~Db~Dobra~0.13~2
SCR~SRe~Seychellois rupee~0.13~2
SLE~Le~Sierra Leonean leone~0.13~2
SBD~Si$~Solomon Islands dollar~0.13~2
SSP~£~South Sudanese pound~0.13~2
BSD~B$~Bahamian dollar~0.13~2
GMD~D~Gambian dalasi~0.13~2
TOP~$~Tongan paʻanga~0.13~2
VUV~VT~Vanuatu vatu~0.13~2
ZWG~ZiG~Zimbabwe Gold~0.13~2
`;

const CURRENCIES = {};
CURRENCY_DATA.trim().split('\n').forEach(line => {
  const [code, symbol, name, rate, dec] = line.split('~');
  if (!CURRENCIES[code]) CURRENCIES[code] = { symbol, name, rate: parseFloat(rate), dec: parseInt(dec, 10) };
});

/* 国家数据表：CODE | 中文 | English | 旗帜 | 语言 | 货币 | COD(1/0) */
const COUNTRY_DATA = `
CN|中国|China|🇨🇳|zh|CNY|0
HK|中国香港|Hong Kong, China|🇭🇰|zh-Hant|HKD|0
MO|中国澳门|Macao, China|🇲🇴|zh-Hant|MOP|0
TW|中国台湾|Taiwan, China|🇹🇼|zh-Hant|TWD|0
JP|日本|Japan|🇯🇵|ja|JPY|0
KR|韩国|South Korea|🇰🇷|ko|KRW|0
SG|新加坡|Singapore|🇸🇬|en|SGD|0
MY|马来西亚|Malaysia|🇲🇾|ms|MYR|1
TH|泰国|Thailand|🇹🇭|th|THB|1
VN|越南|Vietnam|🇻🇳|vi|VND|1
ID|印度尼西亚|Indonesia|🇮🇩|id|IDR|1
PH|菲律宾|Philippines|🇵🇭|tl|PHP|1
KH|柬埔寨|Cambodia|🇰🇭|km|KHR|1
LA|老挝|Laos|🇱🇦|lo|LAK|1
MM|缅甸|Myanmar|🇲🇲|my|MMK|1
BN|文莱|Brunei|🇧🇳|ms|BND|1
IN|印度|India|🇮🇳|hi|INR|1
PK|巴基斯坦|Pakistan|🇵🇰|ur|PKR|1
BD|孟加拉国|Bangladesh|🇧🇩|bn|BDT|1
NP|尼泊尔|Nepal|🇳🇵|hi|NPR|1
LK|斯里兰卡|Sri Lanka|🇱🇰|ta|LKR|1
MV|马尔代夫|Maldives|🇲🇻|en|MVR|1
AF|阿富汗|Afghanistan|🇦🇫|fa|AFN|1
IR|伊朗|Iran|🇮🇷|fa|IRR|1
IQ|伊拉克|Iraq|🇮🇶|ar|IQD|1
SA|沙特阿拉伯|Saudi Arabia|🇸🇦|ar|SAR|1
AE|阿联酋|United Arab Emirates|🇦🇪|ar|AED|1
QA|卡塔尔|Qatar|🇶🇦|ar|QAR|1
KW|科威特|Kuwait|🇰🇼|ar|KWD|1
BH|巴林|Bahrain|🇧🇭|ar|BHD|1
OM|阿曼|Oman|🇴🇲|ar|OMR|1
YE|也门|Yemen|🇾🇪|ar|YER|1
JO|约旦|Jordan|🇯🇴|ar|JOD|1
LB|黎巴嫩|Lebanon|🇱🇧|ar|LBP|1
SY|叙利亚|Syria|🇸🇾|ar|SYP|1
IL|以色列|Israel|🇮🇱|he|ILS|0
PS|巴勒斯坦|Palestine|🇵🇸|ar|ILS|1
TR|土耳其|Türkiye|🇹🇷|tr|TRY|1
CY|塞浦路斯|Cyprus|🇨🇾|el|EUR|0
GE|格鲁吉亚|Georgia|🇬🇪|ru|GEL|1
AM|亚美尼亚|Armenia|🇦🇲|ru|AMD|1
AZ|阿塞拜疆|Azerbaijan|🇦🇿|kk|AZN|1
KZ|哈萨克斯坦|Kazakhstan|🇰🇿|kk|KZT|1
UZ|乌兹别克斯坦|Uzbekistan|🇺🇿|ru|UZS|1
TM|土库曼斯坦|Turkmenistan|🇹🇲|ru|TMT|1
TJ|塔吉克斯坦|Tajikistan|🇹🇯|ru|TJS|1
KG|吉尔吉斯斯坦|Kyrgyzstan|🇰🇬|ru|KGS|1
MN|蒙古|Mongolia|🇲🇳|ru|MNT|1
GB|英国|United Kingdom|🇬🇧|en|GBP|0
IE|爱尔兰|Ireland|🇮🇪|en|EUR|0
DE|德国|Germany|🇩🇪|de|EUR|0
AT|奥地利|Austria|🇦🇹|de|EUR|0
CH|瑞士|Switzerland|🇨🇭|de|CHF|0
LI|列支敦士登|Liechtenstein|🇱🇮|de|CHF|0
FR|法国|France|🇫🇷|fr|EUR|0
BE|比利时|Belgium|🇧🇪|fr|EUR|0
LU|卢森堡|Luxembourg|🇱🇺|fr|EUR|0
MC|摩纳哥|Monaco|🇲🇨|fr|EUR|0
ES|西班牙|Spain|🇪🇸|es|EUR|0
PT|葡萄牙|Portugal|🇵🇹|pt|EUR|0
IT|意大利|Italy|🇮🇹|it|EUR|0
NL|荷兰|Netherlands|🇳🇱|nl|EUR|0
PL|波兰|Poland|🇵🇱|pl|PLN|1
CZ|捷克|Czechia|🇨🇿|cs|CZK|0
SK|斯洛伐克|Slovakia|🇸🇰|sk|EUR|0
SI|斯洛文尼亚|Slovenia|🇸🇮|sr|EUR|0
HR|克罗地亚|Croatia|🇭🇷|hr|EUR|0
RS|塞尔维亚|Serbia|🇷🇸|sr|RSD|1
BA|波黑|Bosnia and Herzegovina|🇧🇦|sr|BAM|1
ME|黑山|Montenegro|🇲🇪|sr|EUR|1
MK|北马其顿|North Macedonia|🇲🇰|sr|MKD|1
AL|阿尔巴尼亚|Albania|🇦🇱|sr|ALL|1
BG|保加利亚|Bulgaria|🇧🇬|bg|BGN|1
RO|罗马尼亚|Romania|🇷🇴|ro|RON|1
HU|匈牙利|Hungary|🇭🇺|hu|HUF|0
GR|希腊|Greece|🇬🇷|el|EUR|0
SE|瑞典|Sweden|🇸🇪|sv|SEK|0
NO|挪威|Norway|🇳🇴|no|NOK|0
DK|丹麦|Denmark|🇩🇰|da|DKK|0
FI|芬兰|Finland|🇫🇮|fi|EUR|0
IS|冰岛|Iceland|🇮🇸|en|ISK|0
MT|马耳他|Malta|🇲🇹|en|EUR|0
EE|爱沙尼亚|Estonia|🇪🇪|ru|EUR|0
LV|拉脱维亚|Latvia|🇱🇻|ru|EUR|0
LT|立陶宛|Lithuania|🇱🇹|ru|EUR|0
UA|乌克兰|Ukraine|🇺🇦|uk|UAH|1
BY|白俄罗斯|Belarus|🇧🇾|ru|BYN|1
MD|摩尔多瓦|Moldova|🇲🇩|ro|MDL|1
RU|俄罗斯|Russia|🇷🇺|ru|RUB|1
AD|安道尔|Andorra|🇦🇩|es|EUR|0
SM|圣马力诺|San Marino|🇸🇲|it|EUR|0
VA|梵蒂冈|Vatican City|🇻🇦|it|EUR|0
US|美国|United States|🇺🇸|en|USD|0
CA|加拿大|Canada|🇨🇦|en|CAD|0
MX|墨西哥|Mexico|🇲🇽|es|MXN|1
BR|巴西|Brazil|🇧🇷|pt|BRL|1
AR|阿根廷|Argentina|🇦🇷|es|ARS|1
CL|智利|Chile|🇨🇱|es|CLP|1
CO|哥伦比亚|Colombia|🇨🇴|es|COP|1
PE|秘鲁|Peru|🇵🇪|es|PEN|1
UY|乌拉圭|Uruguay|🇺🇾|es|UYU|1
PY|巴拉圭|Paraguay|🇵🇾|es|PYG|1
BO|玻利维亚|Bolivia|🇧🇴|es|BOB|1
EC|厄瓜多尔|Ecuador|🇪🇨|es|USD|1
VE|委内瑞拉|Venezuela|🇻🇪|es|VES|1
GY|圭亚那|Guyana|🇬🇾|en|GYD|1
SR|苏里南|Suriname|🇸🇷|nl|SRD|1
CR|哥斯达黎加|Costa Rica|🇨🇷|es|CRC|1
PA|巴拿马|Panama|🇵🇦|es|PAB|1
GT|危地马拉|Guatemala|🇬🇹|es|GTQ|1
HN|洪都拉斯|Honduras|🇭🇳|es|HNL|1
SV|萨尔瓦多|El Salvador|🇸🇻|es|USD|1
NI|尼加拉瓜|Nicaragua|🇳🇮|es|NIO|1
DO|多米尼加|Dominican Republic|🇩🇴|es|DOP|1
CU|古巴|Cuba|🇨🇺|es|CUP|1
JM|牙买加|Jamaica|🇯🇲|en|JMD|1
TT|特立尼达和多巴哥|Trinidad and Tobago|🇹🇹|en|TTD|1
HT|海地|Haiti|🇭🇹|fr|HTG|1
EG|埃及|Egypt|🇪🇬|ar|EGP|1
MA|摩洛哥|Morocco|🇲🇦|ar|MAD|1
TN|突尼斯|Tunisia|🇹🇳|ar|TND|1
DZ|阿尔及利亚|Algeria|🇩🇿|ar|DZD|1
LY|利比亚|Libya|🇱🇾|ar|LYD|1
NG|尼日利亚|Nigeria|🇳🇬|en|NGN|1
GH|加纳|Ghana|🇬🇭|en|GHS|1
KE|肯尼亚|Kenya|🇰🇪|sw|KES|1
TZ|坦桑尼亚|Tanzania|🇹🇿|sw|TZS|1
UG|乌干达|Uganda|🇺🇬|sw|UGX|1
ET|埃塞俄比亚|Ethiopia|🇪🇹|en|ETB|1
ZA|南非|South Africa|🇿🇦|af|ZAR|1
SN|塞内加尔|Senegal|🇸🇳|fr|XOF|1
CI|科特迪瓦|Côte d'Ivoire|🇨🇮|fr|XOF|1
CM|喀麦隆|Cameroon|🇨🇲|fr|XAF|1
GA|加蓬|Gabon|🇬🇦|fr|XAF|1
CD|刚果民主共和国|DR Congo|🇨🇩|fr|CDF|1
RW|卢旺达|Rwanda|🇷🇼|en|RWF|1
ZM|赞比亚|Zambia|🇿🇲|en|ZMW|1
ZW|津巴布韦|Zimbabwe|🇿🇼|en|ZWL|1
MU|毛里求斯|Mauritius|🇲🇺|en|MUR|1
MG|马达加斯加|Madagascar|🇲🇬|fr|MGA|1
BW|博茨瓦纳|Botswana|🇧🇼|en|BWP|1
NA|纳米比亚|Namibia|🇳🇦|en|NAD|1
MZ|莫桑比克|Mozambique|🇲🇿|pt|MZN|1
AO|安哥拉|Angola|🇦🇴|pt|AOA|1
MR|毛里塔尼亚|Mauritania|🇲🇷|ar|MRU|1
SD|苏丹|Sudan|🇸🇩|ar|SDG|1
SO|索马里|Somalia|🇸🇴|ar|SOS|1
AU|澳大利亚|Australia|🇦🇺|en|AUD|0
NZ|新西兰|New Zealand|🇳🇿|en|NZD|0
FJ|斐济|Fiji|🇫🇯|en|FJD|1
PG|巴布亚新几内亚|Papua New Guinea|🇵🇬|en|PGK|1
AX|奥兰群岛|Aland Islands|🇦🇽|en|EUR|1
AS|美属萨摩亚|American Samoa|🇦🇸|en|USD|1
AI|安圭拉|Anguilla|🇦🇮|en|XCD|1
AQ|南极洲|Antarctica|🇦🇶|en|AAD|1
AG|安提瓜和巴布达|Antigua and Barbuda|🇦🇬|en|XCD|1
AW|阿鲁巴|Aruba|🇦🇼|en|AWG|1
BB|巴巴多斯|Barbados|🇧🇧|en|BBD|1
BZ|伯利兹|Belize|🇧🇿|en|BZD|1
BJ|贝宁|Benin|🇧🇯|en|XOF|1
BM|百慕大|Bermuda|🇧🇲|en|BMD|1
BT|不丹|Bhutan|🇧🇹|en|BTN|1
BQ|博内尔岛、圣尤斯特歇斯和萨巴岛|Bonaire, Sint Eustatius and Saba|🇧🇶|en|USD|1
BV|布维岛|Bouvet Island|🇧🇻|en|NOK|1
IO|英属印度洋领地|British Indian Ocean Territory|🇮🇴|en|USD|1
BF|布基纳法索|Burkina Faso|🇧🇫|en|XOF|1
BI|布隆迪|Burundi|🇧🇮|en|BIF|1
CV|佛得角|Cape Verde|🇨🇻|en|CVE|1
KY|开曼群岛|Cayman Islands|🇰🇾|en|KYD|1
CF|中非|Central African Republic|🇨🇫|en|XAF|1
TD|乍得|Chad|🇹🇩|en|XAF|1
CX|圣诞岛|Christmas Island|🇨🇽|en|AUD|1
CC|科科斯（基林）群岛|Cocos (Keeling) Islands|🇨🇨|en|AUD|1
KM|科摩罗|Comoros|🇰🇲|en|KMF|1
CG|刚果|Congo|🇨🇬|en|XAF|1
CK|库克群岛|Cook Islands|🇨🇰|en|NZD|1
CW|库拉索|Curaçao|🇨🇼|en|XCG|1
DJ|吉布提|Djibouti|🇩🇯|en|DJF|1
DM|多米尼加|Dominica|🇩🇲|en|XCD|1
GQ|赤道几内亚|Equatorial Guinea|🇬🇶|en|XAF|1
ER|厄立特里亚|Eritrea|🇪🇷|en|ERN|1
SZ|斯威士兰|Eswatini|🇸🇿|en|SZL|1
FK|福克兰群岛|Falkland Islands|🇫🇰|en|FKP|1
FO|法罗群岛|Faroe Islands|🇫🇴|en|DKK|1
GF|法属圭亚那|French Guiana|🇬🇫|en|EUR|1
PF|法属波利尼西亚|French Polynesia|🇵🇫|en|XPF|1
TF|法属南部领地|French Southern Territories|🇹🇫|en|EUR|1
GI|直布罗陀|Gibraltar|🇬🇮|en|GIP|1
GL|格陵兰岛|Greenland|🇬🇱|en|DKK|1
GD|格林纳达|Grenada|🇬🇩|en|XCD|1
GP|瓜德罗普岛|Guadeloupe|🇬🇵|en|EUR|1
GU|关岛|Guam|🇬🇺|en|USD|1
GG|根西岛|Guernsey|🇬🇬|en|GBP|1
GN|几内亚|Guinea|🇬🇳|en|GNF|1
GW|几内亚比绍|Guinea-Bissau|🇬🇼|en|XOF|1
HM|赫德·唐纳岛及麦唐纳岛|Heard Island and McDonald Islands|🇭🇲|en|AUD|1
JE|泽西岛|Jersey|🇯🇪|en|GBP|1
KI|基里巴斯|Kiribati|🇰🇮|en|AUD|1
XK|科索沃|Kosovo|🇽🇰|en|EUR|1
LS|莱索托|Lesotho|🇱🇸|en|LSL|1
LR|利比里亚|Liberia|🇱🇷|en|LRD|1
MW|马拉维|Malawi|🇲🇼|en|MWK|1
ML|马里|Mali|🇲🇱|en|XOF|1
IM|马恩岛|Man (Isle of)|🇮🇲|en|GBP|1
MH|马绍尔群岛|Marshall Islands|🇲🇭|en|USD|1
MQ|马提尼克岛|Martinique|🇲🇶|en|EUR|1
YT|马约特|Mayotte|🇾🇹|en|EUR|1
FM|密克罗尼西亚|Micronesia|🇫🇲|en|USD|1
MS|蒙特塞拉特|Montserrat|🇲🇸|en|XCD|1
NR|瑙鲁|Nauru|🇳🇷|en|AUD|1
NC|新喀里多尼亚|New Caledonia|🇳🇨|en|XPF|1
NE|尼日尔|Niger|🇳🇪|en|XOF|1
NU|纽埃|Niue|🇳🇺|en|NZD|1
NF|诺福克岛|Norfolk Island|🇳🇫|en|AUD|1
KP|朝鲜|North Korea|🇰🇵|en|KPW|1
MP|北马里亚纳群岛|Northern Mariana Islands|🇲🇵|en|USD|1
PW|帕劳|Palau|🇵🇼|en|USD|1
PN|皮特凯恩群岛|Pitcairn Island|🇵🇳|en|NZD|1
PR|波多黎各|Puerto Rico|🇵🇷|en|USD|1
RE|留尼汪岛|Reunion|🇷🇪|en|EUR|1
SH|圣赫勒拿|Saint Helena|🇸🇭|en|SHP|1
KN|圣基茨和尼维斯|Saint Kitts and Nevis|🇰🇳|en|XCD|1
LC|圣卢西亚|Saint Lucia|🇱🇨|en|XCD|1
PM|圣皮埃尔和密克隆|Saint Pierre and Miquelon|🇵🇲|en|EUR|1
VC|圣文森特和格林纳丁斯|Saint Vincent and the Grenadines|🇻🇨|en|XCD|1
BL|圣巴泰勒米|Saint-Barthelemy|🇧🇱|en|EUR|1
MF|密克罗尼西亚|Saint-Martin (French part)|🇲🇫|en|EUR|1
WS|萨摩亚|Samoa|🇼🇸|en|WST|1
ST|圣多美和普林西比|Sao Tome and Principe|🇸🇹|en|STN|1
SC|塞舌尔|Seychelles|🇸🇨|en|SCR|1
SL|塞拉利昂|Sierra Leone|🇸🇱|en|SLE|1
SX|圣马丁岛（荷兰部分）|Sint Maarten (Dutch part)|🇸🇽|en|XCG|1
SB|所罗门群岛|Solomon Islands|🇸🇧|en|SBD|1
GS|南乔治亚|South Georgia|🇬🇸|en|GBP|1
SS|南苏丹|South Sudan|🇸🇸|en|SSP|1
SJ|斯瓦尔巴和扬马延群岛|Svalbard and Jan Mayen Islands|🇸🇯|en|NOK|1
BS|巴哈马|The Bahamas|🇧🇸|en|BSD|1
GM|冈比亚|The Gambia|🇬🇲|en|GMD|1
TL|东帝汶|Timor-Leste|🇹🇱|en|USD|1
TG|多哥|Togo|🇹🇬|en|XOF|1
TK|托克劳|Tokelau|🇹🇰|en|NZD|1
TO|汤加|Tonga|🇹🇴|en|TOP|1
TC|特克斯和凯科斯群岛|Turks and Caicos Islands|🇹🇨|en|USD|1
TV|图瓦卢|Tuvalu|🇹🇻|en|AUD|1
UM|美国本土外小岛屿|United States Minor Outlying Islands|🇺🇲|en|USD|1
VU|瓦努阿图|Vanuatu|🇻🇺|en|VUV|1
VG|圣文森特和格林纳丁斯|Virgin Islands (British)|🇻🇬|en|USD|1
VI|维尔京群岛（美国）|Virgin Islands (US)|🇻🇮|en|USD|1
WF|瓦利斯群岛和富图纳群岛|Wallis and Futuna Islands|🇼🇫|en|XPF|1
EH|西撒哈拉|Western Sahara|🇪🇭|en|MAD|1
`;

/* 由数据表生成国家列表、地理映射 */
const COUNTRY_LIST = [];
const GEO = {};
COUNTRY_DATA.trim().split('\n').forEach(line => {
  const [code, zh, en, flag, lang, currency, cod] = line.split('|');
  const pay = cod === '1' ? ['cod', 'card', 'crypto'] : ['card', 'crypto'];
  COUNTRY_LIST.push({ code, zh, en, flag, lang, currency, pay });
  GEO[code] = { lang, currency, pay };
});

const DEFAULT_GEO = { lang: 'en', currency: 'USD', pay: ['crypto', 'card'] };

/* 41 语言 → 兜底国家（用于浏览器语言/手动选择） */
const LANG_FALLBACK = {
  zh:'CN', 'zh-Hant':'HK', lo:'LA', en:'US', de:'DE', fr:'FR', es:'ES', ja:'JP', ko:'KR', th:'TH', vi:'VN',
  ar:'SA', pt:'BR', ru:'RU', id:'ID', it:'IT', nl:'NL', pl:'PL', sv:'SE', da:'DK',
  no:'NO', fi:'FI', cs:'CZ', el:'GR', hu:'HU', ro:'RO', uk:'UA', he:'IL', fa:'IR',
  ur:'PK', tr:'TR', hi:'IN', bn:'BD', mr:'IN', ta:'LK', ms:'MY', tl:'PH', km:'KH',
  my:'MM', sr:'RS', sw:'KE', af:'ZA', kk:'KZ',
  sk:'SK', sl:'SI', hr:'HR', bs:'BA', mk:'MK', sq:'AL', bg:'BG', et:'EE', lv:'LV', lt:'LT',
  is:'IS', lb:'LU', ca:'AD', fo:'FO', ga:'IE', mt:'MT'
};

/* 货币 → 代表国家/地区代码（用于显示国旗，小写 ISO） */
const CURRENCY_COUNTRY = { EUR: 'eu', USD: 'us', XOF: 'sn', XAF: 'cm' };
COUNTRY_LIST.forEach(c => { if (!CURRENCY_COUNTRY[c.currency]) CURRENCY_COUNTRY[c.currency] = c.code.toLowerCase(); });

function geoFor(countryCode) { return GEO[countryCode] || DEFAULT_GEO; }
function fmtMoney(cny, currency) {
  const c = CURRENCIES[currency] || CURRENCIES.USD;
  const v = cny * c.rate;
  return c.symbol + ' ' + v.toLocaleString('en-US', { minimumFractionDigits: c.dec, maximumFractionDigits: c.dec });
}
