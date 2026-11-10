var currentAdmin = null;
window.currentAdmin = null;

var adminMemoData = [];
var adminPegawaiData = [];
var adminSistemData = [];
var isProcessingBatch = false;

var adminMemoCurrentPage = 1;
const ADMIN_MEMO_PAGE_SIZE = 20;
var currentFilteredAdminMemo = [];

var adminPegawaiCurrentPage = 1;
const ADMIN_PEGAWAI_PAGE_SIZE = 20;
var currentFilteredAdminPegawai = [];

var managerMemoData = [];
var managerSelected = new Map();
var managerSelectedMemos = new Set();
var isProcessingTppdBatch = false;

var adminEditSelected = new Map();

var adminSortState = {
  memo: { column: 'created_at', direction: 'desc' },
  pegawai: { column: 'nama', direction: 'asc' }
};

document.addEventListener('DOMContentLoaded', () => {
  checkAdminSession();
  setupAdminEventListeners();
  checkUrlIntercept();
});

function setupAdminEventListeners() {
  document.getElementById('btnBukaLoginAdmin')?.addEventListener('click', () => toggleModal('modalLoginAdmin', true));
  document.getElementById('btnBatalLogin')?.addEventListener('click', () => toggleModal('modalLoginAdmin', false));
  document.getElementById('btnLogKeluarAdmin')?.addEventListener('click', handleLogout);
  document.getElementById('formLoginAdmin')?.addEventListener('submit', handleLogin);

  document.getElementById('subTabBtnMemo')?.addEventListener('click', () => switchAdminSection('memo'));
  document.getElementById('subTabBtnPegawai')?.addEventListener('click', () => switchAdminSection('pegawai'));
  document.getElementById('subTabBtnSistem')?.addEventListener('click', () => switchAdminSection('sistem'));

  document.getElementById('btnTambahPegawai')?.addEventListener('click', () => openPegawaiModal());
  document.getElementById('formPegawai')?.addEventListener('submit', handlePegawaiSubmit);

  document.getElementById('pegawaiSektorSelect')?.addEventListener('change', function() {
    const manualInput = document.getElementById('pegawaiSektorManual');
    if (manualInput) {
      manualInput.classList.toggle('hidden', this.value !== 'MANUAL');
      if (this.value === 'MANUAL') manualInput.focus();
    }
  });

  document.getElementById('pegawaiUnitSelect')?.addEventListener('change', function() {
    const manualInput = document.getElementById('pegawaiUnitManual');
    if (manualInput) {
      manualInput.classList.toggle('hidden', this.value !== 'MANUAL');
      if (this.value === 'MANUAL') manualInput.focus();
    }
  });

  document.getElementById('formMemo')?.addEventListener('submit', handleMemoSubmit);
  document.getElementById('adminEditSektor')?.addEventListener('change', populateAdminEditUnit);
  document.getElementById('adminEditUnit')?.addEventListener('change', populateAdminEditNama);

  document.getElementById('carianPegawaiEdit')?.addEventListener('input', window.handleCarianAdminEdit);
  document.getElementById('carianPegawaiTppd')?.addEventListener('input', window.handleCarianTppd);

  document.getElementById('btnPukalSegerak')?.addEventListener('click', startBatchSync);
  document.getElementById('btnPukalPadam')?.addEventListener('click', startBatchDelete);

  document.getElementById('btnTambahAdmin')?.addEventListener('click', () => toggleModal('modalTambahAdmin', true));
  document.getElementById('formTambahAdmin')?.addEventListener('submit', handleTambahAdminSubmit);

  document.getElementById('adminSearchMemo')?.addEventListener('input', (e) => {
    adminMemoCurrentPage = 1;
    filterAdminTable('memo', e.target.value);
  });
  document.getElementById('adminSearchPegawai')?.addEventListener('input', (e) => {
    adminPegawaiCurrentPage = 1;
    filterAdminTable('pegawai', e.target.value);
  });

  document.getElementById('tppdSektorSelect')?.addEventListener('change', window.populateManagerUnit);
  document.getElementById('tppdUnitSelect')?.addEventListener('change', populateManagerNama);
  document.getElementById('formTppdAssign')?.addEventListener('submit', handleManagerAssignSubmit);

  document.querySelectorAll('.btnTutupModal').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isProcessingBatch) return;
      toggleModal('modalLoginAdmin', false);
      toggleModal('modalPegawai', false);
      toggleModal('modalMemo', false);
      toggleModal('modalTppdAssign', false);
      toggleModal('modalTambahAdmin', false);
    });
  });

  document.addEventListener('click', (e) => {
    const inputEdit = document.getElementById('carianPegawaiEdit');
    const dropEdit = document.getElementById('dropdownCarianEdit');
    if (dropEdit && inputEdit && !dropEdit.contains(e.target) && e.target !== inputEdit) {
      dropEdit.classList.add('hidden');
    }

    const inputTppd = document.getElementById('carianPegawaiTppd');
    const dropTppd = document.getElementById('dropdownCarianTppd');
    if (dropTppd && inputTppd && !dropTppd.contains(e.target) && e.target !== inputTppd) {
      dropTppd.classList.add('hidden');
    }
  });
}

function checkAdminSession() {
  const session = sessionStorage.getItem('memo_admin_session');
  if (session) {
    try {
      currentAdmin = JSON.parse(session);
      window.currentAdmin = currentAdmin;
      showAdminUI(true);
      loadAdminData();
    } catch (e) {
      sessionStorage.removeItem('memo_admin_session');
      currentAdmin = null;
      window.currentAdmin = null;
    }
  }
}

function checkUrlIntercept() {
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');

  if (action === 'delegasi') {
    if (!currentAdmin) {
      toggleModal('modalLoginAdmin', true);
      Swal.fire({
        title: 'Log Masuk Diperlukan',
        text: 'Sila log masuk menggunakan emel pengurusan anda untuk meneruskan tindakan delegasi maklumat ini.',
        icon: 'info',
        confirmButtonColor: '#4f46e5',
        confirmButtonText: 'Seterusnya',
        customClass: { popup: 'rounded-2xl', confirmButton: 'text-sm font-bold' }
      });
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const emailInput = document.getElementById('loginAdminEmail');
  const passInput = document.getElementById('loginAdminPassword');
  const errorDiv = document.getElementById('loginAdminError');
  const btn = document.getElementById('btnSubmitLogin');

  const email = emailInput ? emailInput.value.trim() : '';
  const pass = passInput ? passInput.value.trim() : '';

  if (errorDiv) {
    errorDiv.classList.add('hidden');
    errorDiv.textContent = '';
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="loader mr-2 border-white border-top-indigo-500"></div> Sahkan...';
  }

  try {
    if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
      await window.appConfigReady;
    }

    const client = window._supabase;
    if (!client || typeof client.from !== 'function') {
      throw new Error("Klien pangkalan data belum sedia. Sila semak konfigurasi pelayan.");
    }

    const { data, error } = await client
      .from('memo_admin')
      .select('*')
      .eq('email', email)
      .eq('password', pass)
      .single();

    if (error || !data) throw new Error("Emel atau Kata Laluan salah.");

    const normalizedRole = String(data.role || '').trim().toUpperCase();
    const isSystemAdmin = normalizedRole === 'SUPER ADMIN' || normalizedRole === 'ADMIN';
    const isManager = normalizedRole === 'TPPD' || normalizedRole === 'KETUA SEKTOR' || normalizedRole === 'KETUA UNIT';
    const isPerakam = normalizedRole === 'PERAKAM';

    let managerSektor = null;
    let managerUnit = null;

    if (isManager) {
      const { data: pData, error: pError } = await client
        .from('memo_pegawai')
        .select('sektor, unit')
        .eq('emel_rasmi', email)
        .single();

      if (!pError && pData) {
        managerSektor = pData.sektor;
        managerUnit = pData.unit;
      } else {
        throw new Error("Profil Sektor bagi Pengurus ini tidak dijumpai dalam pangkalan data pegawai. Sila kemaskini data pegawai terlebih dahulu.");
      }
    }

    currentAdmin = { ...data, isSystemAdmin, isManager, isPerakam, managerSektor, managerUnit };
    window.currentAdmin = currentAdmin;
    sessionStorage.setItem('memo_admin_session', JSON.stringify(currentAdmin));

    toggleModal('modalLoginAdmin', false);
    showAdminUI(true);
    loadAdminData();

    let welcomeMsg = `Selamat Datang, ${data.role}!`;
    if (currentAdmin.isManager) welcomeMsg = `Selamat Datang, ${managerUnit} (${managerSektor})`;
    if (currentAdmin.isPerakam) welcomeMsg = `Sesi Aktif: Mod Perakam Pendaftaran Surat (${data.email}).`;

    window.showMessage(welcomeMsg, 'success');
  } catch (err) {
    if (errorDiv) {
      errorDiv.textContent = err.message || "Ralat tidak diketahui.";
      errorDiv.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Log Masuk';
    }
  }
}

function handleLogout() {
  if (isProcessingBatch || isProcessingTppdBatch) {
    window.showMessage("Sila tunggu sehingga proses pukal selesai.", "error");
    return;
  }
  sessionStorage.removeItem('memo_admin_session');
  currentAdmin = null;
  window.currentAdmin = null;
  showAdminUI(false);
  window.switchTab('utama');
  window.location.reload();
}

function showAdminUI(isLoggedIn) {
  const btnLogin = document.getElementById('btnBukaLoginAdmin');
  const btnLogout = document.getElementById('btnLogKeluarAdmin');
  const tabAdmin = document.getElementById('tabBtnAdminPanel');
  const tabTppd = document.getElementById('tabBtnTppdPanel');
  const menuCardDaftar = document.getElementById('menuCardDaftar');

  if (isLoggedIn && currentAdmin) {
    if (btnLogin) btnLogin.classList.add('hidden');
    if (btnLogout) btnLogout.classList.remove('hidden');

    if (currentAdmin.isPerakam) {
      if (menuCardDaftar) menuCardDaftar.classList.remove('hidden');
      window.switchTab('daftar');
    } else if (currentAdmin.isManager) {
      if (tabTppd) tabTppd.classList.remove('hidden');
      if (tabAdmin) tabAdmin.classList.add('hidden');
      window.switchTab('tppd');
    } else if (currentAdmin.isSystemAdmin) {
      if (menuCardDaftar) menuCardDaftar.classList.remove('hidden');
      if (tabAdmin) tabAdmin.classList.remove('hidden');
      if (tabTppd) tabTppd.classList.remove('hidden');
      window.switchTab('admin');
    }
  } else {
    if (btnLogin) btnLogin.classList.remove('hidden');
    if (btnLogout) btnLogout.classList.add('hidden');
    if (tabAdmin) tabAdmin.classList.add('hidden');
    if (tabTppd) tabTppd.classList.add('hidden');
    if (menuCardDaftar) menuCardDaftar.classList.add('hidden');
  }
}

async function loadAdminData() {
  loadAdminPegawai();

  if (currentAdmin && currentAdmin.isManager) {
    if (typeof loadManagerMemo === 'function') loadManagerMemo();
  } else if (currentAdmin && currentAdmin.isSystemAdmin) {
    loadAdminMemo();
    loadAdminSistem();
    if (typeof loadManagerMemo === 'function') loadManagerMemo();
  }
}

function loadAdminMemo() {
  if (!window.CacheService) return;

  window.CacheService.fetchSWR('memo_rekod', 'created_at', false, (data) => {
    if (!data) return;
    adminMemoData = data;

    adminSortState.memo = { column: 'id', direction: 'desc' };

    filterAdminTable('memo', document.getElementById('adminSearchMemo')?.value || '');
    updateSortIcons('memo');
  });
}

function loadAdminPegawai() {
  if (!window.CacheService) return;

  window.CacheService.fetchSWR('memo_pegawai', 'nama', true, (data) => {
    if (!data) return;
    adminPegawaiData = data;

    if (currentAdmin && currentAdmin.isSystemAdmin) {
      adminSortState.pegawai = { column: 'nama', direction: 'asc' };
      filterAdminTable('pegawai', document.getElementById('adminSearchPegawai')?.value || '');
      updateSortIcons('pegawai');
    }
  });
}

function loadAdminSistem() {
  if (!window.CacheService) return;

  window.CacheService.fetchSWR('memo_admin', 'id', true, (data) => {
    if (!data) return;
    adminSistemData = data;
    renderAdminSistemTable(adminSistemData);
  });
}

function renderAdminMemoTable(data) {
  const tbody = document.getElementById('adminTableMemoBody');
  if (!tbody) return;

  tbody.textContent = '';

  if (!data || data.length === 0) {
    const emptyTr = document.createElement('tr');
    const emptyTd = document.createElement('td');
    emptyTd.colSpan = 5;
    emptyTd.className = 'p-4 text-center text-slate-500';
    emptyTd.textContent = 'Tiada rekod.';
    emptyTr.appendChild(emptyTd);
    tbody.appendChild(emptyTr);
    renderAdminMemoPagination(0);
    return;
  }

  const totalRecords = data.length;
  const totalPages = Math.ceil(totalRecords / ADMIN_MEMO_PAGE_SIZE) || 1;

  if (adminMemoCurrentPage > totalPages) adminMemoCurrentPage = totalPages;
  if (adminMemoCurrentPage < 1) adminMemoCurrentPage = 1;

  const startIndex = (adminMemoCurrentPage - 1) * ADMIN_MEMO_PAGE_SIZE;
  const pageRecords = data.slice(startIndex, startIndex + ADMIN_MEMO_PAGE_SIZE);

  const fragment = document.createDocumentFragment();

  pageRecords.forEach(row => {
    const hasCalendar = !!row.calendar_event_id;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition-colors';

    const tdId = document.createElement('td');
    tdId.className = 'p-2 border-b text-[11px] font-mono text-slate-400 align-top';
    tdId.textContent = '#' + (row.id ?? '');
    tr.appendChild(tdId);

    const tdRef = document.createElement('td');
    tdRef.className = 'p-2 border-b align-top';
    const divNoRuj = document.createElement('div');
    divNoRuj.className = 'font-bold text-slate-700 uppercase text-[11px] md:text-xs';
    divNoRuj.textContent = row.no_rujukan || 'TIADA';
    const divTajuk = document.createElement('div');
    divTajuk.className = 'text-[10px] text-slate-500 mt-0.5 uppercase';
    divTajuk.textContent = row.tajuk_program || '';
    tdRef.appendChild(divNoRuj);
    tdRef.appendChild(divTajuk);
    tr.appendChild(tdRef);

    const tdDate = document.createElement('td');
    tdDate.className = 'p-2 border-b align-top';
    const divTarikh = document.createElement('div');
    divTarikh.className = 'font-semibold text-slate-700 text-[11px]';
    divTarikh.textContent = row.tarikh_terima || '';
    const divMasa = document.createElement('div');
    divMasa.className = 'text-[10px] text-indigo-600 font-bold mt-0.5';
    divMasa.textContent = row.masa_rekod || '-';
    tdDate.appendChild(divTarikh);
    tdDate.appendChild(divMasa);
    tr.appendChild(tdDate);

    const tdCal = document.createElement('td');
    tdCal.className = 'p-2 border-b text-center align-top';
    const btnCal = document.createElement('button');
    if (hasCalendar) {
      btnCal.className = 'text-red-500 hover:text-red-700 text-[10px] font-bold bg-red-50 hover:bg-red-100 px-2 py-1.5 rounded transition-colors flex items-center justify-center mx-auto w-24';
      btnCal.innerHTML = '<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg> Padam Kalendar';
      btnCal.addEventListener('click', () => {
        if (typeof window.removeSingleCalendar === 'function') {
          window.removeSingleCalendar(row.id);
        }
      });
    } else {
      btnCal.className = 'text-emerald-600 hover:text-emerald-800 text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 px-2 py-1.5 rounded transition-colors flex items-center justify-center mx-auto w-24';
      btnCal.innerHTML = '<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Segerak Kalendar';
      btnCal.addEventListener('click', () => {
        if (typeof window.syncSingleCalendar === 'function') {
          window.syncSingleCalendar(row.id);
        }
      });
    }
    tdCal.appendChild(btnCal);
    tr.appendChild(tdCal);

    const tdAction = document.createElement('td');
    tdAction.className = 'p-2 border-b text-center align-top space-x-2';
    const btnEdit = document.createElement('button');
    btnEdit.className = 'text-indigo-600 hover:text-indigo-900 font-bold text-[10px] uppercase tracking-wider bg-slate-100 px-2 py-1 rounded';
    btnEdit.textContent = 'Edit';
    btnEdit.addEventListener('click', () => {
      if (typeof window.editMemo === 'function') {
        window.editMemo(row.id);
      }
    });

    const btnDelete = document.createElement('button');
    btnDelete.className = 'text-slate-400 hover:text-red-600 font-bold text-[10px] uppercase tracking-wider bg-slate-100 px-2 py-1 rounded mt-1 md:mt-0';
    btnDelete.textContent = 'Padam';
    btnDelete.addEventListener('click', () => {
      if (typeof window.deleteMemo === 'function') {
        window.deleteMemo(row.id);
      }
    });

    tdAction.appendChild(btnEdit);
    tdAction.appendChild(btnDelete);
    tr.appendChild(tdAction);

    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
  renderAdminMemoPagination(totalRecords);
}

function renderAdminMemoPagination(totalRecords) {
  let container = document.getElementById('adminMemoPagination');

  if (!container) {
    const tbody = document.getElementById('adminTableMemoBody');
    const scrollContainer = tbody ? tbody.closest('.overflow-x-auto') : null;
    if (scrollContainer && scrollContainer.parentNode) {
      container = document.createElement('div');
      container.id = 'adminMemoPagination';
      container.className = 'p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs';
      scrollContainer.parentNode.insertBefore(container, scrollContainer.nextSibling);
    }
  }

  if (!container) return;

  if (totalRecords === 0) {
    container.textContent = '';
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');

  const totalPages = Math.ceil(totalRecords / ADMIN_MEMO_PAGE_SIZE) || 1;
  const startRecord = (adminMemoCurrentPage - 1) * ADMIN_MEMO_PAGE_SIZE + 1;
  const endRecord = Math.min(adminMemoCurrentPage * ADMIN_MEMO_PAGE_SIZE, totalRecords);

  const isPrevDisabled = adminMemoCurrentPage <= 1;
  const isNextDisabled = adminMemoCurrentPage >= totalPages;

  container.textContent = '';

  const textDiv = document.createElement('div');
  textDiv.className = 'text-slate-500 font-medium text-center sm:text-left';
  textDiv.innerHTML = `Menunjukkan <span class="font-bold text-slate-700">${startRecord}</span> - <span class="font-bold text-slate-700">${endRecord}</span> daripada <span class="font-bold text-slate-700">${totalRecords}</span> memo (Halaman <span class="font-bold text-indigo-600">${adminMemoCurrentPage}</span>/${totalPages})`;

  const btnsDiv = document.createElement('div');
  btnsDiv.className = 'flex items-center space-x-2';

  const btnPrev = document.createElement('button');
  btnPrev.type = 'button';
  btnPrev.className = 'px-3 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 bg-white hover:bg-slate-100 transition-colors flex items-center shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white';
  btnPrev.disabled = isPrevDisabled;
  btnPrev.innerHTML = '<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg> Sebelumnya';
  btnPrev.addEventListener('click', () => window.changeAdminMemoPage(adminMemoCurrentPage - 1));

  const btnNext = document.createElement('button');
  btnNext.type = 'button';
  btnNext.className = 'px-3 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 bg-white hover:bg-slate-100 transition-colors flex items-center shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white';
  btnNext.disabled = isNextDisabled;
  btnNext.innerHTML = 'Seterusnya <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>';
  btnNext.addEventListener('click', () => window.changeAdminMemoPage(adminMemoCurrentPage + 1));

  btnsDiv.appendChild(btnPrev);
  btnsDiv.appendChild(btnNext);

  container.appendChild(textDiv);
  container.appendChild(btnsDiv);
}

window.changeAdminMemoPage = function(targetPage) {
  const totalPages = Math.ceil(currentFilteredAdminMemo.length / ADMIN_MEMO_PAGE_SIZE) || 1;
  if (targetPage < 1 || targetPage > totalPages) return;
  adminMemoCurrentPage = targetPage;
  renderAdminMemoTable(currentFilteredAdminMemo);

  const tbody = document.getElementById('adminTableMemoBody');
  if (tbody) {
    const scrollContainer = tbody.closest('.overflow-x-auto');
    if (scrollContainer) scrollContainer.scrollTop = 0;
  }
};

function renderAdminPegawaiTable(data) {
  const tbody = document.getElementById('adminTablePegawaiBody');
  if (!tbody) return;

  tbody.textContent = '';

  if (!data || data.length === 0) {
    const emptyTr = document.createElement('tr');
    const emptyTd = document.createElement('td');
    emptyTd.colSpan = 4;
    emptyTd.className = 'p-4 text-center text-slate-500';
    emptyTd.textContent = 'Tiada rekod.';
    emptyTr.appendChild(emptyTd);
    tbody.appendChild(emptyTr);
    renderAdminPegawaiPagination(0);
    return;
  }

  const totalRecords = data.length;
  const totalPages = Math.ceil(totalRecords / ADMIN_PEGAWAI_PAGE_SIZE) || 1;

  if (adminPegawaiCurrentPage > totalPages) adminPegawaiCurrentPage = totalPages;
  if (adminPegawaiCurrentPage < 1) adminPegawaiCurrentPage = 1;

  const startIndex = (adminPegawaiCurrentPage - 1) * ADMIN_PEGAWAI_PAGE_SIZE;
  const pageRecords = data.slice(startIndex, startIndex + ADMIN_PEGAWAI_PAGE_SIZE);

  const fragment = document.createDocumentFragment();

  pageRecords.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition-colors';

    const tdNama = document.createElement('td');
    tdNama.className = 'p-2 border-b font-bold text-slate-700 uppercase text-[11px] md:text-xs';
    tdNama.textContent = row.nama || '-';
    tr.appendChild(tdNama);

    const tdSektor = document.createElement('td');
    tdSektor.className = 'p-2 border-b text-[10px] md:text-[11px]';
    const divSektor = document.createElement('div');
    divSektor.className = 'font-semibold text-indigo-600 uppercase';
    divSektor.textContent = row.sektor || '-';
    const divUnit = document.createElement('div');
    divUnit.className = 'text-slate-500 uppercase';
    divUnit.textContent = row.unit || '-';
    tdSektor.appendChild(divSektor);
    tdSektor.appendChild(divUnit);
    tr.appendChild(tdSektor);

    const tdEmel = document.createElement('td');
    tdEmel.className = 'p-2 border-b text-slate-600 text-[11px]';
    tdEmel.textContent = row.emel_rasmi || '-';
    tr.appendChild(tdEmel);

    const tdAksi = document.createElement('td');
    tdAksi.className = 'p-2 border-b text-center space-x-2';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'text-indigo-600 hover:text-indigo-900 font-bold text-xs';
    btnEdit.textContent = 'Edit';
    btnEdit.addEventListener('click', () => {
      if (typeof window.editPegawai === 'function') {
        window.editPegawai(row.id);
      }
    });

    const btnPadam = document.createElement('button');
    btnPadam.className = 'text-red-500 hover:text-red-700 font-bold text-xs';
    btnPadam.textContent = 'Padam';
    btnPadam.addEventListener('click', () => {
      if (typeof window.deletePegawai === 'function') {
        window.deletePegawai(row.id);
      }
    });

    tdAksi.appendChild(btnEdit);
    tdAksi.appendChild(btnPadam);
    tr.appendChild(tdAksi);

    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
  renderAdminPegawaiPagination(totalRecords);
}

function renderAdminPegawaiPagination(totalRecords) {
  let container = document.getElementById('adminPegawaiPagination');

  if (!container) {
    const tbody = document.getElementById('adminTablePegawaiBody');
    const scrollContainer = tbody ? tbody.closest('.overflow-x-auto') : null;
    if (scrollContainer && scrollContainer.parentNode) {
      container = document.createElement('div');
      container.id = 'adminPegawaiPagination';
      container.className = 'p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs';
      scrollContainer.parentNode.insertBefore(container, scrollContainer.nextSibling);
    }
  }

  if (!container) return;

  if (totalRecords === 0) {
    container.textContent = '';
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');

  const totalPages = Math.ceil(totalRecords / ADMIN_PEGAWAI_PAGE_SIZE) || 1;
  const startRecord = (adminPegawaiCurrentPage - 1) * ADMIN_PEGAWAI_PAGE_SIZE + 1;
  const endRecord = Math.min(adminPegawaiCurrentPage * ADMIN_PEGAWAI_PAGE_SIZE, totalRecords);

  const isPrevDisabled = adminPegawaiCurrentPage <= 1;
  const isNextDisabled = adminPegawaiCurrentPage >= totalPages;

  container.textContent = '';

  const textDiv = document.createElement('div');
  textDiv.className = 'text-slate-500 font-medium text-center sm:text-left';
  textDiv.innerHTML = `Menunjukkan <span class="font-bold text-slate-700">${startRecord}</span> - <span class="font-bold text-slate-700">${endRecord}</span> daripada <span class="font-bold text-slate-700">${totalRecords}</span> pegawai (Halaman <span class="font-bold text-indigo-600">${adminPegawaiCurrentPage}</span>/${totalPages})`;

  const btnsDiv = document.createElement('div');
  btnsDiv.className = 'flex items-center space-x-2';

  const btnPrev = document.createElement('button');
  btnPrev.type = 'button';
  btnPrev.className = 'px-3 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 bg-white hover:bg-slate-100 transition-colors flex items-center shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white';
  btnPrev.disabled = isPrevDisabled;
  btnPrev.innerHTML = '<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg> Sebelumnya';
  btnPrev.addEventListener('click', () => window.changeAdminPegawaiPage(adminPegawaiCurrentPage - 1));

  const btnNext = document.createElement('button');
  btnNext.type = 'button';
  btnNext.className = 'px-3 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 bg-white hover:bg-slate-100 transition-colors flex items-center shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white';
  btnNext.disabled = isNextDisabled;
  btnNext.innerHTML = 'Seterusnya <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>';
  btnNext.addEventListener('click', () => window.changeAdminPegawaiPage(adminPegawaiCurrentPage + 1));

  btnsDiv.appendChild(btnPrev);
  btnsDiv.appendChild(btnNext);

  container.appendChild(textDiv);
  container.appendChild(btnsDiv);
}

window.changeAdminPegawaiPage = function(targetPage) {
  const totalPages = Math.ceil(currentFilteredAdminPegawai.length / ADMIN_PEGAWAI_PAGE_SIZE) || 1;
  if (targetPage < 1 || targetPage > totalPages) return;
  adminPegawaiCurrentPage = targetPage;
  renderAdminPegawaiTable(currentFilteredAdminPegawai);

  const tbody = document.getElementById('adminTablePegawaiBody');
  if (tbody) {
    const scrollContainer = tbody.closest('.overflow-x-auto');
    if (scrollContainer) scrollContainer.scrollTop = 0;
  }
};

function renderAdminSistemTable(data) {
  const tbody = document.getElementById('adminTableSistemBody');
  if (!tbody) return;

  tbody.textContent = '';

  if (!data || data.length === 0) {
    const emptyTr = document.createElement('tr');
    const emptyTd = document.createElement('td');
    emptyTd.colSpan = 4;
    emptyTd.className = 'p-4 text-center text-slate-500';
    emptyTd.textContent = 'Tiada rekod.';
    emptyTr.appendChild(emptyTd);
    tbody.appendChild(emptyTr);
    return;
  }

  const fragment = document.createDocumentFragment();

  data.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition-colors';

    const tdId = document.createElement('td');
    tdId.className = 'p-2 border-b text-slate-400 text-[11px]';
    tdId.textContent = '#' + (row.id ?? '');
    tr.appendChild(tdId);

    const tdEmail = document.createElement('td');
    tdEmail.className = 'p-2 border-b font-medium text-xs';
    tdEmail.textContent = row.email || '-';
    tr.appendChild(tdEmail);

    const tdRole = document.createElement('td');
    tdRole.className = 'p-2 border-b';
    const spanRole = document.createElement('span');
    const role = String(row.role || '').toUpperCase();
    let badgeClass = 'bg-slate-100 text-slate-600';
    if (role === 'SUPER ADMIN') {
      badgeClass = 'bg-purple-100 text-purple-700';
    } else if (role === 'TPPD') {
      badgeClass = 'bg-indigo-100 text-indigo-700';
    } else if (role === 'PERAKAM') {
      badgeClass = 'bg-amber-100 text-amber-700';
    }
    spanRole.className = `px-2 py-0.5 ${badgeClass} text-[10px] font-bold rounded`;
    spanRole.textContent = role || '-';
    tdRole.appendChild(spanRole);
    tr.appendChild(tdRole);

    const tdAksi = document.createElement('td');
    tdAksi.className = 'p-2 border-b text-center';
    if (role !== 'SUPER ADMIN') {
      const btnGugur = document.createElement('button');
      btnGugur.className = 'text-red-500 hover:text-red-700 font-bold text-[11px]';
      btnGugur.textContent = 'Gugurkan';
      btnGugur.addEventListener('click', () => {
        if (typeof window.deleteAdmin === 'function') {
          window.deleteAdmin(row.id);
        }
      });
      tdAksi.appendChild(btnGugur);
    } else {
      const spanNoAction = document.createElement('span');
      spanNoAction.className = 'text-[10px] text-slate-300 italic';
      spanNoAction.textContent = 'Tiada Tindakan';
      tdAksi.appendChild(spanNoAction);
    }
    tr.appendChild(tdAksi);

    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
}

function switchAdminSection(section) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.admin-sub-tab').forEach(t => {
    t.classList.remove('bg-indigo-100', 'text-indigo-700');
    t.classList.add('text-slate-600');
  });

  const targetSection = 'adminSection' + section.charAt(0).toUpperCase() + section.slice(1);
  const targetBtn = 'subTabBtn' + section.charAt(0).toUpperCase() + section.slice(1);

  const div = document.getElementById(targetSection);
  const btn = document.getElementById(targetBtn);
  if (div) div.classList.remove('hidden');
  if (btn) {
    btn.classList.add('bg-indigo-100', 'text-indigo-700');
    btn.classList.remove('text-slate-600');
  }
}

window.handleSort = function(type, column) {
  const state = adminSortState[type];

  let newDirection = 'asc';
  if (state.column === column) {
    newDirection = state.direction === 'asc' ? 'desc' : 'asc';
  }

  adminSortState[type] = { column: column, direction: newDirection };
  const dataArray = type === 'memo' ? adminMemoData : adminPegawaiData;

  dataArray.sort((a, b) => {
    let valA = a[column];
    let valB = b[column];

    if (valA === null || valA === undefined) valA = "";
    if (valB === null || valB === undefined) valB = "";

    if (typeof valA === 'number' && typeof valB === 'number') {
      return newDirection === 'asc' ? valA - valB : valB - valA;
    }

    valA = valA.toString().toLowerCase();
    valB = valB.toString().toLowerCase();

    if (valA < valB) return newDirection === 'asc' ? -1 : 1;
    if (valA > valB) return newDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const searchInputId = type === 'memo' ? 'adminSearchMemo' : 'adminSearchPegawai';
  const currentQuery = document.getElementById(searchInputId)?.value || '';

  if (type === 'memo') adminMemoCurrentPage = 1;
  if (type === 'pegawai') adminPegawaiCurrentPage = 1;

  filterAdminTable(type, currentQuery);
  updateSortIcons(type);
};

function updateSortIcons(type) {
  const allIcons = document.querySelectorAll(`[id^="sort-${type}-"]`);
  allIcons.forEach(icon => {
    icon.innerHTML = '';
  });

  const state = adminSortState[type];
  const activeIconContainer = document.getElementById(`sort-${type}-${state.column}`);

  if (activeIconContainer) {
    if (state.direction === 'asc') {
      activeIconContainer.innerHTML = '<svg class="w-4 h-4 text-indigo-600 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>';
    } else {
      activeIconContainer.innerHTML = '<svg class="w-4 h-4 text-indigo-600 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>';
    }
  }
}

function filterAdminTable(type, query) {
  const q = (query || '').toLowerCase();
  if (type === 'memo') {
    const filtered = adminMemoData.filter(m => 
      (m.tajuk_program && m.tajuk_program.toLowerCase().includes(q)) ||
      (m.no_rujukan && m.no_rujukan.toLowerCase().includes(q)) ||
      (m.no_tambahan && m.no_tambahan.toLowerCase().includes(q)) ||
      (m.dari && m.dari.toLowerCase().includes(q)) ||
      (m.sektor && m.sektor.toLowerCase().includes(q)) ||
      (m.nama_penerima && m.nama_penerima.toLowerCase().includes(q))
    );
    currentFilteredAdminMemo = filtered;
    renderAdminMemoTable(filtered);
  } else if (type === 'pegawai') {
    const filtered = adminPegawaiData.filter(p => 
      (p.nama && p.nama.toLowerCase().includes(q)) || 
      (p.sektor && p.sektor.toLowerCase().includes(q)) ||
      (p.unit && p.unit.toLowerCase().includes(q)) ||
      (p.emel_rasmi && p.emel_rasmi.toLowerCase().includes(q))
    );
    currentFilteredAdminPegawai = filtered;
    renderAdminPegawaiTable(filtered);
  }
}

window.handleAdminRealtimeUpdate = function(tableName, payload) {
  if (!payload || !payload.eventType) return;

  if (tableName === 'memo_rekod') {
    if (payload.eventType === 'INSERT' && payload.new) {
      if (!adminMemoData.some(m => m.id === payload.new.id)) {
        adminMemoData.unshift(payload.new);
      }
    } else if (payload.eventType === 'UPDATE' && payload.new) {
      const idx = adminMemoData.findIndex(m => m.id === payload.new.id);
      if (idx !== -1) adminMemoData[idx] = payload.new;
      else adminMemoData.unshift(payload.new);
    } else if (payload.eventType === 'DELETE') {
      const targetId = payload.old ? payload.old.id : payload.id;
      if (targetId) adminMemoData = adminMemoData.filter(m => m.id !== targetId);
    }

    filterAdminTable('memo', document.getElementById('adminSearchMemo')?.value || '');
  } else if (tableName === 'memo_pegawai') {
    if (payload.eventType === 'INSERT' && payload.new) {
      if (!adminPegawaiData.some(p => p.id === payload.new.id)) {
        adminPegawaiData.push(payload.new);
      }
    } else if (payload.eventType === 'UPDATE' && payload.new) {
      const idx = adminPegawaiData.findIndex(p => p.id === payload.new.id);
      if (idx !== -1) adminPegawaiData[idx] = payload.new;
      else adminPegawaiData.push(payload.new);
    } else if (payload.eventType === 'DELETE') {
      const targetId = payload.old ? payload.old.id : payload.id;
      if (targetId) adminPegawaiData = adminPegawaiData.filter(p => p.id !== targetId);
    }

    filterAdminTable('pegawai', document.getElementById('adminSearchPegawai')?.value || '');
  } else if (tableName === 'memo_admin') {
    if (payload.eventType === 'INSERT' && payload.new) {
      if (!adminSistemData.some(a => a.id === payload.new.id)) {
        adminSistemData.push(payload.new);
      }
    } else if (payload.eventType === 'UPDATE' && payload.new) {
      const idx = adminSistemData.findIndex(a => a.id === payload.new.id);
      if (idx !== -1) adminSistemData[idx] = payload.new;
    } else if (payload.eventType === 'DELETE') {
      const targetId = payload.old ? payload.old.id : payload.id;
      if (targetId) adminSistemData = adminSistemData.filter(a => a.id !== targetId);
    }
    renderAdminSistemTable(adminSistemData);
  }
};

function toggleModal(id, show) {
  const m = document.getElementById(id);
  if (!m) return;
  if (show) {
    m.classList.remove('hidden');
  } else {
    m.classList.add('hidden');
  }
}

window.toggleModal = toggleModal;
window.showAdminUI = showAdminUI;
window.loadAdminData = loadAdminData;
window.loadAdminMemo = loadAdminMemo;
window.loadAdminPegawai = loadAdminPegawai;
window.loadAdminSistem = loadAdminSistem;
window.checkAdminSession = checkAdminSession;