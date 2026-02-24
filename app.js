/**
 * ==============================================================================
 * SISTEM PENGURUSAN MEMO@AG
 * Architect: 0.1% Senior Software Architect
 * Modul: app.js (Enjin Utama Pengguna Awam)
 * ==============================================================================
 */

// KONFIGURASI UTAMA
const SUPABASE_URL = 'https://app.tech4ag.my';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzMzczNjQ1LCJleHAiOjIwNzg3MzM2NDV9.vZOedqJzUn01PjwfaQp7VvRzSm4aRMr21QblPDK8AoY';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxrj_wwNOJahEEiz3QGBaNTG9pg6xJNqEDXZXVEag9kHrJXp-n7gKV2wF8Yr17OZdr5/exec';

// INISIALISASI SUPABASE KLIEN (Boleh diakses oleh admin.js nanti)
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// PENGURUSAN STATE GLOBAL
let groupedData = {};
let uploadedFileUrl = "";
let allRecords = []; 
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

    // 3. Daftarkan Event Listeners bagi Elemen HTML Statik
    setupEventListeners();

    // 4. Paksa paparan lalai ke Laman Utama
    switchTab('utama');
});

function setupEventListeners() {
    // Navigasi Tab Pentadbir (Satu-satunya butang tab yang tinggal di navigasi atas)
    document.getElementById('tabBtnAdminPanel')?.addEventListener('click', () => switchTab('admin'));

    // Interaksi Borang Pendaftaran
    document.getElementById('sektor')?.addEventListener('change', populateUnit);
    document.getElementById('unit')?.addEventListener('change', populateNama);
    
    // Muat Naik Fail & Lompatan Borang
    document.getElementById('salinanSurat')?.addEventListener('change', function() { handleEarlyUpload(this); });
    document.getElementById('resetFileBtn')?.addEventListener('click', resetFileUpload);
    
    // Penghantaran Borang
    document.getElementById('mainForm')?.addEventListener('submit', handleFormSubmit);
    
    // Modul Tapisan Jadual Analisis
    document.getElementById('searchInput')?.addEventListener('keyup', filterTable);
    document.getElementById('filterSektor')?.addEventListener('change', filterTable);
    document.getElementById('filterUnit')?.addEventListener('change', filterTable);
    document.getElementById('filterBulan')?.addEventListener('change', filterTable);
    document.getElementById('filterTarikh')?.addEventListener('change', filterTable);
    document.getElementById('btnResetFilter')?.addEventListener('click', resetAnalisisFilters);
}

// ================= PENGURUSAN TAB NAVIGASI =================
window.switchTab = function(tabName) {
    const tabs = ['utama', 'daftar', 'analisis', 'kalendar', 'admin'];
    
    tabs.forEach(t => {
        const divId = t === 'admin' ? 'tabAdmin' : 'tab' + t.charAt(0).toUpperCase() + t.slice(1);
        const tabDiv = document.getElementById(divId);
        
        if (!tabDiv) return;

        if (t === tabName) {
            tabDiv.classList.remove('hidden');
            // Menambah logik skrol secara automatik ke atas setiap kali menukar modul
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            tabDiv.classList.add('hidden');
        }
    });

    // Pengurusan khas visual Butang Panel Pentadbir
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
            nc.innerHTML += `
                <div class="flex items-center mb-2 hover:bg-indigo-50/70 p-2 rounded transition-colors border border-transparent hover:border-indigo-100">
                    <input type="checkbox" id="c_${i}" value="${p.nama}" data-email="${p.emel}" onchange="togglePenerima('${p.nama}', '${p.emel}', this.checked)" class="w-4 h-4 text-indigo-600 rounded unit-checkbox focus:ring-indigo-500" ${isChecked}>
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
                <button type="button" onclick="removeTag('${emel}')" class="ml-2 text-indigo-400 hover:text-red-500 focus:outline-none transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        `;
    });
    
    emailInput.value = emails.join(', ');
}

// ================= MUAT NAIK FAIL (EARLY UPLOAD) =================
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
        
        formUtamaDiv.classList.remove('hidden');
        setTimeout(() => { formUtamaDiv.classList.remove('opacity-0'); }, 50);

        showMessage("Muat naik fail disahkan. Borang telah dibuka, sila lengkapkan maklumat di bawah.", "success");
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
    
    const formUtamaDiv = document.getElementById('borangUtama');
    formUtamaDiv.classList.add('opacity-0');
    setTimeout(() => { formUtamaDiv.classList.add('hidden'); }, 500);
}

// ================= HANTAR BORANG (SUBMIT) =================
async function handleFormSubmit(e) {
    e.preventDefault();
    if (!uploadedFileUrl) return showMessage("Pautan fail tidak dijumpai. Sila muat naik dokumen semula.", "error");
    if (globalSelected.size === 0) return showMessage("Sila pilih sekurang-kurangnya 1 penerima.", "error");

    setLoading(true, "Menyimpan Data...");

    try {
        const names = Array.from(globalSelected.values());
        const emels = Array.from(globalSelected.keys());

        // 1. Simpan ke Supabase (Tanpa RLS)
        const { data: rec, error: subError } = await _supabase.from('memo_rekod').insert([{
            sektor: document.getElementById('sektor').value,
            unit: document.getElementById('unit').value,
            nama_penerima: names.join(', '),
            emel_penerima: emels.join(', '),
            tarikh_terima: document.getElementById('tarikhTerima').value,
            tarikh_program: document.getElementById('tarikhProgram').value,
            bilangan_hari: parseInt(document.getElementById('bilanganHari').value),
            tajuk_program: document.getElementById('tajukProgram').value.toUpperCase(),
            masa_mula: document.getElementById('masaMula').value,
            masa_tamat: document.getElementById('masaTamat').value,
            file_url: uploadedFileUrl
        }]).select();

        if (subError) throw subError;

        setLoading(true, "Menghantar Notifikasi (Emel/Kalendar)...");

        // 2. Notifikasi GAS (Emel & Kalendar)
        const res = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'notify',
                sektor: document.getElementById('sektor').value,
                unit: document.getElementById('unit').value,
                namaArray: names,
                emailArray: emels,
                tarikhProgram: document.getElementById('tarikhProgram').value,
                bilanganHari: document.getElementById('bilanganHari').value,
                tajukProgram: document.getElementById('tajukProgram').value.toUpperCase(),
                masaMula: document.getElementById('masaMula').value,
                masaTamat: document.getElementById('masaTamat').value,
                fileUrl: uploadedFileUrl
            })
        });
        const notify = await res.json();

        if (notify.status === 'success') {
            await _supabase.from('memo_rekod').update({ calendar_event_id: notify.calendarEventId }).eq('id', rec[0].id);
        }

        showMessage("<strong>Berjaya!</strong> Rekod memo disimpan dengan selamat dan automasi berjaya dipacu.", "success");
        
        // Refresh Kalendar
        const calFrame = document.getElementById('calendarFrame');
        if (calFrame) {
            calFrame.src = calFrame.src; 
        }

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

    tBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500"><div class="loader mr-2"></div> Memuat turun rekod pelayan...</td></tr>`;

    try {
        const { data, error } = await _supabase.from('memo_rekod').select('*').order('tarikh_terima', { ascending: false });
        if (error) throw error;
        
        allRecords = data;
        calculateKPIs(data);
        renderTable(data);
        populateAnalisisFilters(data);
    } catch (err) {
        tBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500">Gagal mengambil rekod: ${err.message}</td></tr>`;
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
    document.getElementById('kpiTopSektor').title = topSektor; 
}

// Populate Dropdown Tapisan Dinamik
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
            if (parts.length >= 2) {
                setBulan.add(`${parts[0]}-${parts[1]}`); // Ekstrak YYYY-MM
            }
        }
    });

    const genOptions = (set, defaultText, formatFn = (val) => val) => {
        let html = `<option value="">${defaultText}</option>`;
        Array.from(set).sort().forEach(val => {
            html += `<option value="${val}">${formatFn(val)}</option>`;
        });
        return html;
    };

    // Kekalkan nilai sedia ada jika telah dipilih sebelum refresh
    const currentSektor = fSektor.value;
    const currentUnit = fUnit.value;
    const currentBulan = fBulan.value;
    const currentTarikh = fTarikh.value;

    fSektor.innerHTML = genOptions(setSektor, "Semua Sektor", (v) => v.replace(/^\d{2}\s/, ''));
    fUnit.innerHTML = genOptions(setUnit, "Semua Unit");
    fBulan.innerHTML = genOptions(setBulan, "Semua Bulan", (v) => { const p = v.split('-'); return `${p[1]}/${p[0]}`; }); // MM/YYYY
    fTarikh.innerHTML = genOptions(setTarikh, "Semua Tarikh", (v) => { const p = v.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v; }); // DD/MM/YYYY

    // Re-apply existing values
    if (currentSektor) fSektor.value = currentSektor;
    if (currentUnit) fUnit.value = currentUnit;
    if (currentBulan) fBulan.value = currentBulan;
    if (currentTarikh) fTarikh.value = currentTarikh;
}

function renderTable(dataArray) {
    const tBody = document.getElementById('tableBody');
    tBody.innerHTML = '';

    if (dataArray.length === 0) {
        tBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500">Tiada rekod dijumpai berdasarkan tapisan.</td></tr>`;
        return;
    }

    dataArray.forEach(row => {
        let dateStr = row.tarikh_terima;
        if(dateStr) {
            const parts = dateStr.split('-');
            if(parts.length === 3) dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
            dateStr = "-";
        }
        
        const tr = document.createElement('tr');
        tr.className = "hover:bg-indigo-50/30 transition-colors";
        tr.innerHTML = `
            <td class="p-4 align-top">
                <div class="font-bold text-slate-700">${dateStr}</div>
            </td>
            <td class="p-4 align-top">
                <div class="text-sm font-semibold text-slate-800 break-words whitespace-normal">${row.sektor.replace(/^\d{2}\s/, '')}</div>
                <div class="text-xs text-slate-500 break-words whitespace-normal mt-1">${row.unit}</div>
            </td>
            <td class="p-4 align-top">
                <div class="text-sm font-bold text-indigo-700 break-words whitespace-normal">${row.tajuk_program}</div>
                <div class="text-xs text-slate-500 mt-1"><span class="font-semibold">Mula:</span> ${row.tarikh_program} (${row.bilangan_hari} Hari)</div>
            </td>
            <td class="p-4 align-top">
                <div class="text-xs text-slate-600 break-words whitespace-normal leading-relaxed" title="${row.nama_penerima}">${row.nama_penerima}</div>
            </td>
            <td class="p-4 align-top text-center">
                ${row.file_url ? 
                `<a href="${row.file_url}" target="_blank" class="inline-flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded hover:bg-indigo-100 transition-colors">
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg> Buka
                </a>` : 
                `<span class="text-xs text-slate-400">Tiada Fail</span>`}
            </td>
        `;
        tBody.appendChild(tr);
    });
}

function filterTable() {
    // Menangkap nilai input teks
    const query = document.getElementById('searchInput')?.value.toLowerCase() || "";
    
    // Menangkap nilai dari 4 tapisan dropdown
    const vSektor = document.getElementById('filterSektor')?.value || "";
    const vUnit = document.getElementById('filterUnit')?.value || "";
    const vBulan = document.getElementById('filterBulan')?.value || "";
    const vTarikh = document.getElementById('filterTarikh')?.value || "";

    const filtered = allRecords.filter(r => {
        // Padanan Carian Teks (OR Logic untuk teks)
        const textMatch = 
            (r.tajuk_program && r.tajuk_program.toLowerCase().includes(query)) || 
            (r.nama_penerima && r.nama_penerima.toLowerCase().includes(query)) ||
            (r.sektor && r.sektor.toLowerCase().includes(query));

        // Padanan Tapisan Dropdown (AND Logic bersyarat)
        const sektorMatch = vSektor === "" || r.sektor === vSektor;
        const unitMatch = vUnit === "" || r.unit === vUnit;
        const tarikhMatch = vTarikh === "" || r.tarikh_terima === vTarikh;
        
        let bulanMatch = true;
        if (vBulan !== "") {
            bulanMatch = r.tarikh_terima && r.tarikh_terima.startsWith(vBulan);
        }

        // Kesemua syarat (AND) perlu ditepati untuk memaparkan baris tersebut
        return textMatch && sektorMatch && unitMatch && bulanMatch && tarikhMatch;
    });

    renderTable(filtered);
}

function resetAnalisisFilters() {
    if(document.getElementById('searchInput')) document.getElementById('searchInput').value = "";
    if(document.getElementById('filterSektor')) document.getElementById('filterSektor').value = "";
    if(document.getElementById('filterUnit')) document.getElementById('filterUnit').value = "";
    if(document.getElementById('filterBulan')) document.getElementById('filterBulan').value = "";
    if(document.getElementById('filterTarikh')) document.getElementById('filterTarikh').value = "";
    
    // Jalankan semula tapisan dengan nilai kosong (papar semua data)
    filterTable();
}

// ================= UTILITI SISTEM =================
function setLoading(status, txt) {
    const btn = document.getElementById('submitBtn');
    const bt = document.getElementById('btnText');
    if (!btn || !bt) return;
    btn.disabled = status;
    bt.innerHTML = status ? `<div class="loader mr-2"></div> <span>${txt}</span>` : "Simpan & Hantar Rekod";
}

window.showMessage = function(m, t) {
    const b = document.getElementById('messageBox');
    if (!b) return;
    b.innerHTML = m;
    b.className = `mb-8 p-4 rounded-lg font-medium text-sm border ${t==='error'?'bg-red-50 text-red-800 border-red-200':t==='success'?'bg-emerald-50 text-emerald-800 border-emerald-200':'bg-blue-50 text-blue-800 border-blue-200'}`;
    b.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    if(t === 'success') {
        setTimeout(() => b.classList.add('hidden'), 10000);
    }
};

function resetForm() {
    const mainForm = document.getElementById('mainForm');
    if (mainForm) mainForm.reset();
    resetFileUpload();
    
    globalSelected.clear();
    renderTags();
    
    populateUnit();
}