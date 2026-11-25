/* LUMIÈRE · 匈牙利语 */
window.I18N = window.I18N || {};
window.I18N.hu = {
  meta: { name: 'Hungarian', native: 'Magyar', flag: '🇭🇺', dir: 'ltr' },

  ui: {
    nav_home: 'Kezdőlap', nav_women: 'Női termékek', nav_men: 'Férfi termékek', nav_couples: 'Páros élmény', nav_health: 'Wellness', nav_cart: 'Kosár',
    age_title: 'Betöltötted már a 18-at?', age_body: 'Az oldal termékeit kizárólag felnőttek vásárolhatják és használhatják.', age_fine: 'A belépéssel megerősíted, hogy megfelelsz a régiód törvényi vásárlási korhatárának.', age_yes: '18 éves vagyok – Belépés', age_no: '18 év alatti',
    hero_eyebrow: 'INTIMATE WELLNESS', hero_title: 'A saját örömöd komoly dolog', hero_sub: 'Világszerte válogatott dizájn · Testbiztos anyagok · Diszkrét szállítás minden lépésnél', hero_cta: 'Fedezd fel a kollekciót', hero_cta2: 'Böngéssz a kategóriákban',
    cat_title: 'Válassz a kedved szerint', cat_sub: 'Mindenféle intimitási igényre tervezve',
    feat_title: 'A hét kiválasztottjai', feat_more: 'Összes megtekintése →',
    trust_1: 'Átlátszatlan, semleges csomagolás', trust_2: 'Semleges név a számlán', trust_3: 'Diszkrét kiszállítás világszerte', trust_4: '7×24 ügyfélszolgálat',
    footer_desc: 'Prémium, intim wellness életstílus-márka. Hisszük, hogy a saját örömöd komoly és gyönyörű dolog. Minden termékünk testbiztos és tiszteletben tartja a magánéletedet.',
    footer_shop: 'Vásárlás', footer_service: 'Szolgáltatás', footer_legal: 'Jogi információ', footer_rights: 'Minden jog fenntartva.', footer_adult: 'Csak felnőtteknek · Kérjük, fogyassz felelősségteljesen',
    foot_privacy: 'Adatvédelmi irányelvek', foot_return: 'Visszáru és csere', foot_discreet: 'Diszkrét szállítás', foot_contact: 'Kapcsolat', foot_age: '18+ vásárlási tudnivalók', foot_compliance: 'Megfelelőségi nyilatkozat', foot_terms: 'Használati feltételek',
    crumb_home: 'Kezdőlap', crumb_all: 'Összes termék', crumb_cart: 'Kosár', crumb_checkout: 'Pénztár',
    page_cat_title: 'Összes termék', page_cat_sub: 'Mindenféle intimitási igényre tervezve, gondosan válogatott testbiztos anyagokkal', filter_all: 'Összes termék',
    detail_specs: 'Műszaki adatok', detail_features: 'Jellemzők', detail_material: 'Anyag', detail_size: 'Méret', detail_noise: 'Zaj', detail_waterproof: 'Víztállóság', detail_battery: 'Tápellátás',
    detail_addcart: 'Kosárba tesz', detail_buynow: 'Vásárlás most', detail_qty: 'Mennyiség', detail_shipnote: '🔒 Átlátszatlan csomagolás · Semleges név a számlán · Diszkrét kiszállítás világszerte',
    cart_title: 'Bevásárlókosár', cart_empty: 'A kosarad üres', cart_empty_sub: 'Fedezz fel valami izgalmasat', cart_empty_btn: 'Összes termék böngészése', cart_summary: 'Rendelés összesítése',
    cart_subtotal: 'Részösszeg', cart_shipping: 'Diszkrét szállítás', cart_total: 'Összesen', cart_checkout: 'Tovább a pénztárhoz', cart_remove: 'Eltávolítás', cart_secure: '🔒 Teljes titkosítás · Diszkrét szállítás',
    checkout_title: 'Pénztár', checkout_demo: 'Demó mód: a teljes rendelési folyamat működik, de nem történik tényleges terhelés. A fizetési interfészek előkészítve vannak, és zökkenőmentesen válthatók valós fizetésre, amint a szükséges engedélyek rendelkezésre állnak.',
    checkout_shipinfo: 'Szállítási adatok', f_name: 'Címzett neve', f_email: 'E-mail cím', f_email_ph: 'Rendelési értesítésekhez', f_addr: 'Teljes cím', f_addr_ph: 'Utca, házszám', f_city: 'Város', f_country: 'Ország / régió', f_zip: 'Irányítószám', f_phone: 'Telefonszám',
    checkout_payment: 'Fizetési mód', checkout_shipto: 'Szállítási cím', checkout_payhint: 'Az elérhető módok régió szerint automatikusan jelennek meg', checkout_order: 'Rendelés összesítése', checkout_place: 'Rendelés megerősítése · Demó mód', checkout_secure: '🔒 Teljes titkosítás · Átlátszatlan csomagolás · Nincs érzékeny szöveg a számlán',
    pay_cod: 'Utánvétel (COD)', pay_cod_desc: 'Készpénzes/kártyás fizetés átvételkor · 1–3 USD kezelési díj merülhet fel', pay_cod_badge: 'Népszerű a Közel-Keleten',
    pay_card: 'Bankkártya · Felnőtteknek barátságos csatorna', pay_card_desc: 'Visa / Mastercard · Semleges név a számlán',
    pay_crypto: 'Kriptovaluta · USDT / BTC', pay_crypto_desc: 'Globálisan használható · Nagy magánélet-védelem · Alacsony díjak',
    success_title: 'Rendelés sikeres', success_orderno: 'Rendelésszám', success_demo: 'Ez egy demó rendelés; nem történt tényleges terhelés. A megerősítő e-mailt a valós környezet küldi ki.', success_note: 'A szállítási értesítőt e-mailben küldjük, amint a csomag útra kel.', success_back: 'Vissza a kezdőlapra', success_cont: 'További vásárlás',
    added_toast: 'Hozzáadva a kosárhoz', removed_toast: 'Eltávolítva', fill_required: 'Kérjük, töltse ki az összes kötelező szállítási adatot',
    legal_title: 'Adatvédelem és feltételek',
    legal_18_title: '18+ vásárlási tudnivalók', legal_18_body: 'Az oldal összes terméke kizárólag 18 éves vagy idősebb felnőttek (vagy a régiód törvényes nagykorúsági kora, ha az magasabb) részére vásárolható és használható. A belépéssel megerősíted, hogy megfelelsz ennek a korhatárnak. Fenntartjuk a jogot, hogy megtagadjuk a kiskorúnak vélt megrendelések kiszállítását.',
    legal_ship_title: 'Diszkrét szállítás', legal_ship_body: 'Tiszteletben tartjuk és védjük minden vásárlónk magánéletét. Minden rendelést az alábbiak szerint kezelünk:',
    legal_ship_1: 'Átlátszatlan, semleges csomagolásban, érzékeny szavak vagy képek nélkül;', legal_ship_2: 'A szállítóleveleken és banki számlákon kizárólag semleges cégnév szerepel, termék- vagy márkainformáció nélkül;', legal_ship_3: 'A szállítás során a logisztikai adatok általános termékmegnevezést használnak;', legal_ship_4: 'A vásárlás tartalmát kifejezett hozzájárulásod nélkül nem hozzuk nyilvánosságra harmadik fél számára.',
    legal_info_title: 'Személyes adatok védelme', legal_info_body: 'Csak a rendelés teljesítéséhez szükséges adatokat gyűjtjük (címzett, cím, elérhetőségek, e-mail). Ezeket az adatokat titkosítva tároljuk, és kizárólag rendelésteljesítésre, értékesítés utáni szolgáltatásra és jogi megfelelésre használjuk. Személyes adataidat nem adjuk el és nem adjuk bérbe. Bármikor kérheted adataid megtekintését, javítását vagy törlését.',
    legal_pay_title: 'Fizetés és számlázás', legal_pay_body: 'A fizetési módokat a szállítási régió alapján automatikusan választjuk ki; ezek közé tartozhat az utánvétel (COD), a bankkártya (felnőtteknek barátságos, magas kockázatú fizetési csatornán keresztül) és a kriptovaluta. A számlán semleges cégnév jelenik meg.',
    legal_return_title: 'Visszáru és csere', legal_return_body: 'Higiéniai és egészségügyi okokból a felbontott, személyes használatra szánt termékeket indok nélkül nem lehet visszaküldeni. Ha a termék hibás, vagy nem felel meg a leírásnak, kérjük, vegyél fel velünk kapcsolatot az átvételtől számított 7 napon belül. A felbontatlan termékek 14 napon belül küldhetők vissza.',
    legal_compliance_title: 'Megfelelőségi nyilatkozat', legal_compliance_body: 'Az oldalon értékesített termékek mindegyike legális, felnőtteknek szánt wellness termék, és nem tartalmaz jogellenes tartalmat. Betartjuk az alkalmazandó jogszabályokat, beleértve a korhatár-ellenőrzést, a termékbiztonsági szabványokat (például CE, RoHS, élelmiszer-minőségű szilikon migrációs vizsgálat) és az adatvédelmi rendeleteket (például GDPR).',
    legal_contact_title: 'Kapcsolat', legal_contact_body: 'Bármilyen kérdés esetén az oldal ügyfélszolgálati csatornáin keresztül kérjük, vegye fel velünk a kapcsolatot. 1–2 munkanapon belül válaszolunk.'
  },

  categories: {
    women:   { name: 'Női termékek', en: 'FOR HER', desc: 'Az önfelfedezés örömére tervezve, a gyengédség és a biztonság egyensúlyával' },
    men:     { name: 'Férfi termékek', en: 'FOR HIM', desc: 'Ergonomikus kialakítás, minden részletre odafigyelve' },
    couples: { name: 'Páros élmény', en: 'FOR TWO', desc: 'Az intimitás legyen közös nyelv és játék kettőnek' },
    health:  { name: 'Wellness', en: 'WELLNESS', desc: 'A tisztítástól az ápolásig – minden használatot gondozva' }
  },

  products: {
    'LUM-W01': { name: 'Bársony kollekció · Halk masszírozó', desc: 'Finom bársonyos érzettel körülölelve, 10 fokozattal a gyengédtől az intenzvig, ahogy csak szeretnéd. Az orvosi minőségű folyékony szilikon bőrbarát és testbiztos, a halk kialakítás pedig minden intim pillanatot megóv.' },
    'LUM-W02': { name: 'Szirom kollekció · Kétfejű masszírozó pálca', desc: 'Két, egymástól függetlenül vezérelhető fej egyszerre ad gyengédséget és erőt. A rugalmas test követi a tested kontúrjait, mágneses töltőcsatlakozóval és könnyen tisztítható vízálló kivitelben.' },
    'LUM-W03': { name: 'Holdfázis kollekció · Szívó masszírozó', desc: 'Pulzáló levegővel nyújt új élményt, érintésmentes, gyengédebb kialakítással. Kompakt teste könnyen hordozható, 5 fokozata fokozatosan építkezik.' },
    'LUM-M01': { name: 'Obszidián kollekció · Masszírozó', desc: 'A térbeli textúra és a nyújtható belső tér rétegezett élményt teremt. Különleges síkosítóval és tárolótokkal szállítjuk; használat után egyszerűen öblítsd le vízzel.' },
    'LUM-M02': { name: 'Atoll kollekció · Rezgő gyűrű', desc: 'A puha, rugalmas gyűrű kényelmesen illeszkedik nyomás nélkül, 7 rezgési móddal a hangulatod szerint. A párok intimitásának meghosszabbítására tervezve.' },
    'LUM-M03': { name: 'Távoli dombok kollekció · Masszázs balzsam', desc: 'Gyengéd, vizes alapú összetétel, nem irritál, friss és nem ragad, könnyen lemosható, és biztonságosan használható mindenféle szilikon termékkel.' },
    'LUM-C01': { name: 'Duet kollekció · Távirányítós masszírozó', desc: 'A vezeték nélküli távirányító átadja a kezdeményezést egymásnak. 10 rezgési programmal, halk és vízálló kialakítással izgalmas várakozást ad az intimitáshoz.' },
    'LUM-C02': { name: 'Rezonancia kollekció · Páros masszázsolaj', desc: 'Meleg hatású növényi olajkeverék, amely gyengéd masszázzsal nyugtatja a testet és a lelket. Finom illata szertartásos hangulatot kölcsönöz az intim pillanatoknak.' },
    'LUM-H01': { name: 'PureCare kollekció · Játéktisztító', desc: 'Semleges tisztító folyadék, kifejezetten felnőtt termékekhez tervezve: gyorsan hat, kíméli az anyagot, nem hagy maradványt, így minden használat nyugalmat ad.' },
    'LUM-H02': { name: 'Emléktár kollekció · Bársony tasak', desc: 'Puha bársony bélés, amely megóv a fénytől és a portól, zsinóros záródással. Visszafogott megjelenése elegánssá és magánjellegűvé teszi a tárolást.' },
    'LUM-W04': { name: 'Csillogás kollekció · Melegítő masszírozó', desc: 'Az állandó hőmérsékletű fűtés a test valódi melegét utánozza természetes, élethű érzetért. A hajlékony test követi a kontúrokat, 8 rezgési móddal és memóriával, amely megjegyzi minden kedvenc beállításodat.' },
    'LUM-M04': { name: 'Úri kollekció · Késleltető spray', desc: 'Gyengéd növényi összetétel a természetes nyugalomért és hosszabb intimitásért. Nem okoz zsibbadást, nem befolyásolja az érzetet, és kényelmesen hordozható.' }
  },

  vocab: {
    '医用级液态硅胶': 'Orvosi minőségű folyékony szilikon', '全长 18 cm · 直径 3.2 cm': 'Teljes hossz 18 cm · Átmérő 3.2 cm', '≤ 40 分贝': '≤ 40 dB', 'IPX7 全身防水': 'IPX7 teljesen vízálló', 'USB 充电 · 续航 120 分钟': 'USB töltés · 120 perc üzemidő', '10 档变频': '10 sebességfokozat', '亲肤硅胶': 'Bőrbarát szilikon', '静音设计': 'Halk kialakítás', '全身防水': 'Teljesen vízálló',
    '食品级硅胶 + ABS': 'Élelmiszer-minőségű szilikon + ABS', '全长 22 cm · 双头可弯曲': 'Teljes hossz 22 cm · Két fej hajlítható', '≤ 45 分贝': '≤ 45 dB', '磁吸充电 · 续航 150 分钟': 'Mágneses töltés · 150 perc üzemidő', '双头独立控制': 'Független kétfejű vezérlés', '可弯曲贴合': 'Hajlítható, illeszkedő', '磁吸充电': 'Mágneses töltés', '恒温模式': 'Állandó hőmérsékletű mód', '医用级硅胶': 'Orvosi minőségű szilikon',
    '高 12 cm · 开口粒径 2.5 cm': 'Magasság 12 cm · Nyílás 2.5 cm', '≤ 42 分贝': '≤ 42 dB', 'USB 充电 · 续航 90 分钟': 'USB töltés · 90 perc üzemidő', '脉冲气流': 'Pulzáló levegő', '5 档强度': '5 intenzitási szint', '柔和硅胶': 'Puha szilikon', '便携轻巧': 'Kompakt és könnyű', 'TPE 安全材质': 'Biztonságos TPE anyag',
    '长 16 cm · 内腔可伸缩': 'Hossz 16 cm · Nyújtható tér', '静音': 'Halk', '可水洗内腔': 'Mosható belső tér', '无需电池': 'Nincs szükség elemre', '立体纹理': 'Térbeli textúra', '可伸缩内腔': 'Nyújtható belső tér', '附赠润滑': 'Síkosító mellékelve', '便携收纳': 'Hordozható tárolás', '食品级硅胶': 'Élelmiszer-minőségű szilikon',
    '内径 4.5 cm · 弹性可调': 'Belső átmérő 4.5 cm · Állítható rugalmasság', '≤ 38 分贝': '≤ 38 dB', 'USB 充电 · 续航 60 分钟': 'USB töltés · 60 perc üzemidő', '7 档震动': '7 rezgési mód', '弹性贴合': 'Rugalmas illeszkedés', '延时设计': 'Időtartam-növelő kialakítás', '防水易洗': 'Vízálló és könnyen mosható', '水基配方 · 温和无刺激': 'Vizes alapú összetétel · Gyengéd és nem irritál',
    '容量 100 ml': 'Űrtartalom 100 ml', '水基易清洗': 'Vizes alapú, könnyen leöblíthető', '不黏腻': 'Nem ragad', '温和配方': 'Gyengéd összetétel', '可搭配玩具': 'Játékokkal kompatibilis', '机身 9 cm · 遥控距离 10 m': 'Test 9 cm · Távirányító hatótávolsága 10 m', 'USB 充电 · 续航 180 分钟': 'USB töltés · 180 perc üzemidő', '无线遥控': 'Vezeték nélküli távirányító', '双人同享': 'Ketten együtt élvezhetik', '静音防水': 'Halk és vízálló',
    '植物精油复配': 'Növényi illóolaj-keverék', '容量 50 ml': 'Űrtartalom 50 ml', '温感配方': 'Melegítő összetétel', '植物精油': 'Növényi illóolajok', '不油腻': 'Nem zsíros', '浪漫香氛': 'Romantikus illat', '中性 pH 清洁配方': 'Semleges pH tisztító összetétel', '容量 200 ml': 'Űrtartalom 200 ml', '中性 pH': 'Semleges pH', '快速杀菌': 'Gyors fertőtlenítés', '无残留': 'Maradványmentes', '适用各类材质': 'Minden anyaghoz alkalmas',
    '亲肤绒布 · 抽绳封口': 'Bőrbarát bársony · Zsinóros záródás', '20 × 12 cm': '20 × 12 cm', '遮光防尘': 'Fényt és port védő', '柔软绒布': 'Puha bársony', '便携抽绳': 'Hordozható zsinór', '低调私密': 'Visszafogott és diszkrét', '全长 20 cm · 可弯曲': 'Teljes hossz 20 cm · Hajlítható', '恒温加热': 'Állandó hőmérsékletű fűtés', '可弯曲机身': 'Hajlítható test', '8 档震动': '8 rezgési mód', '记忆模式': 'Memóriafunkció',
    '草本温和配方': 'Gyengéd növényi összetétel', '容量 15 ml': 'Űrtartalom 15 ml', '自然延时': 'Természetes időtartam-növelés', '不麻木': 'Nem okoz zsibbadást', '便携装': 'Utazási kiszerelés'
  },
  legal: {}
};
