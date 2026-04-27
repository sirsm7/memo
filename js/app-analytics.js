/**
 * ==============================================================================
 * SISTEM PENGURUSAN MEMO@AG
 * Modul: js/app-analytics.js
 * Tujuan: Dashboard analisis, KPI, jadual rekod, filter dinamik dan eksport Excel.
 * ==============================================================================
 */

async function loadDashboardData() {
    const tBody = document.getElementById('tableBody');
    if (allRecords.length > 0) {
        renderTable(allRecords);
        populateAnalisisFilters(allRecords);
        return;
    }

    tBody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-500"><div class="loader mr-2"></div> Memuat turun rekod pelayan...</td></tr>`;

    try {
        const { data, error } = await _supabase.from('memo_rekod').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        
        allRecords = data;
        currentFilteredRecords = data;
        calculateKPIs(data);
        renderTable(data);
        populateAnalisisFilters(data);
    } catch (err) {
        tBody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-red-500">Gagal mengambil rekod: ${err.message}</td></tr>`;
    }
}

function calculateKPIs(data) {
    document.getElementById('kpiTotal').textContent = data.length;
    
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    const todayCount = data.filter(r => r.tarikh_terima && r.tarikh_terima === todayStr).length;
    document.getElementById('kpiToday').textContent = todayCount;

    // ── SURGICAL EDIT START: KEMASKINI_LOGIK_IS_MENUNGGU_KPI ──
    // KIRAAN KPI BAHARU: Mengesan status melalui ketiadaan ID atau kewujudan prefix 'PENDING_'
    const pendingCount = data.filter(r => window.isManagerRole && window.isManagerRole(r.unit) && (!r.calendar_event_id || r.calendar_event_id.startsWith('PENDING_'))).length;
    const kpiPendingEl = document.getElementById('kpiPending');
    if (kpiPendingEl) kpiPendingEl.textContent = pendingCount;
    // ── SURGICAL EDIT END ──

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

    const genOptions = (set, defaultText, formatFn = (val) => val) => {
        let html = `<option value="">${defaultText}</option>`;
        Array.from(set).sort().forEach(val => {
            html += `<option value="${val}">${formatFn(val)}</option>`;
        });
        return html;
    };

    const currentStatus = fStatus ? fStatus.value : "";
    const currentSektor = fSektor.value;
    const currentUnit = fUnit.value;
    const currentBulan = fBulan.value;
    const currentTarikh = fTarikh.value;

    fSektor.innerHTML = genOptions(setSektor, "Semua Sektor", (v) => v.replace(/^\d{2}\s/, ''));
    fUnit.innerHTML = genOptions(setUnit, "Semua Unit");
    fBulan.innerHTML = genOptions(setBulan, "Semua Bulan", (v) => { const p = v.split('-'); return `${p[1]}/${p[0]}`; });
    fTarikh.innerHTML = genOptions(setTarikh, "Semua Tarikh", (v) => { const p = v.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v; });

    if (fStatus && currentStatus) fStatus.value = currentStatus;
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
        tBody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-500">Tiada rekod dijumpai berdasarkan tapisan.</td></tr>`;
        return;
    }

    dataArray.forEach((row, index) => {
        const bilAuto = index + 1;
        const tarikhTerimaStr = formatDt(row.tarikh_terima);
        const tarikhSuratStr = formatDt(row.tarikh_surat);
        
        // ── SURGICAL EDIT START: KEMASKINI_LOGIK_IS_MENUNGGU_TABLE ──
        // Penentuan Lencana Status Tindakan (PINDAAN BAHARU: Membaca prefix 'PENDING_')
        const isMenunggu = window.isManagerRole ? (window.isManagerRole(row.unit) && (!row.calendar_event_id || row.calendar_event_id.startsWith('PENDING_'))) : false;
        // ── SURGICAL EDIT END ──

        const statusBadge = isMenunggu
            ? `<span class="inline-flex items-center px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded border border-amber-200 shadow-sm whitespace-nowrap"><svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Menunggu Pengurusan</span>`
            : `<span class="inline-flex items-center px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded border border-emerald-200 shadow-sm whitespace-nowrap"><svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Selesai Diagih</span>`;
        
        // Logik Butang Edit Khusus Perakam & Admin (Kemas kini bertepatan saiz ruang)
        const sessionStr = sessionStorage.getItem('memo_admin_session');
        const adminData = sessionStr ? JSON.parse(sessionStr) : null;
        const canEdit = adminData && (adminData.isSystemAdmin || adminData.isPerakam);
        
        let editBtnHtml = '';
        if (canEdit) {
            editBtnHtml = `
                <button onclick="editMemo(${row.id})" class="inline-flex items-center mt-1 px-2 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold rounded border border-amber-200 shadow-sm hover:bg-amber-100 transition-colors w-full justify-center">
                    <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> Edit
                </button>
            `;
        }

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
                ${statusBadge}
            </td>
            <td class="p-2 align-top text-center">
                <div class="flex flex-col gap-1 items-center">
                    ${row.file_url ? 
                    `<a href="${row.file_url}" target="_blank" class="inline-flex items-center px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded border border-indigo-100 hover:bg-indigo-100 transition-colors w-full justify-center">
                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg> Buka
                    </a>` : 
                    `<span class="text-[10px] text-slate-400">Tiada Fail</span>`}
                    ${editBtnHtml}
                </div>
            </td>
        `;
        tBody.appendChild(tr);
    });
}

// ── SURGICAL EDIT START: LAKSANAKAN_FILTER_DINAMIK ──
function filterTable() {
    const query = document.getElementById('searchInput')?.value.toLowerCase() || "";
    const vStatus = document.getElementById('filterStatus')?.value || "";
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

        let statusMatch = true;
        if (vStatus !== "") {
            const isMenunggu = window.isManagerRole ? (window.isManagerRole(r.unit) && (!r.calendar_event_id || r.calendar_event_id.startsWith('PENDING_'))) : false;
            if (vStatus === "MENUNGGU") statusMatch = isMenunggu;
            if (vStatus === "SELESAI") statusMatch = !isMenunggu;
        }

        return textMatch && sektorMatch && unitMatch && bulanMatch && tarikhMatch && statusMatch;
    });

    currentFilteredRecords = filtered;
    renderTable(filtered);
    
    // Panggilan Reaktiviti KPI: Kad dikemaskini mengikut rekod yang ditapis
    calculateKPIs(filtered);
    
    // Panggilan Reaktiviti Filter: Rombakan logik untuk menyokong rantaian penuh
    updateCascadingFilters();
}

function updateCascadingFilters() {
    const fUnit = document.getElementById('filterUnit');
    const fBulan = document.getElementById('filterBulan');
    const fTarikh = document.getElementById('filterTarikh');

    if (!fUnit || !fBulan || !fTarikh) return;

    // Ambil status (value) terkini dari semua dropdown untuk disilang-semak
    const vStatus = document.getElementById('filterStatus')?.value || "";
    const vSektor = document.getElementById('filterSektor')?.value || "";
    const vUnit = fUnit.value;
    const vBulan = fBulan.value;
    const vTarikh = fTarikh.value;

    const setUnit = new Set();
    const setBulan = new Set();
    const setTarikh = new Set();

    // Lelaran (Iteration) menyeluruh: Menyaring pilihan yang patut wujud sahaja
    allRecords.forEach(r => {
        let isMenunggu = false;
        if (window.isManagerRole) {
            isMenunggu = window.isManagerRole(r.unit) && (!r.calendar_event_id || r.calendar_event_id.startsWith('PENDING_'));
        }
        
        const matchStatus = vStatus === "" || (vStatus === "MENUNGGU" ? isMenunggu : !isMenunggu);
        const matchSektor = vSektor === "" || r.sektor === vSektor;
        const matchUnit = vUnit === "" || r.unit === vUnit;
        
        let bVal = "";
        if (r.tarikh_terima) {
            const parts = r.tarikh_terima.split('-');
            if (parts.length >= 2) bVal = `${parts[0]}-${parts[1]}`;
        }
        const matchBulan = vBulan === "" || bVal === vBulan;
        const matchTarikh = vTarikh === "" || r.tarikh_terima === vTarikh;

        // Penapis Unit terikat kepada Status, Sektor, Bulan, dan Tarikh
        if (matchStatus && matchSektor && matchBulan && matchTarikh) {
            if (r.unit) setUnit.add(r.unit);
        }

        // Penapis Bulan terikat kepada Status, Sektor, dan Unit
        if (matchStatus && matchSektor && matchUnit) {
            if (bVal) setBulan.add(bVal);
        }

        // Penapis Tarikh terikat kepada Status, Sektor, Unit, dan Bulan
        if (matchStatus && matchSektor && matchUnit && matchBulan) {
            if (r.tarikh_terima) setTarikh.add(r.tarikh_terima);
        }
    });

    const genOptions = (set, defaultText, formatFn = (val) => val) => {
        let html = `<option value="">${defaultText}</option>`;
        Array.from(set).sort().forEach(val => {
            html += `<option value="${val}">${formatFn(val)}</option>`;
        });
        return html;
    };

    // Muat turun (Render) pilihan baharu ke dalam elemen <select>
    fUnit.innerHTML = genOptions(setUnit, "Semua Unit");
    fBulan.innerHTML = genOptions(setBulan, "Semua Bulan", (v) => { const p = v.split('-'); return `${p[1]}/${p[0]}`; });
    fTarikh.innerHTML = genOptions(setTarikh, "Semua Tarikh", (v) => { const p = v.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v; });

    // Pelihara semula nilai (value) yang telah dipilih jika ia masih sah (valid)
    if (Array.from(setUnit).includes(vUnit)) fUnit.value = vUnit;
    if (Array.from(setBulan).includes(vBulan)) fBulan.value = vBulan;
    if (Array.from(setTarikh).includes(vTarikh)) fTarikh.value = vTarikh;
}

function resetAnalisisFilters() {
    if(document.getElementById('searchInput')) document.getElementById('searchInput').value = "";
    if(document.getElementById('filterStatus')) document.getElementById('filterStatus').value = "";
    if(document.getElementById('filterSektor')) document.getElementById('filterSektor').value = "";
    if(document.getElementById('filterUnit')) document.getElementById('filterUnit').value = "";
    if(document.getElementById('filterBulan')) document.getElementById('filterBulan').value = "";
    if(document.getElementById('filterTarikh')) document.getElementById('filterTarikh').value = "";
    
    // Set semula semua pilihan filter kepada asalnya
    populateAnalisisFilters(allRecords);
    filterTable();
}
// ── SURGICAL EDIT END ──

// ================= FUNGSI EKSPORT EXCEL =================
window.exportToExcel = function() {
    if (!currentFilteredRecords || currentFilteredRecords.length === 0) {
        return window.showMessage("Tiada rekod sedia ada untuk dieksport.", "error");
    }

    try {
        const exportData = currentFilteredRecords.map((row, index) => {
            // ── SURGICAL EDIT START: KEMASKINI_LOGIK_IS_MENUNGGU_EKSPORT ──
            const isMenunggu = window.isManagerRole ? (window.isManagerRole(row.unit) && (!row.calendar_event_id || row.calendar_event_id.startsWith('PENDING_'))) : false;
            const statusTxt = isMenunggu ? 'Menunggu Tindakan Pengurusan' : 'Selesai Diagihkan';
            // ── SURGICAL EDIT END ──

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
        // Telah ditambah {wch: 25} untuk menampung kolum 'Status Tindakan'
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
