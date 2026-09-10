# Recon_Sentinel

Recon Sentinel is a Vite + React web application configured for GitHub Pages deployment.

## Run locally

```bash
npm ci
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages deployment

This repository includes `.github/workflows/deploy-pages.yml` to deploy the `dist` output to GitHub Pages on pushes to `main`.

1. In GitHub, open **Settings → Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Push changes to `main` (or run the workflow manually)

The app uses hash-based routing so all pages and components load correctly on GitHub Pages.
