/**
 * ==============================================================================
 * SISTEM PENGURUSAN MEMO@AG
 * Modul: js/config.js
 * Tujuan: Konfigurasi global aplikasi dan inisialisasi Supabase client.
 * ==============================================================================
 */

// KONFIGURASI UTAMA
const SUPABASE_URL = 'https://app.tech4ag.my';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzMzczNjQ1LCJleHAiOjIwNzg3MzM2NDV9.vZOedqJzUn01PjwfaQp7VvRzSm4aRMr21QblPDK8AoY';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxaK3ifWFHX70UlNjZyJKJNPyRQQK6Y__whs-VWO7G0gvurkVmoOgmHPVtF-nl2Nu6S/exec';

// INISIALISASI SUPABASE KLIEN
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// PENDEDAHAN GLOBAL UNTUK KESERASIAN SCRIPT SEDIA ADA
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_KEY = SUPABASE_KEY;
window.GAS_URL = GAS_URL;
window._supabase = _supabase;
