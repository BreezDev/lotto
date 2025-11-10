# LottoLife Simulator

A Flask-powered life simulator for newly minted lottery winners. Features include:

- Full life-sim catalogs for cars, homes, businesses, investments, and charities.
- Happiness, reputation, and milestone tracking with dozens of achievements.
- Import/export saves, local autosave, and optional email snapshots through Resend.
- Mobile-first dashboard with Progressive Web App support, service worker, and manifest.

## Getting started

1. Install dependencies and run the Flask dev server:
   ```bash
   pip install -r requirements.txt
   flask --app app run --debug
   ```
2. Visit `http://127.0.0.1:5000/start` and enter your jackpot (capped at $1,000,000,000).
3. Play through the simulator, explore every tab, and update the leaderboard from the Portfolio tab when you finish a run.

## Resend email setup

The simulator can email start summaries and save-state snapshots. Create an API key at [Resend](https://resend.com) and expose it to the app:

```bash
export RESEND_API_KEY="your_live_api_key"
```

The key is read on startup inside `app.py`. Leave the variable unset to disable outbound email.

## Importing & exporting saves

- Use the **Export Save** button to download a JSON snapshot of your current run.
- Restore progress with **Import Save** on the Portfolio or Lifestyle tabs.
- Saves also persist in browser storage under the key `lotto-life-save-v2`.

## Progressive Web App

The project ships with `static/manifest.json`, service worker caching in `static/js/sw.js`, and 192px/512px icons inside `static/icons/`. Browsers that support PWA installation will show an install prompt after you visit the simulator.

## Database

Player snapshots for the leaderboard are stored in `game.db`. The schema updates automatically via `init_db()` when the app starts. Delete the file to clear the leaderboard.
