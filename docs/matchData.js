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

  async function loadStaticMatches() {
    try {
      const showOldSeasons = localStorage.getItem('show_old_seasons') === 'true';
      let allMatches = [];
      
      // If show_old_seasons is enabled, load the old season file first
      if (showOldSeasons) {
        try {
          const oldSeasonRes = await fetch('data/jar2024_5kolo+.json', { cache: 'force-cache' });
          if (oldSeasonRes.ok) {
            const oldSeasonData = await oldSeasonRes.json();
            if (Array.isArray(oldSeasonData)) {
              allMatches = [...oldSeasonData];
            }
          }
        } catch (e) {
          console.error('Error loading old season matches:', e);
        }
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
