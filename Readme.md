# Otomatik Oturma Planı Oluşturucu

Projenin amacı, oturma planı hazırlama işlemini otomatikleştirmek ve standartlaştırmaktır. Hazırlanan oturma planlarında öğrenci sadece imza atacağı için yoklama alma süreci de **hızlanacaktır**.

Program, verilen öğrenci listesini sınıflara otomatik olarak dağıtarak oturma planlarını excel dosyası olarak oluşturur. Sınıf kapasiteleri ve oturma düzenleri önceden hazırlandığı için sadece öğrenci listesi ve sınıf seçimi yapılması gerekmektedir.

## Hızlı Başlangıç

**1-** Ninovada planını hazırlamak istediğiniz sınıfın "Öğrenciler" sekmesindeki listeyi `students.txt` dosyasına kopyalayın.

![Ninova Öğrenci Listesi](imgs/ninova-ogrenciler.png)

**2-** "input.json" dosyasında, hangi sınıfların kullanılacağını belirtin.

```
{
    "available_classrooms": ["Z-16", "Z-17"],       // Kullanacağınız sınıflar
    "student_ids_file": "students.txt",             // Öğrenci listesi
    "output_prefix": "BLG102 Midterm Seating Plan"  // Sınav İsmi
}
```

**3-** `python seating_plan_generator.py` komutunu çalıştırarak planları excel dosyası olarak oluşturun. Örnek ekran görüntüsü (listelenen öğrenciler gerçek değildir):

![Örnek Çıktı](imgs/ornek-cikti.png)

TODO: **Bu resim güncellenecek!**

## Ön Gereksinimler

- Python 3.7 veya üzeri
- Gerekli paketler için: `pip install openpyxl`

## Detaylar

### Komut Satırı Arayüzü

```bash
python seating_plan_generator.py -c <config_file> -i <input_file>
```

Argümanlar:
- `-c, --config`: Yapılandırma JSON dosyasının yolu (Varsayılan: configuration.json)
- `-i, --input`: Girdi JSON dosyasının yolu (Varsayılan: input.json)

### Dosya Formatları

#### 1. "Configuration" dosyası (configuration.json)
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

- `classroom-capacities`: Sınıf isimlerini ve kapasitelerini belirten nesne
- `seat-mappings`: Template'e göre her sınıf için oturma düzenini belirten nesne

#### 2. "Input" dosyası (input.json)
```json
{
    "available_classrooms": ["Z-16", "Z-17"],
    "student_ids_file": "data/student_ids.txt",
    "output_prefix": "output/seating_plan"
}
```
- `available_classrooms`: Kullanılacak sınıfların listesi (configuration.json'da belirtilmiş olmalıdır)
- `student_ids_file`: Öğrenci ID'lerini ve adlarını içeren metin dosyasının yolu
- `output_prefix`: Çıktı dosyalarının ön eki - her sınıf için bir dosya oluşturulacak (örnek: "seating_plan_Z-16.xlsx", "seating_plan_Z-17.xlsx")

#### 3. Öğrenci ID'leri Dosyası (input.json'da belirtilmiş olmalıdır)
```text
150220722   Ahmet Yılmaz (yilmaza22)
150220724   Ayşe Kaya (kayaa22)
...
```
- Her satır, öğrenci ID, adı ve kısaltmasını içerir
- ID'ler ve adlar, tab veya boşluklarla ayrılır

#### 4. Excel Template Dosyaları
- Her sınıf için bir template dosyası olmalıdır
- Örnek: `Template_Z-16.xlsx`, `Template_Z-17.xlsx`
- Template dosyaları, sınıf düzenini içermelidir

## Programın Akışı

- Program, belirtilen configuration, input ve öğrenci listesi dosyalarını okur.
- Öğrenciler, her sınıf için belirtilen oturma düzenine göre Excel hücrelerine rastgele atanır.
- Çıktı dosyaları, `{prefix}_{room}.xlsx` desenini kullanarak adlandırılır.

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
- Çıktı dosyaları, `{prefix}_{room}.xlsx` desenini kullanarak adlandırılır
- Çıktı dizinleri, eğer yoksa otomatik olarak oluşturulur

## Katkıda Bulunma

Eksik gördüğünüz veya daha iyi hale getirilebilecek bir şey varsa, lütfen PR açın. Lütfen yazım hataları, basit kod düzenlemeleri gibi şeyler için PR açmayın!

## Lisans 

Yayımlanan kodları izin almadan, kaynak göstermeden, özgürce okuyabilir, başkalarına okutabilir, kopyalayabilir, dağıtabilir, yayabilir, eleştirebilir, kendi etik ilkeleriniz doğrultusunda, çalabilir, talan edebilir, kısmen ya da tamamen sahiplenebilir, satabilir, değiştirerek ya da değiştirmeden tekrar yayımlayabilir, kötüleyebilir, lanetleyebilirsiniz.