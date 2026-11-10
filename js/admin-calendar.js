window.syncSingleCalendar = async function(id) {
  if (typeof isProcessingBatch !== 'undefined' && isProcessingBatch) return window.showMessage("Sistem sedang memproses pukal.", "error");

  const dataMemo = typeof adminMemoData !== 'undefined' ? adminMemoData : [];
  let m = dataMemo.find(x => x.id === id);
  if (!m && typeof allRecords !== 'undefined') {
    m = allRecords.find(x => x.id === id);
  }
  if (!m) return window.showMessage("Ralat pangkalan data: Memo tidak dijumpai.", "error");

  try {
    if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
      await window.appConfigReady;
    }

    const client = window._supabase;
    const gasUrl = window.GAS_URL;
    if (!client || !gasUrl) throw new Error("Konfigurasi pelayan belum sedia.");

    setProcessingState(true, `Menyegerak rekod #${id}...`);

    const names = m.nama_penerima ? m.nama_penerima.split(',').map(n => n.trim()).filter(Boolean) : [];
    const emails = m.emel_penerima ? m.emel_penerima.split(',').map(e => e.trim()).filter(Boolean) : [];

    const res = await fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
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

    const notify = JSON.parse(await res.text());

    if (notify.status === 'success' && notify.calendarEventId) {
      await client.from('memo_rekod').update({ calendar_event_id: notify.calendarEventId }).eq('id', id);

      if (window.CacheService) await window.CacheService.clearStore('memo_rekod');

      window.showMessage("Penyegerakan kalendar berjaya.", "success");

      const activeAdmin = window.currentAdmin || (typeof currentAdmin !== 'undefined' ? currentAdmin : null);
      if (activeAdmin && activeAdmin.isSystemAdmin && typeof loadAdminMemo === 'function') {
        loadAdminMemo();
      }
      if (typeof loadDashboardData === 'function') {
        if (typeof allRecords !== 'undefined') allRecords = [];
        loadDashboardData();
      }

      refreshIframeKalendar();
    } else {
      throw new Error(notify.message || "Ralat tidak diketahui.");
    }
  } catch (err) {
    window.showMessage("Gagal menyegerak kalendar: " + err.message, "error");
  } finally {
    setProcessingState(false);
  }
};

window.removeSingleCalendar = function(id) {
  if (typeof isProcessingBatch !== 'undefined' && isProcessingBatch) return window.showMessage("Sistem sedang memproses pukal.", "error");

  const dataMemo = typeof adminMemoData !== 'undefined' ? adminMemoData : [];
  let m = dataMemo.find(x => x.id === id);
  if (!m && typeof allRecords !== 'undefined') {
    m = allRecords.find(x => x.id === id);
  }
  if (!m || !m.calendar_event_id) return window.showMessage("Ralat: Memo atau rekod kalendar tidak dijumpai.", "error");

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
        if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
          await window.appConfigReady;
        }

        const client = window._supabase;
        const gasUrl = window.GAS_URL;
        if (!client || !gasUrl) throw new Error("Konfigurasi pelayan belum sedia.");

        setProcessingState(true, `Memadam rekod kalendar #${id}...`);

        const res = await fetch(gasUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify({ action: 'deleteEvent', eventId: m.calendar_event_id })
        });

        const responseJSON = JSON.parse(await res.text());

        if (responseJSON.status === 'success' || responseJSON.status === 'not_found') {
          await client.from('memo_rekod').update({ calendar_event_id: null }).eq('id', id);

          if (window.CacheService) await window.CacheService.clearStore('memo_rekod');

          window.showMessage("Acara kalendar berjaya ditanggalkan.", "success");

          const activeAdmin = window.currentAdmin || (typeof currentAdmin !== 'undefined' ? currentAdmin : null);
          if (activeAdmin && activeAdmin.isSystemAdmin && typeof loadAdminMemo === 'function') {
            loadAdminMemo();
          }
          if (typeof loadDashboardData === 'function') {
            if (typeof allRecords !== 'undefined') allRecords = [];
            loadDashboardData();
          }

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
};

window.deleteMemo = function(id) {
  if (typeof isProcessingBatch !== 'undefined' && isProcessingBatch) return window.showMessage("Sistem sedang memproses pukal.", "error");

  const dataMemo = typeof adminMemoData !== 'undefined' ? adminMemoData : [];
  let m = dataMemo.find(x => x.id === id);
  if (!m && typeof allRecords !== 'undefined') {
    m = allRecords.find(x => x.id === id);
  }
  if (!m) return window.showMessage("Ralat pangkalan data: Memo tidak dijumpai.", "error");

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
        if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
          await window.appConfigReady;
        }

        const client = window._supabase;
        const gasUrl = window.GAS_URL;
        if (!client) throw new Error("Konfigurasi pangkalan data belum sedia.");

        setProcessingState(true, "Memadam data secara menyeluruh...");

        if (m.calendar_event_id && !m.calendar_event_id.startsWith('RESOLVED') && gasUrl) {
          const eventId = m.calendar_event_id.replace('PENDING_', '');
          try {
            await fetch(gasUrl, {
              method: 'POST',
              redirect: 'follow',
              headers: {
                'Content-Type': 'text/plain;charset=utf-8'
              },
              body: JSON.stringify({ action: 'deleteEvent', eventId: eventId })
            });
          } catch (e) {}
        }

        const { error } = await client.from('memo_rekod').delete().eq('id', id);
        if (error) throw error;

        if (window.CacheService) await window.CacheService.clearStore('memo_rekod');

        const activeAdmin = window.currentAdmin || (typeof currentAdmin !== 'undefined' ? currentAdmin : null);
        if (activeAdmin && activeAdmin.isSystemAdmin && typeof loadAdminMemo === 'function') {
          loadAdminMemo();
        }
        if (typeof loadDashboardData === 'function') {
          if (typeof allRecords !== 'undefined') allRecords = [];
          loadDashboardData();
        }

        refreshIframeKalendar();
        window.showMessage("Rekod surat telah berjaya dihapuskan sepenuhnya.", "success");
      } catch (err) {
        window.showMessage("Ralat semasa proses pemadaman: " + err.message, "error");
      } finally {
        setProcessingState(false);
      }
    }
  });
};

function updateBatchProgressUI(current, total, text) {
  const container = document.getElementById('adminBatchProgressContainer');
  const bar = document.getElementById('batchProgressBar');
  const percentage = document.getElementById('batchPercentage');
  const statusText = document.getElementById('batchStatusText');

  if (!container || !bar || !percentage || !statusText) return;

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
  if (typeof isProcessingBatch !== 'undefined') {
    isProcessingBatch = isProcessing;
  }
  const btns = document.querySelectorAll('button');
  btns.forEach(b => {
    if (b.id !== 'btnLogKeluarAdmin') {
      b.disabled = isProcessing;
      if (isProcessing) b.classList.add('opacity-50', 'cursor-not-allowed');
      else b.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  });

  const progressContainer = document.getElementById('adminBatchProgressContainer');
  if (isProcessing && progressContainer && progressContainer.classList.contains('hidden')) {
    updateBatchProgressUI(1, 1, lockText);
  } else if (!isProcessing) {
    updateBatchProgressUI(0, 0);
  }
}

window.startBatchSync = function() {
  if (typeof isProcessingBatch !== 'undefined' && isProcessingBatch) return;

  const dataMemo = typeof adminMemoData !== 'undefined' ? adminMemoData : [];
  const queue = dataMemo.filter(m => !m.calendar_event_id);
  if (queue.length === 0) {
    return window.showMessage("Semua data telah pun disegerakkan ke kalendar.", "success");
  }

  Swal.fire({
    title: 'Operasi Segerak Pukal',
    html: `Sistem mendapati terdapat <b>${queue.length}</b> rekod yang belum disegerakkan ke Kalendar. Proses ini akan menghantar jemputan satu per satu.<br><br>Adakah anda pasti mahu mulakan operasi pukal?`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#059669',
    cancelButtonColor: '#94a3b8',
    confirmButtonText: 'Mula Segerak',
    cancelButtonText: 'Batal',
    customClass: { popup: 'rounded-2xl', confirmButton: 'text-sm font-bold', cancelButton: 'text-sm font-bold' }
  }).then(async (result) => {
    if (result.isConfirmed) {
      setProcessingState(true);
      let successCount = 0;
      let errorCount = 0;
      let dbUpdated = false;

      try {
        if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
          await window.appConfigReady;
        }

        const client = window._supabase;
        const gasUrl = window.GAS_URL;
        if (!client || !gasUrl) throw new Error("Konfigurasi pelayan belum sedia.");

        for (let i = 0; i < queue.length; i++) {
          const m = queue[i];
          updateBatchProgressUI(i, queue.length, `Menyegerak ID #${m.id} (${i+1}/${queue.length})...`);

          try {
            const names = m.nama_penerima ? m.nama_penerima.split(',').map(n => n.trim()).filter(Boolean) : [];
            const emails = m.emel_penerima ? m.emel_penerima.split(',').map(e => e.trim()).filter(Boolean) : [];

            const res = await fetch(gasUrl, {
              method: 'POST',
              redirect: 'follow',
              headers: {
                'Content-Type': 'text/plain;charset=utf-8'
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

            const notify = JSON.parse(await res.text());

            if (notify.status === 'success' && notify.calendarEventId) {
              await client.from('memo_rekod').update({ calendar_event_id: notify.calendarEventId }).eq('id', m.id);
              successCount++;
              dbUpdated = true;
            } else {
              errorCount++;
            }
          } catch (err) {
            errorCount++;
          }
        }

        if (dbUpdated && window.CacheService) {
          await window.CacheService.clearStore('memo_rekod');
        }

        updateBatchProgressUI(queue.length, queue.length, "Proses Selesai.");
        setProcessingState(false);

        const activeAdmin = window.currentAdmin || (typeof currentAdmin !== 'undefined' ? currentAdmin : null);
        if (activeAdmin && activeAdmin.isSystemAdmin && typeof loadAdminMemo === 'function') {
          loadAdminMemo();
        }
        if (typeof loadDashboardData === 'function') {
          if (typeof allRecords !== 'undefined') allRecords = [];
          loadDashboardData();
        }

        refreshIframeKalendar();

        window.showMessage(`Operasi Segerak Pukal Tamat.<br>Berjaya: ${successCount}<br>Gagal: ${errorCount}`, "success");
      } catch (err) {
        setProcessingState(false);
        window.showMessage("Ralat operasi pukal: " + err.message, "error");
      }
    }
  });
};

window.startBatchDelete = function() {
  if (typeof isProcessingBatch !== 'undefined' && isProcessingBatch) return;

  const dataMemo = typeof adminMemoData !== 'undefined' ? adminMemoData : [];
  const queue = dataMemo.filter(m => m.calendar_event_id && !m.calendar_event_id.startsWith('PENDING_') && !m.calendar_event_id.startsWith('RESOLVED'));
  if (queue.length === 0) {
    return window.showMessage("Tiada rekod kalendar yang sah dijumpai untuk dipadam secara pukal.", "success");
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
      let dbUpdated = false;

      try {
        if (window.appConfigReady && typeof window.appConfigReady.then === 'function') {
          await window.appConfigReady;
        }

        const client = window._supabase;
        const gasUrl = window.GAS_URL;
        if (!client || !gasUrl) throw new Error("Konfigurasi pelayan belum sedia.");

        for (let i = 0; i < queue.length; i++) {
          const m = queue[i];
          updateBatchProgressUI(i, queue.length, `Memadam Kalendar ID #${m.id} (${i+1}/${queue.length})...`);

          try {
            const res = await fetch(gasUrl, {
              method: 'POST',
              redirect: 'follow',
              headers: {
                'Content-Type': 'text/plain;charset=utf-8'
              },
              body: JSON.stringify({ action: 'deleteEvent', eventId: m.calendar_event_id })
            });

            const responseJSON = JSON.parse(await res.text());

            if (responseJSON.status === 'success' || responseJSON.status === 'not_found') {
              await client.from('memo_rekod').update({ calendar_event_id: null }).eq('id', m.id);
              successCount++;
              dbUpdated = true;
            } else {
              errorCount++;
            }
          } catch (err) {
            errorCount++;
          }
        }

        if (dbUpdated && window.CacheService) {
          await window.CacheService.clearStore('memo_rekod');
        }

        updateBatchProgressUI(queue.length, queue.length, "Proses Selesai.");
        setProcessingState(false);

        const activeAdmin = window.currentAdmin || (typeof currentAdmin !== 'undefined' ? currentAdmin : null);
        if (activeAdmin && activeAdmin.isSystemAdmin && typeof loadAdminMemo === 'function') {
          loadAdminMemo();
        }
        if (typeof loadDashboardData === 'function') {
          if (typeof allRecords !== 'undefined') allRecords = [];
          loadDashboardData();
        }

        refreshIframeKalendar();

        window.showMessage(`Operasi Padam Kalendar Pukal Tamat.<br>Berjaya: ${successCount}<br>Gagal: ${errorCount}`, "success");
      } catch (err) {
        setProcessingState(false);
        window.showMessage("Ralat operasi padam pukal: " + err.message, "error");
      }
    }
  });
};

function refreshIframeKalendar() {
  const calFrame = document.getElementById('calendarFrame');
  if (calFrame) calFrame.src = calFrame.src;
}

window.updateBatchProgressUI = updateBatchProgressUI;
window.setProcessingState = setProcessingState;
window.refreshIframeKalendar = refreshIframeKalendar;