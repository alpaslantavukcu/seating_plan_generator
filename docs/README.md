# Web Uygulaması (GitHub Pages)

`docs/` klasörü, kurulum gerektirmeyen ve tamamen tarayıcıda çalışan statik bir web uygulamasıdır: Ninova'dan öğrenci listesini yapıştırın (veya .txt / .xlsx / .csv yükleyin), derslikleri seçin, planı oluşturun; ardından sürükle-bırak ile yer değiştirin, öğrencileri düzenleyin ve PDF / Excel çıktılarını indirin. Türkçe/İngilizce dil desteği vardır ve hiçbir veri sunucuya gönderilmez.

Yayınlamak için: GitHub deposunda **Settings → Pages → Source: "Deploy from a branch" → `main` / `/docs`** seçin. Site `https://<kullanıcı>.github.io/<depo>/` adresinde yayınlanır. Derslik yerleşimleri `tools/convert_templates.py` betiği ile `docs/data/classrooms.json` dosyasına önceden dönüştürülür ve şablonlar ile `tutanak.pdf` `docs/templates/` altına kopyalanır; `configuration.json`, şablonlar veya tutanak değişirse betiği yeniden çalıştırıp sonucu commit'leyin.

## Komut satırı çıktısıyla uyum

Web uygulaması, komut satırı aracının çıktı klasöründeki dosyaların aynısını, aynı adlarla ve aynı görünümle üretir:

- **Derslik başına Excel** (`{sınav}_{derslik}.xlsx`; `{derslik}_id_only` ve `{derslik}_full` sayfaları): gerçek şablon dosyası zip olarak açılıp openpyxl'in yaptığı gibi hücre hücre doldurulur. Stiller, kenarlıklar, şablonun varsayılan yazı tipi, sütun genişlikleri, satır yükseklikleri, yazdırma alanı ve yazıcı ayarları olduğu gibi kalır.
- **Derslik başına PDF** (2 sayfa): LibreOffice'in komut satırı çıktısını bastığı gibi çizilir — aynı kağıt (A4; kağıt boyutu tanımlı olmayan şablonlarda LibreOffice'in varsayılanı olan Letter), kenar boşlukları, ortalama, genişliğe sığdırma ölçeği, kenarlıklar, Arial metrikleri (Liberation Sans) ve satır kırma.
- **Birleşik PDF'ler** `…_All_Seating_Plans_Only_ID.pdf`, `…_All_Seating_Plans_Full.pdf` ve `…_All_Seating_Plans_with_Tutanak_Printable.pdf` (her dersliğin önünde tutanak sayfası); derslikler komut satırındaki gibi dosya adına göre sıralı.
- **Tek sayfa derslik listesi** (`…_SingleSheetRoomList.xlsx` / `.pdf`): aynı çalışma kitabı; PDF, LibreOffice'in bastığı gibi Letter yatay, %100 ölçek (satırlar sonraki sayfalara taşar) ve Caladea yazı tipiyle çizilir.
- **Tüm çıktılar (ZIP)**: yukarıdakilerin tamamı, komut satırının çıktı klasörünün birebir karşılığı.
- Koltuk kutusundaki alanlar **işaretleme sırasıyla** yazılır; bu, `input.json` içindeki `cell_params` sırasının karşılığıdır.

Paylaşılmayan tek şey rastgele sayı üreteci: aynı tohum komut satırında (`random.shuffle`) ve tarayıcıda (mulberry32) farklı plan verir; tekrarlanabilirlik her aracın kendi içinde geçerlidir.

## Şablonlar ve oturum kaydı

**Şablon**, bir kurulumu yeniden kullanılabilir hale getirir. Şablonda yalnızca ayarlar bulunur: derslik seçimi *ve doldurma sırası*, özel kontenjanlar, tohum ve koltuk kutusunda gösterilecek alanlar *ile sıraları*. Böylece aynı şablon farklı sınavlarda ve farklı öğrenci listeleriyle kullanılabilir. Üç şekilde taşınır:

- **Şablonu indir (.json)** → saklanabilen, e-postayla gönderilebilen ve başka bir bilgisayarda Şablon kutusuna bırakılabilen okunabilir bir dosya. **Sınav adını taşıyan tek biçim budur.**
- **Kodu kopyala** → mesajla paylaşılabilen `SP1-ARYCBge5YDU` gibi kısa, tek satırlık bir metin; **Kod yapıştır** ile uygulanır.
- **Bağlantıyı kopyala** → aynı kodun URL'e gömülmüş hali (`…/#t=ARYCBge5YDU`); bağlantıyı açmak ayarları uygular.

Kod ve bağlantı sınav adını bilerek dışarıda bırakır: sınav adı verinin büyük kısmını oluşturur ve şablon zaten başka bir sınavda kullanılmak içindir. Böylece tipik bir kod 11 karakter, bağlantının tamamı ise 60 karakterin altında kalır. Kodlama ikili (binary) ve sıkıştırılmış olduğundan hem belirlenimlidir (aynı ayarlar her zaman aynı kodu verir; derslik sırası dâhil en küçük fark kodu değiştirir) hem de kendini denetler: eksik veya yanlış yazılmış bir kod sessizce yanlış yorumlanmak yerine reddedilir.

Şablon **öğrenci listesini ve oluşturulmuş planı asla içermez**. Bir şablon uygulandığında ayarlar değişir ve plan artık uyuşmadığı için temizlenir; yüklü öğrenci listesi olduğu gibi kalır, kod veya bağlantı ise yazdığınız sınav adına da dokunmaz. Şablonlar yerel `docs/data/classrooms.json` dosyasına göre doğrulanır: karşı bilgisayarda bulunmayan derslikler atlanır, kontenjanlar gerçek derslik kapasitesine düşürülür ve durum uyarı olarak bildirilir.

**Oturum otomatik kaydı**, çalışılan oturumu — ayarlar, okunan öğrenci listesi ve sürükle-bırak ile yapılan yer değiştirmeler dâhil plan — tarayıcının `localStorage` alanına yazar; sayfa yenilense veya sekme yanlışlıkla kapansa bile hiçbir şey kaybolmaz. Geri dönüldüğünde bir bilgi şeridi gösterilir. Hiçbir veri sunucuya gönderilmez, bilgisayarda kalır ve **Her Şeyi Temizle** düğmesiyle silinir. Derslik yerleşimleri değişmişse kaydedilmiş plan otomatik olarak devre dışı bırakılır.
