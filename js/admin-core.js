/**
 * ==============================================================================
 * SISTEM PENGURUSAN MEMO@AG
 * Modul: js/admin-core.js
 * Tujuan: State pentadbir, sesi RBAC, login/logout, data admin, rendering jadual,
 *         sorting/filtering, helper modal dan intercept URL delegasi.
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

// ================= NAVIGASI SUB-SEKSYEN ADMIN =================
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

// ================= FILTER JADUAL ADMIN =================
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
