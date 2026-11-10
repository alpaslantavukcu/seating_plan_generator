# Web Uygulaması (GitHub Pages)

`docs/` klasörü, kurulum gerektirmeyen ve tamamen tarayıcıda çalışan statik bir web uygulamasıdır. Uygulama, sayfa kaydırmadan adım adım ilerleyen tek bir pencereden oluşur:

1. **Sınav ve öğrenciler** — sınav adı ve öğrenci listesi (Ninova'dan yapıştırın veya .txt / .xlsx / .csv yükleyin). Kayıtlı bir şablon da buradan yüklenir.
2. **Derslikler** — derslikleri seçin (seçim sırası doldurma sırasıdır), sırayı değiştirin, gerekirse kontenjanı düşürün.
3. **Yerleşim** — plan oluşturulur. Bir koltuğa dokunup başka bir koltuğa dokunarak (dokunmatik ekranlarda da çalışır, derslikler arasında da) veya sürükle-bırak ile yer değiştirin; çift tıklayarak ya da seçim çubuğundaki **Düzenle** ile öğrenciyi düzenleyin.
4. **İndir ve kaydet** — PDF / Excel çıktıları ve şablon (kod, bağlantı, .json).

Bir sonraki adım, mevcut adım tamamlanınca açılır; eksik olan şey alt çubukta yazar. Pencere telefonda tam ekran açılır. Türkçe/İngilizce dil desteği vardır ve hiçbir veri sunucuya gönderilmez.

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

**Şablon**, bir kurulumu yeniden kullanılabilir hale getirir. Şablonda derslik seçimi *ve doldurma sırası*, özel kontenjanlar, tohum ve koltuk kutusunda gösterilecek alanlar *ile sıraları* bulunur; 4. adımdaki **Öğrenci listesini ekle** kutusu işaretliyse (varsayılan) öğrenci numaraları ve adları da eklenir. Böylece aynı sınıfın dönem boyunca girdiği sınavlarda tek bir şablon yeterli olur; kutunun işaretini kaldırırsanız şablon yalnızca ayarları taşır ve farklı öğrenci listeleriyle kullanılabilir. Üç şekilde taşınır:

- **Şablonu indir (.json)** → saklanabilen, e-postayla gönderilebilen ve başka bir bilgisayarda 1. adımdaki **Şablon yükle** penceresine bırakılabilen okunabilir bir dosya. **Sınav adını taşıyan tek biçim budur.**
- **Kodu kopyala** → mesajla paylaşılabilen tek satırlık bir metin (yalnızca ayarlarla `SP1-ARYCBge5YDU` gibi kısa; öğrenci listesiyle 99 öğrenci için yaklaşık 750–1.500 karakter); **Şablon yükle** penceresindeki **Kod yapıştır** alanından uygulanır.
- **Bağlantıyı kopyala** → aynı kodun URL'e gömülmüş hali (`…/#t=ARYCBge5YDU`); bağlantıyı açmak ayarları uygular.

Kod ve bağlantı sınav adını bilerek dışarıda bırakır: şablon zaten başka bir sınavda kullanılmak içindir. Yalnızca ayarları taşıyan tipik bir kod 11 karakter, bağlantının tamamı ise 60 karakterin altında kalır. Öğrenci listesi kodun sonuna sıkıştırılarak (deflate) eklenir. Kodlama ikili (binary) olduğundan hem belirlenimlidir (aynı ayarlar her zaman aynı kodu verir; derslik sırası dâhil en küçük fark kodu değiştirir — öğrenci listeli kodları farklı tarayıcılar farklı sıkıştırabilir ama hepsi aynı listeye açılır) hem de kendini denetler: eksik veya yanlış yazılmış bir kod sessizce yanlış yorumlanmak yerine reddedilir. Öğrenci listeli bir kod veya bağlantı, paylaşıldığı her yere öğrenci numaralarını ve adlarını da götürür.

Şablon **oluşturulmuş planı asla içermez**. Bir şablon uygulandığında ayarlar değişir ve plan artık uyuşmadığı için temizlenir. Şablonda öğrenci listesi varsa yüklü listenin yerine geçer (farklı bir liste yüklüyse önce onay istenir); yoksa yüklü liste olduğu gibi kalır. Kod veya bağlantı yazdığınız sınav adına dokunmaz. Şablonlar yerel `docs/data/classrooms.json` dosyasına göre doğrulanır: karşı bilgisayarda bulunmayan derslikler atlanır, kontenjanlar gerçek derslik kapasitesine düşürülür ve durum uyarı olarak bildirilir.

**Oturum otomatik kaydı**, çalışılan oturumu — ayarlar, okunan öğrenci listesi ve sürükle-bırak ile yapılan yer değiştirmeler dâhil plan — tarayıcının `localStorage` alanına yazar; sayfa yenilense veya sekme yanlışlıkla kapansa bile hiçbir şey kaybolmaz. Geri dönüldüğünde pencere kalınan adımda açılır ve bir bilgi şeridi gösterilir. Hiçbir veri sunucuya gönderilmez, bilgisayarda kalır ve 4. adımdaki (veya bilgi şeridindeki) **Her şeyi temizle** düğmesiyle silinir. Koltuklarda elle değişiklik yapılmış bir planı sıfırlayacak bir ayar değişikliğinden önce onay istenir. Derslik yerleşimleri değişmişse kaydedilmiş plan otomatik olarak devre dışı bırakılır.

---

# Web app (GitHub Pages)

The `docs/` folder is a self-contained static site. The app is one window that moves through four steps, with no page scrolling:

1. **Exam & students** — exam name and student list (paste from Ninova or upload .txt / .xlsx / .csv). A saved template is loaded here too.
2. **Classrooms** — pick rooms (pick order is fill order), reorder them, lower a room's capacity if needed.
3. **Seating** — the plan is generated. Tap a seat and then another to swap them (works on touch screens and across rooms), or drag and drop; double-click a seat, or use **Edit** in the selection bar, to edit a student.
4. **Download & save** — the PDF / Excel outputs and the template (code, link, .json).

The next step opens once the current one is complete, and the bottom bar says what is missing. On a phone the window fills the screen.

To publish it:

1. Push this repository to GitHub.
2. In the repository: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**, then select branch **`main`** and folder **`/docs`**. Save.
3. The site appears at `https://<user>.github.io/<repo>/` within a minute or two.

Everything (parsing, seat assignment, PDF and Excel generation) runs client-side; student data never leaves the browser. Classroom layouts are pre-generated into `docs/data/classrooms.json`, and the Excel templates (plus `tutanak.pdf`) copied to `docs/templates/`, by [`tools/convert_templates.py`](tools/README.md) — re-run it after changing `configuration.json`, the Excel templates or the tutanak, and commit the result.

## Output parity with the CLI

The web app produces the same set of files as the CLI's output folder, with the same names and the same look:

- **Excel per room** (`{exam}_{room}.xlsx`, sheets `{room}_id_only` and `{room}_full`): the real template workbook, opened as a zip and filled cell by cell the way openpyxl does it. Styles, borders, the template's default font, column widths, row heights, print areas and printer settings are untouched.
- **PDF per room** (`{exam}_{room}.pdf`, 2 pages): drawn from the template geometry the way LibreOffice prints the CLI's workbook — same paper (A4, or Letter for templates that name no paper size, as LibreOffice defaults), margins, centring, fit-to-width scale, borders, Arial metrics (Liberation Sans), wrapping.
- **Merged PDFs** `…_All_Seating_Plans_Only_ID.pdf`, `…_All_Seating_Plans_Full.pdf` and `…_All_Seating_Plans_with_Tutanak_Printable.pdf` (tutanak page before every room), rooms in the CLI's sorted file-name order, assembled from the per-room PDFs with pdf-lib exactly as `merge_pdfs` does with pypdf.
- **Single-sheet room list** (`…_SingleSheetRoomList.xlsx` / `.pdf`): same workbook as the CLI's; the PDF is drawn as LibreOffice prints it — Letter landscape, 100 % scale flowing onto further pages, and the Caladea face LibreOffice uses for the CLI's unnamed font.
- **All outputs (ZIP)**: everything above in one archive, mirroring the CLI's output directory.
- The seat-cell fields keep their **tick order**, which is the CLI's `cell_params` order (e.g. seat number first, then ID, then name).

What is not shared: the random number generator. The same seed gives a different plan in the CLI (Python's `random.shuffle`) and in the browser (mulberry32); reproducibility holds within each tool.

To preview locally: `python3 -m http.server 8000 --directory docs` and open http://localhost:8000.

## Templates and session auto-save

**Templates** make a setup reusable. A template holds the classroom selection *and fill order*, custom capacities, seed and the seat-cell fields *with their order*, and — while **Include the student list** on step 4 is ticked, which is the default — the student numbers and names. One template then serves every exam a class takes during the semester; untick the box for a settings-only template that works with any student list. It can be moved three ways:

- **Download template (.json)** → a readable file to keep, email or drop into the **Load template** dialog (step 1) on any machine. This is the only form that also carries the **exam name**.
- **Copy code** → a single-line string to paste into a message (short with settings only, such as `SP1-ARYCBge5YDU`; with a student list roughly 750–1,500 characters for 99 students); the **Paste code** field in the **Load template** dialog applies it.
- **Copy link** → the same code in a URL hash (`…/#t=ARYCBge5YDU`); opening the link applies the settings.

The code and link leave the exam name out deliberately — a template is meant to be reused under a different exam anyway. A settings-only code is around 11 characters and the whole link under 60. A student list is deflate-compressed into a block at the end of the code (code format 3; settings-only codes keep format 2, so they are unchanged). The encoding is a packed binary layout, so it is deterministic (identical settings always give an identical code, and any difference — including room order — changes it; with a student list, two browsers may compress differently, but both codes open to the same list) and self-checking: a truncated or mistyped code is rejected rather than silently misread. A code or link with a student list carries student numbers and names wherever it is shared.

A template **never contains the generated plan**. Applying one replaces the settings and clears the plan (it no longer matches). If the template carries a student list, it replaces the loaded one (asking first when a different list is loaded); otherwise the loaded list is kept. A code or link leaves the exam name you typed alone. Templates are checked against the local `docs/data/classrooms.json`: classrooms that do not exist on the receiving machine are skipped and capacities are clamped to the real room capacity, with a warning.

> Maintainer note: `ROOM_TABLE` in [`docs/js/template.js`](docs/js/template.js) maps classrooms to the one-byte ids used inside codes. It is **append-only** — reordering or removing entries would decode already-shared codes into the wrong classrooms. A room missing from the list still works; it just makes the code slightly longer.

**Session auto-save** writes the working session — settings, parsed students and the plan including drag-drop swaps and inline edits — to the browser's `localStorage`, so a refresh or an accidental tab close loses nothing. On return the window opens at the step you left and a banner reports the restore. Nothing is uploaded; the data stays on that machine, and **Start fresh** in step 4 (or in the banner) erases it. A settings change that would reset a plan with hand-made seat changes asks first. The saved plan is discarded automatically if the classroom layouts changed underneath it.
