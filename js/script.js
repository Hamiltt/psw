// js/script.js — обновлённый код
// Основные изменения:
// - Тема управляется ТОЛЬКО переключателем, удалена зависимость от Telegram themeParams
// - Иконки факультетов: пробуем mapping, затем автогенерируем имена с расширениями и пытаемся последовательно
// - PDF: если файл pdf -> preview iframe; если docx -> Google Docs Viewer (пользователь может сохранить в PDF)

// ==== Инициализация Telegram WebApp (оставляем SDK, но не используем themeParams) ====
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg && typeof tg.init === 'function') {
  try { tg.init(); } catch(e) { console.warn(e); }
}

// ==== Селекторы ====
const facultiesList = document.getElementById('facultiesList');
const coursesList = document.getElementById('coursesList');
const specialtiesList = document.getElementById('specialtiesList');
const specialtySearch = document.getElementById('specialtySearch');

const prevStepBtn = document.getElementById('prevStepBtn');
const nextStepBtn = document.getElementById('nextStepBtn');

const scheduleTitle = document.getElementById('scheduleTitle');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');
const errorBox = document.getElementById('errorBox');
const errorMsg = document.getElementById('errorMsg');
const retryBtn = document.getElementById('retryBtn');
const backToChooseBtn = document.getElementById('backToChooseBtn');
const notAvailableBox = document.getElementById('notAvailableBox');
const naBackBtn = document.getElementById('naBackBtn');

const contentBox = document.getElementById('contentBox');
const pdfViewer = document.getElementById('pdfViewer');
const imgViewer = document.getElementById('imgViewer');
const fileDownload = document.getElementById('fileDownload');
const downloadLink = document.getElementById('downloadLink');
const rawLink = document.getElementById('rawLink');

const refreshBtn = document.getElementById('refreshBtn');
const convertWrapper = document.getElementById('convertWrapper');
const convertToPdfBtn = document.getElementById('convertToPdfBtn');

const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const zoomLevelText = document.getElementById('zoomLevel');

const themeToggleBtn = document.getElementById('themeToggleBtn');

let currentZoom = 1;
function setZoom(z){
  currentZoom = Math.max(0.4, Math.min(2.5, z));
  if (imgViewer && !imgViewer.classList.contains('hidden')) imgViewer.style.transform = `scale(${currentZoom})`;
  zoomLevelText.textContent = `${Math.round(currentZoom*100)}%`;
}
zoomInBtn?.addEventListener('click', ()=> setZoom(currentZoom + 0.1));
zoomOutBtn?.addEventListener('click', ()=> setZoom(currentZoom - 0.1));

// ==== Данные ====
const faculties = [
  "Факультет информационных технологий",
  "Инженерно строительный факультет",
  "Юридический факультет",
  "Факультет компьютерных наук и электроники",
  "Гуманитарный факультет",
  "Финансово экономический факультет",
  "Механико-технологический факультет"
];
const courses = [1,2,3,4];

// specialtiesMap — как ранее (пример)
const specialtiesMap = {
  "факультет_информационных_технологий_1": [
    "Программная инженерия",
    "Кибербезопасность",
    "Data Science",
    "Информационные системы"
  ],
  "факультет_информационных_технологий_2": ["Программная инженерия","Кибербезопасность","Сетевые технологии"],
  "финансово_экономический_факультет_2": ["Финансы","Маркетинг","Бухгалтерский учет","Экономика предприятий"],
  "юридический_факультет_1": ["Гражданское право","Уголовное право","Международное право"]
  // ... дополняйте
};

// scheduleLinks: подставьте реальные ссылки
const scheduleLinks = {
  "факультет_информационных_технологий_1_программная_инженерия": "https://docs.google.com/document/d/1kb5gcNAH-vo0WnTxJuxG5DA8FP-BY2Xu/edit?usp=drive_link&ouid=106700637848956961460&rtpof=true&sd=true"
};

// Пример простого mapping: ключ — точное название факультета (как в массиве faculties),
// значение — имя файла, который лежит в папке img/ (png/jpg/jpeg/webp допустимы).
const facultyImages = {
  "Факультет информационных технологий": "FIT.png",
  "Инженерно строительный факультет": "ISF.png",
  "Юридический факультет": "UF.png",
  "Факультет компьютерных наук и электроники": "FKNE.png",
  "Гуманитарный факультет": "gf.png",
  "Финансово экономический факультет": "FEF.png",
  "Механико-технологический факультет": "mtf.png"
};


// ==== Вспомогательные функции ====
function normalizeKey(str){
  return String(str || '').toLowerCase().trim().replace(/[ё]/g,'е').replace(/[^a-z0-9а-яё\s_-]/gi,'').replace(/\s+/g,'_').replace(/_+/g,'_');
}

function extractDriveId(url){
  const m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  const m2 = url.match(/id=([a-zA-Z0-9_-]{10,})/);
  return m2 ? m2[1] : null;
}
function drivePreviewLink(driveUrl){ const id = extractDriveId(driveUrl); return id ? `https://drive.google.com/file/d/${id}/preview` : null; }
function driveDownloadLink(driveUrl){ const id = extractDriveId(driveUrl); return id ? `https://drive.google.com/uc?export=download&id=${id}` : driveUrl; }

// ==== Состояние ====
const STATE_KEY = 'miniapp_schedule_state_v3';
let state = { faculty:null, course:null, specialty:null };
function saveState(){ localStorage.setItem(STATE_KEY, JSON.stringify(state)); }
function loadState(){ try { const s = localStorage.getItem(STATE_KEY); if (s) state = JSON.parse(s); } catch(e){} }
loadState();

// Простой и надёжный renderFaculties — вставляет <img src="img/<file>" /> в карточку
// facultyImages: объект mapping'а (см. ниже)
function renderFaculties(){
  facultiesList.innerHTML = '';
  faculties.forEach(f => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.faculty = f;

    const icon = document.createElement('div');
    icon.className = 'icon';

    // Получаем имя файла из mapping (если задано), иначе формируем простое имя на основе индекса
    // Рекомендую явно задать mapping (пример ниже)
    const fileName = facultyImages[f] || null;

    if (fileName) {
      const img = document.createElement('img');
      img.src = `img/${fileName}`;           // <-- путь к картинке в папке img/
      img.alt = f;
      // если загрузка не удалась — убираем тег img и ставим эмодзи-фолбэк
      img.onerror = () => {
        img.remove();
        icon.textContent = getFallbackEmoji(f);
      };
      icon.appendChild(img);
    } else {
      // Если mapping не задан — сразу показываем эмодзи (чтобы не ломать UI)
      icon.textContent = getFallbackEmoji(f);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<div class="name">${f}</div><div class="desc">Нажмите, чтобы выбрать</div>`;

    card.appendChild(icon);
    card.appendChild(meta);

    card.addEventListener('click', () => {
      state.faculty = f;
      state.course = null;
      state.specialty = null;
      saveState();
      renderCourses();
      goToStep(2);
    });

    facultiesList.appendChild(card);
  });
}

// Попытка автоподстановки иконок: попробуем несколько расширений последовательно.
// Если ни одна не загрузилась — ставим эмодзи.
function tryAutoLoadIcon(facultyName, iconContainer){
  // Очистим
  iconContainer.innerHTML = '';
  const baseName = normalizeKey(facultyName); // например 'факультет_информационных_технологий'
  const exts = ['.svg','.webp','.png','.jpg','.jpeg'];
  let idx = 0;

  function tryNext(){
    if (idx >= exts.length){
      // показать эмодзи fallback
      iconContainer.textContent = getFallbackEmoji(facultyName);
      return;
    }
    const candidate = `img/${baseName}${exts[idx]}`;
    idx++;
    const img = document.createElement('img');
    img.src = candidate;
    img.alt = facultyName;
    img.onload = () => {
      iconContainer.innerHTML = '';
      iconContainer.appendChild(img);
    };
    img.onerror = () => {
      // пробуем следующий
      tryNext();
    };
    // добавим временно, чтобы браузер начал загрузку
    // Но не appendChild, иначе пустой placeholder. Можно оставить img unattached.
  }
  tryNext();
}

function getFallbackEmoji(f){
  if (/информационн/i.test(f)) return '💻';
  if (/юрид/i.test(f)) return '⚖️';
  if (/финанс/i.test(f)) return '💰';
  if (/гуманит/i.test(f)) return '📚';
  if (/механико/i.test(f)) return '🔧';
  if (/строитель/i.test(f)) return '🏗️';
  return '🏫';
}

// ==== Courses / Specialties rendering ====
function renderCourses(){
  document.getElementById('subtitle').textContent = state.faculty ? `${state.faculty}` : 'Выберите факультет → курс → специальность';
  coursesList.innerHTML = '';
  courses.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'course-btn';
    btn.textContent = `${c}`;
    if (state.course === c) btn.classList.add('active');
    btn.addEventListener('click', () => {
      state.course = c; state.specialty = null; saveState(); renderSpecialties(); goToStep(3);
    });
    coursesList.appendChild(btn);
  });
}
function renderSpecialties(filter=''){
  specialtiesList.innerHTML = '';
  const key = `${normalizeKey(state.faculty)}_${state.course}`;
  const arr = specialtiesMap[key] || [];
  if (arr.length === 0){ specialtiesList.innerHTML = `<div class="not-available"><p>Список специальностей не задан для данной комбинации.</p></div>`; return; }
  const q = (filter||'').toLowerCase();
  const filtered = arr.filter(s => s.toLowerCase().includes(q));
  if (filtered.length === 0){ specialtiesList.innerHTML = `<div class="not-available"><p>Ничего не найдено по запросу «${filter}»</p></div>`; return; }
  filtered.forEach(s => {
    const card = document.createElement('div');
    card.className = 'special-card';
    card.innerHTML = `<div class="special-title">${s}</div><div class="special-sub">${state.faculty}, ${state.course} курс</div>`;
    card.addEventListener('click', () => { state.specialty = s; saveState(); showSchedule(); goToStep(4); });
    specialtiesList.appendChild(card);
  });
}

// ==== Wizard navigation ====
const screens = Array.from(document.querySelectorAll('.screen'));
const progressFill = document.getElementById('progressFill');
const stepText = document.getElementById('stepText');
let currentStep = 1;
function goToStep(step){
  currentStep = Math.max(1, Math.min(4, step));
  screens.forEach(s => s.classList.toggle('active', +s.dataset.step === currentStep));
  progressFill.style.width = `${((currentStep-1)/3)*100}%`;
  stepText.textContent = `Шаг ${currentStep} из 4`;
  prevStepBtn.disabled = (currentStep===1);
  nextStepBtn.disabled = (currentStep===4);
  nextStepBtn.textContent = (currentStep===3 ? 'Показать расписание' : 'Далее');
}

// ==== Показ расписания ====
function showSchedule(){
  scheduleTitle.textContent = `Расписание для ${state.specialty}, ${state.course} курс, ${state.faculty}`;
  hideAllContentBoxes();
  const key = `${normalizeKey(state.faculty)}_${state.course}_${normalizeKey(state.specialty)}`;
  const link = scheduleLinks[key];
  if (!link){ notAvailableBox.classList.remove('hidden'); return; }
  loader.classList.remove('hidden'); loaderText.textContent = 'Загрузка расписания...';
  setTimeout(()=> loadRemoteFileFromDrive(link), 150);
}
function hideAllContentBoxes(){
  loader.classList.add('hidden'); errorBox.classList.add('hidden'); notAvailableBox.classList.add('hidden');
  contentBox.classList.add('hidden'); pdfViewer.classList.add('hidden'); imgViewer.classList.add('hidden');
  fileDownload.classList.add('hidden'); convertWrapper.classList.add('hidden');
}

function loadRemoteFileFromDrive(rawUrl){
  hideAllContentBoxes();
  loader.classList.remove('hidden');

  const lower = rawUrl.toLowerCase();
  const isPdf = /\.pdf/.test(lower) || /\/preview/.test(lower);
  const isImg = /\.(jpe?g|png|gif|bmp|webp)/.test(lower);
  const previewUrl = drivePreviewLink(rawUrl);
  const downloadUrl = driveDownloadLink(rawUrl);

  rawLink.href = rawUrl;

  if (isPdf || previewUrl){
    const src = previewUrl || rawUrl;
    pdfViewer.src = src;
    pdfViewer.classList.remove('hidden');
    contentBox.classList.remove('hidden');
    const onLoad = () => { loader.classList.add('hidden'); pdfViewer.removeEventListener('load', onLoad); };
    const onError = () => { loader.classList.add('hidden'); errorMsg.textContent = 'Ошибка загрузки PDF. Откройте в новой вкладке.'; errorBox.classList.remove('hidden'); };
    pdfViewer.addEventListener('load', onLoad);
    pdfViewer.addEventListener('error', onError);
    rawLink.href = previewUrl || rawUrl;
    return;
  }

  if (isImg){
    const trySrc = previewUrl ? previewUrl.replace('/preview','') : rawUrl;
    imgViewer.src = trySrc;
    imgViewer.onload = () => { loader.classList.add('hidden'); imgViewer.classList.remove('hidden'); contentBox.classList.remove('hidden'); setZoom(1); };
    imgViewer.onerror = () => { loader.classList.add('hidden'); errorMsg.textContent = 'Ошибка загрузки изображения.'; errorBox.classList.remove('hidden'); };
    rawLink.href = downloadUrl;
    return;
  }

  // Остальные форматы — docx, doc, xls, и т.д.
  loader.classList.add('hidden');
  fileDownload.classList.remove('hidden');
  contentBox.classList.remove('hidden');
  downloadLink.href = downloadUrl;
  downloadLink.textContent = 'Скачать документ';

  convertWrapper.classList.remove('hidden');
  convertToPdfBtn.onclick = () => {
    // Откроем в Google Docs Viewer (gview). Это НЕ конвертация на нашем сервере,
    // но пользователь увидит документ в браузере и сможет "Файл → Скачать → PDF".
    const gview = `https://docs.google.com/gview?url=${encodeURIComponent(downloadUrl)}&embedded=true`;
    window.open(gview, '_blank', 'noopener');
  };
  rawLink.href = downloadUrl;
}

// ==== Handlers ====
prevStepBtn.addEventListener('click', ()=> currentStep===4 ? goToStep(3) : goToStep(currentStep-1));
nextStepBtn.addEventListener('click', ()=> {
  if (currentStep === 1 && state.faculty) goToStep(2);
  else if (currentStep === 2 && state.course) goToStep(3);
  else if (currentStep === 3) {
    if (state.specialty) { showSchedule(); goToStep(4); } else alert('Пожалуйста, выберите специальность.');
  } else goToStep(currentStep+1);
});
retryBtn.addEventListener('click', ()=> {
  const key = `${normalizeKey(state.faculty)}_${state.course}_${normalizeKey(state.specialty)}`;
  const link = scheduleLinks[key]; if (link) loadRemoteFileFromDrive(link);
});
backToChooseBtn.addEventListener('click', ()=> goToStep(3));
naBackBtn.addEventListener('click', ()=> goToStep(3));
refreshBtn.addEventListener('click', ()=> {
  const key = `${normalizeKey(state.faculty)}_${state.course}_${normalizeKey(state.specialty)}`;
  const link = scheduleLinks[key]; if (link) loadRemoteFileFromDrive(link);
});
specialtySearch.addEventListener('input', (e)=> renderSpecialties(e.target.value || ''));

// ==== Theme toggle (только переключатель) ====
const THEME_KEY = 'miniapp_theme';
function applySavedTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark') document.body.classList.add('dark');
  else if (saved === 'light') document.body.classList.remove('dark');
  else document.body.classList.remove('dark'); // default: light
}
themeToggleBtn?.addEventListener('click', ()=> {
  const isDark = document.body.classList.contains('dark');
  if (isDark) { document.body.classList.remove('dark'); localStorage.setItem(THEME_KEY,'light'); }
  else { document.body.classList.add('dark'); localStorage.setItem(THEME_KEY,'dark'); }
});

// ==== Init ====
function initApp(){
  renderFaculties();
  applySavedTheme();

  if (state.faculty && !state.course){ goToStep(2); renderCourses(); }
  else if (state.faculty && state.course && !state.specialty){ renderCourses(); renderSpecialties(); goToStep(3); }
  else if (state.faculty && state.course && state.specialty){ renderCourses(); renderSpecialties(); showSchedule(); goToStep(4); }
  else goToStep(1);
}
initApp();
