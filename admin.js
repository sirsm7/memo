/**
 * ==============================================================================
 * SISTEM PENGURUSAN MEMO@AG
 * Architect: 0.1% Senior Software Architect
 * Modul: admin.js (Enjin Kawalan Pentadbir & Operasi CRUD Pukal)
 * ==============================================================================
 */

// STATE PENTADBIR
let currentAdmin = null;
let adminMemoData = [];
let adminPegawaiData = [];
let adminSistemData = [];
let isProcessingBatch = false;

// STATE SUSUNAN (SORTING)
let adminSortState = {
    memo: { column: 'created_at', direction: 'desc' },
    pegawai: { column: 'nama', direction: 'asc' }
};

// ================= INISIALISASI ADMIN =================
document.addEventListener('DOMContentLoaded', () => {
    checkAdminSession();
    setupAdminEventListeners();
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

    // CRUD Memo
    document.getElementById('formMemo')?.addEventListener('submit', handleMemoSubmit);

    // Tindakan Pukal (Batch Processing) Kalendar
    document.getElementById('btnPukalSegerak')?.addEventListener('click', startBatchSync);
    document.getElementById('btnPukalPadam')?.addEventListener('click', startBatchDelete);

    // CRUD Sistem (Admin Baru)
    document.getElementById('btnTambahAdmin')?.addEventListener('click', handleTambahAdmin);

    // Carian Admin
    document.getElementById('adminSearchMemo')?.addEventListener('input', (e) => filterAdminTable('memo', e.target.value));
    document.getElementById('adminSearchPegawai')?.addEventListener('input', (e) => filterAdminTable('pegawai', e.target.value));

    // Tutup sebarang modal
    document.querySelectorAll('.btnTutupModal').forEach(btn => {
        btn.addEventListener('click', () => {
            if (isProcessingBatch) return; // Halang tutup jika sedang proses pukal
            toggleModal('modalLoginAdmin', false);
            toggleModal('modalPegawai', false);
            toggleModal('modalMemo', false);
        });
    });
}

// ================= PENGURUSAN SESI =================
function checkAdminSession() {
    const session = sessionStorage.getItem('memo_admin_session');
    if (session) {
        currentAdmin = JSON.parse(session);
        showAdminUI(true);
        loadAdminData();
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
    btn.innerHTML = '<div class="loader mr-2"></div> Sahkan...';

    try {
        const { data, error } = await _supabase
            .from('memo_admin')
            .select('*')
            .eq('email', email)
            .eq('password', pass)
            .single();

        if (error || !data) throw new Error("Emel atau Kata Laluan salah.");

        currentAdmin = data;
        sessionStorage.setItem('memo_admin_session', JSON.stringify(data));
        
        toggleModal('modalLoginAdmin', false);
        showAdminUI(true);
        loadAdminData();
        window.showMessage(`Selamat Datang, ${data.role}!`, 'success');

    } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Log Masuk';
    }
}

function handleLogout() {
    if (isProcessingBatch) {
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

    if (isLoggedIn) {
        btnLogin.classList.add('hidden');
        btnLogout.classList.remove('hidden');
        tabAdmin.classList.remove('hidden');
    } else {
        btnLogin.classList.remove('hidden');
        btnLogout.classList.add('hidden');
        tabAdmin.classList.add('hidden');
    }
}

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

// ================= DATA FETCHING =================
async function loadAdminData() {
    loadAdminMemo();
    loadAdminPegawai();
    loadAdminSistem();
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
    
    // Tetapkan susunan lalai ke state
    adminSortState.pegawai = { column: 'nama', direction: 'asc' };
    
    filterAdminTable('pegawai', document.getElementById('adminSearchPegawai')?.value || '');
    updateSortIcons('pegawai');
}

async function loadAdminSistem() {
    const { data } = await _supabase.from('memo_admin').select('*').order('id');
    adminSistemData = data || [];
    renderAdminSistemTable(adminSistemData);
}

// ================= RENDERING TABLES =================
function renderAdminMemoTable(data) {
    const tbody = document.getElementById('adminTableMemoBody');
    tbody.innerHTML = data.map(row => {
        const hasCalendar = !!row.calendar_event_id;
        
        return `
        <tr>
            <td class="p-3 border-b text-xs font-mono text-slate-400 align-top">#${row.id}</td>
            <td class="p-3 border-b align-top">
                <div class="font-bold text-slate-700">${row.no_rujukan || 'TIADA'}</div>
                <div class="text-xs text-slate-500 mt-1">${row.tajuk_program}</div>
            </td>
            <td class="p-3 border-b align-top">
                <div class="font-semibold text-slate-700">${row.tarikh_terima}</div>
                <div class="text-xs text-indigo-600 font-bold mt-1">${row.masa_rekod || '-'}</div>
            </td>
            <td class="p-3 border-b text-center align-top">
                ${hasCalendar ? 
                    `<button onclick="removeSingleCalendar(${row.id})" class="text-red-500 hover:text-red-700 text-xs font-bold bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition-colors flex items-center justify-center mx-auto w-28">
                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg> Padam Kalendar
                    </button>` 
                    : 
                    `<button onclick="syncSingleCalendar(${row.id})" class="text-emerald-600 hover:text-emerald-800 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded transition-colors flex items-center justify-center mx-auto w-28">
                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Segerak Kalendar
                    </button>`
                }
            </td>
            <td class="p-3 border-b text-center align-top space-x-2">
                <button onclick="editMemo(${row.id})" class="text-indigo-600 hover:text-indigo-900 font-bold text-xs uppercase tracking-wider">Edit</button>
                <button onclick="deleteMemo(${row.id})" class="text-slate-400 hover:text-red-600 font-bold text-xs uppercase tracking-wider">Padam Rekod</button>
            </td>
        </tr>
    `}).join('') || '<tr><td colspan="5" class="p-4 text-center">Tiada rekod.</td></tr>';
}

function renderAdminPegawaiTable(data) {
    const tbody = document.getElementById('adminTablePegawaiBody');
    tbody.innerHTML = data.map(row => `
        <tr>
            <td class="p-3 border-b font-bold text-slate-700 uppercase">${row.nama}</td>
            <td class="p-3 border-b text-xs">
                <div class="font-semibold text-indigo-600">${row.sektor}</div>
                <div class="text-slate-500">${row.unit}</div>
            </td>
            <td class="p-3 border-b text-slate-600">${row.emel_rasmi}</td>
            <td class="p-3 border-b text-center space-x-2">
                <button onclick="editPegawai(${row.id})" class="text-indigo-600 hover:text-indigo-900 font-bold">Edit</button>
                <button onclick="deletePegawai(${row.id})" class="text-red-500 hover:text-red-700 font-bold">Padam</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="p-4 text-center">Tiada rekod.</td></tr>';
}

function renderAdminSistemTable(data) {
    const tbody = document.getElementById('adminTableSistemBody');
    tbody.innerHTML = data.map(row => `
        <tr>
            <td class="p-3 border-b text-slate-400">#${row.id}</td>
            <td class="p-3 border-b font-medium">${row.email}</td>
            <td class="p-3 border-b"><span class="px-2 py-1 ${row.role === 'SUPER ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'} text-xs font-bold rounded">${row.role}</span></td>
            <td class="p-3 border-b text-center">
                ${row.role !== 'SUPER ADMIN' ? `<button onclick="deleteAdmin(${row.id})" class="text-red-500 hover:text-red-700 font-bold">Gugurkan</button>` : '<span class="text-xs text-slate-300 italic">Tiada Tindakan</span>'}
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="p-4 text-center">Tiada rekod.</td></tr>';
}

// ================= FUNGSI SUSUNAN (SORTING) =================
window.handleSort = function(type, column) {
    const state = adminSortState[type];
    
    // Tentukan arah susunan baharu
    let newDirection = 'asc';
    if (state.column === column) {
        newDirection = state.direction === 'asc' ? 'desc' : 'asc';
    }
    
    // Kemaskini state
    adminSortState[type] = { column: column, direction: newDirection };
    
    // Pilih data yang betul
    const dataArray = type === 'memo' ? adminMemoData : adminPegawaiData;
    
    // Algoritma Susunan (In-Memory Array Sorting)
    dataArray.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        
        // Pengendalian null/undefined
        if (valA === null || valA === undefined) valA = "";
        if (valB === null || valB === undefined) valB = "";
        
        // Susunan berangka (untuk ID)
        if (typeof valA === 'number' && typeof valB === 'number') {
            return newDirection === 'asc' ? valA - valB : valB - valA;
        }
        
        // Susunan teks (Case Insensitive)
        valA = valA.toString().toLowerCase();
        valB = valB.toString().toLowerCase();
        
        if (valA < valB) return newDirection === 'asc' ? -1 : 1;
        if (valA > valB) return newDirection === 'asc' ? 1 : -1;
        return 0;
    });

    // Rendarkan semula jadual berdasarkan carian semasa
    const searchInputId = type === 'memo' ? 'adminSearchMemo' : 'adminSearchPegawai';
    const currentQuery = document.getElementById(searchInputId)?.value || '';
    filterAdminTable(type, currentQuery);
    
    // Kemaskini visual ikon susunan
    updateSortIcons(type);
};

function updateSortIcons(type) {
    // Kosongkan semua ikon dalam kumpulan jadual ini
    const allIcons = document.querySelectorAll(`[id^="sort-${type}-"]`);
    allIcons.forEach(icon => {
        icon.innerHTML = '';
    });

    // Masukkan ikon pada lajur yang aktif
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
    
    // Ekstrak list unik Sektor & Unit dari data sedia ada
    const unikSektor = [...new Set(adminPegawaiData.map(p => p.sektor))].sort();
    const unikUnit = [...new Set(adminPegawaiData.map(p => p.unit))].sort();

    // Populate Sektor Dropdown
    sSelect.innerHTML = '<option value="">-- PILIH SEKTOR --</option>';
    unikSektor.forEach(s => sSelect.innerHTML += `<option value="${s}">${s}</option>`);
    sSelect.innerHTML += '<option value="MANUAL">++ TAMBAH SEKTOR BAHARU ++</option>';

    // Populate Unit Dropdown
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
    
    // Ambil nilai Sektor (Dropdown vs Manual)
    let finalSektor = document.getElementById('pegawaiSektorSelect').value;
    if (finalSektor === 'MANUAL') {
        finalSektor = document.getElementById('pegawaiSektorManual').value;
    }

    // Ambil nilai Unit (Dropdown vs Manual)
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

window.deletePegawai = async function(id) {
    if (!confirm("Adakah anda pasti mahu memadam pegawai ini?")) return;
    try {
        await _supabase.from('memo_pegawai').delete().eq('id', id);
        loadAdminPegawai();
        window.showMessage("Pegawai telah dikeluarkan dari sistem.", "success");
    } catch (err) {
        window.showMessage("Ralat padam: " + err.message, "error");
    }
}

// ================= CRUD LOGIC: MEMO (Edit Maklumat Data Sahaja) =================
window.editMemo = function(id) {
    const m = adminMemoData.find(x => x.id === id);
    if (!m) return;
    document.getElementById('memoId').value = m.id;
    document.getElementById('memoNoRujukan').value = m.no_rujukan || '';
    document.getElementById('memoNoTambahan').value = m.no_tambahan || '';
    document.getElementById('memoDari').value = m.dari || '';
    document.getElementById('memoTajuk').value = m.tajuk_program || '';
    document.getElementById('memoTarikhSurat').value = m.tarikh_surat || '';
    document.getElementById('memoTarikhTerima').value = m.tarikh_terima || '';
    document.getElementById('memoMasaRekod').value = m.masa_rekod || '';
    toggleModal('modalMemo', true);
}

async function handleMemoSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('memoId').value;
    const payload = {
        no_rujukan: document.getElementById('memoNoRujukan').value.toUpperCase(),
        no_tambahan: document.getElementById('memoNoTambahan').value.toUpperCase(),
        dari: document.getElementById('memoDari').value.toUpperCase(),
        tajuk_program: document.getElementById('memoTajuk').value.toUpperCase(),
        tarikh_surat: document.getElementById('memoTarikhSurat').value,
        tarikh_terima: document.getElementById('memoTarikhTerima').value,
        masa_rekod: document.getElementById('memoMasaRekod').value
    };

    try {
        await _supabase.from('memo_rekod').update(payload).eq('id', id);
        toggleModal('modalMemo', false);
        loadAdminMemo();
        window.showMessage("Rekod maklumat surat berjaya dikemaskini. Perhatian: Perubahan ini tidak dihantar secara automatik ke kalendar. Sila 'Segerak Kalendar' secara manual jika perlu.", "success");
    } catch (err) {
        window.showMessage("Gagal mengemaskini maklumat surat: " + err.message, "error");
    }
}

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

        const res = await fetch(GAS_URL, {
            method: 'POST',
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

        if (notify.status === 'success') {
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

window.removeSingleCalendar = async function(id) {
    if (isProcessingBatch) return window.showMessage("Sistem sedang memproses pukal.", "error");

    const m = adminMemoData.find(x => x.id === id);
    if (!m || !m.calendar_event_id) return;

    if (!confirm("Padam acara ini dari Google Kalendar? Data di dalam sistem akan dikekalkan.")) return;

    try {
        setProcessingState(true, `Memadam rekod kalendar #${id}...`);

        const res = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'deleteEvent', eventId: m.calendar_event_id })
        });
        const result = await res.json();

        // Sama ada berjaya atau "not_found", kita putuskan pautan di Supabase
        if (result.status === 'success' || result.status === 'not_found') {
            await _supabase.from('memo_rekod').update({ calendar_event_id: null }).eq('id', id);
            window.showMessage("Acara kalendar berjaya ditanggalkan.", "success");
            loadAdminMemo();
            refreshIframeKalendar();
        } else {
            throw new Error(result.message);
        }
    } catch (err) {
        window.showMessage("Ralat Kalendar: " + err.message, "error");
    } finally {
        setProcessingState(false);
    }
}

// ================= TINDAKAN DATA (PADAM KESELURUHAN) =================
window.deleteMemo = async function(id) {
    if (isProcessingBatch) return window.showMessage("Sistem sedang memproses pukal.", "error");

    const m = adminMemoData.find(x => x.id === id);
    if (!m) return;

    const confirmMsg = "AMARAN: Ini akan memadam rekod surat selamanya dari pangkalan data sistem. " +
                       (m.calendar_event_id ? "Acara kalendar berkaitan juga akan turut dipadam. " : "") +
                       "Teruskan?";

    if (!confirm(confirmMsg)) return;

    try {
        setProcessingState(true, "Memadam data secara menyeluruh...");

        // 1. Padam Kalendar Dahulu Jika Ada
        if (m.calendar_event_id) {
            try {
                await fetch(GAS_URL, {
                    method: 'POST',
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

async function startBatchSync() {
    if (isProcessingBatch) return;
    
    // Cari yang belum disegerak
    const queue = adminMemoData.filter(m => !m.calendar_event_id);
    if (queue.length === 0) {
        return window.showMessage("Semua data telah pun disegerakkan ke kalendar.", "success");
    }

    if (!confirm(`Sistem mendapati terdapat ${queue.length} rekod yang belum disegerakkan ke Kalendar. Proses ini akan menghantar jemputan satu per satu.\n\nAdakah anda pasti mahu mulakan operasi pukal?`)) return;

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

            if (notify.status === 'success') {
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
    
    window.showMessage(`Operasi Segerak Pukal Tamat. Berjaya: ${successCount}, Gagal: ${errorCount}.`, "success");
}

async function startBatchDelete() {
    if (isProcessingBatch) return;

    // Cari yang ada kalendar sahaja
    const queue = adminMemoData.filter(m => m.calendar_event_id);
    if (queue.length === 0) {
        return window.showMessage("Tiada rekod kalendar yang dijumpai untuk dipadam.", "success");
    }

    if (!confirm(`Sistem akan MEMADAM ${queue.length} acara di dalam Google Kalendar satu per satu. Data di dalam sistem ini akan DIKEKALKAN.\n\nAdakah anda pasti?`)) return;

    setProcessingState(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < queue.length; i++) {
        const m = queue[i];
        updateBatchProgressUI(i, queue.length, `Memadam Kalendar ID #${m.id} (${i+1}/${queue.length})...`);

        try {
            const res = await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'deleteEvent', eventId: m.calendar_event_id })
            });
            const result = await res.json();

            if (result.status === 'success' || result.status === 'not_found') {
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

    window.showMessage(`Operasi Padam Kalendar Pukal Tamat. Berjaya ditanggalkan: ${successCount}, Gagal: ${errorCount}.`, "success");
}

function refreshIframeKalendar() {
    const calFrame = document.getElementById('calendarFrame');
    if (calFrame) calFrame.src = calFrame.src;
}

// ================= CRUD LOGIC: ADMIN =================
async function handleTambahAdmin() {
    const email = prompt("Masukkan emel Pentadbir baharu:");
    if (!email) return;
    const pass = prompt("Masukkan kata laluan:");
    if (!pass) return;

    try {
        await _supabase.from('memo_admin').insert([{
            email: email,
            password: pass,
            role: 'ADMIN'
        }]);
        loadAdminSistem();
        window.showMessage("Pentadbir baharu berjaya ditambah.", "success");
    } catch (err) {
        window.showMessage("Gagal menambah admin: " + err.message, "error");
    }
}

window.deleteAdmin = async function(id) {
    if (!confirm("Gugurkan akses pentadbir ini?")) return;
    try {
        await _supabase.from('memo_admin').delete().eq('id', id);
        loadAdminSistem();
        window.showMessage("Akses pentadbir telah dibatalkan.", "success");
    } catch (err) {
        window.showMessage("Gagal membatalkan akses.", "error");
    }
}

// ================= SEARCH & UTILS =================
function filterAdminTable(type, query) {
    const q = query.toLowerCase();
    if (type === 'memo') {
        const filtered = adminMemoData.filter(m => 
            (m.tajuk_program && m.tajuk_program.toLowerCase().includes(q)) ||
            (m.no_rujukan && m.no_rujukan.toLowerCase().includes(q)) ||
            (m.no_tambahan && m.no_tambahan.toLowerCase().includes(q)) ||
            (m.dari && m.dari.toLowerCase().includes(q))
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