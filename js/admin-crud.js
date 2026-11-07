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

    sSelect.textContent = '';
    const defOpt = document.createElement('option');
    defOpt.value = ""; defOpt.textContent = "-- PILIH SEKTOR --";
    sSelect.appendChild(defOpt);
    
    unikSektor.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        sSelect.appendChild(opt);
    });
    
    const newOpt = document.createElement('option');
    newOpt.value = "MANUAL"; newOpt.textContent = "++ TAMBAH SEKTOR BAHARU ++";
    sSelect.appendChild(newOpt);

    uSelect.textContent = '';
    const defUOpt = document.createElement('option');
    defUOpt.value = ""; defUOpt.textContent = "-- PILIH UNIT --";
    uSelect.appendChild(defUOpt);
    
    unikUnit.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u; opt.textContent = u;
        uSelect.appendChild(opt);
    });
    
    const newUOpt = document.createElement('option');
    newUOpt.value = "MANUAL"; newUOpt.textContent = "++ TAMBAH UNIT BAHARU ++";
    uSelect.appendChild(newUOpt);

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
        if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
            await window.appConfigReady;
        }
        const client = window._supabase;
        if (!client) throw new Error("Supabase tidak tersedia.");

        if (id) {
            await client.from('memo_pegawai').update(payload).eq('id', id);
            window.showMessage("Data pegawai berjaya dikemaskini.", "success");
        } else {
            await client.from('memo_pegawai').insert([payload]);
            window.showMessage("Pegawai baharu berjaya didaftarkan.", "success");
        }
        
        if (window.CacheService) await window.CacheService.clearStore('memo_pegawai');
        toggleModal('modalPegawai', false);
        if (typeof loadAdminPegawai === 'function') loadAdminPegawai();
        
    } catch (err) {
        window.showMessage("Gagal menyimpan pegawai: " + err.message, "error");
    }
}

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
                if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
                    await window.appConfigReady;
                }
                const client = window._supabase;
                if (!client) throw new Error("Supabase tidak tersedia.");

                await client.from('memo_pegawai').delete().eq('id', id);
                if (window.CacheService) await window.CacheService.clearStore('memo_pegawai');
                if (typeof loadAdminPegawai === 'function') loadAdminPegawai();
                
                window.showMessage("Pegawai telah dikeluarkan dari sistem.", "success");
            } catch (err) {
                window.showMessage("Ralat padam: " + err.message, "error");
            }
        }
    });
}

window.handleCarianAdminEdit = function(e) {
    const query = e.target.value.toLowerCase();
    const dropdown = document.getElementById('dropdownCarianEdit');
    dropdown.textContent = '';

    if (query.length < 2) {
        dropdown.classList.add('hidden');
        return;
    }

    const results = adminPegawaiData.filter(p => 
        p.nama.toLowerCase().includes(query) || 
        p.sektor.toLowerCase().includes(query) || 
        p.unit.toLowerCase().includes(query)
    ).slice(0, 15); 

    if (results.length === 0) {
        const div = document.createElement('div');
        div.className = 'p-3 text-sm text-slate-500 italic text-center font-medium';
        div.textContent = 'Tiada padanan rekod dijumpai...';
        dropdown.appendChild(div);
    } else {
        results.forEach(p => {
            const div = document.createElement('div');
            div.className = "p-3 hover:bg-indigo-50 border-b border-slate-100 cursor-pointer transition-colors group";
            
            const nDiv = document.createElement('div');
            nDiv.className = "text-sm font-bold text-slate-700 group-hover:text-indigo-700";
            nDiv.textContent = p.nama;
            
            const sDiv = document.createElement('div');
            sDiv.className = "text-xs text-slate-500 mt-0.5 group-hover:text-indigo-500 font-medium";
            sDiv.textContent = p.sektor.replace(/^\d{2}\s/, '') + " - " + p.unit;
            
            div.appendChild(nDiv);
            div.appendChild(sDiv);
            div.addEventListener('click', () => selectPegawaiCarianEdit(p.emel_rasmi, p.nama, p.sektor, p.unit));
            
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

    elSektor.value = sektor;
    populateAdminEditUnit();
    elUnit.value = unit;
    
    adminEditSelected.set(emel, nama);
    populateAdminEditNama(); 
    renderAdminEditTags();

    input.value = '';
    dropdown.classList.add('hidden');
};

function populateAdminEditSektor() {
    const sSelect = document.getElementById('adminEditSektor');
    if (!sSelect) return;
    const unikSektor = [...new Set(adminPegawaiData.map(p => p.sektor))].sort();
    
    sSelect.textContent = '';
    const defOpt = document.createElement('option');
    defOpt.value = ""; defOpt.textContent = "-- Pilih Sektor --";
    sSelect.appendChild(defOpt);
    
    unikSektor.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        sSelect.appendChild(opt);
    });
}

function populateAdminEditUnit() {
    const sk = document.getElementById('adminEditSektor').value;
    const uSelect = document.getElementById('adminEditUnit');
    const nc = document.getElementById('adminEditNamaContainer');
    
    uSelect.textContent = '';
    const defOpt = document.createElement('option');
    defOpt.value = ""; defOpt.textContent = "-- Pilih Unit --";
    uSelect.appendChild(defOpt);
    
    if (sk) {
        const unitSektor = adminPegawaiData.filter(p => p.sektor === sk).map(p => p.unit);
        const unikUnit = [...new Set(unitSektor)].sort();
        
        unikUnit.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u; opt.textContent = u;
            uSelect.appendChild(opt);
        });
        uSelect.disabled = false;
        
        nc.textContent = '';
        const warn = document.createElement('div');
        warn.className = 'text-slate-400 italic text-sm mt-1';
        warn.textContent = 'Sila Pilih Unit Dahulu';
        nc.appendChild(warn);
    } else {
        uSelect.disabled = true;
        nc.textContent = '';
        const warn = document.createElement('div');
        warn.className = 'text-slate-400 italic text-sm mt-1';
        warn.textContent = 'Sila Pilih Sektor & Unit Dahulu';
        nc.appendChild(warn);
    }
}

function populateAdminEditNama() {
    const sk = document.getElementById('adminEditSektor').value;
    const un = document.getElementById('adminEditUnit').value;
    const nc = document.getElementById('adminEditNamaContainer');
    nc.textContent = '';

    if (sk && un) {
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between pb-2 mb-2 border-b border-slate-200 sticky top-0 bg-slate-50 z-10';
        
        const title = document.createElement('span');
        title.className = 'text-xs font-bold text-slate-500 uppercase';
        title.textContent = `Senarai Pegawai (${un})`;
        
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded transition-colors shadow-sm focus:outline-none';
        btn.textContent = 'Pilih Semua / Batal';
        btn.addEventListener('click', window.selectAllAdminEditInUnit);
        
        header.appendChild(title);
        header.appendChild(btn);
        nc.appendChild(header);

        const pegs = adminPegawaiData.filter(p => p.sektor === sk && p.unit === un).sort((a,b)=>a.nama.localeCompare(b.nama));
        
        pegs.forEach((p, i) => {
            const isChecked = adminEditSelected.has(p.emel_rasmi);
            
            const div = document.createElement('div');
            div.className = 'flex items-center mb-2 hover:bg-indigo-50/70 p-2 rounded transition-colors border border-transparent hover:border-indigo-100';
            
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.id = `ae_c_${i}`;
            chk.value = p.nama;
            chk.className = 'w-4 h-4 text-indigo-600 rounded ae-checkbox focus:ring-indigo-500';
            chk.checked = isChecked;
            chk.setAttribute('data-email', p.emel_rasmi);
            chk.addEventListener('change', function() {
                toggleAdminEditPenerima(this.value, this.getAttribute('data-email'), this.checked);
            });
            
            const lbl = document.createElement('label');
            lbl.htmlFor = `ae_c_${i}`;
            lbl.className = 'ml-3 text-sm font-medium text-slate-700 cursor-pointer flex-1 select-none';
            lbl.textContent = p.nama;
            
            div.appendChild(chk);
            div.appendChild(lbl);
            nc.appendChild(div);
        });
    } else {
        const warn = document.createElement('div');
        warn.className = 'text-slate-400 italic text-sm mt-1';
        warn.textContent = 'Sila Pilih Unit Atau Gunakan Carian Pantas Dahulu';
        nc.appendChild(warn);
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
    container.textContent = '';
    
    if (adminEditSelected.size === 0) {
        const span = document.createElement('span');
        span.className = 'text-sm text-slate-400 italic mt-1 ml-1';
        span.textContent = 'Belum ada penerima dipilih...';
        container.appendChild(span);
        return;
    }
    
    adminEditSelected.forEach((nama, emel) => {
        const div = document.createElement('div');
        div.className = 'inline-flex items-center bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full border border-indigo-200 shadow-sm transition-transform hover:-translate-y-0.5';
        
        const span = document.createElement('span');
        span.textContent = nama;
        
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ml-2 text-indigo-400 hover:text-red-500 focus:outline-none transition-colors';
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
        btn.addEventListener('click', () => removeAdminEditTag(emel));
        
        div.appendChild(span);
        div.appendChild(btn);
        container.appendChild(div);
    });
}

window.editMemo = function(id) {
    let m = adminMemoData.find(x => x.id === id);
    if (!m && typeof allRecords !== 'undefined') {
        m = allRecords.find(x => x.id === id);
    }
    if (!m) return window.showMessage("Ralat pangkalan data: Memo tidak dijumpai.", "error");
    
    document.getElementById('memoId').value = m.id;
    document.getElementById('memoNoRujukan').value = m.no_rujukan || '';
    document.getElementById('memoNoTambahan').value = m.no_tambahan || '';
    document.getElementById('memoDari').value = m.dari || '';
    document.getElementById('memoTajuk').value = m.tajuk_program || '';
    document.getElementById('memoTarikhSurat').value = m.tarikh_surat || '';
    document.getElementById('memoTarikhTerima').value = m.tarikh_terima || '';
    document.getElementById('memoMasaRekod').value = m.masa_rekod || '';

    document.getElementById('carianPegawaiEdit').value = '';
    document.getElementById('dropdownCarianEdit').classList.add('hidden');

    adminEditSelected.clear();
    if (m.emel_penerima && m.nama_penerima) {
        const emels = m.emel_penerima.split(',').map(e => e.trim());
        const namas = m.nama_penerima.split(',').map(n => n.trim());
        emels.forEach((e, i) => {
            if (e) adminEditSelected.set(e, namas[i] || e);
        });
    }

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
        if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
            await window.appConfigReady;
        }
        const client = window._supabase;
        if (!client) throw new Error("Supabase tidak tersedia.");

        const names = Array.from(adminEditSelected.values());
        const emails = Array.from(adminEditSelected.keys());
        const targetSektor = document.getElementById('adminEditSektor').value;
        const targetUnit = document.getElementById('adminEditUnit').value;

        const oldEmailsStr = m.emel_penerima || "";
        const oldEmailsArr = oldEmailsStr.split(',').map(e => e.trim().toLowerCase()).filter(e => e);
        
        const newlyAddedEmails = [];
        const newlyAddedNames = []; 
        
        emails.forEach(e => {
            if (!oldEmailsArr.includes(e.trim().toLowerCase())) {
                newlyAddedEmails.push(e);
                newlyAddedNames.push(adminEditSelected.get(e) || e); 
            }
        });

        const isEmailAdded = newlyAddedEmails.length > 0;
        const adminEmail = currentAdmin.email.toLowerCase();
        const managerProfile = adminPegawaiData.find(p => p.emel_rasmi.toLowerCase() === adminEmail);
        const actualDelegasiNama = managerProfile ? managerProfile.nama : (currentAdmin.managerUnit || currentAdmin.role || 'Pentadbir Sistem');

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
        };

        const { error } = await client.from('memo_rekod').update(payload).eq('id', id);
        if (error) throw error;

        if (window.CacheService) await window.CacheService.clearStore('memo_rekod');

        let messageText = "Maklumat surat dikemaskini. (Tiada notifikasi e-mel tambahan dihantar)";
        
        if (isEmailAdded && window.GAS_URL) {
            try {
                await fetch(window.GAS_URL, {
                    method: 'POST',
                    redirect: "follow",
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify({
                        action: 'notifyExtraEmailsOnly',
                        sektor: targetSektor,
                        unit: targetUnit,
                        newEmailsOnly: newlyAddedEmails, 
                        delegasiNama: actualDelegasiNama, 
                        picNames: newlyAddedNames,        
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
        if (currentAdmin && currentAdmin.isSystemAdmin && typeof loadAdminMemo === 'function') {
            loadAdminMemo();
        }
        if (typeof loadDashboardData === 'function') loadDashboardData(); 
        
        window.showMessage("Selesai. " + messageText, "success");

    } catch (err) {
        window.showMessage("Ralat Transaksi: Gagal mengemaskini maklumat surat. " + err.message, "error");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Simpan & Kemaskini';
    }
}

async function handleTambahAdminSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('tambahAdminEmail').value;
    const pass = document.getElementById('tambahAdminPassword').value;
    const role = document.getElementById('tambahAdminRole').value;

    const btn = document.getElementById('btnSimpanAdmin');
    btn.disabled = true;
    btn.innerHTML = '<div class="loader mr-2 border-white border-top-indigo-500"></div> Menyimpan...';

    try {
        if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
            await window.appConfigReady;
        }
        const client = window._supabase;
        if (!client) throw new Error("Supabase tidak tersedia.");

        await client.from('memo_admin').insert([{
            email: email,
            password: pass,
            role: role
        }]);
        
        if (window.CacheService) await window.CacheService.clearStore('memo_admin');
        if (typeof loadAdminSistem === 'function') loadAdminSistem();
        
        toggleModal('modalTambahAdmin', false);
        document.getElementById('formTambahAdmin').reset();
        window.showMessage(`Akses pengguna baharu berjawatan ${role} berjaya didaftarkan.`, "success");
    } catch (err) {
        window.showMessage("Gagal menambah akses sistem: " + err.message, "error");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Daftar Pengguna';
    }
}

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
                if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
                    await window.appConfigReady;
                }
                const client = window._supabase;
                if (!client) throw new Error("Supabase tidak tersedia.");

                await client.from('memo_admin').delete().eq('id', id);
                if (window.CacheService) await window.CacheService.clearStore('memo_admin');
                if (typeof loadAdminSistem === 'function') loadAdminSistem();
                
                window.showMessage("Akses profil telah berjaya dibatalkan.", "success");
            } catch (err) {
                window.showMessage("Gagal membatalkan akses profil.", "error");
            }
        }
    });
}