let managerMemoCurrentPage = 1;
const MANAGER_MEMO_PAGE_SIZE = 20;

async function loadManagerMemo() {
    if (!currentAdmin || (!currentAdmin.isManager && !currentAdmin.isSystemAdmin)) return;

    managerSelectedMemos.clear();
    updateTppdBulkButton();
    const checkAllBox = document.getElementById('tppdCheckAll');
    if (checkAllBox) checkAllBox.checked = false;

    managerMemoCurrentPage = 1;

    try {
        if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
            await window.appConfigReady;
        }

        const client = window._supabase;
        if (!client || typeof client.from !== 'function') {
            throw new Error("Klien Supabase belum sedia.");
        }

        const { data, error } = await client
            .from('memo_rekod')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const rawData = data || [];
        const userRole = String(currentAdmin.role || '').trim().toUpperCase();
        const currentEmail = String(currentAdmin.email || '').trim().toLowerCase();
        
        managerMemoData = rawData.filter(m => {
            const isPendingCalendar = String(m.calendar_event_id).startsWith('PENDING_');
            const isNoCalendarAndIsManager = (!m.calendar_event_id) && window.isManagerRole && window.isManagerRole(m.unit);
            
            let isPending = isPendingCalendar || isNoCalendarAndIsManager;
            
            if (isPendingCalendar && window.isManagerRole && !window.isManagerRole(m.unit)) {
                isPending = false;
            }

            if (!isPending) return false;

            if (currentAdmin.isSystemAdmin) {
                return true;
            } 
            else if (userRole === 'TPPD') {
                const unitMatch = m.unit === currentAdmin.managerUnit;
                const emelList = String(m.emel_penerima || '').toLowerCase();
                return unitMatch && emelList.includes(currentEmail);
            } 
            else {
                return m.sektor === currentAdmin.managerSektor && m.unit === currentAdmin.managerUnit;
            }
        });

        renderManagerTable(managerMemoData);
    } catch (error) {
        console.error("Ralat memuatkan rekod delegasi:", error);
        window.showMessage("Gagal memuatkan rekod delegasi. Sila semak konsol.", "error");
        managerMemoData = [];
        renderManagerTable(managerMemoData);
    }
}

function renderManagerTable(data) {
    const tbody = document.getElementById('tppdTableBody');
    if (!tbody) return;

    tbody.textContent = '';

    if (!data || data.length === 0) {
        const emptyTr = document.createElement('tr');
        const emptyTd = document.createElement('td');
        emptyTd.colSpan = 6;
        emptyTd.className = 'p-8 text-center text-slate-500';
        emptyTd.textContent = 'Tiada rekod senarai menunggu dipaparkan.';
        emptyTr.appendChild(emptyTd);
        tbody.appendChild(emptyTr);
        renderManagerMemoPagination(0);
        return;
    }

    const totalRecords = data.length;
    const totalPages = Math.ceil(totalRecords / MANAGER_MEMO_PAGE_SIZE) || 1;

    if (managerMemoCurrentPage > totalPages) managerMemoCurrentPage = totalPages;
    if (managerMemoCurrentPage < 1) managerMemoCurrentPage = 1;

    const startIndex = (managerMemoCurrentPage - 1) * MANAGER_MEMO_PAGE_SIZE;
    const pageRecords = data.slice(startIndex, startIndex + MANAGER_MEMO_PAGE_SIZE);

    const fragment = document.createDocumentFragment();

    pageRecords.forEach(row => {
        const isChecked = managerSelectedMemos.has(row.id);
        const penerimaAsal = row.nama_penerima ? row.nama_penerima.split(',')[0].trim() : '-';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-indigo-50/30 transition-colors';

        const tdCheck = document.createElement('td');
        tdCheck.className = 'p-4 border-b text-center align-top';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.value = row.id;
        chk.checked = isChecked;
        chk.className = 'tppd-memo-checkbox w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer transition-colors border-slate-300';
        chk.addEventListener('change', function() {
            toggleManagerMemoSelection(row.id, this.checked);
        });
        tdCheck.appendChild(chk);
        tr.appendChild(tdCheck);

        const tdDetail = document.createElement('td');
        tdDetail.className = 'p-4 border-b align-top';
        const divNoRuj = document.createElement('div');
        divNoRuj.className = 'font-bold text-slate-700 uppercase text-xs';
        divNoRuj.textContent = row.no_rujukan || 'TIADA';
        const divTajuk = document.createElement('div');
        divTajuk.className = 'text-[11px] text-slate-500 mt-0.5 uppercase';
        divTajuk.textContent = row.tajuk_program || '-';
        const divAsal = document.createElement('div');
        divAsal.className = 'text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded inline-block mt-1.5';
        divAsal.title = 'Penerima Asal';
        divAsal.textContent = `Asal: ${penerimaAsal}`;
        tdDetail.appendChild(divNoRuj);
        tdDetail.appendChild(divTajuk);
        tdDetail.appendChild(divAsal);
        tr.appendChild(tdDetail);

        const tdDari = document.createElement('td');
        tdDari.className = 'p-4 border-b text-[11px] font-semibold text-slate-700 uppercase align-top';
        tdDari.textContent = row.dari || '-';
        tr.appendChild(tdDari);

        const tdTarikh = document.createElement('td');
        tdTarikh.className = 'p-4 border-b align-top';
        const divTarikh = document.createElement('div');
        divTarikh.className = 'font-semibold text-slate-700 text-[11px]';
        divTarikh.textContent = row.tarikh_terima || '-';
        const divMasa = document.createElement('div');
        divMasa.className = 'text-[10px] text-indigo-600 font-bold mt-0.5';
        divMasa.textContent = row.masa_rekod || '-';
        tdTarikh.appendChild(divTarikh);
        tdTarikh.appendChild(divMasa);
        tr.appendChild(tdTarikh);

        const tdFail = document.createElement('td');
        tdFail.className = 'p-4 border-b text-center align-top';
        if (row.file_url) {
            const aFail = document.createElement('a');
            aFail.href = row.file_url;
            aFail.target = '_blank';
            aFail.rel = 'noopener noreferrer';
            aFail.className = 'text-indigo-600 hover:text-indigo-800 text-[11px] font-bold underline';
            aFail.textContent = 'Lihat Fail';
            tdFail.appendChild(aFail);
        } else {
            tdFail.textContent = '-';
        }
        tr.appendChild(tdFail);

        const tdAksi = document.createElement('td');
        tdAksi.className = 'p-4 border-b text-center align-top';
        const btnAksi = document.createElement('button');
        btnAksi.type = 'button';
        btnAksi.className = 'bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors shadow-sm whitespace-nowrap flex items-center mx-auto';
        btnAksi.innerHTML = '<svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg> Tindakan';
        btnAksi.addEventListener('click', () => {
            openManagerAssignModal(row.id, false);
        });
        tdAksi.appendChild(btnAksi);
        tr.appendChild(tdAksi);

        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);

    const checkAllBox = document.getElementById('tppdCheckAll');
    if (checkAllBox) {
        const allPageSelected = pageRecords.length > 0 && pageRecords.every(r => managerSelectedMemos.has(r.id));
        checkAllBox.checked = allPageSelected;
    }

    renderManagerMemoPagination(totalRecords);
}

function renderManagerMemoPagination(totalRecords) {
    let container = document.getElementById('tppdPagination');

    if (!container) {
        const tbody = document.getElementById('tppdTableBody');
        const scrollContainer = tbody ? tbody.closest('.overflow-x-auto') : null;
        if (scrollContainer && scrollContainer.parentNode) {
            container = document.createElement('div');
            container.id = 'tppdPagination';
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

    const totalPages = Math.ceil(totalRecords / MANAGER_MEMO_PAGE_SIZE) || 1;
    const startRecord = (managerMemoCurrentPage - 1) * MANAGER_MEMO_PAGE_SIZE + 1;
    const endRecord = Math.min(managerMemoCurrentPage * MANAGER_MEMO_PAGE_SIZE, totalRecords);

    const isPrevDisabled = managerMemoCurrentPage <= 1;
    const isNextDisabled = managerMemoCurrentPage >= totalPages;

    container.textContent = '';

    const textDiv = document.createElement('div');
    textDiv.className = 'text-slate-500 font-medium text-center sm:text-left';
    textDiv.innerHTML = `Menunjukkan <span class="font-bold text-slate-700">${startRecord}</span> - <span class="font-bold text-slate-700">${endRecord}</span> daripada <span class="font-bold text-slate-700">${totalRecords}</span> rekod menunggu (Halaman <span class="font-bold text-indigo-600">${managerMemoCurrentPage}</span>/${totalPages})`;

    const btnsDiv = document.createElement('div');
    btnsDiv.className = 'flex items-center space-x-2';

    const btnPrev = document.createElement('button');
    btnPrev.type = 'button';
    btnPrev.className = 'px-3 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 bg-white hover:bg-slate-100 transition-colors flex items-center shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white';
    btnPrev.disabled = isPrevDisabled;
    btnPrev.innerHTML = '<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg> Sebelumnya';
    btnPrev.addEventListener('click', () => window.changeManagerMemoPage(managerMemoCurrentPage - 1));

    const btnNext = document.createElement('button');
    btnNext.type = 'button';
    btnNext.className = 'px-3 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 bg-white hover:bg-slate-100 transition-colors flex items-center shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white';
    btnNext.disabled = isNextDisabled;
    btnNext.innerHTML = 'Seterusnya <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>';
    btnNext.addEventListener('click', () => window.changeManagerMemoPage(managerMemoCurrentPage + 1));

    btnsDiv.appendChild(btnPrev);
    btnsDiv.appendChild(btnNext);

    container.appendChild(textDiv);
    container.appendChild(btnsDiv);
}

window.changeManagerMemoPage = function(targetPage) {
    const totalPages = Math.ceil(managerMemoData.length / MANAGER_MEMO_PAGE_SIZE) || 1;
    if (targetPage < 1 || targetPage > totalPages) return;
    managerMemoCurrentPage = targetPage;
    renderManagerTable(managerMemoData);

    const tbody = document.getElementById('tppdTableBody');
    if (tbody) {
        const scrollContainer = tbody.closest('.overflow-x-auto');
        if (scrollContainer) scrollContainer.scrollTop = 0;
    }
};

window.toggleManagerMemoSelection = function(id, isChecked) {
    if (isChecked) managerSelectedMemos.add(id);
    else managerSelectedMemos.delete(id);
    updateTppdBulkButton();

    const checkAllBox = document.getElementById('tppdCheckAll');
    if (checkAllBox) {
        const startIndex = (managerMemoCurrentPage - 1) * MANAGER_MEMO_PAGE_SIZE;
        const pageRecords = managerMemoData.slice(startIndex, startIndex + MANAGER_MEMO_PAGE_SIZE);
        checkAllBox.checked = pageRecords.length > 0 && pageRecords.every(r => managerSelectedMemos.has(r.id));
    }
};

window.toggleAllManagerMemos = function(isChecked) {
    const startIndex = (managerMemoCurrentPage - 1) * MANAGER_MEMO_PAGE_SIZE;
    const pageRecords = managerMemoData.slice(startIndex, startIndex + MANAGER_MEMO_PAGE_SIZE);

    pageRecords.forEach(r => {
        if (isChecked) managerSelectedMemos.add(r.id);
        else managerSelectedMemos.delete(r.id);
    });

    const checkboxes = document.querySelectorAll('.tppd-memo-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
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

window.openManagerAssignModal = function(id = null, isBulk = false) {
    if (isBulk && managerSelectedMemos.size === 0) {
        return window.showMessage("Sila pilih sekurang-kurangnya satu memo daripada jadual untuk tindakan pukal.", "error");
    }

    document.getElementById('formTppdAssign').reset();
    document.getElementById('carianPegawaiTppd').value = '';
    document.getElementById('dropdownCarianTppd').classList.add('hidden');
    document.getElementById('tppdIsBulk').value = isBulk ? 'true' : 'false';

    managerSelected.clear();
    renderManagerTags();

    const isRoleTPPD = currentAdmin && currentAdmin.role === 'TPPD';
    const isGlobalAdmin = currentAdmin && currentAdmin.isSystemAdmin;

    const carianInput = document.getElementById('carianPegawaiTppd');
    if (carianInput) {
        carianInput.placeholder = (isRoleTPPD || isGlobalAdmin) ? "Akses Global: Carian Rentas Sektor..." : "Taip nama pegawai seliaan anda...";
    }

    const sSelect = document.getElementById('tppdSektorSelect');
    sSelect.textContent = '';
    const defOpt = document.createElement('option');
    defOpt.value = ""; defOpt.textContent = "-- Sila Pilih Sektor --";
    sSelect.appendChild(defOpt);

    let availableSektors = [];
    if (isRoleTPPD || isGlobalAdmin) {
        availableSektors = adminPegawaiData.map(p => p.sektor);
    } else {
        availableSektors = [currentAdmin.managerSektor];
    }

    const unikSektor = [...new Set(availableSektors)].sort();
    unikSektor.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        sSelect.appendChild(opt);
    });

    const uSelect = document.getElementById('tppdUnitSelect');
    const nc = document.getElementById('tppdNamaContainer');

    if (!(isRoleTPPD || isGlobalAdmin) && unikSektor.length === 1) {
        sSelect.value = unikSektor[0];
        window.populateManagerUnit();
    } else {
        uSelect.textContent = '';
        const defUOpt = document.createElement('option');
        defUOpt.value = ""; defUOpt.textContent = "Pilih Sektor Dahulu";
        uSelect.appendChild(defUOpt);
        uSelect.disabled = true;
        
        nc.textContent = '';
        const warn = document.createElement('div');
        warn.className = 'text-slate-400 italic text-sm mt-1';
        warn.textContent = 'Sila Pilih Sektor Atau Gunakan Carian Pantas Dahulu';
        nc.appendChild(warn);
    }

    const infoContainer = document.getElementById('tppdDisplayInfo');
    infoContainer.textContent = '';

    if (isBulk) {
        const bulkDiv = document.createElement('div');
        bulkDiv.className = 'flex items-center text-indigo-700 bg-indigo-100/50 p-2 rounded border border-indigo-200 shadow-sm mt-2';
        bulkDiv.innerHTML = `
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            <span class="text-sm font-bold">Mod Pukal: ${managerSelectedMemos.size} Surat dipilih untuk penugasan serentak.</span>
        `;
        infoContainer.appendChild(bulkDiv);
    } else {
        const m = managerMemoData.find(x => x.id === id);
        if (!m) return;
        document.getElementById('tppdMemoId').value = m.id;

        const pTajukTitle = document.createElement('p');
        pTajukTitle.className = 'text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-0.5 mt-2';
        pTajukTitle.textContent = 'Perkara / Tajuk Surat';

        const pTajuk = document.createElement('p');
        pTajuk.className = 'text-sm font-semibold text-slate-700 mb-2 leading-tight';
        pTajuk.textContent = m.tajuk_program || '-';

        const pRujTitle = document.createElement('p');
        pRujTitle.className = 'text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-0.5';
        pRujTitle.textContent = 'No. Rujukan';

        const pRuj = document.createElement('p');
        pRuj.className = 'text-sm font-semibold text-slate-700 leading-tight';
        pRuj.textContent = m.no_rujukan || 'TIADA RUJUKAN';

        infoContainer.appendChild(pTajukTitle);
        infoContainer.appendChild(pTajuk);
        infoContainer.appendChild(pRujTitle);
        infoContainer.appendChild(pRuj);
    }

    const btnSubmit = document.getElementById('btnSubmitTppdAssign');
    if (btnSubmit) btnSubmit.textContent = 'Sahkan Penugasan';

    toggleModal('modalTppdAssign', true);
}

window.populateManagerUnit = function() {
    const sk = document.getElementById('tppdSektorSelect').value;
    const uSelect = document.getElementById('tppdUnitSelect');
    const nc = document.getElementById('tppdNamaContainer');

    uSelect.textContent = '';
    const defOpt = document.createElement('option');
    defOpt.value = ""; defOpt.textContent = "-- Sila Pilih Unit --";
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
};

window.handleCarianTppd = function(e) {
    const query = e.target.value.toLowerCase();
    const dropdown = document.getElementById('dropdownCarianTppd');
    dropdown.textContent = '';

    if (query.length < 2) {
        dropdown.classList.add('hidden');
        return;
    }

    const isRoleTPPD = currentAdmin && currentAdmin.role === 'TPPD';
    const isGlobalAdmin = currentAdmin && currentAdmin.isSystemAdmin;

    const results = adminPegawaiData.filter(p => {
        const textMatch = p.nama.toLowerCase().includes(query) || p.unit.toLowerCase().includes(query) || p.sektor.toLowerCase().includes(query);
        if (isRoleTPPD || isGlobalAdmin) return textMatch;
        return p.sektor === currentAdmin.managerSektor && textMatch;
    }).slice(0, 15);

    if (results.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'p-3 text-sm text-slate-500 italic text-center font-medium';
        emptyDiv.textContent = (isRoleTPPD || isGlobalAdmin) ? 'Tiada padanan dijumpai...' : 'Tiada padanan di dalam sektor anda...';
        dropdown.appendChild(emptyDiv);
    } else {
        results.forEach(p => {
            const div = document.createElement('div');
            div.className = "p-3 hover:bg-indigo-50 border-b border-slate-100 cursor-pointer transition-colors group";

            const nDiv = document.createElement('div');
            nDiv.className = "text-sm font-bold text-slate-700 group-hover:text-indigo-700";
            nDiv.textContent = p.nama;

            const uDiv = document.createElement('div');
            uDiv.className = "text-xs text-slate-500 mt-0.5 group-hover:text-indigo-500 font-medium";
            uDiv.textContent = (isRoleTPPD || isGlobalAdmin) ? p.sektor.replace(/^\d{2}\s/, '') + ' - ' + p.unit : p.unit;

            div.appendChild(nDiv);
            div.appendChild(uDiv);
            div.addEventListener('click', () => selectPegawaiCarianTppd(p.emel_rasmi, p.nama, p.sektor, p.unit));
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

    elSektor.value = sektor;
    window.populateManagerUnit();
    elUnit.value = unit;

    managerSelected.set(emel, nama);
    populateManagerNama();
    renderManagerTags();

    input.value = '';
    dropdown.classList.add('hidden');
};

function populateManagerNama() {
    const sk = document.getElementById('tppdSektorSelect').value;
    const un = document.getElementById('tppdUnitSelect').value;
    const nc = document.getElementById('tppdNamaContainer');
    nc.textContent = '';

    const isRoleTPPD = currentAdmin && currentAdmin.role === 'TPPD';
    const isGlobalAdmin = currentAdmin && currentAdmin.isSystemAdmin;

    if (sk && un) {
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between pb-2 mb-2 border-b border-slate-200 sticky top-0 bg-slate-50 z-10';

        const spanTitle = document.createElement('span');
        spanTitle.className = 'text-xs font-bold text-slate-500 uppercase';
        spanTitle.textContent = `${(isRoleTPPD || isGlobalAdmin) ? 'Senarai Pegawai' : 'Pegawai Seliaan Anda'} (${un})`;

        const btnToggleAll = document.createElement('button');
        btnToggleAll.type = 'button';
        btnToggleAll.className = 'text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded transition-colors shadow-sm focus:outline-none';
        btnToggleAll.textContent = 'Pilih Semua / Batal';
        btnToggleAll.addEventListener('click', window.selectAllManagerInUnit);

        header.appendChild(spanTitle);
        header.appendChild(btnToggleAll);
        nc.appendChild(header);

        const pegs = adminPegawaiData.filter(p => p.sektor === sk && p.unit === un).sort((a,b)=>a.nama.localeCompare(b.nama));

        pegs.forEach((p, i) => {
            const isChecked = managerSelected.has(p.emel_rasmi);

            const div = document.createElement('div');
            div.className = 'flex items-center mb-2 hover:bg-indigo-50/70 p-2 rounded transition-colors border border-transparent hover:border-indigo-100';

            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.id = `m_c_${i}`;
            chk.value = p.nama;
            chk.checked = isChecked;
            chk.setAttribute('data-email', p.emel_rasmi);
            chk.className = 'w-4 h-4 text-indigo-600 rounded m-checkbox focus:ring-indigo-500';
            chk.addEventListener('change', function() {
                toggleManagerPenerima(this.value, this.getAttribute('data-email'), this.checked);
            });

            const lbl = document.createElement('label');
            lbl.htmlFor = `m_c_${i}`;
            lbl.className = 'ml-3 text-sm font-medium text-slate-700 cursor-pointer flex-1 select-none';
            lbl.textContent = p.nama;

            if (isRoleTPPD || isGlobalAdmin) {
                const subSektor = document.createElement('span');
                subSektor.className = 'text-[10px] text-slate-400 ml-1';
                subSektor.textContent = `(${p.sektor.replace(/^\d{2}\s/, '')})`;
                lbl.appendChild(subSektor);
            }

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

    container.textContent = '';

    if (managerSelected.size === 0) {
        const spanEmpty = document.createElement('span');
        spanEmpty.className = 'text-sm text-slate-400 italic mt-1 ml-1';
        spanEmpty.textContent = 'Belum ada penerima dipilih...';
        container.appendChild(spanEmpty);
        hiddenCheck.value = '';
        return;
    }

    hiddenCheck.value = 'OK';

    managerSelected.forEach((nama, emel) => {
        const tag = document.createElement('div');
        tag.className = 'inline-flex items-center bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full border border-indigo-200 shadow-sm transition-transform hover:-translate-y-0.5';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = nama;

        const btnRemove = document.createElement('button');
        btnRemove.type = 'button';
        btnRemove.setAttribute('data-email', emel);
        btnRemove.className = 'ml-2 text-indigo-400 hover:text-red-500 focus:outline-none transition-colors';
        btnRemove.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
        btnRemove.addEventListener('click', function() {
            removeManagerTag(this.getAttribute('data-email'));
        });

        tag.appendChild(nameSpan);
        tag.appendChild(btnRemove);
        container.appendChild(tag);
    });
}

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

    toggleModal('modalTppdAssign', false);
    isProcessingTppdBatch = true;

    const idsToProcess = isBulk ? Array.from(managerSelectedMemos) : [parseInt(document.getElementById('tppdMemoId').value)];
    const totalJobs = idsToProcess.length;
    let successCount = 0;
    let errorCount = 0;

    const adminEmail = currentAdmin.email.toLowerCase();

    const managerProfile = adminPegawaiData.find(p => p.emel_rasmi.toLowerCase() === adminEmail);
    let actualDelegasiNama = 'Pihak Pengurusan';
    
    if (managerProfile) {
        actualDelegasiNama = managerProfile.nama;
    } else if (currentAdmin.isSystemAdmin) {
        actualDelegasiNama = 'Pentadbir Sistem (Bagi Pihak Pengurusan)';
    } else if (currentAdmin.managerUnit) {
        actualDelegasiNama = currentAdmin.managerUnit;
    }

    try {
        if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
            await window.appConfigReady;
        }

        const client = window._supabase;
        if (!client || typeof client.from !== 'function') {
            throw new Error("Klien Supabase belum sedia.");
        }

        for (let i = 0; i < totalJobs; i++) {
            const currentId = idsToProcess[i];
            const m = managerMemoData.find(x => x.id === currentId);

            if (!m) {
                errorCount++;
                continue;
            }

            updateTppdBatchProgressUI(i, totalJobs, `Menetapkan ID #${currentId} (${i+1}/${totalJobs})...`);

            try {
                let finalEventId = m.calendar_event_id;

                if (!finalEventId) {
                    finalEventId = 'RESOLVED_NO_CAL';
                } else if (finalEventId.startsWith('PENDING_')) {
                    finalEventId = finalEventId.replace('PENDING_', '');
                }

                const { error: updateError } = await client.from('memo_rekod').update({
                    sektor: targetSektor,
                    unit: targetUnit,
                    nama_penerima: baseNames.join(', '),
                    emel_penerima: baseEmails.join(', '),
                    calendar_event_id: finalEventId
                }).eq('id', currentId);

                if (updateError) throw updateError;

                const selfDelegationEmail = baseEmails.find(e => e.toLowerCase() === adminEmail);
                const isSelfAssigned = !!selfDelegationEmail;
                const isSelfAssignOnly = baseEmails.length === 1 && isSelfAssigned;

                const notifyEmails = baseEmails.filter(e => e.toLowerCase() !== adminEmail);
                const notifyNames = notifyEmails.map(e => managerSelected.get(e) || e);

                if (notifyEmails.length > 0 && window.GAS_URL) {
                    await fetch(window.GAS_URL, {
                        method: 'POST',
                        redirect: "follow",
                        headers: { "Content-Type": "text/plain;charset=utf-8" },
                        body: JSON.stringify({
                            action: 'notifyExtraEmailsOnly',
                            sektor: targetSektor,
                            unit: targetUnit,
                            newEmailsOnly: notifyEmails,
                            delegasiNama: actualDelegasiNama,
                            picNames: notifyNames,
                            noRujukan: m.no_rujukan || 'TIADA',
                            tajukProgram: m.tajuk_program,
                            fileUrl: m.file_url || 'Tiada Salinan'
                        })
                    });
                }

                if (isSelfAssigned && window.GAS_URL) {
                    await fetch(window.GAS_URL, {
                        method: 'POST',
                        redirect: "follow",
                        headers: { "Content-Type": "text/plain;charset=utf-8" },
                        body: JSON.stringify({
                            action: 'notifyDelegationSelfConfirmation',
                            sektor: targetSektor,
                            unit: targetUnit,
                            delegasiEmail: selfDelegationEmail,
                            delegasiNama: actualDelegasiNama,
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

        if (window.CacheService) await window.CacheService.clearStore('memo_rekod');

        updateTppdBatchProgressUI(totalJobs, totalJobs, "Penugasan Selesai.");
        loadManagerMemo();

        allRecords = []; 

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