# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **This repo is retired.** The live site moved to **miniliga.sk**, served from the `luka4/miniliga` repo (local clone `~/server/miniliga`). Make all site and data changes there. Here, every `docs/*.html` page is only a redirect to the same path on miniliga.sk; the remaining JS/CSS/data files and the Autrin workflow are unused leftovers. The rest of this file describes the site as it was before the move.

## Overview

"Spinbook" / miniliga.online: a table-tennis league site (Elo-style player and team ratings, standings, schedule, predictions, per-player and per-team stats). It is a **static, no-build site** served from `docs/` (GitHub Pages, custom domain in `docs/CNAME`). There is no package manager, bundler, linter or test suite. Edit files directly and open the pages in a browser, or serve locally with `python3 -m http.server -d docs`.

## Architecture

- **Pages** (`docs/*.html`: index, table, results, schedule, rating, prediction, mystats, myteam, highlights, admin) are thin shells. Each loads the same script chain in this order: `googleSheetsLoader.js` → `seasonRosters.js` → `matchData.js` → `script.js`. Order matters because they communicate through globals (`matchResults`, `window.matchResultsPromise`, `SeasonRosters`, `GoogleSheetsLoader`).
- **`script.js`** (~9.5k lines) holds nearly all logic, in numbered sections: 1. constants/config, 2. helpers (names, teams, rosters, dates), 3. core data engine (Elo processing, ratings, achievements/badges), 4. page renderers. Each page's renderer runs based on which DOM elements exist. Search for section banners (`// N. ...`) to navigate.
- **Match data pipeline** (`matchData.js`): static JSON from `docs/data/` is merged with live rows from the Google Sheet (`Results` tab, column P, each cell a JSON match object). Match fields: `score_a/b`, `player_a/b`, `player_a/b_team`, `round` ("N kolo"), `season` (e.g. "JESEŇ 2025"), `date` ("YYYY-MM-DD HH:mm"), `doubles`.
  - `data/matches.json` is the current static set. `data/4l2024_2025.json` and `data/4l2025_2026.json` are historical or 4. liga data. `data/jar2024_5kolo+.json` and `data/matches_ttbl.json` are additional datasets.
  - Mode flags in localStorage, set from `admin.html`: `show_old_seasons` prepends the old-season file. `show_4_lliga` is exclusive: it loads only the two 4. liga files, skips the Google Sheet and uses `INITIAL_RATING_4_LIGA`.
  - **Autrin scraper**: the `JESEŇ 2026` block of `data/matches.json` is gap-filled (manually triggered via Actions → "Autrin data", not scheduled) by `.github/workflows/autrin-data.yml` (`scripts/autrin/crawl.mjs`, scrapes autrin.sk) and pushed to `main`. It only adds team matches that are missing or still `WO/WO` placeholders; rows that already hold real data are never touched, so manual fixes stay; placeholders for unplayed matches follow autrin's date/time/place. Names keep our spelling: the `DB_<SEASON>` roster tab is the authority, then names already in `matches.json`, then overrides in `scripts/autrin/name-map.json` (also team/location fixes). New players are guessed as `First LAST` and listed in the run summary. For a new season, pass `--rocnik` and `--season` (and update the workflow).
- **`googleSheetsLoader.js`**: fetches tabs from one Google Spreadsheet via the gviz (Visualization API) endpoint. `script.js` also reads a `Config` tab.
- **`seasonRosters.js`**: per-season team membership from `DB_<SEASON>` sheet tabs (col A player, col B team), cached in localStorage. This is the authority for which team a player belongs to in a season; match data alone would attribute a player to their last team. Add new seasons to `ROSTER_SEASONS` (oldest → newest) when a new tab is created.
- **Ratings**: Elo from `INITIAL_RATING` (100), with a K-factor that decreases with matches played (`K_FACTOR_STAGES`) plus a performance-based effectiveness measure. Ratings are recomputed client-side from the full match list on each load, with memoization in `processDataCache` (call `clearProcessDataCache()` after changing inputs).
- **`auth.js`**: client-side "site closed" gate that prompts for a daily token (DDMM) and caches auth in localStorage for 24h. Not real security.

## Conventions

- **Cache busting is manual.** Scripts are referenced as `script.js?v=14` etc. in every HTML page, and `matchData.js` has `ASSET_VERSION` for `matches.json`. After changing a JS file or `matches.json`, bump the version in all pages that reference it (grep for the filename).
- Team logos live in `docs/media/team_logos/` and are mapped by uppercased team name in `TEAM_LOGOS` in `script.js`. A new team needs both a file and a mapping.
- UI text and data (player names, rounds like "kolo", day names) are Slovak. Keep diacritics intact in JSON and names.
- Recent history is mostly data fixes to `docs/data/matches.json` (dates, schedule shifts), done through PR branches.
