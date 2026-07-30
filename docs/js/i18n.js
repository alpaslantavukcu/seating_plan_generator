// TR/EN string tables. Elements opt in with data-i18n / data-i18n-placeholder /
// data-i18n-title attributes; applyLang() walks the DOM after every language
// switch. Dynamic strings use t(key, params).

import { getState, set } from './store.js';

export const STRINGS = {
  tr: {
    appTitle: 'Sınav Yerleşim Planı',
    tagline: 'Derslik oturma planı oluşturucu',
    setupTitle: 'Plan Ayarları',
    examName: 'Sınav adı',
    examNamePh: 'örn. BLG102E Arasınav',
    studentsTitle: 'Öğrenci Listesi',
    pasteTab: 'Ninova’dan yapıştır',
    fileTab: '.txt dosyası',
    excelTab: 'Excel / CSV',
    pastePh: 'Ninova ders sayfası → Öğrenciler listesini kopyalayıp buraya yapıştırın.\nHer satır: numara, ad soyad (kullanıcı adı)',
    fileHint: 'Dosya seçin veya buraya bırakın',
    parsedCount: '{n} öğrenci okundu',
    noStudents: 'Henüz öğrenci listesi yüklenmedi',
    parseError: 'Liste okunamadı — biçimi kontrol edin',
    xlsxColsHint: 'İlk sütun: öğrenci no, ikinci sütun: ad soyad (başlık satırı otomatik atlanır)',
    roomsTitle: 'Derslikler',
    roomsHint: 'Seçim sırası doldurma sırasıdır — önce seçilen derslik önce dolar',
    capacityLabel: 'kapasite',
    customCap: 'Dersliklere özel kontenjan kullan',
    totalCapacity: 'Toplam kontenjan: {cap} · Öğrenci: {n}',
    overCapacity: 'Öğrenci sayısı toplam kontenjanı aşıyor!',
    optionsTitle: 'Seçenekler',
    seed: 'Rastgelelik tohumu',
    seedPh: 'boş bırakılırsa her seferinde farklı',
    seedHint: 'Aynı tohum + aynı liste = aynı plan',
    cellFields: 'Koltuk kutusunda gösterilecekler',
    fieldId: 'Öğrenci No',
    fieldName: 'Ad Soyad',
    fieldSeat: 'Sıra No',
    generate: 'Yerleşim Planı Oluştur',
    regenerate: 'Yeniden Karıştır',
    planTitle: 'Yerleşim Planı',
    usedSeed: 'Kullanılan tohum: {seed}',
    dragHint: 'Sürükle-bırak ile iki öğrencinin yerini değiştirin · Düzenlemek için koltuğa çift tıklayın',
    emptySeat: 'Boş',
    unassignedDesk: 'Kullanılmıyor',
    exportsTitle: 'İndir',
    pdfRoom: 'Bu derslik (PDF)',
    pdfAllId: 'Tüm derslikler — yalnız numara (PDF)',
    pdfAllFull: 'Tüm derslikler — tam bilgi (PDF)',
    pdfRoomList: 'Tek sayfa derslik listesi (PDF)',
    xlsxRoom: 'Bu derslik (Excel)',
    xlsxAll: 'Tüm derslikler (Excel)',
    xlsxRoomList: 'Tek sayfa derslik listesi (Excel)',
    printPage: 'Yazdır',
    errNoName: 'Sınav adı boş olamaz',
    errNoRooms: 'En az bir derslik seçin',
    errNoStudents: 'Önce öğrenci listesi yükleyin',
    errNoFields: 'En az bir koltuk alanı seçin',
    errCapacity: 'Yetersiz kontenjan: {n} öğrenci, {cap} koltuk. Derslik ekleyin.',
    editId: 'Öğrenci No',
    editName: 'Ad Soyad',
    editSave: 'Kaydet',
    editCancel: 'Vazgeç',
    editRemove: 'Koltuğu boşalt',
    langLabel: 'EN',
    footerNote: 'Tüm işlem tarayıcınızda yapılır — hiçbir veri sunucuya gönderilmez.',
    seatCount: '{used} / {cap} koltuk dolu',
  },
  en: {
    appTitle: 'Exam Seating Plan',
    tagline: 'Classroom seating plan generator',
    setupTitle: 'Plan Settings',
    examName: 'Exam name',
    examNamePh: 'e.g. BLG102E Midterm',
    studentsTitle: 'Student List',
    pasteTab: 'Paste from Ninova',
    fileTab: '.txt file',
    excelTab: 'Excel / CSV',
    pastePh: 'Copy the student list from the Ninova course page → Students tab and paste it here.\nEach line: ID, full name (username)',
    fileHint: 'Choose a file or drop it here',
    parsedCount: '{n} students parsed',
    noStudents: 'No student list loaded yet',
    parseError: 'Could not parse the list — check the format',
    xlsxColsHint: 'First column: student ID, second column: full name (header row skipped automatically)',
    roomsTitle: 'Classrooms',
    roomsHint: 'Selection order is fill order — the first selected room fills first',
    capacityLabel: 'capacity',
    customCap: 'Use custom capacity per classroom',
    totalCapacity: 'Total capacity: {cap} · Students: {n}',
    overCapacity: 'Student count exceeds total capacity!',
    optionsTitle: 'Options',
    seed: 'Random seed',
    seedPh: 'leave empty for a different plan every time',
    seedHint: 'Same seed + same list = same plan',
    cellFields: 'Shown inside each seat',
    fieldId: 'Student ID',
    fieldName: 'Full name',
    fieldSeat: 'Seat no',
    generate: 'Generate Seating Plan',
    regenerate: 'Reshuffle',
    planTitle: 'Seating Plan',
    usedSeed: 'Seed used: {seed}',
    dragHint: 'Drag & drop to swap two students · Double-click a seat to edit',
    emptySeat: 'Empty',
    unassignedDesk: 'Not in use',
    exportsTitle: 'Download',
    pdfRoom: 'This room (PDF)',
    pdfAllId: 'All rooms — IDs only (PDF)',
    pdfAllFull: 'All rooms — full info (PDF)',
    pdfRoomList: 'Single-sheet room list (PDF)',
    xlsxRoom: 'This room (Excel)',
    xlsxAll: 'All rooms (Excel)',
    xlsxRoomList: 'Single-sheet room list (Excel)',
    printPage: 'Print',
    errNoName: 'Exam name cannot be empty',
    errNoRooms: 'Select at least one classroom',
    errNoStudents: 'Load a student list first',
    errNoFields: 'Select at least one seat field',
    errCapacity: 'Not enough capacity: {n} students, {cap} seats. Add more rooms.',
    editId: 'Student ID',
    editName: 'Full name',
    editSave: 'Save',
    editCancel: 'Cancel',
    editRemove: 'Clear seat',
    langLabel: 'TR',
    footerNote: 'Everything runs in your browser — no data is sent to any server.',
    seatCount: '{used} / {cap} seats filled',
  },
};

export function t(key, params = {}) {
  const lang = getState().lang;
  let s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.tr[key] || key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v);
  return s;
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
}

export function toggleLang() {
  const next = getState().lang === 'tr' ? 'en' : 'tr';
  localStorage.setItem('sp-lang', next);
  set({ lang: next });
  applyLang();
}
