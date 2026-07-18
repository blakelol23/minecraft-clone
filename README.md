# Minecraft Clone — GitHub Pages

This repository contains a static HTML/JS game in the `blue/` folder. These changes make the project GitHub Pages ready.

- `index.html`: redirects to `blue/game.html` so the site works from the repository root.
- `CNAME`: placeholder for a custom domain (replace `example.com` with your domain).
- `.nojekyll`: prevents Jekyll processing on GitHub Pages.
- `.github/workflows/deploy-gh-pages.yml`: optional workflow to auto-publish the `blue/` site to the `gh-pages` branch on push.

Quick setup

1. (Optional) Replace the contents of `CNAME` with your custom domain.
2. Open repository Settings → Pages and choose the publishing source:
   - To publish directly from the `gh-pages` branch (auto-deploy): enable Pages and set the source to `gh-pages` branch.
   - Or publish from the `main` branch `/root` (since `index.html` redirects to `blue/game.html`).
3. If you'd like automatic publishing to `gh-pages` on pushes to `main`, enable GitHub Actions for this repo — the included workflow will publish the `blue/` folder.

Local testing

Serve locally and open http://localhost:8000:

```bash
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```
