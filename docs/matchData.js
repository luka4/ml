/* matchData.js (lightweight loader)
   - Loads static matches from data/matches.json (so we don't ship a giant JS array)
   - Merges in dynamic matches from Google Sheets using GoogleSheetsLoader
*/

// Expose globals expected by script.js
// IMPORTANT: `script.js` uses the global identifier `matchResults`, so this must be a true global binding.
var matchResults = window.matchResults = [];

(() => {
  const ASSET_VERSION = '11';
  const STATIC_MATCHES_URL = `data/matches.json?v=${ASSET_VERSION}`;

  const RESULTS_SHEET_NAME = 'Results';
  const RESULTS_QUERY = 'SELECT P'; // Fetch only column P

  function is4LligaEnabled() {
    return localStorage.getItem('show_4_lliga') === 'true';
  }

  async function loadStaticMatches() {
    try {
      const showOldSeasons =
          localStorage.getItem('show_old_seasons') ===
          'true';
      const show4Lliga = is4LligaEnabled();
      let allMatches = [];
      const mergeSeasonMatches = async (url, { replace = false } = {}) => {
        try {
          const response = await fetch(url, { cache: 'force-cache' });
          if (!response.ok) return;
          const seasonData = await response.json();
          if (!Array.isArray(seasonData)) return;
          allMatches = replace ? [...seasonData] : [...allMatches, ...seasonData];
        } catch (e) {
          console.error('Error loading old season matches:', e);
        }
      };
      
      // show_4_lliga is exclusive mode: only these 2 season files are loaded.
      if (show4Lliga) {
        await mergeSeasonMatches('data/4l2024_2025.json', { replace: true });
        await mergeSeasonMatches('data/4l2025_2026.json');
        return allMatches;
      }

      // If show_old_seasons is enabled, load the old season file first
      if (showOldSeasons) {
        await mergeSeasonMatches('data/4l2024_2025.json', { replace: true });
      }
      
      // Then load the current matches.json
      const res = await fetch(STATIC_MATCHES_URL, { cache: 'force-cache' });
      if (!res.ok) {
        console.error('Failed to load static matches:', res.status, res.statusText);
        return allMatches;
      }
      const data = await res.json();
      const currentMatches = Array.isArray(data) ? data : [];
      
      // Merge: old season matches first, then current matches
      return [...allMatches, ...currentMatches];
    } catch (e) {
      console.error('Error loading static matches:', e);
      return [];
    }
  }

  async function loadDynamicMatches() {
    try {
      const rows = await GoogleSheetsLoader.fetchSheet({
        sheetName: RESULTS_SHEET_NAME,
        query: RESULTS_QUERY,
        cache: false
      });

      return rows
        .map((row) => {
          let cellText = row?.c?.[0]?.v ?? null;
          if (!cellText) return null;
          cellText = String(cellText).trim().replace(/,\s*$/, '');
          try {
            return JSON.parse(cellText);
          } catch {
            return null;
          }
        })
        .filter((x) => x !== null);
    } catch (e) {
      console.error('Error loading dynamic matches:', e);
      return [];
    }
  }

  async function loadMatchResults() {
    const show4Lliga = is4LligaEnabled();
    if (show4Lliga) {
      matchResults = await loadStaticMatches();
      window.matchResults = matchResults;
      return matchResults;
    }

    const [staticMatches, dynamicMatches] = await Promise.all([
      loadStaticMatches(),
      loadDynamicMatches(),
    ]);

    matchResults = [...staticMatches, ...dynamicMatches];
    window.matchResults = matchResults;

    return matchResults;
  }

  // Kick off loading immediately; script.js will await this.
  window.matchResultsPromise = loadMatchResults();
})();
