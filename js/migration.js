(function() {
  if (window.MigrationService) {
    return;
  }

  const APP_NAME = 'Memo@AG';
  const SCHEMA_VERSION = '1.0.0';
  const BATCH_SIZE = 100;

  const TABLE_ORDER = ['memo_admin', 'memo_pegawai', 'memo_rekod'];

  const TABLE_SCHEMAS = {
    memo_admin: {
      table_name: 'memo_admin',
      primary_key: 'id',
      headers: ['id', 'email', 'password', 'role'],
      optional_headers: ['created_at', 'updated_at']
    },
    memo_pegawai: {
      table_name: 'memo_pegawai',
      primary_key: 'id',
      headers: ['id', 'nama', 'sektor', 'unit', 'emel_rasmi'],
      optional_headers: ['created_at', 'updated_at']
    },
    memo_rekod: {
      table_name: 'memo_rekod',
      primary_key: 'id',
      headers: [
        'id',
        'created_at',
        'sektor',
        'unit',
        'nama_penerima',
        'emel_penerima',
        'no_rujukan',
        'no_tambahan',
        'tarikh_surat',
        'dari',
        'tajuk_program',
        'tarikh_terima',
        'masa_rekod',
        'file_url',
        'calendar_event_id'
      ],
      optional_headers: ['updated_at']
    }
  };

  let isMigrating = false;
  let activeAbortController = null;

  function verifySystemAdminAccess() {
    const activeAdmin = window.currentAdmin || null;
    if (!activeAdmin || !activeAdmin.isSystemAdmin) {
      throw new Error('Akses Ditolak: Operasi sandaran dan pemulihan data hanya dibenarkan untuk Pentadbir Sistem.');
    }
    return activeAdmin;
  }

  function setControlsDisabled(disabled) {
    const btnExport = document.getElementById('btnExportBackupJson');
    const btnImport = document.getElementById('btnTriggerImportJson');
    const inputImport = document.getElementById('inputImportBackupJson');
    const btnAbort = document.getElementById('btnAbortMigration');

    if (btnExport) {
      btnExport.disabled = disabled;
      btnExport.classList.toggle('opacity-50', disabled);
      btnExport.classList.toggle('cursor-not-allowed', disabled);
    }
    if (btnImport) {
      btnImport.disabled = disabled;
      btnImport.classList.toggle('opacity-50', disabled);
      btnImport.classList.toggle('cursor-not-allowed', disabled);
    }
    if (inputImport) {
      inputImport.disabled = disabled;
    }
    if (btnAbort) {
      btnAbort.classList.toggle('hidden', !disabled);
      btnAbort.disabled = !disabled;
    }
  }

  function renderMigrationStatus(type, title, details) {
    const container = document.getElementById('migrationStatusBox');
    if (!container) {
      return;
    }

    container.textContent = '';
    container.className = 'mt-4 p-4 rounded-xl border text-xs transition-all';

    if (type === 'loading') {
      container.classList.add('bg-indigo-50', 'border-indigo-200', 'text-indigo-800');
    } else if (type === 'success') {
      container.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
    } else if (type === 'error') {
      container.classList.add('bg-red-50', 'border-red-200', 'text-red-800');
    } else {
      container.classList.add('bg-slate-50', 'border-slate-200', 'text-slate-700');
    }

    const fragment = document.createDocumentFragment();

    const headerRow = document.createElement('div');
    headerRow.className = 'flex items-center font-bold text-sm';

    if (type === 'loading') {
      const spinner = document.createElement('span');
      spinner.className = 'loader mr-2 border-indigo-300 border-top-indigo-600 w-4 h-4';
      headerRow.appendChild(spinner);
    }

    const titleSpan = document.createElement('span');
    titleSpan.textContent = title || '';
    headerRow.appendChild(titleSpan);
    fragment.appendChild(headerRow);

    if (Array.isArray(details) && details.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'mt-2 space-y-1 list-disc list-inside opacity-90';
      details.forEach(item => {
        const li = document.createElement('li');
        li.textContent = String(item);
        ul.appendChild(li);
      });
      fragment.appendChild(ul);
    } else if (typeof details === 'string' && details.trim() !== '') {
      const p = document.createElement('p');
      p.className = 'mt-1.5 leading-relaxed opacity-90';
      p.textContent = details;
      fragment.appendChild(p);
    }

    container.appendChild(fragment);
    container.classList.remove('hidden');
  }

  async function getSupabaseClient() {
    const readyPromise = window.ENV_READY || window.appConfigReady;
    if (readyPromise && typeof readyPromise.then === 'function') {
      await readyPromise;
    }
    const client = window._supabase;
    if (!client || typeof client.from !== 'function') {
      throw new Error('Sambungan Supabase belum tersedia.');
    }
    return client;
  }

  function buildDeterministicRow(row, headers) {
    const cleanRow = {};
    headers.forEach(col => {
      cleanRow[col] = Object.prototype.hasOwnProperty.call(row, col) && row[col] !== undefined
        ? row[col]
        : null;
    });
    return cleanRow;
  }

  async function exportJSON() {
    if (isMigrating) {
      return null;
    }

    try {
      verifySystemAdminAccess();
    } catch (authErr) {
      if (typeof window.showMessage === 'function') {
        window.showMessage(authErr.message, 'error');
      }
      return null;
    }

    isMigrating = true;
    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;
    setControlsDisabled(true);

    try {
      renderMigrationStatus('loading', 'Menjana fail sandaran 1-to-1 JSON...', 'Sedang membaca semua rekod daripada pangkalan data.');
      const client = await getSupabaseClient();

      const exportedTables = {};
      const summaryLines = [];

      for (let i = 0; i < TABLE_ORDER.length; i++) {
        if (signal.aborted) {
          throw new Error('Operasi eksport dibatalkan oleh pengguna.');
        }

        const tableName = TABLE_ORDER[i];
        const schema = TABLE_SCHEMAS[tableName];
        const primaryKey = schema.primary_key;

        renderMigrationStatus(
          'loading',
          `Mengeksport jadual (${i + 1}/${TABLE_ORDER.length}): ${tableName}...`,
          'Sila tunggu sehingga semua jadual selesai dimuat turun.'
        );

        let query = client
          .from(tableName)
          .select('*')
          .order(primaryKey, { ascending: true });

        if (typeof query.abortSignal === 'function') {
          query = query.abortSignal(signal);
        }

        const { data, error } = await query;
        if (error) {
          throw new Error(`Gagal membaca jadual ${tableName}: ${error.message}`);
        }

        const rawRows = Array.isArray(data) ? data : [];
        const headers = [...schema.headers];

        if (rawRows.length > 0) {
          const liveKeys = Object.keys(rawRows[0]);
          liveKeys.forEach(k => {
            if (!headers.includes(k) && schema.optional_headers.includes(k)) {
              headers.push(k);
            }
          });
        }

        const normalizedRows = rawRows.map(row => buildDeterministicRow(row, headers));

        exportedTables[tableName] = {
          table_name: tableName,
          primary_key: primaryKey,
          headers: headers,
          rows: normalizedRows
        };

        summaryLines.push(`${tableName}: ${normalizedRows.length} rekod`);
      }

      if (signal.aborted) {
        throw new Error('Operasi eksport dibatalkan oleh pengguna.');
      }

      const payload = {
        metadata: {
          app: APP_NAME,
          schema_version: SCHEMA_VERSION,
          exported_at: new Date().toISOString(),
          table_order: [...TABLE_ORDER]
        },
        tables: exportedTables
      };

      const jsonText = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonText], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);

      const now = new Date();
      const stamp =
        String(now.getFullYear()) +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');

      const fileName = `Backup_MemoAG_${stamp}.json`;
      const anchor = document.createElement('a');
      anchor.setAttribute('href', objectUrl);
      anchor.setAttribute('download', fileName);
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      renderMigrationStatus('success', `Eksport sandaran berjaya: ${fileName}`, summaryLines);
      if (typeof window.showMessage === 'function') {
        window.showMessage(`Fail sandaran 1-to-1 JSON (${fileName}) berjaya dijana dan dimuat turun.`, 'success');
      }

      return payload;
    } catch (err) {
      renderMigrationStatus('error', 'Eksport sandaran gagal', err.message || 'Ralat tidak diketahui.');
      if (typeof window.showMessage === 'function') {
        window.showMessage('Gagal mengeksport data JSON: ' + (err.message || 'Ralat tidak diketahui.'), 'error');
      }
      return null;
    } finally {
      isMigrating = false;
      activeAbortController = null;
      setControlsDisabled(false);
    }
  }

  function validateMigrationPayload(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Struktur akar fail JSON tidak sah.');
    }

    if (!parsed.metadata || typeof parsed.metadata !== 'object') {
      throw new Error('Objek "metadata" tiada dalam fail JSON.');
    }

    if (!Array.isArray(parsed.metadata.table_order)) {
      throw new Error('Tatasusunan "metadata.table_order" tidak sah.');
    }

    if (parsed.metadata.table_order.length !== TABLE_ORDER.length) {
      throw new Error(`Bilangan jadual dalam table_order tidak sepadan (dijangka ${TABLE_ORDER.length}).`);
    }

    for (let i = 0; i < TABLE_ORDER.length; i++) {
      if (parsed.metadata.table_order[i] !== TABLE_ORDER[i]) {
        throw new Error(`Susunan table_order tidak sah pada indeks ${i}: dijangka "${TABLE_ORDER[i]}", diterima "${parsed.metadata.table_order[i]}".`);
      }
    }

    if (!parsed.tables || typeof parsed.tables !== 'object') {
      throw new Error('Objek "tables" tiada dalam fail JSON.');
    }

    const normalizedTables = {};

    TABLE_ORDER.forEach(tableName => {
      const schema = TABLE_SCHEMAS[tableName];
      const tableBlock = parsed.tables[tableName];

      if (!tableBlock || typeof tableBlock !== 'object') {
        throw new Error(`Definisi jadual "${tableName}" tiada dalam "tables".`);
      }

      if (tableBlock.table_name !== tableName) {
        throw new Error(`Nilai "table_name" tidak sepadan bagi "${tableName}".`);
      }

      if (tableBlock.primary_key !== schema.primary_key) {
        throw new Error(`Kunci primer bagi "${tableName}" mesti "${schema.primary_key}".`);
      }

      if (!Array.isArray(tableBlock.headers) || tableBlock.headers.length === 0) {
        throw new Error(`Tatasusunan "headers" bagi "${tableName}" tidak sah atau kosong.`);
      }

      const allowedHeaders = new Set([...schema.headers, ...schema.optional_headers]);
      const seenHeaders = new Set();

      tableBlock.headers.forEach(h => {
        if (typeof h !== 'string' || !allowedHeaders.has(h)) {
          throw new Error(`Lajur tidak sah "${String(h)}" dikesan dalam headers jadual "${tableName}".`);
        }
        if (seenHeaders.has(h)) {
          throw new Error(`Lajur pendua "${h}" dikesan dalam headers jadual "${tableName}".`);
        }
        seenHeaders.add(h);
      });

      schema.headers.forEach(reqCol => {
        if (!seenHeaders.has(reqCol)) {
          throw new Error(`Lajur wajib "${reqCol}" tiada dalam headers jadual "${tableName}".`);
        }
      });

      if (!Array.isArray(tableBlock.rows)) {
        throw new Error(`Tatasusunan "rows" bagi "${tableName}" tidak sah.`);
      }

      const cleanRows = tableBlock.rows.map((rawRow, rowIdx) => {
        if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
          throw new Error(`Baris ke-${rowIdx + 1} dalam "${tableName}" bukan objek sah.`);
        }

        const pkVal = rawRow[schema.primary_key];
        if (pkVal === undefined || pkVal === null || pkVal === '') {
          throw new Error(`Nilai kunci primer "${schema.primary_key}" tiada pada baris ke-${rowIdx + 1} dalam "${tableName}".`);
        }

        const filteredRow = {};
        tableBlock.headers.forEach(col => {
          filteredRow[col] = Object.prototype.hasOwnProperty.call(rawRow, col) && rawRow[col] !== undefined
            ? rawRow[col]
            : null;
        });

        return filteredRow;
      });

      normalizedTables[tableName] = {
        table_name: tableName,
        primary_key: schema.primary_key,
        headers: [...tableBlock.headers],
        rows: cleanRows
      };
    });

    return {
      metadata: parsed.metadata,
      tables: normalizedTables
    };
  }

  async function confirmRestoreDialog(validatedData) {
    const countsText = TABLE_ORDER.map(t => `${t}: ${validatedData.tables[t].rows.length} rekod`).join(' | ');
    const exportedAt = validatedData.metadata.exported_at || 'Tidak dinyatakan';

    if (typeof window.Swal !== 'undefined' && typeof window.Swal.fire === 'function') {
      const result = await window.Swal.fire({
        title: 'Pengesahan Pemulihan Data 1-to-1',
        text: `Fail sandaran bertarikh ${exportedAt} (${countsText}) akan dipulihkan ke pangkalan data dan mengemas kini rekod sedia ada. Teruskan?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Ya, Pulihkan Data',
        cancelButtonText: 'Batal',
        customClass: {
          popup: 'rounded-2xl',
          confirmButton: 'text-sm font-bold',
          cancelButton: 'text-sm font-bold'
        }
      });
      return Boolean(result && result.isConfirmed);
    }

    return window.confirm(`Pulihkan data sandaran (${countsText}) ke pangkalan data?`);
  }

  async function refreshPostMigrationState() {
    if (window.CacheService && typeof window.CacheService.clearStore === 'function') {
      for (let i = 0; i < TABLE_ORDER.length; i++) {
        await window.CacheService.clearStore(TABLE_ORDER[i]).catch(() => {});
      }
    }

    if (typeof window.loadAdminData === 'function') {
      window.loadAdminData();
    }

    if (typeof window.loadPublicPegawaiData === 'function') {
      window.loadPublicPegawaiData();
    }

    if (typeof window.loadDashboardData === 'function') {
      if (typeof window.allRecords !== 'undefined') {
        window.allRecords = [];
      }
      window.loadDashboardData();
    }

    if (window.RealtimeService && typeof window.RealtimeService.syncNow === 'function') {
      window.RealtimeService.syncNow();
    }
  }

  async function importJSON(file) {
    if (isMigrating) {
      return false;
    }

    try {
      verifySystemAdminAccess();
    } catch (authErr) {
      if (typeof window.showMessage === 'function') {
        window.showMessage(authErr.message, 'error');
      }
      return false;
    }

    if (!file) {
      renderMigrationStatus('error', 'Tiada fail dipilih', 'Sila pilih fail sandaran berformat .json terlebih dahulu.');
      return false;
    }

    const fileName = String(file.name || '').toLowerCase();
    if (!fileName.endsWith('.json')) {
      renderMigrationStatus('error', 'Format fail ditolak', 'Hanya fail sambungan .json (application/json) dibenarkan.');
      if (typeof window.showMessage === 'function') {
        window.showMessage('Format fail tidak sah. Sila pilih fail .json sahaja.', 'error');
      }
      return false;
    }

    isMigrating = true;
    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;
    setControlsDisabled(true);

    try {
      renderMigrationStatus('loading', 'Membaca dan mengesahkan skema fail JSON...', file.name);

      const rawText = await file.text();
      if (signal.aborted) {
        throw new Error('Operasi pemulihan dibatalkan oleh pengguna.');
      }

      let parsedJson;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (syntaxErr) {
        throw new Error('Sintaks JSON rosak atau tidak boleh dihuraikan.');
      }

      const validated = validateMigrationPayload(parsedJson);

      const isConfirmed = await confirmRestoreDialog(validated);
      if (!isConfirmed) {
        renderMigrationStatus('info', 'Pemulihan dibatalkan', 'Tiada perubahan dilakukan terhadap pangkalan data.');
        return false;
      }

      const client = await getSupabaseClient();
      const restoredSummary = [];

      for (let tIdx = 0; tIdx < TABLE_ORDER.length; tIdx++) {
        if (signal.aborted) {
          throw new Error('Operasi pemulihan dibatalkan oleh pengguna.');
        }

        const tableName = TABLE_ORDER[tIdx];
        const tableSpec = validated.tables[tableName];
        const rows = tableSpec.rows;
        const primaryKey = tableSpec.primary_key;

        if (rows.length === 0) {
          restoredSummary.push(`${tableName}: 0 rekod (tiada baris untuk dipulihkan)`);
          continue;
        }

        const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

        for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
          if (signal.aborted) {
            throw new Error('Operasi pemulihan dibatalkan oleh pengguna.');
          }

          const start = bIdx * BATCH_SIZE;
          const batchSlice = rows.slice(start, start + BATCH_SIZE);

          renderMigrationStatus(
            'loading',
            `Memulihkan jadual ${tableName} (Kelompok ${bIdx + 1}/${totalBatches})...`,
            `Memproses rekod ${start + 1} hingga ${start + batchSlice.length} daripada ${rows.length}.`
          );

          let upsertQuery = client
            .from(tableName)
            .upsert(batchSlice, { onConflict: primaryKey });

          if (typeof upsertQuery.abortSignal === 'function') {
            upsertQuery = upsertQuery.abortSignal(signal);
          }

          const { error: upsertError } = await upsertQuery;
          if (upsertError) {
            throw new Error(`Ralat pemulihan pada jadual ${tableName} (kelompok ${bIdx + 1}): ${upsertError.message}`);
          }
        }

        restoredSummary.push(`${tableName}: ${rows.length} rekod berjaya dipulihkan`);
      }

      if (signal.aborted) {
        throw new Error('Operasi pemulihan dibatalkan oleh pengguna.');
      }

      renderMigrationStatus(
        'loading',
        'Menyelaraskan jujukan ID pangkalan data...',
        'Menjalankan penetapan semula urutan kunci primer di Supabase.'
      );

      let rpcQuery = client.rpc('reset_memo_sequences');
      if (typeof rpcQuery.abortSignal === 'function') {
        rpcQuery = rpcQuery.abortSignal(signal);
      }

      const { error: rpcError } = await rpcQuery;
      if (rpcError) {
        throw new Error(`Data dipulihkan, tetapi gagal menyelaraskan jujukan ID (RPC reset_memo_sequences): ${rpcError.message}`);
      }

      restoredSummary.push('Jujukan ID pangkalan data (sequences) berjaya diselaraskan');

      await refreshPostMigrationState();

      renderMigrationStatus('success', 'Pemulihan data 1-to-1 JSON selesai sepenuhnya', restoredSummary);
      if (typeof window.showMessage === 'function') {
        window.showMessage('Pemulihan data 1-to-1 berjaya dan cache tempatan telah disegarkan.', 'success');
      }

      return true;
    } catch (err) {
      renderMigrationStatus('error', 'Pemulihan data gagal', err.message || 'Ralat tidak diketahui.');
      if (typeof window.showMessage === 'function') {
        window.showMessage('Gagal memulihkan data JSON: ' + (err.message || 'Ralat tidak diketahui.'), 'error');
      }
      return false;
    } finally {
      isMigrating = false;
      activeAbortController = null;
      setControlsDisabled(false);
    }
  }

  function abortMigration() {
    if (activeAbortController) {
      activeAbortController.abort();
    }
  }

  function bindMigrationUI() {
    const btnExport = document.getElementById('btnExportBackupJson');
    const btnTriggerImport = document.getElementById('btnTriggerImportJson');
    const inputImport = document.getElementById('inputImportBackupJson');
    const btnAbort = document.getElementById('btnAbortMigration');

    if (btnExport && !btnExport.dataset.bound) {
      btnExport.dataset.bound = 'true';
      btnExport.addEventListener('click', () => {
        exportJSON();
      });
    }

    if (btnTriggerImport && inputImport && !btnTriggerImport.dataset.bound) {
      btnTriggerImport.dataset.bound = 'true';
      btnTriggerImport.addEventListener('click', () => {
        if (isMigrating) {
          return;
        }
        inputImport.value = '';
        inputImport.click();
      });
    }

    if (inputImport && !inputImport.dataset.bound) {
      inputImport.dataset.bound = 'true';
      inputImport.addEventListener('change', async (e) => {
        const selectedFile = e.target.files && e.target.files[0] ? e.target.files[0] : null;
        if (selectedFile) {
          await importJSON(selectedFile);
        }
        e.target.value = '';
      });
    }

    if (btnAbort && !btnAbort.dataset.bound) {
      btnAbort.dataset.bound = 'true';
      btnAbort.addEventListener('click', () => {
        abortMigration();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindMigrationUI);
  } else {
    bindMigrationUI();
  }

  window.MigrationService = {
    exportJSON: exportJSON,
    importJSON: importJSON,
    abort: abortMigration,
    getSchema: function() {
      return {
        app: APP_NAME,
        schema_version: SCHEMA_VERSION,
        table_order: [...TABLE_ORDER],
        tables: JSON.parse(JSON.stringify(TABLE_SCHEMAS))
      };
    }
  };
})();