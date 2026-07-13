# Contributing to SecureNotes

Thank you for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/Dika1485/securenotes.git
cd securenotes
npm install
```

## Rebuild the App

After editing `src/app.jsx`, rebuild with:

```bash
npx esbuild src/app.jsx --bundle --outfile=index.html --format=iife --platform=browser --target=es2020 --minify
```

## Guidelines

- Keep the app as a **single HTML file** — no build pipeline required for end users
- Do not introduce external runtime CDN dependencies
- Security-sensitive changes (crypto, auth) must include a clear explanation
- Keep the UI accessible and mobile-friendly

## Submitting a PR

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes
4. Open a Pull Request with a clear description

## Reporting Bugs

Open a GitHub Issue with steps to reproduce, browser/OS info, and any console errors.
