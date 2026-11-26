function getScriptConfig() {
  const props = PropertiesService.getScriptProperties();
  const driveParentFolderId = String(props.getProperty('DRIVE_PARENT_FOLDER_ID') || '').trim();
  const calendarId = String(props.getProperty('CALENDAR_ID') || '').trim();
  const webAppUrl = String(props.getProperty('WEB_APP_URL') || 'https://memo.tech4ag.my').trim();
  const adminNotificationEmail = String(props.getProperty('ADMIN_NOTIFICATION_EMAIL') || '').trim();

  if (!driveParentFolderId || !calendarId) {
    throw new Error('Konfigurasi Script Properties tidak lengkap: DRIVE_PARENT_FOLDER_ID atau CALENDAR_ID tiada.');
  }

  return {
    DRIVE_PARENT_FOLDER_ID: driveParentFolderId,
    CALENDAR_ID: calendarId,
    WEB_APP_URL: webAppUrl,
    ADMIN_NOTIFICATION_EMAIL: adminNotificationEmail
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeSafeUrl(url) {
  const cleanUrl = String(url || '').trim();
  if (/^https?:\/\//i.test(cleanUrl)) {
    return escapeHtml(cleanUrl);
  }
  return '#';
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Payload permintaan POST kosong.');
    }

    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    let responseData = {};

    switch (action) {
      case 'upload':
        responseData = handleUpload(data);
        break;
      case 'notify':
        responseData = handleNotify(data);
        break;
      case 'notifyManager':
        responseData = handleNotifyManager(data);
        break;
      case 'deleteEvent':
        responseData = handleDeleteEvent(data.eventId);
        break;
      case 'notifyExtraEmailsOnly':
        responseData = handleNotifyExtraEmailsOnly(data);
        break;
      case 'notifyDelegationSelfConfirmation':
        responseData = handleNotifyDelegationSelfConfirmation(data);
        break;
      default:
        throw new Error('Tindakan tidak sah: ' + action);
    }

    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleUpload(formData) {
  const cfg = getScriptConfig();
  const fileBase64 = formData.fileBase64;
  const fileName = String(formData.fileName || 'dokumen').trim();
  const mimeType = formData.fileMimeType;

  const resolvedMimeType = mimeType || 'application/octet-stream';
  const rawBytes = Utilities.base64Decode(fileBase64);
  const blob = Utilities.newBlob(rawBytes, resolvedMimeType, fileName);

  const parentFolder = DriveApp.getFolderById(cfg.DRIVE_PARENT_FOLDER_ID);

  const ts = Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyyMMdd_HHmmss');
  blob.setName(ts + '_' + fileName);

  const file = parentFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    status: 'success',
    fileUrl: file.getUrl(),
    fileId: file.getId(),
    fileName: file.getName()
  };
}

function handleNotify(data) {
  const cfg = getScriptConfig();
  const sektor = data.sektor || 'TIADA SEKTOR';
  const unit = data.unit || '';
  const emailArray = Array.isArray(data.emailArray) ? data.emailArray : [];
  const rujukan = data.noRujukan || 'TIADA RUJUKAN';
  const tajuk = data.tajukProgram || 'TIADA TAJUK';
  const tarikhStr = data.tarikhTerima;
  const masaStr = data.masaRekod || '08:00';
  const fileUrl = data.fileUrl || '';

  const tarikhMasaStr = tarikhStr + 'T' + masaStr + ':00';
  const startDate = new Date(tarikhMasaStr);
  const endDate = new Date(startDate.getTime() + (60 * 60 * 1000));

  const cal = CalendarApp.getCalendarById(cfg.CALENDAR_ID);
  const colorId = getColorForSektor(sektor);

  const desc = `Sektor/Unit: ${sektor} ${unit ? '(' + unit + ')' : ''}\nNo. Fail Induk: ${rujukan}\nSurat: ${fileUrl}\nStatus: Menunggu Tindakan Anda\nSistem: ${cfg.WEB_APP_URL}`;

  const event = cal.createEvent(tajuk, startDate, endDate, {
    description: desc,
    guests: emailArray.join(','),
    sendInvites: true
  });

  event.setColor(colorId);

  if (emailArray.length > 0) {
    const subject = tajuk;
    const picNames = (data.namaArray && data.namaArray.length > 0) ? data.namaArray.join(', ') : 'Pegawai Penerima';
    const safeTajuk = escapeHtml(tajuk);
    const safePicNames = escapeHtml(picNames);
    const safeRujukan = escapeHtml(rujukan);
    const safeSektorUnit = escapeHtml(`${sektor} ${unit ? '(' + unit + ')' : ''}`);
    const safeFileUrl = sanitizeSafeUrl(fileUrl);
    const safeWebAppUrl = sanitizeSafeUrl(cfg.WEB_APP_URL);

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #059669; padding: 20px; text-align: center;">
          <h2 style="color: white; margin: 0;">MEMO &amp; SURAT BAHARU</h2>
          <p style="color: #d1fae5; margin: 5px 0 0 0; font-size: 14px;">Tindakan dan Perhatian Anda Diperlukan</p>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="color: #334155; font-size: 16px; margin-top: 0;">Assalamualaikum dan Salam Sejahtera,</p>
          <p style="color: #475569; line-height: 1.6;">Harap maklum, anda telah ditugaskan sebagai <b>Pegawai Penerima (PIC)</b> untuk dokumen rasmi berikut. Sila ambil tindakan segera.</p>

          <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Perkara:</strong> ${safeTajuk}</p>
            <p style="margin: 0 0 10px 0;"><strong>Ditugaskan kepada:</strong> ${safePicNames}</p>
            <p style="margin: 0 0 10px 0;"><strong>No. Rujukan:</strong> ${safeRujukan}</p>
            <p style="margin: 0 0 10px 0;"><strong>Sektor/Unit:</strong> ${safeSektorUnit}</p>
            <p style="margin: 0;"><strong>Salinan Asal:</strong> <a href="${safeFileUrl}" style="color: #059669; text-decoration: none; font-weight: bold;">Lihat / Muat Turun Dokumen</a></p>
          </div>

          <p style="color: #475569; font-size: 13px; line-height: 1.6;"><em>Sistem juga telah menjana jemputan RSVP terus ke kalendar rasmi anda. Sila sahkan penerimaan di kalendar atau layari pautan sistem di bawah.</em></p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${safeWebAppUrl}" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Akses Sistem Pangkalan Data</a>
          </div>
        </div>
      </div>
    `;

    const effectiveUser = Session.getEffectiveUser().getEmail();
    const bccList = [effectiveUser].filter(e => e && e.trim() !== '').join(',');
    MailApp.sendEmail({
      to: emailArray.join(','),
      bcc: bccList,
      subject: subject,
      htmlBody: htmlBody,
      name: 'Sistem Memo@AG'
    });
  }

  return {
    status: 'success',
    calendarEventId: event.getId(),
    message: 'Kalendar dan Emel RSVP dihantar.'
  };
}

function handleNotifyManager(data) {
  const cfg = getScriptConfig();
  const emailArray = Array.isArray(data.emailArray) ? data.emailArray : [];
  const sektor = data.sektor || 'TIADA SEKTOR';
  const unit = data.unit || '';
  const rujukan = data.noRujukan || 'TIADA RUJUKAN';
  const tajuk = data.tajukProgram || 'TIADA TAJUK';
  const tarikhStr = data.tarikhTerima;
  const masaStr = data.masaRekod || '08:00';
  const fileUrl = data.fileUrl || '';

  const tarikhMasaStr = tarikhStr + 'T' + masaStr + ':00';
  const startDate = new Date(tarikhMasaStr);
  const endDate = new Date(startDate.getTime() + (60 * 60 * 1000));

  const cal = CalendarApp.getCalendarById(cfg.CALENDAR_ID);
  const colorId = getColorForSektor(sektor);
  const magicLink = `${cfg.WEB_APP_URL}?action=delegasi&ref=${encodeURIComponent(rujukan)}`;

  const desc = `Sektor/Unit: ${sektor} ${unit ? '(' + unit + ')' : ''}\nNo. Fail Induk: ${rujukan}\nSurat: ${fileUrl}\nStatus: Sila Delegasi PIC Segera\nPautan Tindakan: ${magicLink}`;

  const event = cal.createEvent(tajuk, startDate, endDate, {
    description: desc,
    guests: emailArray.join(','),
    sendInvites: true
  });

  event.setColor(colorId);

  const subject = tajuk;
  const safeTajuk = escapeHtml(tajuk);
  const safeRujukan = escapeHtml(rujukan);
  const safeUnitSektor = escapeHtml(unit || sektor);
  const safeFileUrl = sanitizeSafeUrl(fileUrl);
  const safeMagicLink = sanitizeSafeUrl(magicLink);

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #4f46e5; padding: 20px; text-align: center;">
        <h2 style="color: white; margin: 0;">MEMO &amp; SURAT BAHARU</h2>
        <p style="color: #e0e7ff; margin: 5px 0 0 0; font-size: 14px;">Memerlukan Pengesahan &amp; Penugasan Anda</p>
      </div>
      <div style="padding: 30px; background-color: #ffffff;">
        <p style="color: #334155; font-size: 16px; margin-top: 0;">Assalamualaikum dan Salam Sejahtera,</p>
        <p style="color: #475569; line-height: 1.6;">Terdapat satu (1) dokumen baharu yang didaftarkan di dalam sistem dan telah dihalakan ke sektor/unit anda. Sila tetapkan Pegawai Bertanggungjawab (PIC) dengan kadar segera.</p>

        <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 15px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Tajuk:</strong> ${safeTajuk}</p>
          <p style="margin: 0 0 10px 0;"><strong>Rujukan:</strong> ${safeRujukan}</p>
          <p style="margin: 0 0 10px 0;"><strong>Unit Sasaran:</strong> ${safeUnitSektor}</p>
          <p style="margin: 0;"><strong>Salinan Asal:</strong> <a href="${safeFileUrl}" style="color: #4f46e5; text-decoration: none; font-weight: bold;">Lihat Dokumen</a></p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${safeMagicLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Log Masuk &amp; Tugaskan PIC</a>
        </div>
      </div>
    </div>
  `;

  if (emailArray.length > 0) {
    const effectiveUser = Session.getEffectiveUser().getEmail();
    const bccList = [effectiveUser, cfg.ADMIN_NOTIFICATION_EMAIL].filter(e => e && e.trim() !== '').join(',');
    MailApp.sendEmail({
      to: emailArray.join(','),
      bcc: bccList,
      subject: subject,
      htmlBody: htmlBody,
      name: 'Sistem Memo@AG'
    });
  }

  sendAdminDelegationAlert({
    emailArray: emailArray,
    sektor: sektor,
    unit: unit,
    rujukan: rujukan,
    tajuk: tajuk,
    fileUrl: fileUrl,
    magicLink: magicLink,
    calendarEventId: event.getId()
  }, cfg);

  return {
    status: 'success',
    calendarEventId: event.getId(),
    message: 'Kalendar dan Emel Pengurusan berjaya dihantar.'
  };
}

function sendAdminDelegationAlert(data, cfg) {
  if (!cfg.ADMIN_NOTIFICATION_EMAIL) {
    return;
  }

  const emailArray = Array.isArray(data.emailArray) ? data.emailArray : [];
  const sektor = data.sektor || 'TIADA SEKTOR';
  const unit = data.unit || '';
  const rujukan = data.rujukan || 'TIADA RUJUKAN';
  const tajuk = data.tajuk || 'TIADA TAJUK';
  const fileUrl = data.fileUrl || '';
  const magicLink = data.magicLink || cfg.WEB_APP_URL;
  const calendarEventId = data.calendarEventId || '';
  const delegationList = emailArray.length > 0 ? emailArray.join(', ') : 'Tiada emel delegasi direkodkan';

  const subject = tajuk;
  const safeTajuk = escapeHtml(tajuk);
  const safeRujukan = escapeHtml(rujukan);
  const safeSektorUnit = escapeHtml(`${sektor} ${unit ? '(' + unit + ')' : ''}`);
  const safeDelegationList = escapeHtml(delegationList);
  const safeCalendarEventId = escapeHtml(calendarEventId);
  const safeFileUrl = sanitizeSafeUrl(fileUrl);
  const safeMagicLink = sanitizeSafeUrl(magicLink);

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #0f172a; padding: 20px; text-align: center;">
        <h2 style="color: white; margin: 0;">PEMAKLUMAN ADMIN</h2>
        <p style="color: #cbd5e1; margin: 5px 0 0 0; font-size: 14px;">Memo Memerlukan Perhatian Delegasi</p>
      </div>
      <div style="padding: 30px; background-color: #ffffff;">
        <p style="color: #334155; font-size: 16px; margin-top: 0;">Assalamualaikum dan Salam Sejahtera Admin,</p>
        <p style="color: #475569; line-height: 1.6;">Sistem telah merekodkan satu dokumen yang memerlukan tindakan delegasi sebelum PIC akhir ditetapkan. Sila buat pemantauan dan pemakluman kepada delegasi terlibat jika diperlukan.</p>

        <div style="background-color: #f8fafc; border-left: 4px solid #0f172a; padding: 15px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Tajuk:</strong> ${safeTajuk}</p>
          <p style="margin: 0 0 10px 0;"><strong>Rujukan:</strong> ${safeRujukan}</p>
          <p style="margin: 0 0 10px 0;"><strong>Sektor/Unit:</strong> ${safeSektorUnit}</p>
          <p style="margin: 0 0 10px 0;"><strong>Delegasi Terlibat:</strong> ${safeDelegationList}</p>
          <p style="margin: 0 0 10px 0;"><strong>ID Acara Kalendar:</strong> ${safeCalendarEventId}</p>
          <p style="margin: 0;"><strong>Salinan Asal:</strong> <a href="${safeFileUrl}" style="color: #0f172a; text-decoration: none; font-weight: bold;">Lihat Dokumen</a></p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${safeMagicLink}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Semak Tugasan Delegasi</a>
        </div>
      </div>
    </div>
  `;

  MailApp.sendEmail({
    to: cfg.ADMIN_NOTIFICATION_EMAIL,
    subject: subject,
    htmlBody: htmlBody,
    name: 'Sistem Memo@AG'
  });
}

function handleNotifyExtraEmailsOnly(data) {
  const cfg = getScriptConfig();
  const newEmailsArray = Array.isArray(data.newEmailsOnly) ? data.newEmailsOnly : [];
  const sektor = data.sektor || 'TIADA SEKTOR';
  const unit = data.unit || '';
  const rujukan = data.noRujukan || 'TIADA RUJUKAN';
  const tajuk = data.tajukProgram || 'TIADA TAJUK';
  const fileUrl = data.fileUrl || '';

  if (newEmailsArray.length === 0) {
    return { status: 'success', message: 'Tiada emel tambahan baharu. Tiada notifikasi dihantar.' };
  }

  const subject = tajuk;
  const delegasiName = data.delegasiNama || 'Pengurusan Sektor / Unit';
  const picNamesArray = Array.isArray(data.picNames) ? data.picNames : [];
  const picNamesStr = newEmailsArray.map((email, index) => picNamesArray[index] || email).join(', ');

  const safeTajuk = escapeHtml(tajuk);
  const safeDelegasiName = escapeHtml(delegasiName);
  const safePicNamesStr = escapeHtml(picNamesStr);
  const safeRujukan = escapeHtml(rujukan);
  const safeSektorUnit = escapeHtml(`${sektor} ${unit ? '(' + unit + ')' : ''}`);
  const safeFileUrl = sanitizeSafeUrl(fileUrl);
  const safeWebAppUrl = sanitizeSafeUrl(cfg.WEB_APP_URL);

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #f59e0b; padding: 20px; text-align: center;">
        <h2 style="color: white; margin: 0;">TUGASAN DOKUMEN BAHARU</h2>
        <p style="color: #fef3c7; margin: 5px 0 0 0; font-size: 14px;">Penugasan Daripada Pihak Pengurusan</p>
      </div>
      <div style="padding: 30px; background-color: #ffffff;">
        <p style="color: #334155; font-size: 16px; margin-top: 0;">Assalamualaikum dan Salam Sejahtera,</p>
        <p style="color: #475569; line-height: 1.6;">Harap maklum, terdapat dokumen rasmi di mana anda telah <b>ditugaskan sebagai Pegawai Penerima (PIC)</b> untuk mengambil tindakan selanjutnya.</p>

        <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Perkara:</strong> ${safeTajuk}</p>
          <p style="margin: 0 0 10px 0;"><strong>Ditugaskan oleh:</strong> ${safeDelegasiName}</p>
          <p style="margin: 0 0 10px 0;"><strong>Ditugaskan kepada:</strong> ${safePicNamesStr}</p>
          <p style="margin: 0 0 10px 0;"><strong>No. Rujukan:</strong> ${safeRujukan}</p>
          <p style="margin: 0 0 10px 0;"><strong>Sektor/Unit:</strong> ${safeSektorUnit}</p>
          <p style="margin: 0;"><strong>Salinan Asal:</strong> <a href="${safeFileUrl}" style="color: #d97706; text-decoration: none; font-weight: bold;">Lihat / Muat Turun Dokumen</a></p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${safeWebAppUrl}" style="background-color: #475569; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Akses Sistem Pangkalan Data</a>
        </div>
      </div>
    </div>
  `;

  const effectiveUser = Session.getEffectiveUser().getEmail();
  const bccList = [effectiveUser].filter(e => e && e.trim() !== '').join(',');
  MailApp.sendEmail({
    to: newEmailsArray.join(','),
    bcc: bccList,
    subject: subject,
    htmlBody: htmlBody,
    name: 'Sistem Memo@AG'
  });

  return {
    status: 'success',
    message: 'Pemakluman Kemaskini berjaya dihantar kepada penerima baharu sahaja.'
  };
}

function handleNotifyDelegationSelfConfirmation(data) {
  const cfg = getScriptConfig();
  const delegasiEmail = String(data.delegasiEmail || '').trim();
  const delegasiNama = data.delegasiNama || 'Delegasi';
  const sektor = data.sektor || 'TIADA SEKTOR';
  const unit = data.unit || '';
  const rujukan = data.noRujukan || 'TIADA RUJUKAN';
  const tajuk = data.tajukProgram || 'TIADA TAJUK';
  const fileUrl = data.fileUrl || '';
  const picNames = Array.isArray(data.picNames) ? data.picNames : [];
  const picEmails = Array.isArray(data.picEmails) ? data.picEmails : [];
  const isSelfAssignOnly = data.isSelfAssignOnly === true;

  if (!delegasiEmail) {
    return { status: 'error', message: 'Emel delegasi tidak dibekalkan.' };
  }

  const picList = picEmails.length > 0
    ? picEmails.map((email, index) => {
        const nama = escapeHtml(picNames[index] || email);
        const safeEmail = escapeHtml(email);
        return `<li style="margin-bottom: 6px;"><strong>${nama}</strong> <span style="color: #64748b;">(${safeEmail})</span></li>`;
      }).join('')
    : '<li style="margin-bottom: 6px;">Tiada PIC tambahan dipilih. Anda direkodkan sebagai PIC tindakan.</li>';

  const statusText = isSelfAssignOnly
    ? 'Anda telah memilih diri sendiri sebagai PIC tindakan bagi dokumen ini. Rekod delegasi telah ditutup dan tindakan telah direkodkan dalam sistem.'
    : 'Anda telah memilih diri sendiri bersama PIC tambahan. Rekod delegasi telah ditutup, dan PIC tambahan yang berkaitan telah dimaklumkan melalui emel.';

  const subject = tajuk;
  const safeDelegasiNama = escapeHtml(delegasiNama);
  const safeTajuk = escapeHtml(tajuk);
  const safeRujukan = escapeHtml(rujukan);
  const safeSektorUnit = escapeHtml(`${sektor} ${unit ? '(' + unit + ')' : ''}`);
  const safeFileUrl = sanitizeSafeUrl(fileUrl);
  const safeWebAppUrl = sanitizeSafeUrl(cfg.WEB_APP_URL);

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #0f766e; padding: 20px; text-align: center;">
        <h2 style="color: white; margin: 0;">PENGESAHAN TINDAKAN DELEGASI</h2>
        <p style="color: #ccfbf1; margin: 5px 0 0 0; font-size: 14px;">Tindakan Anda Telah Direkodkan</p>
      </div>
      <div style="padding: 30px; background-color: #ffffff;">
        <p style="color: #334155; font-size: 16px; margin-top: 0;">Assalamualaikum dan Salam Sejahtera ${safeDelegasiNama},</p>
        <p style="color: #475569; line-height: 1.6;">${statusText}</p>

        <div style="background-color: #f0fdfa; border-left: 4px solid #0f766e; padding: 15px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Perkara:</strong> ${safeTajuk}</p>
          <p style="margin: 0 0 10px 0;"><strong>No. Rujukan:</strong> ${safeRujukan}</p>
          <p style="margin: 0 0 10px 0;"><strong>Sektor/Unit:</strong> ${safeSektorUnit}</p>
          <p style="margin: 0;"><strong>Salinan Asal:</strong> <a href="${safeFileUrl}" style="color: #0f766e; text-decoration: none; font-weight: bold;">Lihat / Muat Turun Dokumen</a></p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; margin: 20px 0; border-radius: 6px;">
          <p style="margin: 0 0 10px 0; color: #334155;"><strong>Ringkasan PIC:</strong></p>
          <ul style="margin: 0; padding-left: 20px; color: #475569; line-height: 1.6;">
            ${picList}
          </ul>
        </div>

        <p style="color: #64748b; font-size: 13px; line-height: 1.6;"><em>Emel ini dihantar sebagai pengesahan ringkas bahawa tindakan delegasi kendiri telah berjaya direkodkan. Tiada tindakan lanjut diperlukan melalui emel ini.</em></p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${safeWebAppUrl}" style="background-color: #0f766e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Akses Sistem Pangkalan Data</a>
        </div>
      </div>
    </div>
  `;

  const effectiveUser = Session.getEffectiveUser().getEmail();
  const bccList = [effectiveUser].filter(e => e && e.trim() !== '').join(',');
  MailApp.sendEmail({
    to: delegasiEmail,
    bcc: bccList,
    subject: subject,
    htmlBody: htmlBody,
    name: 'Sistem Memo@AG'
  });

  return {
    status: 'success',
    message: 'Pengesahan tindakan delegasi kendiri berjaya dihantar.'
  };
}

function handleDeleteEvent(eventId) {
  if (!eventId) {
    return { status: 'error', message: 'ID Acara tidak dibekalkan.' };
  }

  try {
    const cfg = getScriptConfig();
    const cal = CalendarApp.getCalendarById(cfg.CALENDAR_ID);
    const event = cal.getEventById(eventId);

    if (event) {
      event.deleteEvent();
      return { status: 'success', message: 'Acara kalendar berjaya dipadam.' };
    } else {
      return { status: 'not_found', message: 'Acara tidak dijumpai di kalendar.' };
    }
  } catch (e) {
    return { status: 'error', message: 'Ralat Kalendar: ' + e.toString() };
  }
}

function getColorForSektor(sektor) {
  let hash = 0;
  if (!sektor) return CalendarApp.EventColor.BLUE;

  for (let i = 0; i < sektor.length; i++) {
    const char = sektor.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const colors = [
    CalendarApp.EventColor.BLUE,
    CalendarApp.EventColor.GREEN,
    CalendarApp.EventColor.RED,
    CalendarApp.EventColor.YELLOW,
    CalendarApp.EventColor.ORANGE,
    CalendarApp.EventColor.PALE_BLUE,
    CalendarApp.EventColor.PALE_GREEN,
    CalendarApp.EventColor.PALE_RED
  ];

  return colors[Math.abs(hash) % colors.length];
}