/**
 * ==============================================================================
 * SISTEM PENGURUSAN MEMO@AG
 * Modul: js/admin-calendar.js
 * Tujuan: Tindakan kalendar individu, pemadaman memo, batch sync/delete kalendar,
 *         progress UI dan refresh iframe kalendar.
 * ==============================================================================
 */

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

        // Pastikan kita gunakan fungsi kalendar secara paksa di peringkat Admin
        const res = await fetch(GAS_URL, {
            method: 'POST',
            redirect: "follow",
            headers: {
                "Content-Type": "text/plain;charset=utf-8",
            },
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

        if (notify.status === 'success' && notify.calendarEventId) {
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

// Menggunakan SweetAlert2 Promise untuk Pengesahan
window.removeSingleCalendar = function(id) {
    if (isProcessingBatch) return window.showMessage("Sistem sedang memproses pukal.", "error");

    const m = adminMemoData.find(x => x.id === id);
    if (!m || !m.calendar_event_id) return;

    Swal.fire({
        title: 'Pengesahan',
        text: "Padam acara ini dari Google Kalendar? Data di dalam sistem akan dikekalkan.",
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
                setProcessingState(true, `Memadam rekod kalendar #${id}...`);

                const res = await fetch(GAS_URL, {
                    method: 'POST',
                    redirect: "follow",
                    headers: {
                        "Content-Type": "text/plain;charset=utf-8",
                    },
                    body: JSON.stringify({ action: 'deleteEvent', eventId: m.calendar_event_id })
                });
                const responseJSON = await res.json();

                // Sama ada berjaya atau "not_found", kita putuskan pautan di Supabase
                if (responseJSON.status === 'success' || responseJSON.status === 'not_found') {
                    await _supabase.from('memo_rekod').update({ calendar_event_id: null }).eq('id', id);
                    window.showMessage("Acara kalendar berjaya ditanggalkan.", "success");
                    loadAdminMemo();
                    refreshIframeKalendar();
                } else {
                    throw new Error(responseJSON.message);
                }
            } catch (err) {
                window.showMessage("Ralat Kalendar: " + err.message, "error");
            } finally {
                setProcessingState(false);
            }
        }
    });
}

// ================= TINDAKAN DATA (PADAM KESELURUHAN) =================
// Menggunakan SweetAlert2 Promise untuk Pengesahan
window.deleteMemo = function(id) {
    if (isProcessingBatch) return window.showMessage("Sistem sedang memproses pukal.", "error");

    const m = adminMemoData.find(x => x.id === id);
    if (!m) return;

    const confirmMsg = "AMARAN: Ini akan memadam rekod surat selamanya dari pangkalan data sistem. " +
                       (m.calendar_event_id ? "Acara kalendar berkaitan juga akan turut dipadam. " : "") +
                       "<br><br>Teruskan?";

    Swal.fire({
        title: 'Pengesahan Pemadaman Penuh',
        html: confirmMsg,
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Hapus Kekal',
        cancelButtonText: 'Batal',
        customClass: { popup: 'rounded-2xl', confirmButton: 'text-sm font-bold', cancelButton: 'text-sm font-bold' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                setProcessingState(true, "Memadam data secara menyeluruh...");

                // 1. Padam Kalendar Dahulu Jika Ada
                if (m.calendar_event_id) {
                    try {
                        await fetch(GAS_URL, {
                            method: 'POST',
                            redirect: "follow",
                            headers: {
                                "Content-Type": "text/plain;charset=utf-8",
                            },
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
    });
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

// Menggunakan SweetAlert2 Promise untuk Pengesahan
window.startBatchSync = function() {
    if (isProcessingBatch) return;
    
    // Cari yang belum disegerak
    const queue = adminMemoData.filter(m => !m.calendar_event_id);
    if (queue.length === 0) {
        return window.showMessage("Semua data telah pun disegerakkan ke kalendar.", "success");
    }

    Swal.fire({
        title: 'Operasi Segerak Pukal',
        html: `Sistem mendapati terdapat <b>${queue.length}</b> rekod yang belum disegerakkan ke Kalendar. Proses ini akan menghantar jemputan satu per satu.<br><br>Adakah anda pasti mahu mulakan operasi pukal?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#059669', // Emerald 600
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Mula Segerak',
        cancelButtonText: 'Batal',
        customClass: { popup: 'rounded-2xl', confirmButton: 'text-sm font-bold', cancelButton: 'text-sm font-bold' }
    }).then(async (result) => {
        if (result.isConfirmed) {
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
                        redirect: "follow",
                        headers: {
                            "Content-Type": "text/plain;charset=utf-8",
                        },
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

                    if (notify.status === 'success' && notify.calendarEventId) {
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
            
            window.showMessage(`Operasi Segerak Pukal Tamat.<br>Berjaya: ${successCount}<br>Gagal: ${errorCount}`, "success");
        }
    });
}

// Menggunakan SweetAlert2 Promise untuk Pengesahan
window.startBatchDelete = function() {
    if (isProcessingBatch) return;

    // Cari yang ada kalendar sahaja
    const queue = adminMemoData.filter(m => m.calendar_event_id);
    if (queue.length === 0) {
        return window.showMessage("Tiada rekod kalendar yang dijumpai untuk dipadam.", "success");
    }

    Swal.fire({
        title: 'AMARAN PUKAL',
        html: `Sistem akan <b>MEMADAM ${queue.length} acara</b> di dalam Google Kalendar satu per satu. Data surat di dalam sistem ini akan DIKEKALKAN.<br><br>Adakah anda pasti?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Ya, Padam Pukal',
        cancelButtonText: 'Batal',
        customClass: { popup: 'rounded-2xl', confirmButton: 'text-sm font-bold', cancelButton: 'text-sm font-bold' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            setProcessingState(true);
            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < queue.length; i++) {
                const m = queue[i];
                updateBatchProgressUI(i, queue.length, `Memadam Kalendar ID #${m.id} (${i+1}/${queue.length})...`);

                try {
                    const res = await fetch(GAS_URL, {
                        method: 'POST',
                        redirect: "follow",
                        headers: {
                            "Content-Type": "text/plain;charset=utf-8",
                        },
                        body: JSON.stringify({ action: 'deleteEvent', eventId: m.calendar_event_id })
                    });
                    const responseJSON = await res.json();

                    if (responseJSON.status === 'success' || responseJSON.status === 'not_found') {
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

            window.showMessage(`Operasi Padam Kalendar Pukal Tamat.<br>Berjaya: ${successCount}<br>Gagal: ${errorCount}`, "success");
        }
    });
}

function refreshIframeKalendar() {
    const calFrame = document.getElementById('calendarFrame');
    if (calFrame) calFrame.src = calFrame.src;
}
