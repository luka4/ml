/* seasonRosters.js
   Per-season team membership.

   The spreadsheet holds one tab per season named `DB_<SEASON>` (e.g. `DB_JESEŇ 2025`)
   with the player name in column A and the team they play for that season in column B:

       Matúš HRČKA     ASTORIAFIT
       Roman ČIŽMÁR    BERNARD Club
       ...

   Match data only tells us which team a player played for in a given match, so a player
   who changed clubs would otherwise be counted in whichever team they played for last.
   These lists are the authoritative answer to "which team was this player in, in season X",
   and are used for team rosters, team ratings and the per-season team shown on a player.

   Add a new season here when a new `DB_...` tab is created; the order is oldest -> newest.
*/

const SeasonRosters = (() => {
  const ROSTER_SEASONS = ['JESEŇ 2025', 'JAR 2026', 'JESEŇ 2026'];
  const SHEET_PREFIX = 'DB_';
  const QUERY = 'SELECT A, B';
  const CACHE_KEY = 'season_rosters_v1';
  const CACHE_TTL_MS = 10 * 60 * 1000; // rosters change rarely; re-check every 10 minutes

  // Values that mean "this row is a header, not a player".
  const HEADER_NAMES = new Set(['hráč', 'hrac', 'hráči', 'hraci', 'meno', 'player', 'name']);

  const normalizeName = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const nameKey = (v) => normalizeName(v).toLowerCase();
  const teamKey = (v) => normalizeName(v).toUpperCase();

  // season -> { season, order, playerToTeam: Map(nameKey -> team), teams: Map(teamKey -> {name, players[]}) }
  const bySeason = new Map();
  let loadPromise = null;
  let ready = false;

  function ingest(season, order, pairs) {
    const playerToTeam = new Map();
    const teams = new Map();

    pairs.forEach(([rawName, rawTeam], index) => {
      const name = normalizeName(rawName);
      const team = normalizeName(rawTeam);
      if (!name || !team) return;
      // gviz can hand back a header row when the tab has one
      if (index === 0 && HEADER_NAMES.has(name.toLowerCase())) return;

      const pKey = nameKey(name);
      if (playerToTeam.has(pKey)) return; // first entry wins on duplicates
      playerToTeam.set(pKey, team);

      const tKey = teamKey(team);
      if (!teams.has(tKey)) teams.set(tKey, { name: team, players: [] });
      teams.get(tKey).players.push(name);
    });

    if (playerToTeam.size === 0) return;
    bySeason.set(season, { season, order, playerToTeam, teams });
  }

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.ts !== 'number') return null;
      if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
      if (!parsed.seasons || typeof parsed.seasons !== 'object') return null;
      return parsed.seasons;
    } catch {
      return null;
    }
  }

  function writeCache(seasons) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), seasons }));
    } catch {
      // storage unavailable / full - caching is best effort only
    }
  }

  async function fetchSeason(season) {
    if (!window.GoogleSheetsLoader) return [];
    const rows = await window.GoogleSheetsLoader.fetchSheet({
      sheetName: `${SHEET_PREFIX}${season}`,
      query: QUERY,
      // The tabs have no header row, so ask gviz not to swallow the first one.
      extraParams: { headers: '0' },
      cache: true
    });
    return rows
      .map((row) => [row?.c?.[0]?.v ?? '', row?.c?.[1]?.v ?? ''])
      .filter(([name, team]) => normalizeName(name) && normalizeName(team));
  }

  async function loadAll() {
    const cached = readCache();
    if (cached) {
      ROSTER_SEASONS.forEach((season, order) => {
        if (Array.isArray(cached[season])) ingest(season, order, cached[season]);
      });
      if (bySeason.size > 0) {
        ready = true;
        return api;
      }
    }

    const results = await Promise.all(ROSTER_SEASONS.map(fetchSeason));
    const toCache = {};
    ROSTER_SEASONS.forEach((season, order) => {
      const pairs = results[order] || [];
      toCache[season] = pairs;
      ingest(season, order, pairs);
    });
    if (bySeason.size > 0) writeCache(toCache);
    ready = true;
    return api;
  }

  function load() {
    if (!loadPromise) {
      loadPromise = loadAll().catch((e) => {
        console.error('Error loading season rosters:', e);
        ready = true;
        return api;
      });
    }
    return loadPromise;
  }

  const seasonsOldestFirst = () =>
    Array.from(bySeason.values()).sort((a, b) => a.order - b.order);

  const api = {
    load,
    isReady: () => ready,
    hasData: () => bySeason.size > 0,

    /** Season names that actually have roster entries, oldest -> newest. */
    seasons: () => seasonsOldestFirst().map((s) => s.season),

    /** Newest season with roster entries, or null. */
    currentSeason: () => {
      const all = seasonsOldestFirst();
      return all.length ? all[all.length - 1].season : null;
    },

    hasSeason: (season) => bySeason.has(season),

    /** Team the player was registered for in that season, or null. */
    teamOfPlayer: (playerName, season) =>
      bySeason.get(season)?.playerToTeam.get(nameKey(playerName)) ?? null,

    /** [{season, team}] for every season the player is listed in, oldest -> newest. */
    seasonTeamsOfPlayer: (playerName) => {
      const key = nameKey(playerName);
      return seasonsOldestFirst()
        .map((s) => ({ season: s.season, team: s.playerToTeam.get(key) || null }))
        .filter((entry) => entry.team !== null);
    },

    /** Player names registered for the team that season, or null when unknown. */
    rosterOfTeam: (teamName, season) =>
      bySeason.get(season)?.teams.get(teamKey(teamName))?.players?.slice() ?? null,

    /** Map(normalized team name -> {name, players[]}) for the season, or null. */
    teamsOfSeason: (season) => bySeason.get(season)?.teams ?? null,

    /** Normalization helpers, shared with script.js so both sides match names the same way. */
    nameKey,
    teamKey,
    ROSTER_SEASONS
  };

  return api;
})();

window.SeasonRosters = SeasonRosters;
// Kick off loading immediately; script.js awaits this before the first render.
window.seasonRostersPromise = SeasonRosters.load();
