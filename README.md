# Rakit - Sistem Persediaan Perlengkapan Elektronik

Aplikasi persediaan sederhana dengan frontend HTML/CSS/JavaScript dan backend Node.js tanpa paket tambahan. Data disimpan di Supabase PostgreSQL.

## Struktur

```text
frontend/
  index.html
  styles.css
  app.js
backend/
  app.js
  schema.sql
README.md
```

## ERD: 4 entitas

```text
categories 1 ─── n products n ─── 1 suppliers
                         |
                         1
                         |
                         n
                  stock_movements
```

- `categories`: klasifikasi perlengkapan.
- `suppliers`: data pemasok.
- `products`: katalog, harga, stok berjalan, dan batas minimum.
- `stock_movements`: catatan barang masuk atau keluar.

Jumlah stok diperbarui bersama catatan mutasi dalam satu transaksi database. Stok keluar yang melebihi stok tersedia akan ditolak.

## Menyiapkan Supabase

1. Buat proyek Supabase PostgreSQL.
2. Buka **SQL Editor**, lalu jalankan isi [backend/schema.sql](backend/schema.sql).
3. Dari proyek yang sama, salin **Project URL** melalui dialog **Connect**, dan salin key backend dari **Settings > API Keys**. Gunakan key **Secret** (`sb_secret_...`) atau legacy **service_role** (`eyJ...`), bukan `publishable`. Simpan key hanya di backend dan jangan bagikan.

## Menjalankan aplikasi

Gunakan Node.js 18 atau lebih baru. Buka PowerShell di folder proyek, isi URL dengan Project URL milik Anda, lalu masukkan secret key saat diminta. Input key disembunyikan oleh PowerShell.

```powershell
$env:SUPABASE_URL = "https://PROJECT-REF.supabase.co"
$secureKey = Read-Host "Masukkan Supabase secret/service_role key" -AsSecureString
$env:SUPABASE_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new("", $secureKey).Password
node .\backend\app.js
```

Jika Node terpasang di `D:\node.exe` dan perintah `node` belum dikenali, gunakan `D:\node.exe .\backend\app.js` pada baris terakhir. Buka `http://localhost:3000` di browser. URL dan key harus berasal dari proyek Supabase yang sama. Untuk menghentikan server, tekan `Ctrl+C` pada terminal.

## Alur awal

1. Buka **Data referensi** untuk menambah kategori dan pemasok.
2. Pilih **Barang baru** untuk mencatat perlengkapan.
3. Gunakan **Catat mutasi** untuk menambah atau mengurangi stok.

Tidak diperlukan `package.json`, file `.env`, maupun `.env.example`.