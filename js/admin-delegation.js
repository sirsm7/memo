/**
 * ==============================================================================
 * SISTEM PENGURUSAN MEMO@AG
 * Modul: js/admin-delegation.js
 * Tujuan: Aliran TPPD/Ketua Sektor/Ketua Unit, delegasi memo, pemilihan pukal,
 *         carian pegawai, penugasan PIC dan notifikasi emel berkaitan delegasi.
 * ==============================================================================
 */

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
