/**
 * ==============================================================================
 * SISTEM PENGURUSAN MEMO@AG
 * Architect: 0.1% Senior Software Architect
 * Modul: app.js (Enjin Utama Pengguna Awam - RSVP Kalendar & Eksport)
 * Logik Intercept: Database-Driven Hierarchical Deferred Assignment (memo_admin)
 * Patch: Pindaan Bypass Delegasi (Mix PIC & Pengurusan) & CORS Preflight
 * Patch RBAC: Client-Side Navigation Guard (Menghalang akses tab tanpa kebenaran)
 * Patch UI: Integrasi SweetAlert2 & Pemampatan Saiz Jadual Analisis
 * ==============================================================================
 */

// KONFIGURASI UTAMA
const SUPABASE_URL = 'https://app.tech4ag.my';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzMzczNjQ1LCJleHAiOjIwNzg3MzM2NDV9.vZOedqJzUn01PjwfaQp7VvRzSm4aRMr21QblPDK8AoY';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxrj_wwNOJahEEiz3QGBaNTG9pg6xJNqEDXZXVEag9kHrJXp-n7gKV2wF8Yr17OZdr5/exec';

// INISIALISASI SUPABASE KLIEN
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// PENGURUSAN STATE GLOBAL
let groupedData = {};
let uploadedFileUrl = "";
let allRecords = []; 
let currentFilteredRecords = []; 
let globalSelected = new Map(); // Menjejak email -> nama rentas sektor

// ================= INISIALISASI SISTEM =================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Set Tahun Semasa
    const yearElem = document.getElementById('currentYear');
    if (yearElem) yearElem.textContent = new Date().getFullYear();

    // 2. Muatkan Data Pegawai 
    try {
        const { data, error } = await _supabase.from('memo_pegawai').select('*').order('sektor');
        if (error) throw error;
        processPegawai(data);
        populateSektor();
    } catch (err) {
        showMessage("Ralat memuatkan pangkalan data pegawai: " + err.message, 'error');
    }

    // 3. Daftarkan Event Listeners
    setupEventListeners();

    // 4. Paparan Lalai
    switchTab('utama');
});

function setupEventListeners() {
    document.getElementById('tabBtnAdminPanel')?.addEventListener('click', () => switchTab('admin'));
    document.getElementById('tabBtnTppdPanel')?.addEventListener('click', () => switchTab('tppd'));

    document.getElementById('sektor')?.addEventListener('change', populateUnit);
    document.getElementById('unit')?.addEventListener('change', populateNama);
    
    document.getElementById('salinanSurat')?.addEventListener('change', function() { handleEarlyUpload(this); });
    document.getElementById('resetFileBtn')?.addEventListener('click', resetFileUpload);
    
    document.getElementById('mainForm')?.addEventListener('submit', handleFormSubmit);
    
    document.getElementById('searchInput')?.addEventListener('keyup', filterTable);
    document.getElementById('filterSektor')?.addEventListener('change', filterTable);
    document.getElementById('filterUnit')?.addEventListener('change', filterTable);
    document.getElementById('filterBulan')?.addEventListener('change', filterTable);
    document.getElementById('filterTarikh')?.addEventListener('change', filterTable);
    document.getElementById('btnResetFilter')?.addEventListener('click', resetAnalisisFilters);
}

// ================= UTILITI GLOBAL: HIERARKI PENGURUSAN =================
/**
 * Logik pengesanan peranan pengurusan.
 * Kini disokong oleh semakan pangkalan data di handleFormSubmit,
 * namun dikekalkan untuk kegunaan UI (Client-Side Feedback).
 */
window.isManagerRole = function(unitName) {
    if (!unitName) return false;
    const u = unitName.toUpperCase();
    return u === 'TPPD' || u === 'KETUA SEKTOR' || u.startsWith('KETUA UNIT');
};

// ================= PENGURUSAN TAB NAVIGASI & KESELAMATAN (GUARD) =================
window.switchTab = function(tabName) {
    // --- PENGAWAL KESELAMATAN KLIEN (CLIENT-SIDE GUARD) ---
    if (['daftar', 'admin', 'tppd'].includes(tabName)) {
        const sessionStr = sessionStorage.getItem('memo_admin_session');
        const adminData = sessionStr ? JSON.parse(sessionStr) : null;
        
        if (tabName === 'daftar') {
            if (!adminData || (!adminData.isPerakam && !adminData.isSystemAdmin)) {
                if (window.showMessage) window.showMessage("Akses Ditolak: Modul ini terhad kepada profil PERAKAM dan PENTADBIR sahaja.", "error");
                return;
            }
        }
        
        if (tabName === 'admin') {
            if (!adminData || !adminData.isSystemAdmin) {
                if (window.showMessage) window.showMessage("Akses Ditolak: Modul ini terhad kepada profil PENTADBIR (System Admin) sahaja.", "error");
                return;
            }
        }
        
        if (tabName === 'tppd') {
            if (!adminData || !adminData.isManager) {
                if (window.showMessage) window.showMessage("Akses Ditolak: Modul ini terhad kepada hierarki PENGURUSAN sahaja.", "error");
                return;
            }
        }
    }
    // --- TAMAT PENGAWAL KESELAMATAN ---

    const tabs = ['utama', 'daftar', 'analisis', 'kalendar', 'admin', 'about', 'tppd'];
    
    tabs.forEach(t => {
        const divId = t === 'admin' ? 'tabAdmin' : (t === 'tppd' ? 'tabTppd' : 'tab' + t.charAt(0).toUpperCase() + t.slice(1));
        const tabDiv = document.getElementById(divId);
        
        if (!tabDiv) return;

        if (t === tabName) {
            tabDiv.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            tabDiv.classList.add('hidden');
        }
    });

    const tabBtnAdmin = document.getElementById('tabBtnAdminPanel');
    if (tabBtnAdmin) {
        if (tabName === 'admin') {
            tabBtnAdmin.classList.add('border-red-600', 'text-red-700');
            tabBtnAdmin.classList.remove('border-transparent', 'text-red-500');
        } else {
            tabBtnAdmin.classList.remove('border-red-600', 'text-red-700');
            tabBtnAdmin.classList.add('border-transparent', 'text-red-500');
        }
    }

    const tabBtnTppd = document.getElementById('tabBtnTppdPanel');
    if (tabBtnTppd) {
        if (tabName === 'tppd') {
            tabBtnTppd.classList.add('border-indigo-600', 'text-indigo-800');
            tabBtnTppd.classList.remove('border-transparent', 'text-indigo-600');
        } else {
            tabBtnTppd.classList.remove('border-indigo-600', 'text-indigo-800');
            tabBtnTppd.classList.add('border-transparent', 'text-indigo-600');
        }
    }

    if (tabName === 'analisis') {
        loadDashboardData();
    }
};

// ================= DATA PEGAWAI & DROP-DOWN =================
function processPegawai(data) {
    groupedData = {};
    data.forEach(p => {
        if (!groupedData[p.sektor]) groupedData[p.sektor] = {};
        if (!groupedData[p.sektor][p.unit]) groupedData[p.sektor][p.unit] = [];
        groupedData[p.sektor][p.unit].push({ nama: p.nama, emel: p.emel_rasmi });
    });
}

window.populateSektor = function() {
    const s = document.getElementById('sektor');
    if (!s) return;
    s.innerHTML = '<option value="">-- PILIH SEKTOR --</option>';
    Object.keys(groupedData).sort().forEach(sk => {
        const opt = document.createElement('option');
        opt.value = sk; opt.textContent = sk;
        s.appendChild(opt);
    });
};

window.populateUnit = function() {
    const sk = document.getElementById('sektor').value;
    const u = document.getElementById('unit');
    const nc = document.getElementById('namaContainer');
    u.innerHTML = '<option value="">-- PILIH UNIT --</option>';
    
    if (sk && groupedData[sk]) {
        Object.keys(groupedData[sk]).sort().forEach(un => {
            const opt = document.createElement('option');
            opt.value = un; opt.textContent = un;
            u.appendChild(opt);
        });
        u.disabled = false;
        nc.innerHTML = '<div class="text-slate-400 italic text-sm mt-1">Sila Pilih Unit Dahulu</div>';
    } else {
        u.disabled = true;
        nc.innerHTML = '<div class="text-slate-400 italic text-sm mt-1">Sila Pilih Sektor & Unit Dahulu</div>';
    }
};

window.populateNama = function() {
    const sk = document.getElementById('sektor').value;
    const un = document.getElementById('unit').value;
    const nc = document.getElementById('namaContainer');
    nc.innerHTML = '';
    
    if (sk && un && groupedData[sk][un]) {
        nc.innerHTML = `
            <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 sticky top-0 bg-slate-50 z-10">
                <span class="text-xs font-bold text-slate-500 uppercase">Senarai Pegawai (${un})</span>
                <button type="button" onclick="selectAllInUnit()" class="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded transition-colors shadow-sm focus:outline-none">Pilih Semua / Batal</button>
            </div>
        `;

        groupedData[sk][un].sort((a,b)=>a.nama.localeCompare(b.nama)).forEach((p,i) => {
            const isChecked = globalSelected.has(p.emel) ? 'checked' : '';
            const safeNama = p.nama.replace(/"/g, '&quot;'); // Melindungi dari ralat "double quote"
            nc.innerHTML += `
                <div class="flex items-center mb-2 hover:bg-indigo-50/70 p-2 rounded transition-colors border border-transparent hover:border-indigo-100">
                    <input type="checkbox" id="c_${i}" value="${safeNama}" data-email="${p.emel}" onchange="togglePenerima(this.value, this.getAttribute('data-email'), this.checked)" class="w-4 h-4 text-indigo-600 rounded unit-checkbox focus:ring-indigo-500" ${isChecked}>
                    <label for="c_${i}" class="ml-3 text-sm font-medium text-slate-700 cursor-pointer flex-1 select-none">${p.nama}</label>
                </div>`;
        });
    } else {
        nc.innerHTML = '<div class="text-slate-400 italic text-sm mt-1">Sila Pilih Unit Dahulu</div>';
    }
};

// ================= SISTEM TAG PENERIMA =================
window.togglePenerima = function(nama, emel, isChecked) {
    if (isChecked) {
        globalSelected.set(emel, nama);
    } else {
        globalSelected.delete(emel);
    }
    renderTags();
};

window.selectAllInUnit = function() {
    const checkboxes = document.querySelectorAll('.unit-checkbox');
    if (checkboxes.length === 0) return;

    const allChecked = Array.from(checkboxes).every(c => c.checked);
    
    checkboxes.forEach(c => {
        c.checked = !allChecked;
        togglePenerima(c.value, c.getAttribute('data-email'), !allChecked);
    });
};

window.removeTag = function(emel) {
    globalSelected.delete(emel);
    const cb = document.querySelector(`.unit-checkbox[data-email="${emel}"]`);
    if (cb) cb.checked = false;
    renderTags();
};

function renderTags() {
    const container = document.getElementById('selectedTagsContainer');
    const emailInput = document.getElementById('email');
    
    if (globalSelected.size === 0) {
        container.innerHTML = '<span class="text-sm text-slate-400 italic mt-1 ml-1">Belum ada penerima dipilih...</span>';
        emailInput.value = '';
        return;
    }

    container.innerHTML = '';
    const emails = [];
    
    globalSelected.forEach((nama, emel) => {
        emails.push(emel);
        container.innerHTML += `
            <div class="inline-flex items-center bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full border border-indigo-200 shadow-sm transition-transform hover:-translate-y-0.5">
                <span>${nama}</span>
                <button type="button" data-email="${emel}" onclick="removeTag(this.getAttribute('data-email'))" class="ml-2 text-indigo-400 hover:text-red-500 focus:outline-none transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        `;
    });
    
    emailInput.value = emails.join(', ');
}

// ================= MUAT NAIK FAIL (EARLY UPLOAD) & SET MASA =================
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

async function handleEarlyUpload(input) {
    if (!input.files || input.files.length === 0) return;
    
    const file = input.files[0];
    const statusDiv = document.getElementById('uploadStatus');
    const loader = document.getElementById('uploadLoader');
    const text = document.getElementById('uploadText');
    const link = document.getElementById('fileLink');
    const resetBtn = document.getElementById('resetFileBtn');
    const formUtamaDiv = document.getElementById('borangUtama');
    const masaRekodInput = document.getElementById('masaRekod');

    statusDiv.classList.remove('hidden');
    loader.classList.remove('hidden');
    text.textContent = "Sedang memuat naik fail ke Drive pelayan...";
    text.classList.replace('text-emerald-600', 'text-slate-600');
    link.classList.add('hidden');
    resetBtn.classList.add('hidden');
    input.disabled = true;

    try {
        const base64Full = await toBase64(file);
        
        const res = await fetch(GAS_URL, {
            method: 'POST',
            redirect: "follow",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: 'upload',
                fileBase64: base64Full.split(',')[1],
                fileName: file.name,
                fileMimeType: file.type
            })
        });
        
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.message);

        uploadedFileUrl = data.fileUrl;
        text.textContent = "Fail Sedia: ";
        text.classList.replace('text-slate-600', 'text-emerald-600');
        loader.classList.add('hidden');
        link.href = uploadedFileUrl;
        link.classList.remove('hidden');
        resetBtn.classList.remove('hidden');
        
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        if (masaRekodInput) masaRekodInput.value = `${hours}:${minutes}`;

        formUtamaDiv.classList.remove('hidden');
        setTimeout(() => { formUtamaDiv.classList.remove('opacity-0'); }, 50);

        showMessage("Muat naik fail disahkan. Masa rekod telah ditetapkan, sila lengkapkan maklumat borang.", "success");
    } catch (err) {
        text.textContent = "Ralat pelayan: Sila cuba lagi.";
        text.classList.replace('text-slate-600', 'text-red-500');
        loader.classList.add('hidden');
        input.disabled = false;
        resetBtn.classList.remove('hidden');
        showMessage("Gagal muat naik fail: " + err.message, "error");
    }
}

function resetFileUpload() {
    uploadedFileUrl = "";
    const input = document.getElementById('salinanSurat');
    input.value = "";
    input.disabled = false;
    document.getElementById('uploadStatus').classList.add('hidden');
    
    const masaRekodInput = document.getElementById('masaRekod');
    if (masaRekodInput) masaRekodInput.value = "";
    
    const formUtamaDiv = document.getElementById('borangUtama');
    formUtamaDiv.classList.add('opacity-0');
    setTimeout(() => { formUtamaDiv.classList.add('hidden'); }, 500);
}

// ================= HANTAR BORANG (SUBMIT) DENGAN PENGESANAN HIERARKI DATABASE =================
async function handleFormSubmit(e) {
    e.preventDefault();
    if (!uploadedFileUrl) return showMessage("Pautan fail tidak dijumpai. Sila muat naik dokumen semula.", "error");
    if (globalSelected.size === 0) return showMessage("Sila pilih sekurang-kurangnya 1 penerima.", "error");

    setLoading(true, "Mengesahkan Hierarki Sistem...");

    try {
        const names = Array.from(globalSelected.values());
        const emels = Array.from(globalSelected.keys());
        const currentUnit = document.getElementById('unit').value;

        // 1. Logik Intercept: Semakan Silang terhadap jadual memo_admin (Pindaan Hierarki)
        // Mengekstrak emel beserta peranan (role) untuk tapisan pengurusan
        const { data: adminList, error: adminError } = await _supabase.from('memo_admin').select('email, role');
        if (adminError) throw adminError;

        // Saring hanya profil Pengurusan Tertinggi (TPPD, KETUA SEKTOR, KETUA UNIT)
        const managerEmails = adminList
            .filter(a => ['TPPD', 'KETUA SEKTOR', 'KETUA UNIT'].includes(a.role))
            .map(a => a.email.toLowerCase());

        const selectedEmails = emels.map(e => e.toLowerCase());
        
        // Klasifikasikan sebagai 'Manager Deferred' HANYA jika KESEMUA penerima adalah Pengurus.
        // Jika wujud campuran (Pengurus + PIC Pelaksana), pemprosesan akan bypass dan terus ke Kalendar.
        const isManagerDeferred = selectedEmails.length > 0 && selectedEmails.every(email => managerEmails.includes(email));

        setLoading(true, "Menyimpan Data...");

        // 2. Simpan ke Supabase (Pangkalan Data Rekod)
        const { data: rec, error: subError } = await _supabase.from('memo_rekod').insert([{
            sektor: document.getElementById('sektor').value,
            unit: currentUnit,
            nama_penerima: names.join(', '),
            emel_penerima: emels.join(', '),
            no_rujukan: document.getElementById('noRujukan').value.toUpperCase(),
            no_tambahan: document.getElementById('noTambahan').value.toUpperCase(),
            tarikh_surat: document.getElementById('tarikhSurat').value,
            dari: document.getElementById('dari').value.toUpperCase(),
            tajuk_program: document.getElementById('tajukProgram').value.toUpperCase(),
            tarikh_terima: document.getElementById('tarikhTerima').value,
            masa_rekod: document.getElementById('masaRekod').value,
            file_url: uploadedFileUrl
        }]).select();

        if (subError) throw subError;

        // 3. Notifikasi GAS (Tentukan Action Berdasarkan Status Hierarki)
        setLoading(true, isManagerDeferred ? "Menghantar Notifikasi Pengurusan..." : "Menghantar Notifikasi RSVP & Kalendar...");

        const gasAction = isManagerDeferred ? 'notifyManager' : 'notify';

        const res = await fetch(GAS_URL, {
            method: 'POST',
            redirect: "follow",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: gasAction,
                sektor: document.getElementById('sektor').value,
                unit: currentUnit,
                namaArray: names,
                emailArray: emels,
                noRujukan: document.getElementById('noRujukan').value.toUpperCase(),
                tajukProgram: document.getElementById('tajukProgram').value.toUpperCase(),
                tarikhTerima: document.getElementById('tarikhTerima').value,
                masaRekod: document.getElementById('masaRekod').value,
                fileUrl: uploadedFileUrl
            })
        });
        const notify = await res.json();

        // 4. Simpan Acara Kalendar Jika Ada (Tindakan Pegawai Pelaksana / Bypass Mix)
        if (notify.status === 'success' && notify.calendarEventId) {
            await _supabase.from('memo_rekod').update({ calendar_event_id: notify.calendarEventId }).eq('id', rec[0].id);
        }

        // 5. Maklum Balas UI
        if (isManagerDeferred) {
            showMessage("<strong>Penerimaan Pengurusan Dikesan.</strong><br><br>Rekod surat disimpan. Notifikasi emel telah dihantar kepada pentadbir sistem (TPPD/KS/KU) untuk tujuan delegasi unit.", "success");
        } else {
            showMessage("<strong>Rekod Berjaya!</strong><br><br>Surat disimpan dan jemputan kalendar (RSVP) telah dihantar secara automatik kepada semua pegawai penerima.", "success");
        }
        
        const calFrame = document.getElementById('calendarFrame');
        if (calFrame) calFrame.src = calFrame.src; 

        resetForm();
        allRecords = []; 

    } catch (err) {
        showMessage("Ralat Transaksi: " + err.message, "error");
    } finally {
        setLoading(false);
    }
}

// ================= MODUL ANALISIS / DASHBOARD =================
async function loadDashboardData() {
    const tBody = document.getElementById('tableBody');
    if (allRecords.length > 0) {
        renderTable(allRecords);
        populateAnalisisFilters(allRecords);
        return;
    }

    tBody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-500"><div class="loader mr-2"></div> Memuat turun rekod pelayan...</td></tr>`;

    try {
        const { data, error } = await _supabase.from('memo_rekod').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        
        allRecords = data;
        currentFilteredRecords = data;
        calculateKPIs(data);
        renderTable(data);
        populateAnalisisFilters(data);
    } catch (err) {
        tBody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-red-500">Gagal mengambil rekod: ${err.message}</td></tr>`;
    }
}

function calculateKPIs(data) {
    document.getElementById('kpiTotal').textContent = data.length;
    
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    const todayCount = data.filter(r => r.tarikh_terima && r.tarikh_terima === todayStr).length;
    document.getElementById('kpiToday').textContent = todayCount;

    const sektorCounts = {};
    data.forEach(r => {
        sektorCounts[r.sektor] = (sektorCounts[r.sektor] || 0) + 1;
    });
    
    let topSektor = "-";
    let maxCount = 0;
    for (const s in sektorCounts) {
        if (sektorCounts[s] > maxCount) {
            maxCount = sektorCounts[s];
            topSektor = s.replace(/^\d{2}\s/, ''); 
        }
    }
    document.getElementById('kpiTopSektor').textContent = topSektor;
}

function populateAnalisisFilters(data) {
    const fSektor = document.getElementById('filterSektor');
    const fUnit = document.getElementById('filterUnit');
    const fBulan = document.getElementById('filterBulan');
    const fTarikh = document.getElementById('filterTarikh');

    if (!fSektor || !fUnit || !fBulan || !fTarikh) return;

    const setSektor = new Set();
    const setUnit = new Set();
    const setBulan = new Set();
    const setTarikh = new Set();

    data.forEach(r => {
        if (r.sektor) setSektor.add(r.sektor);
        if (r.unit) setUnit.add(r.unit);
        if (r.tarikh_terima) {
            setTarikh.add(r.tarikh_terima);
            const parts = r.tarikh_terima.split('-');
            if (parts.length >= 2) setBulan.add(`${parts[0]}-${parts[1]}`);
        }
    });

    const genOptions = (set, defaultText, formatFn = (val) => val) => {
        let html = `<option value="">${defaultText}</option>`;
        Array.from(set).sort().forEach(val => {
            html += `<option value="${val}">${formatFn(val)}</option>`;
        });
        return html;
    };

    const currentSektor = fSektor.value;
    const currentUnit = fUnit.value;
    const currentBulan = fBulan.value;
    const currentTarikh = fTarikh.value;

    fSektor.innerHTML = genOptions(setSektor, "Semua Sektor", (v) => v.replace(/^\d{2}\s/, ''));
    fUnit.innerHTML = genOptions(setUnit, "Semua Unit");
    fBulan.innerHTML = genOptions(setBulan, "Semua Bulan", (v) => { const p = v.split('-'); return `${p[1]}/${p[0]}`; });
    fTarikh.innerHTML = genOptions(setTarikh, "Semua Tarikh", (v) => { const p = v.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v; });

    if (currentSektor) fSektor.value = currentSektor;
    if (currentUnit) fUnit.value = currentUnit;
    if (currentBulan) fBulan.value = currentBulan;
    if (currentTarikh) fTarikh.value = currentTarikh;
}

const formatDt = (dateStr) => {
    if(!dateStr) return "-";
    const parts = dateStr.split('-');
    if(parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
};

function renderTable(dataArray) {
    const tBody = document.getElementById('tableBody');
    tBody.innerHTML = '';

    if (dataArray.length === 0) {
        tBody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-500">Tiada rekod dijumpai berdasarkan tapisan.</td></tr>`;
        return;
    }

    dataArray.forEach((row, index) => {
        const bilAuto = index + 1;
        const tarikhTerimaStr = formatDt(row.tarikh_terima);
        const tarikhSuratStr = formatDt(row.tarikh_surat);
        
        const tr = document.createElement('tr');
        tr.className = "hover:bg-indigo-50/30 transition-colors";
        
        // Pemampatan padding dan saiz font agar muat mendatar
        tr.innerHTML = `
            <td class="p-2 align-top text-center">
                <span class="inline-block w-6 h-6 bg-slate-100 text-slate-600 font-bold rounded-full text-[11px] leading-6">${bilAuto}</span>
            </td>
            <td class="p-2 align-top">
                <div class="font-bold text-slate-700 text-xs">${tarikhTerimaStr}</div>
                <div class="text-[10px] font-semibold text-indigo-600 mt-1">${row.masa_rekod || '-'}</div>
            </td>
            <td class="p-2 align-top">
                <div class="text-xs font-bold text-slate-800 break-words whitespace-normal uppercase">${row.no_rujukan || '-'}</div>
            </td>
            <td class="p-2 align-top">
                <div class="text-xs font-semibold text-slate-600 break-words whitespace-normal uppercase">${row.no_tambahan || '-'}</div>
            </td>
            <td class="p-2 align-top">
                <div class="font-bold text-slate-700 text-xs">${tarikhSuratStr}</div>
            </td>
            <td class="p-2 align-top">
                <div class="text-[11px] font-bold text-slate-800 break-words whitespace-normal uppercase">${row.dari || '-'}</div>
            </td>
            <td class="p-2 align-top">
                <div class="text-[11px] font-bold text-indigo-700 break-words whitespace-normal uppercase">${row.tajuk_program || '-'}</div>
            </td>
            <td class="p-2 align-top">
                <div class="text-[10px] font-bold text-slate-800 break-words whitespace-normal bg-indigo-50 px-1.5 py-0.5 rounded inline-block mb-1">${row.sektor.replace(/^\d{2}\s/, '')}</div>
                <div class="text-[10px] text-slate-600 break-words whitespace-normal leading-relaxed italic border-l-2 border-indigo-200 pl-1.5 mt-1" title="${row.nama_penerima}">${row.nama_penerima || '-'}</div>
            </td>
            <td class="p-2 align-top text-center">
                ${row.file_url ? 
                `<a href="${row.file_url}" target="_blank" class="inline-flex items-center px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded hover:bg-indigo-100 transition-colors">
                    <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg> Buka
                </a>` : 
                `<span class="text-[10px] text-slate-400">Tiada Fail</span>`}
            </td>
        `;
        tBody.appendChild(tr);
    });
}

function filterTable() {
    const query = document.getElementById('searchInput')?.value.toLowerCase() || "";
    const vSektor = document.getElementById('filterSektor')?.value || "";
    const vUnit = document.getElementById('filterUnit')?.value || "";
    const vBulan = document.getElementById('filterBulan')?.value || "";
    const vTarikh = document.getElementById('filterTarikh')?.value || "";

    const filtered = allRecords.filter(r => {
        const textMatch = 
            (r.no_rujukan && r.no_rujukan.toLowerCase().includes(query)) ||
            (r.no_tambahan && r.no_tambahan.toLowerCase().includes(query)) ||
            (r.dari && r.dari.toLowerCase().includes(query)) ||
            (r.tajuk_program && r.tajuk_program.toLowerCase().includes(query)) || 
            (r.nama_penerima && r.nama_penerima.toLowerCase().includes(query)) ||
            (r.sektor && r.sektor.toLowerCase().includes(query));

        const sektorMatch = vSektor === "" || r.sektor === vSektor;
        const unitMatch = vUnit === "" || r.unit === vUnit;
        const tarikhMatch = vTarikh === "" || r.tarikh_terima === vTarikh;
        
        let bulanMatch = true;
        if (vBulan !== "") bulanMatch = r.tarikh_terima && r.tarikh_terima.startsWith(vBulan);

        return textMatch && sektorMatch && unitMatch && bulanMatch && tarikhMatch;
    });

    currentFilteredRecords = filtered;
    renderTable(filtered);
}

function resetAnalisisFilters() {
    if(document.getElementById('searchInput')) document.getElementById('searchInput').value = "";
    if(document.getElementById('filterSektor')) document.getElementById('filterSektor').value = "";
    if(document.getElementById('filterUnit')) document.getElementById('filterUnit').value = "";
    if(document.getElementById('filterBulan')) document.getElementById('filterBulan').value = "";
    if(document.getElementById('filterTarikh')) document.getElementById('filterTarikh').value = "";
    filterTable();
}

// ================= FUNGSI EKSPORT EXCEL =================
window.exportToExcel = function() {
    if (!currentFilteredRecords || currentFilteredRecords.length === 0) {
        return window.showMessage("Tiada rekod sedia ada untuk dieksport.", "error");
    }

    try {
        const exportData = currentFilteredRecords.map((row, index) => ({
            "Bil": index + 1,
            "Tarikh Penerimaan": formatDt(row.tarikh_terima),
            "No.Fail Kementerian Ibu Pejabat": row.no_rujukan || '-',
            "Nombor-Nombor Yang Lain": row.no_tambahan || '-',
            "Tarikh Surat": formatDt(row.tarikh_surat),
            "Daripada Siapa": row.dari || '-',
            "Perkara": row.tajuk_program || '-',
            "Dirujukkan Kepada (Penerima)": row.nama_penerima || '-',
            "Sektor Utama": row.sektor || '-',
            "Masa Rekod": row.masa_rekod || '-',
            "Pautan Salinan Dokumen": row.file_url || 'Tiada Fail Disertakan'
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wscols = [
            {wch: 5}, {wch: 18}, {wch: 35}, {wch: 25}, {wch: 15}, 
            {wch: 35}, {wch: 45}, {wch: 50}, {wch: 30}, {wch: 12}, {wch: 60}
        ];
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Rekod Surat Masuk");
        
        const now = new Date();
        const fileName = `Eksport_MemoAG_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.xlsx`;

        XLSX.writeFile(wb, fileName);
        window.showMessage("Fail Excel berjaya dijana dan dimuat turun.", "success");
    } catch (err) {
        window.showMessage("Ralat semasa mengeksport Excel: " + err.message, "error");
    }
};

// ================= UTILITI SISTEM (UBAH SUAI SWEETALERT2) =================
function setLoading(status, txt) {
    const btn = document.getElementById('submitBtn');
    const bt = document.getElementById('btnText');
    if (!btn || !bt) return;
    btn.disabled = status;
    bt.innerHTML = status ? `<div class="loader mr-2 border-white border-top-indigo-500"></div> <span>${txt}</span>` : "Simpan & Hantar Rekod";
}

window.showMessage = function(m, t) {
    // Memanggil SweetAlert2 menggantikan mesej DOM lama
    let iconType = 'info';
    let titleText = 'Makluman';
    
    if (t === 'error') {
        iconType = 'error';
        titleText = 'Ralat Sistem';
    } else if (t === 'success') {
        iconType = 'success';
        titleText = 'Berjaya';
    }

    Swal.fire({
        title: titleText,
        html: m,
        icon: iconType,
        confirmButtonColor: '#4f46e5', // Indigo 600
        confirmButtonText: 'Tutup',
        customClass: {
            confirmButton: 'text-sm font-bold',
            popup: 'rounded-2xl',
            title: 'text-slate-800'
        }
    });
};

function resetForm() {
    const mainForm = document.getElementById('mainForm');
    if (mainForm) mainForm.reset();
    resetFileUpload();
    globalSelected.clear();
    renderTags();
    populateUnit();
}