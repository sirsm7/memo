/**
 * ==============================================================================
 * SISTEM PENGURUSAN MEMO@AG
 * Architect: 0.1% Senior Software Architect
 * Modul: admin.js (Enjin Kawalan Pentadbir, RBAC Hierarki Pengurusan & Operasi CRUD)
 * Patch: Pindaan Bypass Delegasi (Mix PIC & Pengurusan) & Integrasi Pengurus Dalam RSVP
 * Kemaskini Terbaharu: Modul Ubah Hala (Re-route) Memo & Automasi Kalendar (Edit Modal)
 * Patch UI: Penghindaran Ralat Watak Khas (Escape Character) pada Checkbox Nama & Emel
 * Patch Terkini: Pemampatan Antaramuka Jadual & Dialog SweetAlert2 (Pengganti Confirm)
 * Patch Khas: URL Parameter Interception untuk Laluan Ajaib (Magic Link) Delegasi Emel
 * Enjin Carian Pantas: Auto-Lengkap Untuk Modal Edit Admin & Delegasi TPPD
 * Protokol RBAC Override: Bypass Carian Rentas Sektor Khusus untuk Profil TPPD
 * Patch Pembedahan: Automasi Penyisihan Delegasi Terselesai & Override Penugasan Kendiri
 * Versi Pukal (Bulk): Sokongan Penugasan Pukal (Batch Assignment) PIC TPPD & Progress UI
 * Patch Terbaharu: Hierarki Dinamik (Sektor -> Unit) pada Modal Delegasi TPPD
 * Patch Fasa 3: Pematuhan Delegasi Senyap, Filter E-mel Pengurus & Diff Checker Penerima Baharu
 * ==============================================================================
 */

// STATE PENTADBIR & PENGURUS
let currentAdmin = null;
let adminMemoData = [];
let adminPegawaiData = [];
let adminSistemData = [];
let isProcessingBatch = false;

// STATE PENGURUS KHUSUS (HIERARKI & PUKAL)
let managerMemoData = [];
let managerSelected = new Map(); // Menjejak email -> nama rentas pegawai untuk modal delegasi TPPD
let managerSelectedMemos = new Set(); // Menjejak ID memo yang dipilih untuk penugasan pukal
let isProcessingTppdBatch = false; // Flag pemprosesan pukal TPPD

// STATE PENTADBIR KHUSUS (UBAH HALA MEMO)
let adminEditSelected = new Map(); // Menjejak penerima semasa mod kemaskini (Edit Memo)

// STATE SUSUNAN (SORTING)
let adminSortState = {
    memo: { column: 'created_at', direction: 'desc' },
    pegawai: { column: 'nama', direction: 'asc' }
};

// ================= INISIALISASI ADMIN =================
document.addEventListener('DOMContentLoaded', () => {
    checkAdminSession();
    setupAdminEventListeners();
    checkUrlIntercept(); // Pintasan URL dari emel delegasi
});

function setupAdminEventListeners() {
    // Tombol Login/Logout
    document.getElementById('btnBukaLoginAdmin')?.addEventListener('click', () => toggleModal('modalLoginAdmin', true));
    document.getElementById('btnBatalLogin')?.addEventListener('click', () => toggleModal('modalLoginAdmin', false));
    document.getElementById('btnLogKeluarAdmin')?.addEventListener('click', handleLogout);
    document.getElementById('formLoginAdmin')?.addEventListener('submit', handleLogin);

    // Navigasi Sub-Tab Admin
    document.getElementById('subTabBtnMemo')?.addEventListener('click', () => switchAdminSection('memo'));
    document.getElementById('subTabBtnPegawai')?.addEventListener('click', () => switchAdminSection('pegawai'));
    document.getElementById('subTabBtnSistem')?.addEventListener('click', () => switchAdminSection('sistem'));

    // CRUD Pegawai
    document.getElementById('btnTambahPegawai')?.addEventListener('click', () => openPegawaiModal());
    document.getElementById('formPegawai')?.addEventListener('submit', handlePegawaiSubmit);
    
    // Logik Toggle Input Manual vs Select (Pegawai)
    document.getElementById('pegawaiSektorSelect')?.addEventListener('change', function() {
        const manualInput = document.getElementById('pegawaiSektorManual');
        manualInput.classList.toggle('hidden', this.value !== 'MANUAL');
        if (this.value === 'MANUAL') manualInput.focus();
    });

    document.getElementById('pegawaiUnitSelect')?.addEventListener('change', function() {
        const manualInput = document.getElementById('pegawaiUnitManual');
        manualInput.classList.toggle('hidden', this.value !== 'MANUAL');
        if (this.value === 'MANUAL') manualInput.focus();
    });

    // CRUD Memo (Dengan Logik Ubah Hala Penerima)
    document.getElementById('formMemo')?.addEventListener('submit', handleMemoSubmit);
    document.getElementById('adminEditSektor')?.addEventListener('change', populateAdminEditUnit);
    document.getElementById('adminEditUnit')?.addEventListener('change', populateAdminEditNama);
    
    // Carian Pantas (Smart Interceptor) Edit Memo & Delegasi TPPD
    document.getElementById('carianPegawaiEdit')?.addEventListener('input', window.handleCarianAdminEdit);
    document.getElementById('carianPegawaiTppd')?.addEventListener('input', window.handleCarianTppd);

    // Tindakan Pukal (Batch Processing) Kalendar
    document.getElementById('btnPukalSegerak')?.addEventListener('click', startBatchSync);
    document.getElementById('btnPukalPadam')?.addEventListener('click', startBatchDelete);

    // CRUD Sistem (Admin/Perakam Baru)
    document.getElementById('btnTambahAdmin')?.addEventListener('click', () => toggleModal('modalTambahAdmin', true));
    document.getElementById('formTambahAdmin')?.addEventListener('submit', handleTambahAdminSubmit);

    // Carian Admin
    document.getElementById('adminSearchMemo')?.addEventListener('input', (e) => filterAdminTable('memo', e.target.value));
    document.getElementById('adminSearchPegawai')?.addEventListener('input', (e) => filterAdminTable('pegawai', e.target.value));

    // EVENT LISTENER KHUSUS PENGURUSAN (Delegasi Dinamik Sektor -> Unit)
    document.getElementById('tppdSektorSelect')?.addEventListener('change', window.populateManagerUnit);
    document.getElementById('tppdUnitSelect')?.addEventListener('change', populateManagerNama);
    document.getElementById('formTppdAssign')?.addEventListener('submit', handleManagerAssignSubmit);

    // Tutup sebarang modal & Dropdown Carian
    document.querySelectorAll('.btnTutupModal').forEach(btn => {
        btn.addEventListener('click', () => {
            if (isProcessingBatch) return; // Halang tutup jika sedang proses pukal
            toggleModal('modalLoginAdmin', false);
            toggleModal('modalPegawai', false);
            toggleModal('modalMemo', false);
            toggleModal('modalTppdAssign', false);
            toggleModal('modalTambahAdmin', false);
        });
    });

    // Menutup dropdown carian pantas jika klik di luar
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

// ================= PENGURUSAN SESI & RBAC (Role-Based Access Control) =================
function checkAdminSession() {
    const session = sessionStorage.getItem('memo_admin_session');
    if (session) {
        currentAdmin = JSON.parse(session);
        showAdminUI(true);
        loadAdminData();
    }
}

/**
 * Pintasan URL (Magic Link) dari emel pengurusan (Delegasi)
 */
function checkUrlIntercept() {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');

    if (action === 'delegasi') {
        if (!currentAdmin) {
            // Jika belum log masuk, paparkan modal log masuk berserta mesej panduan
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
        // Bersihkan parameter URL bagi mengelakkan gelung pintasan berterusan jika di-refresh
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginAdminEmail').value;
    const pass = document.getElementById('loginAdminPassword').value;
    const errorDiv = document.getElementById('loginAdminError');
    const btn = document.getElementById('btnSubmitLogin');

    errorDiv.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<div class="loader mr-2 border-white border-top-indigo-500"></div> Sahkan...';

    try {
        const { data, error } = await _supabase
            .from('memo_admin')
            .select('*')
            .eq('email', email)
            .eq('password', pass)
            .single();

        if (error || !data) throw new Error("Emel atau Kata Laluan salah.");

        // RBAC: Pengesanan Silang Hierarki Pengurusan & Peranan Sistem
        let isSystemAdmin = data.role === 'SUPER ADMIN' || data.role === 'ADMIN';
        let isManager = data.role === 'TPPD' || data.role === 'KETUA SEKTOR' || data.role === 'KETUA UNIT';
        let isPerakam = data.role === 'PERAKAM';
        
        let managerSektor = null;
        let managerUnit = null;

        if (isManager) {
            const { data: pData, error: pError } = await _supabase
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
        sessionStorage.setItem('memo_admin_session', JSON.stringify(currentAdmin));
        
        toggleModal('modalLoginAdmin', false);
        showAdminUI(true);
        loadAdminData();
        
        let welcomeMsg = `Selamat Datang, ${data.role}!`;
        if (currentAdmin.isManager) welcomeMsg = `Selamat Datang, ${managerUnit} (${managerSektor})`;
        if (currentAdmin.isPerakam) welcomeMsg = `Sesi Aktif: Mod Perakam Pendaftaran Surat.`;
        
        window.showMessage(welcomeMsg, 'success');

    } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Log Masuk';
    }
}

function handleLogout() {
    if (isProcessingBatch || isProcessingTppdBatch) {
        window.showMessage("Sila tunggu sehingga proses pukal selesai.", "error");
        return;
    }
    sessionStorage.removeItem('memo_admin_session');
    currentAdmin = null;
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

    if (isLoggedIn) {
        btnLogin.classList.add('hidden');
        btnLogout.classList.remove('hidden');
        
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
            if (tabTppd) tabTppd.classList.add('hidden');
            window.switchTab('admin');
        }
    } else {
        btnLogin.classList.remove('hidden');
        btnLogout.classList.add('hidden');
        if (tabAdmin) tabAdmin.classList.add('hidden');
        if (tabTppd) tabTppd.classList.add('hidden');
        if (menuCardDaftar) menuCardDaftar.classList.add('hidden');
    }
}

// ================= DATA FETCHING (PENGASINGAN LOGIK) =================
async function loadAdminData() {
    // Pengurusan sentiasa perlukan data pegawai untuk dropdown modal mereka
    await loadAdminPegawai(); 

    if (currentAdmin.isManager) {
        loadManagerMemo();
    } else if (currentAdmin.isSystemAdmin) {
        loadAdminMemo();
        loadAdminSistem();
    }
}

async function loadAdminMemo() {
    const { data } = await _supabase.from('memo_rekod').select('*').order('created_at', { ascending: false });
    adminMemoData = data || [];
    
    // Tetapkan susunan lalai ke state
    adminSortState.memo = { column: 'id', direction: 'desc' };
    
    filterAdminTable('memo', document.getElementById('adminSearchMemo')?.value || '');
    updateSortIcons('memo');
}

async function loadAdminPegawai() {
    const { data } = await _supabase.from('memo_pegawai').select('*').order('nama');
    adminPegawaiData = data || [];
    
    if (currentAdmin && currentAdmin.isSystemAdmin) {
        // Tetapkan susunan lalai ke state jika admin
        adminSortState.pegawai = { column: 'nama', direction: 'asc' };
        filterAdminTable('pegawai', document.getElementById('adminSearchPegawai')?.value || '');
        updateSortIcons('pegawai');
    }
}

async function loadAdminSistem() {
    const { data } = await _supabase.from('memo_admin').select('*').order('id');
    adminSistemData = data || [];
    renderAdminSistemTable(adminSistemData);
}

// ================= RENDERING TABLES (ADMIN) =================
function renderAdminMemoTable(data) {
    const tbody = document.getElementById('adminTableMemoBody');
    tbody.innerHTML = data.map(row => {
        const hasCalendar = !!row.calendar_event_id;
        
        return `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="p-2 border-b text-[11px] font-mono text-slate-400 align-top">#${row.id}</td>
            <td class="p-2 border-b align-top">
                <div class="font-bold text-slate-700 uppercase text-[11px] md:text-xs">${row.no_rujukan || 'TIADA'}</div>
                <div class="text-[10px] text-slate-500 mt-0.5 uppercase">${row.tajuk_program}</div>
            </td>
            <td class="p-2 border-b align-top">
                <div class="font-semibold text-slate-700 text-[11px]">${row.tarikh_terima}</div>
                <div class="text-[10px] text-indigo-600 font-bold mt-0.5">${row.masa_rekod || '-'}</div>
            </td>
            <td class="p-2 border-b text-center align-top">
                ${hasCalendar ? 
                    `<button onclick="removeSingleCalendar(${row.id})" class="text-red-500 hover:text-red-700 text-[10px] font-bold bg-red-50 hover:bg-red-100 px-2 py-1.5 rounded transition-colors flex items-center justify-center mx-auto w-24">
                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg> Padam Kalendar
                    </button>` 
                    : 
                    `<button onclick="syncSingleCalendar(${row.id})" class="text-emerald-600 hover:text-emerald-800 text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 px-2 py-1.5 rounded transition-colors flex items-center justify-center mx-auto w-24">
                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Segerak Kalendar
                    </button>`
                }
            </td>
            <td class="p-2 border-b text-center align-top space-x-2">
                <button onclick="editMemo(${row.id})" class="text-indigo-600 hover:text-indigo-900 font-bold text-[10px] uppercase tracking-wider bg-slate-100 px-2 py-1 rounded">Edit</button>
                <button onclick="deleteMemo(${row.id})" class="text-slate-400 hover:text-red-600 font-bold text-[10px] uppercase tracking-wider bg-slate-100 px-2 py-1 rounded mt-1 md:mt-0">Padam</button>
            </td>
        </tr>
    `}).join('') || '<tr><td colspan="5" class="p-4 text-center text-slate-500">Tiada rekod.</td></tr>';
}

function renderAdminPegawaiTable(data) {
    const tbody = document.getElementById('adminTablePegawaiBody');
    tbody.innerHTML = data.map(row => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="p-2 border-b font-bold text-slate-700 uppercase text-[11px] md:text-xs">${row.nama}</td>
            <td class="p-2 border-b text-[10px] md:text-[11px]">
                <div class="font-semibold text-indigo-600 uppercase">${row.sektor}</div>
                <div class="text-slate-500 uppercase">${row.unit}</div>
            </td>
            <td class="p-2 border-b text-slate-600 text-[11px]">${row.emel_rasmi}</td>
            <td class="p-2 border-b text-center space-x-2">
                <button onclick="editPegawai(${row.id})" class="text-indigo-600 hover:text-indigo-900 font-bold text-xs">Edit</button>
                <button onclick="deletePegawai(${row.id})" class="text-red-500 hover:text-red-700 font-bold text-xs">Padam</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="p-4 text-center text-slate-500">Tiada rekod.</td></tr>';
}

function renderAdminSistemTable(data) {
    const tbody = document.getElementById('adminTableSistemBody');
    tbody.innerHTML = data.map(row => {
        const badgeClass = row.role === 'SUPER ADMIN' ? 'bg-purple-100 text-purple-700' : 
                           (row.role === 'TPPD' ? 'bg-indigo-100 text-indigo-700' : 
                           (row.role === 'PERAKAM' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'));
        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="p-2 border-b text-slate-400 text-[11px]">#${row.id}</td>
                <td class="p-2 border-b font-medium text-xs">${row.email}</td>
                <td class="p-2 border-b"><span class="px-2 py-0.5 ${badgeClass} text-[10px] font-bold rounded">${row.role}</span></td>
                <td class="p-2 border-b text-center">
                    ${row.role !== 'SUPER ADMIN' ? `<button onclick="deleteAdmin(${row.id})" class="text-red-500 hover:text-red-700 font-bold text-[11px]">Gugurkan</button>` : '<span class="text-[10px] text-slate-300 italic">Tiada Tindakan</span>'}
                </td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="4" class="p-4 text-center text-slate-500">Tiada rekod.</td></tr>';
}

// ================= MODUL DELEGASI HIERARKI PENGURUSAN (TAB TPPD) =================
// ── SURGICAL EDIT START: BACA_PREFIX_PENDING_TPPD ──
async function loadManagerMemo() {
    if (!currentAdmin || !currentAdmin.isManager) return;

    // Reset Pemilihan Pukal
    managerSelectedMemos.clear();
    updateTppdBulkButton();
    const checkAllBox = document.getElementById('tppdCheckAll');
    if (checkAllBox) checkAllBox.checked = false;

    // Tarik memo KHUSUS untuk sektor dan unit pengurusan tersebut YANG BELUM ADA KALENDAR (Atau memegang status PENDING_)
    const { data } = await _supabase
        .from('memo_rekod')
        .select('*')
        .eq('sektor', currentAdmin.managerSektor)
        .eq('unit', currentAdmin.managerUnit)
        .or('calendar_event_id.is.null,calendar_event_id.ilike.PENDING_%') // PINDAAN BAHARU: Membaca rantaian PENDING_
        .order('created_at', { ascending: false });

    managerMemoData = data || [];
    renderManagerTable(managerMemoData);
}
// ── SURGICAL EDIT END ──

function renderManagerTable(data) {
    const tbody = document.getElementById('tppdTableBody'); 
    tbody.innerHTML = data.map(row => {
        const isChecked = managerSelectedMemos.has(row.id) ? 'checked' : '';
        return `
        <tr class="hover:bg-indigo-50/30 transition-colors">
            <td class="p-4 border-b text-center align-top">
                <input type="checkbox" value="${row.id}" onchange="toggleManagerMemoSelection(${row.id}, this.checked)" class="tppd-memo-checkbox w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer transition-colors border-slate-300" ${isChecked}>
            </td>
            <td class="p-4 border-b align-top">
                <div class="font-bold text-slate-700 uppercase text-xs">${row.no_rujukan || 'TIADA'}</div>
                <div class="text-[11px] text-slate-500 mt-0.5 uppercase">${row.tajuk_program}</div>
            </td>
            <td class="p-4 border-b text-[11px] font-semibold text-slate-700 uppercase align-top">${row.dari || '-'}</td>
            <td class="p-4 border-b align-top">
                <div class="font-semibold text-slate-700 text-[11px]">${row.tarikh_terima}</div>
                <div class="text-[10px] text-indigo-600 font-bold mt-0.5">${row.masa_rekod || '-'}</div>
            </td>
            <td class="p-4 border-b text-center align-top">
                ${row.file_url ? `<a href="${row.file_url}" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold underline">Lihat Fail</a>` : '-'}
            </td>
            <td class="p-4 border-b text-center align-top">
                <button onclick="openManagerAssignModal(${row.id}, false)" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors shadow-sm whitespace-nowrap flex items-center mx-auto">
                    <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    Tindakan
                </button>
            </td>
        </tr>
    `}).join('') || '<tr><td colspan="6" class="p-8 text-center text-slate-500">Tiada rekod senarai menunggu pada unit anda.</td></tr>';
}

// ---------------- LOGIK PEMILIHAN PUKAL (BULK SELECTION) ----------------
window.toggleManagerMemoSelection = function(id, isChecked) {
    if (isChecked) managerSelectedMemos.add(id);
    else managerSelectedMemos.delete(id);
    updateTppdBulkButton();
};

window.toggleAllManagerMemos = function(isChecked) {
    const checkboxes = document.querySelectorAll('.tppd-memo-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        const id = parseInt(cb.value);
        if (isChecked) managerSelectedMemos.add(id);
        else managerSelectedMemos.delete(id);
    });
    updateTppdBulkButton();
};

function updateTppdBulkButton() {
    const btn = document.getElementById('btnPukalTppdAssign');
    const countSpan = document.getElementById('countPukalTppd');
    if (managerSelectedMemos.size > 0) {
        btn.classList.remove('hidden');
        countSpan.textContent = managerSelectedMemos.size;
    } else {
        btn.classList.add('hidden');
    }
}

function updateTppdBatchProgressUI(current, total, text) {
    const container = document.getElementById('tppdBatchProgressContainer');
    const bar = document.getElementById('tppdBatchProgressBar');
    const percentage = document.getElementById('tppdBatchPercentage');
    const statusText = document.getElementById('tppdBatchStatusText');

    if (total === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    const perc = Math.round((current / total) * 100);
    
    bar.style.width = `${perc}%`;
    percentage.textContent = `${perc}%`;
    statusText.textContent = text || `Memproses ${current}/${total} delegasi...`;
}

// ---------------- MODAL DELEGASI & BORANG ----------------
window.openManagerAssignModal = function(id = null, isBulk = false) {
    if (isBulk && managerSelectedMemos.size === 0) {
        return window.showMessage("Sila pilih sekurang-kurangnya satu memo daripada jadual untuk tindakan pukal.", "error");
    }

    // Reset Form & State
    document.getElementById('formTppdAssign').reset();
    document.getElementById('carianPegawaiTppd').value = '';
    document.getElementById('dropdownCarianTppd').classList.add('hidden');
    document.getElementById('tppdIsBulk').value = isBulk ? 'true' : 'false';
    
    managerSelected.clear();
    renderManagerTags();
    
    // RBAC OVERRIDE: Penentuan Akses Pengurus
    const isRoleTPPD = currentAdmin && currentAdmin.role === 'TPPD';

    // Placeholder Carian Pantas Dinamik
    const carianInput = document.getElementById('carianPegawaiTppd');
    if (carianInput) {
        carianInput.placeholder = isRoleTPPD ? "Akses TPPD: Carian Rentas Sektor..." : "Taip nama pegawai seliaan anda...";
    }

    // Populate Sektor Dinamik
    const sSelect = document.getElementById('tppdSektorSelect');
    sSelect.innerHTML = '<option value="">-- Sila Pilih Sektor --</option>';

    let availableSektors = [];
    if (isRoleTPPD) {
        availableSektors = adminPegawaiData.map(p => p.sektor);
    } else {
        availableSektors = [currentAdmin.managerSektor];
    }

    const unikSektor = [...new Set(availableSektors)].sort();
    unikSektor.forEach(s => {
        sSelect.innerHTML += `<option value="${s}">${s}</option>`;
    });

    const uSelect = document.getElementById('tppdUnitSelect');
    const nc = document.getElementById('tppdNamaContainer');

    // Auto-select jika profil bukan TPPD (hanya ada 1 sektor pilihan)
    if (!isRoleTPPD && unikSektor.length === 1) {
        sSelect.value = unikSektor[0];
        window.populateManagerUnit(); // Terus populasi unit
    } else {
        uSelect.innerHTML = '<option value="">Pilih Sektor Dahulu</option>';
        uSelect.disabled = true;
        nc.innerHTML = '<div class="text-slate-400 italic text-sm mt-1">Sila Pilih Sektor Atau Gunakan Carian Pantas Dahulu</div>';
    }

    // Isi Maklumat Header Secara Dinamik (Pukal vs Tunggal)
    const infoContainer = document.getElementById('tppdDisplayInfo');
    
    if (isBulk) {
        infoContainer.innerHTML = `
            <div class="flex items-center text-indigo-700 bg-indigo-100/50 p-2 rounded border border-indigo-200 shadow-sm mt-2">
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                <span class="text-sm font-bold">Mod Pukal: ${managerSelectedMemos.size} Surat dipilih untuk penugasan serentak.</span>
            </div>
        `;
    } else {
        const m = managerMemoData.find(x => x.id === id);
        if (!m) return;
        document.getElementById('tppdMemoId').value = m.id;
        infoContainer.innerHTML = `
            <p class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-0.5 mt-2">Perkara / Tajuk Surat</p>
            <p class="text-sm font-semibold text-slate-700 mb-2 leading-tight">${m.tajuk_program}</p>
            <p class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-0.5">No. Rujukan</p>
            <p class="text-sm font-semibold text-slate-700 leading-tight">${m.no_rujukan || 'TIADA RUJUKAN'}</p>
        `;
    }

    // Memastikan teks butang selaras dengan operasi (Sahkan Penugasan)
    const btnSubmit = document.getElementById('btnSubmitTppdAssign');
    if(btnSubmit) btnSubmit.textContent = 'Sahkan Penugasan';

    toggleModal('modalTppdAssign', true);
}

// ---------------- HIERARKI DINAMIK (SEKTOR -> UNIT -> PEGAWAI) ----------------
window.populateManagerUnit = function() {
    const sk = document.getElementById('tppdSektorSelect').value;
    const uSelect = document.getElementById('tppdUnitSelect');
    const nc = document.getElementById('tppdNamaContainer');

    uSelect.innerHTML = '<option value="">-- Sila Pilih Unit --</option>';

    if (sk) {
        // Unit akan ditapis mengikut sektor yang dipilih
        const unitSektor = adminPegawaiData.filter(p => p.sektor === sk).map(p => p.unit);
        const unikUnit = [...new Set(unitSektor)].sort();

        unikUnit.forEach(u => {
            uSelect.innerHTML += `<option value="${u}">${u}</option>`;
        });
        uSelect.disabled = false;
        nc.innerHTML = '<div class="text-slate-400 italic text-sm mt-1">Sila Pilih Unit Dahulu</div>';
    } else {
        uSelect.disabled = true;
        nc.innerHTML = '<div class="text-slate-400 italic text-sm mt-1">Sila Pilih Sektor & Unit Dahulu</div>';
    }
};

// ---------------- CARIAN PANTAS TPPD (DENGAN OVERRIDE RBAC) ----------------
window.handleCarianTppd = function(e) {
    const query = e.target.value.toLowerCase();
    const dropdown = document.getElementById('dropdownCarianTppd');
    dropdown.innerHTML = '';

    if (query.length < 2) {
        dropdown.classList.add('hidden');
        return;
    }

    const isRoleTPPD = currentAdmin && currentAdmin.role === 'TPPD';

    // Carian bergantung pada peranan profil (TPPD bebas, Pengurus lain dihadkan)
    const results = adminPegawaiData.filter(p => {
        const textMatch = p.nama.toLowerCase().includes(query) || p.unit.toLowerCase().includes(query) || p.sektor.toLowerCase().includes(query);
        if (isRoleTPPD) return textMatch;
        return p.sektor === currentAdmin.managerSektor && textMatch;
    }).slice(0, 15); 

    if (results.length === 0) {
        dropdown.innerHTML = `<div class="p-3 text-sm text-slate-500 italic text-center font-medium">${isRoleTPPD ? 'Tiada padanan dijumpai...' : 'Tiada padanan di dalam sektor anda...'}</div>`;
    } else {
        results.forEach(p => {
            const safeNama = p.nama.replace(/"/g, '&quot;');
            const safeSektor = p.sektor.replace(/"/g, '&quot;');
            const safeUnit = p.unit.replace(/"/g, '&quot;');
            const safeEmel = p.emel_rasmi.replace(/"/g, '&quot;');
            
            const div = document.createElement('div');
            div.className = "p-3 hover:bg-indigo-50 border-b border-slate-100 cursor-pointer transition-colors group";
            div.innerHTML = `
                <div class="text-sm font-bold text-slate-700 group-hover:text-indigo-700">${p.nama}</div>
                <div class="text-xs text-slate-500 mt-0.5 group-hover:text-indigo-500 font-medium">${isRoleTPPD ? p.sektor.replace(/^\d{2}\s/, '') + ' - ' + p.unit : p.unit}</div>
            `;
            div.onclick = () => selectPegawaiCarianTppd(safeEmel, safeNama, safeSektor, safeUnit);
            dropdown.appendChild(div);
        });
    }
    dropdown.classList.remove('hidden');
};

window.selectPegawaiCarianTppd = function(emel, nama, sektor, unit) {
    const input = document.getElementById('carianPegawaiTppd');
    const dropdown = document.getElementById('dropdownCarianTppd');
    const elSektor = document.getElementById('tppdSektorSelect');
    const elUnit = document.getElementById('tppdUnitSelect');

    // Auto-pilih Sektor
    elSektor.value = sektor;
    
    // Auto-populasi Unit
    window.populateManagerUnit();
    
    // Auto-pilih Unit
    elUnit.value = unit;
    
    // Daftar Pilihan
    managerSelected.set(emel, nama);
    
    // Update Senarai Checkbox
    populateManagerNama(); 
    
    // Update Tags
    renderManagerTags();

    input.value = '';
    dropdown.classList.add('hidden');
};

function populateManagerNama() {
    const sk = document.getElementById('tppdSektorSelect').value;
    const un = document.getElementById('tppdUnitSelect').value;
    const nc = document.getElementById('tppdNamaContainer');
    nc.innerHTML = '';
    
    const isRoleTPPD = currentAdmin && currentAdmin.role === 'TPPD';

    if (sk && un) {
        nc.innerHTML = `
            <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 sticky top-0 bg-slate-50 z-10">
                <span class="text-xs font-bold text-slate-500 uppercase">${isRoleTPPD ? 'Senarai Pegawai' : 'Pegawai Seliaan Anda'} (${un})</span>
                <button type="button" onclick="selectAllManagerInUnit()" class="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded transition-colors shadow-sm focus:outline-none">Pilih Semua / Batal</button>
            </div>
        `;

        // Tapisan Senarai Checkbox dengan Logik Override Sektor dan Unit
        const pegs = adminPegawaiData.filter(p => p.sektor === sk && p.unit === un).sort((a,b)=>a.nama.localeCompare(b.nama));
        
        pegs.forEach((p, i) => {
            const isChecked = managerSelected.has(p.emel_rasmi) ? 'checked' : '';
            const safeNama = p.nama.replace(/"/g, '&quot;');
            nc.innerHTML += `
                <div class="flex items-center mb-2 hover:bg-indigo-50/70 p-2 rounded transition-colors border border-transparent hover:border-indigo-100">
                    <input type="checkbox" id="m_c_${i}" value="${safeNama}" data-email="${p.emel_rasmi}" onchange="toggleManagerPenerima(this.value, this.getAttribute('data-email'), this.checked)" class="w-4 h-4 text-indigo-600 rounded m-checkbox focus:ring-indigo-500" ${isChecked}>
                    <label for="m_c_${i}" class="ml-3 text-sm font-medium text-slate-700 cursor-pointer flex-1 select-none">${p.nama} ${isRoleTPPD ? `<span class="text-[10px] text-slate-400 ml-1">(${p.sektor.replace(/^\d{2}\s/, '')})</span>` : ''}</label>
                </div>`;
        });
    } else {
        nc.innerHTML = '<div class="text-slate-400 italic text-sm mt-1">Sila Pilih Unit Atau Gunakan Carian Pantas Dahulu</div>';
    }
}

window.toggleManagerPenerima = function(nama, emel, isChecked) {
    if (isChecked) {
        managerSelected.set(emel, nama);
    } else {
        managerSelected.delete(emel);
    }
    renderManagerTags();
};

window.selectAllManagerInUnit = function() {
    const checkboxes = document.querySelectorAll('.m-checkbox');
    if (checkboxes.length === 0) return;

    const allChecked = Array.from(checkboxes).every(c => c.checked);
    checkboxes.forEach(c => {
        c.checked = !allChecked;
        toggleManagerPenerima(c.value, c.getAttribute('data-email'), !allChecked);
    });
};

window.removeManagerTag = function(emel) {
    managerSelected.delete(emel);
    const cb = document.querySelector(`.m-checkbox[data-email="${emel}"]`);
    if (cb) cb.checked = false;
    renderManagerTags();
};

function renderManagerTags() {
    const container = document.getElementById('tppdSelectedTagsContainer');
    const hiddenCheck = document.getElementById('tppdHiddenEmailCheck');
    
    if (managerSelected.size === 0) {
        container.innerHTML = '<span class="text-sm text-slate-400 italic mt-1 ml-1">Belum ada penerima dipilih...</span>';
        hiddenCheck.value = '';
        return;
    }

    container.innerHTML = '';
    hiddenCheck.value = 'OK'; 
    
    managerSelected.forEach((nama, emel) => {
        container.innerHTML += `
            <div class="inline-flex items-center bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full border border-indigo-200 shadow-sm transition-transform hover:-translate-y-0.5">
                <span>${nama}</span>
                <button type="button" data-email="${emel}" onclick="removeManagerTag(this.getAttribute('data-email'))" class="ml-2 text-indigo-400 hover:text-red-500 focus:outline-none transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        `;
    });
}

// ── SURGICAL EDIT START: ROMBAKAN_LOGIK_DELEGASI_TPPD ──
async function handleManagerAssignSubmit(e) {
    e.preventDefault();
    if (managerSelected.size === 0) return window.showMessage("Sila pilih sekurang-kurangnya 1 pegawai penerima.", "error");

    const isBulk = document.getElementById('tppdIsBulk').value === 'true';
    if (isBulk && managerSelectedMemos.size === 0) return window.showMessage("Ralat sistem: Tiada memo dipilih untuk tindakan pukal.", "error");

    const btn = document.getElementById('btnSubmitTppdAssign');
    btn.disabled = true;
    btn.innerHTML = '<div class="loader mr-2 border-white border-top-indigo-600 w-4 h-4"></div> Memproses...';

    const targetSektor = document.getElementById('tppdSektorSelect').value;
    const targetUnit = document.getElementById('tppdUnitSelect').value;
    
    let baseNames = Array.from(managerSelected.values());
    let baseEmails = Array.from(managerSelected.keys());

    // Menutup Modal dan Menghidupkan Progress UI
    toggleModal('modalTppdAssign', false);
    isProcessingTppdBatch = true;
    
    const idsToProcess = isBulk ? Array.from(managerSelectedMemos) : [parseInt(document.getElementById('tppdMemoId').value)];
    const totalJobs = idsToProcess.length;
    let successCount = 0;
    let errorCount = 0;

    const adminEmail = currentAdmin.email.toLowerCase();

    try {
        for (let i = 0; i < totalJobs; i++) {
            const currentId = idsToProcess[i];
            const m = managerMemoData.find(x => x.id === currentId);
            
            if (!m) {
                errorCount++;
                continue;
            }

            updateTppdBatchProgressUI(i, totalJobs, `Menetapkan ID #${currentId} (${i+1}/${totalJobs})...`);

            try {
                // Bersihkan prefix PENDING_ dari ID Kalendar untuk rekod status selesai (Syarat 2c)
                let finalEventId = m.calendar_event_id || null;
                if (finalEventId && finalEventId.startsWith('PENDING_')) {
                    finalEventId = finalEventId.replace('PENDING_', '');
                }

                // 1. Kemaskini Rekod Supabase Terlebih Dahulu (Termasuk Pembersihan Kalendar)
                const { error: updateError } = await _supabase.from('memo_rekod').update({
                    sektor: targetSektor,
                    unit: targetUnit,
                    nama_penerima: baseNames.join(', '),
                    emel_penerima: baseEmails.join(', '),
                    calendar_event_id: finalEventId 
                }).eq('id', currentId);

                if (updateError) throw updateError;

                // 2. Semakan Syarat 2c(i) & 2c(ii)
                // Periksa adakah senarai penerima mengandungi pengurus itu sendiri
                const selfDelegationEmail = baseEmails.find(e => e.toLowerCase() === adminEmail);
                const isSelfAssigned = !!selfDelegationEmail;
                const isSelfAssignOnly = baseEmails.length === 1 && isSelfAssigned;
                const selfDelegationName = selfDelegationEmail ? (managerSelected.get(selfDelegationEmail) || currentAdmin.email) : '';

                // SYARAT 2c(ii): Jika melibatkan staf lain (Hantar emel kepada staf SAHAJA)
                // Tapis keluar emel pengurus daripada senarai agar TPPD tidak diganggu lambakan e-mel PIC
                const notifyEmails = baseEmails.filter(e => e.toLowerCase() !== adminEmail);
                const notifyNames = notifyEmails.map(e => managerSelected.get(e) || e);

                if (notifyEmails.length > 0) {
                    // Hantar Emel Notifikasi Sahaja (Tanpa Kalendar Baharu) menggunakan API Fasa 1 GS
                    await fetch(GAS_URL, {
                        method: 'POST',
                        redirect: "follow",
                        headers: { "Content-Type": "text/plain;charset=utf-8" },
                        body: JSON.stringify({
                            action: 'notifyExtraEmailsOnly',
                            sektor: targetSektor,
                            unit: targetUnit,
                            newEmailsOnly: notifyEmails, 
                            noRujukan: m.no_rujukan || 'TIADA',
                            tajukProgram: m.tajuk_program,
                            fileUrl: m.file_url || 'Tiada Salinan'
                        })
                    });
                }

                if (isSelfAssigned) {
                    // SYARAT TAMBAHAN: Hantar confirmation ringkas kepada delegasi jika beliau memilih dirinya sendiri.
                    // Emel ini berasingan daripada notifikasi PIC supaya pengurus tidak menerima emel tugasan PIC berulang.
                    await fetch(GAS_URL, {
                        method: 'POST',
                        redirect: "follow",
                        headers: { "Content-Type": "text/plain;charset=utf-8" },
                        body: JSON.stringify({
                            action: 'notifyDelegationSelfConfirmation',
                            sektor: targetSektor,
                            unit: targetUnit,
                            delegasiEmail: selfDelegationEmail,
                            delegasiNama: selfDelegationName,
                            picNames: notifyNames,
                            picEmails: notifyEmails,
                            isSelfAssignOnly: isSelfAssignOnly,
                            noRujukan: m.no_rujukan || 'TIADA',
                            tajukProgram: m.tajuk_program,
                            fileUrl: m.file_url || 'Tiada Salinan'
                        })
                    });
                }
                
                successCount++;
            } catch (jobErr) {
                console.error(`Ralat Penugasan ID ${currentId}:`, jobErr);
                errorCount++;
            }
        }

        // Selesai Semua Lelaran (Loop)
        updateTppdBatchProgressUI(totalJobs, totalJobs, "Penugasan Selesai.");
        loadManagerMemo(); // Memuatkan semula senarai

        let finalMsg = '';
        if (isBulk) {
            finalMsg = `Operasi Pukal Selesai.<br><br>Berjaya: ${successCount} Memo<br>Gagal: ${errorCount} Memo<br><br>Penugasan rekod telah dikemaskini.`;
        } else {
            finalMsg = "Pengesahan berjaya. Penugasan rekod telah dikemaskini dan emel pemakluman telah disalurkan kepada pegawai pelaksana atau delegasi berkaitan (jika berkaitan).";
        }

        if (errorCount > 0) {
            window.showMessage(finalMsg, "error");
        } else {
            window.showMessage(finalMsg, "success");
        }

    } catch (err) {
        window.showMessage("Ralat luar jangka: " + err.message, "error");
    } finally {
        isProcessingTppdBatch = false;
        btn.disabled = false;
        btn.textContent = 'Sahkan Penugasan';
        setTimeout(() => updateTppdBatchProgressUI(0, 0), 2000); 
    }
}
// ── SURGICAL EDIT END ──

// ================= NAVIGASI ADMIN =================
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
    if(div) div.classList.remove('hidden');
    if(btn) {
        btn.classList.add('bg-indigo-100', 'text-indigo-700');
        btn.classList.remove('text-slate-600');
    }
}

// ================= FUNGSI SUSUNAN (SORTING) =================
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
            activeIconContainer.innerHTML = `<svg class="w-4 h-4 text-indigo-600 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>`;
        } else {
            activeIconContainer.innerHTML = `<svg class="w-4 h-4 text-indigo-600 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;
        }
    }
}

// ================= CRUD LOGIC: PEGAWAI =================
window.openPegawaiModal = function(pegawai = null) {
    const form = document.getElementById('formPegawai');
    const sSelect = document.getElementById('pegawaiSektorSelect');
    const uSelect = document.getElementById('pegawaiUnitSelect');
    const sManual = document.getElementById('pegawaiSektorManual');
    const uManual = document.getElementById('pegawaiUnitManual');
    
    form.reset();
    sManual.classList.add('hidden');
    uManual.classList.add('hidden');
    
    const unikSektor = [...new Set(adminPegawaiData.map(p => p.sektor))].sort();
    const unikUnit = [...new Set(adminPegawaiData.map(p => p.unit))].sort();

    sSelect.innerHTML = '<option value="">-- PILIH SEKTOR --</option>';
    unikSektor.forEach(s => sSelect.innerHTML += `<option value="${s}">${s}</option>`);
    sSelect.innerHTML += '<option value="MANUAL">++ TAMBAH SEKTOR BAHARU ++</option>';

    uSelect.innerHTML = '<option value="">-- PILIH UNIT --</option>';
    unikUnit.forEach(u => uSelect.innerHTML += `<option value="${u}">${u}</option>`);
    uSelect.innerHTML += '<option value="MANUAL">++ TAMBAH UNIT BAHARU ++</option>';

    if (pegawai) {
        document.getElementById('modalPegawaiTitle').textContent = "Kemaskini Data Pegawai";
        document.getElementById('pegawaiId').value = pegawai.id;
        document.getElementById('pegawaiNama').value = pegawai.nama;
        document.getElementById('pegawaiEmel').value = pegawai.emel_rasmi;
        sSelect.value = pegawai.sektor;
        uSelect.value = pegawai.unit;
    } else {
        document.getElementById('modalPegawaiTitle').textContent = "Tambah Pegawai Baharu";
        document.getElementById('pegawaiId').value = "";
    }
    
    toggleModal('modalPegawai', true);
}

window.editPegawai = function(id) {
    const p = adminPegawaiData.find(x => x.id === id);
    if (p) openPegawaiModal(p);
}

async function handlePegawaiSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('pegawaiId').value;
    
    let finalSektor = document.getElementById('pegawaiSektorSelect').value;
    if (finalSektor === 'MANUAL') {
        finalSektor = document.getElementById('pegawaiSektorManual').value;
    }

    let finalUnit = document.getElementById('pegawaiUnitSelect').value;
    if (finalUnit === 'MANUAL') {
        finalUnit = document.getElementById('pegawaiUnitManual').value;
    }

    if (!finalSektor || !finalUnit) {
        return window.showMessage("Sila pilih atau masukkan Sektor dan Unit.", "error");
    }

    const payload = {
        nama: document.getElementById('pegawaiNama').value.toUpperCase(),
        sektor: finalSektor.toUpperCase(),
        unit: finalUnit.toUpperCase(),
        emel_rasmi: document.getElementById('pegawaiEmel').value
    };

    try {
        if (id) {
            await _supabase.from('memo_pegawai').update(payload).eq('id', id);
            window.showMessage("Data pegawai berjaya dikemaskini.", "success");
        } else {
            await _supabase.from('memo_pegawai').insert([payload]);
            window.showMessage("Pegawai baharu berjaya didaftarkan.", "success");
        }
        toggleModal('modalPegawai', false);
        await loadAdminPegawai();
    } catch (err) {
        window.showMessage("Gagal menyimpan pegawai: " + err.message, "error");
    }
}

// Menggunakan SweetAlert2 Promise untuk Pengesahan
window.deletePegawai = function(id) {
    Swal.fire({
        title: 'Pengesahan Pemadaman',
        text: "Adakah anda pasti mahu memadam profil pegawai ini daripada sistem?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Ya, Padam',
        cancelButtonText: 'Batal',
        customClass: { popup: 'rounded-2xl', confirmButton: 'text-sm font-bold', cancelButton: 'text-sm font-bold' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await _supabase.from('memo_pegawai').delete().eq('id', id);
                loadAdminPegawai();
                window.showMessage("Pegawai telah dikeluarkan dari sistem.", "success");
            } catch (err) {
                window.showMessage("Ralat padam: " + err.message, "error");
            }
        }
    });
}

// ================= CRUD LOGIC: MEMO (Edit Maklumat & Ubah Hala PIC) =================

// ---------------- CARIAN PANTAS ADMIN EDIT MEMO ----------------
window.handleCarianAdminEdit = function(e) {
    const query = e.target.value.toLowerCase();
    const dropdown = document.getElementById('dropdownCarianEdit');
    dropdown.innerHTML = '';

    if (query.length < 2) {
        dropdown.classList.add('hidden');
        return;
    }

    // Admin bebas mencari seluruh sektor
    const results = adminPegawaiData.filter(p => 
        p.nama.toLowerCase().includes(query) || 
        p.sektor.toLowerCase().includes(query) || 
        p.unit.toLowerCase().includes(query)
    ).slice(0, 15); 

    if (results.length === 0) {
        dropdown.innerHTML = '<div class="p-3 text-sm text-slate-500 italic text-center font-medium">Tiada padanan rekod dijumpai...</div>';
    } else {
        results.forEach(p => {
            const safeNama = p.nama.replace(/"/g, '&quot;');
            const safeSektor = p.sektor.replace(/"/g, '&quot;');
            const safeUnit = p.unit.replace(/"/g, '&quot;');
            const safeEmel = p.emel_rasmi.replace(/"/g, '&quot;');
            
            const div = document.createElement('div');
            div.className = "p-3 hover:bg-indigo-50 border-b border-slate-100 cursor-pointer transition-colors group";
            div.innerHTML = `
                <div class="text-sm font-bold text-slate-700 group-hover:text-indigo-700">${p.nama}</div>
                <div class="text-xs text-slate-500 mt-0.5 group-hover:text-indigo-500 font-medium">${p.sektor.replace(/^\d{2}\s/, '')} - ${p.unit}</div>
            `;
            div.onclick = () => selectPegawaiCarianEdit(safeEmel, safeNama, safeSektor, safeUnit);
            dropdown.appendChild(div);
        });
    }
    dropdown.classList.remove('hidden');
};

window.selectPegawaiCarianEdit = function(emel, nama, sektor, unit) {
    const input = document.getElementById('carianPegawaiEdit');
    const dropdown = document.getElementById('dropdownCarianEdit');
    const elSektor = document.getElementById('adminEditSektor');
    const elUnit = document.getElementById('adminEditUnit');

    // Auto-pilih Sektor
    elSektor.value = sektor;
    
    // Auto-populasi Unit
    populateAdminEditUnit();
    elUnit.value = unit;
    
    // Daftar Pilihan
    adminEditSelected.set(emel, nama);
    
    // Update Senarai Checkbox
    populateAdminEditNama(); 
    
    // Update Tags
    renderAdminEditTags();

    input.value = '';
    dropdown.classList.add('hidden');
};

function populateAdminEditSektor() {
    const sSelect = document.getElementById('adminEditSektor');
    if (!sSelect) return;
    const unikSektor = [...new Set(adminPegawaiData.map(p => p.sektor))].sort();
    sSelect.innerHTML = '<option value="">-- Pilih Sektor --</option>';
    unikSektor.forEach(s => sSelect.innerHTML += `<option value="${s}">${s}</option>`);
}

function populateAdminEditUnit() {
    const sk = document.getElementById('adminEditSektor').value;
    const uSelect = document.getElementById('adminEditUnit');
    const nc = document.getElementById('adminEditNamaContainer');
    
    uSelect.innerHTML = '<option value="">-- Pilih Unit --</option>';
    
    if (sk) {
        const unitSektor = adminPegawaiData.filter(p => p.sektor === sk).map(p => p.unit);
        const unikUnit = [...new Set(unitSektor)].sort();
        unikUnit.forEach(u => uSelect.innerHTML += `<option value="${u}">${u}</option>`);
        uSelect.disabled = false;
        nc.innerHTML = '<div class="text-slate-400 italic text-sm mt-1">Sila Pilih Unit Dahulu</div>';
    } else {
        uSelect.disabled = true;
        nc.innerHTML = '<div class="text-slate-400 italic text-sm mt-1">Sila Pilih Sektor & Unit Dahulu</div>';
    }
}

function populateAdminEditNama() {
    const sk = document.getElementById('adminEditSektor').value;
    const un = document.getElementById('adminEditUnit').value;
    const nc = document.getElementById('adminEditNamaContainer');
    nc.innerHTML = '';

    if (sk && un) {
        nc.innerHTML = `
            <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 sticky top-0 bg-slate-50 z-10">
                <span class="text-xs font-bold text-slate-500 uppercase">Senarai Pegawai (${un})</span>
                <button type="button" onclick="selectAllAdminEditInUnit()" class="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded transition-colors shadow-sm focus:outline-none">Pilih Semua / Batal</button>
            </div>
        `;

        const pegs = adminPegawaiData.filter(p => p.sektor === sk && p.unit === un).sort((a,b)=>a.nama.localeCompare(b.nama));
        
        pegs.forEach((p, i) => {
            const isChecked = adminEditSelected.has(p.emel_rasmi) ? 'checked' : '';
            const safeNama = p.nama.replace(/"/g, '&quot;');
            nc.innerHTML += `
                <div class="flex items-center mb-2 hover:bg-indigo-50/70 p-2 rounded transition-colors border border-transparent hover:border-indigo-100">
                    <input type="checkbox" id="ae_c_${i}" value="${safeNama}" data-email="${p.emel_rasmi}" onchange="toggleAdminEditPenerima(this.value, this.getAttribute('data-email'), this.checked)" class="w-4 h-4 text-indigo-600 rounded ae-checkbox focus:ring-indigo-500" ${isChecked}>
                    <label for="ae_c_${i}" class="ml-3 text-sm font-medium text-slate-700 cursor-pointer flex-1 select-none">${p.nama}</label>
                </div>`;
        });
    } else {
        nc.innerHTML = '<div class="text-slate-400 italic text-sm mt-1">Sila Pilih Unit Atau Gunakan Carian Pantas Dahulu</div>';
    }
}

window.toggleAdminEditPenerima = function(nama, emel, isChecked) {
    if (isChecked) adminEditSelected.set(emel, nama);
    else adminEditSelected.delete(emel);
    renderAdminEditTags();
};

window.selectAllAdminEditInUnit = function() {
    const checkboxes = document.querySelectorAll('.ae-checkbox');
    if (checkboxes.length === 0) return;
    const allChecked = Array.from(checkboxes).every(c => c.checked);
    checkboxes.forEach(c => {
        c.checked = !allChecked;
        toggleAdminEditPenerima(c.value, c.getAttribute('data-email'), !allChecked);
    });
};

window.removeAdminEditTag = function(emel) {
    adminEditSelected.delete(emel);
    const cb = document.querySelector(`.ae-checkbox[data-email="${emel}"]`);
    if (cb) cb.checked = false;
    renderAdminEditTags();
};

function renderAdminEditTags() {
    const container = document.getElementById('adminEditSelectedTagsContainer');
    if (adminEditSelected.size === 0) {
        container.innerHTML = '<span class="text-sm text-slate-400 italic mt-1 ml-1">Belum ada penerima dipilih...</span>';
        return;
    }
    container.innerHTML = '';
    adminEditSelected.forEach((nama, emel) => {
        container.innerHTML += `
            <div class="inline-flex items-center bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full border border-indigo-200 shadow-sm transition-transform hover:-translate-y-0.5">
                <span>${nama}</span>
                <button type="button" data-email="${emel}" onclick="removeAdminEditTag(this.getAttribute('data-email'))" class="ml-2 text-indigo-400 hover:text-red-500 focus:outline-none transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        `;
    });
}

window.editMemo = function(id) {
    let m = adminMemoData.find(x => x.id === id);
    if (!m && typeof allRecords !== 'undefined') {
        m = allRecords.find(x => x.id === id);
    }
    if (!m) return window.showMessage("Ralat pangkalan data: Memo tidak dijumpai.", "error");
    
    // Teks Asas
    document.getElementById('memoId').value = m.id;
    document.getElementById('memoNoRujukan').value = m.no_rujukan || '';
    document.getElementById('memoNoTambahan').value = m.no_tambahan || '';
    document.getElementById('memoDari').value = m.dari || '';
    document.getElementById('memoTajuk').value = m.tajuk_program || '';
    document.getElementById('memoTarikhSurat').value = m.tarikh_surat || '';
    document.getElementById('memoTarikhTerima').value = m.tarikh_terima || '';
    document.getElementById('memoMasaRekod').value = m.masa_rekod || '';

    // Bersihkan Carian Pantas
    document.getElementById('carianPegawaiEdit').value = '';
    document.getElementById('dropdownCarianEdit').classList.add('hidden');

    // Logik Inisialisasi PIC (Pre-select data semasa)
    adminEditSelected.clear();
    if (m.emel_penerima && m.nama_penerima) {
        const emels = m.emel_penerima.split(',').map(e => e.trim());
        const namas = m.nama_penerima.split(',').map(n => n.trim());
        emels.forEach((e, i) => {
            if (e) adminEditSelected.set(e, namas[i] || e);
        });
    }

    // Penduduk Sektor & Unit secara dinamik
    populateAdminEditSektor();
    const sSelect = document.getElementById('adminEditSektor');
    sSelect.value = m.sektor || '';
    
    populateAdminEditUnit();
    const uSelect = document.getElementById('adminEditUnit');
    uSelect.value = m.unit || '';

    populateAdminEditNama();
    renderAdminEditTags();

    toggleModal('modalMemo', true);
}

// ── SURGICAL EDIT START: PINTAS_EMEL_BAHARU_KHUSUS (Syarat 3a) ──
async function handleMemoSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('memoId').value;
    const btn = document.getElementById('btnSimpanMemo');

    let m = adminMemoData.find(x => x.id == id);
    if (!m && typeof allRecords !== 'undefined') {
        m = allRecords.find(x => x.id == id);
    }
    if (!m) return window.showMessage("Ralat pangkalan data: Memo tidak dijumpai.", "error");

    if (adminEditSelected.size === 0) {
        return window.showMessage("Sila pilih sekurang-kurangnya 1 pegawai penerima dari senarai unit.", "error");
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="loader mr-2 border-slate-300 border-top-slate-500 w-4 h-4"></div> Memproses...';

    try {
        const names = Array.from(adminEditSelected.values());
        const emails = Array.from(adminEditSelected.keys());
        const targetSektor = document.getElementById('adminEditSektor').value;
        const targetUnit = document.getElementById('adminEditUnit').value;

        // 1. Algoritma Perbandingan (Diff Checker) yang Tepat untuk Syarat 3a
        const oldEmailsStr = m.emel_penerima || "";
        const oldEmailsArr = oldEmailsStr.split(',').map(e => e.trim().toLowerCase()).filter(e => e);
        
        // Cari HANYA emel yang baharu ditambah 
        const newlyAddedEmails = [];
        
        emails.forEach(e => {
            if (!oldEmailsArr.includes(e.trim().toLowerCase())) {
                newlyAddedEmails.push(e);
            }
        });

        const isEmailAdded = newlyAddedEmails.length > 0;

        const payload = {
            no_rujukan: document.getElementById('memoNoRujukan').value.toUpperCase(),
            no_tambahan: document.getElementById('memoNoTambahan').value.toUpperCase(),
            dari: document.getElementById('memoDari').value.toUpperCase(),
            tajuk_program: document.getElementById('memoTajuk').value.toUpperCase(),
            tarikh_surat: document.getElementById('memoTarikhSurat').value,
            tarikh_terima: document.getElementById('memoTarikhTerima').value,
            masa_rekod: document.getElementById('memoMasaRekod').value,
            sektor: targetSektor,
            unit: targetUnit,
            nama_penerima: names.join(', '),
            emel_penerima: emails.join(', ')
            // Nota Penting: calendar_event_id dipelihara secara mutlak
        };

        // 2. Kemaskini Pangkalan Data Supabase 
        const { error } = await _supabase.from('memo_rekod').update(payload).eq('id', id);
        if (error) throw error;

        // 3. Logik Seruan Pelayan (Hanya dicetus jika terdapat pertambahan penerima)
        let messageText = "Maklumat surat dikemaskini. (Tiada notifikasi e-mel tambahan dihantar)";
        
        if (isEmailAdded) {
            try {
                // Memanggil GAS untuk menghantar notifikasi HANYA kepada e-mel baharu
                await fetch(GAS_URL, {
                    method: 'POST',
                    redirect: "follow",
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify({
                        action: 'notifyExtraEmailsOnly',
                        sektor: targetSektor,
                        unit: targetUnit,
                        newEmailsOnly: newlyAddedEmails, // Fungsi Fasa 1 GS akan menapisnya
                        noRujukan: payload.no_rujukan || 'TIADA',
                        tajukProgram: payload.tajuk_program,
                        fileUrl: m.file_url || 'Tiada Salinan'
                    })
                });
                messageText = `Maklumat dikemaskini. (Notifikasi e-mel telah dipancarkan kepada ${newlyAddedEmails.length} penerima tambahan sahaja)`;
            } catch (gasErr) {
                console.error("Ralat menghantar emel pemakluman:", gasErr);
                messageText = "Maklumat dikemaskini, tetapi sistem gagal menghubungi pelayan e-mel.";
            }
        }

        toggleModal('modalMemo', false);
        
        // Penyegaran Jadual Automatik (Admin & Analisis)
        if (currentAdmin && currentAdmin.isSystemAdmin) {
            loadAdminMemo();
        }
        if (typeof loadDashboardData === 'function') {
            loadDashboardData(); 
        }
        
        window.showMessage("Selesai. " + messageText, "success");

    } catch (err) {
        window.showMessage("Ralat Transaksi: Gagal mengemaskini maklumat surat. " + err.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Simpan & Kemaskini';
    }
}
// ── SURGICAL EDIT END ──

// ================= TINDAKAN KALENDAR (INDIVIDU) =================
window.syncSingleCalendar = async function(id) {
    if (isProcessingBatch) return window.showMessage("Sistem sedang memproses pukal.", "error");
    
    const m = adminMemoData.find(x => x.id === id);
    if (!m) return;

    try {
        setProcessingState(true, `Menyegerak rekod #${id}...`);
        
        // Sediakan array penerima
        const names = m.nama_penerima ? m.nama_penerima.split(',').map(n => n.trim()) : [];
        const emails = m.emel_penerima ? m.emel_penerima.split(',').map(e => e.trim()) : [];

        // Pastikan kita gunakan fungsi kalendar secara paksa di peringkat Admin
        const res = await fetch(GAS_URL, {
            method: 'POST',
            redirect: "follow",
            headers: {
                "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify({
                action: 'notify',
                sektor: m.sektor,
                unit: m.unit,
                namaArray: names,
                emailArray: emails,
                noRujukan: m.no_rujukan || 'TIADA',
                tajukProgram: m.tajuk_program,
                tarikhTerima: m.tarikh_terima,
                masaRekod: m.masa_rekod || '08:00',
                fileUrl: m.file_url || 'Tiada Salinan'
            })
        });
        const notify = await res.json();

        if (notify.status === 'success' && notify.calendarEventId) {
            await _supabase.from('memo_rekod').update({ calendar_event_id: notify.calendarEventId }).eq('id', id);
            window.showMessage("Penyegerakan kalendar berjaya.", "success");
            loadAdminMemo();
            refreshIframeKalendar();
        } else {
            throw new Error(notify.message || "Ralat tidak diketahui.");
        }
    } catch (err) {
        window.showMessage("Gagal menyegerak kalendar: " + err.message, "error");
    } finally {
        setProcessingState(false);
    }
}

// Menggunakan SweetAlert2 Promise untuk Pengesahan
window.removeSingleCalendar = function(id) {
    if (isProcessingBatch) return window.showMessage("Sistem sedang memproses pukal.", "error");

    const m = adminMemoData.find(x => x.id === id);
    if (!m || !m.calendar_event_id) return;

    Swal.fire({
        title: 'Pengesahan',
        text: "Padam acara ini dari Google Kalendar? Data di dalam sistem akan dikekalkan.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Ya, Padam',
        cancelButtonText: 'Batal',
        customClass: { popup: 'rounded-2xl', confirmButton: 'text-sm font-bold', cancelButton: 'text-sm font-bold' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                setProcessingState(true, `Memadam rekod kalendar #${id}...`);

                const res = await fetch(GAS_URL, {
                    method: 'POST',
                    redirect: "follow",
                    headers: {
                        "Content-Type": "text/plain;charset=utf-8",
                    },
                    body: JSON.stringify({ action: 'deleteEvent', eventId: m.calendar_event_id })
                });
                const responseJSON = await res.json();

                // Sama ada berjaya atau "not_found", kita putuskan pautan di Supabase
                if (responseJSON.status === 'success' || responseJSON.status === 'not_found') {
                    await _supabase.from('memo_rekod').update({ calendar_event_id: null }).eq('id', id);
                    window.showMessage("Acara kalendar berjaya ditanggalkan.", "success");
                    loadAdminMemo();
                    refreshIframeKalendar();
                } else {
                    throw new Error(responseJSON.message);
                }
            } catch (err) {
                window.showMessage("Ralat Kalendar: " + err.message, "error");
            } finally {
                setProcessingState(false);
            }
        }
    });
}

// ================= TINDAKAN DATA (PADAM KESELURUHAN) =================
// Menggunakan SweetAlert2 Promise untuk Pengesahan
window.deleteMemo = function(id) {
    if (isProcessingBatch) return window.showMessage("Sistem sedang memproses pukal.", "error");

    const m = adminMemoData.find(x => x.id === id);
    if (!m) return;

    const confirmMsg = "AMARAN: Ini akan memadam rekod surat selamanya dari pangkalan data sistem. " +
                       (m.calendar_event_id ? "Acara kalendar berkaitan juga akan turut dipadam. " : "") +
                       "<br><br>Teruskan?";

    Swal.fire({
        title: 'Pengesahan Pemadaman Penuh',
        html: confirmMsg,
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Hapus Kekal',
        cancelButtonText: 'Batal',
        customClass: { popup: 'rounded-2xl', confirmButton: 'text-sm font-bold', cancelButton: 'text-sm font-bold' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                setProcessingState(true, "Memadam data secara menyeluruh...");

                // 1. Padam Kalendar Dahulu Jika Ada
                if (m.calendar_event_id) {
                    try {
                        await fetch(GAS_URL, {
                            method: 'POST',
                            redirect: "follow",
                            headers: {
                                "Content-Type": "text/plain;charset=utf-8",
                            },
                            body: JSON.stringify({ action: 'deleteEvent', eventId: m.calendar_event_id })
                        });
                    } catch (e) { console.error("Ralat padam kalendar ketika hapus data", e); }
                }

                // 2. Padam Dari Supabase
                const { error } = await _supabase.from('memo_rekod').delete().eq('id', id);
                if (error) throw error;

                loadAdminMemo();
                refreshIframeKalendar();
                window.showMessage("Rekod surat telah berjaya dihapuskan sepenuhnya.", "success");

            } catch (err) {
                window.showMessage("Ralat semasa proses pemadaman: " + err.message, "error");
            } finally {
                setProcessingState(false);
            }
        }
    });
}

// ================= PENGURUS GILIRAN PUKAL (BATCH QUEUE MANAGER) =================
function updateBatchProgressUI(current, total, text) {
    const container = document.getElementById('adminBatchProgressContainer');
    const bar = document.getElementById('batchProgressBar');
    const percentage = document.getElementById('batchPercentage');
    const statusText = document.getElementById('batchStatusText');

    if (total === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    const perc = Math.round((current / total) * 100);
    
    bar.style.width = `${perc}%`;
    percentage.textContent = `${perc}%`;
    statusText.textContent = text || `Memproses ${current}/${total} rekod...`;
}

function setProcessingState(isProcessing, lockText = "Sedang diproses...") {
    isProcessingBatch = isProcessing;
    const btns = document.querySelectorAll('button');
    btns.forEach(b => {
        // Jangan disable butang logout kalau tak process pukal
        if (b.id !== 'btnLogKeluarAdmin') {
            b.disabled = isProcessing;
            if (isProcessing) b.classList.add('opacity-50', 'cursor-not-allowed');
            else b.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });

    if (isProcessing && !document.getElementById('adminBatchProgressContainer').classList.contains('hidden') === false) {
        // Fallback untuk single update
        updateBatchProgressUI(1, 1, lockText);
    } else if (!isProcessing) {
        updateBatchProgressUI(0, 0); // Hide
    }
}

// Menggunakan SweetAlert2 Promise untuk Pengesahan
window.startBatchSync = function() {
    if (isProcessingBatch) return;
    
    // Cari yang belum disegerak
    const queue = adminMemoData.filter(m => !m.calendar_event_id);
    if (queue.length === 0) {
        return window.showMessage("Semua data telah pun disegerakkan ke kalendar.", "success");
    }

    Swal.fire({
        title: 'Operasi Segerak Pukal',
        html: `Sistem mendapati terdapat <b>${queue.length}</b> rekod yang belum disegerakkan ke Kalendar. Proses ini akan menghantar jemputan satu per satu.<br><br>Adakah anda pasti mahu mulakan operasi pukal?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#059669', // Emerald 600
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Mula Segerak',
        cancelButtonText: 'Batal',
        customClass: { popup: 'rounded-2xl', confirmButton: 'text-sm font-bold', cancelButton: 'text-sm font-bold' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            setProcessingState(true);
            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < queue.length; i++) {
                const m = queue[i];
                updateBatchProgressUI(i, queue.length, `Menyegerak ID #${m.id} (${i+1}/${queue.length})...`);
                
                try {
                    const names = m.nama_penerima ? m.nama_penerima.split(',').map(n => n.trim()) : [];
                    const emails = m.emel_penerima ? m.emel_penerima.split(',').map(e => e.trim()) : [];

                    const res = await fetch(GAS_URL, {
                        method: 'POST',
                        redirect: "follow",
                        headers: {
                            "Content-Type": "text/plain;charset=utf-8",
                        },
                        body: JSON.stringify({
                            action: 'notify',
                            sektor: m.sektor,
                            unit: m.unit,
                            namaArray: names,
                            emailArray: emails,
                            noRujukan: m.no_rujukan || 'TIADA',
                            tajukProgram: m.tajuk_program,
                            tarikhTerima: m.tarikh_terima,
                            masaRekod: m.masa_rekod || '08:00',
                            fileUrl: m.file_url || 'Tiada Salinan'
                        })
                    });
                    const notify = await res.json();

                    if (notify.status === 'success' && notify.calendarEventId) {
                        await _supabase.from('memo_rekod').update({ calendar_event_id: notify.calendarEventId }).eq('id', m.id);
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (err) {
                    errorCount++;
                    console.error(`Ralat Pukal Sync ID ${m.id}:`, err);
                }
            }

            updateBatchProgressUI(queue.length, queue.length, "Proses Selesai.");
            setProcessingState(false);
            loadAdminMemo();
            refreshIframeKalendar();
            
            window.showMessage(`Operasi Segerak Pukal Tamat.<br>Berjaya: ${successCount}<br>Gagal: ${errorCount}`, "success");
        }
    });
}

// Menggunakan SweetAlert2 Promise untuk Pengesahan
window.startBatchDelete = function() {
    if (isProcessingBatch) return;

    // Cari yang ada kalendar sahaja
    const queue = adminMemoData.filter(m => m.calendar_event_id);
    if (queue.length === 0) {
        return window.showMessage("Tiada rekod kalendar yang dijumpai untuk dipadam.", "success");
    }

    Swal.fire({
        title: 'AMARAN PUKAL',
        html: `Sistem akan <b>MEMADAM ${queue.length} acara</b> di dalam Google Kalendar satu per satu. Data surat di dalam sistem ini akan DIKEKALKAN.<br><br>Adakah anda pasti?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Ya, Padam Pukal',
        cancelButtonText: 'Batal',
        customClass: { popup: 'rounded-2xl', confirmButton: 'text-sm font-bold', cancelButton: 'text-sm font-bold' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            setProcessingState(true);
            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < queue.length; i++) {
                const m = queue[i];
                updateBatchProgressUI(i, queue.length, `Memadam Kalendar ID #${m.id} (${i+1}/${queue.length})...`);

                try {
                    const res = await fetch(GAS_URL, {
                        method: 'POST',
                        redirect: "follow",
                        headers: {
                            "Content-Type": "text/plain;charset=utf-8",
                        },
                        body: JSON.stringify({ action: 'deleteEvent', eventId: m.calendar_event_id })
                    });
                    const responseJSON = await res.json();

                    if (responseJSON.status === 'success' || responseJSON.status === 'not_found') {
                        await _supabase.from('memo_rekod').update({ calendar_event_id: null }).eq('id', m.id);
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (err) {
                    errorCount++;
                    console.error(`Ralat Pukal Delete ID ${m.id}:`, err);
                }
            }

            updateBatchProgressUI(queue.length, queue.length, "Proses Selesai.");
            setProcessingState(false);
            loadAdminMemo();
            refreshIframeKalendar();

            window.showMessage(`Operasi Padam Kalendar Pukal Tamat.<br>Berjaya: ${successCount}<br>Gagal: ${errorCount}`, "success");
        }
    });
}

function refreshIframeKalendar() {
    const calFrame = document.getElementById('calendarFrame');
    if (calFrame) calFrame.src = calFrame.src;
}

// ================= CRUD LOGIC: SISTEM (ADMIN & PERAKAM) =================
async function handleTambahAdminSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('tambahAdminEmail').value;
    const pass = document.getElementById('tambahAdminPassword').value;
    const role = document.getElementById('tambahAdminRole').value;

    const btn = document.getElementById('btnSimpanAdmin');
    btn.disabled = true;
    btn.innerHTML = '<div class="loader mr-2 border-white border-top-indigo-500"></div> Menyimpan...';

    try {
        await _supabase.from('memo_admin').insert([{
            email: email,
            password: pass,
            role: role
        }]);
        loadAdminSistem();
        toggleModal('modalTambahAdmin', false);
        document.getElementById('formTambahAdmin').reset();
        window.showMessage(`Akses pengguna baharu berjawatan ${role} berjaya didaftarkan.`, "success");
    } catch (err) {
        window.showMessage("Gagal menambah akses sistem: " + err.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Daftar Pengguna';
    }
}

// Menggunakan SweetAlert2 Promise untuk Pengesahan
window.deleteAdmin = function(id) {
    Swal.fire({
        title: 'Gugurkan Akses',
        text: "Gugurkan akses sistem ini secara kekal?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Ya, Gugurkan',
        cancelButtonText: 'Batal',
        customClass: { popup: 'rounded-2xl', confirmButton: 'text-sm font-bold', cancelButton: 'text-sm font-bold' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await _supabase.from('memo_admin').delete().eq('id', id);
                loadAdminSistem();
                window.showMessage("Akses profil telah berjaya dibatalkan.", "success");
            } catch (err) {
                window.showMessage("Gagal membatalkan akses profil.", "error");
            }
        }
    });
}

// ================= SEARCH & UTILS =================
function filterAdminTable(type, query) {
    const q = query.toLowerCase();
    if (type === 'memo') {
        const filtered = adminMemoData.filter(m => 
            (m.tajuk_program && m.tajuk_program.toLowerCase().includes(q)) ||
            (m.no_rujukan && m.no_rujukan.toLowerCase().includes(q)) ||
            (m.no_tambahan && m.no_tambahan.toLowerCase().includes(q)) ||
            (m.dari && m.dari.toLowerCase().includes(q)) ||
            (m.sektor && m.sektor.toLowerCase().includes(q)) ||
            (m.nama_penerima && m.nama_penerima.toLowerCase().includes(q))
        );
        renderAdminMemoTable(filtered);
    } else if (type === 'pegawai') {
        const filtered = adminPegawaiData.filter(p => p.nama.toLowerCase().includes(q) || p.sektor.toLowerCase().includes(q));
        renderAdminPegawaiTable(filtered);
    }
}

function toggleModal(id, show) {
    const m = document.getElementById(id);
    if (!m) return;
    if (show) {
        m.classList.remove('hidden');
    } else {
        m.classList.add('hidden');
    }
}