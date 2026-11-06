# Otomatik Oturma Planı Oluşturucu

Projenin amacı, oturma planı hazırlama işlemini **otomatikleştirmek** ve standartlaştırmaktır. Hazırlanan oturma planlarında öğrenci sadece imza atacağı için yoklama alma süreci de **hızlanacaktır**.

Program, verilen öğrenci listesini sınıflara otomatik olarak dağıtarak oturma planlarını Excel dosyası olarak oluşturur. Ardından PDF'e dönüştürerek Ninova'da paylaşılabilir hale getirir. Ek olarak tutanak sayfası eklenmiş halini de oluşturarak çıktı alınabilir hale getirir. Sınıf kapasiteleri ve oturma düzenleri önceden hazırlandığı için sadece öğrenci listesi ve sınıf seçimi yapılması gerekmektedir.

:construction: Şimdilik MacOS'ta sadece Excel dosyasını oluşturmaktadır, PDF'e dönüştürme işleminin elle yapılması gerekmektedir.

## 🌐 Web Uygulaması (GitHub Pages)

`docs/` klasörü, kurulum gerektirmeyen ve tamamen tarayıcıda çalışan statik bir web uygulamasıdır: Ninova'dan öğrenci listesini yapıştırın (veya .txt / .xlsx / .csv yükleyin), derslikleri seçin, planı oluşturun; ardından sürükle-bırak ile yer değiştirin, öğrencileri düzenleyin ve PDF / Excel çıktılarını indirin. Türkçe/İngilizce dil desteği vardır ve hiçbir veri sunucuya gönderilmez.

Yayınlamak için: GitHub deposunda **Settings → Pages → Source: "Deploy from a branch" → `main` / `/docs`** seçin. Site `https://<kullanıcı>.github.io/<depo>/` adresinde yayınlanır. Derslik yerleşimleri `tools/convert_templates.py` betiği ile `docs/data/classrooms.json` dosyasına önceden dönüştürülür ve şablonlar ile `tutanak.pdf` `docs/templates/` altına kopyalanır; `configuration.json`, şablonlar veya tutanak değişirse betiği yeniden çalıştırıp sonucu commit'leyin.

### Komut satırı çıktısıyla uyum

Web uygulaması, komut satırı aracının çıktı klasöründeki dosyaların aynısını, aynı adlarla ve aynı görünümle üretir:

- **Derslik başına Excel** (`{sınav}_{derslik}.xlsx`; `{derslik}_id_only` ve `{derslik}_full` sayfaları): gerçek şablon dosyası zip olarak açılıp openpyxl'in yaptığı gibi hücre hücre doldurulur. Stiller, kenarlıklar, şablonun varsayılan yazı tipi, sütun genişlikleri, satır yükseklikleri, yazdırma alanı ve yazıcı ayarları olduğu gibi kalır.
- **Derslik başına PDF** (2 sayfa): LibreOffice'in komut satırı çıktısını bastığı gibi çizilir — aynı kağıt (A4; kağıt boyutu tanımlı olmayan şablonlarda LibreOffice'in varsayılanı olan Letter), kenar boşlukları, ortalama, genişliğe sığdırma ölçeği, kenarlıklar, Arial metrikleri (Liberation Sans) ve satır kırma.
- **Birleşik PDF'ler** `…_All_Seating_Plans_Only_ID.pdf`, `…_All_Seating_Plans_Full.pdf` ve `…_All_Seating_Plans_with_Tutanak_Printable.pdf` (her dersliğin önünde tutanak sayfası); derslikler komut satırındaki gibi dosya adına göre sıralı.
- **Tek sayfa derslik listesi** (`…_SingleSheetRoomList.xlsx` / `.pdf`): aynı çalışma kitabı; PDF, LibreOffice'in bastığı gibi Letter yatay, %100 ölçek (satırlar sonraki sayfalara taşar) ve Caladea yazı tipiyle çizilir.
- **Tüm çıktılar (ZIP)**: yukarıdakilerin tamamı, komut satırının çıktı klasörünün birebir karşılığı.
- Koltuk kutusundaki alanlar **işaretleme sırasıyla** yazılır; bu, `input.json` içindeki `cell_params` sırasının karşılığıdır.

Paylaşılmayan tek şey rastgele sayı üreteci: aynı tohum komut satırında (`random.shuffle`) ve tarayıcıda (mulberry32) farklı plan verir; tekrarlanabilirlik her aracın kendi içinde geçerlidir.

### Şablonlar ve oturum kaydı

**Şablon**, bir kurulumu yeniden kullanılabilir hale getirir. Şablonda yalnızca ayarlar bulunur: derslik seçimi *ve doldurma sırası*, özel kontenjanlar, tohum ve koltuk kutusunda gösterilecek alanlar *ile sıraları*. Böylece aynı şablon farklı sınavlarda ve farklı öğrenci listeleriyle kullanılabilir. Üç şekilde taşınır:

- **Şablonu indir (.json)** → saklanabilen, e-postayla gönderilebilen ve başka bir bilgisayarda Şablon kutusuna bırakılabilen okunabilir bir dosya. **Sınav adını taşıyan tek biçim budur.**
- **Kodu kopyala** → mesajla paylaşılabilen `SP1-ARYCBge5YDU` gibi kısa, tek satırlık bir metin; **Kod yapıştır** ile uygulanır.
- **Bağlantıyı kopyala** → aynı kodun URL'e gömülmüş hali (`…/#t=ARYCBge5YDU`); bağlantıyı açmak ayarları uygular.

Kod ve bağlantı sınav adını bilerek dışarıda bırakır: sınav adı verinin büyük kısmını oluşturur ve şablon zaten başka bir sınavda kullanılmak içindir. Böylece tipik bir kod 11 karakter, bağlantının tamamı ise 60 karakterin altında kalır. Kodlama ikili (binary) ve sıkıştırılmış olduğundan hem belirlenimlidir (aynı ayarlar her zaman aynı kodu verir; derslik sırası dâhil en küçük fark kodu değiştirir) hem de kendini denetler: eksik veya yanlış yazılmış bir kod sessizce yanlış yorumlanmak yerine reddedilir.

Şablon **öğrenci listesini ve oluşturulmuş planı asla içermez**. Bir şablon uygulandığında ayarlar değişir ve plan artık uyuşmadığı için temizlenir; yüklü öğrenci listesi olduğu gibi kalır, kod veya bağlantı ise yazdığınız sınav adına da dokunmaz. Şablonlar yerel `docs/data/classrooms.json` dosyasına göre doğrulanır: karşı bilgisayarda bulunmayan derslikler atlanır, kontenjanlar gerçek derslik kapasitesine düşürülür ve durum uyarı olarak bildirilir.

**Oturum otomatik kaydı**, çalışılan oturumu — ayarlar, okunan öğrenci listesi ve sürükle-bırak ile yapılan yer değiştirmeler dâhil plan — tarayıcının `localStorage` alanına yazar; sayfa yenilense veya sekme yanlışlıkla kapansa bile hiçbir şey kaybolmaz. Geri dönüldüğünde bir bilgi şeridi gösterilir. Hiçbir veri sunucuya gönderilmez, bilgisayarda kalır ve **Her Şeyi Temizle** düğmesiyle silinir. Derslik yerleşimleri değişmişse kaydedilmiş plan otomatik olarak devre dışı bırakılır.

## Hızlı Başlangıç

**1-** Ninovada planını hazırlamak istediğiniz sınıfın "Öğrenciler" sekmesindeki listeyi `ogrenci-listesi.txt` dosyasına kopyalayın. Öğrenci kullanıcı adları kod tarafından kullanılmamaktadır ve dosyanın içinde yazıp yazmaması bir şeyi değiştirmez.

![Ninova Öğrenci Listesi](imgs/ninova-ogrenciler.png)

**2-** `input.json` dosyasını aşağıdaki gibi düzenleyin.

```
{
    "exam_name": "BLG 102E Arasınav Yerleşim Planı",        // Oturma planının başlığı
    "available_classrooms": ["Z-16", "Z-17"],               // Sınavın yapılacağı sınıflar
    "student_ids_file": "ogrenci-listesi.txt",
    "output_directory": "BLG102E-oturma-planları",
    ... 
}
```

**3-** `python seating_plan_generator.py` komutunu çalıştırarak planları **Excel** ve **PDF** dosyası olarak oluşturun. Örnek ekran görüntüsü (listelenen öğrenciler gerçek değildir):

![Örnek Çıktı](imgs/ornek-cikti.png)

### Streamlit GUI

Terminal yerine web arayüzü kullanmak isterseniz:

```bash
streamlit run app.py
```

GUI ile:
- Sınav adı, çıktı klasörü ve opsiyonel seed değeri girebilirsiniz
- Öğrenci listesini dosya yolu ile verebilir veya `.txt` dosyası yükleyebilirsiniz
- Sınıf seçebilir, isterseniz sınıf bazlı kapasiteyi özelleştirebilirsiniz
- Hücre alanlarını checkbox/multiselect ile seçebilirsiniz (`student_id`, `name`, `seat_number`)
- Tek tuşla tam akışı çalıştırabilirsiniz (Excel, PDF, merge PDF, single-sheet room list)
- Üretim tamamlanınca çıktıların `.zip` hali tarayıcıya otomatik indirme olarak gönderilir (fallback indirme butonu da vardır)

### Docker Compose ile Ubuntu Sunucuda Çalıştırma

Varsayılan kullanıcı ile çalıştırma akışı:

```bash
mkdir -p ~/seating-plan
cd ~/seating-plan
git clone <repo-url> app
cd app
mkdir -p runtime/uploads runtime/output
docker compose up -d --build
```

Arayüz: `http://<server-ip>:8501`

SSH tunnel ile yerelden erişim:

```bash
ssh -L 8501:localhost:8501 <user>@<server-ip>
```

sonra tarayıcıdan `http://localhost:8501`.

Notlar:
- `runtime/output` host üzerinde kalıcıdır (container silinse bile çıktılar korunur)
- `Templates` klasörü container içine mount edilir, template dosyaları hostta düzenlenebilir
- ZIP dosyaları kullanıcı tarayıcısına otomatik iner; istenirse hosttan da alınabilir:

```bash
scp <user>@<server-ip>:~/seating-plan/app/runtime/output/<zip-dosyasi>.zip .
```

## Kurulum

Python 3.8 ile test edilmiştir. Gerekli paketleri yüklemek için:

```bash
pip install -r requirements.txt
```

PDF'e dönüştürmek için Windows'ta **MS Office**, Linux'ta ise **LibreOffice** kurulu olmalıdır.  

## Detaylar

### Komut Satırı Arayüzü

```bash
python seating_plan_generator.py -c <config_file> -i <input_file>
```

Argümanlar:
- `-c, --config`: Yapılandırma JSON dosyasının yolu (Varsayılan: configuration.json)
- `-i, --input`: Girdi JSON dosyasının yolu (Varsayılan: input.json)
- `--overwrite-output`: Çıktı klasörü varsa otomatik üzerine yazar

### Dosya Formatları

#### 1. `configuration.json` dosyası 
```json
{
    "classroom-capacities": {
        "Z-16": 70,
        "Z-17": 49,
        "Z-18": 54
    },
    "seat-mappings": {
        "Z-16": {
            "1": "C4",
            "2": "D4",
            "3": "E4"
        },
        "Z-17": {
            "1": "C4",
            "2": "D4",
            "3": "E4"
        }
    }
}
```

- `classroom-capacities`: Sınıf isimlerini ve kapasitelerini belirten alan
- `seat-mappings`: Template'e göre her sınıf için oturma düzenini belirten alan

#### 2. `input.json` dosyası

`input.json` dosyası iki formatta oluşturulabilir.
Format 1'de öğrenci dağılımları sınıfların tam kapasitelerine göre yapılır.
Format 2'de öğrenci dağılımları sınıf için belirtilen kapasitelere göre yapılır.

Format 1
```json
{
    "exam_name": "BLG 102E Arasınav Yerleşim Planı",
    "available_classrooms": ["Z-16", "Z-17"],
    "student_ids_file": "ogrenci-listesi.txt",
    "output_directory": "BLG102E-oturma-planları",
    "cell_params": ["student_id", "name", "seat_number"]
}
```

Format 2
```json
{
    "exam_name": "BLG 102E Arasınav Yerleşim Planı",
    "available_classrooms": {"Z-16": 62, "Z-17": 38},
    "student_ids_file": "ogrenci-listesi.txt",
    "output_directory": "BLG102E-oturma-planları",
    "cell_params": ["student_id", "name", "seat_number"]
}
```
- `exam_name`: Oturma planının başlığı
- `available_classrooms`: Kullanılacak sınıfların listesi (configuration.json'da belirtilmiş olmalıdır)
- - Liste veya sözlük formatında olabilir
  - Liste formatında: Sınıf isimleri
  - Sözlük formatında: Sınıf isimleri ve kapasiteleri. Kapasite sayılarının toplamı öğrenci sayısından az olmamalıdır. Değiştirilmiş kapasite değerleri `configuration.json` dosyasındaki sınıf kapasitelerinden yüksek olmamalıdır.
- `student_ids_file`: Öğrenci ID'lerini, adlarını ve mail adreslerini içeren metin dosyası
- `output_directory`: Çıktı dosyalarının kaydedileceği dizin
- `cell_params`: Oluşan pdf de hangi bilgilerin görünmesini istediğinizi belirtin. 

#### 3. Öğrenci ID'leri Dosyası (`input.json`'da `student_ids_file` alanı)
```text
150220722   Ahmet Yılmaz (yilmaza22)
150220724   Ayşe Kaya (kayaa22)
...
```
- Her satır, öğrenci ID, adı ve kısaltmasını içerir
- ID'ler ve adlar, tab veya boşluklarla ayrılır

#### 4. Excel Template Dosyaları
- Her sınıf için `Template_<sınıf-isim>.xlsx` formatında bir template dosyası olmalıdır. 
- Örnek: `Template_Z-16.xlsx`, `Template_Z-17.xlsx`
- Template dosyaları, sınıf düzenini içermelidir

## Programın Akışı

- Program, belirtilen configuration, input ve öğrenci listesi dosyalarını okur.
- Öğrenciler, her sınıf için belirtilen oturma düzenine göre Excel hücrelerine rastgele atanır.
- Çıktı dosyaları, `{exam_name}_{room}.xlsx` desenini kullanarak adlandırılır.

## Hata İşleme

Program, çeşitli hata durumlarını işler:
- Configuration/input dosyaları eksik veya geçersiz
- Girdi dosyasında bilinmeyen sınıflar
- Sınıflar için eksik oturma düzeni
- Boş oturma düzeni
- Yetersiz toplam kapasite
- Eksik template dosyaları
- Dosya izin sorunları

## Notlar

- Öğrenciler rastgele dağıtılır
- Template dosyalarının tam olarak `Template_ROOM.xlsx` olarak adlandırılması gerekir
- Uzun adlar, ilk ad + orta ilkler + soyad olarak yeniden biçimlendirilir
- Çıktı dosyaları, `{prefix}_{room}.xlsx` kalıbını kullanarak adlandırılır
- Çıktı dizinleri, eğer yoksa otomatik olarak oluşturulur

## Katkıda Bulunma

Eksik gördüğünüz veya daha iyi hale getirilebilecek bir şey varsa, lütfen PR açın. Lütfen yazım hataları, basit kod düzenlemeleri gibi şeyler için PR açmayın!

## Lisans 

Yayımlanan kodları izin almadan, kaynak göstermeden, özgürce okuyabilir, başkalarına okutabilir, kopyalayabilir, dağıtabilir, yayabilir, eleştirebilir, kendi etik ilkeleriniz doğrultusunda, çalabilir, talan edebilir, kısmen ya da tamamen sahiplenebilir, satabilir, değiştirerek ya da değiştirmeden tekrar yayımlayabilir, kötüleyebilir, lanetleyebilirsiniz.
