/* ============================================================
   LUMIÈRE · 分面筛选 / 排序 多语言补丁
   独立于各语言包，避免改动 41 个文件。app.js 加载后合并进 I18N。
   结构：window.I18N_EXTRA[lang] = { 中文key: 译文 }
   ============================================================ */
window.I18N_EXTRA = window.I18N_EXTRA || {};

/* 需要翻译的词条（key 为中文，与 FACETS/SORTS 的 label 对应） */
/* 基准：简体中文 */
window.I18N_EXTRA.zh = {
  '材质':'材质','功能':'功能','价格':'价格','其他材质':'其他材质','多档变频':'多档变频',
  '推荐排序':'推荐排序','价格从低到高':'价格从低到高','价格从高到低':'价格从高到低',
  '名称':'名称','筛选':'筛选','清除筛选':'清除筛选','共':'共','件商品':'件商品',
  '排序方式':'排序方式','筛选结果':'筛选结果','暂无匹配商品':'暂无匹配商品',
  '类型':'类型','震动棒':'震动棒','跳蛋':'跳蛋','吸吮器':'吸吮器',
  '名器':'名器','震动环':'震动环','捆绑':'捆绑','润滑清洁':'润滑清洁','新品':'新品','热卖':'热卖','热销':'热销','主推':'主推'
};

/* 丹麦语 · Dansk */
window.I18N_EXTRA.da = {
  '材质':'Materiale','功能':'Funktion','价格':'Pris','其他材质':'Andre materialer','多档变频':'Trinløs hastighedsregulering',
  '推荐排序':'Anbefalet sortering','价格从低到高':'Pris: lav til høj','价格从高到低':'Pris: høj til lav',
  '名称':'Navn','筛选':'Filtrér','清除筛选':'Ryd filtre','共':'I alt','件商品':'varer',
  '排序方式':'Sorteringsmåde','筛选结果':'Filterresultater','暂无匹配商品':'Ingen matchende varer',
  '类型':'Type','震动棒':'Vibrator','跳蛋':'Bullet','吸吮器':'Suge-stimulator',
  '名器':'Stroker','震动环':'Vibrerende penisring','捆绑':'Bondage','润滑清洁':'Glidecreme & pleje','新品':'Ny','热卖':'Bedst sælgende','热销':'Populær','主推':'Fremhævet'
};

/* 挪威语 · Norsk */
window.I18N_EXTRA.no = {
  '材质':'Materiale','功能':'Funksjon','价格':'Pris','其他材质':'Andre materialer','多档变频':'Trinnløs hastighetsregulering',
  '推荐排序':'Anbefalt sortering','价格从低到高':'Pris: lav til høy','价格从高到低':'Pris: høy til lav',
  '名称':'Navn','筛选':'Filtrer','清除筛选':'Nullstill filtre','共':'Totalt','件商品':'varer',
  '排序方式':'Sorteringsmåte','筛选结果':'Filterresultater','暂无匹配商品':'Ingen matchende varer',
  '类型':'Type','震动棒':'Vibrator','跳蛋':'Bullet','吸吮器':'Suge-stimulator',
  '名器':'Stroker','震动环':'Vibrerende penisring','捆绑':'Bondage','润滑清洁':'Glidekrem & pleie','新品':'Ny','热卖':'Bestselger','热销':'Populær','主推':'Utvalgt'
};

/* 芬兰语 · Suomi */
window.I18N_EXTRA.fi = {
  '材质':'Materiaali','功能':'Toiminto','价格':'Hinta','其他材质':'Muut materiaalit','多档变频':'Monitasoinen nopeudensäätö',
  '推荐排序':'Suositeltu järjestys','价格从低到高':'Hinta: alhaalta ylös','价格从高到低':'Hinta: ylhäältä alas',
  '名称':'Nimi','筛选':'Suodata','清除筛选':'Tyhjennä suodattimet','共':'Yhteensä','件商品':'tuotetta',
  '排序方式':'Lajittelutapa','筛选结果':'Suodatustulokset','暂无匹配商品':'Ei vastaavia tuotteita',
  '类型':'Tyyppi','震动棒':'Vibraattori','跳蛋':'Bullet','吸吮器':'Imustimulaattori',
  '名器':'Masturbaattori','震动环':'Värisevä penisrengas','捆绑':'Bondage','润滑清洁':'Liukuvoide ja hoito','新品':'Uutuus','热卖':'Myydyin','热销':'Suosittu','主推':'Nostettu'
};

/* 捷克语 · Čeština */
window.I18N_EXTRA.cs = {
  '材质':'Materiál','功能':'Funkce','价格':'Cena','其他材质':'Ostatní materiály','多档变频':'Plynulá regulace rychlosti',
  '推荐排序':'Doporučené řazení','价格从低到高':'Cena: od nejnižší','价格从高到低':'Cena: od nejvyšší',
  '名称':'Název','筛选':'Filtrovat','清除筛选':'Vymazat filtry','共':'Celkem','件商品':'produktů',
  '排序方式':'Způsob řazení','筛选结果':'Výsledky filtrování','暂无匹配商品':'Žádné odpovídající produkty',
  '类型':'Typ','震动棒':'Vibrátor','跳蛋':'Bullet','吸吮器':'Sací stimulátor',
  '名器':'Stroker','震动环':'Vibrující penisový kroužek','捆绑':'Bondage','润滑清洁':'Lubrikant a péče','新品':'Novinka','热卖':'Bestseller','热销':'Oblíbené','主推':'Doporučujeme'
};

/* 希腊语 · Ελληνικά */
window.I18N_EXTRA.el = {
  '材质':'Υλικό','功能':'Λειτουργία','价格':'Τιμή','其他材质':'Άλλα υλικά','多档变频':'Σταδιακή ρύθμιση ταχύτητας',
  '推荐排序':'Προτεινόμενη ταξινόμηση','价格从低到高':'Τιμή: από χαμηλή σε υψηλή','价格从高到低':'Τιμή: από υψηλή σε χαμηλή',
  '名称':'Όνομα','筛选':'Φιλτράρισμα','清除筛选':'Καθαρισμός φίλτρων','共':'Σύνολο','件商品':'προϊόντα',
  '排序方式':'Τρόπος ταξινόμησης','筛选结果':'Αποτελέσματα φιλτραρίσματος','暂无匹配商品':'Δεν βρέθηκαν αντίστοιχα προϊόντα',
  '类型':'Τύπος','震动棒':'Δονητής','跳蛋':'Bullet','吸吮器':'Συσκευή αναρρόφησης',
  '名器':'Στρόουκερ','震动环':'Δονούμενο δαχτυλίδι','捆绑':'Bondage','润滑清洁':'Λιπαντικό και φροντίδα','新品':'Νέο','热卖':'Best Seller','热销':'Δημοφιλές','主推':'Προτεινόμενο'
};

/* 匈牙利语 · Magyar */
window.I18N_EXTRA.hu = {
  '材质':'Anyag','功能':'Funkció','价格':'Ár','其他材质':'Egyéb anyagok','多档变频':'Többfokozatú sebességszabályozás',
  '推荐排序':'Ajánlott rendezés','价格从低到高':'Ár: alacsonytól magasig','价格从高到低':'Ár: magastól alacsonyig',
  '名称':'Név','筛选':'Szűrés','清除筛选':'Szűrők törlése','共':'Összesen','件商品':'termék',
  '排序方式':'Rendezési mód','筛选结果':'Szűrési eredmények','暂无匹配商品':'Nincs egyező termék',
  '类型':'Típus','震动棒':'Vibrátor','跳蛋':'Bullet','吸吮器':'Szívó stimulátor',
  '名器':'Stroker','震动环':'Vibráló péniszgyűrű','捆绑':'Bondage','润滑清洁':'Síkosító és ápolás','新品':'Új','热卖':'Bestseller','热销':'Népszerű','主推':'Kiemelt'
};

/* 罗马尼亚语 · Română */
window.I18N_EXTRA.ro = {
  '材质':'Material','功能':'Funcție','价格':'Preț','其他材质':'Alte materiale','多档变频':'Reglare pe mai multe trepte',
  '推荐排序':'Sortare recomandată','价格从低到高':'Preț: de la mic la mare','价格从高到低':'Preț: de la mare la mic',
  '名称':'Nume','筛选':'Filtrează','清除筛选':'Șterge filtrele','共':'Total','件商品':'produse',
  '排序方式':'Mod de sortare','筛选结果':'Rezultatele filtrării','暂无匹配商品':'Niciun produs corespunzător',
  '类型':'Tip','震动棒':'Vibrator','跳蛋':'Bullet','吸吮器':'Stimulator cu aspirație',
  '名器':'Stroker','震动环':'Inel penian vibrant','捆绑':'Bondage','润滑清洁':'Lubrifiant și îngrijire','新品':'Nou','热卖':'Bestseller','热销':'Popular','主推':'Recomandat'
};

/* 乌克兰语 · Українська */
window.I18N_EXTRA.uk = {
  '材质':'Матеріал','功能':'Функція','价格':'Ціна','其他材质':'Інші матеріали','多档变频':'Багатоступінчасте регулювання швидкості',
  '推荐排序':'Рекомендоване сортування','价格从低到高':'Ціна: за зростанням','价格从高到低':'Ціна: за спаданням',
  '名称':'Назва','筛选':'Фільтрувати','清除筛选':'Очистити фільтри','共':'Всього','件商品':'товарів',
  '排序方式':'Спосіб сортування','筛选结果':'Результати фільтрування','暂无匹配商品':'Немає відповідних товарів',
  '类型':'Тип','震动棒':'Вібратор','跳蛋':'Bullet','吸吮器':'Стимулятор всмоктування',
  '名器':'Мастурбатор','震动环':'Вібруюче кільце','捆绑':'Бондаж','润滑清洁':'Мастило та догляд','新品':'Новинка','热卖':'Хіт продажів','热销':'Популярне','主推':'Рекомендоване'
};

/* 阿拉伯语 · dir rtl */
window.I18N_EXTRA.ar = {
  '材质':'الخامة','功能':'الوظيفة','价格':'السعر','其他材质':'مواد أخرى','多档变频':'تردد متعدد المستويات',
  '推荐排序':'الترتيب الموصى به','价格从低到高':'السعر من الأقل إلى الأعلى','价格从高到低':'السعر من الأعلى إلى الأقل',
  '名称':'الاسم','筛选':'تصفية','清除筛选':'مسح التصفية','共':'المجموع','件商品':'منتج',
  '排序方式':'طريقة الترتيب','筛选结果':'نتائج التصفية','暂无匹配商品':'لا توجد منتجات مطابقة',
  '类型':'النوع','震动棒':'هزاز','跳蛋':'بيضة اهتزازية','吸吮器':'منشط بالشفط',
  '名器':'ماسترباتور','震动环':'حلقة مهتزة','捆绑':'ربط','润滑清洁':'مزلق وعناية','新品':'جديد','热卖':'الأكثر مبيعاً','热销':'الأكثر رواجاً','主推':'مميز'
};

/* 葡萄牙语 */
window.I18N_EXTRA.pt = {
  '材质':'Material','功能':'Função','价格':'Preço','其他材质':'Outros materiais','多档变频':'Múltiplas velocidades',
  '推荐排序':'Ordenação recomendada','价格从低到高':'Preço: do mais baixo ao mais alto','价格从高到低':'Preço: do mais alto ao mais baixo',
  '名称':'Nome','筛选':'Filtrar','清除筛选':'Limpar filtros','共':'Total','件商品':'produtos',
  '排序方式':'Ordenar por','筛选结果':'Resultados da filtragem','暂无匹配商品':'Nenhum produto encontrado',
  '类型':'Tipo','震动棒':'Vibrador','跳蛋':'Bullet','吸吮器':'Estimulador de sucção',
  '名器':'Stroker','震动环':'Anel peniano vibratório','捆绑':'Bondage','润滑清洁':'Lubrificante e cuidados','新品':'Novo','热卖':'Mais vendido','热销':'Em alta','主推':'Destaque'
};

/* 俄语 */
window.I18N_EXTRA.ru = {
  '材质':'Материал','功能':'Функция','价格':'Цена','其他材质':'Другие материалы','多档变频':'Многоуровневая регулировка',
  '推荐排序':'Рекомендуемая сортировка','价格从低到高':'Цена: от низкой к высокой','价格从高到低':'Цена: от высокой к низкой',
  '名称':'Название','筛选':'Фильтр','清除筛选':'Сбросить фильтры','共':'Всего','件商品':'товаров',
  '排序方式':'Способ сортировки','筛选结果':'Результаты фильтрации','暂无匹配商品':'Нет подходящих товаров',
  '类型':'Тип','震动棒':'Вибратор','跳蛋':'Виброяйцо','吸吮器':'Вакуумный стимулятор',
  '名器':'Мастурбатор','震动环':'Виброкольцо','捆绑':'Бондаж','润滑清洁':'Смазка и уход','新品':'Новинка','热卖':'Хит продаж','热销':'Популярное','主推':'Рекомендуем'
};

/* 印度尼西亚语 */
window.I18N_EXTRA.id = {
  '材质':'Bahan','功能':'Fungsi','价格':'Harga','其他材质':'Bahan lainnya','多档变频':'Berbagai tingkat kecepatan',
  '推荐排序':'Urutan rekomendasi','价格从低到高':'Harga dari terendah ke tertinggi','价格从高到低':'Harga dari tertinggi ke terendah',
  '名称':'Nama','筛选':'Filter','清除筛选':'Hapus filter','共':'Total','件商品':'produk',
  '排序方式':'Cara mengurutkan','筛选结果':'Hasil filter','暂无匹配商品':'Tidak ada produk yang cocok',
  '类型':'Jenis','震动棒':'Vibrator','跳蛋':'Bullet','吸吮器':'Stimulator hisap',
  '名器':'Stroker','震动环':'Cincin vibrator','捆绑':'Bondage','润滑清洁':'Pelumas dan perawatan','新品':'Baru','热卖':'Terlaris','热销':'Populer','主推':'Unggulan'
};

/* 意大利语 */
window.I18N_EXTRA.it = {
  '材质':'Materiale','功能':'Funzione','价格':'Prezzo','其他材质':'Altri materiali','多档变频':'Frequenza a più livelli',
  '推荐排序':'Ordinamento consigliato','价格从低到高':'Prezzo dal più basso al più alto','价格从高到低':'Prezzo dal più alto al più basso',
  '名称':'Nome','筛选':'Filtra','清除筛选':'Cancella filtri','共':'Totale','件商品':'prodotti',
  '排序方式':'Ordina per','筛选结果':'Risultati del filtro','暂无匹配商品':'Nessun prodotto trovato',
  '类型':'Tipo','震动棒':'Vibratore','跳蛋':'Bullet','吸吮器':'Stimolatore a suzione',
  '名器':'Stroker','震动环':'Anello vibrante','捆绑':'Bondage','润滑清洁':'Lubrificante e cura','新品':'Novità','热卖':'Bestseller','热销':'Più venduto','主推':'In evidenza'
};

/* 荷兰语 */
window.I18N_EXTRA.nl = {
  '材质':'Materiaal','功能':'Functie','价格':'Prijs','其他材质':'Andere materialen','多档变频':'Meerdere frequentieniveaus',
  '推荐排序':'Aanbevolen sortering','价格从低到高':'Prijs van laag naar hoog','价格从高到低':'Prijs van hoog naar laag',
  '名称':'Naam','筛选':'Filteren','清除筛选':'Filters wissen','共':'Totaal','件商品':'producten',
  '排序方式':'Sorteerwijze','筛选结果':'Filterresultaten','暂无匹配商品':'Geen passende producten',
  '类型':'Type','震动棒':'Vibrator','跳蛋':'Bullet','吸吮器':'Zuigstimulator',
  '名器':'Stroker','震动环':'Vibrerende penisring','捆绑':'Bondage','润滑清洁':'Glijmiddel en verzorging','新品':'Nieuw','热卖':'Bestseller','热销':'Populair','主推':'Uitgelicht'
};

/* 波兰语 */
window.I18N_EXTRA.pl = {
  '材质':'Materiał','功能':'Funkcja','价格':'Cena','其他材质':'Inne materiały','多档变频':'Wielopoziomowa regulacja',
  '推荐排序':'Sortowanie rekomendowane','价格从低到高':'Cena od najniższej do najwyższej','价格从高到低':'Cena od najwyższej do najniższej',
  '名称':'Nazwa','筛选':'Filtruj','清除筛选':'Wyczyść filtry','共':'Łącznie','件商品':'produktów',
  '排序方式':'Sposób sortowania','筛选结果':'Wyniki filtrowania','暂无匹配商品':'Brak pasujących produktów',
  '类型':'Typ','震动棒':'Wibrator','跳蛋':'Bullet','吸吮器':'Stimulator ssący',
  '名器':'Stroker','震动环':'Wibrujący pierścień','捆绑':'Bondage','润滑清洁':'Lubrykant i pielęgnacja','新品':'Nowość','热卖':'Bestseller','热销':'Popularne','主推':'Polecane'
};

/* 瑞典语 */
window.I18N_EXTRA.sv = {
  '材质':'Material','功能':'Funktion','价格':'Pris','其他材质':'Andra material','多档变频':'Flera hastighetsnivåer',
  '推荐排序':'Rekommenderad sortering','价格从低到高':'Pris från lägst till högst','价格从高到低':'Pris från högst till lägst',
  '名称':'Namn','筛选':'Filtrera','清除筛选':'Rensa filter','共':'Totalt','件商品':'produkter',
  '排序方式':'Sorteringssätt','筛选结果':'Filterresultat','暂无匹配商品':'Inga matchande produkter',
  '类型':'Typ','震动棒':'Vibrator','跳蛋':'Bullet','吸吮器':'Sugstimulator',
  '名器':'Stroker','震动环':'Vibrerande penisring','捆绑':'Bondage','润滑清洁':'Glidmedel och vård','新品':'Ny','热卖':'Bästsäljare','热销':'Populär','主推':'Utvald'
};

/* English */
window.I18N_EXTRA.en = {
  '材质':'Material','功能':'Function','价格':'Price','其他材质':'Other Materials','多档变频':'Multi-Speed',
  '推荐排序':'Recommended','价格从低到高':'Price: Low to High','价格从高到低':'Price: High to Low',
  '名称':'Name','筛选':'Filter','清除筛选':'Clear Filters','共':'Total','件商品':'items',
  '排序方式':'Sort By','筛选结果':'Filter Results','暂无匹配商品':'No Matching Products',
  '类型':'Type','震动棒':'Vibrators','跳蛋':'Bullet Vibrators','吸吮器':'Suction Stimulators',
  '名器':'Strokers','震动环':'Cock Rings','捆绑':'Bondage','润滑清洁':'Lube & Care','新品':'New','热卖':'Best Seller','热销':'Top Rated','主推':'Featured'
};

/* Deutsch */
window.I18N_EXTRA.de = {
  '材质':'Material','功能':'Funktion','价格':'Preis','其他材质':'Weitere Materialien','多档变频':'Mehrere Geschwindigkeiten',
  '推荐排序':'Empfohlen','价格从低到高':'Preis: Aufsteigend','价格从高到低':'Preis: Absteigend',
  '名称':'Name','筛选':'Filtern','清除筛选':'Filter zurücksetzen','共':'Insgesamt','件商品':'Artikel',
  '排序方式':'Sortierung','筛选结果':'Filterergebnisse','暂无匹配商品':'Keine passenden Produkte',
  '类型':'Kategorie','震动棒':'Vibratoren','跳蛋':'Vibro-Eier','吸吮器':'Saugstimulatoren',
  '名器':'Stroker','震动环':'Vibrationsringe','捆绑':'Bondage','润滑清洁':'Gleitgel & Pflege','新品':'Neu','热卖':'Bestseller','热销':'Beliebt','主推':'Empfohlen'
};

/* Français */
window.I18N_EXTRA.fr = {
  '材质':'Matière','功能':'Fonction','价格':'Prix','其他材质':'Autres matières','多档变频':'Multi-vitesses',
  '推荐排序':'Recommandé','价格从低到高':'Prix croissant','价格从高到低':'Prix décroissant',
  '名称':'Nom','筛选':'Filtrer','清除筛选':'Effacer les filtres','共':'Total','件商品':'articles',
  '排序方式':'Trier par','筛选结果':'Résultats de filtrage','暂无匹配商品':'Aucun produit correspondant',
  '类型':'Catégorie','震动棒':'Vibromasseurs','跳蛋':'Œufs vibrants','吸吮器':'Stimulateurs à succion',
  '名器':'Masturbateurs','震动环':'Anneaux vibrants','捆绑':'Bondage','润滑清洁':'Lubrifiants & soins','新品':'Nouveau','热卖':'Meilleure vente','热销':'Populaire','主推':'En vedette'
};

/* Español */
window.I18N_EXTRA.es = {
  '材质':'Material','功能':'Función','价格':'Precio','其他材质':'Otros materiales','多档变频':'Multi-velocidad',
  '推荐排序':'Recomendado','价格从低到高':'Precio: de menor a mayor','价格从高到低':'Precio: de mayor a menor',
  '名称':'Nombre','筛选':'Filtrar','清除筛选':'Borrar filtros','共':'Total','件商品':'artículos',
  '排序方式':'Ordenar por','筛选结果':'Resultados del filtro','暂无匹配商品':'No hay productos que coincidan',
  '类型':'Categoría','震动棒':'Vibradores','跳蛋':'Huevos vibradores','吸吮器':'Estimuladores de succión',
  '名器':'Masturbadores','震动环':'Anillos vibrantes','捆绑':'Bondage','润滑清洁':'Lubricantes y cuidado','新品':'Nuevo','热卖':'Más vendido','热销':'Popular','主推':'Destacado'
};

/* 日本語 */
window.I18N_EXTRA.ja = {
  '材质':'素材','功能':'機能','价格':'価格','其他材质':'その他の素材','多档变频':'マルチスピード',
  '推荐排序':'おすすめ順','价格从低到高':'価格が安い順','价格从高到低':'価格が高い順',
  '名称':'名称','筛选':'絞り込み','清除筛选':'絞り込みを解除','共':'全','件商品':'件の商品',
  '排序方式':'並び替え','筛选结果':'絞り込み結果','暂无匹配商品':'該当する商品がありません',
  '类型':'タイプ','震动棒':'バイブ','跳蛋':'ローター','吸吮器':'吸引タイプ',
  '名器':'オナホール','震动环':'ペニスリング','捆绑':'ボンデージ','润滑清洁':'ローション・ケア','新品':'新着','热卖':'ベストセラー','热销':'人気','主推':'おすすめ'
};

/* 한국어 */
window.I18N_EXTRA.ko = {
  '材质':'소재','功能':'기능','价格':'가격','其他材质':'기타 소재','多档变频':'다단계 속도',
  '推荐排序':'추천순','价格从低到高':'가격 낮은 순','价格从高到低':'가격 높은 순',
  '名称':'이름','筛选':'필터','清除筛选':'필터 초기화','共':'총','件商品':'개 상품',
  '排序方式':'정렬 방식','筛选结果':'필터 결과','暂无匹配商品':'일치하는 상품이 없습니다',
  '类型':'유형','震动棒':'바이브레이터','跳蛋':'불릿','吸吮器':'흡입 자극기',
  '名器':'오나홀','震动环':'진동 링','捆绑':'본디지','润滑清洁':'러브젤 & 케어','新品':'신상품','热卖':'베스트','热销':'인기','主推':'추천'
};

/* ไทย */
window.I18N_EXTRA.th = {
  '材质':'วัสดุ','功能':'ฟังก์ชัน','价格':'ราคา','其他材质':'วัสดุอื่น ๆ','多档变频':'ความเร็วหลายระดับ',
  '推荐排序':'แนะนำ','价格从低到高':'ราคาต่ำไปสูง','价格从高到低':'ราคาสูงไปต่ำ',
  '名称':'ชื่อ','筛选':'กรอง','清除筛选':'ล้างตัวกรอง','共':'รวม','件商品':'รายการสินค้า',
  '排序方式':'การเรียงลำดับ','筛选结果':'ผลลัพธ์การกรอง','暂无匹配商品':'ไม่พบสินค้าที่ตรงกัน',
  '类型':'ประเภท','震动棒':'ไวเบรเตอร์','跳蛋':'ไข่สั่น','吸吮器':'เครื่องดูด',
  '名器':'หุ่นช่วยตัวเอง','震动环':'แหวนสั่น','捆绑':'บอนเดจ','润滑清洁':'เจลหล่อลื่น & ดูแล','新品':'ใหม่','热卖':'ขายดี','热销':'ยอดนิยม','主推':'แนะนำ'
};

/* Tiếng Việt */
window.I18N_EXTRA.vi = {
  '材质':'Chất liệu','功能':'Tính năng','价格':'Giá','其他材质':'Chất liệu khác','多档变频':'Nhiều tốc độ',
  '推荐排序':'Đề xuất','价格从低到高':'Giá tăng dần','价格从高到低':'Giá giảm dần',
  '名称':'Tên','筛选':'Lọc','清除筛选':'Xóa bộ lọc','共':'Tổng','件商品':'sản phẩm',
  '排序方式':'Sắp xếp theo','筛选结果':'Kết quả lọc','暂无匹配商品':'Không có sản phẩm phù hợp',
  '类型':'Loại','震动棒':'Máy rung','跳蛋':'Trứng rung','吸吮器':'Máy hút',
  '名器':'Cốc thủ dâm','震动环':'Vòng rung','捆绑':'Bondage','润滑清洁':'Gel bôi trơn & chăm sóc','新品':'Mới','热卖':'Bán chạy','热销':'Phổ biến','主推':'Nổi bật'
};

/* 希伯来语 · עברית · rtl */
window.I18N_EXTRA.he = {
  '材质':'חומר','功能':'פונקציה','价格':'מחיר','其他材质':'חומרים אחרים','多档变频':'הגדרות מהירות מרובות',
  '推荐排序':'מיון מומלץ','价格从低到高':'מחיר: מהנמוך לגבוה','价格从高到低':'מחיר: מהגבוה לנמוך',
  '名称':'שם','筛选':'סינון','清除筛选':'ניקוי סינון','共':'סה"כ','件商品':'מוצרים',
  '排序方式':'שיטת מיון','筛选结果':'תוצאות סינון','暂无匹配商品':'אין מוצרים תואמים',
  '类型':'סוג','震动棒':'ויברטור','跳蛋':'ביצת רטט','吸吮器':'מכשיר יניקה',
  '名器':'סטרוקר','震动环':'טבעת רוטטת','捆绑':'בונדאז','润滑清洁':'חומר סיכה וטיפול','新品':'חדש','热卖':'הנמכר ביותר','热销':'פופולרי','主推':'מומלץ'
};

/* 波斯语 · فارسی · rtl */
window.I18N_EXTRA.fa = {
  '材质':'جنس','功能':'عملکرد','价格':'قیمت','其他材质':'سایر جنس‌ها','多档变频':'تنظیمات سرعت چندگانه',
  '推荐排序':'مرتب سازی پیشنهادی','价格从低到高':'قیمت: کم به زیاد','价格从高到低':'قیمت: زیاد به کم',
  '名称':'نام','筛选':'فیلتر','清除筛选':'پاک کردن فیلتر','共':'مجموعاً','件商品':'محصول',
  '排序方式':'نحوه مرتب سازی','筛选结果':'نتایج فیلتر','暂无匹配商品':'محصولی یافت نشد',
  '类型':'نوع','震动棒':'ویبراتور','跳蛋':'تخم مرغ ویبره','吸吮器':'مکنده',
  '名器':'ماسترباتور','震动环':'حلقه ویبره','捆绑':'باندج','润滑清洁':'روان‌کننده و مراقبت','新品':'جدید','热卖':'پرفروش','热销':'محبوب','主推':'پیشنهادی'
};

/* 乌尔都语 · اردو · rtl */
window.I18N_EXTRA.ur = {
  '材质':'جنس','功能':'خصوصیات','价格':'قیمت','其他材质':'دیگر مواد','多档变频':'متعدد رفتار کی ترتیبات',
  '推荐排序':'تجویز کردہ ترتیب','价格从低到高':'قیمت: کم سے زیادہ','价格从高到低':'قیمت: زیادہ سے کم',
  '名称':'نام','筛选':'فلٹر','清除筛选':'فلٹر صاف کریں','共':'کل','件商品':'مصنوعات',
  '排序方式':'ترتیب کا طریقہ','筛选结果':'فلٹر کے نتائج','暂无匹配商品':'کوئی ملاپ نہیں ملا',
  '类型':'قسم','震动棒':'وائبریٹر','跳蛋':'بلیٹ وائبریٹر','吸吮器':'سکشن اسٹیمولیٹر',
  '名器':'اسٹروکر','震动环':'وائبریٹنگ رنگ','捆绑':'بانڈیج','润滑清洁':'لیوبریکینٹ و کیئر','新品':'نیا','热卖':'سب سے زیادہ فروخت','热销':'مقبول','主推':'نمایاں'
};

/* 土耳其语 · Türkçe */
window.I18N_EXTRA.tr = {
  '材质':'Malzeme','功能':'Özellik','价格':'Fiyat','其他材质':'Diğer Malzemeler','多档变频':'Çoklu Hız Ayarı',
  '推荐排序':'Önerilen Sıralama','价格从低到高':'Fiyat: Düşükten Yükseğe','价格从高到低':'Fiyat: Yüksekten Düşüğe',
  '名称':'Ad','筛选':'Filtrele','清除筛选':'Filtreleri Temizle','共':'Toplam','件商品':'ürün',
  '排序方式':'Sıralama Şekli','筛选结果':'Filtre Sonuçları','暂无匹配商品':'Eşleşen ürün bulunamadı',
  '类型':'Kategori','震动棒':'Vibratör','跳蛋':'Yumurta Vibratör','吸吮器':'Emme Stimülatörü',
  '名器':'Stroker','震动环':'Titreşimli Halka','捆绑':'Bondaj','润滑清洁':'Kayganlaştırıcı & Bakım','新品':'Yeni','热卖':'En Çok Satan','热销':'Popüler','主推':'Öne Çıkan'
};

/* 印地语 · हिन्दी */
window.I18N_EXTRA.hi = {
  '材质':'सामग्री','功能':'विशेषताएँ','价格':'मूल्य','其他材质':'अन्य सामग्री','多档变频':'कई स्तरों की गति सेटिंग',
  '推荐排序':'अनुशंसित क्रम','价格从低到高':'मूल्य: कम से अधिक','价格从高到低':'मूल्य: अधिक से कम',
  '名称':'नाम','筛选':'फ़िल्टर','清除筛选':'फ़िल्टर साफ़ करें','共':'कुल','件商品':'उत्पाद',
  '排序方式':'सॉर्ट करने का तरीका','筛选结果':'फ़िल्टर परिणाम','暂无匹配商品':'कोई मेल खाता उत्पाद नहीं',
  '类型':'प्रकार','震动棒':'वाइब्रेटर','跳蛋':'बुलेट वाइब्रेटर','吸吮器':'सक्शन स्टिमुलेटर',
  '名器':'स्ट्रोकर','震动环':'वाइब्रेटिंग रिंग','捆绑':'बॉन्डेज','润滑清洁':'लुब्रिकेंट और केयर','新品':'नया','热卖':'बेस्ट सेलर','热销':'लोकप्रिय','主推':'विशेष'
};

/* 孟加拉语 · বাংলা */
window.I18N_EXTRA.bn = {
  '材质':'উপাদান','功能':'বৈশিষ্ট্য','价格':'মূল্য','其他材质':'অন্যান্য উপাদান','多档变频':'একাধিক গতি সেটিং',
  '推荐排序':'প্রস্তাবিত ক্রম','价格从低到高':'মূল্য: কম থেকে বেশি','价格从高到低':'মূল্য: বেশি থেকে কম',
  '名称':'নাম','筛选':'ফিল্টার','清除筛选':'ফিল্টার সাফ করুন','共':'মোট','件商品':'পণ্য',
  '排序方式':'সাজানোর পদ্ধতি','筛选结果':'ফিল্টার ফলাফল','暂无匹配商品':'কোনো ম্যাচিং পণ্য নেই',
  '类型':'ধরন','震动棒':'ভাইব্রেটর','跳蛋':'বুলেট ভাইব্রেটর','吸吮器':'সাকশন স্টিমুলেটর',
  '名器':'স্ট্রোকার','震动环':'ভাইব্রেটিং রিং','捆绑':'বন্ডেজ','润滑清洁':'লুব্রিকেন্ট ও কেয়ার','新品':'নতুন','热卖':'বেস্ট সেলার','热销':'জনপ্রিয়','主推':'বিশেষ'
};

/* 马拉地语 · मराठी */
window.I18N_EXTRA.mr = {
  '材质':'साहित्य','功能':'वैशिष्ट्ये','价格':'किंमत','其他材质':'इतर साहित्य','多档变频':'अनेक गती सेटिंग्ज',
  '推荐排序':'शिफारस केलेला क्रम','价格从低到高':'किंमत: कमी ते जास्त','价格从高到低':'किंमत: जास्त ते कमी',
  '名称':'नाव','筛选':'फिल्टर','清除筛选':'फिल्टर साफ करा','共':'एकूण','件商品':'उत्पादने',
  '排序方式':'क्रमवारीचा प्रकार','筛选结果':'फिल्टर निकाल','暂无匹配商品':'कोणतेही जुळणारे उत्पाद नाही',
  '类型':'प्रकार','震动棒':'व्हायब्रेटर','跳蛋':'बुलेट व्हायब्रेटर','吸吮器':'सक्शन स्टिम्युलेटर',
  '名器':'स्ट्रोकर','震动环':'व्हायब्रेटिंग रिंग','捆绑':'बाँडेज','润滑清洁':'लुब्रिकंट आणि काळजी','新品':'नवीन','热卖':'बेस्ट सेलर','热销':'लोकप्रिय','主推':'विशेष'
};

/* 泰米尔语 · தமிழ் */
window.I18N_EXTRA.ta = {
  '材质':'பொருள்','功能':'அம்சம்','价格':'விலை','其他材质':'பிற பொருட்கள்','多档变频':'பல வேக அமைப்புகள்',
  '推荐排序':'பரிந்துரைக்கப்பட்ட வரிசை','价格从低到高':'விலை: குறைந்தது முதல் அதிகம் வரை','价格从高到低':'விலை: அதிகம் முதல் குறைந்தது வரை',
  '名称':'பெயர்','筛选':'வடிகட்டி','清除筛选':'வடிகட்டியை அழிக்கவும்','共':'மொத்தம்','件商品':'தயாரிப்புகள்',
  '排序方式':'வரிசையாக்க முறை','筛选结果':'வடிகட்டி முடிவுகள்','暂无匹配商品':'பொருந்தும் தயாரிப்புகள் இல்லை',
  '类型':'வகை','震动棒':'வைப்ரேட்டர்','跳蛋':'புல்லட் வைப்ரேட்டர்','吸吮器':'சக்ஷன் ஸ்டிமுலேட்டர்',
  '名器':'ஸ்ட்ரோக்கர்','震动环':'வைப்ரேட்டிங் ரிங்','捆绑':'பாண்டேஜ்','润滑清洁':'லூப்ரிகண்ட் & பராமரிப்பு','新品':'புதியது','热卖':'பெஸ்ட் செல்லர்','热销':'பிரபலமானது','主推':'சிறப்பு'
};

/* 马来语 · Bahasa Melayu */
window.I18N_EXTRA.ms = {
  '材质':'Bahan','功能':'Fungsi','价格':'Harga','其他材质':'Bahan Lain','多档变频':'Frekuensi Berbilang Tahap',
  '推荐排序':'Disyorkan','价格从低到高':'Harga: Rendah ke Tinggi','价格从高到低':'Harga: Tinggi ke Rendah',
  '名称':'Nama','筛选':'Tapis','清除筛选':'Kosongkan Tapisan','共':'Jumlah','件商品':'item',
  '排序方式':'Kaedah Pengisihan','筛选结果':'Hasil Penapisan','暂无匹配商品':'Tiada produk yang sepadan',
  '类型':'Jenis','震动棒':'Vibrator','跳蛋':'Telur Getar','吸吮器':'Stimulator Sedutan',
  '名器':'Stroker','震动环':'Cincin Bergetar','捆绑':'Bondage','润滑清洁':'Pelincir & Penjagaan','新品':'Baharu','热卖':'Paling Laris','热销':'Popular','主推':'Pilihan'
};

/* 菲律宾语 · Filipino */
window.I18N_EXTRA.tl = {
  '材质':'Materyal','功能':'Tungkulin','价格':'Presyo','其他材质':'Iba Pang Materyal','多档变频':'Maramihang Antas ng Dalas',
  '推荐排序':'Inirerekomenda','价格从低到高':'Presyo: Mababa hanggang Mataas','价格从高到低':'Presyo: Mataas hanggang Mababa',
  '名称':'Pangalan','筛选':'Salain','清除筛选':'Tanggalin ang Filter','共':'Kabuuan','件商品':'produkto',
  '排序方式':'Paraan ng Pag-uuri','筛选结果':'Resulta ng Pagsala','暂无匹配商品':'Walang tumutugmang produkto',
  '类型':'Uri','震动棒':'Vibrator','跳蛋':'Bullet Vibrator','吸吮器':'Suction Stimulator',
  '名器':'Stroker','震动环':'Vibrating Ring','捆绑':'Bondage','润滑清洁':'Lubricant at Pangangalaga','新品':'Bago','热卖':'Best Seller','热销':'Sikat','主推':'Tampok'
};

/* 高棉语 · ភាសាខ្មែរ */
window.I18N_EXTRA.km = {
  '材质':'សម្ភារៈ','功能':'មុខងារ','价格':'តម្លៃ','其他材质':'សម្ភារៈផ្សេងទៀត','多档变频':'ប្រេកង់ច្រើនកម្រិត',
  '推荐排序':'ណែនាំ','价格从低到高':'តម្លៃ៖ ទាបទៅខ្ពស់','价格从高到低':'តម្លៃ៖ ខ្ពស់ទៅទាប',
  '名称':'ឈ្មោះ','筛选':'ច្រោះ','清除筛选':'លុបតម្រង','共':'សរុប','件商品':'ផលិតផល',
  '排序方式':'វិធីតម្រៀប','筛选结果':'លទ្ធផលតម្រង','暂无匹配商品':'មិនមានផលិតផលដែលត្រូវគ្នា',
  '类型':'ប្រភេទ','震动棒':'វ៉ាយប្រេត័រ','跳蛋':'ពងញ័រ','吸吮器':'ឧបករណ៍បឺត',
  '名器':'ស្ត្រូកឃ័រ','震动环':'ចិញ្ចៀនញ័រ','捆绑':'ការចងភ្ជាប់','润滑清洁':'ជែលរំអិល និងថែទាំ','新品':'ថ្មី','热卖':'លក់ដាច់','热销':'ពេញនិយម','主推':'ពិសេស'
};

/* 缅甸语 · မြန်မာဘာသာ */
window.I18N_EXTRA.my = {
  '材质':'ပစ္စည်း','功能':'လုပ်ဆောင်ချက်','价格':'ဈေးနှုန်း','其他材质':'အခြားပစ္စည်းများ','多档变频':'ကြိမ်နှုန်းအဆင့်များစွာ',
  '推荐排序':'အကြံပြုအစီအစဉ်','价格从低到高':'ဈေးနှုန်း အနည်းဆုံးမှ အများဆုံး','价格从高到低':'ဈေးနှုန်း အများဆုံးမှ အနည်းဆုံး',
  '名称':'အမည်','筛选':'စစ်ထုတ်','清除筛选':'စစ်ထုတ်မှု ဖယ်ရှားရန်','共':'စုစုပေါင်း','件商品':'ပစ္စည်း',
  '排序方式':'အစီအစဉ်ချနည်း','筛选结果':'စစ်ထုတ်ရလဒ်','暂无匹配商品':'ကိုက်ညီသော ပစ္စည်း မရှိပါ',
  '类型':'အမျိုးအစား','震动棒':'ဗိုက်ဘရေတာ','跳蛋':'ဥတုန်ခါ','吸吮器':'စုပ်ယူကိရိယာ',
  '名器':'စထရိုကာ','震动环':'တုန်ခါလက်စွပ်','捆绑':'ချည်နှောင်','润滑清洁':'ချောဆီနှင့် ပြုစုမှု','新品':'အသစ်','热卖':'အရောင်းရဆုံး','热销':'လူကြိုက်များ','主推':'အထူး'
};

/* 塞尔维亚语 · Српски */
window.I18N_EXTRA.sr = {
  '材质':'Материјал','功能':'Функција','价格':'Цена','其他材质':'Други материјали','多档变频':'Вишестепена фреквенција',
  '推荐排序':'Препоручено','价格从低到高':'Цена: од најниже до највише','价格从高到低':'Цена: од највише до најниже',
  '名称':'Назив','筛选':'Филтрирај','清除筛选':'Обриши филтере','共':'Укупно','件商品':'производа',
  '排序方式':'Начин сортирања','筛选结果':'Резултати филтрирања','暂无匹配商品':'Нема подударних производа',
  '类型':'Тип','震动棒':'Вибратор','跳蛋':'Буллет','吸吮器':'Стимулатор за усисавање',
  '名器':'Строукер','震动环':'Вибрациони прстен','捆绑':'Бондаж','润滑清洁':'Лубрикант и нега','新品':'Ново','热卖':'Најпродаваније','热销':'Популарно','主推':'Истакнуто'
};

/* 斯瓦希里语 · Kiswahili */
window.I18N_EXTRA.sw = {
  '材质':'Nyenzo','功能':'Utendaji','价格':'Bei','其他材质':'Nyenzo Nyingine','多档变频':'Kasi za Kiwango Tofauti',
  '推荐排序':'Iliyopendekezwa','价格从低到高':'Bei: Chini hadi Juu','价格从高到低':'Bei: Juu hadi Chini',
  '名称':'Jina','筛选':'Chuja','清除筛选':'Futa Uchujaji','共':'Jumla','件商品':'bidhaa',
  '排序方式':'Njia ya Kupanga','筛选结果':'Matokeo ya Uchujaji','暂无匹配商品':'Hakuna bidhaa zinazofanana',
  '类型':'Aina','震动棒':'Vibrator','跳蛋':'Bullet','吸吮器':'Kifaa cha Kuvuta',
  '名器':'Stroker','震动环':'Pete ya Kutetemeka','捆绑':'Bondage','润滑清洁':'Lubricant na Utunzaji','新品':'Mpya','热卖':'Inayouzwa Zaidi','热销':'Maarufu','主推':'Iliyoangaziwa'
};

/* 南非荷兰语 · Afrikaans */
window.I18N_EXTRA.af = {
  '材质':'Materiaal','功能':'Funksie','价格':'Prys','其他材质':'Ander Materiale','多档变频':'Veelvuldige Frekwensie',
  '推荐排序':'Aanbeveel','价格从低到高':'Prys: Laag na Hoog','价格从高到低':'Prys: Hoog na Laag',
  '名称':'Naam','筛选':'Filter','清除筛选':'Verwyder Filter','共':'Totaal','件商品':'produkte',
  '排序方式':'Sorteerwyse','筛选结果':'Filterresultate','暂无匹配商品':'Geen ooreenstemmende produkte nie',
  '类型':'Tipe','震动棒':'Vibrator','跳蛋':'Bullet','吸吮器':'Suigstimuleerder',
  '名器':'Stroker','震动环':'Vibrerende ring','捆绑':'Bondage','润滑清洁':'Gladmiddel en versorging','新品':'Nuut','热卖':'Topverkoper','热销':'Gewild','主推':'Uitgesoek'
};

/* 哈萨克语 · Қазақша */
window.I18N_EXTRA.kk = {
  '材质':'Материал','功能':'Функция','价格':'Баға','其他材质':'Басқа материалдар','多档变频':'Көп деңгейлі жиілік',
  '推荐排序':'Ұсынылған','价格从低到高':'Баға: төменнен жоғарыға','价格从高到低':'Баға: жоғарыдан төменге',
  '名称':'Атауы','筛选':'Сүзгілеу','清除筛选':'Сүзгіні тазалау','共':'Барлығы','件商品':'өнім',
  '排序方式':'Сұрыптау әдісі','筛选结果':'Сүзу нәтижелері','暂无匹配商品':'Сәйкес өнімдер жоқ',
  '类型':'Түрі','震动棒':'Вибратор','跳蛋':'Буллет','吸吮器':'Сору стимуляторы',
  '名器':'Строукер','震动环':'Дірілдеген сақина','捆绑':'Бондаж','润滑清洁':'Жағармай және күтім','新品':'Жаңа','热卖':'Хит сатылым','热销':'Танымал','主推':'Ұсынылған'
};
