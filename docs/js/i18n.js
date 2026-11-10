// TR/EN string tables. Elements opt in with data-i18n / data-i18n-placeholder /
// data-i18n-title / data-i18n-aria attributes; applyLang() walks the DOM after
// every language switch. Dynamic strings use t(key, params) and are redrawn by
// the render pass that follows the switch.

import { getState, set } from './store.js';

export const STRINGS = {
  tr: {
    appTitle: 'Sınav Yerleşim Planı',
    langLabel: 'EN',
    close: 'Kapat',
    back: 'Geri',
    next: 'İleri',
    nextGenerate: 'Planı oluştur',
    nextExport: 'İndirmeye geç',
    stepsLabel: 'Adımlar',
    stepExam: 'Sınav ve öğrenciler',
    stepRooms: 'Derslikler',
    stepPlan: 'Yerleşim',
    stepExport: 'İndir ve kaydet',
    stepOf: 'Adım {n}/4 · {name}',

    // Step 1
    s1Title: 'Sınav ve öğrenciler',
    s1Sub: 'Sınav adını yazın ve öğrenci listesini ekleyin.',
    examName: 'Sınav adı',
    examNamePh: 'örn. BLG102E Arasınav',
    studentsTitle: 'Öğrenci listesi',
    pasteTab: 'Yapıştır',
    fileTab: 'Dosya yükle',
    pastePh: 'Ninova ders sayfası → Öğrenciler listesini kopyalayıp buraya yapıştırın.\nHer satır: numara, ad soyad (kullanıcı adı)',
    fileHint: 'Dosya seçin veya buraya bırakın',
    fileTypes: '.txt (Ninova) · .xlsx · .csv',
    xlsxColsHint: 'Excel / CSV: ilk sütun öğrenci no, ikinci sütun ad soyad. Başlık satırı otomatik atlanır.',
    privacyNote: 'Tüm işlem tarayıcınızda yapılır — hiçbir veri sunucuya gönderilmez.',
    previewTitle: 'Okunan öğrenciler',
    clearList: 'Temizle',
    noStudents: 'Henüz öğrenci listesi eklenmedi',
    parseError: 'Liste okunamadı — biçimi kontrol edin',
    parsedCount: '{n} öğrenci okundu',
    fileLoaded: '{name} yüklendi',
    tplLoadOpen: 'Şablon yükle',

    // Step 2
    s2Title: 'Derslikler',
    roomsHint: 'Seçim sırası doldurma sırasıdır — önce seçilen derslik önce dolar.',
    seatsN: '{n} koltuk',
    fillOrder: 'Doldurma sırası',
    noRoomsYet: 'Soldan bir veya daha fazla derslik seçin',
    capEditHint: 'Bir dersliğe daha az öğrenci yerleştirmek için kontenjanını düşürün.',
    capSummary: '{n} öğrenci · {cap} koltuk',
    capFree: '{free} koltuk boş kalacak',
    capFull: 'Tüm koltuklar dolacak',
    capMissing: '{missing} koltuk eksik',
    capOf: '/ {n}',
    capacityFor: '{room} kontenjanı',
    moveUp: 'Yukarı taşı',
    moveDown: 'Aşağı taşı',
    removeRoom: 'Kaldır',

    // Step 3
    planTitle: 'Yerleşim planı',
    cellFields: 'Koltukta gösterilecekler',
    cellFieldsHint: 'İşaretleme sırası, koltuk kutusundaki satır sırasıdır',
    fieldId: 'Öğrenci No',
    fieldName: 'Ad Soyad',
    fieldSeat: 'Sıra No',
    seedShort: 'Tohum',
    seedHint: 'Aynı tohum + aynı liste = aynı plan. Bir sayı yazıp Enter’a basın; boş bırakılırsa her karıştırmada yeni bir tohum seçilir.',
    regenerate: 'Yeniden karıştır',
    emptySeat: 'Boş',
    unassignedDesk: 'Kullanılmıyor',
    seatNo: 'Sıra {n}',
    selHint: 'Bir koltuğa dokunun, sonra yer değiştirmek için başka bir koltuğa dokunun. Masaüstünde sürükleyip bırakabilir, düzenlemek için çift tıklayabilirsiniz.',
    selPicked: '<b>{room} · Sıra {seat}</b> — {name}. Yer değiştirmek için başka bir koltuğa dokunun; başka bir dersliğin sekmesine de geçebilirsiniz.',
    selPickedEmpty: '<b>{room} · Sıra {seat}</b> boş. Buraya taşımak için bir öğrenciye dokunun.',
    selEdit: 'Düzenle',
    selAdd: 'Öğrenci ekle',
    editTitle: '{room} · Sıra {seat}',
    editId: 'Öğrenci No',
    editName: 'Ad Soyad',
    editSave: 'Kaydet',
    editCancel: 'Vazgeç',
    editRemove: 'Koltuğu boşalt',
    placedCount: '{placed} öğrenci yerleştirildi',
    unplaced: '{n} öğrenci yerleştirilmedi',

    // Step 4
    s4Title: 'Plan hazır',
    readySummary: '{exam} · {rooms} derslik · {n} öğrenci',
    zipAll: 'Tüm çıktılar (ZIP)',
    zipHint: 'ZIP, komut satırı aracının çıktı klasörüyle aynı dosyaları içerir: her derslik için Excel ve PDF, üç birleşik PDF ve tek sayfa derslik listesi.',
    expRoomTitle: 'Tek derslik',
    expAllTitle: 'Tüm derslikler · PDF',
    expAllDesc: 'Bütün derslikler tek dosyada',
    expOnlyId: 'Yalnız numara',
    expFull: 'Tam bilgi',
    expTutanak: 'Tutanaklı',
    expListTitle: 'Tek sayfa derslik listesi',
    expListDesc: 'Hangi öğrencinin hangi derslikte olduğu',
    printPage: 'Yazdır',
    usedSeed: 'Kullanılan tohum: {seed}',
    saveTitle: 'Şablonu kaydet',
    templateHint: 'Şablon derslikleri ve sırasını, kontenjanları, tohumu ve koltuk alanlarını taşır; isterseniz öğrenci listesini de. Aynı dönemde aynı sınıf için tekrar kullanın.',
    tplIncludeStudents: 'Öğrenci listesini ekle ({n} öğrenci)',
    tplStudentsHint: 'Kod ve bağlantı uzar; öğrenci numaraları ve adları, paylaştığınız her yere gider.',
    charCount: '{n} karakter',
    tplCodeLabel: 'Kod',
    tplLinkLabel: 'Bağlantı',
    copy: 'Kopyala',
    tplSave: 'Şablonu indir (.json)',
    tplJsonHint: 'Kod ve bağlantı sınav adını taşımaz — sınav adı yalnızca .json dosyasında bulunur.',
    sessionHint: 'Ayarlar, öğrenci listesi ve plan yalnızca bu tarayıcıda saklanır. Ortak kullanılan bir bilgisayardaysanız işiniz bitince temizleyin.',
    startFresh: 'Her şeyi temizle',
    startFreshConfirm: 'Kaydedilmiş oturum silinecek: ayarlar, öğrenci listesi ve plan. Devam edilsin mi?',
    startFreshOk: 'Her şeyi sil',

    // Step gates (shown in the bottom bar while Next is disabled)
    needName: 'Sınav adını yazın',
    needStudents: 'Öğrenci listesini ekleyin',
    needRooms: 'En az bir derslik seçin',
    needCapacity: '{n} öğrenci için {cap} koltuk var — derslik ekleyin',
    needFields: 'Koltukta gösterilecek en az bir alan seçin',

    // Template loading
    tplLoadTitle: 'Şablon yükle',
    tplLoadHint: 'Kaydedilmiş ayarları uygulayın. Şablonda öğrenci listesi varsa o da yüklenir; yoksa yüklü liste korunur.',
    tplFileHint: 'Şablon dosyasını (.json) seçin veya buraya bırakın',
    or: 'veya',
    tplPasteCode: 'Kod yapıştır',
    tplPastePh: 'SP1-… ile başlayan kod',
    tplApply: 'Uygula',
    tplLoaded: 'Şablon uygulandı — öğrenci listesi korundu',
    tplLoadedCode: 'Ayarlar uygulandı — sınav adı ve öğrenci listesi korundu',
    tplLoadedStudents: 'Şablon uygulandı — {n} öğrenci yüklendi',
    tplLoadedCodeStudents: 'Ayarlar ve {n} öğrenci yüklendi — sınav adı korundu',
    tplReplaceStudents: 'Şablondaki {n} öğrenci, şu an yüklü olan {m} öğrencinin yerine geçecek. Devam edilsin mi?',
    tplReplaceOk: 'Listeyi değiştir',
    editsLostNote: 'Koltuklarda elle yaptığınız değişiklikler de kaybolur.',
    tplCopied: 'Panoya kopyalandı',
    tplCopyFailed: 'Kopyalanamadı — seçili metni elle kopyalayın',
    tplInvalid: 'Geçersiz şablon — dosyayı veya kodu kontrol edin',
    tplRoomsDropped: 'bu derslikler burada yok, atlandı: {rooms}',
    tplCapsClamped: '{n} kontenjan derslik kapasitesine düşürüldü',

    // Confirmations & session
    confirmDropPlan: 'Bu değişiklik planı sıfırlar; koltuklarda elle yaptığınız değişiklikler kaybolur. Devam edilsin mi?',
    confirmDropPlanOk: 'Planı sıfırla',
    confirmReshuffle: 'Yeniden karıştırınca koltuklarda elle yaptığınız değişiklikler kaybolur. Devam edilsin mi?',
    confirmReshuffleOk: 'Yeniden karıştır',
    sessionRestored: 'Önceki oturum geri yüklendi.',
    storageFull: 'Tarayıcı deposu dolu — oturum otomatik kaydedilemiyor',
  },
  en: {
    appTitle: 'Exam Seating Plan',
    langLabel: 'TR',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    nextGenerate: 'Create plan',
    nextExport: 'Go to downloads',
    stepsLabel: 'Steps',
    stepExam: 'Exam & students',
    stepRooms: 'Classrooms',
    stepPlan: 'Seating',
    stepExport: 'Download & save',
    stepOf: 'Step {n} of 4 · {name}',

    s1Title: 'Exam & students',
    s1Sub: 'Name the exam and add the student list.',
    examName: 'Exam name',
    examNamePh: 'e.g. BLG102E Midterm',
    studentsTitle: 'Student list',
    pasteTab: 'Paste',
    fileTab: 'Upload file',
    pastePh: 'Copy the student list from the Ninova course page → Students tab and paste it here.\nEach line: ID, full name (username)',
    fileHint: 'Choose a file or drop it here',
    fileTypes: '.txt (Ninova) · .xlsx · .csv',
    xlsxColsHint: 'Excel / CSV: first column student ID, second column full name. A header row is skipped automatically.',
    privacyNote: 'Everything runs in your browser — no data is sent to any server.',
    previewTitle: 'Students read',
    clearList: 'Clear',
    noStudents: 'No student list added yet',
    parseError: 'Could not read the list — check the format',
    parsedCount: '{n} students read',
    fileLoaded: '{name} loaded',
    tplLoadOpen: 'Load template',

    s2Title: 'Classrooms',
    roomsHint: 'Selection order is fill order — the first room you pick fills first.',
    seatsN: '{n} seats',
    fillOrder: 'Fill order',
    noRoomsYet: 'Pick one or more classrooms on the left',
    capEditHint: 'Lower a room’s capacity to seat fewer students in it.',
    capSummary: '{n} students · {cap} seats',
    capFree: '{free} seats will stay empty',
    capFull: 'Every seat will be taken',
    capMissing: '{missing} seats short',
    capOf: '/ {n}',
    capacityFor: 'Capacity of {room}',
    moveUp: 'Move up',
    moveDown: 'Move down',
    removeRoom: 'Remove',

    planTitle: 'Seating plan',
    cellFields: 'Shown inside each seat',
    cellFieldsHint: 'Tick order is the line order inside each seat',
    fieldId: 'Student ID',
    fieldName: 'Full name',
    fieldSeat: 'Seat no',
    seedShort: 'Seed',
    seedHint: 'Same seed + same list = same plan. Type a number and press Enter; leave it empty to get a new seed on every reshuffle.',
    regenerate: 'Reshuffle',
    emptySeat: 'Empty',
    unassignedDesk: 'Not in use',
    seatNo: 'Seat {n}',
    selHint: 'Tap a seat, then tap another seat to swap them. On a computer you can also drag and drop, or double-click to edit.',
    selPicked: '<b>{room} · Seat {seat}</b> — {name}. Tap another seat to swap; you can switch to another room’s tab too.',
    selPickedEmpty: '<b>{room} · Seat {seat}</b> is empty. Tap a student to move them here.',
    selEdit: 'Edit',
    selAdd: 'Add student',
    editTitle: '{room} · Seat {seat}',
    editId: 'Student ID',
    editName: 'Full name',
    editSave: 'Save',
    editCancel: 'Cancel',
    editRemove: 'Clear seat',
    placedCount: '{placed} students seated',
    unplaced: '{n} students have no seat',

    s4Title: 'Your plan is ready',
    readySummary: '{exam} · {rooms} rooms · {n} students',
    zipAll: 'All outputs (ZIP)',
    zipHint: 'The ZIP holds the same files as the command-line tool’s output folder: an Excel and a PDF per room, the three merged PDFs and the single-sheet room list.',
    expRoomTitle: 'One room',
    expAllTitle: 'All rooms · PDF',
    expAllDesc: 'Every room in one file',
    expOnlyId: 'IDs only',
    expFull: 'Full info',
    expTutanak: 'With tutanak',
    expListTitle: 'Single-sheet room list',
    expListDesc: 'Which student sits in which room',
    printPage: 'Print',
    usedSeed: 'Seed used: {seed}',
    saveTitle: 'Save as template',
    templateHint: 'A template carries the classrooms and their order, capacities, seed and seat fields, and the student list if you want. Reuse it for the same class all semester.',
    tplIncludeStudents: 'Include the student list ({n} students)',
    tplStudentsHint: 'The code and link get longer, and student numbers and names go wherever you share them.',
    charCount: '{n} characters',
    tplCodeLabel: 'Code',
    tplLinkLabel: 'Link',
    copy: 'Copy',
    tplSave: 'Download template (.json)',
    tplJsonHint: 'The code and link leave out the exam name — only the .json file carries it.',
    sessionHint: 'Settings, student list and plan are stored in this browser only. On a shared computer, clear them when you are done.',
    startFresh: 'Start fresh',
    startFreshConfirm: 'This clears the saved session: settings, student list and plan. Continue?',
    startFreshOk: 'Clear everything',

    needName: 'Type the exam name',
    needStudents: 'Add the student list',
    needRooms: 'Pick at least one classroom',
    needCapacity: '{cap} seats for {n} students — add a classroom',
    needFields: 'Pick at least one field to show in the seats',

    tplLoadTitle: 'Load template',
    tplLoadHint: 'Apply saved settings. If the template has a student list, it is loaded too; otherwise the current list is kept.',
    tplFileHint: 'Choose a template file (.json) or drop it here',
    or: 'or',
    tplPasteCode: 'Paste code',
    tplPastePh: 'Code starting with SP1-…',
    tplApply: 'Apply',
    tplLoaded: 'Template applied — student list kept',
    tplLoadedCode: 'Settings applied — exam name and student list kept',
    tplLoadedStudents: 'Template applied — {n} students loaded',
    tplLoadedCodeStudents: 'Settings and {n} students loaded — exam name kept',
    tplReplaceStudents: 'The template’s {n} students will replace the {m} students loaded now. Continue?',
    tplReplaceOk: 'Replace list',
    editsLostNote: 'The seat changes you made by hand are lost too.',
    tplCopied: 'Copied to clipboard',
    tplCopyFailed: 'Could not copy — copy the selected text manually',
    tplInvalid: 'Invalid template — check the file or code',
    tplRoomsDropped: 'these classrooms do not exist here and were skipped: {rooms}',
    tplCapsClamped: '{n} capacity value(s) reduced to the room capacity',

    confirmDropPlan: 'This change resets the plan, and the seat changes you made by hand are lost. Continue?',
    confirmDropPlanOk: 'Reset plan',
    confirmReshuffle: 'Reshuffling loses the seat changes you made by hand. Continue?',
    confirmReshuffleOk: 'Reshuffle',
    sessionRestored: 'Previous session restored.',
    storageFull: 'Browser storage is full — the session cannot be auto-saved',
  },
};

export function t(key, params = {}) {
  const lang = getState().lang;
  let s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.tr[key] || key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

// Escape user data before it goes into a string that is set as innerHTML.
export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function applyLang() {
  const lang = getState().lang;
  document.documentElement.lang = lang;
  document.title = t('appTitle');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
}

export function toggleLang() {
  const next = getState().lang === 'tr' ? 'en' : 'tr';
  try {
    localStorage.setItem('sp-lang', next);
  } catch (err) {
    console.error(err);
  }
  set({ lang: next }); // re-renders the dynamic text
  applyLang();         // then the static, data-i18n text
}
