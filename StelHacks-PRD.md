# StelHacks

## Ürün Gereksinim Dokümanı (PRD)

**Stellar üzerinde çalışan, uçtan uca doğrulanabilir hackathon platformu**

| | |
|---|---|
| **Durum** | Build-ready PRD, v1.0 |
| **Hedef ağ** | Stellar + Soroban |
| **Doküman tarihi** | 21 Ağustos 2026 |
| **Slogan** | *No black swans.* — Sürpriz yok, kanıt var. |

---

## 1. Yönetici Özeti

StelHacks, hackathonun tamamını — duyurudan ödemeye kadar — Stellar üzerinde çalıştıran bir platformdur. Organizatör hackathonu kurar, ödülü akıllı kontrata kilitler, jüriler puanlar, sonuç kontrat tarafından hesaplanır, ödül kazananların cüzdanına otomatik gider. Her adımın kalıcı ve herkese açık bir kanıtı kalır.

Ürünün merkezinde tek bir vaat var: **bir katılımcı "biz neden 4. olduk?" sorusunun cevabını kimseye sormadan okuyabilmeli.**

StelHacks dar bir protokol değil, organizatörün gerçek operasyonel ihtiyaçlarını (diskalifiye, ödül ayarlama, uygun proje çıkmaması, başvuru elemesi) karşılayan tam kapsamlı bir üründür. Farkı, bu yetkileri kaldırmak değil — **kullanıldıklarında herkesin görmesini sağlamak.**

---

## 2. Stratejik Tez

### 2.1 Kaçan değer problemi

Stellar ekosisteminde hackathon eksikliği yok; **Stellar'a ait bir hackathon platformu** eksik. Stellar hackathonları bugün Devpost, DoraHacks ve benzeri harici platformlarda yürüyor.

Sonuç şu: Stellar bir etkinliğe on binlerce dolar ödül koyuyor, etkinlik başka bir platformda geçiyor, geriye **tek bir on-chain iz kalmıyor.** Ne yeni cüzdan, ne transaction, ne kalıcı bir başarı kaydı. Ödül harcanıyor, ağ hiçbir şey kazanmıyor.

StelHacks bu sızıntıyı kapatır: her hackathon, ekosistem için ölçülebilir zincir üstü aktiviteye dönüşür.

### 2.2 Neden Stellar

- Ödül varlıkları (USDC, XLM) doğrudan ağ üzerinde tutulup dağıtılabilir; aracı ödeme sağlayıcısına gerek yok.
- İşlem maliyeti çok düşük — yüzlerce puanlama ve oylama işlemi ekonomik olarak mümkün.
- Anchor ağı sayesinde kazananlar ödülü kendi ülkelerinde nakde çevirebilir. Bu, hiçbir EVM zincirinin sunamadığı yapısal avantaj.
- Soroban'ın adres bazlı yetkilendirmesi organizatör/jüri/katılımcı rollerini kontrat seviyesinde ayırmaya uygun.
- Passkey tabanlı akıllı cüzdanlar, kripto bilmeyen üniversiteli katılımcıyı saniyeler içinde zincire sokar.

### 2.3 Konumlandırma kuralı

Asla "ilk on-chain hackathon platformu" denmeyecek. Söylenecek olan dar ve test edilebilir: **Stellar'ın kendi hackathon platformu — sonucun nasıl çıktığının kanıtlanabildiği yer.**

### 2.4 Ekosistemdeki diğer ürünler

Stellar'da fonlama/escrow tarafında çalışan projeler var (ör. Boundless, Sub-Rosa). StelHacks bunlarla doğrudan çatışmaz; ileride bunların altyapı bileşenleri StelHacks'in içine entegre edilebilir. Ürünün kimliği "hackathon deneyiminin tamamı", diğerlerininki "fonlama/tahsis altyapısı".

---

## 3. Problem Tanımı

| # | Problem | Kim yaşıyor |
|---|---|---|
| P1 | Ödülün gerçekten var olduğu, etkinlik başlamadan kanıtlanamıyor | Katılımcı |
| P2 | Kazananın nasıl belirlendiği açıklanmıyor; "jüri kararı" bir kara kutu | Katılımcı |
| P3 | Ödeme haftalar sürüyor, bazen hiç ulaşmıyor | Katılımcı |
| P4 | Jüriler birbirinin puanını görüp etkileniyor | Organizatör |
| P5 | Topluluk oylaması sahte hesaplarla kırılıyor | Organizatör |
| P6 | Diskalifiye kararları tartışma yaratıyor, gerekçesi kayıtsız kalıyor | Her iki taraf |
| P7 | Sponsor, parasının adil dağıtıldığını kanıtlayamıyor | Sponsor |
| P8 | Etkinlik bitince geriye kalıcı, doğrulanabilir bir başarı kaydı kalmıyor | Katılımcı, ekosistem |

---

## 4. Tasarım İlkeleri

| İlke | Uygulama karşılığı |
|---|---|
| Önce kural, sonra sonuç | Kriterler, ağırlıklar, jüriler, ödül dağılımı ve yetkiler ilgili faz başlamadan kilitlenir |
| Esneklik var, gizlilik yok | Organizatörün her yetkisi korunur ama kullanıldığında gerekçesiyle kaydedilir |
| Deadline'a kadar mühürlü | Jüri puanları ve topluluk oyları süre bitene kadar kimseye görünmez |
| Sonra tamamen açık | Açılış anından itibaren her puan, her formül, her ödeme herkese açık |
| Zincirde sadece kritik olan | Logo, video, uzun metin zincir dışında; sadece hash'leri zincirde |
| Sahte ademi merkeziyet yok | Güven varsayımları (Sybil, organizatör takdiri, metadata barındırma) açıkça yazılır |
| Sade yüzey, ağır altyapı | Kullanıcı karmaşıklığı görmez; doğrulama arkada çalışır |

---

## 5. Roller ve Yetkiler

### 5.1 Organizatör
- Hackathon oluşturur, trackleri/kriterleri/ağırlıkları/jürileri/ödülleri tanımlar.
- Ödülü kasaya yatırır ve kural kilidini imzalar.
- Başvuru elemesi ve geçersizlik işaretlemesi yapar (gerekçeli).
- Diskalifiye süreci başlatır (jüri onayı gerekir).
- Ödülü artırabilir; azaltma/iptal ancak baştan ilan edilmiş maddeye ve jüri eşiğine bağlıdır.
- **Yapamaz:** Kilit sonrası puanlama kuralını değiştirmek, kazananı elle belirlemek, ödülü tek başına çekmek.

### 5.2 Jüri
- Yetkilendirilmiş cüzdanla giriş yapar.
- Atandığı projeleri kriter kriter puanlar, opsiyonel yazılı geri bildirim bırakır.
- Çıkar çatışması olan projeden çekilir (kayda geçer).
- Diskalifiye ve ödül azaltma kararlarında eşik oyu kullanır.
- **Yapamaz:** Açılıştan sonra puanını değiştirmek, diğer jürilerin puanını erken görmek.

### 5.3 Katılımcı
- Google ile giriş yapar, cüzdanını bağlar.
- Kayıt olur, takım kurar veya katılır.
- Proje gönderir; deadline'da submission kilitlenir.
- Açıksa topluluk oylamasına katılır.
- Diskalifiye edilirse itiraz hakkını kullanır.
- Tüm puanları, hesabı ve ödemeleri inceler.

### 5.4 Sponsor
- Yayındaki bir hackathonun kasasına ek ödül yatırabilir (her zaman serbest).
- Kendi track'ini ve kriterlerini tanımlayabilir.
- Etkinlik sonunda paylaşabileceği bir "adil dağıtım makbuzu" alır.

### 5.5 Gözlemci
Giriş yapmadan tüm sonuçları, puanları ve ödemeleri görüntüler.

---

## 6. Kimlik ve Cüzdan Modeli

**Katman ayrımı:** Google hesabı = kimlik ve profil. Stellar adresi = imza ve para.

**Akış:**
1. Kullanıcı Google ile giriş yapar → profil oluşur.
2. Cüzdan bağlama iki yoldan biriyle:
   - **Mevcut cüzdan:** Stellar Wallets Kit üzerinden Freighter, xBull, Albedo, Lobstr veya donanım cüzdanı.
   - **Cüzdanı yok:** Passkey ile otomatik akıllı cüzdan oluşturulur. Anahtar cihazında kalır; platform custody yapmaz.
3. Bağlama, kullanıcının bir challenge mesajını imzalamasıyla doğrulanır. Hesap–adres eşleşmesi kaydedilir.
4. Kritik aksiyonlar (submission kilidi, oy, jüri puanı, ödül alma) her zaman cüzdan imzası ister.

**MetaMask notu:** Stellar EVM değildir; MetaMask ancak Snap üzerinden dolaylı çalışır. MVP'de desteklenmez, V2'de opsiyonel.

**Sybil uyarısı:** Google hesabı kimlik kanıtı değildir. Topluluk oylaması güvenliği Google'a değil, **snapshot + proje göndermiş olma şartına** dayanır.

---

## 7. Kapsam

### 7.1 MVP — mutlaka çıkacak
- Google giriş + cüzdan bağlama + passkey cüzdan oluşturma
- Hackathon oluşturma sihirbazı (track, kriter, ağırlık, jüri, ödül, yetki maddeleri)
- Ödül kasası: USDC ve XLM yatırma, "Ödül Yatırıldı" kanıtı
- Kural kilidi ve anayasa hash'i
- Kayıt, takım kurma, takım içi ödül payı tanımı
- Proje gönderimi (isim, logo, açıklama, GitHub, public URL, demo video, track) + metadata hash sabitleme
- Başvuru elemesi / geçersizlik işaretleme (gerekçeli)
- Jüri puanlama, mühürlü tutma, deadline'da toplu açılış
- Sadece-jüri ve jüri+topluluk (ayarlanabilir yüzde) modları
- Kendi projesine oy verememe, çift oy verememe
- Diskalifiye + itiraz akışı
- Ödül artırma; ilan edilmişse "uygun proje yok" maddesi
- Deterministik sonuç hesabı ve eşitlik bozma
- Otomatik çok-kazananlı ödeme + takım içi bölüşüm
- Şeffaflık sayfası
- Organizatör / jüri / katılımcı panelleri, proje sayfaları, sonuç sayfası
- Açık kaynak Soroban kontratları + indexer

### 7.2 V2
- Katılımcı ve jüri itibar geçmişi (portable builder record)
- Gelişmiş kimlik doğrulama modülleri
- Beyaz etiket organizatör kurulumları
- Devpost / DoraHacks içe aktarma adaptörleri
- Sıralı tercih, quadratic ve delegasyonlu oylama modülleri
- Hackathon sonrası milestone bazlı devam fonu
- Mobil uygulama

### 7.3 Kapsam dışı
- Geliştirici sosyal ağı
- Kaynak kodun zincirde barındırılması
- Logo/video/uzun metnin kontrat depolamasına yazılması
- Token çıkarma
- Cüzdan sahipliğinden kimlik kanıtı iddia etmek

---

## 8. Uçtan Uca Akışlar

### 8.1 Organizatör
1. Google ile gir, cüzdan bağla, taslak hackathon oluştur.
2. Genel bilgiler: isim, logo, açıklama, tarihler, uygunluk şartları, sponsorlar, iletişim.
3. Trackleri tanımla; her track için kriter ve ağırlıkları gir (toplam %100).
4. Oylama modunu seç: %100 jüri veya jüri/topluluk yüzdesi.
5. Jüri cüzdanlarını ekle, track atamalarını yap, jüri modunu seç (Kolay / Katı).
6. Ödül pozisyonlarını ve tutarlarını tanımla.
7. **Yetki maddelerini seç:** başvuru onay modu, "uygun proje yok" maddesi hangi tracklerde geçerli, diskalifiye jüri eşiği, itiraz süresi, ödeme güvenlik penceresi, iptal politikası.
8. Ödülün tamamını kasaya yatır.
9. Oluşan **yarışma anayasasını** incele ve kilit işlemini imzala.
10. Yayınla → sayfada `Ödül Yatırıldı ✓ · Kurallar Kilitli ✓` görünür.
11. Kayıtları ve gönderimleri izle.
12. Submission kapandıktan sonra eleme turunu yap.
13. Jürileme fazlarını yönet.
14. Sonuçlar hesaplanır; güvenlik penceresi dolunca ödeme yürür.
15. Kalıcı sonuç/kanıt bağlantısını paylaş.

### 8.2 Katılımcı
1. Hackathon sayfasını aç, ödülün yatırıldığını ve kuralların kilitli olduğunu gör.
2. Google ile gir, cüzdan bağla (yoksa passkey ile oluştur).
3. Snapshot deadline'ından önce kayıt ol.
4. Takım kur veya katıl; takım içi ödül paylarını belirle.
5. Projeyi doldur ve gönder; deadline'da submission kilitlenir, hash'i zincire yazılır.
6. Topluluk oylaması açıksa, kendi projesi dışında bir projeye oy ver.
7. Açılıştan sonra her jürinin her kriterden verdiği puanı ve final hesabı incele.
8. Kazandıysa ödemenin cüzdanına ulaştığını explorer'da doğrula.

### 8.3 Jüri
1. Yetkili cüzdanla gir.
2. Atanan projeleri ve rubriği gör.
3. Gerekirse çekil (recusal).
4. Her kriteri puanla, opsiyonel geri bildirim yaz, skorkartını imzala.
5. Deadline'a kadar puanı kimse görmez; deadline'da tüm skorkartları aynı anda açılır.
6. Kendi skorkartının doğru kaydedildiğini inclusion proof ile doğrula.

---

## 9. Yaşam Döngüsü

| Durum | Yapılabilenler | Yasaklar |
|---|---|---|
| `TASLAK` | Tüm konfigürasyon düzenlenir | Kayıt, jürileme, ödeme |
| `FONLAMA` | Ödül yatırılır, tam fonlama doğrulanır | Eksik fonla yayınlama |
| `KAYIT` | Katılımcı kaydı, takım kurma | Sonuca etki eden kural değişikliği |
| `GÖNDERİM` | Proje gönderimi ve kilitleme | Deadline sonrası gönderim |
| `ELEME` | Geçersizlik işaretleme, diskalifiye başlatma | Puanlamaya müdahale |
| `JÜRİLEME` | Jüriler puanlar (mühürlü) | Başkasının puanını görme |
| `AÇILIŞ` | Tüm skorkartları yayınlanır | Puan değiştirme |
| `TOPLULUK_OYU` | Uygun cüzdanlar oy verir | Kendine oy, geç kayıtla oy hakkı |
| `SONUÇLANDIRMA` | Sonuç motoru sıralamayı hesaplar | Organizatörün kazanan atama |
| `ÖDEME` | Kasa kazananlara öder | Sonuca müdahale |
| `TAMAMLANDI` | Kanıt sayfası kalıcılaşır | Her türlü değişiklik |
| `İPTAL` | Baştan tanımlı iptal politikası işler | Politika dışı iptal |

Geçişler zaman kilitli ve kontrat tarafından zorlanır. Arayüzdeki saat sadece bilgilendirmedir.

---

## 10. Fonksiyonel Gereksinimler

| ID | Gereksinim | Kabul kriteri |
|---|---|---|
| FR-01 | Google giriş + cüzdan eşleştirme | Kullanıcı Google ile girer, imzalı challenge ile adresini bağlar |
| FR-02 | Passkey cüzdan | Cüzdanı olmayan kullanıcı 30 sn içinde non-custodial cüzdan sahibi olur |
| FR-03 | Hackathon oluşturma | Taslak oluşur, benzersiz ID ve kontrat adresi üretilir |
| FR-04 | Tam fonlama kontrolü | Kasa bakiyesi ödül dağılımını karşılamadan yayına çıkılamaz |
| FR-05 | Kural kilidi | Sonuca etki eden tüm parametreler hash'lenip kilitlenir |
| FR-06 | Jüri yetkisi | Sadece tanımlı jüri adresleri kendi kapsamlarında puanlayabilir |
| FR-07 | Submission sabitleme | Metadata hash'i, takım cüzdanları, track ve zaman damgası zincire yazılır |
| FR-08 | Mühürlü puanlama | Puanlar deadline'dan önce hiçbir arayüzden okunamaz |
| FR-09 | Jüri kotası | Sonuçlandırma, proje başına minimum geçerli jüri sayısını gerektirir |
| FR-10 | Oy uygunluğu | Sadece snapshot'taki cüzdanlar oy verebilir |
| FR-11 | Kendine oy engeli | Takım üyesi kendi projesine oy veremez |
| FR-12 | Tek oy | Her uygun cüzdan yarışma başına bir oy |
| FR-13 | Eleme | Organizatör gönderimi gerekçeli olarak geçersiz işaretleyebilir |
| FR-14 | Diskalifiye | Gerekçe + kanıt + itiraz penceresi + jüri eşiği olmadan diskalifiye gerçekleşmez |
| FR-15 | Ödül artırma | Herkes, her fazda kasaya ekleme yapabilir |
| FR-16 | Ödül azaltma / iptal | Sadece kilit öncesi ilan edilmişse ve jüri eşiğiyle |
| FR-17 | Deterministik sıralama | Sonuç, açık girdilerden bağımsız olarak yeniden üretilebilir |
| FR-18 | Ödeme | Sonuçlandırma sonrası kasa, kazananlara takım payıyla öder |
| FR-19 | Ödül talebi | Talep edilmeyen ödül için süre ve iade yolu baştan tanımlıdır |
| FR-20 | Şeffaflık sayfası | Kurallar, puanlar, formül, sıralama ve ödemeler herkese açık |
| FR-21 | Backend bağımsızlığı | Uygulama, yarışma durumunu zincir olaylarından yeniden inşa edebilir |

---

## 11. Başvuru, Onay ve Geçersizlik

Organizatör iki bağımsız kapıyı ayrı ayrı ayarlar.

### 11.1 Kayıt kapısı
- **Açık kayıt** (varsayılan): herkes kayıt olur.
- **Onaylı kayıt**: fiziksel etkinlik veya kontenjan için. Organizatör başvuruları onaylar/reddeder.

### 11.2 Gönderim kapısı
Referans platformlarda gönderim, organizatör onayına tabidir ve proje onaylanana kadar galeride görünmez. Bu model son saatlerde yığılma yaratır ve organizatörü boğar.

**Varsayılan model — Otomatik yayın + eleme turu:**
1. Proje gönderilir, anında galeride görünür.
2. Submission kapanır.
3. Jürileme başlamadan önce organizatör bir eleme turu yapar: spam, boş repo, yanlış track, etkinlik öncesi yazılmış kod.
4. Geçersiz işaretlenen proje **silinmez**; "geçersiz — gerekçe: X" olarak sayfada kalır.

**Alternatif model — Katı onay:** Organizatör isterse klasik "onay bekle" modunu açabilir.

**Kritik kural:** Her red/geçersizlik kararı gerekçesiyle zincire yazılır. Aksi halde şeffaflaştırılan diskalifiyenin yanında sessiz bir arka kapı açılmış olur.

---

## 12. Jürileme ve Oylama

### 12.1 Puan modeli
Her kriter 0–100 arası tam sayı alır. Kriter ağırlıkları baz puan cinsindendir ve toplamı 10.000'dir.

```
JüriPuanı(proje, jüri) = Σ(kriter_puanı_i × kriter_ağırlığı_i) / 10.000
```

Projenin jüri puanı, geçerli tüm skorkartlarının aritmetik ortalamasıdır. MVP'de jüri cömertliği normalize edilmez — normalizasyon sistemi katılımcı için anlaşılmaz hale getirir.

### 12.2 Mühürleme — iki mod

**Kolay mod (varsayılan):**
- Jüri skorkartını cüzdanıyla **off-chain imzalar.** Tek aksiyon, gas yok.
- Deadline'da tüm imzalı skorkartların **Merkle kökü** kontrata yazılır.
- Açılışta yapraklar yayınlanır; herkes Merkle proof + imza ile doğrular.
- Jüri, kökün yayınlanmasından hemen sonra kendi inclusion proof'unu görür; eksikse itiraz penceresi işler.
- **Avantaj:** Jüri tek hamle yapar, "reveal etmeyi unutan jüri" problemi ortadan kalkar.
- **Bilinen risk:** Merkle ağacını backend kurar, teorik olarak bir skorkartı dışarıda bırakabilir. Karşı önlem: imzalı alındı belgesi, anlık inclusion proof ve itiraz penceresi.

**Katı mod (opsiyonel):**
- Jüri hash'i kendisi zincire yazar, sonra açılışta kendisi açar. İki işlem, backend güveni sıfır.
- Yüksek bütçeli veya itiraz riski yüksek etkinlikler için.
- Commit yükü: `H(alan_ayracı ‖ hackathon_id ‖ submission_id ‖ jüri_adresi ‖ kriter_versiyonu ‖ puanlar ‖ salt)` — salt en az 128 bit rastgele.

### 12.3 Topluluk oylaması
- Organizatör J (jüri) ve C (topluluk) yüzdelerini belirler; J + C = 100. Örn. 80/20.
- Oy hakkı: submission kapanmadan önceki snapshot'ta yer alan kayıtlı katılımcılar.
- Her cüzdan 1 oy, kendi projesine oy yok, oylama kapanana kadar sayılar gizli.

```
ToplulukPuanı(proje) = 100 × oy(proje) / en_yüksek_oy
FinalPuan(proje) = J × JüriPuanı(proje) + C × ToplulukPuanı(proje)
```

Hiç geçerli oy gelmezse topluluk bileşeni sıfır sayılır ve sayfada işaretlenir.

### 12.4 Çıkar çatışması
Jüri, puanlamadan önce bir projeden çekilebilir. Çekilme kaydedilir ve o jüri, o proje için kotaya sayılmaz. Protokol gerçek dünyadaki ilişkileri tespit edemez; beyan sorumluluğu jürididir.

### 12.5 Eksik jüri
Bir jüri hiç puanlamazsa ve proje minimum kotayı sağlamıyorsa, baştan seçilmiş yedek politika devreye girer: süreyi bir kez uzat / önceden yetkilendirilmiş yedek jüriyi çağır / projeyi "kota yetersiz" işaretle.

---

## 13. Diskalifiye ve İtiraz

Diskalifiye tek taraflı bir düğme değil, kayıtlı bir süreçtir.

1. **Başlatma** — Organizatör projeyi işaretler, kategori seçer (kural ihlali / önceden yazılmış kod / intihal / sahte gönderim) ve serbest metin gerekçe + kanıt bağlantısı ekler. Gerekçe hash'i zincire yazılır.
2. **Bildirim** — Takıma anında bildirim gider ve itiraz penceresi açılır (varsayılan 48 saat, kilit öncesi ayarlanır).
3. **İtiraz** — Takımın savunması da kayda geçer.
4. **Karar** — Jüri eşiği (örn. 3/5) imzalar. Eşik sağlanmazsa diskalifiye düşer.
5. **Kayıt** — Proje sayfadan **silinmez**; "diskalifiye — gerekçe: X" olarak, itirazıyla birlikte kalıcı durur.

**Zamanlama kuralı:** Diskalifiye ancak sonuç kesinleşmeden önce yapılabilir. Sonuç açıklandıktan sonra diskalifiye yoktur — bu kapı açılırsa ödeme belirsizliği başlar.

---

## 14. Ödül Kasası, Esneklik ve Ödeme

### 14.1 Kasa
Her hackathonun kendi Soroban ödül kasası vardır. Kontrat kurallarıyla yönetilir; platform yöneticisinin çekme yetkisi yoktur. Kasa eksikse hackathon yayına çıkamaz. Sayfada bakiye, varlık, gereken tutar ve yatırma transaction'ları görünür.

### 14.2 Üç kademeli esneklik

Bu bölüm ürünün en hassas yeri. Kural: **her yetki önceden ilan edilir, sınırlıdır ve iz bırakır.**

| Kademe | İşlem | Şart |
|---|---|---|
| **Her zaman serbest** | Ödül artırma (top-up) | Kimse zarar görmez. Organizatör, sponsor veya üçüncü taraf her fazda ekleyebilir. Sayfada "sponsor eklendi, ödül $10k → $15k" olarak görünür. |
| **İlan edilmişse** | Track ödülünün dağıtılmaması veya azaltılması ("uygun proje yok") | (1) Kilit öncesi o track için işaretlenmiş olmalı, (2) katılımcı kod yazmadan önce sayfada görmeli, (3) jüri eşiği imzalamalı, (4) gerekçe zincire yazılmalı, (5) 48 saat itiraz penceresi dolmalı. Paranın nereye gideceği (organizatöre iade / diğer tracklere aktarım) baştan seçilir. |
| **Asla** | Organizatörün tek başına, gönderim açıldıktan sonra ödülü çekmesi veya düşürmesi | Bu kapı açılırsa ürünün tezi biter. |

### 14.3 Güvenlik penceresi
Kilit öncesi seçilir:
- **Sıkı:** Sonuç kesinleşir kesinleşmez ödeme yürür. Küçük ve basit etkinlikler için.
- **Güvenli:** 0–48 saatlik pencere; önceden tanımlı eşik yetkilisi ödemeyi duraklatabilir, gerekçesi zincire yazılır. Puanlar hiçbir koşulda değiştirilemez.

### 14.4 Ödeme
- Kazananlara ödeme, kayıtlı takım payı yüzdeleriyle otomatik yapılır.
- Talep edilmeyen ödül için süre (varsayılan 90 gün) ve sonrasındaki iade yolu baştan tanımlıdır.
- Her ödeme transaction'ı kanıt sayfasında listelenir.

### 14.5 İptal
Taslak ve fonlama aşamasında serbest. Gönderim açıldıktan sonra iptal, kilit öncesi seçilmiş politikaya (örn. organizatör + jüri eşiği) bağlıdır ve tanımlı iade yolunu tetikler.

---

## 15. Sonuç ve Eşitlik Bozma

Sonuç motoru kontrat durumundan ve kilitli formülden hesaplar; backend'in verdiği kazanan listesini asla kabul etmez.

Varsayılan eşitlik bozma sırası (kilit öncesi değiştirilebilir):
1. Yüksek jüri puanı
2. Yüksek teknik kriter puanı
3. Yüksek inovasyon kriter puanı
4. Yüksek topluluk puanı (açıksa)
5. Son teknik çare olarak deterministik submission ID sırası

Uygulanan eşitlik bozma adımı kanıt sayfasında açıkça yazılır.

---

## 16. Şeffaflık Sayfası

Bu bir explorer dökümü değil, **okunabilir bir yarışma makbuzu**dur. İçeriği:

- Durum şeridi: `Ödül Yatırıldı ✓ · Kurallar Kilitli ✓ · Jürileme Tamamlandı ✓ · Ödeme Yapıldı ✓`
- Kontrat adresi, ağ, ödül varlığı, kasa bakiyesi ve yatırma işlemleri
- Anayasa versiyonu ve konfigürasyon hash'i
- Jüri listesi ve çekilme kayıtları
- Her proje için: track, gönderim zamanı, metadata hash'i, takım cüzdanları
- Her jüri için: kriter kriter puanlar, imza/kayıt doğrulaması, geçerlilik durumu
- Topluluk oylaması: uygun cüzdan sayısı, kullanılan oy sayısı, proje bazlı oy toplamları
- Final puanın tam hesabı, ağırlıklarıyla birlikte
- Uygulanan eşitlik bozma adımı
- Geçersiz ve diskalifiye kayıtları, gerekçeleri ve itirazlarıyla
- Kullanılmış her yetki maddesi (ödül artırma, "uygun proje yok", duraklatma) gerekçesiyle
- Her kazanana giden ödeme transaction'ı ve takım içi bölüşüm

---

## 17. Veri Modeli

| Veri | Yer | Neden |
|---|---|---|
| Hackathon ID, organizatör, durum | Zincir | Otorite ve yaşam döngüsü |
| Anayasa hash'i | Zincir | Kilit sonrası değişikliği yakalar |
| Jüriler ve atamalar | Zincir | Yetki ve denetlenebilirlik |
| Kriter ID'leri, ağırlıklar, eşitlik bozma | Zincir (kompakt hash + okunabilir ayna) | Sonuca etki eden mantık |
| Ödül varlığı, tutarlar, kasa bakiyesi | Zincir | Fonlama ve ödeme kanıtı |
| Takım üyeliği ve ödül payları | Zincir (büyük ölçekte Merkle kökü) | Uygunluk ve kendine oy kontrolü |
| Submission hash'i, URI, zaman, track | Zincir | Bütünlük ve deadline kanıtı |
| Logo, uzun açıklama, repo/demo linkleri | Zincir dışı | Kullanılabilirlik ve maliyet |
| Jüri skorkartları | Zincir (Merkle kökü veya commit) | Mühürlü puanlama kanıtı |
| Açılan kriter puanları | Zincir (kompakt kayıt + event) | Puan denetimi |
| Uzun jüri geri bildirimi | Zincir dışı + hash | Ödemeye etki etmez |
| Topluluk oyları | Zincir (kompakt kayıt) | Çift oy engeli ve denetim |
| Diskalifiye/geçersizlik gerekçe hash'i | Zincir | Takdirin izlenebilirliği |
| Final puanlar ve sıralama | Zincir | Deterministik sonuç |
| Ödeme işlemleri | Zincir | Ödeme kanıtı |
| Arama indeksleri, analitik | Zincir dışı türetilmiş | Performans; asla otorite değil |

Zincir dışı metadata, hash'lenmeden önce **deterministik olarak serileştirilir** ki aynı içerik her zaman aynı özeti üretsin.

---

## 18. Soroban Mimarisi

Aşırı mikro-kontrat mimarisinden kaçınılır; az sayıda kontrat hem denetimi hem deploy'u kolaylaştırır.

| Bileşen | Sorumluluk |
|---|---|
| `HackathonFactory` | Hackathon örnekleri oluşturur, kayıt event'leri yayar |
| `HackathonCore` | Kilitli anayasa, durum makinesi, jüri yetkileri, gönderimler, skorkart kökleri/kayıtları, oylar, eleme/diskalifiye kayıtları, final sıralama |
| `PrizeVault` | Varlıkları tutar, yalnızca kesinleşmiş sonuca ve ödül şemasına göre öder; ödül artırmayı her fazda kabul eder |
| `TypeScript SDK` | Deterministik serileştirme, imza/Merkle üretimi, kontrat okuma-yazma, event çözme, puan doğrulama |
| `Indexer / API` | Soroban event'lerini PostgreSQL'e indeksler; sadece türetilmiş veri, otorite değil |
| `Web App` | Organizatör, jüri, katılımcı ve gözlemci arayüzleri |

**Kontrat fonksiyonları (örnek):** `create`, `configure`, `fund`, `top_up`, `lock_rules`, `register_team`, `submit_project`, `invalidate_submission`, `open_disqualification`, `submit_appeal`, `resolve_disqualification`, `recuse`, `publish_score_root`, `reveal_scores`, `cast_community_vote`, `finalize_results`, `declare_no_award`, `pause_settlement`, `resume_settlement`, `settle_prizes`, `claim_prize`, `cancel_under_policy`

**Event'ler:** `HackathonCreated`, `PrizeFunded`, `PrizeToppedUp`, `RulesLocked`, `TeamRegistered`, `ProjectSubmitted`, `SubmissionInvalidated`, `DisqualificationOpened`, `AppealSubmitted`, `DisqualificationResolved`, `JudgeRecused`, `ScoreRootPublished`, `ScoresRevealed`, `CommunityVoteCast`, `NoAwardDeclared`, `ResultsFinalized`, `SettlementPaused`, `PrizePaid`, `PrizeClaimed`, `HackathonCancelled`

---

## 19. Güvenlik ve Tehdit Modeli

| Tehdit | Önlem |
|---|---|
| Organizatör kuralları sonradan değiştirir | Kural kilidi + anayasa hash'i + durum kilitli mutasyon |
| Ödül duyurulur ama yatırılmaz | Yayın öncesi tam fonlama kontrolü, herkese açık kasa kanıtı |
| Organizatör gönderim sonrası parayı çeker | Kasa çekimi yasak; sadece ilan edilmiş madde + jüri eşiği |
| "Uygun proje yok" maddesi kötüye kullanılır | Kilit öncesi ilan + jüri eşiği + gerekçe + itiraz penceresi |
| Jüri diğer jürilerin puanını kopyalar | Deadline'a kadar mühürleme, toplu açılış |
| Jüri sonucu gördükten sonra puan değiştirir | İmza/commit ile eşleşmeyen açılış reddedilir |
| Backend bir skorkartı gizler (Kolay mod) | İmzalı alındı + anlık inclusion proof + itiraz penceresi; kritik etkinliklerde Katı mod |
| Puan commit'i brute-force edilir | 128 bit+ rastgele salt ve alan ayracı (Katı mod) |
| Topluluk oylaması Sybil saldırısı | Snapshot + proje göndermiş olma şartı; kimlik kanıtı iddiası yok |
| Katılımcı kendine oy verir | Takım üyeliği oy hedefiyle karşılaştırılır |
| Çift oy | Cüzdan başına tek oy kaydı |
| Metadata deadline sonrası değiştirilir | Gönderim kilidinde hash sabitleme |
| Backend kazanan uydurur | Sonuç kontrat tarafından hesaplanır; backend sadece indeks |
| Yanlış adrese ödeme | Takım ödeme konfigürasyonu gönderimle birlikte kilitlenir |
| Diskalifiye keyfi kullanılır | Gerekçe + itiraz + jüri eşiği; sonuç sonrası diskalifiye yok |
| Ödemeden önce kontrat hatası bulunur | Güvenli mod penceresi + gerekçe hash'i + mainnet öncesi denetim |
| Eşitlik belirsizliği | Kilit öncesi tanımlı deterministik zincir |

**Test yükümlülüğü:** Birim testleri; fon korunumu ve durum geçişleri için invariant testleri; geç oy, yetkisiz jüri, kural değiştirme, tekrarlı açılış, kendine oy, çift oy, eksik fonla yayın, yetkisiz çekim ve ödeme doğruluğu için adversarial testler.

---

## 20. Fonksiyonel Olmayan Gereksinimler

| Alan | Gereksinim |
|---|---|
| Güvenilirlik | Sonuç kesinleşmeden ve ödül yükümlülüğü tam karşılanmadan hiçbir ödeme durumuna geçilemez |
| Performans | İndekslenmiş okuma ekranları normal yükte 2 sn altında; yazma işlemleri net bekliyor/kesin durumu gösterir |
| Erişilebilirlik | Ana akışlarda WCAG 2.1 AA temeli: klavye navigasyonu, etiketler, kontrast, hata metni |
| Güvenlik | Hiçbir backend anahtarı ödül fonunu hareket ettiremez; sırlar istemci kodunda tutulmaz |
| Test kapsamı | Kritik ödeme modüllerinde ≥%90 satır/dal kapsamı + testnet entegrasyon testleri |
| Gözlemlenebilirlik | Indexer sağlığı, RPC hataları, işlem hataları ve event gecikmesi izlenir |
| Taşınabilirlik | SDK, referans uygulamayı içe aktarmadan üçüncü taraf arayüzlerce kullanılabilir |
| Açık kaynak | Kontratlar ve SDK izin verici lisansla yayınlanır; deploy adresleri dokümante edilir |
| Dil | Arayüz İngilizce + Türkçe; içerik dili organizatöre bağlı |

---

## 21. Tasarım Dili ve Marka

**İsim:** StelHacks — Stellar + hackathon. Doğrudan, aranabilir, ekosistemle bağı ilk bakışta anlaşılıyor.

**Marka hikâyesi — kara kuğu / ak kuğu:** Bugün hackathon sonucu bir kara kuğudur; nasıl karar verildiğini kimse bilmez, açıklanınca herkes şaşırır. StelHacks onu ak kuğuya çevirir: sonuç, herkesin baştan okuduğu kurallardan çıkar. Slogan: **"No black swans."**

**Görsel yön:**
- Koyu zemin, tek beyaz mark, tek vurgu rengi — az ve kararlı kullanım.
- Sert bir tipografi ölçeği ve cömert boşluk. Apple hissi yuvarlak köşeden değil, hiyerarşi ve boşluktan gelir.
- Stellar'ın kurumsal mavisinden kaçınılır; kendi rengi olur.

**Marka öğesi — kanıt şeridi:** Her hackathon sayfasının tepesinde sabit duran durum şeridi. Ürün bu şeritle hatırlanır.

**İmza etkileşimi — açılış anı:** Deadline'a kadar kapalı puan kartları, deadline'da hepsinin aynı anda açılması. Bu tek animasyon, ürünün pazarlama malzemesidir.

---

## 22. MVP Kabul Kriterleri

MVP, **eksiksiz bir hackathonun testnet üzerinde fonlamadan ödemeye kadar, hiçbir manuel veritabanı müdahalesi olmadan** koşabilmesiyle başarılı sayılır.

| Alan | Kabul kriteri |
|---|---|
| Organizatör | Hackathon kurar, jüri/kriter/ağırlık/ödül tanımlar, kasayı doldurur, kuralları kilitler, yayınlar |
| Kimlik | Google girişi + cüzdan bağlama; cüzdanı olmayan kullanıcı passkey ile cüzdan sahibi olur |
| Katılımcı | Kayıt olur, takım kurar, proje gönderir, hash kilitlenir, kanıt durumlarını görür |
| Eleme | Geçersizlik işaretlemesi gerekçesiyle kaydedilir |
| Diskalifiye | İtiraz penceresi işler, jüri eşiği olmadan karar kesinleşmez |
| Jüri | Skorkartını imzalar, deadline'a kadar görünmez, açılışta doğrulanabilir |
| Topluluk | Uygun katılımcı tek oy verir; kendine oy ve çift oy reddedilir |
| Esneklik | Ödül artırma çalışır; ilan edilmemiş bir trackte "uygun proje yok" denemesi reddedilir |
| Sonuç motoru | Sadece-jüri ve karma modda beklenen sıralamayı üretir, eşitliği kurala göre bozar |
| Ödeme | En az üç kazanana takım payıyla öder ve event yayar |
| Şeffaflık | Sayfa, tüm puanları ve tam formülü zincir verisinden yeniden kurar |
| Güvenlik | Adversarial testler geç oy, yetkisiz jüri, kural değiştirme, kendine oy, çift oy, eksik fonla yayın ve yetkisiz çekimi reddeder |
| Dokümantasyon | Kurulum, testnet deploy, kontrat API, SDK örnekleri, organizatör ve jüri rehberi |

**Demo senaryosu:** 1 organizatör, 5 jüri, 8 takım, 2 track, 10.000 test USDC, %80 jüri / %20 topluluk, bir çekilme, bir geçersizlik, bir diskalifiye + itiraz, bir sponsor ödül artırımı, kurala göre bozulan bir eşitlik ve üç otomatik ödeme.

---

## 23. Yol Haritası ve Bütçe

SCF Build, dört tranşlı milestone yapısıyla çalışır: %10 → %20 → %30 → %40.

**Önerilen toplam talep: 80.000 USD karşılığı XLM.** Nihai rakam ekip ve pilot taahhütlerine göre ayarlanır.

| Faz | Pay | Çıktı | Kabul kanıtı |
|---|---|---|---|
| **Ön hazırlık** (fon dışı) | — | Testnet prototipi, tıklanabilir arayüz, organizatör görüşmeleri, en az 1 pilot taahhüdü | Açık repo, canlı demo, yazılı pilot sözü |
| **Tranş 0** | %10 — $8k | Mimari, repolar, CI, kanonik spesifikasyon, test planı | Açık repolar, teknik spec, geçen CI, deploy planı |
| **Tranş 1 — MVP** | %20 — $16k | Core + kasa, kimlik/cüzdan, gönderim sabitleme, jüri puanlama ve açılış | Uçtan uca testnet demosu, ≥%85 kontrat kapsamı |
| **Tranş 2 — Pilot** | %30 — $24k | Topluluk oylaması, diskalifiye/itiraz, esneklik kademeleri, sonuç motoru, şeffaflık sayfası, SDK, indexer, testnet pilotu, güvenlik incelemesi | Gerçek pilot, herkese açık makbuz, ≥%90 kritik kapsam, adversarial rapor |
| **Tranş 3 — Mainnet** | %40 — $32k | Denetim düzeltmeleri, mainnet kontratları, prodüksiyon uygulaması, dokümantasyon, ikinci pilot | Mainnet deploy, canlı URL, gerçek ödeme transaction'ları, 2 vaka çalışması |

**Süre:** Ödül sonrası 3–4 ay.

---

## 24. Go-to-Market

İlk müşteri bireysel hacker değil, **etkinliği düzenleyen ve parayı koyan taraf**.

### 24.1 Hedef segmentler
1. Stellar Türkiye topluluğu ve Stellar ambassador grupları — doğal ilk halka.
2. Üniversite blockchain kulüpleri (sponsorlu etkinlikler).
3. Stellar ekosistem protokolleri (kendi track'ini açan sponsorlar).
4. Form + tablo + manuel havale ile yürüyen Web3 toplulukları.
5. SDF'in kendi etkinlikleri — nihai hedef.

### 24.2 Pilot teklifi
İlk 3 pilot için ücretsiz, birebir kurulum desteği. Amaç gelir değil kanıt: kilitlenen ödül hacmi, kazanılan cüzdan sayısı, kaydedilen skorkartlar, başarılı ödemeler, organizatörden gelen zaman tasarrufu geri bildirimi.

### 24.3 Dağıtım
- Her hackathonun kalıcı ve paylaşılabilir kanıt sayfası — ürünün kendi pazarlaması.
- Harici bir etkinlik sayfasından StelHacks makbuzuna bağlanan doğrulama rozeti.
- 15 dakikada entegrasyon örneğiyle açık kaynak SDK.
- Pilot sonrası vaka çalışmaları: gerçek transaction'lar ve ödeme süreleri.

### 24.4 Anlatı
> "Stellar bir hackathona $50.000 koyuyor, etkinlik Devpost'ta geçiyor, geriye tek bir on-chain iz kalmıyor. StelHacks bunu değiştirir."

Sunumun en güçlü slaytı: son 18 ayın Stellar hackathonları, hangi harici platformda yapıldıkları ve toplam ödül havuzları.

---

## 25. Metrikler

| Metrik | İlk 6 ay hedefi | Neden önemli |
|---|---|---|
| Pilot hackathon sayısı | ≥ 3 | Organizatör talebi |
| Tekil katılımcı cüzdanı | ≥ 250 | Stellar onboarding |
| Yeni oluşturulan passkey cüzdanı | ≥ 100 | Web2'den gelen gerçek yeni kullanıcı |
| Proje gönderimi | ≥ 70 | Anlamlı builder kullanımı |
| Yetkili jüri | ≥ 15 | Jüri akışının doğrulanması |
| Zincire yazılan skorkart | ≥ 300 | Doğrudan protokol aktivitesi |
| Kilitlenen + dağıtılan ödül | ≥ $20.000 | Ağ üzerinde gerçek varlık kullanımı |
| Başarılı ödeme oranı | Sonuçlanan pilotlarda %100 | Temel güven vaadi |
| Sonuç → ödeme süresi | Sıkı modda < 10 dakika | Operasyonel üstünlük |
| Organizatör memnuniyeti | ≥ 4.2/5 | Niteliksel PMF sinyali |

---

## 26. İş Modeli

Ürün, ödül üzerinden zorunlu komisyon almadan açık altyapı olarak başlar. Erken aşamada komisyon, benimsemeyi yavaşlatır ve grant'in ürün-pazar uyumundan önce rant üretiyormuş gibi görünmesine yol açar.

Benimseme sonrası sürdürülebilirlik yolları:
- Organizatör SaaS katmanı: özel marka, kapalı etkinlik, analitik, SSO, dışa aktarma.
- Ekosistemler ve üniversiteler için beyaz etiket kurulumlar.
- Büyük etkinlikler için yönetilen organizatör hizmeti.
- Entegrasyonlar için kurumsal destek ve SLA.

Kontratlar ve SDK, barındırılan servis olmadan da kullanılabilir kalır.

---

## 27. Riskler ve Verilen Kararlar

| Risk / gerilim | Karar |
|---|---|
| Esneklik ile güvenilirlik çatışması | Yetkiler kaldırılmaz, kayda bağlanır. Üç kademeli model. |
| Organizatörün takdir alanını daraltmak benimsemeyi düşürür | Takdir korundu; sadece görünür kılındı. Satış cümlesi: "esneklik var, gizli değil." |
| Jüri iki aşamalı ritüele katlanmaz | Kolay mod tek imza; Katı mod opsiyonel. |
| Backend'in Merkle kökünü manipüle etmesi | İmzalı alındı + inclusion proof + itiraz; kritik etkinlikte Katı mod. |
| Google girişi Sybil koruması sanılır | Oy hakkı snapshot + gönderim şartına bağlandı; dokümantasyonda açıkça belirtilir. |
| Zincir depolama maliyeti | Sadece kritik kayıt zincirde; medya ve uzun metin hash'le sabitlenir. |
| Ödemenin geri alınamazlığı | Sıkı / Güvenli mod seçimi kilit öncesi yapılır. |
| Özellik şişmesi | İtibar sistemi, gelişmiş oylama, devam fonu ve mobil V2'ye alındı. |
| Ekosistemde benzer ürünler | Doğrudan çatışılmaz; ileride altyapı entegrasyonu değerlendirilir. |

---

## 28. Açık Kararlar

1. **Passkey cüzdan sağlayıcısı** — kendi implementasyonu mu, mevcut Stellar passkey kit'i mi?
2. **"Uygun proje yok" iadesinin varsayılanı** — organizatöre iade mi, diğer tracklere aktarım mı?
3. **İlk pilot etkinlik** — hangi topluluk, hangi tarih, ne kadar ödül?
4. **Metadata barındırma** — nesne depolama mı, IPFS uyumlu depolama mı?
5. **Türkçe/İngilizce içerik stratejisi** — arayüz iki dilli, peki hackathon içerikleri?

---

## Ek A — Örnek Kilitli Yarışma Anayasası

| Parametre | Örnek değer |
|---|---|
| Ağ | Stellar Mainnet |
| Ödül varlığı | USDC |
| Ödül havuzu | 10.000 USDC, yayın öncesi tam fonlanmış |
| Trackler | Payments; DeFi; Developer Tooling |
| Jüriler | 5 yetkili Stellar adresi |
| Jüri kotası | Proje başına en az 3 geçerli skorkart |
| Jüri modu | Kolay (Merkle) |
| Kriterler | Teknik %30; İnovasyon %25; UX %15; Stellar Entegrasyonu %20; Etki %10 |
| Oylama modu | %80 jüri / %20 topluluk |
| Oy uygunluğu | Gönderim snapshot'ından önce kayıt; tek oy; kendine oy yok |
| Gönderim kapısı | Otomatik yayın + eleme turu |
| Diskalifiye eşiği | 3/5 jüri, 48 saat itiraz penceresi |
| "Uygun proje yok" maddesi | Sadece Developer Tooling track'inde açık; iade organizatöre |
| Ödül artırma | Her fazda serbest |
| Eşitlik bozma | Jüri puanı → Teknik → İnovasyon → Topluluk → Submission ID |
| Güvenlik modu | 24 saatlik pencere |
| Ödül dağılımı | 1. 5.000 · 2. 3.000 · 3. 2.000 USDC |
| Talep süresi | 90 gün, sonrasında organizatöre iade |
| İptal | Gönderim öncesi serbest; sonrasında organizatör + 3/5 jüri |

---

## Ek B — Teknoloji Yığını

| Katman | Seçim |
|---|---|
| Frontend | Next.js + TypeScript + React |
| Kimlik | Google OAuth + cüzdan challenge imzası |
| Cüzdan | Stellar Wallets Kit (Freighter, xBull, Albedo, Lobstr, donanım) + passkey akıllı cüzdan |
| Kontratlar | Rust + Soroban SDK |
| Stellar istemcisi | Stellar JavaScript SDK / RPC |
| Indexer / API | Node.js + TypeScript servis + PostgreSQL |
| Metadata | Nesne depolama veya IPFS uyumlu depolama + deterministik hash sabitleme |
| Test | Rust birim/invariant testleri + TypeScript entegrasyon ve e2e testleri |
| CI/CD | GitHub Actions, deterministik kontrat build'leri |
| Gözlemlenebilirlik | RPC/indexer sağlık kontrolleri, hata takibi, yapılandırılmış işlem logları |
| Deployment | Vercel + yönetilen API/Postgres; self-host seçeneği dokümante |

---

## Ek C — Lansman Öncesi Kontrol Listesi

| Kapı | Gereken kanıt |
|---|---|
| 1. Prototip | Kural kilidi → mühürlü puanlama → deterministik sonuç → testnet ödemesi tek kesintisiz demoda |
| 2. Pilot talebi | En az bir organizatörün yazılı pilot taahhüdü |
| 3. Müdahalesizlik | Gerçek senaryo, manuel kazanan düzenlemesi olmadan koşuyor |
| 4. Farklılaşma | Ekosistemdeki diğer ürünlerle ilişkiyi açıklayan herkese açık karşılaştırma sayfası |
| 5. Güvenlik | Tehdit modeli, adversarial test planı ve kasa invariant'ları kısmen uygulanmış |
| 6. Bütçe disiplini | Talep, kalan mainnet işine ve gerçek ekibe orantılı |

**Gönderim eşiği:** Prototip, *kural kilidi → mühürlü jürileme → deterministik sıralama → Stellar ödemesi* zincirini tek seferde gösteremiyorsa başvuru için hazır değildir.

---

### İlk build sırası

1. `HackathonCore` + `PrizeVault` mutlu yolunu testnet'te bitir.
2. Dört ekran: organizatör kurulumu, katılımcı gönderimi, jüri puanlama, şeffaflık sayfası.
3. Sekiz takımlık iç deneme koş ve kanıt sayfasını yayınla.
4. Pilot organizatörü bul, geri bildirimiyle yol haritasını ve bütçeyi kesinleştir.

---

*StelHacks — çalışma taslağı, Ağustos 2026*
