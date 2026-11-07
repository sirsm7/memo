let analyticsCurrentPage = 1;
const ANALYTICS_PAGE_SIZE = 20;

function loadDashboardData() {
    const tBody = document.getElementById('tableBody');

    if (typeof allRecords !== 'undefined' && allRecords.length === 0 && tBody) {
        tBody.textContent = '';
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 10;
        td.className = 'p-8 text-center text-slate-500';

        const loader = document.createElement('div');
        loader.className = 'loader mr-2 border-slate-300 border-top-slate-500';
        const txt = document.createTextNode(' Memuat turun rekod...');

        td.appendChild(loader);
        td.appendChild(txt);
        tr.appendChild(td);
        tBody.appendChild(tr);
    }

    if (!window.CacheService) {
        if (tBody) {
            tBody.textContent = '';
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 10;
            td.className = 'p-8 text-center text-red-500';
            td.textContent = 'Gagal memuatkan Cache Service.';
            tr.appendChild(td);
            tBody.appendChild(tr);
        }
        return;
    }

    window.CacheService.fetchSWR('memo_rekod', 'created_at', false, (data) => {
        if (!data) return;

        allRecords = data;
        populateAnalisisFilters(allRecords);
        filterTable();
    });
}

function calculateKPIs(data) {
    const elTotal = document.getElementById('kpiTotal');
    if (elTotal) elTotal.textContent = data.length;

    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

    const todayCount = data.filter(r => r.tarikh_terima && r.tarikh_terima === todayStr).length;
    const elToday = document.getElementById('kpiToday');
    if (elToday) elToday.textContent = todayCount;

    let totalPending = 0;
    let pendingTppd = 0;
    let pendingKS = 0;
    let pendingKU = 0;

    data.forEach(r => {
        if (window.isManagerRole && window.isManagerRole(r.unit) && (!r.calendar_event_id || r.calendar_event_id.startsWith('PENDING_'))) {
            totalPending++;

            const unitName = (r.unit || '').toUpperCase();
            if (unitName === 'TPPD') {
                pendingTppd++;
            } else if (unitName === 'KETUA SEKTOR') {
                pendingKS++;
            } else if (unitName.startsWith('KETUA UNIT')) {
                pendingKU++;
            }
        }
    });

    const kpiPendingEl = document.getElementById('kpiPending');
    if (kpiPendingEl) kpiPendingEl.textContent = totalPending;

    const elTppd = document.getElementById('kpiPendingTppd');
    const elKS = document.getElementById('kpiPendingKS');
    const elKU = document.getElementById('kpiPendingKU');

    if (elTppd) elTppd.textContent = pendingTppd;
    if (elKS) elKS.textContent = pendingKS;
    if (elKU) elKU.textContent = pendingKU;

    const sektorCounts = {};
    data.forEach(r => {
        if (r.sektor) {
            sektorCounts[r.sektor] = (sektorCounts[r.sektor] || 0) + 1;
        }
    });

    let topSektor = '-';
    let maxCount = 0;
    for (const s in sektorCounts) {
        if (sektorCounts[s] > maxCount) {
            maxCount = sektorCounts[s];
            topSektor = s.replace(/^\d{2}\s/, '');
        }
    }
    const elTopSektor = document.getElementById('kpiTopSektor');
    if (elTopSektor) elTopSektor.textContent = topSektor;
}

function populateAnalisisFilters(data) {
    const fStatus = document.getElementById('filterStatus');
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

    const populateSelect = (selectElem, itemsSet, defaultText, formatFn = (val) => val) => {
        const curVal = selectElem.value;
        selectElem.textContent = '';
        const defOpt = document.createElement('option');
        defOpt.value = '';
        defOpt.textContent = defaultText;
        selectElem.appendChild(defOpt);

        Array.from(itemsSet).sort().forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = formatFn(val);
            selectElem.appendChild(opt);
        });

        if (Array.from(itemsSet).includes(curVal)) {
            selectElem.value = curVal;
        }
    };

    const currentStatus = fStatus ? fStatus.value : '';

    populateSelect(fSektor, setSektor, 'Semua Sektor', (v) => v.replace(/^\d{2}\s/, ''));
    populateSelect(fUnit, setUnit, 'Semua Unit');
    populateSelect(fBulan, setBulan, 'Semua Bulan Penerimaan', (v) => {
        const p = v.split('-');
        return `${p[1]}/${p[0]}`;
    });
    populateSelect(fTarikh, setTarikh, 'Semua Tarikh Penerimaan', (v) => {
        const p = v.split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v;
    });

    if (fStatus && currentStatus) fStatus.value = currentStatus;
}

const formatDt = (dateStr) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
};

function renderTable(dataArray) {
    const tBody = document.getElementById('tableBody');
    if (!tBody) return;
    tBody.textContent = '';

    if (!dataArray || dataArray.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 10;
        td.className = 'p-8 text-center text-slate-500';
        td.textContent = 'Tiada rekod dijumpai berdasarkan tapisan.';
        tr.appendChild(td);
        tBody.appendChild(tr);
        renderAnalyticsPagination(0);
        return;
    }

    const totalRecords = dataArray.length;
    const totalPages = Math.ceil(totalRecords / ANALYTICS_PAGE_SIZE) || 1;

    if (analyticsCurrentPage > totalPages) analyticsCurrentPage = totalPages;
    if (analyticsCurrentPage < 1) analyticsCurrentPage = 1;

    const startIndex = (analyticsCurrentPage - 1) * ANALYTICS_PAGE_SIZE;
    const pageRecords = dataArray.slice(startIndex, startIndex + ANALYTICS_PAGE_SIZE);

    const sessionStr = sessionStorage.getItem('memo_admin_session');
    const adminData = sessionStr ? JSON.parse(sessionStr) : null;
    const canEdit = adminData && (adminData.isSystemAdmin || adminData.isPerakam);

    const fragment = document.createDocumentFragment();

    pageRecords.forEach((row, index) => {
        const bilAuto = startIndex + index + 1;
        const tarikhTerimaStr = formatDt(row.tarikh_terima);
        const tarikhSuratStr = formatDt(row.tarikh_surat);

        const isMenunggu = window.isManagerRole ? (window.isManagerRole(row.unit) && (!row.calendar_event_id || row.calendar_event_id.startsWith('PENDING_'))) : false;

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-indigo-50/30 transition-colors';

        const tdBil = document.createElement('td');
        tdBil.className = 'p-2 align-top text-center';
        const spanBil = document.createElement('span');
        spanBil.className = 'inline-block w-6 h-6 bg-slate-100 text-slate-600 font-bold rounded-full text-[11px] leading-6';
        spanBil.textContent = bilAuto;
        tdBil.appendChild(spanBil);
        tr.appendChild(tdBil);

        const tdTarikhTerima = document.createElement('td');
        tdTarikhTerima.className = 'p-2 align-top';
        const divTarikhTerima = document.createElement('div');
        divTarikhTerima.className = 'font-bold text-slate-700 text-xs';
        divTarikhTerima.textContent = tarikhTerimaStr;
        const divMasa = document.createElement('div');
        divMasa.className = 'text-[10px] font-semibold text-indigo-600 mt-1';
        divMasa.textContent = row.masa_rekod || '-';
        tdTarikhTerima.appendChild(divTarikhTerima);
        tdTarikhTerima.appendChild(divMasa);
        tr.appendChild(tdTarikhTerima);

        const tdNoRuj = document.createElement('td');
        tdNoRuj.className = 'p-2 align-top';
        const divNoRuj = document.createElement('div');
        divNoRuj.className = 'text-xs font-bold text-slate-800 break-words whitespace-normal uppercase';
        divNoRuj.textContent = row.no_rujukan || '-';
        tdNoRuj.appendChild(divNoRuj);
        tr.appendChild(tdNoRuj);

        const tdNoTambahan = document.createElement('td');
        tdNoTambahan.className = 'p-2 align-top';
        const divNoTambahan = document.createElement('div');
        divNoTambahan.className = 'text-xs font-semibold text-slate-600 break-words whitespace-normal uppercase';
        divNoTambahan.textContent = row.no_tambahan || '-';
        tdNoTambahan.appendChild(divNoTambahan);
        tr.appendChild(tdNoTambahan);

        const tdTarikhSurat = document.createElement('td');
        tdTarikhSurat.className = 'p-2 align-top';
        const divTarikhSurat = document.createElement('div');
        divTarikhSurat.className = 'font-bold text-slate-700 text-xs';
        divTarikhSurat.textContent = tarikhSuratStr;
        tdTarikhSurat.appendChild(divTarikhSurat);
        tr.appendChild(tdTarikhSurat);

        const tdDari = document.createElement('td');
        tdDari.className = 'p-2 align-top';
        const divDari = document.createElement('div');
        divDari.className = 'text-[11px] font-bold text-slate-800 break-words whitespace-normal uppercase';
        divDari.textContent = row.dari || '-';
        tdDari.appendChild(divDari);
        tr.appendChild(tdDari);

        const tdTajuk = document.createElement('td');
        tdTajuk.className = 'p-2 align-top';
        const divTajuk = document.createElement('div');
        divTajuk.className = 'text-[11px] font-bold text-indigo-700 break-words whitespace-normal uppercase';
        divTajuk.textContent = row.tajuk_program || '-';
        tdTajuk.appendChild(divTajuk);
        tr.appendChild(tdTajuk);

        const tdPenerima = document.createElement('td');
        tdPenerima.className = 'p-2 align-top';
        const divSektor = document.createElement('div');
        divSektor.className = 'text-[10px] font-bold text-slate-800 break-words whitespace-normal bg-indigo-50 px-1.5 py-0.5 rounded inline-block mb-1';
        divSektor.textContent = (row.sektor || '').replace(/^\d{2}\s/, '');
        const divNamaPenerima = document.createElement('div');
        divNamaPenerima.className = 'text-[10px] text-slate-600 break-words whitespace-normal leading-relaxed italic border-l-2 border-indigo-200 pl-1.5 mt-1';
        divNamaPenerima.title = row.nama_penerima || '';
        divNamaPenerima.textContent = row.nama_penerima || '-';
        tdPenerima.appendChild(divSektor);
        tdPenerima.appendChild(divNamaPenerima);
        tr.appendChild(tdPenerima);

        const tdStatus = document.createElement('td');
        tdStatus.className = 'p-2 align-top text-center';
        const spanStatus = document.createElement('span');
        if (isMenunggu) {
            spanStatus.className = 'inline-flex items-center px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded border border-amber-200 shadow-sm whitespace-nowrap';
            spanStatus.innerHTML = '<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Menunggu Pengurusan';
        } else {
            spanStatus.className = 'inline-flex items-center px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded border border-emerald-200 shadow-sm whitespace-nowrap';
            spanStatus.innerHTML = '<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Selesai Diagih';
        }
        tdStatus.appendChild(spanStatus);
        tr.appendChild(tdStatus);

        const tdAksi = document.createElement('td');
        tdAksi.className = 'p-2 align-top text-center';
        const divAksi = document.createElement('div');
        divAksi.className = 'flex flex-col gap-1 items-center';

        if (row.file_url) {
            const aFail = document.createElement('a');
            aFail.href = row.file_url;
            aFail.target = '_blank';
            aFail.rel = 'noopener noreferrer';
            aFail.className = 'inline-flex items-center px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded border border-indigo-100 hover:bg-indigo-100 transition-colors w-full justify-center';
            aFail.innerHTML = '<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg> Buka';
            divAksi.appendChild(aFail);
        } else {
            const spanNoFail = document.createElement('span');
            spanNoFail.className = 'text-[10px] text-slate-400';
            spanNoFail.textContent = 'Tiada Fail';
            divAksi.appendChild(spanNoFail);
        }

        if (canEdit) {
            const btnEdit = document.createElement('button');
            btnEdit.type = 'button';
            btnEdit.className = 'inline-flex items-center mt-1 px-2 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold rounded border border-amber-200 shadow-sm hover:bg-amber-100 transition-colors w-full justify-center';
            btnEdit.innerHTML = '<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> Edit';
            btnEdit.addEventListener('click', () => {
                if (typeof window.editMemo === 'function') {
                    window.editMemo(row.id);
                }
            });

            const btnDelete = document.createElement('button');
            btnDelete.type = 'button';
            btnDelete.className = 'inline-flex items-center mt-1 px-2 py-1 bg-red-50 text-red-600 text-[10px] font-bold rounded border border-red-200 shadow-sm hover:bg-red-100 transition-colors w-full justify-center';
            btnDelete.innerHTML = '<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg> Padam';
            btnDelete.addEventListener('click', () => {
                if (typeof window.deleteMemo === 'function') {
                    window.deleteMemo(row.id);
                }
            });

            divAksi.appendChild(btnEdit);
            divAksi.appendChild(btnDelete);
        }

        tdAksi.appendChild(divAksi);
        tr.appendChild(tdAksi);

        fragment.appendChild(tr);
    });

    tBody.appendChild(fragment);
    renderAnalyticsPagination(totalRecords);
}

function renderAnalyticsPagination(totalRecords) {
    let container = document.getElementById('analyticsPagination');

    if (!container) {
        const tableBody = document.getElementById('tableBody');
        const scrollContainer = tableBody ? tableBody.closest('.overflow-x-auto') : null;
        if (scrollContainer && scrollContainer.parentNode) {
            container = document.createElement('div');
            container.id = 'analyticsPagination';
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

    const totalPages = Math.ceil(totalRecords / ANALYTICS_PAGE_SIZE) || 1;
    const startRecord = (analyticsCurrentPage - 1) * ANALYTICS_PAGE_SIZE + 1;
    const endRecord = Math.min(analyticsCurrentPage * ANALYTICS_PAGE_SIZE, totalRecords);

    const isPrevDisabled = analyticsCurrentPage <= 1;
    const isNextDisabled = analyticsCurrentPage >= totalPages;

    container.textContent = '';

    const textDiv = document.createElement('div');
    textDiv.className = 'text-slate-500 font-medium text-center sm:text-left';
    textDiv.innerHTML = `Menunjukkan <span class="font-bold text-slate-700">${startRecord}</span> - <span class="font-bold text-slate-700">${endRecord}</span> daripada <span class="font-bold text-slate-700">${totalRecords}</span> rekod (Halaman <span class="font-bold text-indigo-600">${analyticsCurrentPage}</span>/${totalPages})`;

    const btnsDiv = document.createElement('div');
    btnsDiv.className = 'flex items-center space-x-2';

    const btnPrev = document.createElement('button');
    btnPrev.type = 'button';
    btnPrev.className = 'px-3 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 bg-white hover:bg-slate-100 transition-colors flex items-center shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white';
    btnPrev.disabled = isPrevDisabled;
    btnPrev.innerHTML = '<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg> Sebelumnya';
    btnPrev.addEventListener('click', () => window.changeAnalyticsPage(analyticsCurrentPage - 1));

    const btnNext = document.createElement('button');
    btnNext.type = 'button';
    btnNext.className = 'px-3 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 bg-white hover:bg-slate-100 transition-colors flex items-center shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white';
    btnNext.disabled = isNextDisabled;
    btnNext.innerHTML = 'Seterusnya <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>';
    btnNext.addEventListener('click', () => window.changeAnalyticsPage(analyticsCurrentPage + 1));

    btnsDiv.appendChild(btnPrev);
    btnsDiv.appendChild(btnNext);

    container.appendChild(textDiv);
    container.appendChild(btnsDiv);
}

window.changeAnalyticsPage = function(targetPage) {
    const totalPages = Math.ceil(currentFilteredRecords.length / ANALYTICS_PAGE_SIZE) || 1;
    if (targetPage < 1 || targetPage > totalPages) return;
    analyticsCurrentPage = targetPage;
    renderTable(currentFilteredRecords);

    const tableBody = document.getElementById('tableBody');
    if (tableBody) {
        const scrollContainer = tableBody.closest('.overflow-x-auto');
        if (scrollContainer) scrollContainer.scrollTop = 0;
    }
};

function filterTable() {
    const query = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const vStatus = document.getElementById('filterStatus')?.value || '';
    const vSektor = document.getElementById('filterSektor')?.value || '';
    const vUnit = document.getElementById('filterUnit')?.value || '';
    const vBulan = document.getElementById('filterBulan')?.value || '';
    const vTarikh = document.getElementById('filterTarikh')?.value || '';

    const filtered = allRecords.filter(r => {
        const textMatch =
            (r.no_rujukan && r.no_rujukan.toLowerCase().includes(query)) ||
            (r.no_tambahan && r.no_tambahan.toLowerCase().includes(query)) ||
            (r.dari && r.dari.toLowerCase().includes(query)) ||
            (r.tajuk_program && r.tajuk_program.toLowerCase().includes(query)) ||
            (r.nama_penerima && r.nama_penerima.toLowerCase().includes(query)) ||
            (r.sektor && r.sektor.toLowerCase().includes(query));

        const sektorMatch = vSektor === '' || r.sektor === vSektor;
        const unitMatch = vUnit === '' || r.unit === vUnit;
        const tarikhMatch = vTarikh === '' || r.tarikh_terima === vTarikh;

        let bulanMatch = true;
        if (vBulan !== '') bulanMatch = r.tarikh_terima && r.tarikh_terima.startsWith(vBulan);

        let statusMatch = true;
        if (vStatus !== '') {
            const isMenunggu = window.isManagerRole ? (window.isManagerRole(r.unit) && (!r.calendar_event_id || r.calendar_event_id.startsWith('PENDING_'))) : false;
            if (vStatus === 'MENUNGGU') statusMatch = isMenunggu;
            if (vStatus === 'SELESAI') statusMatch = !isMenunggu;
        }

        return textMatch && sektorMatch && unitMatch && bulanMatch && tarikhMatch && statusMatch;
    });

    currentFilteredRecords = filtered;
    analyticsCurrentPage = 1;
    renderTable(filtered);
    calculateKPIs(filtered);
    updateCascadingFilters();
}

function updateCascadingFilters() {
    const fUnit = document.getElementById('filterUnit');
    const fBulan = document.getElementById('filterBulan');
    const fTarikh = document.getElementById('filterTarikh');

    if (!fUnit || !fBulan || !fTarikh) return;

    const vStatus = document.getElementById('filterStatus')?.value || '';
    const vSektor = document.getElementById('filterSektor')?.value || '';
    const vUnit = fUnit.value;
    const vBulan = fBulan.value;
    const vTarikh = fTarikh.value;

    const setUnit = new Set();
    const setBulan = new Set();
    const setTarikh = new Set();

    allRecords.forEach(r => {
        let isMenunggu = false;
        if (window.isManagerRole) {
            isMenunggu = window.isManagerRole(r.unit) && (!r.calendar_event_id || r.calendar_event_id.startsWith('PENDING_'));
        }

        const matchStatus = vStatus === '' || (vStatus === 'MENUNGGU' ? isMenunggu : !isMenunggu);
        const matchSektor = vSektor === '' || r.sektor === vSektor;
        const matchUnit = vUnit === '' || r.unit === vUnit;

        let bVal = '';
        if (r.tarikh_terima) {
            const parts = r.tarikh_terima.split('-');
            if (parts.length >= 2) bVal = `${parts[0]}-${parts[1]}`;
        }
        const matchBulan = vBulan === '' || bVal === vBulan;
        const matchTarikh = vTarikh === '' || r.tarikh_terima === vTarikh;

        if (matchStatus && matchSektor && matchBulan && matchTarikh) {
            if (r.unit) setUnit.add(r.unit);
        }

        if (matchStatus && matchSektor && matchUnit) {
            if (bVal) setBulan.add(bVal);
        }

        if (matchStatus && matchSektor && matchUnit && matchBulan) {
            if (r.tarikh_terima) setTarikh.add(r.tarikh_terima);
        }
    });

    const populateSelect = (selectElem, itemsSet, defaultText, formatFn = (val) => val) => {
        const curVal = selectElem.value;
        selectElem.textContent = '';
        const defOpt = document.createElement('option');
        defOpt.value = '';
        defOpt.textContent = defaultText;
        selectElem.appendChild(defOpt);

        Array.from(itemsSet).sort().forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = formatFn(val);
            selectElem.appendChild(opt);
        });

        if (Array.from(itemsSet).includes(curVal)) {
            selectElem.value = curVal;
        }
    };

    populateSelect(fUnit, setUnit, 'Semua Unit');
    populateSelect(fBulan, setBulan, 'Semua Bulan Penerimaan', (v) => {
        const p = v.split('-');
        return `${p[1]}/${p[0]}`;
    });
    populateSelect(fTarikh, setTarikh, 'Semua Tarikh Penerimaan', (v) => {
        const p = v.split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v;
    });

    if (Array.from(setUnit).includes(vUnit)) fUnit.value = vUnit;
    if (Array.from(setBulan).includes(vBulan)) fBulan.value = vBulan;
    if (Array.from(setTarikh).includes(vTarikh)) fTarikh.value = vTarikh;
}

function resetAnalisisFilters() {
    if (document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
    if (document.getElementById('filterStatus')) document.getElementById('filterStatus').value = '';
    if (document.getElementById('filterSektor')) document.getElementById('filterSektor').value = '';
    if (document.getElementById('filterUnit')) document.getElementById('filterUnit').value = '';
    if (document.getElementById('filterBulan')) document.getElementById('filterBulan').value = '';
    if (document.getElementById('filterTarikh')) document.getElementById('filterTarikh').value = '';

    analyticsCurrentPage = 1;
    populateAnalisisFilters(allRecords);
    filterTable();
}

window.handleAnalyticsRealtimeUpdate = function(payload) {
    if (!payload || !payload.eventType) return;

    if (payload.eventType === 'INSERT' && payload.new) {
        const exists = allRecords.some(r => r.id === payload.new.id);
        if (!exists) {
            allRecords.unshift(payload.new);
        }
    } else if (payload.eventType === 'UPDATE' && payload.new) {
        const idx = allRecords.findIndex(r => r.id === payload.new.id);
        if (idx !== -1) {
            allRecords[idx] = payload.new;
        } else {
            allRecords.unshift(payload.new);
        }
    } else if (payload.eventType === 'DELETE') {
        const targetId = payload.old ? payload.old.id : payload.id;
        if (targetId) {
            allRecords = allRecords.filter(r => r.id !== targetId);
        }
    }

    populateAnalisisFilters(allRecords);

    const query = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const vStatus = document.getElementById('filterStatus')?.value || '';
    const vSektor = document.getElementById('filterSektor')?.value || '';
    const vUnit = document.getElementById('filterUnit')?.value || '';
    const vBulan = document.getElementById('filterBulan')?.value || '';
    const vTarikh = document.getElementById('filterTarikh')?.value || '';

    currentFilteredRecords = allRecords.filter(r => {
        const textMatch =
            (r.no_rujukan && r.no_rujukan.toLowerCase().includes(query)) ||
            (r.no_tambahan && r.no_tambahan.toLowerCase().includes(query)) ||
            (r.dari && r.dari.toLowerCase().includes(query)) ||
            (r.tajuk_program && r.tajuk_program.toLowerCase().includes(query)) ||
            (r.nama_penerima && r.nama_penerima.toLowerCase().includes(query)) ||
            (r.sektor && r.sektor.toLowerCase().includes(query));

        const sektorMatch = vSektor === '' || r.sektor === vSektor;
        const unitMatch = vUnit === '' || r.unit === vUnit;
        const tarikhMatch = vTarikh === '' || r.tarikh_terima === vTarikh;

        let bulanMatch = true;
        if (vBulan !== '') bulanMatch = r.tarikh_terima && r.tarikh_terima.startsWith(vBulan);

        let statusMatch = true;
        if (vStatus !== '') {
            const isMenunggu = window.isManagerRole ? (window.isManagerRole(r.unit) && (!r.calendar_event_id || r.calendar_event_id.startsWith('PENDING_'))) : false;
            if (vStatus === 'MENUNGGU') statusMatch = isMenunggu;
            if (vStatus === 'SELESAI') statusMatch = !isMenunggu;
        }

        return textMatch && sektorMatch && unitMatch && bulanMatch && tarikhMatch && statusMatch;
    });

    renderTable(currentFilteredRecords);
    calculateKPIs(currentFilteredRecords);
    updateCascadingFilters();
};

window.exportToExcel = function() {
    if (!currentFilteredRecords || currentFilteredRecords.length === 0) {
        return window.showMessage("Tiada rekod sedia ada untuk dieksport.", "error");
    }

    try {
        const exportData = currentFilteredRecords.map((row, index) => {
            const isMenunggu = window.isManagerRole ? (window.isManagerRole(row.unit) && (!row.calendar_event_id || row.calendar_event_id.startsWith('PENDING_'))) : false;
            const statusTxt = isMenunggu ? 'Menunggu Tindakan Pengurusan' : 'Selesai Diagihkan';

            return {
                "Bil": index + 1,
                "Tarikh Penerimaan": formatDt(row.tarikh_terima),
                "No.Fail Kementerian Ibu Pejabat": row.no_rujukan || '-',
                "Nombor-Nombor Yang Lain": row.no_tambahan || '-',
                "Tarikh Surat": formatDt(row.tarikh_surat),
                "Daripada Siapa": row.dari || '-',
                "Perkara": row.tajuk_program || '-',
                "Dirujukkan Kepada (Penerima)": row.nama_penerima || '-',
                "Sektor Utama": row.sektor || '-',
                "Status Tindakan": statusTxt,
                "Masa Rekod": row.masa_rekod || '-',
                "Pautan Salinan Dokumen": row.file_url || 'Tiada Fail Disertakan'
            };
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wscols = [
            {wch: 5}, {wch: 18}, {wch: 35}, {wch: 25}, {wch: 15},
            {wch: 35}, {wch: 45}, {wch: 50}, {wch: 30}, {wch: 25}, {wch: 12}, {wch: 60}
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