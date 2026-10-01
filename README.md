# Rakit - Sistem Persediaan Perlengkapan Elektronik

Aplikasi persediaan sederhana dengan frontend HTML/CSS/JavaScript dan backend Node.js tanpa paket tambahan. Data disimpan di Supabase PostgreSQL.

## Struktur

```text
.gitignore
frontend/
  index.html
  styles.css
  app.js
backend/
  app.js
  schema.sql
docs/
  skema-persediaan.md
README.md
```

## ERD | Peta Relasi Data

> **CIRCUIT MAP / 04 ENTITAS / 03 RELASI**  
> `products` menjadi simpul utama yang menghubungkan klasifikasi, pemasok, dan jejak pergerakan stok.

```mermaid
erDiagram
  CATEGORIES ||--o{ PRODUCTS : "mengelompokkan"
  SUPPLIERS ||--o{ PRODUCTS : "memasok"
  PRODUCTS ||--o{ STOCK_MOVEMENTS : "memiliki riwayat"
```

| Entitas | Primary key | Foreign key dan aturan penting | Fungsi |
| --- | --- | --- | --- |
| `categories` | `id` (`uuid`) | `name` wajib dan unik. | Mengelompokkan jenis perlengkapan. |
| `suppliers` | `id` (`uuid`) | `name` wajib dan unik. | Menyimpan identitas serta kontak pemasok. |
| `products` | `id` (`uuid`) | `category_id` → `categories.id`; `supplier_id` → `suppliers.id`; `sku` unik. | Menyimpan katalog, harga, saldo stok, dan batas minimum. |
| `stock_movements` | `id` (`uuid`) | `product_id` → `products.id`; jenis `in`/`out`; jumlah positif. | Menyimpan riwayat perubahan stok. |

### Cara Membaca Relasi

- **Kategori → Barang (1:N):** satu kategori dapat berisi banyak barang; setiap barang wajib memiliki satu kategori.
- **Pemasok → Barang (1:N):** satu pemasok dapat memasok banyak barang; setiap barang wajib memiliki satu pemasok.
- **Barang → Mutasi (1:N):** satu barang dapat memiliki banyak catatan mutasi; setiap catatan mutasi mengacu pada satu barang.
- Kategori dan pemasok tidak terhubung langsung. `products` menjadi penghubungnya.

Fungsi database `record_stock_movement` memperbarui saldo dan menyimpan riwayat dalam satu transaksi. Mutasi keluar ditolak jika jumlahnya melebihi stok yang tersedia. [Lihat dokumentasi skema lengkap](docs/skema-persediaan.md).

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
