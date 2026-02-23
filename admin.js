/**
 * ==============================================================================
 * SISTEM PENGURUSAN MEMO@AG
 * Architect: 0.1% Senior Software Architect
 * Modul: admin.js (Enjin Kawalan Pentadbir & Operasi CRUD)
 * ==============================================================================
 */

// STATE PENTADBIR
let currentAdmin = null;
let adminMemoData = [];
let adminPegawaiData = [];
let adminSistemData = [];

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

    // CRUD Sistem (Admin Baru)
    document.getElementById('btnTambahAdmin')?.addEventListener('click', handleTambahAdmin);

    // Carian Admin
    document.getElementById('adminSearchMemo')?.addEventListener('input', (e) => filterAdminTable('memo', e.target.value));
    document.getElementById('adminSearchPegawai')?.addEventListener('input', (e) => filterAdminTable('pegawai', e.target.value));

    // Tutup sebarang modal
    document.querySelectorAll('.btnTutupModal').forEach(btn => {
        btn.addEventListener('click', () => {
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
    sessionStorage.removeItem('memo_admin_session');
    currentAdmin = null;
    showAdminUI(false);
    window.switchTab('daftar');
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
    renderAdminMemoTable(adminMemoData);
}

async function loadAdminPegawai() {
    const { data } = await _supabase.from('memo_pegawai').select('*').order('nama');
    adminPegawaiData = data || [];
    renderAdminPegawaiTable(adminPegawaiData);
}

async function loadAdminSistem() {
    const { data } = await _supabase.from('memo_admin').select('*').order('id');
    adminSistemData = data || [];
    renderAdminSistemTable(adminSistemData);
}

// ================= RENDERING TABLES =================
function renderAdminMemoTable(data) {
    const tbody = document.getElementById('adminTableMemoBody');
    tbody.innerHTML = data.map(row => `
        <tr>
            <td class="p-3 border-b text-xs font-mono text-slate-400">#${row.id}</td>
            <td class="p-3 border-b font-bold text-slate-700">${row.tajuk_program}</td>
            <td class="p-3 border-b text-slate-500">${row.tarikh_terima}</td>
            <td class="p-3 border-b text-center space-x-2">
                <button onclick="editMemo(${row.id})" class="text-indigo-600 hover:text-indigo-900 font-bold">Edit</button>
                <button onclick="deleteMemo(${row.id})" class="text-red-500 hover:text-red-700 font-bold">Padam</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="p-4 text-center">Tiada rekod.</td></tr>';
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

// ================= CRUD LOGIC: PEGAWAI (DIPERBAIKI) =================
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

// ================= CRUD LOGIC: MEMO =================
window.editMemo = function(id) {
    const m = adminMemoData.find(x => x.id === id);
    if (!m) return;
    document.getElementById('memoId').value = m.id;
    document.getElementById('memoTajuk').value = m.tajuk_program;
    document.getElementById('memoTarikhTerima').value = m.tarikh_terima;
    document.getElementById('memoTarikhProgram').value = m.tarikh_program;
    toggleModal('modalMemo', true);
}

async function handleMemoSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('memoId').value;
    const payload = {
        tajuk_program: document.getElementById('memoTajuk').value.toUpperCase(),
        tarikh_terima: document.getElementById('memoTarikhTerima').value,
        tarikh_program: document.getElementById('memoTarikhProgram').value
    };

    try {
        await _supabase.from('memo_rekod').update(payload).eq('id', id);
        toggleModal('modalMemo', false);
        loadAdminMemo();
        window.showMessage("Rekod memo berjaya dikemaskini.", "success");
    } catch (err) {
        window.showMessage("Gagal mengemaskini memo: " + err.message, "error");
    }
}

window.deleteMemo = async function(id) {
    if (!confirm("AMARAN: Memadam rekod memo akan menghilangkan bukti pendaftaran selamanya. Teruskan?")) return;
    try {
        await _supabase.from('memo_rekod').delete().eq('id', id);
        loadAdminMemo();
        window.showMessage("Rekod memo telah dipadam.", "success");
    } catch (err) {
        window.showMessage("Ralat padam rekod: " + err.message, "error");
    }
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
        const filtered = adminMemoData.filter(m => m.tajuk_program.toLowerCase().includes(q));
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