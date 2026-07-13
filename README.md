# 🔐 SecureNotes

A privacy-first, encrypted note-taking web app for storing sensitive information — passwords, seed phrases, documents, and more.

> **No frameworks to install. No build step. Just one HTML file.**

---

## ✨ Features

- 🔒 **AES-256-GCM encryption** — notes encrypted in-browser before reaching the server
- 🌱 **Seed phrase & password manager** — dedicated categories with monospace mode
- 📎 **File & image attachments** — stored securely in Supabase Storage
- 🔑 **Authentication** — email/password sign-in via Supabase Auth
- 📱 **Fully responsive** — mobile, tablet, and desktop layouts
- 🚫 **Zero CDN dependencies** — all libraries bundled into a single HTML file
- 🌐 **Static hosting ready** — works on Netlify, GitHub Pages, Vercel, or any web server

---

## 🗂 Categories

| Icon | Category | Use For |
|------|----------|---------|
| 📝 | Note | General notes |
| 🔑 | Password | Credentials & logins |
| 🌱 | Seed Phrase | Crypto wallet recovery phrases |
| 💳 | Finance | Bank info, card numbers |
| 🔒 | Private | Personal sensitive data |
| 📎 | Other | Everything else |

---

## 🚀 Quick Start

### 1. Get Supabase credentials

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Go to **Settings → API** and copy:
   - **Project URL**
   - **anon public key**

### 2. Set up the database

Run this SQL in your **Supabase SQL Editor**:

```sql
create table if not exists notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  title        text not null default 'Untitled',
  body         text,
  category     text default 'note',
  is_encrypted boolean default false,
  attachments  jsonb default '[]',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table notes enable row level security;

create policy "own notes" on notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
  values ('note-attachments', 'note-attachments', false)
  on conflict do nothing;

create policy "own files" on storage.objects for all
  using  (auth.uid()::text = (storage.foldername(name))[1])
  with check (auth.uid()::text = (storage.foldername(name))[1]);
```

### 3. Open the app

**Option A — Local:**
```bash
# Open index.html via a local server (required)
python -m http.server 8080
# Then visit http://localhost:8080
```

**Option B — Deploy to Netlify (recommended):**
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag and drop `index.html`
3. Done — accessible from any device

**Option C — GitHub Pages:**
Push this repo and enable GitHub Pages in repository settings.

---

## 🔐 Security Model

| Layer | Implementation |
|-------|---------------|
| Encryption algorithm | AES-256-GCM |
| Key derivation | PBKDF2 (310,000 iterations, SHA-256) |
| Encryption location | Client-side only (in browser) |
| Server sees | Only encrypted ciphertext |
| Auth | Supabase Auth (email + password) |
| Storage access | Row-level security + signed URLs |

> ⚠️ **Important:** If you forget your note passphrase, the content **cannot be recovered**. There is no backdoor.

---

## 🌐 Hosting

SecureNotes is a single HTML file and can be hosted anywhere:

| Platform | How |
|----------|-----|
| **Netlify** | Drag & drop on [app.netlify.com/drop](https://app.netlify.com/drop) |
| **GitHub Pages** | Push repo → Settings → Pages → Deploy from branch |
| **Vercel** | `vercel deploy` or import from GitHub |
| **Any web server** | Copy `index.html` to your server |

---

## 🛠 Tech Stack

- **React 18** — UI framework (bundled, no CDN)
- **Supabase** — Auth, database (PostgreSQL), and file storage
- **Web Crypto API** — Native browser encryption (no external crypto library)
- **esbuild** — Used to bundle everything into one file

---

## 📁 Repository Structure

```
├── index.html          # The entire app (standalone, no dependencies)
├── src/
│   └── app.jsx         # Source code (React + JSX)
├── package.json        # Dev dependencies (esbuild only)
├── README.md
└── LICENSE
```

---

## 🔧 Development (Rebuild from Source)

```bash
npm install
npx esbuild src/app.jsx --bundle --outfile=index.html --format=iife --platform=browser --target=es2020 --minify
```

---

## 📄 License

MIT — see [LICENSE](LICENSE)
