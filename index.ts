import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const CHANNEL_ID = Deno.env.get("EROM_CHANNEL_ID") ?? "";
const APP_URL = "https://erom.tech4ag.my";
const CH_URL = Deno.env.get("EROM_CHANNEL_URL") ?? "";

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ROOM_OPTIONS = [
  "PKG Melekek - Bilik Kuliah (25 orang)",
  "PKG Melekek - Bilik Mesyuarat (25 orang)",
  "PKG Masjid Tanah - Bilik Seri Cempaka (24 orang)",
  "PKG Masjid Tanah - Bilik Seri Melur (18 orang)",
  "PKG Masjid Tanah - Bilik Pendidikan Digital (12 orang)",
  "Bilik Mesyuarat PPDAG di SK Alor Gajah 1 (40 orang)",
  "Bilik Mesyuarat Utama PPDAG (73 orang)",
  "Bilik Perbincangan PPDAG (15 orang)",
  "Makmal Komputer PPDAG (31 orang)",
  "Bilik Seminar PPDAG (22 orang)",
  "Bilik Temuduga PPDAG (4 orang)",
  "Bilik Runding Cara PPDAG (4 orang)",
  "Kafeteria PPDAG (30 orang)"
];

const BM_MONTHS = [
  "Januari",
  "Februari",
  "Mac",
  "April",
  "Mei",
  "Jun",
  "Julai",
  "Ogos",
  "September",
  "Oktober",
  "November",
  "Disember"
];

interface BookingRecord {
  id?: string;
  bilik: string;
  tarikh: string;
  masa_mula: string;
  masa_tamat: string;
  kategori?: string;
  tujuan: string;
  sektor: string;
  nama_penempah: string;
  status?: string;
}

interface BufferedWebhook {
  type: string;
  records: BookingRecord[];
  timerId: number;
}

const webhookBuffer = new Map<string, BufferedWebhook>();

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>]/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    return ch;
  });
}

async function tgCall(method: string, payload: Record<string, unknown>) {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch {
    return null;
  }
}

async function sendMessage(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  await tgCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra
  });
}

async function answerCallback(id: string, text = "") {
  await tgCall("answerCallbackQuery", { callback_query_id: id, text });
}

async function editMarkup(chatId: number | string, messageId: number) {
  await tgCall("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] }
  });
}

function startKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Pengguna (Info)", callback_data: "role:user" }],
      [{ text: "PIC Bilik (Daftar)", callback_data: "role:pic" }]
    ]
  };
}

function closeKeyboard() {
  return {
    inline_keyboard: [[{ text: "Tutup", callback_data: "close" }]]
  };
}

function roomsKeyboard(rooms: string[]) {
  const rows = rooms.map((r) => [{ text: r, callback_data: `pick:${r.substring(0, 50)}` }]);
  rows.push([{ text: "Tutup", callback_data: "close" }]);
  return { inline_keyboard: rows };
}

async function getTakenRooms(): Promise<Set<string>> {
  const { data, error } = await supabase.from("erom_pic").select("bilik");
  if (error || !data) return new Set();
  return new Set(data.map((r: { bilik: string }) => r.bilik));
}

async function assignRoom(telegramId: number, username: string | undefined, roomPart: string) {
  const fullRoomName = ROOM_OPTIONS.find((r) => r.startsWith(roomPart));
  if (!fullRoomName) return { ok: false, reason: "Bilik tidak ditemui dalam sistem." };

  const { data: existing, error: errExist } = await supabase
    .from("erom_pic")
    .select("bilik")
    .eq("bilik", fullRoomName)
    .limit(1);

  if (errExist) return { ok: false, reason: errExist.message };
  if (existing && existing.length > 0) return { ok: false, reason: "Maaf, bilik ini sudah mempunyai PIC." };

  const { error } = await supabase.from("erom_pic").insert([
    {
      telegram_id: telegramId,
      telegram_username: username ?? null,
      bilik: fullRoomName,
      is_pic: true
    }
  ]);

  if (error) return { ok: false, reason: error.message };
  return { ok: true, roomName: fullRoomName };
}

async function listMyRooms(telegramId: number): Promise<string[]> {
  const { data, error } = await supabase
    .from("erom_pic")
    .select("bilik")
    .eq("telegram_id", telegramId);

  if (error || !data) return [];
  return data.map((r: { bilik: string }) => r.bilik);
}

function parseTarikh(ymd: string) {
  const [y, m, d] = String(ymd || "").split("-");
  return {
    year: parseInt(y, 10),
    month: parseInt(m, 10) - 1,
    day: parseInt(d, 10)
  };
}

function formatTarikhBM(tarikhArray: string[]): string {
  if (!tarikhArray || tarikhArray.length === 0) return "Tiada Tarikh";
  if (tarikhArray.length === 1) {
    const t = parseTarikh(tarikhArray[0]);
    return `${t.day} ${BM_MONTHS[t.month]} ${t.year}`;
  }

  const sorted = [...tarikhArray].sort((a, b) => a.localeCompare(b));
  const first = parseTarikh(sorted[0]);
  const last = parseTarikh(sorted[sorted.length - 1]);

  if (first.year !== last.year) {
    return `${first.day} ${BM_MONTHS[first.month]} ${first.year} - ${last.day} ${BM_MONTHS[last.month]} ${last.year}`;
  }
  if (first.month !== last.month) {
    return `${first.day} ${BM_MONTHS[first.month]} - ${last.day} ${BM_MONTHS[last.month]} ${first.year}`;
  }
  return `${first.day} - ${last.day} ${BM_MONTHS[first.month]} ${first.year}`;
}

function processWebhookToBuffer(payload: { type: string; record: BookingRecord }) {
  const record = payload.record;
  const type = payload.type;

  const isInsert = type === "INSERT";
  const isCancel = type === "UPDATE" && record.status === "DIBATALKAN";

  if (!isInsert && !isCancel) {
    sendBookingNotification([record], type, false);
    return;
  }

  const actionPrefix = isCancel ? "CANCEL" : "NEW";
  const groupKey = `${actionPrefix}|${record.bilik}|${record.masa_mula}|${record.masa_tamat}|${record.tujuan}|${record.nama_penempah}`;

  if (webhookBuffer.has(groupKey)) {
    const buffered = webhookBuffer.get(groupKey)!;
    buffered.records.push(record);
    clearTimeout(buffered.timerId);
    buffered.timerId = setTimeout(() => flushBuffer(groupKey), 2500);
  } else {
    const timerId = setTimeout(() => flushBuffer(groupKey), 2500);
    webhookBuffer.set(groupKey, { type, records: [record], timerId });
  }
}

async function flushBuffer(groupKey: string) {
  const buffered = webhookBuffer.get(groupKey);
  if (!buffered) return;
  webhookBuffer.delete(groupKey);

  buffered.records.sort((a, b) => String(a.tarikh || "").localeCompare(String(b.tarikh || "")));
  await sendBookingNotification(buffered.records, buffered.type, buffered.records.length > 1);
}

async function sendBookingNotification(records: BookingRecord[], eventType: string, isGrouped: boolean) {
  if (!CHANNEL_ID || !records || records.length === 0) return;

  const record = records[0];

  let title = "📢 TEMPAHAN BARU";
  let statusEmoji = "🟢";

  if (eventType === "UPDATE") {
    if (record.status === "DIBATALKAN") {
      title = "❌ TEMPAHAN DIBATALKAN";
      statusEmoji = "🔴";
    } else {
      title = "✏️ TEMPAHAN DIKEMASKINI";
      statusEmoji = "🟡";
    }
  }

  if (isGrouped && eventType === "INSERT") title = "📢 TEMPAHAN BERTURUT";
  if (isGrouped && record.status === "DIBATALKAN") title = "❌ PEMBATALAN PUKAL";

  let picUsername = "Tiada PIC";
  let picId: number | string | null = null;

  const { data: picData } = await supabase
    .from("erom_pic")
    .select("telegram_username, telegram_id")
    .eq("bilik", record.bilik)
    .maybeSingle();

  if (picData) {
    if (picData.telegram_username) picUsername = `@${picData.telegram_username}`;
    if (picData.telegram_id) picId = picData.telegram_id;
  }

  const arrTarikh = records.map((r) => r.tarikh);
  const strTarikh = formatTarikhBM(arrTarikh);
  const hariBekerjaText = isGrouped ? ` <i>(${records.length} hari bekerja)</i>` : "";
  const masaMula = escapeHtml(String(record.masa_mula || "").slice(0, 5));
  const masaTamat = escapeHtml(String(record.masa_tamat || "").slice(0, 5));

  const msg = `
<b>${title}</b> ${statusEmoji}

🏛 <b>Bilik:</b> ${escapeHtml(record.bilik)}
📅 <b>Tarikh:</b> ${escapeHtml(strTarikh)}${hariBekerjaText}
⏰ <b>Masa:</b> ${masaMula} - ${masaTamat}
📝 <b>Tujuan:</b> ${escapeHtml(record.tujuan)}
👤 <b>Penempah:</b> ${escapeHtml(record.nama_penempah)}
🏢 <b>Sektor:</b> ${escapeHtml(record.sektor)}
👮 <b>PIC Bilik:</b> ${escapeHtml(picUsername)}

<i>Sila layari <a href="${APP_URL}">eROM Web</a> untuk maklumat lanjut.</i>
`;

  await sendMessage(CHANNEL_ID, msg);

  if (picId) {
    const privateMsg = `🔔 <b>Notifikasi PIC</b>\n\nSatu aktiviti telah berlaku pada bilik jagaan anda:\n${msg}\n\n<i>Sila pantau tempahan ini.</i>`;
    await sendMessage(picId, privateMsg);
  }
}

async function handleStart(chatId: number) {
  await sendMessage(chatId, "<b>eROM@AG Bot</b>\nSelamat datang. Sila pilih peranan anda:", {
    reply_markup: startKeyboard()
  });
}

async function handleUserInfo(chatId: number) {
  const text = `ℹ️ <b>Info Sistem</b>\n\n• Aplikasi Web: ${escapeHtml(APP_URL)}\n• Saluran Notifikasi: ${escapeHtml(CH_URL)}`;
  await sendMessage(chatId, text, {
    reply_markup: closeKeyboard()
  });
}

async function handleAvailableRooms(chatId: number) {
  const taken = await getTakenRooms();
  const available = ROOM_OPTIONS.filter((r) => !taken.has(r));

  if (available.length === 0) {
    await sendMessage(chatId, "Semua bilik sudah mempunyai PIC.", {
      reply_markup: closeKeyboard()
    });
  } else {
    await sendMessage(chatId, "Sila pilih bilik untuk didaftarkan sebagai PIC:", {
      reply_markup: roomsKeyboard(available)
    });
  }
}

async function handlePickRoom(cb: {
  id: string;
  data: string;
  from: { id: number; username?: string };
  message: { chat: { id: number }; message_id: number };
}) {
  const chatId = cb.message.chat.id;
  const messageId = cb.message.message_id;
  const user = cb.from;
  const roomPart = cb.data.slice("pick:".length);

  const res = await assignRoom(user.id, user.username, roomPart);

  if (res.ok && res.roomName) {
    await answerCallback(cb.id, "Berjaya didaftarkan!");
    await editMarkup(chatId, messageId);

    const mine = await listMyRooms(user.id);
    const listText = mine.map((x) => `• ${escapeHtml(x)}`).join("\n");
    const text = `✅ <b>Pendaftaran Berjaya</b>\n\nAnda kini PIC untuk:\n<b>${escapeHtml(res.roomName)}</b>\n\nSenarai bilik anda:\n${listText}`;

    await sendMessage(chatId, text, { reply_markup: closeKeyboard() });
  } else {
    await answerCallback(cb.id, res.reason ?? "Gagal.");
  }
}

async function handleStatus(msg: { chat: { id: number }; from: { id: number } }) {
  const chatId = msg.chat.id;
  const mine = await listMyRooms(msg.from.id);

  if (mine.length === 0) {
    await sendMessage(chatId, "Anda belum mendaftar sebagai PIC mana-mana bilik.", {
      reply_markup: closeKeyboard()
    });
  } else {
    const listText = mine.map((x) => `• ${escapeHtml(x)}`).join("\n");
    const text = `📋 <b>Status PIC</b>\n\nBilik di bawah kendalian anda:\n${listText}`;
    await sendMessage(chatId, text, {
      reply_markup: closeKeyboard()
    });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Bot Active (Root)");

  try {
    const payload = await req.json();
    if (!payload || typeof payload !== "object") {
      return new Response("Invalid Payload", { status: 400 });
    }

    if ((payload.type === "INSERT" || payload.type === "UPDATE") && payload.table === "erom_bookings" && payload.record) {
      processWebhookToBuffer(payload);
      return new Response("Notified - Buffer processing started");
    }

    if (payload.message) {
      const msg = payload.message;
      const chatId = msg.chat.id;
      const text = msg.text ?? "";

      if (text.startsWith("/start")) {
        await handleStart(chatId);
      } else if (text.startsWith("/bilik")) {
        await handleAvailableRooms(chatId);
      } else if (text.startsWith("/status")) {
        await handleStatus(msg);
      } else {
        await handleStart(chatId);
      }
      return new Response("OK");
    }

    if (payload.callback_query) {
      const cb = payload.callback_query;
      const data = cb.data ?? "";
      const chatId = cb.message.chat.id;

      if (data === "role:user") {
        await answerCallback(cb.id);
        await handleUserInfo(chatId);
      } else if (data === "role:pic") {
        await answerCallback(cb.id);
        await handleAvailableRooms(chatId);
      } else if (data.startsWith("pick:")) {
        await handlePickRoom(cb);
      } else if (data === "close") {
        await answerCallback(cb.id, "Ditutup");
        await editMarkup(chatId, cb.message.message_id);
      }
      return new Response("OK");
    }
  } catch {
    return new Response("OK");
  }

  return new Response("OK");
});