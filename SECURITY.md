# Security Policy

## Encryption

All sensitive note content is encrypted **client-side** using:
- **AES-256-GCM** for encryption
- **PBKDF2** (310,000 iterations, SHA-256) for key derivation
- **Web Crypto API** — native browser implementation, no third-party crypto library

The server (Supabase) only ever receives encrypted ciphertext. Anthropic, Supabase, or any third party cannot read your note contents.

## ⚠️ Important Warnings

- **Lost passphrase = lost data.** There is no passphrase recovery mechanism.
- The app credentials (Supabase URL and anon key) are stored in `localStorage`. Do not use this app on shared or public devices.
- The anon key is safe to expose publicly — it is restricted by Supabase Row Level Security policies.

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not open a public GitHub issue**.

Instead, report it by emailing the repository owner directly or opening a [GitHub Security Advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability).

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

We will respond within 72 hours.
