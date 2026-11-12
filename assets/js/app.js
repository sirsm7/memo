import { getSupabaseClient, subscribeBookingsRealtime, teardownRealtime } from "../../realtime.js";
import {
  getCacheEntry,
  setCache,
  deleteCacheByPrefix,
  clearExpiredCache
} from "../../idb-cache.js";
import {
  exportDatabaseJSON,
  importDatabaseJSON
} from "../../migration.js";

const SHOW_PAST_DAYS = false;

const ROOM_OPTIONS = [
  "PKG Melekek - Bilik Kuliah (25 orang)",
  "PKG Melekek - Bilik Mesyuarat (25 orang)",
  "PKG Masjid Tanah - Bilik Seri Cempaka (24 orang)",
  "PKG Masjid Tanah - Bilik Seri Melur (18 orang)",
  "PKG Masjid Tanah - Bilik Pendidikan Digital (12 orang)",
  "Bilik Mesyuarat PPDAG di SK Alor Gajah 1 (40 orang)",
  "Bilik Mesyuarat Utama PPDAG (73 orang)",
  "Bilik Perbincangan PPDAG (15 orang)",
  "Makmal Komputer PPDAG (31 orang)",
  "Bilik Seminar PPDAG (22 orang)",
  "Bilik Temuduga PPDAG (4 orang)",
  "Bilik Runding Cara PPDAG (4 orang)",
  "Kafeteria PPDAG (30 orang)"
];

const CATEGORY_OPTIONS = ["Mesyuarat / Taklimat", "Bengkel / Kursus", "Lain-Lain"];

const $ = id => document.getElementById(id);
const pad2 = n => String(n).padStart(2, '0');
const formatMonthLabel = (y, m) => new Intl.DateTimeFormat('ms-MY', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
const toYMD = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const firstDay = (y, m) => `${y}-${pad2(m)}-01`;
const lastDay = (y, m) => toYMD(new Date(y, m, 0));
const todayYMD = () => toYMD(new Date());

function parseLocalYMD(ymd) {
  const parts = String(ymd || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return new Date();
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getLocalDayOfWeek(ymd) {
  return parseLocalYMD(ymd).getDay();
}

function toHHMM(x) {
  if (x == null) return "";
  const s = String(x).trim();
  if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
  const d = new Date(s);
  if (!isNaN(d)) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return s;
}

function toYMDNorm(x) {
  if (x == null) return "";
  const s = String(x);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d)) return toYMD(d);
  return s.slice(0, 10);
}

const toMinutes = t => {
  if (!t) return 0;
  const [h, m] = toHHMM(t).split(':').map(Number);
  return (h * 60) + (m || 0);
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

function addDaysYMD(ymd, n) {
  const dt = parseLocalYMD(ymd);
  dt.setDate(dt.getDate() + n);
  return toYMD(dt);
}

function isSwalAvailable() {
  return typeof Swal !== 'undefined' && Swal !== null && typeof Swal.fire === 'function';
}

let cachedToast = null;
function getToast() {
  if (!cachedToast && isSwalAvailable() && typeof Swal.mixin === 'function') {
    cachedToast = Swal.mixin({
      toast: true,
      position: 'top',
      showConfirmButton: false,
      timer: 2200,
      timerProgressBar: true
    });
  }
  return cachedToast;
}

function toastOk(t) {
  const toast = getToast();
  if (toast) toast.fire({ icon: 'success', title: t });
}

function toastInfo(t) {
  const toast = getToast();
  if (toast) toast.fire({ icon: 'info', title: t });
}

function toastWarn(t) {
  const toast = getToast();
  if (toast) toast.fire({ icon: 'warning', title: t });
}

function toastErr(t) {
  const toast = getToast();
  if (toast) toast.fire({ icon: 'error', title: t });
}

function modalLoading(title = 'Memproses...') {
  if (isSwalAvailable()) {
    Swal.fire({
      title,
      allowOutsideClick: false,
      didOpen: () => {
        if (typeof Swal.showLoading === 'function') {
          Swal.showLoading();
        }
      }
    });
  }
}

function modalClose() {
  if (isSwalAvailable() && typeof Swal.close === 'function') {
    Swal.close();
  }
}

function markInvalid(el) {
  if (!el) return;
  el.classList.add('invalid');
  setTimeout(() => el.classList.remove('invalid'), 1200);
  el.focus();
}

function createEl(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function clearElementChildren(el) {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

async function modalConfirm(title, text, confirmText = 'Ya, Teruskan') {
  if (isSwalAvailable()) {
    const result = await Swal.fire({
      title: title,
      text: text,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: confirmText,
      cancelButtonText: 'Batal'
    });
    return result.isConfirmed;
  }
  return window.confirm(`${title}\n${text}`);
}

async function clearActiveCaches() {
  await Promise.all([
    deleteCacheByPrefix('cal_'),
    deleteCacheByPrefix('ov_'),
    deleteCacheByPrefix('my_')
  ]).catch(() => {});
}

const DEFAULT_USER_STATE = {
  user: null,
  isAdmin: false,
  sessionToken: null,
  sessionExpiresAt: null
};

let state = {
  ...DEFAULT_USER_STATE,
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  room: '',
  days: [],
  selectedDate: null,
  range: { from: null, to: null },
  rangeMode: false,
  myBookings: []
};

let ov = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  days: [],
  bookings: [],
  view: 'calendar',
  filterRoom: '',
  filterUser: ''
};

let adminState = {
  bookings: [],
  searchData: []
};

let supaClient = null;
let adminSearchAbortController = null;
let adminBookingListAbortController = null;
let adminUserListAbortController = null;

window.addEventListener('load', bootstrap);

async function bootstrap() {
  setupUI();

  if (window.ENV_READY) {
    try {
      await window.ENV_READY;
    } catch {
      if (isSwalAvailable()) {
        Swal.fire('Ralat Konfigurasi', 'Konfigurasi pelayan tidak lengkap. Sila hubungi pentadbir sistem.', 'error');
      }
      return;
    }
  }

  try {
    supaClient = await getSupabaseClient();
  } catch {
    if (isSwalAvailable()) {
      Swal.fire('Ralat Permulaan', 'Gagal menyambung ke pangkalan data. Sila muat semula halaman.', 'error');
    }
    return;
  }

  restoreSession();
  clearExpiredCache().catch(() => {});

  const roomSel = $('roomSelect');
  const adminRoomSel = $('adminRoom');
  const adminSearchRoomSel = $('adminSearchRoom');
  ROOM_OPTIONS.forEach(r => {
    if (roomSel) roomSel.appendChild(new Option(r, r));
    if (adminRoomSel) adminRoomSel.appendChild(new Option(r, r));
    if (adminSearchRoomSel) adminSearchRoomSel.appendChild(new Option(r, r));
  });

  const catSel = $('category');
  if (catSel) {
    CATEGORY_OPTIONS.forEach(c => catSel.appendChild(new Option(c, c)));
  }

  const ovRoomFilter = $('ovRoomFilter');
  if (ovRoomFilter) {
    ROOM_OPTIONS.forEach(r => ovRoomFilter.appendChild(new Option(r, r)));
  }

  toggleCalendarHint();
  setupRealtimeSubscription();
  await loadOverview(true);
}

async function syncAllActiveViews() {
  await clearActiveCaches();

  if (state.room) {
    await refreshCalendar(false);
  }
  await loadOverview(false);
  if (state.user) {
    await loadMyBookings(false);
  }
  if ($('tabAdminSearch') && $('tabAdminSearch').classList.contains('active')) {
    const startVal = $('adminSearchStartDate') ? $('adminSearchStartDate').value : '';
    const endVal = $('adminSearchEndDate') ? $('adminSearchEndDate').value : '';
    if (startVal && endVal) {
      await executeAdminSearch();
    }
  }
}

function setupRealtimeSubscription() {
  if (!supaClient) return;
  subscribeBookingsRealtime(
    supaClient,
    async (payload) => {
      await handleRealtimePayload(payload);
    },
    async () => {
      await syncAllActiveViews();
    }
  );
}

async function handleRealtimePayload(payload) {
  await syncAllActiveViews();

  const rec = payload.new || payload.old;
  if (!rec) return;

  const isSelf = state.user && (rec.nama_penempah === state.user.nama || rec.email === state.user.email);
  if (!isSelf) {
    if (payload.eventType === 'INSERT') {
      toastInfo(`Tempahan baharu diterima: ${escapeHtml(rec.bilik) || 'Bilik'}`);
    } else if (payload.eventType === 'UPDATE') {
      if (rec.status === 'DIBATALKAN') {
        toastInfo(`Tempahan dibatalkan: ${escapeHtml(rec.bilik) || 'Bilik'}`);
      } else {
        toastInfo(`Jadual tempahan dikemaskini: ${escapeHtml(rec.bilik) || 'Bilik'}`);
      }
    } else if (payload.eventType === 'DELETE') {
      toastInfo('Rekod tempahan dikeluarkan.');
    }
  }
}

function setupUI() {
  const mainLoginBtn = $('mainLoginBtn');
  if (mainLoginBtn) mainLoginBtn.addEventListener('click', showLoginModal);

  const userProfileBadge = $('userProfileBadge');
  if (userProfileBadge) userProfileBadge.addEventListener('click', showUserProfile);

  const tabTempahanBtn = $('tabTempahanBtn');
  if (tabTempahanBtn) tabTempahanBtn.addEventListener('click', () => switchTab('tempahan'));

  const tabKalendarBtn = $('tabKalendarBtn');
  if (tabKalendarBtn) tabKalendarBtn.addEventListener('click', () => switchTab('kalendar'));

  const tabTempahanSayaBtn = $('tabTempahanSayaBtn');
  if (tabTempahanSayaBtn) tabTempahanSayaBtn.addEventListener('click', () => switchTab('tempahanSaya'));

  const tabAdminBtn = $('tabAdminBtn');
  if (tabAdminBtn) tabAdminBtn.addEventListener('click', () => switchTab('admin'));

  const tabAdminSearchBtn = $('tabAdminSearchBtn');
  if (tabAdminSearchBtn) tabAdminSearchBtn.addEventListener('click', () => switchTab('adminSearch'));

  const roomSelect = $('roomSelect');
  if (roomSelect) roomSelect.addEventListener('change', onRoomSelectChange);

  const btnRefresh = $('btnRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      await clearActiveCaches();
      resetUI();
      toastInfo('Antara muka & cache telah ditetapkan semula');
    });
  }

  const btnPrev = $('btnPrev');
  if (btnPrev) btnPrev.addEventListener('click', () => changeMonth(state, -1, true));

  const btnNext = $('btnNext');
  if (btnNext) btnNext.addEventListener('click', () => changeMonth(state, 1, true));

  const ovPrev = $('ovPrev');
  if (ovPrev) ovPrev.addEventListener('click', () => changeMonth(ov, -1, false));

  const ovNext = $('ovNext');
  if (ovNext) ovNext.addEventListener('click', () => changeMonth(ov, 1, false));

  const monthLabel = $('monthLabel');
  if (monthLabel) monthLabel.textContent = formatMonthLabel(state.year, state.month);

  const ovMonthLabel = $('ovMonthLabel');
  if (ovMonthLabel) ovMonthLabel.textContent = formatMonthLabel(ov.year, ov.month);

  const toggleRangeOff = $('toggleRangeOff');
  if (toggleRangeOff) toggleRangeOff.addEventListener('click', () => setRangeMode(false));

  const toggleRangeOn = $('toggleRangeOn');
  if (toggleRangeOn) toggleRangeOn.addEventListener('click', () => setRangeMode(true));

  const pickedDate = $('pickedDate');
  if (pickedDate) pickedDate.addEventListener('change', onDateChange);

  const fromDate = $('fromDate');
  if (fromDate) fromDate.addEventListener('change', onRangeChange);

  const toDate = $('toDate');
  if (toDate) toDate.addEventListener('change', onRangeChange);

  const grid = $('grid');
  if (grid) grid.addEventListener('click', onGridClick);

  const btnBook = $('btnBook');
  if (btnBook) btnBook.addEventListener('click', onBook);

  const btnViewCalendar = $('btnViewCalendar');
  if (btnViewCalendar) btnViewCalendar.addEventListener('click', () => switchOverviewView('calendar'));

  const btnViewTable = $('btnViewTable');
  if (btnViewTable) btnViewTable.addEventListener('click', () => switchOverviewView('table'));

  const ovRoomFilter = $('ovRoomFilter');
  if (ovRoomFilter) {
    ovRoomFilter.addEventListener('change', () => {
      ov.filterRoom = ovRoomFilter.value;
      ov.filterUser = '';
      const userFilterEl = $('ovUserFilter');
      if (userFilterEl) userFilterEl.value = '';

      populateUserFilter();
      renderOvTable();
    });
  }

  const userFilterEl = $('ovUserFilter');
  if (userFilterEl) {
    userFilterEl.addEventListener('change', () => {
      ov.filterUser = userFilterEl.value;
      renderOvTable();
    });
  }

  const btnRefreshMyBookings = $('btnRefreshMyBookings');
  if (btnRefreshMyBookings) {
    btnRefreshMyBookings.addEventListener('click', async () => {
      await deleteCacheByPrefix('my_');
      loadMyBookings(true);
    });
  }

  const adminAddUserBtn = $('adminAddUserBtn');
  if (adminAddUserBtn) adminAddUserBtn.addEventListener('click', adminAddUser);

  const adminRefreshUsers = $('adminRefreshUsers');
  if (adminRefreshUsers) adminRefreshUsers.addEventListener('click', loadAdminUserList);

  const btnAdminLoad = $('btnAdminLoad');
  if (btnAdminLoad) btnAdminLoad.addEventListener('click', loadAdminBookingList);

  const btnBulkCancel = $('btnBulkCancel');
  if (btnBulkCancel) btnBulkCancel.addEventListener('click', executeBulkCancel);

  const btnExportJson = $('btnExportJson');
  if (btnExportJson) {
    btnExportJson.addEventListener('click', handleAdminExportJson);
  }

  const btnImportJson = $('btnImportJson');
  if (btnImportJson) {
    btnImportJson.addEventListener('click', handleAdminImportJson);
  }

  const btnAdminExecuteSearch = $('btnAdminExecuteSearch');
  if (btnAdminExecuteSearch) btnAdminExecuteSearch.addEventListener('click', executeAdminSearch);

  const btnAdminPrintSearch = $('btnAdminPrintSearch');
  if (btnAdminPrintSearch) {
    btnAdminPrintSearch.addEventListener('click', () => {
      window.print();
    });
  }

  const adminSearchUserFilter = $('adminSearchUserFilter');
  if (adminSearchUserFilter) {
    adminSearchUserFilter.addEventListener('change', renderAdminSearchTable);
  }
}

async function handleAdminExportJson() {
  if (!state.user || state.user.role !== 'ADMIN') {
    return toastErr('Akses ditolak. Hanya Pentadbir dibenarkan.');
  }

  const btnExportJson = $('btnExportJson');
  const statusEl = $('migrationStatusArea');
  if (btnExportJson) btnExportJson.disabled = true;

  try {
    const result = await exportDatabaseJSON({
      statusEl,
      adminEmail: state.user.email,
      sessionToken: getSessionToken()
    });

    if (result.ok) {
      toastOk('Fail sandaran JSON berjaya dimuat turun.');
    } else {
      toastErr(result.error || 'Gagal menjana sandaran JSON.');
    }
  } finally {
    if (btnExportJson) btnExportJson.disabled = false;
  }
}

async function handleAdminImportJson() {
  if (!state.user || state.user.role !== 'ADMIN') {
    return toastErr('Akses ditolak. Hanya Pentadbir dibenarkan.');
  }

  const fileInput = $('importJsonFile');
  const btnImportJson = $('btnImportJson');
  const statusEl = $('migrationStatusArea');
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;

  if (!file) {
    return toastWarn('Sila pilih fail sandaran .json terlebih dahulu.');
  }

  const isConfirmed = await modalConfirm(
    'Pulihkan Data 1-to-1 JSON?',
    'Rekod sedia ada dengan kunci utama yang sama akan dikemaskini dan rekod baharu akan ditambah mengikut susunan jadual sistem. Teruskan?',
    'Ya, Pulihkan Data'
  );

  if (!isConfirmed) return;

  if (btnImportJson) btnImportJson.disabled = true;

  try {
    const result = await importDatabaseJSON(file, {
      statusEl,
      onComplete: async () => {
        if (fileInput) fileInput.value = '';
        await syncAllActiveViews();
        await loadAdminUserList();
        const adminRoom = $('adminRoom');
        if (adminRoom && adminRoom.value) {
          await loadAdminBookingList();
        }
      }
    });

    if (result.ok) {
      toastOk('Pemulihan data 1-to-1 selesai dan paparan telah disegarkan.');
    } else {
      toastErr(result.error || 'Gagal mengimport fail JSON.');
    }
  } finally {
    if (btnImportJson) btnImportJson.disabled = false;
  }
}

function resetUI() {
  const now = new Date();
  state.year = now.getFullYear();
  state.month = now.getMonth() + 1;
  const monthLabel = $('monthLabel');
  if (monthLabel) monthLabel.textContent = formatMonthLabel(state.year, state.month);

  state.days = [];
  clearElementChildren($('grid'));
  document.querySelectorAll('.tile.sel').forEach(el => el.classList.remove('sel'));

  const roomSelect = $('roomSelect');
  if (roomSelect) roomSelect.value = '';
  state.room = '';
  toggleCalendarHint();

  resetBookingForm(true);

  const adminRoom = $('adminRoom');
  if (adminRoom) adminRoom.value = '';
  clearElementChildren($('adminList'));
  adminState.bookings = [];

  if (!state.user || state.user.role !== 'ADMIN') {
    const adminLoginBox = $('adminLoginBox');
    if (adminLoginBox) adminLoginBox.style.display = 'block';
    const adminPanel = $('adminPanel');
    if (adminPanel) adminPanel.style.display = 'none';
    const tabAdminSearchBtn = $('tabAdminSearchBtn');
    if (tabAdminSearchBtn) tabAdminSearchBtn.style.display = 'none';
  }

  switchTab('tempahan');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  ov.year = now.getFullYear();
  ov.month = now.getMonth() + 1;
  ov.filterRoom = '';
  ov.filterUser = '';
  const ovRoomFilter = $('ovRoomFilter');
  if (ovRoomFilter) ovRoomFilter.value = '';
  const ovUserFilter = $('ovUserFilter');
  if (ovUserFilter) ovUserFilter.value = '';

  const ovMonthLabel = $('ovMonthLabel');
  if (ovMonthLabel) ovMonthLabel.textContent = formatMonthLabel(ov.year, ov.month);
  loadOverview(true);
}

function resetBookingForm(clearFields) {
  setRangeMode(false);
  const pickedDate = $('pickedDate');
  if (pickedDate) pickedDate.required = true;
  const fromDate = $('fromDate');
  if (fromDate) fromDate.required = false;
  const toDate = $('toDate');
  if (toDate) toDate.required = false;
  const rangeCounter = $('rangeCounter');
  if (rangeCounter) {
    rangeCounter.style.display = 'none';
    rangeCounter.textContent = '';
  }

  if (clearFields) {
    ['pickedDate', 'fromDate', 'toDate', 'startTime', 'endTime', 'note'].forEach(id => {
      const el = $(id);
      if (el) el.value = '';
    });

    const sek = $('sektor');
    clearElementChildren(sek);

    const nama = $('nama');
    clearElementChildren(nama);

    if (state.user && sek && nama) {
      const optSek = document.createElement('option');
      optSek.value = state.user.sektor;
      optSek.textContent = state.user.sektor;
      sek.appendChild(optSek);
      sek.value = state.user.sektor;
      sek.disabled = false;

      const optNama = document.createElement('option');
      optNama.value = state.user.nama;
      optNama.textContent = state.user.nama;
      nama.appendChild(optNama);
      nama.value = state.user.nama;
      nama.disabled = false;
    } else if (nama) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '— Sila pilih sektor dahulu —';
      nama.appendChild(opt);
      nama.disabled = true;
    }
  }
  state.selectedDate = null;
  state.range = { from: null, to: null };
  highlightRangeTiles();
}

function changeMonth(obj, delta, refreshCal) {
  let m = obj.month + delta;
  let y = obj.year;
  if (m < 1) {
    m = 12;
    y--;
  } else if (m > 12) {
    m = 1;
    y++;
  }
  obj.month = m;
  obj.year = y;

  if (obj === state) {
    const monthLabel = $('monthLabel');
    if (monthLabel) monthLabel.textContent = formatMonthLabel(y, m);
  }
  if (obj === ov) {
    const ovMonthLabel = $('ovMonthLabel');
    if (ovMonthLabel) ovMonthLabel.textContent = formatMonthLabel(y, m);
    loadOverview(true);
  }

  if (refreshCal && state.room) refreshCalendar(true);
}

function switchTab(name) {
  const targetBtnId = `tab${name.charAt(0).toUpperCase() + name.slice(1)}Btn`;
  const targetPaneId = `tab${name.charAt(0).toUpperCase() + name.slice(1)}`;

  document.querySelectorAll('.tabbtn').forEach(b => b.classList.toggle('active', b.id === targetBtnId));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === targetPaneId));

  if (name === 'admin' || name === 'adminSearch') {
    if (state.user && state.user.role === 'ADMIN') {
      if (name === 'admin') {
        const adminLoginBox = $('adminLoginBox');
        if (adminLoginBox) adminLoginBox.style.display = 'none';
        const adminPanel = $('adminPanel');
        if (adminPanel) adminPanel.style.display = 'block';
        const userBody = $('adminUserListBody');
        if (userBody && userBody.children.length <= 1) loadAdminUserList();
      }
    } else {
      const adminLoginBox = $('adminLoginBox');
      if (adminLoginBox) adminLoginBox.style.display = 'block';
      const adminPanel = $('adminPanel');
      if (adminPanel) adminPanel.style.display = 'none';
      if (state.user && state.user.role !== 'ADMIN') {
        if (isSwalAvailable()) {
          Swal.fire('Akses Ditolak', 'Hanya akaun PENTADBIR dibenarkan.', 'warning');
        }
        switchTab('tempahan');
      }
    }
  }
}

function toggleCalendarHint() {
  const noRoomHint = $('noRoomHint');
  if (noRoomHint) noRoomHint.style.display = state.room ? 'none' : 'block';
}

function resetUserState() {
  Object.assign(state, DEFAULT_USER_STATE);
  state.isAdmin = false;
  state.user = null;
  state.sessionToken = null;
  state.sessionExpiresAt = null;
  state.myBookings = [];
}

function getSessionToken() {
  return state.sessionToken || localStorage.getItem('erom_session_token') || '';
}

function restoreSession() {
  const saved = localStorage.getItem('erom_user');
  const savedToken = localStorage.getItem('erom_session_token');
  const savedExpiresAt = localStorage.getItem('erom_session_expires_at');

  if (saved && savedToken) {
    try {
      state.user = JSON.parse(saved);
      state.sessionToken = savedToken;
      state.sessionExpiresAt = savedExpiresAt;
      onLoginSuccess();
    } catch {
      onLogout();
    }
  } else {
    onLogout();
  }
}

async function showLoginModal() {
  if (!isSwalAvailable()) return;

  const { value: formValues } = await Swal.fire({
    title: 'Log Masuk Pegawai',
    html: `
      <input id="swal-email" class="swal2-input" placeholder="Emel Rasmi (moe.gov.my)" type="email">
      <input id="swal-pass" type="password" class="swal2-input" placeholder="Kata Laluan">
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Log Masuk',
    preConfirm: () => [$('swal-email').value, $('swal-pass').value]
  });

  if (formValues) {
    const [email, pass] = formValues;
    if (!email || !pass) return toastErr('Sila isi maklumat');
    if (!supaClient) return toastErr('Perkhidmatan belum bersedia.');

    modalLoading('Mengesahkan...');
    const { data, error } = await supaClient.rpc('fn_login_secure', { p_email: email, p_password: pass });
    modalClose();

    if (error) return Swal.fire('Ralat Sistem', error.message, 'error');
    if (!data.ok) return Swal.fire('Gagal', data.error, 'error');

    state.user = data.user;
    state.sessionToken = data.session_token || null;
    state.sessionExpiresAt = data.session_expires_at || null;

    if (!state.sessionToken) return Swal.fire('Ralat Sistem', 'Token sesi tidak diterima. Sila hubungi pentadbir.', 'error');

    localStorage.setItem('erom_user', JSON.stringify(state.user));
    localStorage.setItem('erom_session_token', state.sessionToken);
    if (state.sessionExpiresAt) localStorage.setItem('erom_session_expires_at', state.sessionExpiresAt);

    onLoginSuccess();
    toastOk(`Selamat datang, ${escapeHtml(state.user.nama)}`);
  }
}

function onLoginSuccess() {
  const mainLoginBtn = $('mainLoginBtn');
  if (mainLoginBtn) mainLoginBtn.style.display = 'none';

  const userProfileBadge = $('userProfileBadge');
  if (userProfileBadge) userProfileBadge.classList.add('active');

  const userDisplayName = $('userDisplayName');
  if (userDisplayName) userDisplayName.textContent = state.user.nama.split(' ')[0];

  const roleTag = $('userRoleTag');
  if (roleTag) {
    roleTag.textContent = state.user.role;
    roleTag.className = `user-role ${state.user.role === 'ADMIN' ? 'admin' : ''}`;
  }

  state.isAdmin = (state.user.role === 'ADMIN');

  const btnMyBookings = $('tabTempahanSayaBtn');
  if (btnMyBookings) btnMyBookings.style.display = 'inline-block';

  const ovUserWrap = $('ovUserFilterWrap');
  if (ovUserWrap) ovUserWrap.style.display = 'block';
  populateUserFilter();

  if (state.isAdmin) {
    const tabAdminBtn = $('tabAdminBtn');
    if (tabAdminBtn) tabAdminBtn.style.display = 'inline-block';
    const tabAdminSearchBtn = $('tabAdminSearchBtn');
    if (tabAdminSearchBtn) tabAdminSearchBtn.style.display = 'inline-block';
    const tabAdmin = $('tabAdmin');
    if (tabAdmin && tabAdmin.classList.contains('active')) {
      const adminLoginBox = $('adminLoginBox');
      if (adminLoginBox) adminLoginBox.style.display = 'none';
      const adminPanel = $('adminPanel');
      if (adminPanel) adminPanel.style.display = 'block';
      loadAdminUserList();
    }
  }

  toggleBookingForm(true);
  loadMyBookings(false);

  if (ov.view === 'table') {
    clearElementChildren($('ovTableBody'));
    renderOvTable();
  }
}

async function onLogout() {
  const currentSessionToken = getSessionToken();

  if (currentSessionToken && supaClient) {
    try {
      await supaClient.rpc('fn_logout_secure', { p_session_token: currentSessionToken });
    } catch {}
  }

  teardownRealtime(supaClient);
  deleteCacheByPrefix('my_').catch(() => {});

  resetUserState();
  localStorage.removeItem('erom_user');
  localStorage.removeItem('erom_session_token');
  localStorage.removeItem('erom_session_expires_at');

  const mainLoginBtn = $('mainLoginBtn');
  if (mainLoginBtn) mainLoginBtn.style.display = 'block';

  const userProfileBadge = $('userProfileBadge');
  if (userProfileBadge) userProfileBadge.classList.remove('active');

  const tabAdminBtn = $('tabAdminBtn');
  if (tabAdminBtn) tabAdminBtn.style.display = 'none';

  const tabAdminSearchBtn = $('tabAdminSearchBtn');
  if (tabAdminSearchBtn) tabAdminSearchBtn.style.display = 'none';

  const adminLoginBox = $('adminLoginBox');
  if (adminLoginBox) adminLoginBox.style.display = 'block';

  const adminPanel = $('adminPanel');
  if (adminPanel) adminPanel.style.display = 'none';

  const btnMyBookings = $('tabTempahanSayaBtn');
  if (btnMyBookings) btnMyBookings.style.display = 'none';

  const ovUserWrap = $('ovUserFilterWrap');
  if (ovUserWrap) ovUserWrap.style.display = 'none';
  ov.filterUser = '';
  const ovUserFilter = $('ovUserFilter');
  if (ovUserFilter) ovUserFilter.value = '';

  toggleBookingForm(false);

  const tabAdmin = $('tabAdmin');
  const tabTempahanSaya = $('tabTempahanSaya');
  const tabAdminSearch = $('tabAdminSearch');
  if (
    (tabAdmin && tabAdmin.classList.contains('active')) ||
    (tabTempahanSaya && tabTempahanSaya.classList.contains('active')) ||
    (tabAdminSearch && tabAdminSearch.classList.contains('active'))
  ) {
    switchTab('tempahan');
  }

  if (ov.view === 'table') {
    clearElementChildren($('ovTableBody'));
    renderOvTable();
  }

  const myBookingsTbody = $('myBookingsTableBody');
  if (myBookingsTbody) {
    clearElementChildren(myBookingsTbody);
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.style.textAlign = 'center';
    td.style.padding = '15px';
    td.textContent = 'Sila log masuk untuk melihat rekod.';
    tr.appendChild(td);
    myBookingsTbody.appendChild(tr);
  }

  if (supaClient) {
    setupRealtimeSubscription();
  }

  toastInfo('Log keluar berjaya');
}

function showUserProfile() {
  if (!isSwalAvailable()) return;

  Swal.fire({
    title: escapeHtml(state.user.nama),
    html: `
      <div style="text-align:left; margin-bottom:15px; font-size:0.9rem;">
        <p><strong>Sektor:</strong> ${escapeHtml(state.user.sektor)}</p>
        <p><strong>Emel:</strong> ${escapeHtml(state.user.email)}</p>
      </div>
      <button id="btnChangePass" class="swal2-confirm swal2-styled" style="background:#4b5563; margin-right:5px;">Tukar Password</button>
      <button id="btnLogout" class="swal2-cancel swal2-styled" style="background:#ef4444;">Log Keluar</button>
    `,
    showConfirmButton: false,
    didOpen: () => {
      const btnLogout = $('btnLogout');
      const btnChangePass = $('btnChangePass');
      if (btnLogout) btnLogout.onclick = () => { Swal.close(); onLogout(); };
      if (btnChangePass) btnChangePass.onclick = () => { Swal.close(); changeOwnPassword(); };
    }
  });
}

async function changeOwnPassword() {
  if (!isSwalAvailable()) return;

  const { value: form } = await Swal.fire({
    title: 'Tukar Kata Laluan',
    html: `
      <input id="oldP" type="password" class="swal2-input" placeholder="Kata Laluan Lama">
      <input id="newP" type="password" class="swal2-input" placeholder="Kata Laluan Baru">
    `,
    focusConfirm: false,
    showCancelButton: true,
    preConfirm: () => [$('oldP').value, $('newP').value]
  });

  if (form) {
    if (!supaClient) return toastErr('Perkhidmatan tidak tersedia.');
    modalLoading('Mengemaskini...');
    const { data } = await supaClient.rpc('fn_change_own_password_v2', {
      p_email: state.user.email,
      p_old_pass: form[0],
      p_new_pass: form[1],
      p_session_token: getSessionToken()
    });
    modalClose();
    if (data && data.ok) Swal.fire('Berjaya', 'Kata laluan ditukar.', 'success');
    else Swal.fire('Gagal', data?.error || 'Ralat', 'error');
  }
}

function toggleBookingForm(enable) {
  const fields = document.querySelectorAll('#bookingFormContainer input, #bookingFormContainer select, #bookingFormContainer button');
  fields.forEach(f => { f.disabled = !enable; });

  const loginWarning = $('loginWarning');
  if (loginWarning) loginWarning.style.display = enable ? 'none' : 'block';

  const btnBook = $('btnBook');
  if (btnBook) btnBook.style.display = enable ? 'inline-block' : 'none';

  if (enable) {
    resetBookingForm(true);
  }
}

async function onBook() {
  if (!state.user) return toastErr('Sila log masuk dahulu');
  if (!supaClient) return toastErr('Perkhidmatan belum bersedia.');

  const pickedDateEl = $('pickedDate');
  const startTimeEl = $('startTime');
  const endTimeEl = $('endTime');
  const categoryEl = $('category');
  const noteEl = $('note');
  const sektorEl = $('sektor');
  const namaEl = $('nama');
  const fromDateEl = $('fromDate');
  const toDateEl = $('toDate');

  const inputs = {
    room: state.room,
    date: pickedDateEl ? pickedDateEl.value : '',
    start: startTimeEl ? startTimeEl.value : '',
    end: endTimeEl ? endTimeEl.value : '',
    category: categoryEl ? categoryEl.value : '',
    note: noteEl ? noteEl.value.trim() : '',
    sektor: sektorEl ? sektorEl.value : '',
    nama: namaEl ? namaEl.value : ''
  };

  if (!inputs.room) return toastWarn('Sila pilih bilik');
  if (state.rangeMode) {
    if (!fromDateEl || !toDateEl || !fromDateEl.value || !toDateEl.value) return toastWarn('Sila pilih julat tarikh');
  } else {
    if (!inputs.date) return toastWarn('Sila pilih tarikh');
  }
  if (!inputs.start || !inputs.end) return toastWarn('Sila tetapkan masa');
  if (!inputs.note) { markInvalid(noteEl); return toastWarn('Sila isi tujuan'); }

  const confirmMsg = state.rangeMode
    ? 'Anda pasti mahu merekod tempahan berturut (julat tarikh)?'
    : `Sahkan tempahan pada ${inputs.date}?`;

  const isConfirmed = await modalConfirm('Sahkan Tempahan?', confirmMsg);
  if (!isConfirmed) return;

  modalLoading('Menghantar tempahan...');
  try {
    let res;
    if (state.rangeMode) {
      res = await supaClient.rpc('fn_create_booking_range_secure_v2', {
        p_bilik: inputs.room,
        p_from: fromDateEl.value,
        p_to: toDateEl.value,
        p_start: inputs.start,
        p_end: inputs.end,
        p_category: inputs.category,
        p_note: inputs.note,
        p_sektor: inputs.sektor,
        p_nama: inputs.nama,
        p_session_token: getSessionToken()
      });
    } else {
      res = await supaClient.rpc('fn_create_booking_secure_v2', {
        p_bilik: inputs.room,
        p_date: inputs.date,
        p_start: inputs.start,
        p_end: inputs.end,
        p_category: inputs.category,
        p_note: inputs.note,
        p_sektor: inputs.sektor,
        p_nama: inputs.nama,
        p_session_token: getSessionToken()
      });
    }

    modalClose();

    if (res.data && res.data.ok) {
      if (isSwalAvailable()) Swal.fire('Berjaya', 'Tempahan telah direkodkan.', 'success');
      await clearActiveCaches();
      if (state.room) refreshCalendar(false);
      loadOverview(false);
      loadMyBookings(false);
      if (noteEl) noteEl.value = '';
    } else {
      if (isSwalAvailable()) Swal.fire('Gagal', res.data?.error || 'Ralat tidak diketahui', 'error');
    }
  } catch (e) {
    modalClose();
    if (isSwalAvailable()) Swal.fire('Ralat Rangkaian', e.message, 'error');
  }
}

function onRoomSelectChange(e) {
  state.room = e.target.value;
  const pickedDateEl = $('pickedDate');
  const fromDateEl = $('fromDate');
  const toDateEl = $('toDate');
  if (pickedDateEl) pickedDateEl.value = '';
  if (fromDateEl) fromDateEl.value = '';
  if (toDateEl) toDateEl.value = '';

  state.selectedDate = null;
  state.range = { from: null, to: null };
  document.querySelectorAll('.tile.sel').forEach(el => el.classList.remove('sel'));
  highlightRangeTiles();

  const noRoomHint = $('noRoomHint');
  if (state.room) {
    if (noRoomHint) noRoomHint.style.display = 'none';
    refreshCalendar(true);
  } else {
    clearElementChildren($('grid'));
    if (noRoomHint) noRoomHint.style.display = 'block';
  }
}

async function refreshCalendar(showLoading) {
  if (!state.room || !supaClient) return;

  const start = firstDay(state.year, state.month);
  const end = lastDay(state.year, state.month);
  const cacheKey = `cal_${state.room}_${state.year}_${pad2(state.month)}`;

  let hasCachedData = false;
  try {
    const cached = await getCacheEntry(cacheKey);
    if (cached && Array.isArray(cached.data)) {
      hasCachedData = true;
      state.days = processBookingsForCalendar(cached.data);
      renderCalendar();
      highlightSelectedTile();
      if (state.rangeMode) highlightRangeTiles();
    }
  } catch {}

  if (showLoading && !hasCachedData) modalLoading('Memuatkan kalendar...');

  try {
    const { data, error } = await supaClient
      .from('v_bookings_active')
      .select('*')
      .eq('bilik', state.room)
      .gte('tarikh', start)
      .lte('tarikh', end);

    if (showLoading && !hasCachedData) modalClose();

    if (error) {
      if (!hasCachedData) toastErr('Gagal memuatkan data');
      return;
    }

    const freshData = data || [];
    state.days = processBookingsForCalendar(freshData);
    renderCalendar();
    highlightSelectedTile();
    if (state.rangeMode) highlightRangeTiles();

    setCache(cacheKey, freshData, 300).catch(() => {});
  } catch {
    if (showLoading && !hasCachedData) modalClose();
    if (!hasCachedData) toastErr('Ralat rangkaian kalendar');
  }
}

function processBookingsForCalendar(bookings) {
  const map = {};
  const daysInMonth = new Date(state.year, state.month, 0).getDate();
  const today = todayYMD();

  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${state.year}-${pad2(state.month)}-${pad2(d)}`;
    map[ymd] = {
      date: ymd,
      bookings: [],
      totalMin: 0,
      count: 0,
      isPast: ymd < today,
      status: 'green'
    };
  }

  bookings.forEach(b => {
    const ymd = toYMDNorm(b.tarikh);
    if (map[ymd]) {
      const min = toMinutes(b.masa_tamat) - toMinutes(b.masa_mula);
      map[ymd].bookings.push(b);
      map[ymd].totalMin += min;
      map[ymd].count += 1;
    }
  });

  Object.values(map).forEach(day => {
    if (day.totalMin >= 360 || day.count >= 6) {
      day.status = 'red';
    } else if (day.count > 0) {
      day.status = 'orange';
    } else {
      day.status = 'green';
    }
  });

  return Object.values(map);
}

function renderCalendar() {
  const grid = $('grid');
  if (!grid) return;
  clearElementChildren(grid);

  const daysToShow = SHOW_PAST_DAYS ? state.days : state.days.filter(d => !d.isPast);

  if (daysToShow.length === 0) {
    const div = document.createElement('div');
    div.className = 'small';
    div.style.padding = '1rem';
    div.textContent = 'Tiada tarikh untuk dipaparkan.';
    grid.appendChild(div);
    return;
  }

  const docFrag = document.createDocumentFragment();
  const first = daysToShow[0];
  const weekday = (getLocalDayOfWeek(first.date) + 6) % 7;

  for (let i = 0; i < weekday; i++) {
    docFrag.appendChild(createEl('div', 'blank'));
  }

  daysToShow.forEach(day => {
    docFrag.appendChild(buildTile(day));
  });

  grid.appendChild(docFrag);
}

function buildTile(day) {
  const dow = getLocalDayOfWeek(day.date);
  const isWeekend = (dow === 0 || dow === 6);
  const tile = createEl('div', `tile ${day.isPast || isWeekend ? 'disabled' : ''}`);
  tile.dataset.date = day.date;

  const top = createEl('div', 'date');
  top.textContent = Number(day.date.slice(8, 10));

  if (!day.isPast && !isWeekend) {
    const statusMap = { red: 'PENUH', orange: 'SEPARA PENUH', green: 'TIADA TEMPAHAN' };
    const badge = createEl('span', `badge ${day.status}`);
    badge.textContent = statusMap[day.status] || '';
    top.appendChild(badge);
  }
  tile.appendChild(top);

  const body = createEl('div', 'body');
  if (!day.isPast && !isWeekend) {
    const list = createEl('div', 'small');

    if (day.bookings && day.bookings.length > 0) {
      day.bookings.sort((a, b) => a.masa_mula.localeCompare(b.masa_mula));
      day.bookings.forEach(b => {
        const p = createEl('div');
        const note = b.tujuan ? ` • ${String(b.tujuan).slice(0, 30)}${b.tujuan.length > 30 ? '…' : ''}` : '';
        p.textContent = `${toHHMM(b.masa_mula)}–${toHHMM(b.masa_tamat)} • ${b.kategori}${note}`;
        list.appendChild(p);
      });
    } else {
      const p = createEl('div');
      p.className = 'small';
      p.textContent = 'Tiada tempahan.';
      list.appendChild(p);
    }
    body.appendChild(list);
  }
  tile.appendChild(body);

  return tile;
}

function onGridClick(e) {
  const tile = e.target.closest('.tile');
  if (!tile || tile.classList.contains('disabled')) return;
  const date = tile.dataset.date;

  const dayData = state.days.find(d => d.date === date);

  if (state.rangeMode) {
    const clickedDate = date;

    if (dayData && dayData.status === 'red') {
      toastWarn('Bilik ini telah PENUH pada tarikh tersebut. Anda tidak boleh menempahnya.');
    } else {
      if (!state.range.from) {
        state.range.from = clickedDate;
        toastInfo('Tarikh mula dipilih');
      } else if (!state.range.to) {
        if (clickedDate < state.range.from) {
          state.range.to = state.range.from;
          state.range.from = clickedDate;
        } else {
          state.range.to = clickedDate;
        }
        toastOk('Julat tarikh ditetapkan');
      } else {
        state.range = { from: clickedDate, to: null };
        toastInfo('Pilih tarikh akhir');
      }

      const fromDateEl = $('fromDate');
      const toDateEl = $('toDate');
      if (fromDateEl) fromDateEl.value = state.range.from || '';
      if (toDateEl) toDateEl.value = state.range.to || '';
      onRangeChange();
    }
  } else {
    if (dayData && dayData.status === 'red') {
      toastWarn('Bilik ini telah PENUH pada tarikh tersebut. Anda tidak boleh menempahnya.');
    } else {
      document.querySelectorAll('.tile.sel').forEach(el => el.classList.remove('sel'));
      tile.classList.add('sel');
      state.selectedDate = date;
      const pickedDateEl = $('pickedDate');
      if (pickedDateEl) pickedDateEl.value = date;
      toastInfo(`Tarikh dipilih: ${state.selectedDate}`);
    }
  }

  if (dayData && dayData.bookings && dayData.bookings.length > 0) {
    const listWrapper = document.createElement('div');
    listWrapper.style.cssText = 'text-align:left; font-size:0.9rem; margin-top:10px;';

    const ul = document.createElement('ul');
    ul.style.cssText = 'padding-left: 20px; margin-bottom: 0;';

    dayData.bookings.forEach(b => {
      const li = document.createElement('li');
      li.style.cssText = 'margin-bottom:10px; border-bottom:1px dashed #ccc; padding-bottom:10px;';

      const pMasa = document.createElement('div');
      const strongMasa = document.createElement('strong');
      strongMasa.textContent = 'Masa: ';
      pMasa.appendChild(strongMasa);
      pMasa.appendChild(document.createTextNode(`${toHHMM(b.masa_mula)} - ${toHHMM(b.masa_tamat)}`));

      const pPenempah = document.createElement('div');
      const strongPenempah = document.createElement('strong');
      strongPenempah.textContent = 'Penempah: ';
      pPenempah.appendChild(strongPenempah);
      pPenempah.appendChild(document.createTextNode(`${b.nama_penempah} (${b.sektor})`));

      const pTujuan = document.createElement('div');
      const strongTujuan = document.createElement('strong');
      strongTujuan.textContent = 'Tujuan: ';
      pTujuan.appendChild(strongTujuan);
      pTujuan.appendChild(document.createTextNode(b.tujuan));

      li.appendChild(pMasa);
      li.appendChild(pPenempah);
      li.appendChild(pTujuan);
      ul.appendChild(li);
    });

    listWrapper.appendChild(ul);

    if (isSwalAvailable()) {
      Swal.fire({
        title: `Senarai Tempahan (${escapeHtml(date)})`,
        html: listWrapper.outerHTML,
        icon: 'info',
        confirmButtonText: 'Tutup',
        confirmButtonColor: '#3b82f6',
        customClass: {
          popup: 'swal-wide-popup'
        }
      });
    }
  }
}

function setRangeMode(on) {
  state.rangeMode = on;
  const toggleRangeOn = $('toggleRangeOn');
  const toggleRangeOff = $('toggleRangeOff');
  const pickedDate = $('pickedDate');
  const fromDateWrap = $('fromDateWrap');
  const toDateWrap = $('toDateWrap');
  const rangeCounter = $('rangeCounter');
  const fromDate = $('fromDate');
  const toDate = $('toDate');

  if (toggleRangeOn) toggleRangeOn.classList.toggle('active', on);
  if (toggleRangeOff) toggleRangeOff.classList.toggle('active', !on);
  if (pickedDate && pickedDate.parentElement) pickedDate.parentElement.style.display = on ? 'none' : 'block';
  if (fromDateWrap) fromDateWrap.style.display = on ? 'block' : 'none';
  if (toDateWrap) toDateWrap.style.display = on ? 'block' : 'none';
  if (rangeCounter) rangeCounter.style.display = on ? 'block' : 'none';

  state.range = { from: null, to: null };
  state.selectedDate = null;
  if (pickedDate) pickedDate.value = '';
  if (fromDate) fromDate.value = '';
  if (toDate) toDate.value = '';

  document.querySelectorAll('.tile.sel').forEach(el => el.classList.remove('sel'));
  highlightRangeTiles();
  updateRangeCounter();
}

function onDateChange(e) {
  state.selectedDate = e.target.value;
  const day = state.days.find(d => d.date === state.selectedDate);
  if (day && day.status === 'red') {
    toastWarn('Tarikh penuh!');
    state.selectedDate = null;
    const pickedDate = $('pickedDate');
    if (pickedDate) pickedDate.value = '';
    return;
  }
  highlightSelectedTile();
}

function highlightRangeTiles() {
  document.querySelectorAll('#grid .tile.range').forEach(el => el.classList.remove('range'));

  if (!state.range.from) return;

  if (state.range.from && !state.range.to) {
    const el = document.querySelector(`#grid .tile[data-date="${state.range.from}"]`);
    if (el) el.classList.add('range');
    return;
  }

  let d = state.range.from;
  if (state.range.to < state.range.from) return;

  while (d <= state.range.to) {
    const el = document.querySelector(`#grid .tile[data-date="${d}"]`);
    if (el) el.classList.add('range');
    d = addDaysYMD(d, 1);
  }
}

function highlightSelectedTile() {
  if (!state.selectedDate) return;
  const el = document.querySelector(`#grid .tile[data-date="${state.selectedDate}"]`);
  if (el) el.classList.add('sel');
}

function onRangeChange() {
  const fromDate = $('fromDate');
  const toDate = $('toDate');
  state.range.from = fromDate ? fromDate.value || null : null;
  state.range.to = toDate ? toDate.value || null : null;

  if (state.range.from && state.range.to && state.range.from > state.range.to) {
    toastWarn('Tarikh Dari mesti sebelum atau sama dengan Tarikh Hingga');
  }
  highlightRangeTiles();
  updateRangeCounter();
}

function updateRangeCounter() {
  if (!state.rangeMode) return;
  const d1 = state.range.from;
  const d2 = state.range.to;
  const rangeCounter = $('rangeCounter');
  if (!rangeCounter) return;

  if (!d1 && !d2) {
    rangeCounter.textContent = 'Pilih julat tarikh...';
    return;
  }
  if (d1 && !d2) {
    rangeCounter.textContent = 'Sila pilih tarikh akhir...';
    return;
  }

  let count = 0;
  let curr = d1;
  while (curr <= d2) {
    const day = getLocalDayOfWeek(curr);
    if (day !== 0 && day !== 6) count++;
    curr = addDaysYMD(curr, 1);
  }
  rangeCounter.textContent = `Akan ditempah: ${count} hari bekerja`;
}

async function loadOverview(loading) {
  if (!supaClient) return;
  const start = firstDay(ov.year, ov.month);
  const end = lastDay(ov.year, ov.month);
  const cacheKey = `ov_${ov.year}_${pad2(ov.month)}`;

  let hasCachedData = false;
  try {
    const cached = await getCacheEntry(cacheKey);
    if (cached && Array.isArray(cached.data)) {
      hasCachedData = true;
      ov.bookings = cached.data;
      processOverviewData(ov.bookings);
      populateUserFilter();
      renderOvTable();
      renderOvCalendar();
    }
  } catch {}

  if (loading && !hasCachedData) modalLoading('Mengemaskini...');

  try {
    const { data, error } = await supaClient
      .from('v_bookings_active')
      .select('*')
      .gte('tarikh', start)
      .lte('tarikh', end)
      .order('tarikh', { ascending: true })
      .order('masa_mula', { ascending: true });

    if (loading && !hasCachedData) modalClose();

    if (error) {
      return;
    }

    const freshData = data || [];
    ov.bookings = freshData;
    processOverviewData(ov.bookings);
    populateUserFilter();
    renderOvTable();
    renderOvCalendar();

    setCache(cacheKey, freshData, 300).catch(() => {});
  } catch {
    if (loading && !hasCachedData) modalClose();
  }
}

function populateUserFilter() {
  const filterEl = $('ovUserFilter');
  if (!filterEl) return;

  clearElementChildren(filterEl);

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '— Semua Penempah —';
  filterEl.appendChild(defaultOpt);

  if (!state.user) return;

  const today = todayYMD();
  let validBookings = ov.bookings.filter(b => toYMDNorm(b.tarikh) >= today);

  if (ov.filterRoom) {
    validBookings = validBookings.filter(b => b.bilik === ov.filterRoom);
  }

  const uniqueNames = [...new Set(validBookings.map(b => b.nama_penempah))].sort();

  uniqueNames.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    filterEl.appendChild(opt);
  });

  filterEl.value = ov.filterUser;
}

function processOverviewData(bookings) {
  const daysMap = new Map();
  const daysInMonth = new Date(ov.year, ov.month, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${ov.year}-${pad2(ov.month)}-${pad2(d)}`;
    daysMap.set(ymd, { date: ymd, rooms: [], counts: { red: 0, orange: 0 } });
  }

  const perRoomPerDay = new Map();
  bookings.forEach(b => {
    const ymd = toYMDNorm(b.tarikh);
    const key = `${ymd}|${b.bilik}`;
    if (!perRoomPerDay.has(key)) {
      perRoomPerDay.set(key, { count: 0, totalMin: 0 });
    }
    const curr = perRoomPerDay.get(key);
    curr.count += 1;
    curr.totalMin += (toMinutes(b.masa_tamat) - toMinutes(b.masa_mula));
  });

  perRoomPerDay.forEach((val, key) => {
    const [date, roomName] = key.split('|');
    const dayData = daysMap.get(date);
    if (dayData) {
      const isFull = (val.totalMin >= 360 || val.count >= 6);
      const status = isFull ? 'red' : 'orange';
      dayData.rooms.push({ room: roomName, status: status });
      if (isFull) dayData.counts.red++;
      else dayData.counts.orange++;
    }
  });

  ov.days = Array.from(daysMap.values());
}

function switchOverviewView(view) {
  ov.view = view;
  const btnViewCalendar = $('btnViewCalendar');
  const btnViewTable = $('btnViewTable');
  const ovCalendarWrap = $('ovCalendarWrap');
  const ovTableWrap = $('ovTableWrap');

  if (btnViewCalendar) btnViewCalendar.classList.toggle('active', view === 'calendar');
  if (btnViewTable) btnViewTable.classList.toggle('active', view === 'table');
  if (ovCalendarWrap) ovCalendarWrap.style.display = view === 'calendar' ? 'block' : 'none';
  if (ovTableWrap) ovTableWrap.style.display = view === 'table' ? 'block' : 'none';

  if (view === 'table') {
    renderOvTable();
  }
}

function renderOvTable() {
  const tbody = $('ovTableBody');
  if (!tbody) return;

  clearElementChildren(tbody);

  let list = ov.bookings;
  const today = todayYMD();

  list = list.filter(b => toYMDNorm(b.tarikh) >= today);

  if (ov.filterRoom) list = list.filter(b => b.bilik === ov.filterRoom);
  if (ov.filterUser) list = list.filter(b => b.nama_penempah === ov.filterUser);

  if (!list.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.style.cssText = 'text-align:center;padding:15px';
    td.textContent = 'Tiada tempahan semasa atau akan datang.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const docFrag = document.createDocumentFragment();

  list.forEach(b => {
    const tr = document.createElement('tr');

    let canAction = false;
    if (state.user && state.user.role) {
      if (state.user.role === 'ADMIN') {
        canAction = true;
      } else if (state.user.nama === b.nama_penempah) {
        canAction = true;
      }
    }

    const tdTarikh = document.createElement('td');
    tdTarikh.textContent = b.tarikh;
    tr.appendChild(tdTarikh);

    const tdMasa = document.createElement('td');
    tdMasa.style.fontFamily = 'monospace';
    tdMasa.textContent = `${toHHMM(b.masa_mula)}-${toHHMM(b.masa_tamat)}`;
    tr.appendChild(tdMasa);

    const tdBilik = document.createElement('td');
    tdBilik.textContent = b.bilik;
    tr.appendChild(tdBilik);

    const tdTujuan = document.createElement('td');
    tdTujuan.textContent = b.tujuan;
    tr.appendChild(tdTujuan);

    const tdPenempah = document.createElement('td');
    const strongPenempah = document.createElement('strong');
    strongPenempah.textContent = b.nama_penempah;
    tdPenempah.appendChild(strongPenempah);
    tr.appendChild(tdPenempah);

    const tdAction = document.createElement('td');
    tdAction.style.textAlign = 'center';

    if (canAction) {
      const divWrap = document.createElement('div');
      divWrap.style.cssText = 'display:flex; gap:8px; justify-content:center;';

      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'btn-icon-edit-user';
      btnEdit.dataset.id = b.booking_id;
      btnEdit.title = 'Kemaskini Tempahan';
      btnEdit.textContent = '✏️';
      btnEdit.style.cssText = 'background:none; border:none; cursor:pointer; font-size:1.1rem; min-height:36px;';
      btnEdit.addEventListener('click', () => openUserEditModal(btnEdit.dataset.id));
      divWrap.appendChild(btnEdit);

      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'btn-icon-del';
      btnDel.dataset.id = b.booking_id;
      btnDel.title = 'Batal Tempahan';
      btnDel.textContent = '🗑️';
      btnDel.style.cssText = 'background:none; border:none; cursor:pointer; font-size:1.1rem; min-height:36px;';
      btnDel.addEventListener('click', () => cancelBooking(btnDel.dataset.id));
      divWrap.appendChild(btnDel);

      tdAction.appendChild(divWrap);
    } else {
      const spanPlaceholder = document.createElement('span');
      spanPlaceholder.style.cssText = 'color:#ccc; font-size:0.8rem;';
      spanPlaceholder.textContent = '-';
      tdAction.appendChild(spanPlaceholder);
    }

    tr.appendChild(tdAction);
    docFrag.appendChild(tr);
  });

  tbody.appendChild(docFrag);
}

function renderOvCalendar() {
  const grid = $('ovGrid');
  if (!grid) return;

  clearElementChildren(grid);

  const lastDayOfMonth = new Date(ov.year, ov.month, 0).getDate();
  const firstDow = (new Date(ov.year, ov.month - 1, 1).getDay() + 6) % 7;

  const docFrag = document.createDocumentFragment();

  for (let i = 0; i < firstDow; i++) {
    docFrag.appendChild(createEl('div', 'blank'));
  }

  const dayMap = new Map((ov.days || []).map(d => [d.date, d]));

  for (let d = 1; d <= lastDayOfMonth; d++) {
    const ymd = `${ov.year}-${pad2(ov.month)}-${pad2(d)}`;
    const dayData = dayMap.get(ymd);

    const tile = createEl('div', 'tile');

    const top = createEl('div', 'date');
    top.textContent = d;

    if (dayData && (dayData.counts.red > 0 || dayData.counts.orange > 0)) {
      const div = createEl('div', 'cnt-group');
      if (dayData.counts.red > 0) {
        const spanRed = document.createElement('span');
        spanRed.className = 'cnt-pill red';
        spanRed.textContent = `P:${dayData.counts.red}`;
        div.appendChild(spanRed);
      }
      if (dayData.counts.orange > 0) {
        const spanOrange = document.createElement('span');
        spanOrange.className = 'cnt-pill orange';
        spanOrange.textContent = `S:${dayData.counts.orange}`;
        div.appendChild(spanOrange);
      }
      top.appendChild(div);
    }
    tile.appendChild(top);

    const body = createEl('div', 'body');
    if (dayData && dayData.rooms.length > 0) {
      const list = createEl('div', 'listRooms');
      dayData.rooms.forEach(it => {
        const pill = createEl('span', `pill ${it.status}`);
        pill.textContent = it.room;
        list.appendChild(pill);
      });
      body.appendChild(list);
    }
    tile.appendChild(body);
    docFrag.appendChild(tile);
  }

  grid.appendChild(docFrag);
  renderOvSummary();
}

function renderOvSummary() {
  const list = $('ovSummaryList');
  if (!list) return;
  clearElementChildren(list);

  const counter = new Map();
  ov.bookings.forEach(b => {
    counter.set(b.bilik, (counter.get(b.bilik) || 0) + 1);
  });

  if (counter.size === 0) {
    list.textContent = 'Tiada data.';
    return;
  }

  const rows = ROOM_OPTIONS
    .map(room => [room, counter.get(room) || 0])
    .filter(x => x[1] > 0)
    .sort((a, b) => (b[1] - a[1]));

  const docFrag = document.createDocumentFragment();

  rows.forEach(([room, c], index) => {
    const wrapper = document.createElement('span');
    wrapper.appendChild(document.createTextNode(`• ${room} (`));
    const strong = document.createElement('strong');
    strong.textContent = c;
    wrapper.appendChild(strong);
    wrapper.appendChild(document.createTextNode(' tempahan)'));
    docFrag.appendChild(wrapper);

    if (index < rows.length - 1) {
      docFrag.appendChild(document.createElement('br'));
    }
  });

  list.appendChild(docFrag);
  const ovSummaryWrap = $('ovSummaryWrap');
  if (ovSummaryWrap) ovSummaryWrap.style.display = 'block';
}

async function cancelBooking(id) {
  const isConfirmed = await modalConfirm(
    'HAPUSKAN TEMPAHAN?',
    'Tindakan ini akan memadam rekod anda secara kekal dan tidak boleh dikembalikan.',
    'Ya, Hapus Serta-merta'
  );

  if (isConfirmed) {
    if (!supaClient) return toastErr('Perkhidmatan belum bersedia.');
    modalLoading('Membatalkan...');
    const { data } = await supaClient.rpc('fn_cancel_booking_secure_v2', {
      p_booking_id: id,
      p_email: state.user.email,
      p_reason: 'Dibatalkan oleh pengguna',
      p_session_token: getSessionToken()
    });
    modalClose();

    if (data && data.ok) {
      toastOk('Berjaya dibatalkan');
      await clearActiveCaches();
      loadOverview(false);
      loadMyBookings(false);
      if (state.room) refreshCalendar(false);
      const tabAdminSearch = $('tabAdminSearch');
      if (tabAdminSearch && tabAdminSearch.classList.contains('active')) executeAdminSearch();
    } else {
      if (isSwalAvailable()) Swal.fire('Gagal', data?.error || 'Ralat', 'error');
    }
  }
}

async function openUnifiedBookingEditModal(booking, titleText, recordId, onAfterUpdate) {
  if (!booking || !isSwalAvailable()) return;

  const { value: form } = await Swal.fire({
    title: titleText,
    html: `
      <label class="small">Tarikh</label><input id="eDate" type="date" class="swal2-input" value="${escapeHtml(toYMDNorm(booking.tarikh))}">
      <label class="small">Masa Mula</label><input id="eStart" type="time" class="swal2-input" value="${escapeHtml(toHHMM(booking.masa_mula))}">
      <label class="small">Masa Tamat</label><input id="eEnd" type="time" class="swal2-input" value="${escapeHtml(toHHMM(booking.masa_tamat))}">
      <label class="small">Tujuan</label><input id="eNote" class="swal2-input" value="${escapeHtml(booking.tujuan)}">
    `,
    showCancelButton: true,
    confirmButtonText: 'Simpan',
    preConfirm: () => ({
      d: $('eDate').value,
      s: $('eStart').value,
      e: $('eEnd').value,
      n: $('eNote').value
    })
  });

  if (form) {
    if (!supaClient) return toastErr('Perkhidmatan belum bersedia.');
    const isConfirmed = await modalConfirm(
      'Simpan Perubahan?',
      'Maklumat tempahan asal akan digantikan dengan data baharu.'
    );
    if (!isConfirmed) return;

    modalLoading('Menyimpan...');
    const { data } = await supaClient.rpc('fn_update_booking_secure_v2', {
      p_booking_id: recordId,
      p_email: state.user.email,
      p_date: form.d,
      p_start: form.s,
      p_end: form.e,
      p_category: booking.kategori,
      p_note: form.n,
      p_sektor: booking.sektor,
      p_nama: booking.nama_penempah,
      p_session_token: getSessionToken()
    });
    modalClose();

    if (data && data.ok) {
      toastOk('Tempahan berjaya dikemaskini.');
      await clearActiveCaches();
      if (typeof onAfterUpdate === 'function') {
        await onAfterUpdate();
      }
    } else {
      Swal.fire('Ralat', data?.error || 'Ralat tidak diketahui', 'error');
    }
  }
}

async function openUserEditModal(id) {
  let b = ov.bookings.find(x => x.booking_id === id);
  if (!b) b = state.myBookings.find(x => x.booking_id === id);
  if (!b) return;

  await openUnifiedBookingEditModal(b, 'Kemaskini Tempahan', id, async () => {
    loadOverview(false);
    loadMyBookings(false);
    if (state.room === b.bilik) refreshCalendar(false);
  });
}

async function loadMyBookings(showLoading) {
  if (!state.user || !supaClient) return;

  const today = todayYMD();
  const cacheKey = `my_${encodeURIComponent(state.user.nama)}_${today}`;

  let hasCachedData = false;
  try {
    const cached = await getCacheEntry(cacheKey);
    if (cached && Array.isArray(cached.data)) {
      hasCachedData = true;
      state.myBookings = cached.data;
      renderMyBookingsTable();
    }
  } catch {}

  if (showLoading && !hasCachedData) modalLoading('Memuatkan senarai tempahan anda...');

  try {
    const { data, error } = await supaClient
      .from('v_bookings_active')
      .select('*')
      .eq('nama_penempah', state.user.nama)
      .gte('tarikh', today)
      .order('tarikh', { ascending: true })
      .order('masa_mula', { ascending: true });

    if (showLoading && !hasCachedData) modalClose();

    if (error) {
      if (!hasCachedData) toastErr('Gagal memuatkan tempahan peribadi.');
      return;
    }

    const freshData = data || [];
    state.myBookings = freshData;
    renderMyBookingsTable();

    setCache(cacheKey, freshData, 180).catch(() => {});
  } catch {
    if (showLoading && !hasCachedData) modalClose();
    if (!hasCachedData) toastErr('Ralat rangkaian tempahan saya');
  }
}

function renderMyBookingsTable() {
  const tbody = $('myBookingsTableBody');
  if (!tbody) return;
  clearElementChildren(tbody);

  if (!state.myBookings || state.myBookings.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.style.cssText = 'text-align:center;padding:15px';
    td.textContent = 'Tiada tempahan aktif atau akan datang.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const docFrag = document.createDocumentFragment();

  state.myBookings.forEach(b => {
    const tr = document.createElement('tr');

    const tdTarikh = document.createElement('td');
    tdTarikh.textContent = b.tarikh;
    tr.appendChild(tdTarikh);

    const tdMasa = document.createElement('td');
    tdMasa.style.fontFamily = 'monospace';
    tdMasa.textContent = `${toHHMM(b.masa_mula)}-${toHHMM(b.masa_tamat)}`;
    tr.appendChild(tdMasa);

    const tdBilik = document.createElement('td');
    tdBilik.textContent = b.bilik;
    tr.appendChild(tdBilik);

    const tdTujuan = document.createElement('td');
    tdTujuan.textContent = b.tujuan;
    tr.appendChild(tdTujuan);

    const tdAction = document.createElement('td');
    tdAction.style.textAlign = 'center';

    const divWrap = document.createElement('div');
    divWrap.style.cssText = 'display:flex; gap:8px; justify-content:center;';

    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'btn-icon-edit-my';
    btnEdit.dataset.id = b.booking_id;
    btnEdit.title = 'Kemaskini';
    btnEdit.textContent = '✏️';
    btnEdit.style.cssText = 'background:none; border:none; cursor:pointer; font-size:1.1rem; min-height:36px;';
    btnEdit.addEventListener('click', () => openUserEditModal(btnEdit.dataset.id));
    divWrap.appendChild(btnEdit);

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'btn-icon-del-my';
    btnDel.dataset.id = b.booking_id;
    btnDel.title = 'Batal';
    btnDel.textContent = '🗑️';
    btnDel.style.cssText = 'background:none; border:none; cursor:pointer; font-size:1.1rem; min-height:36px;';
    btnDel.addEventListener('click', () => cancelBooking(btnDel.dataset.id));
    divWrap.appendChild(btnDel);

    tdAction.appendChild(divWrap);
    tr.appendChild(tdAction);

    docFrag.appendChild(tr);
  });

  tbody.appendChild(docFrag);
}

async function adminAddUser() {
  if (!isSwalAvailable()) return;

  const { value: formValues } = await Swal.fire({
    title: 'Tambah Pegawai Baharu',
    html: `
      <div style="text-align:left;">
        <label class="small">Nama Penuh</label>
        <input id="swal-new-nama" class="swal2-input" placeholder="Contoh: Ahmad bin Ali" style="margin-top:5px; margin-bottom:15px;">
        <label class="small">Sektor / Unit</label>
        <input id="swal-new-sektor" class="swal2-input" placeholder="Contoh: Sektor Pengurusan" style="margin-top:5px; margin-bottom:15px;">
        <label class="small">Emel Rasmi (ID Log Masuk)</label>
        <input id="swal-new-email" type="email" class="swal2-input" placeholder="Contoh: ahmad@moe.gov.my" style="margin-top:5px; margin-bottom:15px;">
        <label class="small">Kata Laluan Sementara</label>
        <input id="swal-new-pass" type="text" class="swal2-input" value="ppdag@12345" style="margin-top:5px;">
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Daftar Pegawai',
    cancelButtonText: 'Batal',
    preConfirm: () => {
      const namaEl = $('swal-new-nama');
      const sektorEl = $('swal-new-sektor');
      const emailEl = $('swal-new-email');
      const passEl = $('swal-new-pass');

      const nama = namaEl ? namaEl.value.trim() : '';
      const sektor = sektorEl ? sektorEl.value.trim() : '';
      const email = emailEl ? emailEl.value.trim() : '';
      const pass = passEl ? passEl.value.trim() : '';

      if (!nama || !sektor || !email || !pass) {
        Swal.showValidationMessage('Sila lengkapkan semua ruang.');
        return false;
      }
      return { nama, sektor, email, pass };
    }
  });

  if (formValues) {
    if (!supaClient) return toastErr('Perkhidmatan belum bersedia.');
    modalLoading('Mendaftar Pegawai...');

    const { data } = await supaClient.rpc('fn_admin_create_user_v2', {
      p_admin_email: state.user.email,
      p_session_token: getSessionToken(),
      p_new_email: formValues.email,
      p_new_password: formValues.pass,
      p_new_name: formValues.nama,
      p_new_sektor: formValues.sektor
    });

    modalClose();

    if (data && data.ok) {
      Swal.fire('Berjaya', 'Pegawai baharu telah didaftarkan.', 'success');
      loadAdminUserList();
    } else {
      Swal.fire('Gagal', data?.error || 'Ralat semasa mendaftar pegawai', 'error');
    }
  }
}

async function loadAdminUserList() {
  const tbody = $('adminUserListBody');
  if (!tbody || !supaClient || !state.user) return;

  if (adminUserListAbortController) {
    adminUserListAbortController.abort();
  }
  const controller = new AbortController();
  adminUserListAbortController = controller;

  clearElementChildren(tbody);

  const loadingTr = document.createElement('tr');
  const loadingTd = document.createElement('td');
  loadingTd.colSpan = 4;
  loadingTd.style.cssText = 'text-align:center;padding:15px';
  loadingTd.textContent = 'Memuatkan...';
  loadingTr.appendChild(loadingTd);
  tbody.appendChild(loadingTr);

  const { data, error } = await supaClient.rpc('fn_get_all_users_secure_v2', {
    p_email: state.user.email,
    p_session_token: getSessionToken()
  });

  if (controller.signal.aborted) return;

  clearElementChildren(tbody);

  if (error || !data || !data.ok) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.style.cssText = 'text-align:center;color:red';
    td.textContent = 'Gagal akses data pengguna.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const users = data.data;

  if (!users || users.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.style.cssText = 'text-align:center;padding:15px';
    td.textContent = 'Tiada pengguna ditemui.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const docFrag = document.createDocumentFragment();

  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #f1f5f9';

    const tdNama = document.createElement('td');
    tdNama.style.padding = '10px';
    tdNama.textContent = u.nama;
    tr.appendChild(tdNama);

    const tdSektor = document.createElement('td');
    tdSektor.style.padding = '10px';
    tdSektor.textContent = u.sektor;
    tr.appendChild(tdSektor);

    const tdEmail = document.createElement('td');
    tdEmail.style.padding = '10px';
    tdEmail.textContent = u.email;
    tr.appendChild(tdEmail);

    const tdAction = document.createElement('td');
    tdAction.style.cssText = 'padding:10px; text-align:center; white-space:nowrap;';

    const btnReset = document.createElement('button');
    btnReset.type = 'button';
    btnReset.className = 'btn-reset';
    btnReset.dataset.id = u.id;
    btnReset.dataset.email = u.email;
    btnReset.textContent = 'Reset';
    btnReset.onclick = () => adminResetPassword(btnReset.dataset.id, btnReset.dataset.email);
    tdAction.appendChild(btnReset);

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'btn-reset btn-delete-user';
    btnDel.dataset.id = u.id;
    btnDel.dataset.email = u.email;
    btnDel.textContent = 'Buang';
    btnDel.style.cssText = 'color:var(--bad); border-color:var(--bad); margin-left:5px;';
    btnDel.onclick = () => adminDeleteUser(btnDel.dataset.id, btnDel.dataset.email);
    tdAction.appendChild(btnDel);

    tr.appendChild(tdAction);
    docFrag.appendChild(tr);
  });

  tbody.appendChild(docFrag);
}

async function adminResetPassword(id, email) {
  if (!isSwalAvailable()) return;

  const { isConfirmed } = await Swal.fire({
    title: 'Reset Kata Laluan?',
    text: `Reset password ${email} kepada 'ppdag@12345'?`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Ya, Reset'
  });
  if (isConfirmed) {
    if (!supaClient) return toastErr('Perkhidmatan belum bersedia.');
    modalLoading('Memproses...');
    const { data } = await supaClient.rpc('fn_admin_reset_password_v2', {
      p_admin_email: state.user.email,
      p_target_id: id,
      p_session_token: getSessionToken()
    });
    modalClose();
    if (data && data.ok) Swal.fire('Berjaya', 'Kata laluan telah ditetapkan semula.', 'success');
    else Swal.fire('Gagal', data?.error || 'Ralat tidak diketahui', 'error');
  }
}

async function adminDeleteUser(id, email) {
  if (!isSwalAvailable()) return;

  if (email === state.user.email) {
    return Swal.fire('Tidak Dibenarkan', 'Anda tidak boleh membuang akaun anda sendiri.', 'warning');
  }

  const { isConfirmed } = await Swal.fire({
    title: 'Buang Pegawai?',
    text: `Anda pasti mahu memadam akaun pegawai ${email}? Semua rekod login berkaitan akan terhapus. (Sila pastikan anda juga menguruskan tempahan bilik mereka jika perlu).`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Ya, Padam',
    cancelButtonText: 'Batal'
  });

  if (isConfirmed) {
    if (!supaClient) return toastErr('Perkhidmatan belum bersedia.');
    modalLoading('Memadam akaun...');

    const { data } = await supaClient.rpc('fn_admin_delete_user_v2', {
      p_admin_email: state.user.email,
      p_session_token: getSessionToken(),
      p_target_id: id
    });

    modalClose();

    if (data && data.ok) {
      toastOk('Akaun pegawai telah dipadam.');
      loadAdminUserList();
    } else {
      Swal.fire('Gagal', data?.error || 'Ralat semasa memadam pegawai', 'error');
    }
  }
}

async function loadAdminBookingList() {
  const adminRoom = $('adminRoom');
  const room = adminRoom ? adminRoom.value : '';
  if (!room) return toastWarn('Sila pilih bilik dahulu');

  const listDiv = $('adminList');
  if (!listDiv || !supaClient || !state.user) return;

  if (adminBookingListAbortController) {
    adminBookingListAbortController.abort();
  }
  const controller = new AbortController();
  adminBookingListAbortController = controller;

  clearElementChildren(listDiv);

  const loadingDiv = document.createElement('div');
  loadingDiv.style.cssText = 'padding:10px;text-align:center';
  loadingDiv.textContent = 'Memuatkan...';
  listDiv.appendChild(loadingDiv);

  const { data } = await supaClient.rpc('fn_admin_list_bookings_v2', {
    p_email: state.user.email,
    p_bilik: room,
    p_session_token: getSessionToken()
  });

  if (controller.signal.aborted) return;

  clearElementChildren(listDiv);

  if (!data || !data.ok) {
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.textContent = 'Ralat memuatkan data.';
    listDiv.appendChild(errorDiv);
    return;
  }

  const bookings = data.data;
  adminState.bookings = bookings;

  if (bookings.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'padding:10px;text-align:center';
    emptyDiv.textContent = 'Tiada tempahan akan datang.';
    listDiv.appendChild(emptyDiv);
    return;
  }

  const table = document.createElement('table');
  table.style.cssText = 'width:100%; border-collapse:collapse; font-size:0.85rem;';

  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  trHead.style.cssText = 'background:#f8fafc; text-align:left;';

  const thChk = document.createElement('th');
  thChk.style.cssText = 'padding:8px;width:30px';
  const chkAll = document.createElement('input');
  chkAll.type = 'checkbox';
  chkAll.id = 'chkAllDynamic';
  thChk.appendChild(chkAll);
  trHead.appendChild(thChk);

  ['Tarikh', 'Masa', 'Tujuan', 'Penempah', 'Edit'].forEach((text, i) => {
    const th = document.createElement('th');
    th.style.padding = '8px';
    if (i === 4) th.style.textAlign = 'center';
    th.textContent = text;
    trHead.appendChild(th);
  });

  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  bookings.forEach(b => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #eee';

    const tdChk = document.createElement('td');
    tdChk.style.cssText = 'padding:8px;text-align:center';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'chk-item';
    chk.value = b.id;
    tdChk.appendChild(chk);
    tr.appendChild(tdChk);

    const tdTarikh = document.createElement('td');
    tdTarikh.style.padding = '8px';
    tdTarikh.textContent = b.tarikh;
    tr.appendChild(tdTarikh);

    const tdMasa = document.createElement('td');
    tdMasa.style.padding = '8px';
    tdMasa.textContent = `${toHHMM(b.masa_mula)}-${toHHMM(b.masa_tamat)}`;
    tr.appendChild(tdMasa);

    const tdTujuan = document.createElement('td');
    tdTujuan.style.padding = '8px';
    tdTujuan.textContent = b.tujuan;
    tr.appendChild(tdTujuan);

    const tdPenempah = document.createElement('td');
    tdPenempah.style.padding = '8px';
    tdPenempah.textContent = b.nama_penempah;
    tr.appendChild(tdPenempah);

    const tdAction = document.createElement('td');
    tdAction.style.cssText = 'padding:8px;text-align:center';
    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'btn-edit';
    btnEdit.dataset.id = b.id;
    btnEdit.style.cssText = 'border:none;background:none;cursor:pointer;min-height:36px;';
    btnEdit.textContent = '✏️';
    btnEdit.onclick = () => openEditModal(btnEdit.dataset.id);
    tdAction.appendChild(btnEdit);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  listDiv.appendChild(table);

  const chkAllDynamic = $('chkAllDynamic');
  if (chkAllDynamic) {
    chkAllDynamic.addEventListener('change', (e) => {
      document.querySelectorAll('.chk-item').forEach(c => { c.checked = e.target.checked; });
    });
  }
}

async function executeBulkCancel() {
  if (!isSwalAvailable()) return;

  const checked = document.querySelectorAll('.chk-item:checked');
  if (checked.length === 0) return toastWarn('Pilih sekurang-kurangnya satu tempahan.');

  const ids = Array.from(checked).map(c => c.value);

  const { value: reason } = await Swal.fire({
    title: 'Sebab Pembatalan?',
    input: 'text',
    inputPlaceholder: 'Cth: Penyelenggaraan Bilik',
    showCancelButton: true
  });

  if (reason) {
    if (!supaClient) return toastErr('Perkhidmatan belum bersedia.');
    const isConfirmed = await modalConfirm(
      'Sahkan Pembatalan Pukal?',
      `Anda akan membatalkan ${ids.length} tempahan terpilih dengan sebab: "${escapeHtml(reason)}".`
    );

    if (!isConfirmed) return;

    modalLoading('Membatalkan...');
    const { data } = await supaClient.rpc('fn_delete_booking_bulk_secure_v2', {
      p_ids: ids,
      p_email: state.user.email,
      p_reason: reason,
      p_session_token: getSessionToken()
    });
    modalClose();

    if (data && data.ok) {
      toastOk(`${data.updated} tempahan dibatalkan.`);
      await clearActiveCaches();
      loadAdminBookingList();
      loadMyBookings(false);
      if (state.room) refreshCalendar(false);
      loadOverview(false);
    } else {
      Swal.fire('Ralat', data?.error, 'error');
    }
  }
}

async function openEditModal(id) {
  const b = adminState.bookings.find(x => x.id === id);
  if (!b) return;

  await openUnifiedBookingEditModal(b, 'Edit Tempahan', id, async () => {
    loadAdminBookingList();
    loadMyBookings(false);
    if (state.room) refreshCalendar(false);
    loadOverview(false);
    const tabAdminSearch = $('tabAdminSearch');
    if (tabAdminSearch && tabAdminSearch.classList.contains('active')) executeAdminSearch();
  });
}

async function executeAdminSearch() {
  const startDateEl = $('adminSearchStartDate');
  const endDateEl = $('adminSearchEndDate');
  const roomEl = $('adminSearchRoom');
  const startDate = startDateEl ? startDateEl.value : '';
  const endDate = endDateEl ? endDateEl.value : '';
  const room = roomEl ? roomEl.value : '';
  const tbody = $('adminSearchTableBody');

  if (!tbody) return;

  if (!startDate || !endDate) {
    return toastWarn('Sila pilih tarikh mula dan akhir');
  }
  if (startDate > endDate) {
    return toastWarn('Tarikh mula mesti sebelum atau sama dengan tarikh akhir');
  }

  if (!supaClient) return;

  if (adminSearchAbortController) {
    adminSearchAbortController.abort();
  }
  const controller = new AbortController();
  adminSearchAbortController = controller;

  clearElementChildren(tbody);

  const loadingTr = document.createElement('tr');
  const loadingTd = document.createElement('td');
  loadingTd.colSpan = 7;
  loadingTd.style.cssText = 'text-align:center;padding:15px';
  loadingTd.textContent = 'Memuatkan...';
  loadingTr.appendChild(loadingTd);
  tbody.appendChild(loadingTr);

  const adminSearchStats = $('adminSearchStats');
  if (adminSearchStats) adminSearchStats.style.display = 'none';

  const btnAdminPrintSearch = $('btnAdminPrintSearch');
  if (btnAdminPrintSearch) btnAdminPrintSearch.style.display = 'none';

  modalLoading('Mencari rekod...');

  let query = supaClient
    .from('v_bookings_active')
    .select('*')
    .gte('tarikh', startDate)
    .lte('tarikh', endDate)
    .order('tarikh', { ascending: true })
    .order('masa_mula', { ascending: true });

  if (room) {
    query = query.eq('bilik', room);
  }

  if (typeof query.abortSignal === 'function') {
    query = query.abortSignal(controller.signal);
  }

  const { data, error } = await query;

  if (controller.signal.aborted) return;

  modalClose();
  clearElementChildren(tbody);

  if (error) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.style.cssText = 'text-align:center;color:red';
    td.textContent = 'Ralat memuatkan carian.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return toastErr('Gagal membuat carian');
  }

  adminState.searchData = data || [];

  populateAdminSearchUserFilter();
  renderAdminSearchTable();
}

function populateAdminSearchUserFilter() {
  const filterEl = $('adminSearchUserFilter');
  if (!filterEl) return;

  clearElementChildren(filterEl);

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '— Semua Penempah —';
  filterEl.appendChild(defaultOpt);

  if (!adminState.searchData || adminState.searchData.length === 0) {
    filterEl.disabled = true;
    return;
  }

  const uniqueNames = [...new Set(adminState.searchData.map(b => b.nama_penempah))].sort();

  uniqueNames.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    filterEl.appendChild(opt);
  });

  filterEl.disabled = false;
  filterEl.value = '';
}

function renderAdminSearchTable() {
  const tbody = $('adminSearchTableBody');
  if (!tbody) return;

  let data = adminState.searchData;
  const filterUserEl = $('adminSearchUserFilter');
  const filterUser = filterUserEl ? filterUserEl.value : '';

  if (filterUser) {
    data = data.filter(b => b.nama_penempah === filterUser);
  }

  clearElementChildren(tbody);

  const adminSearchStats = $('adminSearchStats');
  const btnAdminPrintSearch = $('btnAdminPrintSearch');

  if (!data || data.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.style.cssText = 'text-align:center;padding:15px';
    td.textContent = 'Tiada tempahan ditemui untuk kriteria ini.';
    tr.appendChild(td);
    tbody.appendChild(tr);

    if (adminSearchStats) adminSearchStats.style.display = 'none';
    if (btnAdminPrintSearch) btnAdminPrintSearch.style.display = 'none';
    return;
  }

  const totalBookings = data.length;
  const uniqueUsers = new Set(data.map(b => b.nama_penempah)).size;

  const sektorCounts = {};
  data.forEach(b => {
    const sek = b.sektor || 'Tiada Sektor';
    sektorCounts[sek] = (sektorCounts[sek] || 0) + 1;
  });

  let topSektor = '-';
  let maxSektorCount = 0;
  for (const sek in sektorCounts) {
    if (sektorCounts[sek] > maxSektorCount) {
      maxSektorCount = sektorCounts[sek];
      topSektor = `${sek} (${maxSektorCount})`;
    }
  }

  const statTotalBookings = $('statTotalBookings');
  if (statTotalBookings) statTotalBookings.textContent = totalBookings;
  const statUniqueUsers = $('statUniqueUsers');
  if (statUniqueUsers) statUniqueUsers.textContent = uniqueUsers;
  const statTopSektor = $('statTopSektor');
  if (statTopSektor) statTopSektor.textContent = topSektor;
  if (adminSearchStats) adminSearchStats.style.display = 'block';
  if (btnAdminPrintSearch) btnAdminPrintSearch.style.display = 'inline-block';

  const docFrag = document.createDocumentFragment();

  data.forEach(b => {
    const tr = document.createElement('tr');

    const tdTarikh = document.createElement('td');
    tdTarikh.textContent = b.tarikh;
    tr.appendChild(tdTarikh);

    const tdMasa = document.createElement('td');
    tdMasa.style.fontFamily = 'monospace';
    tdMasa.textContent = `${toHHMM(b.masa_mula)}-${toHHMM(b.masa_tamat)}`;
    tr.appendChild(tdMasa);

    const tdBilik = document.createElement('td');
    tdBilik.textContent = b.bilik;
    tr.appendChild(tdBilik);

    const tdTujuan = document.createElement('td');
    tdTujuan.textContent = b.tujuan;
    tr.appendChild(tdTujuan);

    const tdSektor = document.createElement('td');
    tdSektor.textContent = b.sektor || '-';
    tr.appendChild(tdSektor);

    const tdPenempah = document.createElement('td');
    const strongPenempah = document.createElement('strong');
    strongPenempah.textContent = b.nama_penempah;
    tdPenempah.appendChild(strongPenempah);
    tr.appendChild(tdPenempah);

    const tdAction = document.createElement('td');
    tdAction.style.textAlign = 'center';

    const divWrap = document.createElement('div');
    divWrap.style.cssText = 'display:flex; gap:8px; justify-content:center;';

    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'btn-icon-edit-search';
    btnEdit.dataset.id = b.booking_id;
    btnEdit.title = 'Kemaskini Tempahan';
    btnEdit.textContent = '✏️';
    btnEdit.style.cssText = 'background:none; border:none; cursor:pointer; font-size:1.1rem; min-height:36px;';
    btnEdit.addEventListener('click', () => openAdminSearchEditModal(btnEdit.dataset.id, adminState.searchData));
    divWrap.appendChild(btnEdit);

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'btn-icon-del-search';
    btnDel.dataset.id = b.booking_id;
    btnDel.title = 'Batal Tempahan';
    btnDel.textContent = '🗑️';
    btnDel.style.cssText = 'background:none; border:none; cursor:pointer; font-size:1.1rem; min-height:36px;';
    btnDel.addEventListener('click', async () => {
      await cancelBooking(btnDel.dataset.id);
    });
    divWrap.appendChild(btnDel);

    tdAction.appendChild(divWrap);
    tr.appendChild(tdAction);

    docFrag.appendChild(tr);
  });

  tbody.appendChild(docFrag);
}

async function openAdminSearchEditModal(id, searchData) {
  const b = searchData.find(x => x.booking_id === id);
  if (!b) return;

  await openUnifiedBookingEditModal(b, 'Edit Tempahan (Admin)', id, async () => {
    executeAdminSearch();
    loadOverview(false);
    loadMyBookings(false);
    if (state.room === b.bilik) refreshCalendar(false);
  });
}