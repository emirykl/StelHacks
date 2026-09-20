# StelHacks konumlandırma ve judging notları

19 Eylül 2026 — Landing revizyonu için yapılan araştırma.

## Sorun ve hedef kullanıcı

Stellar etkinlikleri farklı organizasyon ve başvuru/teslim platformlarında gerçekleşiyor. StelHacks'in önerisi: Stellar ekosistemine ayrılmış tek bir keşif, organizasyon, katılım ve proje teslim deneyimi.

Organizatörler: Stellar, Stellar üzerinde uygulama geliştiren ekipler ve topluluklar. Katılımcılar: hackathon arayan, takım kuran ve proje teslim eden builder'lar. “Official platform” kullanıcının hedef konumlandırmasıdır; aşağıdaki araştırma bir SDF onayını doğrulamaz.

## Doğrulanmış etkinlik örnekleri

| Etkinlik | Yer / format | Platform ve kanıt |
| --- | --- | --- |
| Stellar Hack Pera, Haziran 2025 | İstanbul, yüz yüze | [Rise In'in organizasyon raporu](https://www.risein.com/blog/stellar-hack-pera-turkeys-largest-irl-web3-hackathon-with-200-participants-70-projects). Rapor organizasyon ortaklığını doğruluyor; bütün teslim altyapısını tek başına belgelemiyor. |
| Stellar Pro Hackathon, 19–20 Eylül 2026 | Grand Pera, İstanbul, yüz yüze | [Rise In etkinlik ve kayıt sayfası](https://www.risein.com/programs/stellar-pro-hackathon); Rise In hesabı/e-posta ile başvuru sunuyor. |
| Stellar × Ledger Community Hackathon, 14–15 Nisan 2022 | Paris, Cloud Business Center, yüz yüze | [Devpost etkinlik, teslim ve proje galerisi](https://stellar-ledger.devpost.com/). |
| Stellar NFT Hackathon @ SXSW, 11–13 Mart 2022 | Austin + çevrim içi, hibrit | [Devpost etkinlik sayfası](https://stellarnft.devpost.com/). Austin'de atölye/çalışma alanı var; NFT Wizard proje teslimi Devpost üzerinden. Tamamen yüz yüze diye sınıflandırılmamalı. |

**Brezilya örneği doğrulandı:** [GrantFox'un kendi paylaşımı](https://www.linkedin.com/company/grantfox), Stellar Summit São Paulo 2026'da GrantFox Bounties kullanımını ve SDF'nin açtığı görevleri anlatıyor. [SDF'nin 13 Ağustos 2026 toplantı notları](https://developers.stellar.org/meetings/2026/08/13), yüz yüze São Paulo Builder Summit'i ve ona bağlı bounty programını doğruluyor. Bu, Rio'daki HackMeridian 2025 ile karıştırılmamalı; klasik iki günlük hackathondan farklı bir summit/bounty formatı.

Bu örneklerden çıkarım: farklı platform deneyimleri mevcut. “Stellar'ın hiçbir merkezi etkinlik sayfası yok” veya “bütün hackathonlar burada” sonucunu kanıtlamazlar.

## Landing başlıkları

- **Discover — ONE HOME. ALL STELLAR.** Stellar hackathonları için ortak keşif noktası.
- **Host — YOUR EVENT. YOUR WAY.** Ekosistem ekipleri ve topluluklar için organizasyon.
- **Build — JOIN. BUILD. SUBMIT.** Katılım, takım ve proje teslimi.
- **Reward — ONCHAIN. ON YOUR TERMS.** Teminatlandırılmış ödüller; jüri, topluluk veya karma sıralama.

Detaylı rakip karşılaştırması ve kriptografi açıklamaları ana sayfaya taşınmadı.

## Mevcut judging gerçekte ne yapıyor?

ZK kullanılmıyor. `contracts/hackathon-core/src/constitution/judging.rs`, `backend/sealer/src/seal.ts`, `backend/sealer/src/receipt.ts` ve `docs/decisions.md` birlikte incelendi:

- Easy modunda jüri puan kartını imzalıyor; sealer bunları topluyor, Merkle kökü yayımlıyor ve açılımı gerçekleştiriyor.
- Merkle dahil edilme kanıtı ZK kanıtı değildir. Sealer'ın erken erişimi veya girdileri dışlaması bakımından güven varsayımı sürüyor.
- Strict enum'u doğrudan commit/reveal için modellenmiş; mevcut roadmap bunu tamamlanmamış olarak listeliyor. Landing'de hazır özellik olarak sunulmadı.
- Oluşturma ekranı jüri, topluluk oyu veya ağırlıklı karma sıralama sunuyor. Tamamen topluluk sıralamasında bile kontrat diskalifiye işlemleri için bir jüri adresi gerektiriyor.

## Sub Rosa nerede değerlendirilebilir?

[Sub Rosa'nın birincil deposu](https://github.com/karagozemin/Sub-Rosa), Drand tabanlı zaman kilitli şifreleme, Soroban üzerinde BLS doğrulama ve `ReceiptOnly` modunu belgeliyor. Bu mod özel girdileri birlikte açıp doğrulanabilir bir makbuz üretiyor; sıralama kararını ve varlık transferlerini uygulamaya bırakıyor. Bu mekanizma ZK ile aynı şey değil.

**Önerilen araştırma alanı:** jüri puan kartlarını istemcide şifreleyip `ReceiptOnly` üzerinden aynı anda açmak. Ödül kasası ve sıralama StelHacks'te kalabilir. Bu bir entegrasyon önerisidir; uyumluluk henüz doğrulanmış değildir.

Prototipte doğrulanacaklar: bir jürinin çok sayıda proje puanlamasının payload modeli; jüri/etkinlik/proje/rubrik bağlama ve tekrar kullanım koruması; girdi dahil edilmesi; makbuzun zincir kaydıyla doğrulanması; Drand açılım zamanı ile uzatılabilen takvimin eşleşmesi; açılım başarısızlığı; maliyet ve veri boyutu. Yalnızca frontend'e SDK eklemek mevcut kontrat doğrulamalarını değiştirmez. Bu revizyonda judging kontratlarına veya sealer'a entegrasyon yapılmadı.
