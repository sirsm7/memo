/**
 * ==============================================================================
 * SISTEM PENGURUSAN MEMO@AG
 * Modul: js/admin-crud.js
 * Tujuan: CRUD pegawai, edit memo, ubah hala PIC/penerima, carian pantas edit memo,
 *         daftar akses sistem dan gugur akses admin/perakam.
 * ==============================================================================
 */

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

// ================= CRUD LOGIC: AKSES SISTEM =================
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
