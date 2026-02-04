/* script.js */

// ============================================================
// 1. GLOBAL CONSTANTS & CONFIG
// ============================================================
const INITIAL_RATING = 100;
const K_FACTOR_STAGES = {1: 30, 2: 26, 3: 22, 4: 18, 5: 14, default: 10};

let chartRefs = {};

// Global helper: normalize player name for lookup
const normalizePlayerKey = (name) => (name || '').trim().toLowerCase();

// Team logos (used on standings + detail)
const LOGO_BASE_PATH = 'media/team_logos';
const TEAM_LOGOS = {
    'ASTORIAFIT': 'astoria.png',
    'BERNARD CLUB': 'bernard.png',
    'BOMBERE': 'bombere.png',
    'COKERY': 'cokery.png',
    'EUROCAST': 'euro.png',
    'KOMÉTA KE': 'kometa.png',
    'METALKOV': 'metalkov.png',
    'MONTREAL': 'montreal.png',
    'MYSLAVA': 'myslava.png',
    'MYSLAVA "Ž"': 'myslavaz.png',
    'REPREX': 'reprex.png',
    'SKP "A"': 'skpa.png',
    'SKP "B"': 'skpb.png',
    'SOŠ Ž': 'sosz.png',
    'TT TEAM': 'tt.png',
    'TTC KVP': 'ttc.png'
};

function getTeamLogoSrc(teamName) {
    const key = (teamName || '').trim().toUpperCase();
    const file = TEAM_LOGOS[key];
    return file ? `${LOGO_BASE_PATH}/${file}` : null;
}

// ============================================================
// 2. HELPER FUNCTIONS
// ============================================================
function getKFactor(matchesCount) {
    return K_FACTOR_STAGES[matchesCount] || K_FACTOR_STAGES.default;
}

function getThemeVar(name, fallback = '') {
    try {
        const v = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    } catch {
        return fallback;
    }
}

function toRgba(color, alpha = 1) {
    const c = String(color || '').trim();
    if (!c) return `rgba(0,0,0,${alpha})`;
    if (c.startsWith('rgba(')) return c;
    if (c.startsWith('rgb(')) {
        const m = c.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
        if (!m) return c;
        return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`;
    }
    if (c.startsWith('#')) {
        const hex = c.slice(1);
        const norm = (hex.length === 3)
            ? hex.split('').map(ch => ch + ch).join('')
            : (hex.length === 6 ? hex : '');
        if (!norm) return c;
        const r = parseInt(norm.slice(0, 2), 16);
        const g = parseInt(norm.slice(2, 4), 16);
        const b = parseInt(norm.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }
    return c;
}

function clamp(val, min = 0, max = 100) {
    return Math.min(max, Math.max(min, val));
}

function isWalkoverToken(name) {
    const n = String(name ?? '').trim().toUpperCase();
    return n === 'WO' || n === 'W/O' || n === 'W.O.';
}

// Minimal HTML escaping for safe text/attribute interpolation in innerHTML strings.
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
    // Same escaping works for attributes.
    return escapeHtml(str);
}

function formatPlayerName(name) {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return name;
    if (parts.length === 1) return parts[0];
    // First part is first name, rest is last name
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return `${firstName.charAt(0).toUpperCase()}. ${lastName}`;
}

function isMobileViewport() {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(max-width: 768px)').matches;
}

// Build compact table view for match details
function buildCompactMatchTable(match) {
    const playedGames = match.games.filter(isPlayedMatch);
    if (playedGames.length === 0) return '';

    // Separate doubles and singles games
    const doublesGames = playedGames.filter(g => {
        const isDoubles = g.doubles === true || g.doubles === "true";
        return isDoubles;
    });
    const singlesGames = playedGames.filter(g => {
        const isDoubles = g.doubles === true || g.doubles === "true";
        return !isDoubles;
    });
    
    // Extract players who played singles games only
    const teamAPlayers = new Set();
    const teamBPlayers = new Set();
    const gameMap = new Map(); // Map to store game data: key = "playerA::playerB", value = {scoreA, scoreB}
    const playerWinsA = new Map(); // Map to store win counts for Team A players
    const playerWinsB = new Map(); // Map to store win counts for Team B players
    
    // Process only singles games to collect players and results
    singlesGames.forEach(g => {
        const playersA = (g.player_a || '').split('/').map(n => n.trim()).filter(n => n && !isWalkoverToken(n));
        const playersB = (g.player_b || '').split('/').map(n => n.trim()).filter(n => n && !isWalkoverToken(n));
        const scoreA = parseInt(g.score_a) || 0;
        const scoreB = parseInt(g.score_b) || 0;
        
        // Only process single player games
        if (playersA.length === 1 && playersB.length === 1) {
            const playerA = playersA[0];
            const playerB = playersB[0];
            
            // Add players to sets (only those who played singles)
            teamAPlayers.add(playerA);
            teamBPlayers.add(playerB);
            
            // Store game result
            const key = `${playerA}::${playerB}`;
            gameMap.set(key, { scoreA, scoreB });
            
            // Count wins
            if (scoreA > scoreB) {
                playerWinsA.set(playerA, (playerWinsA.get(playerA) || 0) + 1);
            } else if (scoreB > scoreA) {
                playerWinsB.set(playerB, (playerWinsB.get(playerB) || 0) + 1);
            }
        }
    });
    
    // Build ordered lists sorted by win count (descending)
    const orderedPlayersA = Array.from(teamAPlayers).sort((a, b) => {
        const winsA = playerWinsA.get(a) || 0;
        const winsB = playerWinsA.get(b) || 0;
        return winsB - winsA; // Descending order
    });
    
    const orderedPlayersB = Array.from(teamBPlayers).sort((a, b) => {
        const winsA = playerWinsB.get(a) || 0;
        const winsB = playerWinsB.get(b) || 0;
        return winsB - winsA; // Descending order
    });
    
    if (orderedPlayersA.length === 0 || orderedPlayersB.length === 0) return '';
    
    // Build table HTML
    let html = '<div class="compact-match-table-container"><table class="compact-match-table">';
    
    // Header row with team B players
    html += '<thead><tr><th></th>'; // Empty corner cell
    orderedPlayersB.forEach((p, colIdx) => {
        const formattedName = formatPlayerName(p);
        html += `<th class="col-header" data-player="${escapeAttr(p)}" data-col-index="${colIdx}">${escapeHtml(formattedName)}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    // Data rows
    orderedPlayersA.forEach((playerA, rowIdx) => {
        html += `<tr data-row-index="${rowIdx}">`;
        const formattedNameA = formatPlayerName(playerA);
        html += `<th class="row-header" data-player="${escapeAttr(playerA)}" data-row-index="${rowIdx}">${escapeHtml(formattedNameA)}</th>`;
        
        orderedPlayersB.forEach((playerB, colIdx) => {
            const key = `${playerA}::${playerB}`;
            const game = gameMap.get(key);
            
            let cellClass = 'compact-cell';
            let cellContent = '–';
            
            if (game) {
                const scoreA = game.scoreA;
                const scoreB = game.scoreB;
                const isWin = scoreA > scoreB;
                
                cellClass += isWin ? ' compact-cell--win' : ' compact-cell--loss';
                cellContent = `${scoreA}:${scoreB}`;
            }
            
            html += `<td class="${cellClass}" data-row-index="${rowIdx}" data-col-index="${colIdx}" data-player-a="${escapeAttr(playerA)}" data-player-b="${escapeAttr(playerB)}">${escapeHtml(cellContent)}</td>`;
        });
        
        html += '</tr>';
    });
    
    html += '</tbody></table></div>';
    return html;
}

// ============================================================
// 2.1. GLOBAL UTILITY FUNCTIONS (Refactored from duplicates)
// ============================================================

// Win probability calculation based on ELO ratings
function winProb(rA, rB) {
    return 1 / (1 + Math.pow(10, (rB - rA) / 300));
}

// Score distribution calculation for match predictions
function getScoreDistribution(probWin) {
    const p = Math.max(0, Math.min(1, probWin || 0));
    const q = 1 - p;
    const dist = {
        '3-0': Math.pow(p, 3),
        '3-1': 3 * Math.pow(p, 3) * q,
        '3-2': 6 * Math.pow(p, 3) * Math.pow(q, 2),
        '2-3': 6 * Math.pow(q, 3) * Math.pow(p, 2),
        '1-3': 3 * Math.pow(q, 3) * p,
        '0-3': Math.pow(q, 3),
    };
    const total = Object.values(dist).reduce((s, v) => s + v, 0) || 1;
    return Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, (v / total) * 100]));
}

// Calculate average rating from a list of players
function avgRating(list) {
    return list.length ? list.reduce((s, p) => s + p.rating, 0) / list.length : 0;
}

// Sort roster by activity (matches), then rating, then name
function sortRoster(list) {
    return [...list].sort((a, b) => {
        const actA = (a.matches + a.dMatches);
        const actB = (b.matches + b.dMatches);
        if (actA !== actB) return actB - actA;
        if (a.rating !== b.rating) return b.rating - a.rating;
        return a.name.localeCompare(b.name, 'sk', {sensitivity: 'base'});
    });
}

// Get player rating before a specific match
function getPlayerRatingBeforeMatch(playerName, matchRound, matchSeason, playersData) {
    const players = playersData || {};
    const player = players[playerName];
    if (!player) return INITIAL_RATING;

    const roundNum = parseInt((matchRound.match(/\d+/) || [0])[0]);
    const seasonOrder = getSeasonOrder(matchSeason);

    // Find matches in this round
    const matchesInRound = player.matchDetails.filter(md => {
        const mdSeasonOrder = getSeasonOrder(md.season);
        const mdRoundNum = getRoundNumFromStr(md.round);
        return mdSeasonOrder === seasonOrder && mdRoundNum === roundNum;
    });

    if (matchesInRound.length > 0) {
        // Get the first match (rating before the first game in this round)
        const firstMatch = matchesInRound[0];
        if (firstMatch.rating_after !== undefined && firstMatch.delta_own !== undefined) {
            return firstMatch.rating_after - firstMatch.delta_own;
        }
    }

    // If not found in matchDetails, try to use history
    const targetPrefix = `${seasonOrder}-${String(roundNum).padStart(2, '0')}`;
    const historyKeys = Object.keys(player.history || {}).sort();
    for (let i = historyKeys.length - 1; i >= 0; i--) {
        const key = historyKeys[i];
        const keyParts = key.split('|');
        if (keyParts.length < 1) continue;
        const keyPrefix = keyParts[0];
        const keySeasonOrder = parseInt(keyPrefix.split('-')[0]) || 0;
        const keyRoundNum = parseInt(keyPrefix.split('-')[1]) || 0;
        
        if (keySeasonOrder < seasonOrder || (keySeasonOrder === seasonOrder && keyRoundNum < roundNum)) {
            return player.history[key];
        }
    }

    return INITIAL_RATING;
}

// Get number of matches played before a specific match
function getPlayerMatchesBeforeMatch(playerName, matchRound, matchSeason, playersData) {
    const players = playersData || {};
    const player = players[playerName];
    if (!player) return 0;

    const roundNum = parseInt((matchRound.match(/\d+/) || [0])[0]);
    const seasonOrder = getSeasonOrder(matchSeason);

    return player.matchDetails.filter(md => {
        const mdSeasonOrder = getSeasonOrder(md.season);
        const mdRoundNum = getRoundNumFromStr(md.round);
        return mdSeasonOrder < seasonOrder || (mdSeasonOrder === seasonOrder && mdRoundNum < roundNum);
    }).length;
}

// Blend score toward neutral 50 for low sample counts
function confidenceBlend(base, count, threshold = 8) {
    const confidence = Math.min(count / threshold, 1);
    return clamp(50 + (base - 50) * confidence);
}

const STAT_META = {
    attack: { label: 'Ofenzíva', tip: 'Ako presvedčivo hráč vyhráva sety (3:0 / 3:1 majú väčšiu váhu).' },
    defense: { label: 'Defenzíva', tip: 'Ako dobre hráč obmedzí straty pri prehre, najmä proti silnejším.' },
    consistency: { label: 'Stabilita výkonu', tip: 'Stabilita zmien ratingu v nedávnych zápasoch.' },
    momentum: { label: 'Momentum', tip: 'Aktuálny trend ziskov/strát ratingu.' },
    teamImpact: { label: 'Tímový vplyv', tip: 'Úspešnosť a prínos v štvorhrách.' },
    clutch: { label: 'Výkon pod tlakom', tip: 'Výkony v tesných päťsetových zápasoch (3:2 / 2:3).' }
};

// Helper: Parse Season for Sorting (Year * 10 + Term)
function getSeasonOrder(seasonStr) {
    if (!seasonStr) return 0; // Old data
    const parts = seasonStr.trim().split(' ');
    if (parts.length < 2) return 0;

    const term = parts[0].toUpperCase(); // JAR, JESEN
    // Remove any non-numeric chars from year just in case
    const year = parseInt(parts[1].replace(/[^\d]/g, ''));
    if (isNaN(year)) return 0;

    // JAR = 1, JESEŇ/JESEN = 2
    // If there are other terms, handle them? For now assume these two.
    const termVal = (term.includes('JAR')) ? 1 : 2;

    return year * 10 + termVal;
}

function getMatchRoundId(m) {
    return `${m.season || 'N/A'}__${m.round}`;
}

function updateLayout() {
    const nav = document.getElementById('mainNav');
    if (!nav) return;
    const height = nav.offsetHeight;
    document.documentElement.style.setProperty('--header-offset', height + 'px');

    const container = document.getElementById('mainContainer') || document.querySelector('.container');
    if (container) {
        document.body.style.paddingTop = height + 'px';
    }
}

window.addEventListener('load', updateLayout);
window.addEventListener('resize', updateLayout);

// ============================================================
// 3. CORE DATA ENGINE
// ============================================================

// Helper to determine if a match is played or future
function isPlayedMatch(m) {
    const scoreA = parseInt(m.score_a) || 0;
    const scoreB = parseInt(m.score_b) || 0;
    // Condition: Score is 0-0 and names indicate WO -> Future/Unplayed
    if (scoreA === 0 && scoreB === 0 && m.player_a === 'WO' && m.player_b === 'WO') {
        return false;
    }
    return true;
}

// --- Date helpers (used for "Aktuálne Kolo" selection on home page) ---
function parseMatchDate(raw) {
    if (!raw) return null;
    if (raw instanceof Date && !isNaN(raw.getTime())) return raw;

    const str = String(raw).trim();
    if (!str) return null;

    // Try ISO first (YYYY-MM-DD ...)
    let m = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
        const y = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1, d = parseInt(m[3], 10);
        const dt = new Date(y, mo, d);
        return isNaN(dt.getTime()) ? null : dt;
    }

    // Common SK formats: DD.MM.YYYY or DD/MM/YYYY (optionally with extra text)
    m = str.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m) {
        const d = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1, y = parseInt(m[3], 10);
        const dt = new Date(y, mo, d);
        return isNaN(dt.getTime()) ? null : dt;
    }

    // Fallback: let JS try (works for some ISO-ish variants)
    const dt = new Date(str);
    return isNaN(dt.getTime()) ? null : dt;
}

function startOfIsoWeek(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay(); // 0=Sun..6=Sat
    const diff = -day; // Sunday-start week
    // const diff = day === 6 ? 0 : -(7 - (6 - day)); // Saturday-start week
    x.setDate(x.getDate() + diff);
    x.setHours(0, 0, 0, 0);
    return x;
}

function isSameIsoWeek(a, b) {
    if (!a || !b) return false;
    return startOfIsoWeek(a).getTime() === startOfIsoWeek(b).getTime();
}

// Format date string with Slovak day abbreviation: "2026-01-28 17:00" -> "2026-01-28, Str 17:00"
function formatDateWithSlovakDay(dateStr) {
    if (!dateStr) return '';
    
    // Match format: "YYYY-MM-DD HH:mm" or "YYYY-MM-DD"
    const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/);
    if (!match) return dateStr; // Return original if format doesn't match
    
    const datePart = match[1];
    const timePart = match[2] || '';
    
    // Parse the date
    const [year, month, day] = datePart.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    // Check if date is valid
    if (isNaN(date.getTime())) return dateStr;
    
    // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const dayOfWeek = date.getDay();
    
    // Slovak day abbreviations
    const slovakDays = ['Ne', 'Po', 'Ut', 'Str', 'Št', 'Pi', 'So'];
    const dayAbbr = slovakDays[dayOfWeek];
    
    // Format: "YYYY-MM-DD, [DayAbbr] HH:mm" or "YYYY-MM-DD, [DayAbbr]" if no time
    return timePart ? `${datePart}, ${dayAbbr} ${timePart}` : `${datePart}, ${dayAbbr}`;
}

function getRoundNumFromStr(roundStr) {
    const s = String(roundStr || '');
    const m = s.match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
}

// Calculate team ratings for a given round (using player history)
function calculateTeamRatingsForRound(teamPlayers, round) {
    const playersAtRound = teamPlayers.map(p => {
        // Find the last history entry that matches this round
        // History keys format: "20251-01|1. kolo (JAR 2025)"
        const targetPrefix = `${round.seasonOrder}-${String(round.roundNum).padStart(2, '0')}`;
        let ratingAtRound = null;

        // Get all history keys for this player
        const historyKeys = Object.keys(p.history || {});
        
        // Find all history entries that match this round
        const matchingKeys = historyKeys.filter(key => {
            const keyParts = key.split('|');
            if (keyParts.length < 1) return false;
            return keyParts[0] === targetPrefix;
        });

        if (matchingKeys.length > 0) {
            // Get the last one (after all matches in this round)
            matchingKeys.sort();
            const lastMatchingKey = matchingKeys[matchingKeys.length - 1];
            ratingAtRound = p.history[lastMatchingKey];
        } else {
            // No history for this round, try to find the most recent before this round
            for (let i = historyKeys.length - 1; i >= 0; i--) {
                const key = historyKeys[i];
                const keyParts = key.split('|');
                if (keyParts.length < 1) continue;
                const keyPrefix = keyParts[0];
                const keySeasonOrder = parseInt(keyPrefix.split('-')[0]) || 0;
                const keyRoundNum = parseInt(keyPrefix.split('-')[1]) || 0;
                
                if (keySeasonOrder < round.seasonOrder || 
                    (keySeasonOrder === round.seasonOrder && keyRoundNum < round.roundNum)) {
                    ratingAtRound = p.history[key];
                    break;
                }
            }
        }

        // If no history found, player hasn't played yet - exclude from calculation
        if (ratingAtRound === null) {
            return null;
        }

        // Count activity (matches played) up to and including this round
        const matchesUpToRound = p.matchDetails.filter(md => {
            const mdSeasonOrder = getSeasonOrder(md.season);
            const mdRoundNum = getRoundNumFromStr(md.round);
            return mdSeasonOrder < round.seasonOrder || 
                   (mdSeasonOrder === round.seasonOrder && mdRoundNum <= round.roundNum);
        });
        const activityAtRound = matchesUpToRound.length;

        return {
            name: p.name,
            rating: ratingAtRound,
            activity: activityAtRound
        };
    }).filter(p => p !== null); // Only include players who have played

    if (playersAtRound.length === 0) {
        return { activeRating: null, overallRating: null };
    }

    // Sort by activity then by rating (same as sortRoster logic)
    const sorted = [...playersAtRound].sort((a, b) => {
        if (a.activity !== b.activity) return b.activity - a.activity;
        if (a.rating !== b.rating) return b.rating - a.rating;
        return a.name.localeCompare(b.name, 'sk', {sensitivity: 'base'});
    });

    // Calculate active rating (4 most active)
    const active = sorted.slice(0, 4);
    const activeRating = active.length > 0 
        ? active.reduce((sum, p) => sum + p.rating, 0) / active.length 
        : null;

    // Calculate overall rating (all players who have played)
    const overallRating = playersAtRound.length > 0
        ? playersAtRound.reduce((sum, p) => sum + p.rating, 0) / playersAtRound.length
        : null;

    return { activeRating, overallRating };
}

function buildRoundsIndex(matches) {
    const rounds = {};
    (matches || []).forEach(m => {
        const id = getMatchRoundId(m);
        if (!rounds[id]) {
            rounds[id] = {
                id,
                name: m.round,
                season: m.season,
                seasonOrder: getSeasonOrder(m.season),
                roundNum: getRoundNumFromStr(m.round),
                refMatch: m
            };
        }
    });
    return rounds;
}

function getThisWeekRoundId(matches, today = new Date()) {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const bestById = {};

    (matches || []).forEach(m => {
        const dt = parseMatchDate(m.date);
        if (!dt) return;
        if (!isSameIsoWeek(dt, t)) return;

        const id = getMatchRoundId(m);
        const abs = Math.abs(dt.getTime() - t.getTime());
        const seasonOrder = getSeasonOrder(m.season);
        const roundNum = getRoundNumFromStr(m.round);

        const prev = bestById[id];
        if (!prev || abs < prev.abs) {
            bestById[id] = { abs, seasonOrder, roundNum, refMatch: m };
        } else if (abs === prev.abs) {
            // Tie-break: prefer later season/round (more "current")
            if (seasonOrder > prev.seasonOrder || (seasonOrder === prev.seasonOrder && roundNum > prev.roundNum)) {
                bestById[id] = { abs, seasonOrder, roundNum, refMatch: m };
            }
        }
    });

    const entries = Object.entries(bestById);
    if (entries.length === 0) return null;

    entries.sort(([, a], [, b]) => {
        if (a.abs !== b.abs) return a.abs - b.abs;
        if (a.seasonOrder !== b.seasonOrder) return b.seasonOrder - a.seasonOrder;
        return b.roundNum - a.roundNum;
    });
    return entries[0][0];
}

function processData(currentRoundIdOverride = null) {
    const players = {};
    const roundsSet = new Set();
    const upsetsList = [];
    let totalSets = 0;

    // We only process PLAYED matches for ratings and stats
    const playedMatches = matchResults.filter(isPlayedMatch);

    // Find the latest played round name
    const lastMatch = playedMatches.length > 0 ? playedMatches[playedMatches.length - 1] : null;
    const latestRoundId = lastMatch ? getMatchRoundId(lastMatch) : null;
    // We keep latestRoundName for legacy display strings, but logic should use ID
    const latestRoundName = lastMatch ? lastMatch.round : "";
    
    // Use currentRoundIdOverride if provided (for determining which round's stats to show)
    // Otherwise fall back to latestRoundId
    const effectiveRoundId = currentRoundIdOverride || latestRoundId;

    const initPlayer = (nameRaw, teamName) => {
        const name = nameRaw.trim();
        // Skip creating player for WO
        if (name === 'WO') return null;

        if (!players[name]) {
            players[name] = {
                name: name, rating: INITIAL_RATING,
                matches: 0, wins: 0, losses: 0,
                setsWin: 0, setsLose: 0,
                dMatches: 0, dWins: 0, dLosses: 0, dSetsWin: 0, dSetsLose: 0,
                maxRating: INITIAL_RATING, minRating: INITIAL_RATING,
                team: teamName || 'N/A', lastPlayed: 'N/A', roundGain: 0,
                bestWinOpponent: null, bestWinRating: -Infinity,
                worstLossOpponent: null, worstLossRating: Infinity,
                history: {}, matchDetails: []
            };
        }
        if (teamName) players[name].team = teamName;
        return players[name];
    };

    playedMatches.forEach(match => {
        roundsSet.add(getMatchRoundId(match));
        const scoreA = parseInt(match.score_a);
        const scoreB = parseInt(match.score_b);
        totalSets += (scoreA + scoreB);

        const isDoubles = match.doubles === true || match.doubles === "true";
        const isLatestRound = getMatchRoundId(match) === effectiveRoundId;

        const pNamesA = match.player_a.split('/').map(n => n.trim());
        const pNamesB = match.player_b.split('/').map(n => n.trim());

        // If any player is WO, do not process for ratings
        if (pNamesA.includes('WO') || pNamesB.includes('WO')) return;

        pNamesA.forEach(n => initPlayer(n, match.player_a_team));
        pNamesB.forEach(n => initPlayer(n, match.player_b_team));

        const getR = (name) => players[name].rating;

        // --- FIXED LOGIC START ---
        // 1. Increment Counters & Set Last Played FIRST
        // This ensures we can calculate the K-factor for the *current* match index correctly later.
        if (isDoubles) {
            pNamesA.forEach(n => { players[n].dMatches++; players[n].lastPlayed = match.round; });
            pNamesB.forEach(n => { players[n].dMatches++; players[n].lastPlayed = match.round; });
        } else {
            pNamesA.forEach(n => { players[n].matches++; players[n].lastPlayed = match.round; });
            pNamesB.forEach(n => { players[n].matches++; players[n].lastPlayed = match.round; });
        }

        // 2. Calculate Team Ratings (Average for Doubles, Single for Singles)
        let Ra, Rb;
        if (isDoubles) {
            Ra = (getR(pNamesA[0]) + (pNamesA[1] ? getR(pNamesA[1]) : getR(pNamesA[0]))) / 2;
            Rb = (getR(pNamesB[0]) + (pNamesB[1] ? getR(pNamesB[1]) : getR(pNamesB[0]))) / 2;
        } else {
            Ra = getR(pNamesA[0]);
            Rb = getR(pNamesB[0]);
        }

        // 3. Calculate Expected Scores
        const N = scoreA + scoreB;
        const Ea = N / (1 + Math.pow(10, (Rb - Ra) / 300));
        const Eb = N / (1 + Math.pow(10, (Ra - Rb) / 300));

        // 4. Calculate Raw Performance Difference (Actual - Expected)
        // We do NOT multiply by K here. We pass this 'diff' to the individual player update.
        const diffA = scoreA - Ea;
        const diffB = scoreB - Eb;

        // 5. Calculate "Average Display Delta" for opponents
        // This is purely for the history log to show a general "opponent change" value.
        // It does not affect the actual math for the player being updated.
        const getCurrentK = (n) => getKFactor(players[n].matches + players[n].dMatches); // Current total count
        const getAvgK = (names) => {
            let sumK = 0;
            names.forEach(n => sumK += getCurrentK(n));
            return sumK / names.length;
        };
        const avgKa = getAvgK(pNamesA);
        const avgKb = getAvgK(pNamesB);

        // Calculate the hypothetical average delta for the TEAM (for display purposes only)
        let displayDeltaA = avgKa * diffA;
        let displayDeltaB = avgKb * diffB;
        if (isDoubles) {
            displayDeltaA = displayDeltaA / 2;
            displayDeltaB = displayDeltaB / 2;
        }
        // --- FIXED LOGIC END ---

        if (isLatestRound && !isDoubles) {
            // Filter out WO matches for upsets
            if (match.player_a !== 'WO' && match.player_b !== 'WO') {
                if (scoreA > scoreB && Rb > Ra) {
                    upsetsList.push({
                        winner: pNamesA[0],
                        wTeam: match.player_a_team,
                        wRate: Ra,
                        loser: pNamesB[0],
                        lTeam: match.player_b_team,
                        lRate: Rb,
                        score: `${scoreA}:${scoreB}`,
                        diff: Rb - Ra
                    });
                } else if (scoreB > scoreA && Ra > Rb) {
                    upsetsList.push({
                        winner: pNamesB[0],
                        wTeam: match.player_b_team,
                        wRate: Rb,
                        loser: pNamesA[0],
                        lTeam: match.player_a_team,
                        lRate: Ra,
                        score: `${scoreB}:${scoreA}`,
                        diff: Ra - Rb
                    });
                }
            }
        }

        // Store opponent ratings BEFORE any updates (needed for calculating opp_rating_after)
        const oppRatingBeforeA = isDoubles ? 0 : (pNamesB.length > 0 ? players[pNamesB[0]].rating : 0);
        const oppRatingBeforeB = isDoubles ? 0 : (pNamesA.length > 0 ? players[pNamesA[0]].rating : 0);

        // Updated updateSide to accept raw DIFF and displayDelta for opponent
        const updateSide = (pNames, scoreOwn, scoreOpp, diffOwn, diffOpp, displayDeltaOpp, oppNames, oppTeam, ownTeam, oppRatingBeforeMatch) => {
            pNames.forEach(name => {
                const p = players[name];

                // --- FIXED: Individual K Calculation ---
                const currentK = getKFactor(p.matches + p.dMatches);

                // Calculate Individual Delta
                // Formula: K * (Actual - Expected).
                // If doubles, we divide by 2 to maintain the league's scaling (points shared/split).
                let deltaOwn = currentK * diffOwn;
                if (isDoubles) deltaOwn = deltaOwn / 2;
                // ---------------------------------------

                if (isDoubles) {
                    p.dSetsWin += scoreOwn;
                    p.dSetsLose += scoreOpp;
                    if (scoreOwn > scoreOpp) p.dWins++; else if (scoreOpp > scoreOwn) p.dLosses++;
                } else {
                    p.setsWin += scoreOwn;
                    p.setsLose += scoreOpp;
                    if (scoreOwn > scoreOpp) p.wins++; else if (scoreOpp > scoreOwn) p.losses++;
                    const oppRating = isDoubles ? 0 : players[oppNames[0]].rating;
                    if (scoreOwn > scoreOpp && oppRating > p.bestWinRating) {
                        p.bestWinOpponent = oppNames[0];
                        p.bestWinRating = oppRating;
                    } else if (scoreOpp > scoreOwn && oppRating < p.worstLossRating) {
                        p.worstLossOpponent = oppNames[0];
                        p.worstLossRating = oppRating;
                    }
                }
                p.rating += deltaOwn;
                if (isLatestRound) p.roundGain += deltaOwn;

                const rNum = parseInt((match.round.match(/\d+/) || [0])[0]);
                const sOrder = getSeasonOrder(match.season);
                const sDisp = match.season ? ` (${match.season})` : '';
                const historyKey = `${sOrder}-${String(rNum).padStart(2, '0')}|${match.round}${sDisp}`;

                p.history[historyKey] = p.rating;

                p.maxRating = Math.max(p.rating, p.maxRating);
                p.minRating = Math.min(p.rating, p.minRating);

                const opponentName = oppNames.join(' / ');
                // Calculate opponent's rating AFTER the match
                // Use the opponent's rating BEFORE the match (stored before any updates)
                // and add their delta to get their rating after
                let oppRatingAfter = 0;
                if (!isDoubles && oppNames.length > 0 && oppRatingBeforeMatch !== undefined) {
                    const oppPlayer = players[oppNames[0]];
                    const oppCurrentK = getKFactor(oppPlayer.matches + oppPlayer.dMatches);
                    const oppDelta = oppCurrentK * diffOpp;
                    // Use the stored "before" rating + delta to get "after" rating
                    oppRatingAfter = oppRatingBeforeMatch + oppDelta;
                }

                p.matchDetails.push({
                    date: match.date || match.round,
                    round: match.round,
                    season: match.season || null,
                    opponent: opponentName,
                    opponent_team: oppTeam,
                    own_team: ownTeam,
                    score_own: scoreOwn,
                    score_opp: scoreOpp,
                    rating_after: p.rating,
                    opp_rating_after: oppRatingAfter,
                    delta_own: deltaOwn,
                    delta_opp: displayDeltaOpp, // Use the average opp delta for display
                    isDoubles: isDoubles,
                    own_name_display: pNames.join(' / ')
                });
            });
        };

        // Pass diffA/B for calculation, and displayDeltaB/A for opponent history logs
        // Also pass diffOpp and oppRatingBeforeMatch so we can calculate opponent's rating after correctly
        updateSide(pNamesA, scoreA, scoreB, diffA, diffB, displayDeltaB, pNamesB, match.player_b_team, match.player_a_team, oppRatingBeforeA);
        updateSide(pNamesB, scoreB, scoreA, diffB, diffA, displayDeltaA, pNamesA, match.player_a_team, match.player_b_team, oppRatingBeforeB);
    });

    return {players, roundsSet, totalSets, latestRoundName, latestRoundId, upsetsList};
}

// ============================================================
// 3B. "REBRÍČEK" POINTS (LEAGUE SCORING)
// ============================================================
// Rules (as provided):
// - Singles win = 1 point
// - Doubles win = 0.5 point (doubles loss = 0)
// - Kontumácia (team walkover) gives special points to players listed in the sheet:
//   played 1x -> +0.5, 2x -> +1.0, 3x -> +1.5, 4x -> +2.5
//
// Data encoding note:
// - Walkovers are represented as matches where one side is "WO" (or W/O / W.O.).
// - For full-walkover fixtures (no real games played between the teams in that round),
//   we apply the special mapping instead of counting each WO game as a full win.
function computeRebricekMap(playersByName) {
    const points = new Map();
    const addPts = (playerName, delta) => {
        if (!playerName || !Number.isFinite(delta)) return;
        // Keep aligned with rating page: only show players that exist in playersByName (processData)
        if (!playersByName || !playersByName[playerName]) return;
        points.set(playerName, (points.get(playerName) || 0) + delta);
    };

    const splitNames = (raw) => String(raw || '').split('/').map(s => s.trim()).filter(Boolean);
    const hasWO = (names) => names.some(isWalkoverToken);
    const isDoublesMatch = (m) => (m?.doubles === true || m?.doubles === "true");
    const scoreNum = (x) => (Number.isFinite(x) ? x : parseInt(x, 10)) || 0;

    const fixtureKey = (m) => `${getMatchRoundId(m)}::${(m.player_a_team || '').trim()}::${(m.player_b_team || '').trim()}`;
    const fixtures = new Map();

    // 1) Group played matches by fixture (round + teams) and track whether fixture has any "real" (non-WO) games.
    (matchResults || []).filter(isPlayedMatch).forEach(m => {
        const key = fixtureKey(m);
        const fx = fixtures.get(key) || { items: [], hasRealGame: false };

        const namesA = splitNames(m.player_a);
        const namesB = splitNames(m.player_b);
        const aWO = hasWO(namesA);
        const bWO = hasWO(namesB);

        if (!aWO && !bWO) fx.hasRealGame = true;
        fx.items.push({
            m,
            isDoubles: isDoublesMatch(m),
            namesA,
            namesB,
            aWO,
            bWO
        });
        fixtures.set(key, fx);
    });

    const kontumacyPointsForAppearances = (appearances) => {
        const n = Math.max(0, appearances | 0);
        if (n <= 0) return 0;
        if (n === 4) return 2.5;
        // 1->0.5, 2->1.0, 3->1.5
        if (n >= 1 && n <= 3) return n * 0.5;
        // Safety: cap at 2.5 (league sheet implies max 4x)
        return 2.5;
    };

    // 2) Compute points per fixture
    fixtures.forEach(fx => {
        if (!fx.items.length) return;

        // Full kontumácia fixture: no real games, only WO-encoded games.
        if (!fx.hasRealGame) {
            const appearances = new Map(); // playerName -> number of WO games listed in the sheet

            fx.items.forEach(it => {
                // Ignore WO vs WO placeholders
                if (it.aWO && it.bWO) return;
                // Count players on the non-WO side as "played"
                const nonWO = it.aWO ? it.namesB : it.namesA;
                nonWO.forEach(n => {
                    if (isWalkoverToken(n)) return;
                    appearances.set(n, (appearances.get(n) || 0) + 1);
                });
            });

            appearances.forEach((count, playerName) => {
                addPts(playerName, kontumacyPointsForAppearances(count));
            });
            return;
        }

        // Partial fixture (some real games played): treat each match individually.
        fx.items.forEach(it => {
            const sA = scoreNum(it.m.score_a);
            const sB = scoreNum(it.m.score_b);
            if (sA === sB) return;

            // Determine winner side (including WO games within an otherwise "real" fixture).
            const winnerNames = (sA > sB) ? it.namesA : it.namesB;
            if (!winnerNames || winnerNames.length === 0) return;

            if (it.isDoubles) {
                winnerNames.forEach(n => {
                    if (isWalkoverToken(n)) return;
                    addPts(n, 0.5);
                });
            } else {
                const winner = winnerNames.find(n => !isWalkoverToken(n));
                if (winner) addPts(winner, 1);
            }
        });
    });

    return points;
}

// ============================================================
// 3A. DERIVED STATS ENGINE (FRONTEND ONLY)
// ============================================================
function getBandLabel(val) {
    if (val < 30) return 'slabé';
    if (val < 60) return 'priemerné';
    if (val < 90) return 'silné';
    return 'mimoriadne silné';
}

function computeDerivedStats(p) {
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const singles = p.matchDetails.filter(m => !m.isDoubles);
    const doubles = p.matchDetails.filter(m => m.isDoubles);
    const closeMatches = p.matchDetails.filter(m => (m.score_own + m.score_opp) === 5);
    const recentMatches = p.matchDetails.slice(-12);
    const recentShort = p.matchDetails.slice(-5);
    const safeBlend = (base, count, threshold) => (Number.isFinite(base) && count > 0) ? confidenceBlend(base, count, threshold) : null;

    // Attack: set margin dominance (singles only)
    const attackMargins = singles.map(m => {
        const own = m.score_own || 0;
        const opp = m.score_opp || 0;
        const total = Math.max(1, own + opp);
        return (own - opp) / Math.max(3, total); // normalize to roughly [-1, 1]
    });
    const attackBase = attackMargins.length ? clamp(50 + avg(attackMargins) * 50) : null;
    const attack = safeBlend(attackBase, singles.length, 10);

    // Defense: performance in losses vs stronger opponents (fallback to all losses)
    const ratingBefore = (m) => (m.rating_after || 0) - (m.delta_own || 0);
    const oppRatingBefore = (m) => (m.opp_rating_after || 0) - (m.delta_opp || 0);
    const losses = singles.filter(m => m.score_own < m.score_opp);
    const strongLosses = losses.filter(m => oppRatingBefore(m) > ratingBefore(m) + 5);
    const defensePool = strongLosses.length ? strongLosses : losses;
    const defenseShares = defensePool.map(m => {
        const own = m.score_own || 0;
        const opp = m.score_opp || 0;
        const total = Math.max(1, own + opp);
        return own / total; // share of sets the player still took
    });
    const defenseBase = defenseShares.length ? clamp(avg(defenseShares) * 100) : null;
    const defenseRaw = safeBlend(defenseBase, defensePool.length, 8);
    const defense = Number.isFinite(defenseRaw) ? (defenseRaw * 2) : null;

    // Consistency: volatility of rating deltas (all recent matches)
    const volDeltas = recentMatches.map(m => Math.abs(m.delta_own || 0));
    const meanDelta = avg(volDeltas);
    const variance = volDeltas.length ? avg(volDeltas.map(d => Math.pow(d - meanDelta, 2))) : 0;
    const std = Math.sqrt(variance);
    const normVol = Math.min(std / 12, 1.5); // std of 12+ means low consistency
    const consistencyBase = volDeltas.length ? clamp(100 - normVol * 100) : null;
    const consistency = safeBlend(consistencyBase, recentMatches.length, 10);

    // Momentum: recent rating trend (last 5)
    const momentumDelta = avg(recentShort.map(m => m.delta_own || 0));
    const momentumBase = recentShort.length ? clamp(50 + momentumDelta * 3) : null; // 5 pts avg delta ~ +15/-15
    const momentum = safeBlend(momentumBase, recentShort.length, 5);

    // Team Impact: doubles win rate
    const dWins = doubles.filter(m => m.score_own > m.score_opp).length;
    const teamImpactBase = doubles.length ? clamp((dWins / doubles.length) * 100) : null;
    const teamImpact = safeBlend(teamImpactBase, doubles.length, 8);

    // Clutch: close 3:2 matches
    const closeWins = closeMatches.filter(m => m.score_own > m.score_opp).length;
    const clutchBase = closeMatches.length ? clamp(50 + ((closeWins / closeMatches.length) - 0.5) * 100) : null;
    const clutch = safeBlend(clutchBase, closeMatches.length, 4);

    return {
        values: {attack, defense, consistency, momentum, teamImpact, clutch},
        counts: {
            total: p.matchDetails.length,
            singles: singles.length,
            doubles: doubles.length,
            close: closeMatches.length
        }
    };
}

function buildStatsDescription(stats) {
    const v = stats.values;
    const c = stats.counts || {};

    const fmt = (x) => (Number.isFinite(x) ? x.toFixed(0) : '–');
    const tier = (x) => {
        const val = clamp(Number.isFinite(x) ? x : 50, 0, 100);
        if (val < 30) return 0;      // weak
        if (val < 60) return 1;      // average
        if (val < 90) return 2;      // strong
        return 3;                    // elite
    };
    const t = {
        attack: tier(v.attack),
        defense: tier(v.defense),
        consistency: tier(v.consistency),
        momentum: tier(v.momentum),
        teamImpact: tier(v.teamImpact),
        clutch: tier(v.clutch)
    };

    const statSentence = (key) => {
        if (!Number.isFinite(v[key])) {
            if (key === 'teamImpact') {
                return (c.doubles || 0) === 0
                    ? 'Štvorhra: zatiaľ bez odohraného zápasu – „Tímový vplyv“ sa nedá vyhodnotiť.'
                    : `„${STAT_META[key]?.label || key}“ zatiaľ nemá dosť dát na vyhodnotenie.`;
            }
            if (key === 'clutch') {
                return (c.close || 0) === 0
                    ? 'Tesné päťsetové zápasy (3:2 / 2:3): zatiaľ žiadne – „Výkon pod tlakom“ je N/A.'
                    : `„${STAT_META[key]?.label || key}“ zatiaľ nemá dosť dát na vyhodnotenie.`;
            }
            if (key === 'attack' || key === 'defense') {
                return (c.singles || 0) === 0
                    ? 'Dvojhra: zatiaľ bez odohraného zápasu – ofenzívny/defenzívny profil je N/A.'
                    : `„${STAT_META[key]?.label || key}“ zatiaľ nemá dosť dát na vyhodnotenie.`;
            }
            return `„${STAT_META[key]?.label || key}“ zatiaľ nemá dosť dát na vyhodnotenie.`;
        }
        const valTxt = fmt(v[key]);
        const lvl = t[key];
        const map = {
            attack: [
                `V ofenzíve sa presadzuje ťažšie (${valTxt}) – sety získava skôr po boji než dominanciou.`,
                `Ofenzíva je skôr priemerná (${valTxt}): dokáže vyhrávať sety, ale bez častej dominancie.`,
                `V ofenzíve pôsobí presvedčivo (${valTxt}) a často si vie vytvoriť náskok v setoch.`,
                `Ofenzíva je dominantná (${valTxt}) – časté jasné výsledky naznačujú veľkú útočnú silu.`
            ],
            defense: [
                `V defenzíve má rezervy (${valTxt}); pri prehrách často stráca rýchlo a ťažšie drží krok s favoritmi.`,
                `Defenzíva je priemerná (${valTxt}) – pri prehrách si občas zoberie set, no ťažšie otáča nepriaznivý vývoj.`,
                `Defenzíva je silná (${valTxt}): aj proti silnejším súperom vie brať sety a udržať zápas vyrovnaný.`,
                `Defenzíva je výborná (${valTxt}) – aj keď prehrá, často je to tesné a súper sa na body poriadne nadre.`
            ],
            consistency: [
                `Výkonnosť výrazne kolíše (${valTxt}); výsledky sa v čase menia od zápasu k zápasu.`,
                `Stabilita je priemerná (${valTxt}) – forma vie kolísať, no bez extrémov.`,
                `Výkony sú väčšinou vyrovnané (${valTxt}); hráč si drží svoj štandard.`,
                `Veľmi stabilný výkon (${valTxt}) – len zriedka príde výrazný výkyv.`
            ],
            momentum: [
                `Posledné zápasy naznačujú pokles formy (${valTxt}).`,
                `Forma je skôr neutrálna (${valTxt}) – bez výrazného rastu či poklesu.`,
                `Forma rastie (${valTxt}); v posledných zápasoch častejšie zbiera body.`,
                `Výrazne rastúca forma (${valTxt}) – hráč je momentálne vo veľmi dobrej vlne.`
            ],
            teamImpact: [
                `V štvorhre zatiaľ neprináša veľký bodový prínos (${valTxt}).`,
                `V štvorhre je prínos skôr vyrovnaný (${valTxt}) – raz pomôže, raz nie.`,
                `V štvorhre je výrazným prínosom (${valTxt}) a často pomáha tímu bodovať.`,
                `Opora štvorhry (${valTxt}) – v tíme prináša nadpriemerný rozdiel.`
            ],
            clutch: [
                `V koncovkách a tesných zápasoch sa presadzuje ťažšie (${valTxt}).`,
                `V tesných dueloch je to skôr 50/50 (${valTxt}).`,
                `Koncovky zvláda dobre (${valTxt}); v tesných zápasoch často dokáže rozhodnúť.`,
                `Exceluje pod tlakom (${valTxt}) – tesné zápasy vie pravidelne strhávať na svoju stranu.`
            ]
        };
        return (map[key] && map[key][lvl]) ? map[key][lvl] : '';
    };

    const parts = [
        statSentence('attack'),
        statSentence('defense'),
        statSentence('consistency'),
        statSentence('momentum'),
        statSentence('teamImpact'),
        statSentence('clutch')
    ].filter(Boolean);

    // Combination / playstyle summary (reacts to strengths + weaknesses)
    const metaLabel = (key) => (STAT_META[key] ? STAT_META[key].label : key);
    const allKeys = ['attack', 'defense', 'consistency', 'momentum', 'teamImpact', 'clutch'];
    const sorted = allKeys
        .map(k => ({ k, val: Number.isFinite(v[k]) ? v[k] : 50, lvl: t[k] }))
        .sort((a, b) => b.val - a.val);
    const top = sorted.filter(x => x.lvl >= 2).slice(0, 2);
    const low = sorted.slice().reverse().filter(x => x.lvl === 0).slice(0, 1);

    const summaryParts = [];
    if (top.length) {
        const topTxt = top.map(x => metaLabel(x.k)).join(' a ');
        summaryParts.push(`Najsilnejšie stránky: ${topTxt}.`);
    } else {
        summaryParts.push('Profil je zatiaľ bez výraznej dominantnej stránky.');
    }
    if (low.length) {
        summaryParts.push(`Najväčšia rezerva: ${metaLabel(low[0].k)}.`);
    }

    // Archetype from Attack/Defense combo
    if (t.attack >= 2 && t.defense <= 1) {
        summaryParts.push('Skôr ofenzívny typ: keď si vytvorí tlak, vie zápas rýchlo uzavrieť; dôležité je nenechať sa zatlačiť.');
    } else if (t.defense >= 2 && t.attack <= 1) {
        summaryParts.push('Skôr trpezlivý/defenzívny typ: vie držať výmeny a postupne si vybojovať sety.');
    } else if (t.attack >= 2 && t.defense >= 2) {
        summaryParts.push('Komplexný profil: vie dominovať aj odolávať tlaku.');
    }

    // Form vs stability + clutch nuance
    if (t.momentum >= 2 && t.consistency <= 1) {
        summaryParts.push('Aktuálne je vo vlne, hoci dlhodobo vie forma kolísať.');
    } else if (t.momentum <= 1 && t.consistency >= 2) {
        summaryParts.push('Aj pri slabšej vlne má pevný základ; výsledky bývajú stabilné.');
    }
    if (t.clutch >= 2 && t.momentum <= 1) {
        summaryParts.push('Aj keď forma nie je top, koncovky mu často vychádzajú.');
    }
    if (t.teamImpact >= 2) {
        summaryParts.push('V štvorhre je pre tím výrazná pridaná hodnota.');
    }

    parts.push(summaryParts.join(' '));
    return parts.join(' ');
}

function renderStatsRadar(stats, compareStats = null, attempt = 0, maxAttempts = 20) {
    const canvas = document.getElementById('statsRadarChart');
    if (!canvas || typeof Chart === 'undefined') {
        if (attempt < maxAttempts) setTimeout(() => renderStatsRadar(stats, compareStats, attempt + 1, maxAttempts), 150);
        return;
    }
    const rect = canvas.getBoundingClientRect();
    if ((rect.width < 2 || rect.height < 2) && attempt < maxAttempts) {
        setTimeout(() => renderStatsRadar(stats, compareStats, attempt + 1, maxAttempts), 150);
        return;
    }
    const ctx = canvas.getContext('2d');
    if (chartRefs['radar']) chartRefs['radar'].destroy();

    const keys = ['attack', 'defense', 'consistency', 'momentum', 'teamImpact', 'clutch'];
    const labels = ['Ofenzíva', 'Defenzíva', 'Stabilita výkonu', 'Momentum', 'Tímový vplyv', 'Výkon pod tlakom'];
    const themePrimary = getThemeVar('--color-primary', '#7c3aed');
    const themeDanger = getThemeVar('--color-danger', '#dc2626');
    const themeTextSubtle = getThemeVar('--color-text-subtle', '#374151');
    const themeMuted = getThemeVar('--color-muted', '#6b7280');
    const getSampleHint = (s, key) => {
        const c = s?.counts || {};
        if (key === 'teamImpact') return `${c.doubles || 0} štvorhier`;
        if (key === 'clutch') return `${c.close || 0} päťsetákov`;
        if (key === 'attack' || key === 'defense') return `${c.singles || 0} dvojhier`;
        return `${c.total || 0} zápasov`;
    };
    const toPointArrays = (vals, color) => {
        const radii = keys.map(k => Number.isFinite(vals[k]) ? 3 : 0);
        const pointColors = keys.map(k => Number.isFinite(vals[k]) ? color : 'rgba(0,0,0,0)');
        return { radii, pointColors };
    };
    const dataPoints = keys.map(k => (Number.isFinite(stats.values[k]) ? stats.values[k] : null));
    const axisHasAnyData = keys.map(k =>
        Number.isFinite(stats.values[k]) || (compareStats && Number.isFinite(compareStats.values[k]))
    );
    const basePoint = toPointArrays(stats.values, themePrimary);

    const datasets = [{
        label: stats?.label || 'Hráč',
        data: dataPoints,
        backgroundColor: toRgba(themePrimary, 0.15),
        borderColor: themePrimary,
        borderWidth: 2,
        pointBackgroundColor: basePoint.pointColors,
        pointRadius: basePoint.radii,
        pointHoverRadius: basePoint.radii.map(r => (r ? 4 : 0))
    }];

    if (compareStats) {
        const comparePoint = toPointArrays(compareStats.values, themeDanger);
        datasets.push({
            label: compareStats.label || 'Porovnanie',
            data: keys.map(k => (Number.isFinite(compareStats.values[k]) ? compareStats.values[k] : null)),
            backgroundColor: toRgba(themeDanger, 0.12),
            borderColor: themeDanger,
            borderWidth: 2,
            pointBackgroundColor: comparePoint.pointColors,
            pointRadius: comparePoint.radii,
            pointHoverRadius: comparePoint.radii.map(r => (r ? 4 : 0))
        });
    }

    chartRefs['radar'] = new Chart(ctx, {
        type: 'radar',
        data: {
            labels,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: datasets.length > 1 },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const raw = ctx.raw;
                            const key = keys[ctx.dataIndex];
                            if (raw === null || !Number.isFinite(raw)) {
                                const hint = getSampleHint(ctx.datasetIndex === 0 ? stats : compareStats, key);
                                return `${ctx.dataset.label}: – (N/A, ${hint})`;
                            }
                            return `${ctx.dataset.label}: ${Number(raw).toFixed(0)}`;
                        }
                    }
                }
            },
            scales: {
                r: {
                    min: 0,
                    max: 100,
                    ticks: { display: false },
                    grid: { color: 'rgba(0,0,0,0.08)' },
                    angleLines: { color: 'rgba(0,0,0,0.1)' },
                    pointLabels: {
                        color: (ctx) => axisHasAnyData[ctx.index] ? themeTextSubtle : toRgba(themeMuted, 0.55),
                        font: { size: 11, weight: '600' }
                    }
                }
            }
        }
    });
}

function renderDerivedStats(stats, compareStats = null) {
    const list = document.getElementById('derivedStatsList');
    if (list) {
        list.innerHTML = '';
        const fmt = (x) => (Number.isFinite(x) ? x.toFixed(0) : '–');
        ['attack', 'defense', 'consistency', 'momentum', 'teamImpact', 'clutch'].forEach(key => {
            const meta = STAT_META[key];
            const row = document.createElement('div');
            row.className = 'stat-row';
            const compareVal = compareStats ? fmt(compareStats.values[key]) : null;
            const primaryVal = fmt(stats.values[key]);
            const primaryMissing = primaryVal === '–';
            const compareMissing = compareVal === '–';
            row.innerHTML = `
                <div class="stat-label-der">
                    <span class="stat-label-main">${meta.label}</span>
                    <span class="stat-tip">${meta.tip}</span>
                </div>
                <div class="stat-value-pair">
                    <span class="stat-value stat-value-primary ${primaryMissing ? 'stat-none' : ''}">${primaryVal}</span>
                    <span class="stat-value ${compareStats ? (compareMissing ? 'stat-none' : 'stat-value-compare') : 'stat-value-dash'}">${compareStats ? compareVal : ''}</span>
                </div>
            `;
            list.appendChild(row);
        });
    }

    const desc = document.getElementById('statsDescription');
    if (desc) desc.innerText = buildStatsDescription(stats);

    const disclaimer = document.getElementById('statsDisclaimer');
    if (disclaimer) {
        const lowSample = stats.counts.total < 5 ? ' Počet zápasov je veľmi nízky, berte to s väčšou rezervou.' : '';
        const hasNA = ['attack','defense','consistency','momentum','teamImpact','clutch'].some(k => !Number.isFinite(stats.values[k]));
        const naNote = hasNA ? ' Hodnoty „–“ znamenajú, že pre danú štatistiku nie sú dostupné dáta (napr. 0 štvorhier alebo 0 päťsetákov).' : '';
        disclaimer.innerText =
            'Vyššie uvedený popis vychádza výlučne z dostupných štatistík a výkonov hráča v zápasoch. ' +
            'Bohužiaľ nevieme zmerať „skutočné“ herné zručnosti (napr. kvalitu topspinu, techniku bekhendu/forehendu, použité vybavenie a poťahy a pod.). ' +
            'Text slúži len na zábavné/informačné účely a nemusí verne odrážať reálnu hernú silu.' +
            lowSample +
            naNote;
    }

    renderStatsRadar(stats, compareStats);
}

// ============================================================
// 4. PAGE RENDERERS
// ============================================================

// --- HOME PAGE ---
function renderHomePage() {
    // Load disclaimer from Google Sheets (Config!B3)
    const loadDisclaimerFromSheet = async () => {
        if (typeof GoogleSheetsLoader === 'undefined') {
            console.warn('GoogleSheetsLoader not available, disclaimer will not be shown.');
            return;
        }
        try {
            const disclaimerText = await GoogleSheetsLoader.fetchCell({
                sheetName: 'Config',
                cell: 'B3',
                cache: false
            });
            const disclaimerContainer = document.getElementById('disclaimerContainer');
            if (disclaimerText && disclaimerText.trim() && disclaimerContainer) {
                disclaimerContainer.innerHTML = `<p>${disclaimerText}</p>`;
                disclaimerContainer.style.display = 'block';
            } else if (disclaimerContainer) {
                disclaimerContainer.style.display = 'none';
            }
        } catch (e) {
            console.error('Failed to load disclaimer from sheet:', e);
        }
    };

    loadDisclaimerFromSheet();

    const playedMatches = matchResults.filter(isPlayedMatch);

    // "Aktuálne Kolo" selection:
    // Prefer a round that has any match scheduled in the same ISO week as today.
    // Fallback to the existing "latest played round" logic.
    // Calculate this FIRST so we can pass it to processData for correct round stats
    const lastPlayedMatch = playedMatches.length > 0 ? playedMatches[playedMatches.length - 1] : null;
    const latestRoundId = lastPlayedMatch ? getMatchRoundId(lastPlayedMatch) : null;
    const thisWeekRoundId = getThisWeekRoundId(matchResults, new Date());
    const currentRoundId = thisWeekRoundId || latestRoundId;
    
    // Process data with currentRoundId so stats are calculated for the correct round
    const {players, roundsSet, totalSets, latestRoundName, upsetsList} = processData(currentRoundId);

    // Create team map for ratings
    const playerArr = Object.values(players);
    const teamMap = new Map();
    // Using global sortRoster function
    playerArr.forEach(p => {
        if (p.team && p.team !== 'N/A') {
            if (!teamMap.has(p.team)) teamMap.set(p.team, []);
            teamMap.get(p.team).push(p);
        }
    });
    teamMap.forEach((list, key) => teamMap.set(key, sortRoster(list)));

    // Stats
    const uniqueTeamMatches = new Set(playedMatches.map(m => `${getMatchRoundId(m)}_${m.player_a_team}_${m.player_b_team}`));
    document.getElementById('totalRounds').innerText = roundsSet.size;
    document.getElementById('totalTeamMatches').innerText = uniqueTeamMatches.size;
    document.getElementById('totalMatches').innerText = playedMatches.length;
    document.getElementById('totalSets').innerText = totalSets;

    // Back-side explanations for the 4 stat cards
    const roundsBack = document.getElementById('statBackRoundsText');
    if (roundsBack) {
        const weeks = roundsSet.size || 0;
        roundsBack.innerText = `V lige sa odohralo približne ${weeks} týždňov (kôl).`;
    }
    const tmBack = document.getElementById('statBackTeamMatchesText');
    if (tmBack) {
        const hours = uniqueTeamMatches.size * 3;
        tmBack.innerText = `Ak jeden tímový zápas trvá cca 3 hodiny, tak spolu je to približne ${hours} hodín stolného tenisu.`;
    }
    const matchesBack = document.getElementById('statBackMatchesText');
    if (matchesBack) {
        matchesBack.innerText = 'Celkový počet odohraných zápasov (dvojhry + štvorhry) v lige.';
    }
    const setsBack = document.getElementById('statBackSetsText');
    if (setsBack) {
        const points = totalSets * 18;
        setsBack.innerText = `Ak má jeden set v priemere ~18 lôpt, tak sa odohralo približne ${points} lôpt.`;
    }

    // Home "stat cards" flip interaction (tap/click + keyboard)
    // Implemented here so it only runs on the home page.
    (() => {
        const cards = Array.from(document.querySelectorAll('[data-flip-card]'));
        if (!cards.length) return;
        const setFlipped = (card, flipped) => {
            card.classList.toggle('is-flipped', !!flipped);
            card.setAttribute('aria-pressed', flipped ? 'true' : 'false');
            const back = card.querySelector('.stat-face--back');
            if (back) back.setAttribute('aria-hidden', flipped ? 'false' : 'true');
        };
        const closeAll = (except = null) => {
            cards.forEach(c => { if (c !== except) setFlipped(c, false); });
        };
        cards.forEach(card => {
            if (card.dataset.flipBound === '1') return;
            card.dataset.flipBound = '1';

            const onToggle = () => {
                const willFlip = !card.classList.contains('is-flipped');
                closeAll(willFlip ? card : null);
                setFlipped(card, willFlip);
            };

            card.addEventListener('click', (e) => {
                // Let links on the back side work normally
                if (e.target && e.target.closest && e.target.closest('a')) return;
                e.preventDefault();
                onToggle();
            }, {passive: false});

            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    closeAll();
                }
            }, {passive: false});
        });

        // Click outside closes flipped cards
        document.addEventListener('click', (e) => {
            if (e.target && e.target.closest && e.target.closest('[data-flip-card]')) return;
            closeAll();
        }, {passive: true, once: true});
    })();

    const currentTitleText = currentRoundId ? (() => {
        // Prefer the round name from any match in that round; fall back to legacy string.
        const m = matchResults.find(x => getMatchRoundId(x) === currentRoundId) || playedMatches.find(x => getMatchRoundId(x) === currentRoundId);
        const s = m && m.season ? ` (${m.season})` : '';
        return m ? `${m.round}${s}` : (latestRoundName || currentRoundId);
    })() : "Zatiaľ žiadne zápasy";

    const latestTitleEl = document.getElementById('latestRoundTitle');
    if (latestTitleEl) {
        latestTitleEl.innerText = currentRoundId ? `Aktuálne Kolo: ${currentTitleText}` : currentTitleText;
    }

    // Top Gainers
    const top5 = Object.values(players).sort((a, b) => b.roundGain - a.roundGain).slice(0, 10);
    const gainList = document.getElementById('topGainersList');
    gainList.innerHTML = '';
    top5.forEach((p, index) => {
        if (p.roundGain <= 0) return;
        const li = document.createElement('li');
        li.className = 'top-player-row';
        li.innerHTML = `<div class="tp-rank">${index + 1}</div><div class="tp-name">${p.name} <span class="tp-team">(${p.team})</span></div><div class="tp-gain">+${p.roundGain.toFixed(1)}</div>`;
        gainList.appendChild(li);
    });

    // Upsets
    const upsetDiv = document.getElementById('upsetContainer');
    upsetsList.sort((a, b) => b.diff - a.diff);
    if (upsetsList.length > 0) {
        let html = '';
        upsetsList.slice(0, 5).forEach(u => {
            html += `<div class="upset-card"><div class="upset-label">(Rating rozdiel ${Math.round(u.diff)})</div>
                <div class="upset-match"><div class="upset-player">${u.winner}<div class="upset-team">${u.wTeam}</div><span class="upset-rating">${u.wRate.toFixed(0)}</span></div>
                <div class="upset-score">${u.score}</div>
                <div class="upset-player">${u.loser}<div class="upset-team">${u.lTeam}</div><span class="upset-rating">${u.lRate.toFixed(0)}</span></div></div></div>`;
        });
        upsetDiv.innerHTML = html;
    } else {
        upsetDiv.innerHTML = `<div style="text-align:center; color:var(--color-muted-2);">Žiadne prekvapenia v tomto kole.</div>`;
    }

    // Latest Results (Now "Current Round")
    if (currentRoundId) {
        const currentRoundMatches = matchResults.filter(m => getMatchRoundId(m) === currentRoundId);
        renderMatchList(currentRoundMatches, document.getElementById('latestRoundContainer'), false, players, teamMap);

        // Previous Round Logic
        const roundsIndex = buildRoundsIndex(matchResults);
        const allRoundIds = Object.values(roundsIndex)
            .sort((a, b) => {
                if (a.seasonOrder !== b.seasonOrder) return a.seasonOrder - b.seasonOrder; // older -> newer
                return a.roundNum - b.roundNum; // lower -> higher
            })
            .map(r => r.id);
        const currentIndex = allRoundIds.indexOf(currentRoundId);

        if (currentIndex > 0) {
            const prevRoundId = allRoundIds[currentIndex - 1];
            const prevRoundMatches = matchResults.filter(m => getMatchRoundId(m) === prevRoundId);

            const pm = prevRoundMatches[0];
            const s = pm && pm.season ? ` (${pm.season})` : '';
            const prevName = pm ? `${pm.round}${s}` : prevRoundId;

            const prevHeader = document.getElementById('prevRoundTitle')?.parentElement;
            if (prevHeader) prevHeader.style.display = '';
            document.getElementById('prevRoundTitle').innerText = prevName;
            renderMatchList(prevRoundMatches, document.getElementById('prevRoundContainer'), false, players, teamMap);
        } else {
            const prevHeader = document.getElementById('prevRoundTitle').parentElement;
            if (prevHeader) prevHeader.style.display = 'none';
        }
    }

    // --- UPCOMING MATCHES LOGIC ---
    const upcomingContainer = document.getElementById('upcomingMatchesContainer');
    if (!upcomingContainer) return;

    // Filter FUTURE matches - only from SUBSEQUENT rounds (not in latest ID)
    const futureMatches = matchResults.filter(m => !isPlayedMatch(m) && getMatchRoundId(m) !== currentRoundId);

    if (futureMatches.length > 0) {
        const uniqueFutureIds = [...new Set(futureMatches.map(m => getMatchRoundId(m)))];
        const nextRoundId = uniqueFutureIds[0];
        const nextRoundMatches = futureMatches.filter(m => getMatchRoundId(m) === nextRoundId);

        const nm = nextRoundMatches[0];
        const s = nm && nm.season ? ` (${nm.season})` : '';
        const nextName = nm ? `${nm.round}${s}` : "Nasledujúce kolo";

        const titleSpan = document.getElementById('nextRoundTitle');
        if (titleSpan && titleSpan.parentElement) {
            titleSpan.parentElement.innerText = `Zápasy nasledujúceho kola: ${nextName}`;
        }

        const listDiv = document.getElementById('upcomingList');
        listDiv.innerHTML = '';
        listDiv.removeAttribute('class'); // Remove grid layout class

        renderMatchList(nextRoundMatches, listDiv, false, players, teamMap);

        upcomingContainer.style.display = 'block';
    } else {
        upcomingContainer.style.display = 'none';
    }
}

// --- RESULTS PAGE ---
function renderResultsPage() {
    const {players} = processData();
    const playerArr = Object.values(players);
    
    // Create team map
    const teamMap = new Map();
    // Using global sortRoster function
    playerArr.forEach(p => {
        if (p.team && p.team !== 'N/A') {
            if (!teamMap.has(p.team)) teamMap.set(p.team, []);
            teamMap.get(p.team).push(p);
        }
    });
    teamMap.forEach((list, key) => teamMap.set(key, sortRoster(list)));

    // Get team names for filter
    const teamNames = Array.from(teamMap.keys()).sort((a, b) => a.localeCompare(b, 'sk', {sensitivity: 'base'}));
    
    // Populate team filter datalist
    const teamsList = document.getElementById('resultsTeamsList');
    if (teamsList) {
        teamsList.innerHTML = '';
        teamNames.forEach(team => {
            const opt = document.createElement('option');
            opt.value = team;
            teamsList.appendChild(opt);
        });
    }

    // DOM elements for filter
    const teamFilterInput = document.getElementById('resultsTeamFilter');
    const applyFilterBtn = document.getElementById('applyTeamFilterBtn');
    const clearFilterBtn = document.getElementById('clearTeamFilterBtn');
    
    let selectedTeam = null;

    // Filter matches by team
    const filterMatchesByTeam = (teamName) => {
        if (!teamName) return null;
        return (m) => {
            return m.player_a_team === teamName || m.player_b_team === teamName;
        };
    };

    // Render matches with optional team filter
    const renderMatches = (teamFilter = null) => {
        const container = document.getElementById('resultsContainer');
        container.innerHTML = '';

        const rounds = {};
        // Group by ROUND ID (Season + Round), only PLAYED matches
        let matchesToProcess = matchResults.filter(isPlayedMatch);
        
        // Apply team filter if provided
        if (teamFilter) {
            const filterFunc = filterMatchesByTeam(teamFilter);
            matchesToProcess = matchesToProcess.filter(filterFunc);
        }

        matchesToProcess.forEach(m => {
            const id = getMatchRoundId(m);
            if (!rounds[id]) {
                const rNum = parseInt((m.round.match(/\d+/) || [0])[0]);
                rounds[id] = {
                    id: id,
                    name: m.round,
                    season: m.season,
                    matches: [],
                    seasonOrder: getSeasonOrder(m.season),
                    roundNum: rNum
                };
            }
            rounds[id].matches.push(m);
        });

        // Sort Rounds: Latest Season first, then Latest Round first
        const sortedRoundIds = Object.keys(rounds).sort((a, b) => {
            const rA = rounds[a];
            const rB = rounds[b];

            if (rA.seasonOrder !== rB.seasonOrder) {
                return rB.seasonOrder - rA.seasonOrder;
            }
            return rB.roundNum - rA.roundNum;
        });

        sortedRoundIds.forEach(id => {
            const r = rounds[id];
            const roundWrapper = document.createElement('div');
            roundWrapper.className = 'round-group';
            const header = document.createElement('div');
            header.className = 'round-header';

            // Header format: "13. kolo. JESEŇ 2025"
            const seasonPart = r.season ? `. ${r.season}` : '';
            header.innerText = `${r.name}${seasonPart}`;

            roundWrapper.appendChild(header);
            renderMatchList(r.matches, roundWrapper, true, players, teamMap, selectedTeam);
            container.appendChild(roundWrapper);
        });
    };

    // Apply filter button handler
    if (applyFilterBtn) {
        applyFilterBtn.onclick = () => {
            const inputValue = teamFilterInput ? teamFilterInput.value.trim() : '';
            if (!inputValue) {
                alert('Prosím, vyberte tím');
                return;
            }
            
            // Find matching team (case-insensitive)
            const matchedTeam = teamNames.find(t => t.toLowerCase() === inputValue.toLowerCase());
            if (!matchedTeam) {
                alert('Tím nebol nájdený. Prosím, vyberte tím zo zoznamu.');
                return;
            }

            selectedTeam = matchedTeam;
            if (teamFilterInput) teamFilterInput.value = matchedTeam;
            if (clearFilterBtn) clearFilterBtn.style.display = 'inline-block';
            renderMatches(selectedTeam);
        };
    }

    // Clear filter button handler
    if (clearFilterBtn) {
        clearFilterBtn.onclick = () => {
            selectedTeam = null;
            if (teamFilterInput) teamFilterInput.value = '';
            clearFilterBtn.style.display = 'none';
            renderMatches(null);
        };
    }

    // Allow Enter key to submit filter
    if (teamFilterInput) {
        teamFilterInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (applyFilterBtn) applyFilterBtn.click();
            }
        };
    }

    // Initial render (no filter)
    renderMatches(null);
}

// Shared Helper for List
function renderMatchList(matches, container, appendToProvided, playersData = null, teamMapData = null, selectedTeamForFilter = null) {
    const teamMatches = {};
    matches.forEach(m => {
        const key = `${m.player_a_team}::${m.player_b_team}`;
        if (!teamMatches[key]) teamMatches[key] = {
            teamA: m.player_a_team,
            teamB: m.player_b_team,
            scoreA: 0,
            scoreB: 0,
            games: [],
            date: m.date,
            location: m.location,
            round: m.round,
            season: m.season,
            group: m.group || ""
        };

        if (isPlayedMatch(m)) {
            const sA = parseInt(m.score_a);
            const sB = parseInt(m.score_b);
            if (sA > sB) teamMatches[key].scoreA++;
            if (sB > sA) teamMatches[key].scoreB++;
        }
        teamMatches[key].games.push(m);
    });

    // Using global getPlayerRatingBeforeMatch and getPlayerMatchesBeforeMatch functions directly

    const calculateTeamRatingsForMatch = (teamName, match) => {
        if (!teamMapData || !playersData) {
            return { actualRating: 0, activeRating: 0, overallRating: 0 };
        }
        const teamPlayers = teamMapData.get(teamName) || [];
        if (teamPlayers.length === 0) {
            return { actualRating: 0, activeRating: 0, overallRating: 0 };
        }

        const playerDataMap = new Map();
        const uniquePlayersSet = new Set(); // Track unique individual players
        const playerMatchesInTeamMatch = new Map(); // Track how many matches each player played in THIS team match
        
        match.games.forEach(g => {
            const isDoubles = g.doubles === true || g.doubles === "true";
            const playersA = g.player_a ? g.player_a.split('/').map(n => n.trim()).filter(n => n && !isWalkoverToken(n)) : [];
            const playersB = g.player_b ? g.player_b.split('/').map(n => n.trim()).filter(n => n && !isWalkoverToken(n)) : [];
            
            if (g.player_a_team === teamName) {
                // Track unique players
                playersA.forEach(p => uniquePlayersSet.add(p));
                
                // Track matches played in this team match
                if (isDoubles && playersA.length === 2) {
                    // Doubles: each player gets 0.5 matches
                    playersA.forEach(p => {
                        playerMatchesInTeamMatch.set(p, (playerMatchesInTeamMatch.get(p) || 0) + 0.5);
                    });
                } else if (playersA.length === 1) {
                    // Singles: player gets 1 match
                    playerMatchesInTeamMatch.set(playersA[0], (playerMatchesInTeamMatch.get(playersA[0]) || 0) + 1);
                }
                
                if (isDoubles && playersA.length === 2) {
                    const key = `${playersA[0]}/${playersA[1]}`;
                    if (!playerDataMap.has(key)) {
                        const rating1 = getPlayerRatingBeforeMatch(playersA[0], match.round, match.season, playersData);
                        const rating2 = getPlayerRatingBeforeMatch(playersA[1], match.round, match.season, playersData);
                        const avgRating = (rating1 + rating2) / 2;
                        const matches1 = getPlayerMatchesBeforeMatch(playersA[0], match.round, match.season, playersData);
                        const matches2 = getPlayerMatchesBeforeMatch(playersA[1], match.round, match.season, playersData);
                        const totalMatches = matches1 + matches2;
                        if (totalMatches > 0) {
                            playerDataMap.set(key, { rating: avgRating, matches: totalMatches });
                        }
                    }
                } else if (playersA.length === 1) {
                    const key = playersA[0];
                    if (!playerDataMap.has(key)) {
                        const rating = getPlayerRatingBeforeMatch(playersA[0], match.round, match.season, playersData);
                        const matches = getPlayerMatchesBeforeMatch(playersA[0], match.round, match.season, playersData);
                        if (matches > 0) {
                            playerDataMap.set(key, { rating, matches });
                        }
                    }
                }
            }
            
            if (g.player_b_team === teamName) {
                // Track unique players
                playersB.forEach(p => uniquePlayersSet.add(p));
                
                // Track matches played in this team match
                if (isDoubles && playersB.length === 2) {
                    // Doubles: each player gets 0.5 matches
                    playersB.forEach(p => {
                        playerMatchesInTeamMatch.set(p, (playerMatchesInTeamMatch.get(p) || 0) + 0.5);
                    });
                } else if (playersB.length === 1) {
                    // Singles: player gets 1 match
                    playerMatchesInTeamMatch.set(playersB[0], (playerMatchesInTeamMatch.get(playersB[0]) || 0) + 1);
                }
                
                if (isDoubles && playersB.length === 2) {
                    const key = `${playersB[0]}/${playersB[1]}`;
                    if (!playerDataMap.has(key)) {
                        const rating1 = getPlayerRatingBeforeMatch(playersB[0], match.round, match.season, playersData);
                        const rating2 = getPlayerRatingBeforeMatch(playersB[1], match.round, match.season, playersData);
                        const avgRating = (rating1 + rating2) / 2;
                        const matches1 = getPlayerMatchesBeforeMatch(playersB[0], match.round, match.season, playersData);
                        const matches2 = getPlayerMatchesBeforeMatch(playersB[1], match.round, match.season, playersData);
                        const totalMatches = matches1 + matches2;
                        if (totalMatches > 0) {
                            playerDataMap.set(key, { rating: avgRating, matches: totalMatches });
                        }
                    }
                } else if (playersB.length === 1) {
                    const key = playersB[0];
                    if (!playerDataMap.has(key)) {
                        const rating = getPlayerRatingBeforeMatch(playersB[0], match.round, match.season, playersData);
                        const matches = getPlayerMatchesBeforeMatch(playersB[0], match.round, match.season, playersData);
                        if (matches > 0) {
                            playerDataMap.set(key, { rating, matches });
                        }
                    }
                }
            }
        });

        let actualRating = 0;
        // Count unique individual players who actually played (not game entries)
        const uniquePlayersCount = uniquePlayersSet.size;
        
        if (uniquePlayersCount > 0) {
            // Collect individual player ratings and their match counts in this team match
            const playerRatings = [];
            const matchWeights = [];
            
            // Get ratings for each unique player
            uniquePlayersSet.forEach(playerName => {
                const rating = getPlayerRatingBeforeMatch(playerName, match.round, match.season, playersData);
                const matches = getPlayerMatchesBeforeMatch(playerName, match.round, match.season, playersData);
                const matchesInTeamMatch = playerMatchesInTeamMatch.get(playerName) || 0;
                
                // Include all players who actually played in this team match,
                // even if this was their first match in the league (matches may be 0)
                if (matchesInTeamMatch > 0) {
                    playerRatings.push(rating);
                    matchWeights.push(matchesInTeamMatch);
                }
            });
            
            if (playerRatings.length > 0) {
                // Calculate weighted average: sum(rating × matches_in_team_match) / sum(matches_in_team_match)
                let totalWeighted = 0;
                let totalWeight = 0;
                for (let i = 0; i < playerRatings.length; i++) {
                    totalWeighted += playerRatings[i] * matchWeights[i];
                    totalWeight += matchWeights[i];
                }
                // Normalize to 18 (standard team match total) if less, to account for walkover losses
                const expectedTotalMatches = 18;
                if (totalWeight < expectedTotalMatches) {
                    totalWeight = expectedTotalMatches;
                }
                actualRating = totalWeight > 0 ? totalWeighted / totalWeight : 0;
            }
        }

        const playersAtMatch = teamPlayers.map(p => {
            const rating = getPlayerRatingBeforeMatch(p.name, match.round, match.season, playersData);
            const matches = getPlayerMatchesBeforeMatch(p.name, match.round, match.season, playersData);
            return { name: p.name, rating, matches };
        }).filter(p => p.matches > 0);

        const sorted = [...playersAtMatch].sort((a, b) => {
            if (b.matches !== a.matches) return b.matches - a.matches;
            if (a.rating !== b.rating) return b.rating - a.rating;
            return a.name.localeCompare(b.name, 'sk', {sensitivity: 'base'});
        });

        const active = sorted.slice(0, 4);
        const activeRating = active.length > 0 
            ? active.reduce((sum, p) => sum + p.rating, 0) / active.length 
            : 0;

        const overallRating = playersAtMatch.length > 0
            ? playersAtMatch.reduce((sum, p) => sum + p.rating, 0) / playersAtMatch.length
            : 0;

        return { actualRating, activeRating, overallRating };
    };

    // Calculate current team ratings (for unplayed matches - uses current ratings, not before-match)
    const calculateCurrentTeamRatings = (teamName) => {
        if (!teamMapData || !playersData) {
            return { activeRating: 0, overallRating: 0 };
        }
        const teamPlayers = teamMapData.get(teamName) || [];
        if (teamPlayers.length === 0) {
            return { activeRating: 0, overallRating: 0 };
        }

        // Sort by activity (matches) then by rating
        const sorted = [...teamPlayers].sort((a, b) => {
            const actA = (a.matches + a.dMatches);
            const actB = (b.matches + b.dMatches);
            if (actB !== actA) return actB - actA;
            if (a.rating !== b.rating) return b.rating - a.rating;
            return a.name.localeCompare(b.name, 'sk', {sensitivity: 'base'});
        });

        // Active rating (4 most active)
        const active = sorted.slice(0, 4);
        const activeRating = active.length > 0 
            ? active.reduce((sum, p) => sum + p.rating, 0) / active.length 
            : 0;

        // Overall rating (all players)
        const overallRating = teamPlayers.length > 0
            ? teamPlayers.reduce((sum, p) => sum + p.rating, 0) / teamPlayers.length
            : 0;

        return { activeRating, overallRating };
    };

    const wrapper = appendToProvided ? container : document.createElement('div');
    if (!appendToProvided) wrapper.className = 'round-group';

    Object.values(teamMatches).forEach(match => {
        const matchRow = document.createElement('div');
        // Add group-B class if group is B (for index.html and results.html)
        const isGroupB = match.group && match.group.trim().toUpperCase() === 'B';
        matchRow.className = 'match-row' + (isGroupB ? ' match-row--group-b' : '');

        // Check if played (at least one game is played)
        const isPlayed = match.games.some(isPlayedMatch);

        const logoA = getTeamLogoSrc(match.teamA);
        const logoB = getTeamLogoSrc(match.teamB);
        const logoSlotHtml = (src, teamName) => {
            const alt = `${escapeAttr(teamName)} logo`;
            const img = src ? `<img class="team-logo-small" src="${src}" alt="${alt}" loading="lazy">` : '';
            return `<div class="team-logo-slot">${img}</div>`;
        };
        const logoAHtml = logoSlotHtml(logoA, match.teamA);
        const logoBHtml = logoSlotHtml(logoB, match.teamB);

        if (isPlayed) {
            // Calculate score badge class if team filter is applied
            let scoreBadgeClass = '';
            if (selectedTeamForFilter) {
                const isHome = match.teamA === selectedTeamForFilter;
                const ourScore = isHome ? match.scoreA : match.scoreB;
                const theirScore = isHome ? match.scoreB : match.scoreA;
                if (ourScore > theirScore) {
                    scoreBadgeClass = 'score-badge--win';
                } else if (ourScore < theirScore) {
                    scoreBadgeClass = 'score-badge--loss';
                } else {
                    scoreBadgeClass = 'score-badge--draw';
                }
            }

            const summary = document.createElement('div');
            summary.className = 'match-summary';
            summary.innerHTML = `<div class="team-name team-left">${escapeHtml(match.teamA)}</div>${logoAHtml}<div class="score-badge ${scoreBadgeClass}">${match.scoreA}-${match.scoreB}</div>${logoBHtml}<div class="team-name team-right">${escapeHtml(match.teamB)}</div><div class="expand-icon">▼</div>`;
            const details = document.createElement('div');
            details.className = 'match-details';

            // --- STATS GENERATION START ---
            const stats = {};
            match.games.forEach(g => {
                if (!isPlayedMatch(g)) return;
                const isD = g.doubles === true || g.doubles === "true";
                const pVal = isD ? 0.5 : 1;
                const sA = parseInt(g.score_a);
                const sB = parseInt(g.score_b);

                const updateP = (namesStr, team, won) => {
                    if (!namesStr) return;
                    namesStr.split('/').map(n => n.trim()).forEach(n => {
                        if (!n || isWalkoverToken(n)) return;
                        if (!stats[n]) stats[n] = { name: n, team: team, points: 0, possible: 0 };
                        stats[n].possible += pVal;
                        if (won) stats[n].points += pVal;
                    });
                };
                updateP(g.player_a, match.teamA, sA > sB);
                updateP(g.player_b, match.teamB, sB > sA);
            });

            // Calculate ratings and prediction if players data is available
            let predictionHtml = '';
            let ratingsA = null;
            let ratingsB = null;
            
            if (playersData && teamMapData) {
                ratingsA = calculateTeamRatingsForMatch(match.teamA, match);
                ratingsB = calculateTeamRatingsForMatch(match.teamB, match);
                
                // Using global winProb function
                const totalSets = 18;
                let predScoreA = Math.round(totalSets * winProb(ratingsA.actualRating, ratingsB.actualRating));
                let predScoreB = Math.max(0, totalSets - predScoreA);
                
                predScoreA = Math.min(totalSets, Math.max(0, predScoreA));
                predScoreB = Math.min(totalSets, Math.max(0, predScoreB));
                
                predictionHtml = `<div class="match-prediction-section">
                    <div class="prediction-label">Predikcia pred zápasom (použitý skutočný rating - priemerný rating hráčov, ktorí hrali v zápase):</div>
                    <div class="prediction-score">${escapeHtml(match.teamA)} ${predScoreA} : ${predScoreB} ${escapeHtml(match.teamB)}</div>
                </div>`;
            }

            const getTeamStatsHtml = (teamName, align, teamRatings = null) => {
                const list = Object.values(stats).filter(p => p.team === teamName).sort((a, b) => {
                    if (b.points !== a.points) {
                        return b.points - a.points;
                    }
                    return a.possible - b.possible;
                });
                if (list.length === 0) return '';
                const tLogo = getTeamLogoSrc(teamName);
                let h = `<div class="team-stats ${align}">`;
                if (tLogo) h += `<div class="team-logo-stats"><img class="team-logo-large" src="${tLogo}" alt="${escapeAttr(teamName)} logo" loading="lazy"></div>`;
                
                // Add rating information if available
                if (teamRatings) {
                    h += `<div class="team-rating-info">
                        <div class="rating-info-item">
                            <span class="rating-label">
                                Skutočný rating:
                                <span class="tooltip-container">
                                    <span class="tooltip-icon">ℹ️</span>
                                    <span class="tooltip-text">Priemerný rating hráčov, ktorí hrali v zápase</span>
                                </span>
                            </span>
                            <span class="rating-value">${teamRatings.actualRating.toFixed(2)}</span>
                        </div>
                        <div class="rating-info-item">
                            <span class="rating-label">
                                Aktívny rating:
                                <span class="tooltip-container">
                                    <span class="tooltip-icon">ℹ️</span>
                                    <span class="tooltip-text">Priemerný rating 4 najaktívnejších hráčov v tíme</span>
                                </span>
                            </span>
                            <span class="rating-value">${teamRatings.activeRating.toFixed(2)}</span>
                        </div>
                        <div class="rating-info-item">
                            <span class="rating-label">
                                Celkový rating:
                                <span class="tooltip-container">
                                    <span class="tooltip-icon">ℹ️</span>
                                    <span class="tooltip-text">Priemerný rating všetkých hráčov v tíme</span>
                                </span>
                            </span>
                            <span class="rating-value">${teamRatings.overallRating.toFixed(2)}</span>
                        </div>
                    </div>`;
                }
                
                const isMobile = isMobileViewport();
                list.forEach((p, index) => {
                    h += `<div class="player-stat-row">
                        <div class="player-stat-name">${escapeHtml(isMobile ? formatPlayerName(p.name) : p.name)}</div>
                        <span class="player-stat-score">${p.points}/${p.possible}</span>
                    </div>`;
                });
                h += `</div>`;
                return h;
            };

            const scoreBadgeHtml = `<div class="score-badge score-badge--overlay ${scoreBadgeClass}">${match.scoreA}-${match.scoreB}</div>`;
            const statsHtml = `<div class="match-stats-container">${getTeamStatsHtml(match.teamA, 'left', ratingsA)}${scoreBadgeHtml}${getTeamStatsHtml(match.teamB, 'right', ratingsB)}</div>`;
            // --- STATS GENERATION END ---

            // Group games: doubles first, then singles
            const playedGames = match.games.filter(isPlayedMatch).sort((a, b) => (b.doubles ? 1 : 0) - (a.doubles ? 1 : 0));
            const doublesGames = playedGames.filter(g => g.doubles === true || g.doubles === "true");
            const singlesGames = playedGames.filter(g => !(g.doubles === true || g.doubles === "true"));
            
            let gamesHtml = '';
            let teamScoreA = 0;
            let teamScoreB = 0;
            let gameNumber = 0;
            
            // First 2 doubles matches
            if (doublesGames.length > 0) {
                gamesHtml += '<div class="game-group">';
                doublesGames.slice(0, 2).forEach(g => {
                    gameNumber++;
                    const sA = parseInt(g.score_a);
                    const sB = parseInt(g.score_b);
                    if (sA > sB) teamScoreA++;
                    else if (sB > sA) teamScoreB++;
                    gamesHtml += `<div class="game-row">
                        <span class="team-score team-score-left">${teamScoreA}</span>
                        <div class="game-row-content">
                            ${(g.doubles === true || g.doubles === "true") ? '<div class="doubles-badge">ŠTVORHRA</div>' : ''}
                            <div class="game-names"><div class="player-left">${escapeHtml(g.player_a)}</div><div class="game-score ${sA > sB ? 'win-left' : (sB > sA ? 'win-right' : '')}">${sA}:${sB}</div><div class="player-right">${escapeHtml(g.player_b)}</div></div>
                        </div>
                        <span class="team-score team-score-right">${teamScoreB}</span>
                    </div>`;
                });
                gamesHtml += '</div>';
            }
            
            // Singles matches in groups of 4
            for (let i = 0; i < singlesGames.length; i += 4) {
                const batch = singlesGames.slice(i, i + 4);
                if (batch.length > 0) {
                    gamesHtml += '<div class="game-group">';
                    batch.forEach(g => {
                        gameNumber++;
                        const sA = parseInt(g.score_a);
                        const sB = parseInt(g.score_b);
                        if (sA > sB) teamScoreA++;
                        else if (sB > sA) teamScoreB++;
                        gamesHtml += `<div class="game-row">
                            <span class="team-score team-score-left">${teamScoreA}</span>
                            <div class="game-row-content">
                                ${(g.doubles === true || g.doubles === "true") ? '<div class="doubles-badge">ŠTVORHRA</div>' : ''}
                                <div class="game-names"><div class="player-left">${escapeHtml(g.player_a)}</div><div class="game-score ${sA > sB ? 'win-left' : (sB > sA ? 'win-right' : '')}">${sA}:${sB}</div><div class="player-right">${escapeHtml(g.player_b)}</div></div>
                            </div>
                            <span class="team-score team-score-right">${teamScoreB}</span>
                        </div>`;
                    });
                    gamesHtml += '</div>';
                }
            }
            
            // Default mode is compact
            let currentViewMode = 'compact';
            
            // Create view toggle switch (on/off)
            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'match-details-toggle';
            toggleLabel.title = 'Prepnúť zobrazenie';

            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = true; // Default to compact (enabled)
            toggleInput.setAttribute('aria-label', 'Prepínač zobrazenia: kompaktný režim');

            const toggleSlider = document.createElement('span');
            toggleSlider.className = 'match-details-toggle__slider';

            const toggleText = document.createElement('span');
            toggleText.className = 'match-details-toggle__text';
            toggleText.textContent = 'Kompakt';

            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(toggleSlider);
            toggleLabel.appendChild(toggleText);
            
            const setupTableHighlighting = (container) => {
                if (!container) return;
                
                const table = container.querySelector('.compact-match-table');
                if (!table) return;
                
                // Remove all highlights
                const removeHighlights = () => {
                    table.querySelectorAll('.compact-cell--highlighted, .row-header--highlighted, .col-header--highlighted').forEach(el => {
                        el.classList.remove('compact-cell--highlighted', 'row-header--highlighted', 'col-header--highlighted');
                    });
                };
                
                // Highlight cells for a specific player (row or column)
                const highlightPlayer = (playerName, isRow) => {
                    removeHighlights();
                    if (isRow) {
                        // Find row header by comparing data attribute values
                        const rowHeaders = table.querySelectorAll('.row-header');
                        const rowHeader = Array.from(rowHeaders).find(h => h.getAttribute('data-player') === playerName);
                        if (rowHeader) {
                            rowHeader.classList.add('row-header--highlighted');
                            const rowIndex = rowHeader.getAttribute('data-row-index');
                            table.querySelectorAll(`td[data-row-index="${rowIndex}"]`).forEach(cell => {
                                cell.classList.add('compact-cell--highlighted');
                            });
                        }
                    } else {
                        // Find column header by comparing data attribute values
                        const colHeaders = table.querySelectorAll('.col-header');
                        const colHeader = Array.from(colHeaders).find(h => h.getAttribute('data-player') === playerName);
                        if (colHeader) {
                            colHeader.classList.add('col-header--highlighted');
                            const colIndex = colHeader.getAttribute('data-col-index');
                            table.querySelectorAll(`td[data-col-index="${colIndex}"]`).forEach(cell => {
                                cell.classList.add('compact-cell--highlighted');
                            });
                        }
                    }
                };
                
                // Highlight row and column for a specific match
                const highlightMatch = (rowIndex, colIndex) => {
                    removeHighlights();
                    const cell = table.querySelector(`td[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`);
                    if (cell) {
                        const playerA = cell.getAttribute('data-player-a');
                        const playerB = cell.getAttribute('data-player-b');
                        
                        // Highlight row
                        const rowHeaders = table.querySelectorAll('.row-header');
                        const rowHeader = Array.from(rowHeaders).find(h => h.getAttribute('data-player') === playerA);
                        if (rowHeader) {
                            rowHeader.classList.add('row-header--highlighted');
                            table.querySelectorAll(`td[data-row-index="${rowIndex}"]`).forEach(c => {
                                c.classList.add('compact-cell--highlighted');
                            });
                        }
                        
                        // Highlight column
                        const colHeaders = table.querySelectorAll('.col-header');
                        const colHeader = Array.from(colHeaders).find(h => h.getAttribute('data-player') === playerB);
                        if (colHeader) {
                            colHeader.classList.add('col-header--highlighted');
                            table.querySelectorAll(`td[data-col-index="${colIndex}"]`).forEach(c => {
                                c.classList.add('compact-cell--highlighted');
                            });
                        }
                    }
                };
                
                // Add click handlers to row headers
                table.querySelectorAll('.row-header').forEach(header => {
                    header.style.cursor = 'pointer';
                    header.onclick = (e) => {
                        e.stopPropagation();
                        const playerName = header.getAttribute('data-player');
                        highlightPlayer(playerName, true);
                    };
                });
                
                // Add click handlers to column headers
                table.querySelectorAll('.col-header').forEach(header => {
                    header.style.cursor = 'pointer';
                    header.onclick = (e) => {
                        e.stopPropagation();
                        const playerName = header.getAttribute('data-player');
                        highlightPlayer(playerName, false);
                    };
                });
                
                // Add click handlers to cells
                table.querySelectorAll('td.compact-cell').forEach(cell => {
                    cell.style.cursor = 'pointer';
                    cell.onclick = (e) => {
                        e.stopPropagation();
                        const rowIndex = cell.getAttribute('data-row-index');
                        const colIndex = cell.getAttribute('data-col-index');
                        highlightMatch(rowIndex, colIndex);
                    };
                });
                
                // Remove highlights when clicking elsewhere
                document.addEventListener('click', (e) => {
                    if (!table.contains(e.target)) {
                        removeHighlights();
                    }
                }, true);
            };
            
            const renderMatchDetails = () => {
                const predictionStatsGroup = `<div class="match-prediction-stats-group">${predictionHtml}${statsHtml}</div>`;
                
                if (currentViewMode === 'compact') {
                    const compactTable = buildCompactMatchTable(match);
                    details.innerHTML = predictionStatsGroup + compactTable;
                    details.classList.add('match-details--compact');
                    details.classList.remove('match-details--detailed');
                    
                    // Setup highlighting after table is rendered
                    const container = details.querySelector('.compact-match-table-container');
                    setupTableHighlighting(container);
                } else {
                    details.innerHTML = predictionStatsGroup + gamesHtml;
                    details.classList.add('match-details--detailed');
                    details.classList.remove('match-details--compact');
                }
                
                // Re-insert the header after the match-prediction-stats-group
                const statsGroup = details.querySelector('.match-prediction-stats-group');
                if (statsGroup) {
                    const detailsHeader = document.createElement('div');
                    detailsHeader.className = 'match-details-header';
                    detailsHeader.appendChild(toggleLabel);
                    statsGroup.insertAdjacentElement('afterend', detailsHeader);
                }
            };
            
            // Add toggle switch to details header (will be positioned after stats group)
            const detailsHeader = document.createElement('div');
            detailsHeader.className = 'match-details-header';
            detailsHeader.appendChild(toggleLabel);
            
            toggleLabel.onclick = (e) => {
                e.stopPropagation();
            };

            toggleInput.onchange = (e) => {
                e.stopPropagation();
                currentViewMode = toggleInput.checked ? 'compact' : 'detailed';
                toggleText.textContent = currentViewMode === 'detailed' ? 'Detail' : 'Kompakt';
                renderMatchDetails();
            };
            
            // Initial render
            renderMatchDetails();

            summary.onclick = () => {
                const isEx = details.style.display === 'block';
                details.style.display = isEx ? 'none' : 'block';
                matchRow.classList.toggle('active', !isEx);
            };
            matchRow.appendChild(summary);
            matchRow.appendChild(details);
        } else {
            // Unplayed View - with expand functionality and ratings
            const summary = document.createElement('div');
            summary.className = 'match-summary';
            summary.innerHTML = `<div class="team-name team-left">${escapeHtml(match.teamA)}</div>${logoAHtml}<div class="score-badge score-badge--vs">VS</div>${logoBHtml}<div class="team-name team-right">${escapeHtml(match.teamB)}</div><div class="expand-icon">▼</div>`;
            
            const details = document.createElement('div');
            details.className = 'match-details';

            // Calculate current team ratings and prediction if players data is available
            let predictionHtml = '';
            let ratingsA = null;
            let ratingsB = null;
            
            if (playersData && teamMapData) {
                ratingsA = calculateCurrentTeamRatings(match.teamA);
                ratingsB = calculateCurrentTeamRatings(match.teamB);
                
                // Prediction based on active rating
                // Using global winProb function
                const totalSets = 18;
                let predScoreA = Math.round(totalSets * winProb(ratingsA.activeRating, ratingsB.activeRating));
                let predScoreB = Math.max(0, totalSets - predScoreA);
                
                predScoreA = Math.min(totalSets, Math.max(0, predScoreA));
                predScoreB = Math.min(totalSets, Math.max(0, predScoreB));
                
                predictionHtml = `<div class="match-prediction-section">
                    <div class="prediction-label">Predikcia pred zápasom (použitý aktívny rating - priemerný rating 4 najaktívnejších hráčov):</div>
                    <div class="prediction-score">${escapeHtml(match.teamA)} ${predScoreA} : ${predScoreB} ${escapeHtml(match.teamB)}</div>
                </div>`;

                const getTeamRatingsHtml = (teamName, align, teamRatings) => {
                    const tLogo = getTeamLogoSrc(teamName);
                    let h = `<div class="team-stats ${align}">`;
                    if (tLogo) h += `<div class="team-logo-stats"><img class="team-logo-large" src="${tLogo}" alt="${escapeAttr(teamName)} logo" loading="lazy"></div>`;
                    
                    // Add rating information (only active and overall, no actual rating)
                    h += `<div class="team-rating-info">
                        <div class="rating-info-item">
                            <span class="rating-label">
                                Aktívny rating:
                                <span class="tooltip-container">
                                    <span class="tooltip-icon">ℹ️</span>
                                    <span class="tooltip-text">Priemerný rating 4 najaktívnejších hráčov v tíme</span>
                                </span>
                            </span>
                            <span class="rating-value">${teamRatings.activeRating.toFixed(2)}</span>
                        </div>
                        <div class="rating-info-item">
                            <span class="rating-label">
                                Celkový rating:
                                <span class="tooltip-container">
                                    <span class="tooltip-icon">ℹ️</span>
                                    <span class="tooltip-text">Priemerný rating všetkých hráčov v tíme</span>
                                </span>
                            </span>
                            <span class="rating-value">${teamRatings.overallRating.toFixed(2)}</span>
                        </div>
                    </div>`;
                    h += `</div>`;
                    return h;
                };

                const scoreBadgeHtml = `<div class="score-badge score-badge--overlay score-badge--vs">VS</div>`;
                const ratingsHtml = `<div class="match-stats-container">${getTeamRatingsHtml(match.teamA, 'left', ratingsA)}${scoreBadgeHtml}${getTeamRatingsHtml(match.teamB, 'right', ratingsB)}</div>`;
                details.innerHTML = predictionHtml + ratingsHtml;
            } else {
                details.innerHTML = '';
            }

            summary.onclick = () => {
                const isEx = details.style.display === 'block';
                details.style.display = isEx ? 'none' : 'block';
                matchRow.classList.toggle('active', !isEx);
            };

            matchRow.appendChild(summary);
            matchRow.appendChild(details);

            const dateStr = match.date ? formatDateWithSlovakDay(match.date) : '';
            const locStr = match.location ? match.location : '';
            if (dateStr || locStr) {
                const metaDiv = document.createElement('div');
                metaDiv.style.cssText = "text-align:center; font-size:0.75em; color:black; padding-bottom:8px; margin-top:-8px;";
                metaDiv.innerHTML = `${dateStr}${dateStr && locStr ? ' | ' : ''}${locStr}`;
                matchRow.appendChild(metaDiv);
            }
        }
        wrapper.appendChild(matchRow);
    });
    if (!appendToProvided) container.appendChild(wrapper);
}

// Unified function to render rating line chart (shared by rating.html and mystats.html)
function renderRatingLineChart(p, compareP, canvasId, chartRefSetter, attempt = 0) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') {
        if (attempt < 8) setTimeout(() => renderRatingLineChart(p, compareP, canvasId, chartRefSetter, attempt + 1), 120);
        return;
    }
    const rect = canvas.getBoundingClientRect();
    if ((rect.width < 2 || rect.height < 2) && attempt < 8) {
        setTimeout(() => renderRatingLineChart(p, compareP, canvasId, chartRefSetter, attempt + 1), 120);
        return;
    }
    const ctx = canvas.getContext('2d');
    
    // Get all history keys from all matches (not just player's matches)
    const allRounds = buildRoundsIndex(matchResults || []);
    const historyKeysSet = new Set();
    
    // Add keys from all rounds
    Object.values(allRounds).forEach(round => {
        const rNum = round.roundNum;
        const sOrder = round.seasonOrder;
        const sDisp = round.season ? ` (${round.season})` : '';
        const historyKey = `${sOrder}-${String(rNum).padStart(2, '0')}|${round.name}${sDisp}`;
        historyKeysSet.add(historyKey);
    });
    
    // Also include any keys from player histories (in case there are rounds not in matchResults)
    Object.keys(p.history || {}).forEach(k => historyKeysSet.add(k));
    if (compareP) {
        Object.keys(compareP.history || {}).forEach(k => historyKeysSet.add(k));
    }
    
    const allKeysUnsorted = Array.from(historyKeysSet);
    
    // Helper function to forward-fill between first and last existing points
    const buildFilledSeries = (history, keys) => {
        const raw = keys.map(k => (Object.prototype.hasOwnProperty.call(history, k) ? history[k] : null));
        const firstIdx = raw.findIndex(v => v !== null && v !== undefined);
        if (firstIdx === -1) return raw.map(() => null);
        let lastIdx = -1;
        for (let i = raw.length - 1; i >= 0; i--) {
            if (raw[i] !== null && raw[i] !== undefined) { lastIdx = i; break; }
        }
        let lastVal = raw[firstIdx];
        for (let i = firstIdx; i <= lastIdx; i++) {
            if (raw[i] === null || raw[i] === undefined) raw[i] = lastVal;
            else lastVal = raw[i];
        }
        return raw;
    };
    
    // Find the first and last round where the player(s) actually played
    const playerHistoryKeys = Object.keys(p.history || {}).sort();
    const compareHistoryKeys = compareP ? Object.keys(compareP.history || {}).sort() : [];
    let allKeys, labels, dataPoints;
    
    if (playerHistoryKeys.length === 0 && compareHistoryKeys.length === 0) {
        // No history for either player, show nothing
        allKeys = [];
        labels = [];
        dataPoints = [];
    } else {
        // Parse the keys to compare season and round numbers
        const parseKey = (key) => {
            const parts = key.split('|');
            if (parts.length < 1) return { seasonOrder: 0, roundNum: 0 };
            const prefix = parts[0];
            const prefixParts = prefix.split('-');
            return {
                seasonOrder: parseInt(prefixParts[0] || '0', 10),
                roundNum: parseInt(prefixParts[1] || '0', 10)
            };
        };
        
        // Find the earliest first round and latest last round across both players
        let firstRound = null;
        let lastRound = null;
        
        if (playerHistoryKeys.length > 0) {
            const firstPlayerKey = playerHistoryKeys[0];
            const lastPlayerKey = playerHistoryKeys[playerHistoryKeys.length - 1];
            firstRound = parseKey(firstPlayerKey);
            lastRound = parseKey(lastPlayerKey);
        }
        
        if (compareHistoryKeys.length > 0) {
            const firstCompareKey = compareHistoryKeys[0];
            const lastCompareKey = compareHistoryKeys[compareHistoryKeys.length - 1];
            const firstCompare = parseKey(firstCompareKey);
            const lastCompare = parseKey(lastCompareKey);
            
            if (firstRound === null) {
                firstRound = firstCompare;
                lastRound = lastCompare;
            } else {
                // Use the earlier first round and later last round
                if (firstCompare.seasonOrder < firstRound.seasonOrder || 
                    (firstCompare.seasonOrder === firstRound.seasonOrder && firstCompare.roundNum < firstRound.roundNum)) {
                    firstRound = firstCompare;
                }
                if (lastCompare.seasonOrder > lastRound.seasonOrder ||
                    (lastCompare.seasonOrder === lastRound.seasonOrder && lastCompare.roundNum > lastRound.roundNum)) {
                    lastRound = lastCompare;
                }
            }
        }
        
        if (firstRound === null || lastRound === null) {
            allKeys = [];
            labels = [];
            dataPoints = [];
        } else {
            // Filter allKeys to only include rounds between (and including) first and last rounds
            allKeys = allKeysUnsorted.filter(key => {
                const keyInfo = parseKey(key);
                // Include if: same season and round >= first, or season > first season
                // AND: same season and round <= last, or season < last season
                const afterFirst = keyInfo.seasonOrder > firstRound.seasonOrder || 
                    (keyInfo.seasonOrder === firstRound.seasonOrder && keyInfo.roundNum >= firstRound.roundNum);
                const beforeLast = keyInfo.seasonOrder < lastRound.seasonOrder ||
                    (keyInfo.seasonOrder === lastRound.seasonOrder && keyInfo.roundNum <= lastRound.roundNum);
                return afterFirst && beforeLast;
            }).sort();
            
            labels = allKeys.map(k => k.split('|')[1] || k);
            dataPoints = buildFilledSeries(p.history, allKeys);
        }
    }
    
    // Use consistent theme color retrieval
    const themePrimary = getThemeVar('--color-primary', '#7c3aed');
    const themeDanger = getThemeVar('--color-danger', '#dc2626');
    
    const datasets = [{
        label: p.name,
        data: dataPoints,
        borderColor: themePrimary,
        backgroundColor: toRgba(themePrimary, 0.1),
        borderWidth: 2,
        pointRadius: 1,
        pointBackgroundColor: themePrimary,
        tension: 0.3,
        fill: true
    }];

    if (compareP) {
        const compareData = buildFilledSeries(compareP.history, allKeys);
        datasets.push({
            label: compareP.name,
            data: compareData,
            borderColor: themeDanger,
            backgroundColor: toRgba(themeDanger, 0.1),
            borderWidth: 2,
            pointRadius: 1,
            pointBackgroundColor: themeDanger,
            tension: 0.3,
            fill: true
        });
    }

    // Destroy existing chart if it exists
    if (chartRefSetter && typeof chartRefSetter.get === 'function') {
        const existingChart = chartRefSetter.get();
        if (existingChart && existingChart.destroy) {
            existingChart.destroy();
        }
    }
    
    // Create new chart with improved options
    const newChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: compareP !== null || datasets.length > 1 }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(128,128,128,0.15)' }
                },
                x: {
                    grid: { display: false },
                    ticks: { autoSkip: true, maxTicksLimit: 10 }
                }
            }
        }
    });
    
    // Update the chart reference using the setter
    if (chartRefSetter && typeof chartRefSetter.set === 'function') {
        chartRefSetter.set(newChart);
    }
    
    return newChart;
}

// --- RATING PAGE ---
function renderRatingPage() {
    const {players} = processData();
    // Baseline order (default view): by rating desc
    const sortedPlayers = Object.values(players).sort((a, b) => b.rating - a.rating);

    // Attach "Rebríček" points per player (computed from matchResults + kontumácia rules)
    const rebricekMap = computeRebricekMap(players);
    sortedPlayers.forEach(p => {
        p.rebricek = rebricekMap.get(p.name) || 0;
    });

    // Attach "Form" (last 5 matches) for rating table
    // Uses matchDetails order (chronological as processed) and marks win/loss by match score.
    const computeForm = (p, n = 5) => {
        const details = Array.isArray(p?.matchDetails) ? p.matchDetails : [];
        const recent = details.slice(-n);
        const bools = recent.map(m => (m.score_own || 0) > (m.score_opp || 0)); // true=win, false=loss
        // Score for sorting: recent results have higher weight (binary encoded)
        let score = 0;
        bools.forEach((isWin, idx) => {
            const weight = 1 << idx; // oldest=1, newest=16 (for 5)
            if (isWin) score += weight;
        });
        const wins = bools.filter(Boolean).length;
        return { bools, score, wins };
    };
    sortedPlayers.forEach(p => {
        const f = computeForm(p, 5);
        p.form = f.bools;
        p.formScore = f.score;
        p.formWins = f.wins;
    });

    // Find the latest round from all matches
    const playedMatches = (matchResults || []).filter(isPlayedMatch);
    let latestRoundId = null;
    if (playedMatches.length > 0) {
        const lastMatch = playedMatches[playedMatches.length - 1];
        latestRoundId = getMatchRoundId(lastMatch);
    }

    // Calculate points gained/lost in latest round for each player
    sortedPlayers.forEach(p => {
        p.latestRoundPoints = null; // null means didn't play in latest round
        if (latestRoundId && Array.isArray(p.matchDetails)) {
            const matchesInLatestRound = p.matchDetails.filter(m => getMatchRoundId(m) === latestRoundId);
            if (matchesInLatestRound.length > 0) {
                // Sum up all delta_own for matches in this round
                const totalDelta = matchesInLatestRound.reduce((sum, m) => sum + (m.delta_own || 0), 0);
                p.latestRoundPoints = totalDelta;
            }
        }
    });

    let selectedTeams = [];
    let activePlayer = null;
    let activeDerived = null;
    let comparePlayer = null;
    let compareDerived = null;

    const normalizePlayerKey = (name) => (name || '').trim().toLowerCase();
    const playerLookup = {};
    sortedPlayers.forEach(p => {
        playerLookup[normalizePlayerKey(p.name)] = p;
    });

    // Create rating-based ranking (1-based, doesn't change with sorting)
    const ratingRanking = new Map();
    sortedPlayers.forEach((p, i) => {
        ratingRanking.set(normalizePlayerKey(p.name), i + 1);
    });

    // Sorting state (applies to all columns except "Tím")
    const baselineIndex = new Map(sortedPlayers.map((p, i) => [normalizePlayerKey(p.name), i]));
    let sortState = { key: 'rating', dir: 'desc' }; // default = rating desc

    const cmpStr = (a, b) => String(a || '').localeCompare(String(b || ''), 'sk', {sensitivity: 'base'});
    const cmpNum = (a, b) => (Number(a) || 0) - (Number(b) || 0);
    const sortPlayers = (list) => {
        const dirMul = sortState.dir === 'asc' ? 1 : -1;
        const decorated = list.map((p, idx) => ({p, idx})); // stable

        const getSuccessMatches = (p) => p.matches > 0 ? (p.wins / p.matches) * 100 : 0;
        const getSuccessSets = (p) => {
            const total = (p.setsWin || 0) + (p.setsLose || 0);
            return total > 0 ? ((p.setsWin || 0) / total) * 100 : 0;
        };
        const getLastPlayedNum = (p) => getRoundNumFromStr(p.lastPlayed);
        const getBestWinRating = (p) => (typeof p.bestWinRating === 'number' && !isNaN(p.bestWinRating)) ? p.bestWinRating : -Infinity;

        const valueForKey = (p, key) => {
            switch (key) {
                // Special: "#" column acts as "reset to default order"
                case 'pos':
                    return 0;
                case 'name':
                    return p.name || '';
                case 'form':
                    return p.formScore || 0;
                case 'rating':
                    return p.rating || 0;
                case 'latest_round_points':
                    return p.latestRoundPoints !== null && p.latestRoundPoints !== undefined ? p.latestRoundPoints : -Infinity;
                case 'rebricek':
                    return p.rebricek || 0;
                case 's_matches':
                    return p.matches || 0;
                case 's_wins':
                    return p.wins || 0;
                case 's_losses':
                    return p.losses || 0;
                case 's_sets_win':
                    return p.setsWin || 0;
                case 's_sets_lose':
                    return p.setsLose || 0;
                case 's_success_matches':
                    return getSuccessMatches(p);
                case 's_success_sets':
                    return getSuccessSets(p);
                case 'd_matches':
                    return p.dMatches || 0;
                case 'd_wins':
                    return p.dWins || 0;
                case 'd_losses':
                    return p.dLosses || 0;
                case 'best_win':
                    return getBestWinRating(p);
                case 'last_played':
                    return getLastPlayedNum(p);
                case 'max_rating':
                    return p.maxRating || 0;
                case 'min_rating':
                    return p.minRating || 0;
                default:
                    return 0;
            }
        };

        const isStringKey = (k) => k === 'name';
        decorated.sort((A, B) => {
            const a = A.p, b = B.p;
            if (sortState.key === 'pos') {
                const ia = baselineIndex.get(normalizePlayerKey(a.name)) ?? 0;
                const ib = baselineIndex.get(normalizePlayerKey(b.name)) ?? 0;
                if (ia !== ib) return (ia - ib) * dirMul;
                return (A.idx - B.idx); // stable
            }

            // Special handling for sets column: sort by setsWin desc/asc then setsLose inverse for readability
            if (sortState.key === 's_sets') {
                const aw = a.setsWin || 0, bw = b.setsWin || 0;
                const al = a.setsLose || 0, bl = b.setsLose || 0;
                if (aw !== bw) return (aw - bw) * dirMul;
                // Fewer lost sets is better when sorting desc; invert using dirMul
                if (al !== bl) return (bl - al) * dirMul;
                return (A.idx - B.idx);
            }

            const va = valueForKey(a, sortState.key);
            const vb = valueForKey(b, sortState.key);
            const diff = isStringKey(sortState.key) ? cmpStr(va, vb) : cmpNum(va, vb);
            if (diff !== 0) return diff * dirMul;

            // Tie-break: baseline order, then stable index
            const ia = baselineIndex.get(normalizePlayerKey(a.name)) ?? 0;
            const ib = baselineIndex.get(normalizePlayerKey(b.name)) ?? 0;
            if (ia !== ib) return ia - ib;
            return A.idx - B.idx;
        });
        return decorated.map(x => x.p);
    };

    const getDisplayedPlayers = () => {
        let list = sortedPlayers;
        if (selectedTeams.length > 0) list = list.filter(p => selectedTeams.includes(p.team));
        return sortPlayers(list);
    };

    const compareInput = document.getElementById('compareInput');
    const compareForm = document.getElementById('compareForm');
    const compareStatusEl = document.getElementById('compareStatus');
    const compareList = document.getElementById('comparePlayerList');
    const compareMatchesList = document.getElementById('compareMatchesList');
    const clearCompareBtn = document.getElementById('clearCompareBtn');

    const setCompareStatus = (msg, ok = false) => {
        if (!compareStatusEl) return;
        compareStatusEl.innerText = msg || '';
        compareStatusEl.classList.toggle('ok', !!msg && ok);
        if (!msg) compareStatusEl.classList.remove('ok');
    };

    const renderHeadToHead = (p, other) => {
        if (!compareMatchesList) return;
        if (!p || !other) {
            compareMatchesList.innerHTML = `<div class="compare-match-item">Vyberte hráča na porovnanie.</div>`;
            return;
        }
        const otherName = other.name.toLowerCase();
        const matches = p.matchDetails.filter(m => (m.opponent || '').toLowerCase().includes(otherName));
        if (matches.length === 0) {
            compareMatchesList.innerHTML = `<div class="compare-match-item">Zatiaľ žiadne vzájomné zápasy.</div>`;
            return;
        }
        const latest = [...matches].slice(-6).reverse();
        const items = latest.map(m => {
            const isWin = m.score_own > m.score_opp;
            const scoreClass = isWin ? 'compare-match-score' : 'compare-match-score loss';
            const doublesBadge = m.isDoubles ? '<span class="doubles-badge">ŠTVORHRA</span>' : '';
            const seasonLabel = m.season ? ` (${m.season})` : '';
            const badgePart = doublesBadge ? ` ${doublesBadge}` : '';
            return `<div class="compare-match-item">
                <div class="compare-match-head">
                    <span>${m.round}${seasonLabel}${badgePart}</span>
                    <span class="${scoreClass}">${m.score_own}:${m.score_opp}</span>
                </div>
                <div class="compare-match-meta">
                    <span>${m.own_name_display} (${p.team || 'N/A'})</span>
                    <span>${m.opponent} (${m.opponent_team || 'N/A'})</span>
                </div>
            </div>`;
        }).join('');
        compareMatchesList.innerHTML = items;
    };

    const populateCompareOptions = () => {
        if (!compareList) return;
        compareList.innerHTML = '';
        sortedPlayers.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            compareList.appendChild(opt);
        });
    };

    const tbody = document.getElementById('mainTableBody');
    const renderTable = () => {
        tbody.innerHTML = '';
        const display = getDisplayedPlayers();
        display.forEach((p, index) => {
            const tr = document.createElement('tr');
            // if (p.team === 'COKERY') tr.classList.add('team-cokery');
            // if (p.team === 'ASTORIAFIT') tr.classList.add('team-astoria');
            tr.onclick = () => {
                if (window.getSelection().toString().length === 0) openPlayerModal(p);
            };

            const successMatches = p.matches > 0 ? ((p.wins / p.matches) * 100).toFixed(2) : 0;
            const totalSets = p.setsWin + p.setsLose;
            const successSets = totalSets > 0 ? ((p.setsWin / totalSets) * 100).toFixed(2) : 0;
            const bestWinStr = p.bestWinOpponent ? `${p.bestWinOpponent} (${p.bestWinRating.toFixed(2)})` : '';

            let ratingClass = 'rating-high';
            if (p.matches + p.dMatches <= 10) ratingClass = 'rating-low';
            else if (p.matches + p.dMatches <= 20) ratingClass = 'rating-med';

            const ratingRank = ratingRanking.get(normalizePlayerKey(p.name)) || (index + 1);
            const rebricekVal = Number.isInteger(p.rebricek) ? String(p.rebricek) : (p.rebricek || 0).toFixed(1);
            const formBools = Array.isArray(p.form) ? p.form : [];
            const formHtml = (() => {
                // Always render 5 circles; missing matches appear as empty/neutral.
                const dots = [];
                for (let i = 0; i < 5; i++) {
                    if (i >= formBools.length) dots.push(`<span class="form-dot form-dot--empty" title="N/A"></span>`);
                    else dots.push(`<span class="form-dot ${formBools[i] ? 'form-dot--win' : 'form-dot--loss'}" title="${formBools[i] ? 'Výhra' : 'Prehra'}"></span>`);
                }
                return `<div class="form-dots" aria-label="Forma (posledných 5 zápasov)">${dots.join('')}</div>`;
            })();
            // Format latest round points
            const latestRoundPointsHtml = (() => {
                if (p.latestRoundPoints === null || p.latestRoundPoints === undefined) {
                    return '';
                }
                const delta = p.latestRoundPoints;
                if (Math.abs(delta) < 0.01) {
                    return `<span class="diff-val diff-neu">-</span>`;
                }
                const className = delta > 0 ? 'diff-up' : 'diff-down';
                const symbol = delta > 0 ? '▲' : '▼';
                return `<span class="diff-val ${className}">${symbol}${Math.abs(delta).toFixed(2)}</span>`;
            })();

            tr.innerHTML = `
                <td>${ratingRank}</td><td>${p.name}</td><td>${p.team}</td>
                <td class="${ratingClass}">${p.rating.toFixed(2)}</td>
                <td>${latestRoundPointsHtml}</td>
                <td class="form-cell">${formHtml}</td>
<!--                TODO temporary remove rebricek-->
<!--                <td>${rebricekVal}</td>-->
                <td class="border-left-thick">${p.matches}</td><td>${p.wins}</td><td>${p.losses}</td>
                <td>${p.setsWin}:${p.setsLose}</td><td>${successMatches}</td><td>${successSets}</td>
                <td class="border-left-thick">${p.dMatches}</td><td>${p.dWins}</td><td>${p.dLosses}</td>
                <td class="border-left-thick">${bestWinStr}</td><td>${p.lastPlayed}</td>
                <td>${p.maxRating.toFixed(2)}</td><td>${p.minRating.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    const attachSortHandlersForThead = (theadEl) => {
        if (!theadEl) return;
        const rows = Array.from(theadEl.querySelectorAll('tr'));
        if (rows.length < 2) return;
        const topRow = Array.from(rows[0].children).filter(el => el.tagName === 'TH');
        const subRow = Array.from(rows[1].children).filter(el => el.tagName === 'TH');

        // Build leaf headers in visual left-to-right order:
        // - leaf in top row are those with rowspan > 1 (single-column headers)
        // - group headers in top row (colspan > 1) are expanded using subRow THs
        let subPtr = 0;
        const leafThs = [];
        topRow.forEach(th => {
            const colSpan = th.colSpan || 1;
            const rowSpan = th.rowSpan || 1;
            if (rowSpan > 1 && colSpan === 1) {
                leafThs.push(th);
            } else if (colSpan > 1) {
                for (let i = 0; i < colSpan; i++) {
                    if (subRow[subPtr]) leafThs.push(subRow[subPtr]);
                    subPtr++;
                }
            }
        });

        // Column index -> sort key (must match tbody column order)
        const colKeys = [
            'pos',           // #
            'name',          // Hráč
            null,            // Tím (excluded)
            'rating',        // Rating
            'latest_round_points', // Posledné Kolo
            'form',          // Forma
            // TODO temporary remove rebricek
            // 'rebricek',
            's_matches',     // Singles: Zápasy
            's_wins',        // Singles: Výhry
            's_losses',      // Singles: Prehry
            null,            // Singles: Sety (NOT sortable)
            's_success_matches', // Singles: Úspešnosť Zápasy
            's_success_sets',    // Singles: Úspešnosť Sety
            'd_matches',     // Doubles: Zápasy
            'd_wins',        // Doubles: Výhry
            'd_losses',      // Doubles: Prehry
            null,            // Naj Výhra (NOT sortable)
            'last_played',   // Naposledy Hral
            'max_rating',    // Max Rating
            'min_rating'     // Min Rating
        ];

        leafThs.forEach((th, colIdx) => {
            const key = colKeys[colIdx] || null;
            // Skip Team, and skip any unexpected headers
            if (!key) return;
            // Allow re-attachment for sticky headers
            if (th.dataset.sortBound === '1' && !theadEl.closest('#stickyHeaderContainer')) return;
            th.dataset.sortBound = '1';
            th.style.cursor = 'pointer';
            th.addEventListener('click', (e) => {
                // Do not interfere with nested controls (like Team dropdown button)
                if (e.target && e.target.closest && e.target.closest('.team-filter-wrapper')) return;
                e.preventDefault();
                e.stopPropagation();

                const prevKey = sortState.key;
                if (prevKey === key) {
                    sortState.dir = (sortState.dir === 'asc') ? 'desc' : 'asc';
                } else {
                    sortState.key = key;
                    // Default direction: text asc, numbers desc (more useful in stats tables)
                    sortState.dir = (key === 'name') ? 'asc' : 'desc';
                    // "#" acts as "reset": keep default rating desc
                    if (key === 'pos') sortState.dir = 'asc';
                }
                renderTable();
            }, {passive: false});
        });
    };

    window.toggleTeamDropdown = (e) => {
        e.stopPropagation();
        const btn = e.currentTarget || e.target;
        const wrapper = btn.closest('.team-filter-wrapper');
        const dropdown = wrapper ? wrapper.querySelector('.team-filter-dropdown') : document.getElementById('teamDropdown');
        if (!dropdown) return;
        const isVisible = dropdown.classList.contains('show');
        document.querySelectorAll('.team-filter-dropdown').forEach(dd => dd.classList.remove('show'));

        if (!isVisible) {
            // Calculate position for fixed dropdown
            const rect = wrapper.getBoundingClientRect();
            dropdown.style.top = rect.bottom + 'px';
            dropdown.style.left = rect.left + 'px';
        }

        dropdown.classList.toggle('show', !isVisible);
    };
    window.addEventListener('click', (e) => {
        if (!e.target.matches('.team-filter-btn') && !e.target.closest('.team-filter-dropdown')) {
            document.querySelectorAll('.team-filter-dropdown').forEach(dd => dd.classList.remove('show'));
        }
    });

    // Init floating sticky header
    const wrapper = document.getElementById('mainTableWrapper');
    const table = document.getElementById('mainTable');
    if (wrapper && table) {
        const thead = table.querySelector('thead');
        attachSortHandlersForThead(thead);
        let stickyContainer = document.getElementById('stickyHeaderContainer');

        // Remove existing if any (to prevent duplicates on re-render)
        if (stickyContainer) stickyContainer.remove();

        stickyContainer = document.createElement('div');
        stickyContainer.id = 'stickyHeaderContainer';
        const stickyTable = document.createElement('table');
        stickyContainer.appendChild(stickyTable);
        document.body.appendChild(stickyContainer);

        // Clone header immediately
        stickyTable.appendChild(thead.cloneNode(true));
        stickyTable.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

        // Attach sort handlers to sticky header
        attachSortHandlersForThead(stickyTable.querySelector('thead'));

        const updateWidths = () => {
            const origThs = Array.from(thead.querySelectorAll('th'));
            const cloneThs = Array.from(stickyTable.querySelectorAll('th'));
            const tableRect = table.getBoundingClientRect();

            // 1. Update Table Width
            stickyTable.style.width = tableRect.width + 'px';
            stickyTable.style.minWidth = tableRect.width + 'px';
            stickyTable.style.maxWidth = tableRect.width + 'px';

            // 2. Calculate Column Widths from Tbody (most accurate)
            const tbody = table.querySelector('tbody');
            let colWidths = [];
            const firstRow = tbody ? tbody.querySelector('tr') : null;
            if (firstRow) {
                colWidths = Array.from(firstRow.children).map(td => td.getBoundingClientRect().width);
            }

            // 3. Update CSS Variable for Sticky Offsets (Col 1 width)
            if (colWidths.length > 0) {
                const col1W = colWidths[0];
                document.documentElement.style.setProperty('--col-1-width', col1W + 'px');
            }

            // 4. Build/Update Colgroup for Sticky Table
            let colgroup = stickyTable.querySelector('colgroup');
            if (!colgroup) {
                colgroup = document.createElement('colgroup');
                stickyTable.insertBefore(colgroup, stickyTable.firstChild);
            }
            colgroup.innerHTML = ''; // Clear existing
            colWidths.forEach(w => {
                const col = document.createElement('col');
                col.style.width = w + 'px';
                col.style.minWidth = w + 'px'; // Strict enforce
                colgroup.appendChild(col);
            });

            // 5. Height Sync (Header Rows)
            const origRows = Array.from(thead.querySelectorAll('tr'));
            const cloneRows = Array.from(stickyTable.querySelectorAll('tr'));
            origRows.forEach((row, i) => {
                if (cloneRows[i]) {
                    cloneRows[i].style.height = row.getBoundingClientRect().height + 'px';
                }
            });

            // 6. Copy computed styles for cells
            origThs.forEach((th, i) => {
                if (cloneThs[i]) {
                    const computed = window.getComputedStyle(th);
                    cloneThs[i].style.padding = computed.padding;
                    cloneThs[i].style.border = computed.border;
                    cloneThs[i].style.boxSizing = 'border-box';
                    cloneThs[i].style.width = '';
                    cloneThs[i].style.minWidth = '';
                    cloneThs[i].style.maxWidth = '';
                }
            });
        };

        let wasSticking = false;
        const onScroll = () => {
            const nav = document.getElementById('mainNav');
            const navHeight = nav ? nav.offsetHeight : 0;
            const rect = table.getBoundingClientRect();
            const triggerPoint = navHeight;

            // Show sticky header if table top is above trigger point, but table bottom is still visible
            const shouldStick = rect.top < triggerPoint && rect.bottom > triggerPoint;
            table.classList.toggle('sticky-active', shouldStick);

            if (shouldStick) {
                stickyContainer.style.display = 'block';
                // Enable interaction when visible (allows sorting on sticky header)
                stickyContainer.style.pointerEvents = 'auto';
                stickyTable.style.pointerEvents = 'auto';
                stickyTable.querySelectorAll('th').forEach(th => th.style.pointerEvents = 'auto');
                stickyContainer.style.top = navHeight + 'px';
                stickyContainer.scrollLeft = wrapper.scrollLeft;
                // Only update widths when first becoming visible or after resize
                if (!wasSticking) {
                    updateWidths();
                    wasSticking = true;
                }
            } else {
                if (wasSticking) {
                    stickyContainer.style.display = 'none';
                    stickyContainer.style.pointerEvents = 'none';
                    stickyTable.style.pointerEvents = 'none';
                    stickyTable.querySelectorAll('th').forEach(th => th.style.pointerEvents = 'none');
                    wasSticking = false;
                }
                table.classList.remove('sticky-active');
            }
        };

        const syncHorizontal = () => {
            stickyContainer.scrollLeft = wrapper.scrollLeft;
        };

        window.addEventListener('scroll', () => {
            onScroll();
            syncHorizontal();
        }, {passive: true});
        window.addEventListener('resize', () => {
            updateWidths();
            onScroll();
            syncHorizontal();
        });
        wrapper.addEventListener('scroll', syncHorizontal, {passive: true});

        // Initial sync
        setTimeout(updateWidths, 100);
        updateWidths();
    }

    const initTeamFilter = () => {
        const dropdowns = document.querySelectorAll('.team-filter-dropdown');
        dropdowns.forEach(dd => {
            dd.innerHTML = '';
            const uniqueTeams = [...new Set(sortedPlayers.map(p => p.team))].sort();
            uniqueTeams.forEach(team => {
                if (team === "N/A") return;
                const div = document.createElement('div');
                div.className = 'team-option';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = team;
                const span = document.createElement('span');
                span.innerText = team;
                div.onclick = (e) => {
                    if (e.target.tagName !== 'INPUT') {
                        checkbox.checked = !checkbox.checked;
                        handleTeamCheck(checkbox);
                    }
                };
                checkbox.onclick = (e) => {
                    e.stopPropagation();
                    handleTeamCheck(checkbox);
                };
                div.appendChild(checkbox);
                div.appendChild(span);
                dd.appendChild(div);
            });
            const footer = document.createElement('div');
            footer.className = 'filter-actions';
            footer.innerHTML = '<span class="clear-filter" onclick="clearTeamFilter()">Zrušiť filter</span>';
            dd.appendChild(footer);
        });
    };

    const handleTeamCheck = (checkbox) => {
        if (checkbox.checked) selectedTeams.push(checkbox.value);
        else selectedTeams = selectedTeams.filter(t => t !== checkbox.value);
        renderTable();
    };

    window.clearTeamFilter = () => {
        selectedTeams = [];
        document.querySelectorAll('.team-option input').forEach(i => i.checked = false);
        renderTable();
    };

    const updatePlayerInUrl = (playerName) => {
        const url = new URL(window.location.href);
        if (playerName) url.searchParams.set('player', playerName);
        else url.searchParams.delete('player');
        window.history.replaceState({}, '', url);
    };

    const playerModal = document.getElementById("playerModal");
    window.closePlayerModal = () => {
        playerModal.style.display = "none";
        updatePlayerInUrl(null);
    };

    const openPlayerModal = (p, opts = {}) => {
        const {skipUrlUpdate = false} = opts;
        if (!skipUrlUpdate) updatePlayerInUrl(p.name);

        if (typeof gtag !== 'undefined') {
            gtag('event', 'click_player', { 
                player: p.name
            });
        }

        activePlayer = p;
        activeDerived = computeDerivedStats(p);
        if (activeDerived) activeDerived.label = p.name;
        comparePlayer = null;
        compareDerived = null;
        if (compareInput) compareInput.value = '';
        setCompareStatus('');
        const playerRanking = ratingRanking.get(normalizePlayerKey(p.name)) || '?';
        document.getElementById('headerName').innerText = `#${playerRanking} ${p.name}`;
        document.getElementById('headerTeam').innerText = p.team || "";
        const logoEl = document.getElementById('headerTeamLogo');
        const logoWrap = document.getElementById('headerTeamLogoWrapper');
        const teamLogoSrc = getTeamLogoSrc(p.team);
        if (logoEl && logoWrap) {
            if (teamLogoSrc) {
                logoEl.src = teamLogoSrc;
                logoEl.style.display = 'block';
                logoWrap.style.display = 'flex';
            } else {
                logoEl.src = '';
                logoEl.style.display = 'none';
                logoWrap.style.display = 'none';
            }
        }
        document.getElementById('currentRatingVal').innerText = p.rating.toFixed(2);
        const setStat = (idName, idRate, oppName, oppRate) => {
            const elName = document.getElementById(idName);
            const elRate = document.getElementById(idRate);
            if (oppName) {
                elName.innerText = oppName;
                elName.className = "stat-value";
                elRate.innerText = `Rating: ${oppRate.toFixed(2)}`;
            } else {
                elName.innerText = "-";
                elName.className = "stat-value stat-none";
                elRate.innerText = "";
            }
        };
        setStat('bestWinName', 'bestWinRating', p.bestWinOpponent, p.bestWinRating);
        setStat('worstLossName', 'worstLossRating', p.worstLossOpponent, p.worstLossRating);
        let totalOpp = 0, countOpp = 0;
        p.matchDetails.forEach(m => {
            if (!m.isDoubles && m.opp_rating_after > 0) {
                totalOpp += m.opp_rating_after;
                countOpp++;
            }
        });
        document.getElementById('avgOpponentVal').innerText = countOpp > 0 ? (totalOpp / countOpp).toFixed(2) : "-";

        renderDerivedStats(activeDerived, compareDerived);

        playerModal.style.display = "flex";
        // Defer chart renders slightly to allow modal layout to settle (fixes zero-size canvas on reload with ?player=)
        setTimeout(() => {
            renderLineChart(p, comparePlayer);
        }, 80);
        renderPieCharts('matchesChart', 'setsChart', p.matches, p.wins, p.losses, p.setsWin, p.setsLose, 'matches', 'sets');
        renderPieCharts('dMatchesChart', 'dSetsChart', p.dMatches, p.dWins, p.dLosses, p.dSetsWin, p.dSetsLose, 'dMatches', 'dSets');
        renderFormHistory(p);
        renderHistory(p, players);
        renderHeadToHead(p, comparePlayer);
    };

    const renderLineChart = (p, compareP = null, attempt = 0) => {
        const chart = renderRatingLineChart(p, compareP, 'ratingChart', {
            get: () => chartRefs['line'],
            set: (chart) => { chartRefs['line'] = chart; }
        }, attempt);
    };

    const renderFormHistory = (p) => {
        const container = document.getElementById('formHistory');
        if (!container) return;
        container.innerHTML = '';
        const allMatches = Array.isArray(p?.matchDetails) ? p.matchDetails : [];
        // Show all matches; let flex-wrap handle overflow into multiple lines.
        const subset = allMatches;
        if (!subset.length) {
            container.innerHTML = `<div style="color:var(--color-muted); font-size:0.85em;">Žiadne zápasy.</div>`;
            return;
        }
        const dots = subset.map((m) => {
            const isWin = (m.score_own || 0) > (m.score_opp || 0);
            const cls = isWin ? 'form-dot--win' : 'form-dot--loss';
            const badge = m.isDoubles ? ' (Štvorhra)' : '';
            const title = `${m.round || ''}${m.season ? ' ' + m.season : ''}${badge} • ${m.score_own || 0}:${m.score_opp || 0}`;
            return `<span class="form-dot ${cls}" title="${escapeAttr(title)}"></span>`;
        });
        container.innerHTML = dots.join('');
    };

    const renderPieCharts = (mId, sId, matches, wins, losses, sWin, sLose, mPre, sPre) => {
        const getPct = (part, total) => total > 0 ? ((part / total) * 100).toFixed(1) : 0;
        document.getElementById(mPre + 'TotalVal').innerText = matches;
        document.getElementById(mPre + 'WinsVal').innerText = wins;
        document.getElementById(mPre + 'WinsPct').innerText = `(${getPct(wins, matches)}%)`;
        document.getElementById(mPre + 'LossVal').innerText = losses;
        document.getElementById(mPre + 'LossPct').innerText = `(${getPct(losses, matches)}%)`;
        document.getElementById(sPre + 'TotalVal').innerText = (sWin + sLose);
        document.getElementById(sPre + 'WinsVal').innerText = sWin;
        document.getElementById(sPre + 'WinsPct').innerText = `(${getPct(sWin, sWin + sLose)}%)`;
        document.getElementById(sPre + 'LossVal').innerText = sLose;
        document.getElementById(sPre + 'LossPct').innerText = `(${getPct(sLose, sWin + sLose)}%)`;
        const createPie = (id, w, l) => {
            const ctx = document.getElementById(id).getContext('2d');
            if (chartRefs[id]) chartRefs[id].destroy();
            const themeSuccess = getThemeVar('--color-success', '#16a34a');
            const themeDanger = getThemeVar('--color-danger', '#dc2626');
            chartRefs[id] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Výhry', 'Prehry'],
                    datasets: [{data: [w, l], backgroundColor: [themeSuccess, themeDanger], borderWidth: 0}]
                },
                options: {responsive: true, maintainAspectRatio: false, plugins: {legend: {display: false}}}
            });
        };
        createPie(mId, wins, losses);
        createPie(sId, sWin, sLose);
    };

    const renderHistory = (p, players) => {
        const container = document.getElementById('historyContainer');
        const getDiffHtml = (delta) => {
            if (Math.abs(delta) < 0.01) return `<span class="diff-val diff-neu">-</span>`;
            return `<span class="diff-val ${delta > 0 ? 'diff-up' : 'diff-down'}">${delta > 0 ? '▲' : '▼'}${Math.abs(delta).toFixed(2)}</span>`;
        };

        // Helper function to find partner's matchDetails for doubles
        const findPartnerMatch = (m, currentPlayerName) => {
            if (!m.isDoubles || !players) return null;
            const playerNames = m.own_name_display.split(' / ').map(n => n.trim());
            const partnerName = playerNames.find(n => n !== currentPlayerName);
            if (!partnerName) return null;
            const partner = players[partnerName];
            if (!partner || !partner.matchDetails) return null;
            // Find the same match by round, opponent, and score
            return partner.matchDetails.find(pm => 
                pm.round === m.round && 
                pm.opponent === m.opponent && 
                pm.score_own === m.score_own && 
                pm.score_opp === m.score_opp &&
                pm.isDoubles === true
            );
        };

        // Helper function to render player row for doubles
        const renderDoublesPlayerRow = (playerName, team, rating, delta) => {
            return `<span class="player-name-span">${playerName}</span><span>(${team}, <span class="rating-current">${rating.toFixed(2)}</span>)</span>${getDiffHtml(delta)}`;
        };

        if (p.matchDetails.length === 0) {
            container.innerHTML = '<p class="no-match">Žiadne zápasy</p>';
            return;
        }

        const allMatches = [...p.matchDetails].reverse();
        const visibleMatches = allMatches.slice(0, 5);
        const hiddenMatches = allMatches.slice(5);
        const hasMoreMatches = hiddenMatches.length > 0;

        let html = `<div class='history-section'><div class='history-title'>História Zápasov: ${p.name}</div>`;
        
        // Render visible matches (first 5)
        visibleMatches.forEach(m => {
            const isWin = m.score_own > m.score_opp;
            const seasonLabel = m.season ? ` (${m.season})` : '';
            const doublesHtml = m.isDoubles ? '<span class="doubles-badge">ŠTVORHRA</span>' : '';
            const displayDate = `${m.round}${seasonLabel}${doublesHtml ? ' ' + doublesHtml : ''}`;

            let ownPlayerRow, oppPlayerRow;

            if (m.isDoubles) {
                // For doubles: show each player separately
                const playerNames = m.own_name_display.split(' / ').map(n => n.trim());
                const partnerMatch = findPartnerMatch(m, p.name);
                
                // Current player's info - use team from match
                const ownTeam = m.own_team || p.team; // Fallback to current team if not stored
                const player1Row = renderDoublesPlayerRow(p.name, ownTeam, m.rating_after, m.delta_own);
                
                // Partner's info - use team from partner's match
                let player2Row = '';
                if (partnerMatch) {
                    const partnerName = playerNames.find(n => n !== p.name);
                    const partner = players[partnerName];
                    if (partner) {
                        const partnerTeam = partnerMatch.own_team || partner.team; // Fallback to current team if not stored
                        player2Row = ' / ' + renderDoublesPlayerRow(partnerName, partnerTeam, partnerMatch.rating_after, partnerMatch.delta_own);
                    }
                }
                ownPlayerRow = player1Row + player2Row;

                // Opponent players - use team from opponent's match
                const oppNames = m.opponent.split(' / ').map(n => n.trim());
                let oppRows = [];
                oppNames.forEach(oppName => {
                    const oppPlayer = players[oppName];
                    if (oppPlayer) {
                        // Find opponent's match where they played against our team
                        const oppMatch = oppPlayer.matchDetails?.find(om => 
                            om.round === m.round && 
                            om.opponent === m.own_name_display && 
                            om.score_own === m.score_opp && 
                            om.score_opp === m.score_own &&
                            om.isDoubles === true
                        );
                        if (oppMatch) {
                            const oppTeam = oppMatch.own_team || oppPlayer.team; // Fallback to current team if not stored
                            oppRows.push(renderDoublesPlayerRow(oppName, oppTeam, oppMatch.rating_after, oppMatch.delta_own));
                        } else {
                            // Fallback if partner match not found
                            oppRows.push(`<span class="player-name-span">${oppName}</span><span>(${oppPlayer.team})</span>`);
                        }
                    }
                });
                oppPlayerRow = oppRows.join(' / ');
            } else {
                // For singles: original format - use team from match
                const oppRatingHtml = `, <span class="rating-current">${m.opp_rating_after.toFixed(2)}</span>`;
                const ownTeam = m.own_team || p.team; // Fallback to current team if not stored
                ownPlayerRow = `<span class="player-name-span">${m.own_name_display}</span><span>(${ownTeam}, <span class="rating-current">${m.rating_after.toFixed(2)}</span>)</span>${getDiffHtml(m.delta_own)}`;
                oppPlayerRow = `<span class="player-name-span">${m.opponent}</span><span>(${m.opponent_team}${oppRatingHtml})</span>${getDiffHtml(m.delta_opp)}`;
            }

            html += `<div class="history-item">
                <div class="match-date">${displayDate}</div>
                <div class="match-content">
                    <div class="player-row">${ownPlayerRow}</div>
                    <div class="score-row ${isWin ? 'win-text' : 'loss-text'}">${m.score_own}:${m.score_opp}</div>
                    <div class="player-row">${oppPlayerRow}</div>
                </div>
            </div>`;
        });

        // Render hidden matches (rest, initially hidden)
        hiddenMatches.forEach(m => {
            const isWin = m.score_own > m.score_opp;
            const seasonLabel = m.season ? ` (${m.season})` : '';
            const doublesHtml = m.isDoubles ? '<span class="doubles-badge">ŠTVORHRA</span>' : '';
            const displayDate = `${m.round}${seasonLabel}${doublesHtml ? ' ' + doublesHtml : ''}`;

            let ownPlayerRow, oppPlayerRow;

            if (m.isDoubles) {
                // For doubles: show each player separately
                const playerNames = m.own_name_display.split(' / ').map(n => n.trim());
                const partnerMatch = findPartnerMatch(m, p.name);
                
                // Current player's info - use team from match
                const ownTeam = m.own_team || p.team; // Fallback to current team if not stored
                const player1Row = renderDoublesPlayerRow(p.name, ownTeam, m.rating_after, m.delta_own);
                
                // Partner's info - use team from partner's match
                let player2Row = '';
                if (partnerMatch) {
                    const partnerName = playerNames.find(n => n !== p.name);
                    const partner = players[partnerName];
                    if (partner) {
                        const partnerTeam = partnerMatch.own_team || partner.team; // Fallback to current team if not stored
                        player2Row = ' / ' + renderDoublesPlayerRow(partnerName, partnerTeam, partnerMatch.rating_after, partnerMatch.delta_own);
                    }
                }
                ownPlayerRow = player1Row + player2Row;

                // Opponent players - use team from opponent's match
                const oppNames = m.opponent.split(' / ').map(n => n.trim());
                let oppRows = [];
                oppNames.forEach(oppName => {
                    const oppPlayer = players[oppName];
                    if (oppPlayer) {
                        // Find opponent's match where they played against our team
                        const oppMatch = oppPlayer.matchDetails?.find(om => 
                            om.round === m.round && 
                            om.opponent === m.own_name_display && 
                            om.score_own === m.score_opp && 
                            om.score_opp === m.score_own &&
                            om.isDoubles === true
                        );
                        if (oppMatch) {
                            const oppTeam = oppMatch.own_team || oppPlayer.team; // Fallback to current team if not stored
                            oppRows.push(renderDoublesPlayerRow(oppName, oppTeam, oppMatch.rating_after, oppMatch.delta_own));
                        } else {
                            // Fallback if partner match not found
                            oppRows.push(`<span class="player-name-span">${oppName}</span><span>(${oppPlayer.team})</span>`);
                        }
                    }
                });
                oppPlayerRow = oppRows.join(' / ');
            } else {
                // For singles: original format - use team from match
                const oppRatingHtml = `, <span class="rating-current">${m.opp_rating_after.toFixed(2)}</span>`;
                const ownTeam = m.own_team || p.team; // Fallback to current team if not stored
                ownPlayerRow = `<span class="player-name-span">${m.own_name_display}</span><span>(${ownTeam}, <span class="rating-current">${m.rating_after.toFixed(2)}</span>)</span>${getDiffHtml(m.delta_own)}`;
                oppPlayerRow = `<span class="player-name-span">${m.opponent}</span><span>(${m.opponent_team}${oppRatingHtml})</span>${getDiffHtml(m.delta_opp)}`;
            }

            html += `<div class="history-item history-item--hidden">
                <div class="match-date">${displayDate}</div>
                <div class="match-content">
                    <div class="player-row">${ownPlayerRow}</div>
                    <div class="score-row ${isWin ? 'win-text' : 'loss-text'}">${m.score_own}:${m.score_opp}</div>
                    <div class="player-row">${oppPlayerRow}</div>
                </div>
            </div>`;
        });

        html += `</div>`;
        
        // Add "Show all matches" button if there are more matches
        if (hasMoreMatches) {
            html += `<div class="show-all-matches-container">
                <button id="showAllMatchesBtn" class="show-all-matches-btn">Zobraziť všetky zápasy</button>
            </div>`;
        }
        
        container.innerHTML = html;

        // Add event listener for the button
        if (hasMoreMatches) {
            const showAllBtn = document.getElementById('showAllMatchesBtn');
            if (showAllBtn) {
                showAllBtn.addEventListener('click', () => {
                    const hiddenItems = container.querySelectorAll('.history-item--hidden');
                    hiddenItems.forEach(item => {
                        item.classList.remove('history-item--hidden');
                    });
                    showAllBtn.style.display = 'none';
                });
            }
        }
    };

    const clearComparison = () => {
        comparePlayer = null;
        compareDerived = null;
        setCompareStatus('');
        if (activePlayer && activeDerived) {
            renderDerivedStats(activeDerived, null);
            renderLineChart(activePlayer, null);
            renderHeadToHead(activePlayer, null);
        }
    };

    const applyComparison = (target) => {
        if (!activePlayer || !activeDerived) return;
        comparePlayer = target;
        compareDerived = computeDerivedStats(target);
        if (compareDerived) compareDerived.label = target.name;
        setCompareStatus(`Porovnávanie s ${target.name}`, true);
        
        // Send GA4 event for player comparison
        if (typeof gtag !== 'undefined') {
            gtag('event', 'compare_players', {
                playerA: activePlayer.name,
                playerB: target.name,
                source: 'ratingModal'
            });
        }
        
        renderDerivedStats(activeDerived, compareDerived);
        renderLineChart(activePlayer, comparePlayer);
        renderHeadToHead(activePlayer, comparePlayer);
    };

    const openPlayerFromUrl = () => {
        const urlPlayer = new URL(window.location.href).searchParams.get('player');
        if (!urlPlayer) return;
        const target = playerLookup[normalizePlayerKey(urlPlayer)];
        if (target) openPlayerModal(target, {skipUrlUpdate: true});
    };

    window.onclick = (e) => {
        if (e.target == playerModal) closePlayerModal();
        const im = document.getElementById("infoModal");
        if (im && e.target == im) im.style.display = "none";
    };
    window.openInfoModal = () => document.getElementById("infoModal").style.display = "flex";
    window.closeInfoModal = () => document.getElementById("infoModal").style.display = "none";
    populateCompareOptions();
    if (compareForm) {
        compareForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!activePlayer) return;
            const val = (compareInput?.value || '').trim();
            if (!val) {
                setCompareStatus('Zadajte meno hráča.');
                renderHeadToHead(activePlayer, null);
                return;
            }
            const target = playerLookup[normalizePlayerKey(val)];
            if (!target) {
                setCompareStatus('Hráč nenájdený.');
                renderHeadToHead(activePlayer, null);
                return;
            }
            if (target.name === activePlayer.name) {
                setCompareStatus('Vyberte iného hráča.');
                renderHeadToHead(activePlayer, null);
                return;
            }
            applyComparison(target);
        });
    }
    if (clearCompareBtn) {
        clearCompareBtn.addEventListener('click', () => {
            clearComparison();
            if (compareInput) compareInput.value = '';
            if (activePlayer) renderHeadToHead(activePlayer, null);
        });
    }
    renderTable();
    initTeamFilter();
    openPlayerFromUrl();
}

// --- TABLE PAGE ---
function renderTablePage() {
    const {players} = processData();
    const tables = {};

    // 1. Group Matches
    matchResults.forEach(m => {
        const season = m.season || "JESEŇ 2025";
        const group = m.group || "";
        const tableKey = `${season}__${group}`;

        if (!tables[tableKey]) {
            tables[tableKey] = {
                season: season,
                group: group,
                seasonOrder: getSeasonOrder(season),
                matches: []
            };
        }
        tables[tableKey].matches.push(m);

    });

    // 2. Prepare Container
    const container = document.getElementById('tablesContainer');
    if (container) container.innerHTML = '';

    // 3. Sort Tables (Season DESC, Group ASC)
    const sortedKeys = Object.keys(tables).sort((a, b) => {
        const tA = tables[a];
        const tB = tables[b];
        if (tA.seasonOrder !== tB.seasonOrder) return tB.seasonOrder - tA.seasonOrder;
        return tA.group.localeCompare(tB.group);
    });

    // 4. Process and Render Each Table
    sortedKeys.forEach(key => {
        const {season, group, matches} = tables[key];
        const teams = {};
        const teamMatchesArray = [];
        const tempMatches = {};

        // Process matches for this table
        matches.forEach(m => {
            const key = `${getMatchRoundId(m)}::${m.player_a_team}::${m.player_b_team}`;
            if (!tempMatches[key]) {
                tempMatches[key] = {
                    roundName: m.round,
                    teamA: m.player_a_team,
                    teamB: m.player_b_team,
                    scoreA: 0,
                    scoreB: 0,
                    isPlayed: false,
                    realDate: null
                };
            }
            if (isPlayedMatch(m)) {
                const sA = parseInt(m.score_a);
                const sB = parseInt(m.score_b);
                if (sA > sB) tempMatches[key].scoreA++;
                if (sB > sA) tempMatches[key].scoreB++;
                tempMatches[key].isPlayed = true;
            } else {
                if (m.date) tempMatches[key].realDate = m.date;
            }
        });

        for (const k in tempMatches) teamMatchesArray.push(tempMatches[k]);

        const initTeam = (n) => {
            if (!teams[n]) teams[n] = {
                name: n, matches: 0, wins: 0, draws: 0, losses: 0,
                scoreFor: 0, scoreAgainst: 0, points: 0, avgRating: 0
            };
        };
        teamMatchesArray.forEach(m => { initTeam(m.teamA); initTeam(m.teamB); });

        teamMatchesArray.forEach(m => {
            if (!m.isPlayed) return;
            teams[m.teamA].matches++;
            teams[m.teamB].matches++;
            teams[m.teamA].scoreFor += m.scoreA;
            teams[m.teamA].scoreAgainst += m.scoreB;
            teams[m.teamB].scoreFor += m.scoreB;
            teams[m.teamB].scoreAgainst += m.scoreA;
            if (m.scoreA > m.scoreB) {
                teams[m.teamA].wins++; teams[m.teamA].points += 3;
                teams[m.teamB].losses++; teams[m.teamB].points += 1;
            } else if (m.scoreB > m.scoreA) {
                teams[m.teamB].wins++; teams[m.teamB].points += 3;
                teams[m.teamA].losses++; teams[m.teamA].points += 1;
            } else {
                teams[m.teamA].draws++; teams[m.teamA].points += 2;
                teams[m.teamB].draws++; teams[m.teamB].points += 2;
            }
        });

        // Find latest played round in this season
        const playedMatches = matches.filter(isPlayedMatch);
        let latestRound = null;
        if (playedMatches.length > 0) {
            const roundsMap = new Map();
            playedMatches.forEach(m => {
                const roundId = getMatchRoundId(m);
                if (!roundsMap.has(roundId)) {
                    const rNum = parseInt((m.round.match(/\d+/) || [0])[0]);
                    const sOrder = getSeasonOrder(m.season);
                    roundsMap.set(roundId, {
                        id: roundId,
                        name: m.round,
                        season: m.season,
                        seasonOrder: sOrder,
                        roundNum: rNum
                    });
                }
            });
            const sortedRounds = Array.from(roundsMap.values()).sort((a, b) => {
                if (a.seasonOrder !== b.seasonOrder) return b.seasonOrder - a.seasonOrder;
                return b.roundNum - a.roundNum;
            });
            latestRound = sortedRounds.length > 0 ? sortedRounds[0] : null;
        }

        // Calc Avg Rating (using ratings after latest round played in this season)
        Object.values(teams).forEach(t => {
            const teamPlayers = Object.values(players).filter(p => p.team === t.name);
            if (latestRound && teamPlayers.length > 0) {
                const { activeRating } = calculateTeamRatingsForRound(teamPlayers, latestRound);
                t.avgRating = activeRating !== null ? activeRating : 0;
            } else {
                // Fallback to current rating if no rounds played yet
                const tp = teamPlayers.sort((a, b) => (b.matches + b.dMatches) - (a.matches + a.dMatches)).slice(0, 4);
                t.avgRating = tp.length > 0 ? tp.reduce((acc, p) => acc + p.rating, 0) / tp.length : 0;
            }
        });

        // Build HTML
        const wrapper = document.createElement('div');
        wrapper.className = 'table-section';

        const titleText = `${season}${group ? ' - Skupina ' + group : ''}`;
        const title = document.createElement('h2');
        title.style.cssText = "color: var(--color-primary); margin: 25px 0 10px 0; padding-left: 5px; border-left: 4px solid var(--color-primary);";
        title.innerText = titleText;
        wrapper.appendChild(title);

        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-wrapper';
        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
            <tr>
                <th class="col-pos">#</th><th>Tím</th><th title="Zápasy">Z</th><th title="Výhry">V</th><th title="Remízy">R</th><th title="Prehry">P</th><th>Skóre</th><th title="Body">B</th><th title="Priemerný Rating"><div class="tooltip-container">Ø<span class="tooltip-icon">🛈</span><span class="tooltip-text">Priemerný rating<br>4 najaktívnejších<br>hráčov tímu</span></div></th>
            </tr>
            </thead>
            <tbody></tbody>`;

        const tbody = table.querySelector('tbody');

        // Helper for History (scoped to this table's matches)
        const getHist = (tn) => {
            const mm = teamMatchesArray.filter(m => m.teamA === tn || m.teamB === tn);
            const logoSrc = getTeamLogoSrc(tn);
            const logoBlock = logoSrc ? `<div class="team-logo-banner"><div class="team-logo-banner-wrapper"><img src="${logoSrc}" alt="${escapeAttr(tn)} logo" class="team-logo-large" loading="lazy"></div></div>` : '';
            if (mm.length === 0) return `${logoBlock}<div style="padding:15px; text-align:center; color:var(--color-muted-2);">Žiadne zápasy</div>`;
            let h = `${logoBlock}<div class="history-list">`;
            mm.forEach(m => {
                const isHome = m.teamA === tn;
                let scHtml = '', scClass = '';
                if (m.isPlayed) {
                    scClass = isHome ? (m.scoreA > m.scoreB ? "score-win" : (m.scoreA < m.scoreB ? "score-loss" : "score-draw")) : (m.scoreB > m.scoreA ? "score-win" : (m.scoreB < m.scoreA ? "score-loss" : "score-draw"));
                    scHtml = `${m.scoreA}:${m.scoreB}`;
                } else {
                    scClass = "score-draw";
                    scHtml = "VS";
                }
                const vsStyle = !m.isPlayed ? 'style="color:var(--color-muted-2);"' : '';
                h += `<div class="history-row"><div class="hr-date">${m.roundName}</div><div class="hr-match">
                    <span class="hr-team hr-home ${m.teamA === tn ? "current-team" : "other-team"}">${m.teamA}</span><span class="hr-score ${scClass}" ${vsStyle}>${scHtml}</span><span class="hr-team hr-guest ${m.teamB === tn ? "current-team" : "other-team"}">${m.teamB}</span></div></div>`;
            });
            return h + `</div>`;
        };

        const hasPodiumData = teamMatchesArray.some(m => m.isPlayed) ||
            Object.values(teams).some(t => t.points > 0 || t.matches > 0);

        Object.values(teams).sort((a, b) => (b.points !== a.points) ? b.points - a.points : (b.scoreFor - b.scoreAgainst) - (a.scoreFor - a.scoreAgainst)).forEach((t, i) => {
            const tr = document.createElement('tr');

            let podiumClass = '';
            if (hasPodiumData) {
                if (i === 0) podiumClass = 'gold';
                else if (i === 1) podiumClass = 'silver';
                else if (i === 2) podiumClass = 'bronze';
            }

            tr.className = `main-row ${podiumClass}`;
            tr.innerHTML = `<td class="col-pos">${i + 1}.</td><td>${t.name} <span class="expand-icon">▼</span></td><td>${t.matches}</td><td>${t.wins}</td><td>${t.draws}</td><td>${t.losses}</td><td class="col-score">${t.scoreFor}:${t.scoreAgainst}</td><td class="col-pts">${t.points}</td><td class="col-avg">${t.avgRating.toFixed(1)}</td>`;
            const dTr = document.createElement('tr');
            dTr.className = 'detail-row';
            dTr.innerHTML = `<td colspan="9" class="detail-cell">${getHist(t.name)}</td>`;
            tr.onclick = () => {
                const o = dTr.classList.contains('open');
                dTr.classList.toggle('open', !o);
                tr.classList.toggle('active', !o);
            };
            tbody.appendChild(tr);
            tbody.appendChild(dTr);
        });

        tableWrapper.appendChild(table);
        wrapper.appendChild(tableWrapper);
        if(container) container.appendChild(wrapper);
    });
}

// --- PREDICTION PAGE ---
function renderPredictionPage() {
    const {players} = processData();
    const normalizeKey = (n) => (n || '').trim().toLowerCase();
    const allPlayers = Object.values(players).filter(p => p.name && p.team && p.team !== 'N/A');
    const playerLookup = new Map(allPlayers.map(p => [normalizeKey(p.name), p]));

    // Group players by team and sort them by activity then rating
    const teamMap = new Map();
    // Using global sortRoster function
    allPlayers.forEach(p => {
        if (!teamMap.has(p.team)) teamMap.set(p.team, []);
        teamMap.get(p.team).push(p);
    });
    teamMap.forEach((list, key) => teamMap.set(key, sortRoster(list)));
    const teamNames = Array.from(teamMap.keys()).sort((a, b) => a.localeCompare(b, 'sk', {sensitivity: 'base'}));

    const teamSelectA = document.getElementById('teamSelectA');
    const teamSelectB = document.getElementById('teamSelectB');
    const teamPredictionResult = document.getElementById('teamPredictionResult');
    const teamPredScore = document.getElementById('teamPredScore');
    const teamRateA = document.getElementById('teamRateA');
    const teamRateB = document.getElementById('teamRateB');
    const teamStatus = document.getElementById('teamPredictionStatus');
    const lineupA = document.getElementById('teamLineupA');
    const lineupB = document.getElementById('teamLineupB');
    const lineupTitleA = document.getElementById('lineupTitleA');
    const lineupTitleB = document.getElementById('lineupTitleB');
    const teamPredictBtn = document.getElementById('teamPredictBtn');
    const teamLogoA = document.getElementById('teamLogoA');
    const teamLogoB = document.getElementById('teamLogoB');

    // Individual prediction elements
    const indForm = document.getElementById('individualPredictionForm');
    const indStatus = document.getElementById('individualPredictionStatus');
    const indResult = document.getElementById('individualPredictionResult');
    const indPlayerA = document.getElementById('individualPlayerA');
    const indPlayerB = document.getElementById('individualPlayerB');
    const indScoreList = document.getElementById('individualScoreList');
    const indRateA = document.getElementById('indRateA');
    const indRateB = document.getElementById('indRateB');
    const indScoreNote = document.getElementById('individualScoreNote');
    const indPlayersList = document.getElementById('individualPlayersList');

    if (!teamSelectA || !teamSelectB || !teamPredictionResult) return;

    // Using global avgRating function
    // Using global winProb and getScoreDistribution functions

    const renderScoreList = (el, dist) => {
        if (!el) return;
        const entries = Object.entries(dist || {});
        let maxVal = -Infinity, minVal = Infinity;
        entries.forEach(([, v]) => {
            if (v > maxVal) maxVal = v;
            if (v < minVal) minVal = v;
        });
        const html = entries.map(([score, pct]) => {
            const val = Number.isFinite(pct) ? pct.toFixed(1) : '0.0';
            let cls = '';
            if (pct === maxVal) cls = ' score-row--max';
            else if (pct === minVal) cls = ' score-row--min';
            return `<div class="score-row${cls}"><span class="score-label">${score}</span><div class="score-bar"><span class="score-bar-fill" style="width:${val}%;"></span></div><span class="score-value">${val}%</span></div>`;
        }).join('');
        el.innerHTML = html;
    };

    const setTeamLogo = (teamName, targetEl) => {
        if (!targetEl) return;
        if (!teamName) {
            targetEl.innerHTML = '';
            return;
        }
        const logo = getTeamLogoSrc(teamName);
        if (logo) {
            targetEl.innerHTML = `<img src="${escapeAttr(logo)}" alt="${escapeAttr(teamName)} logo" loading="lazy">`;
        } else {
            targetEl.innerHTML = `<span class="logo-placeholder">${escapeHtml(teamName.slice(0, 3).toUpperCase())}</span>`;
        }
    };

    const populateTeams = (select) => {
        if (!select) return;
        select.innerHTML = `<option value="">${select.id === 'teamSelectA' ? 'Vyberte domáci tím' : 'Vyberte hosťujúci tím'}</option>`;
        teamNames.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });
    };

    const renderLineup = (teamName, targetEl, titleEl) => {
        if (titleEl && !titleEl.dataset.defaultTitle) titleEl.dataset.defaultTitle = titleEl.textContent || '';
        if (titleEl) titleEl.textContent = teamName ? `Zostava ${teamName}` : (titleEl.dataset.defaultTitle || '');
        if (!targetEl) return;
        targetEl.innerHTML = '';
        if (!teamName) {
            targetEl.innerHTML = `<div class="lineup-hint">Vyberte tím pre zobrazenie hráčov.</div>`;
            return;
        }
        const roster = teamMap.get(teamName) || [];
        if (roster.length === 0) {
            targetEl.innerHTML = `<div class="lineup-hint">Žiadni hráči k dispozícii.</div>`;
            return;
        }
        roster.forEach((p, idx) => {
            const checked = idx < 4;
            const meta = `Rating ${p.rating.toFixed(1)} • Zápasy ${p.matches + p.dMatches}`;
            targetEl.insertAdjacentHTML('beforeend',
                `<label class="lineup-player">
                    <div>
                        <div>${escapeHtml(p.name)}</div>
                        <div class="player-meta">${escapeHtml(meta)}</div>
                    </div>
                    <input type="checkbox" value="${escapeAttr(p.name)}" ${checked ? 'checked' : ''}>
                </label>`);
        });

        const applyLimitState = () => {
            const checked = targetEl.querySelectorAll('input[type="checkbox"]:checked');
            const disable = checked.length >= 4;
            targetEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                if (!cb.checked) cb.disabled = disable;
            });
        };

        if (!targetEl.dataset.boundLimit) {
            targetEl.addEventListener('change', (e) => {
                const cb = e.target;
                if (!(cb instanceof HTMLInputElement) || cb.type !== 'checkbox') return;
                const checked = targetEl.querySelectorAll('input[type="checkbox"]:checked');
                if (checked.length > 4) {
                    cb.checked = false;
                    setTeamStatus('Maximálne 4 hráči na tím.');
                } else if (checked.length >= 3) {
                    setTeamStatus('');
                }
                applyLimitState();
            });
            targetEl.dataset.boundLimit = '1';
        }
        applyLimitState();
    };

    const collectLineup = (teamName, targetEl) => {
        const roster = teamMap.get(teamName) || [];
        const fallback = roster.slice(0, 4).map(p => p.name);
        const selectedNames = Array.from(targetEl?.querySelectorAll('input[type="checkbox"]:checked') || []).map(el => el.value);
        const namesRaw = selectedNames.length > 0 ? selectedNames : fallback;
        const names = namesRaw.slice(0, 4);
        const chosen = roster.filter(p => names.includes(p.name)).slice(0, 4);
        const hasWO = chosen.length === 3;
        return { names, players: chosen.length ? chosen : roster.slice(0, 4), hasWO };
    };

    const setTeamStatus = (msg) => {
        if (teamStatus) teamStatus.innerText = msg || '';
    };

    const renderTeamPrediction = () => {
        const tA = teamSelectA.value;
        const tB = teamSelectB.value;
        if (!tA || !tB) {
            setTeamStatus('Vyberte oba tímy.');
            return;
        }
        if (tA === tB) {
            setTeamStatus('Zvoľte rozdielne tímy.');
            return;
        }
        setTeamStatus('');

        // Send GA4 event for team prediction
        if (typeof gtag !== 'undefined') {
            gtag('event', 'prediction_team', {
                teamA: tA,
                teamB: tB,
                source: 'prediction'
            });
        }

        const lineupSelA = collectLineup(tA, lineupA);
        const lineupSelB = collectLineup(tB, lineupB);
        const rosterA = lineupSelA.players;
        const rosterB = lineupSelB.players;

        if (rosterA.length < 3 || rosterB.length < 3) {
            setTeamStatus('Vyberte aspoň 3 hráčov v oboch tímoch (max 4).');
            return;
        }

        const avgA = avgRating(rosterA);
        const avgB = avgRating(rosterB);
        const singlesA = rosterA[0] ? rosterA[0].rating : avgA;
        const singlesB = rosterB[0] ? rosterB[0].rating : avgB;
        const doublesA = rosterA.length >= 2 ? (rosterA[0].rating + rosterA[1].rating) / 2 : singlesA;
        const doublesB = rosterB.length >= 2 ? (rosterB[0].rating + rosterB[1].rating) / 2 : singlesB;

        let sA = Math.round(18 * winProb(avgA, avgB));
        let sB = Math.max(0, 18 - sA);

        if (lineupSelA.hasWO) sB += 5;
        if (lineupSelB.hasWO) sA += 5;
        if ((sA + sB) > 18) {
            const scale = 18 / (sA + sB);
            sA = Math.round(sA * scale);
            sB = Math.max(0, 18 - sA);
        }

        sA = Math.min(18, Math.max(0, sA));
        sB = Math.min(18, Math.max(0, sB));

        if (teamPredScore) teamPredScore.innerText = `${sA} : ${sB}`;
        if (teamRateA) teamRateA.innerText = avgA.toFixed(1);
        if (teamRateB) teamRateB.innerText = avgB.toFixed(1);
        if (teamPredictionResult) teamPredictionResult.style.display = 'block';
    };

    populateTeams(teamSelectA);
    populateTeams(teamSelectB);

    teamSelectA.addEventListener('change', () => {
        renderLineup(teamSelectA.value, lineupA, lineupTitleA);
        setTeamLogo(teamSelectA.value, teamLogoA);
    });
    teamSelectB.addEventListener('change', () => {
        renderLineup(teamSelectB.value, lineupB, lineupTitleB);
        setTeamLogo(teamSelectB.value, teamLogoB);
    });
    if (teamPredictBtn) teamPredictBtn.addEventListener('click', (e) => {
        e.preventDefault();
        renderTeamPrediction();
    });

    // ============================================================
    // COMBINED MATCH SIMULATOR (Prediction + What If)
    // ============================================================
    const simForm = document.getElementById('matchSimulatorForm');
    const simStatus = document.getElementById('simStatus');
    const simResult = document.getElementById('simResult');
    const simPlayerA = document.getElementById('simPlayerA');
    const simPlayerB = document.getElementById('simPlayerB');
    const simPlayersList = document.getElementById('simPlayersList');
    const simScoreList = document.getElementById('simScoreList');
    const simWhatIfGrid = document.getElementById('simWhatIfGrid');
    const simNameA = document.getElementById('simNameA');
    const simNameB = document.getElementById('simNameB');
    const simTeamA = document.getElementById('simTeamA');
    const simTeamB = document.getElementById('simTeamB');
    const simRatingA = document.getElementById('simRatingA');
    const simRatingB = document.getElementById('simRatingB');
    const simKFactorA = document.getElementById('simKFactorA');
    const simKFactorB = document.getElementById('simKFactorB');
    const simScoreNote = document.getElementById('simScoreNote');

    // Populate players datalist
    if (simPlayersList) {
        simPlayersList.innerHTML = sortRoster(allPlayers).map(p => `<option value="${escapeAttr(p.name)}">`).join('');
    }

    const setSimStatus = (msg) => {
        if (simStatus) simStatus.innerText = msg || '';
    };

    /**
     * Calculate ELO rating change for a hypothetical match.
     */
    const calculateWhatIfRatingChange = (ratingA, ratingB, scoreA, scoreB, kFactorA, kFactorB) => {
        const N = scoreA + scoreB;
        const expectedA = N / (1 + Math.pow(10, (ratingB - ratingA) / 300));
        const expectedB = N / (1 + Math.pow(10, (ratingA - ratingB) / 300));
        
        const diffA = scoreA - expectedA;
        const diffB = scoreB - expectedB;
        
        const deltaA = kFactorA * diffA;
        const deltaB = kFactorB * diffB;
        
        return {
            deltaA: deltaA,
            deltaB: deltaB,
            newRatingA: ratingA + deltaA,
            newRatingB: ratingB + deltaB
        };
    };

    /**
     * Render the combined match simulator (prediction + rating simulation)
     */
    const renderMatchSimulator = () => {
        const nameA = (simPlayerA?.value || '').trim();
        const nameB = (simPlayerB?.value || '').trim();

        if (!nameA || !nameB) {
            setSimStatus('Vyplňte prosím oboch hráčov.');
            if (simResult) simResult.style.display = 'none';
            return;
        }
        if (normalizeKey(nameA) === normalizeKey(nameB)) {
            setSimStatus('Zvoľte dvoch rôznych hráčov.');
            if (simResult) simResult.style.display = 'none';
            return;
        }
        const pA = playerLookup.get(normalizeKey(nameA));
        const pB = playerLookup.get(normalizeKey(nameB));
        if (!pA || !pB) {
            setSimStatus('Hráč nebol nájdený. Skúste iné meno.');
            if (simResult) simResult.style.display = 'none';
            return;
        }
        setSimStatus('');

        // Send GA4 event for player prediction
        if (typeof gtag !== 'undefined') {
            gtag('event', 'prediction_player', {
                playerA: pA.name,
                playerB: pB.name,
                source: 'prediction'
            });
        }

        // Get K-factors based on next match (current matches + 1)
        const kFactorA = getKFactor(pA.matches + 1);
        const kFactorB = getKFactor(pB.matches + 1);

        // Update player info display
        if (simNameA) simNameA.innerText = pA.name;
        if (simNameB) simNameB.innerText = pB.name;
        if (simTeamA) simTeamA.innerText = pA.team || '';
        if (simTeamB) simTeamB.innerText = pB.team || '';
        if (simRatingA) simRatingA.innerText = pA.rating.toFixed(2);
        if (simRatingB) simRatingB.innerText = pB.rating.toFixed(2);
        if (simKFactorA) simKFactorA.innerText = kFactorA;
        if (simKFactorB) simKFactorB.innerText = kFactorB;

        // Update score note
        const teamLabelA = pA.team ? ` (${pA.team})` : '';
        const teamLabelB = pB.team ? ` (${pB.team})` : '';
        if (simScoreNote) simScoreNote.innerText = `Skóre je uvádzané ako ${pA.name}${teamLabelA} : ${pB.name}${teamLabelB}.`;

        // ============ PREDICTION PART ============
        // Calculate score distribution probabilities
        const dist = getScoreDistribution(winProb(pA.rating, pB.rating));
        renderScoreList(simScoreList, dist);

        // ============ RATING SIMULATION PART ============
        // Define all possible score scenarios
        const scenarios = [
            { scoreA: 3, scoreB: 0, label: '3:0', isWin: true },
            { scoreA: 3, scoreB: 1, label: '3:1', isWin: true },
            { scoreA: 3, scoreB: 2, label: '3:2', isWin: true },
            { scoreA: 2, scoreB: 3, label: '2:3', isWin: false },
            { scoreA: 1, scoreB: 3, label: '1:3', isWin: false },
            { scoreA: 0, scoreB: 3, label: '0:3', isWin: false },
        ];

        // Calculate rating changes for each scenario
        const scenarioResults = scenarios.map(s => {
            const result = calculateWhatIfRatingChange(
                pA.rating, pB.rating, 
                s.scoreA, s.scoreB, 
                kFactorA, kFactorB
            );
            return { ...s, ...result };
        });

        // Render the scenarios grid
        if (simWhatIfGrid) {
            simWhatIfGrid.innerHTML = scenarioResults.map(s => {
                const deltaClass = s.deltaA >= 0 ? 'whatif-delta--positive' : 'whatif-delta--negative';
                const deltaSign = s.deltaA >= 0 ? '+' : '';
                const outcomeClass = s.isWin ? 'whatif-scenario--win' : 'whatif-scenario--loss';
                const outcomeIcon = s.isWin ? '🏆' : '😔';
                
                return `
                    <div class="whatif-scenario ${outcomeClass}">
                        <div class="whatif-scenario-header">
                            <span class="whatif-scenario-icon">${outcomeIcon}</span>
                            <span class="whatif-scenario-score">${s.label}</span>
                        </div>
                        <div class="whatif-scenario-body">
                            <div class="whatif-delta ${deltaClass}">
                                <span class="whatif-delta-value">${deltaSign}${s.deltaA.toFixed(2)}</span>
                                <span class="whatif-delta-label">zmena ratingu</span>
                            </div>
                            <div class="whatif-new-rating">
                                <span class="whatif-new-rating-value">${s.newRatingA.toFixed(2)}</span>
                                <span class="whatif-new-rating-label">nový rating</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        if (simResult) simResult.style.display = 'block';
    };

    if (simForm) {
        simForm.addEventListener('submit', (e) => {
            e.preventDefault();
            renderMatchSimulator();
        });
    }
}

// ============================================================
// MY STATS PAGE
// ============================================================
function renderMyStatsPage() {
    const {players} = processData();
    const playerArr = Object.values(players);
    const MYSTATS_STORAGE_KEY = 'mystats_player_name';
    const URL_PARAM_NAME = 'player';

    // Create player lookup for quick access
    const playerLookup = {};
    playerArr.forEach(p => {
        playerLookup[normalizePlayerKey(p.name)] = p;
    });

    // URL query parameter helpers
    const getPlayerFromURL = () => {
        const params = new URLSearchParams(window.location.search);
        return params.get(URL_PARAM_NAME) || null;
    };

    const updateURLWithPlayer = (playerName) => {
        const url = new URL(window.location.href);
        if (!playerName) {
            // Remove the parameter if no player
            url.searchParams.delete(URL_PARAM_NAME);
        } else {
            // Add or update the parameter (URLSearchParams.set automatically encodes)
            url.searchParams.set(URL_PARAM_NAME, playerName);
        }
        window.history.replaceState({}, '', url);
    };

    // Create ranking map
    const sortedByRating = [...playerArr].sort((a, b) => b.rating - a.rating);
    const ratingRanking = new Map();
    sortedByRating.forEach((p, i) => ratingRanking.set(normalizePlayerKey(p.name), i + 1));
    const totalPlayers = playerArr.length;

    // DOM elements
    const selectSection = document.getElementById('playerSelectSection');
    const statsContent = document.getElementById('myStatsContent');
    const playerInput = document.getElementById('myPlayerSelect');
    const playersList = document.getElementById('myPlayersList');
    const selectBtn = document.getElementById('selectPlayerBtn');
    const selectStatus = document.getElementById('playerSelectStatus');
    const changePlayerBtn = document.getElementById('changePlayerBtn');

    // Populate datalists
    const populatePlayersList = (listEl) => {
        if (!listEl) return;
        listEl.innerHTML = '';
        playerArr.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            listEl.appendChild(opt);
        });
    };

    populatePlayersList(playersList);
    populatePlayersList(document.getElementById('myCompareList'));
    populatePlayersList(document.getElementById('myWhatIfList'));

    // Current selected player
    let currentPlayer = null;
    let myRatingChart = null;
    let myRadarChart = null;

    // Show player selection screen
    const showSelectScreen = () => {
        if (selectSection) selectSection.style.display = 'block';
        if (statsContent) statsContent.style.display = 'none';
    };

    // Show stats screen
    const showStatsScreen = () => {
        if (selectSection) selectSection.style.display = 'none';
        if (statsContent) statsContent.style.display = 'block';
    };

    // Calculate win streak
    const calculateStreak = (matchDetails) => {
        let currentStreak = 0;
        let longestStreak = 0;
        let tempStreak = 0;

        matchDetails.forEach(m => {
            const isWin = m.score_own > m.score_opp;
            if (isWin) {
                tempStreak++;
                if (tempStreak > longestStreak) longestStreak = tempStreak;
            } else {
                tempStreak = 0;
            }
        });

        // Current streak (from end)
        for (let i = matchDetails.length - 1; i >= 0; i--) {
            if (matchDetails[i].score_own > matchDetails[i].score_opp) {
                currentStreak++;
            } else {
                break;
            }
        }

        return { current: currentStreak, longest: longestStreak };
    };

    // Calculate biggest upset
    const calculateBiggestUpset = (matchDetails) => {
        let biggestUpset = null;
        let biggestDiff = 0;

        matchDetails.filter(m => !m.isDoubles).forEach(m => {
            const isWin = m.score_own > m.score_opp;
            if (isWin && m.opp_rating_after > 0) {
                // Estimate opponent's rating before the match
                const oppRatingBefore = (m.opp_rating_after || 0) - (m.delta_opp || 0);
                const myRatingBefore = (m.rating_after || 0) - (m.delta_own || 0);
                const diff = oppRatingBefore - myRatingBefore;
                if (diff > biggestDiff) {
                    biggestDiff = diff;
                    biggestUpset = {
                        opponent: m.opponent,
                        diff: diff,
                        score: `${m.score_own}:${m.score_opp}`,
                        round: m.round
                    };
                }
            }
        });

        return biggestUpset;
    };

    // Get recent form (last 5 matches)
    const getRecentForm = (matchDetails) => {
        return matchDetails.slice(-5).map(m => m.score_own > m.score_opp ? 'W' : 'L');
    };

    // Find peak rating and when
    const findPeakRating = (p) => {
        let peakRating = 0;
        let peakWhen = '-';

        // Look through matchDetails to find the actual peak rating and when it occurred
        if (Array.isArray(p.matchDetails) && p.matchDetails.length > 0) {
            let maxRatingMatch = null;

            p.matchDetails.forEach(m => {
                const rating = m.rating_after;
                if (rating != null && (maxRatingMatch === null || rating > maxRatingMatch.rating_after)) {
                    maxRatingMatch = m;
                }
            });

            if (maxRatingMatch) {
                peakRating = maxRatingMatch.rating_after;
                peakWhen = maxRatingMatch.round + ' ' + maxRatingMatch.season || maxRatingMatch.date || '-';
            }
        }

        return { rating: peakRating, when: peakWhen };
    };

    const renderMyLineChart = (p, compareP = null, attempt = 0) => {
        const chart = renderRatingLineChart(p, compareP, 'myRatingChart', {
            get: () => myRatingChart,
            set: (chart) => { myRatingChart = chart; }
        }, attempt);
    };

    // Track current derived stats for comparison
    let currentDerived = null;
    let compareDerived = null;

    // Stat keys and labels (same order as rating.html)
    const STAT_KEYS = ['attack', 'defense', 'consistency', 'momentum', 'teamImpact', 'clutch'];

    // Render radar chart with optional comparison
    const renderMyRadarChart = (p, compareP = null) => {
        const canvas = document.getElementById('myRadarChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const derived = computeDerivedStats(p);
        if (!derived || !derived.values) return;

        currentDerived = derived;
        compareDerived = compareP ? computeDerivedStats(compareP) : null;

        const v = derived.values;
        const ctx = canvas.getContext('2d');
        const labels = STAT_KEYS.map(k => STAT_META[k].label);
        const data = STAT_KEYS.map(k => v[k] ?? 50);

        const themePrimary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#7c3aed';
        const themeDanger = getComputedStyle(document.documentElement).getPropertyValue('--color-danger').trim() || '#dc2626';

        const datasets = [{
            label: p.name,
            data,
            backgroundColor: themePrimary + '40',
            borderColor: themePrimary,
            borderWidth: 2,
            pointBackgroundColor: themePrimary
        }];

        if (compareP && compareDerived) {
            const cv = compareDerived.values;
            datasets.push({
                label: compareP.name,
                data: STAT_KEYS.map(k => cv[k] ?? 50),
                backgroundColor: themeDanger + '20',
                borderColor: themeDanger,
                borderWidth: 2,
                fill: true,
                pointBackgroundColor: themeDanger
            });
        }

        if (myRadarChart) myRadarChart.destroy();
        myRadarChart = new Chart(ctx, {
            type: 'radar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: compareP !== null } },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { stepSize: 20, display: false },
                        grid: { color: 'rgba(128,128,128,0.2)' },
                        pointLabels: { font: { size: 11 } }
                    }
                }
            }
        });

        // Render derived stats list with comparison
        renderMyDerivedStats(derived, compareDerived);
    };

    // Render derived stats list (similar to rating.html)
    const renderMyDerivedStats = (stats, compareStats = null) => {
        const derivedList = document.getElementById('myDerivedStatsList');
        if (!derivedList) return;

        const fmt = (x) => (Number.isFinite(x) ? x.toFixed(0) : '–');
        
        derivedList.innerHTML = STAT_KEYS.map(key => {
            const meta = STAT_META[key];
            const primaryVal = fmt(stats.values[key]);
            const compareVal = compareStats ? fmt(compareStats.values[key]) : null;
            const primaryMissing = primaryVal === '–';
            const compareMissing = compareVal === '–';

            return `
                <div class="derived-stat-item${compareStats ? ' has-compare' : ''}">
                    <div class="derived-stat-label">
                        <span class="derived-stat-name">${meta.label}</span>
                        <span class="derived-stat-tip">${meta.tip}</span>
                    </div>
                    <div class="derived-stat-values">
                        <span class="derived-stat-value ${primaryMissing ? 'stat-none' : ''}">${primaryVal}</span>
                        ${compareStats ? `<span class="derived-stat-value derived-stat-compare ${compareMissing ? 'stat-none' : ''}">${compareVal}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    };

    // Render recent matches (reusing history format from rating.html)
    const renderRecentMatches = (p, players) => {
        const container = document.getElementById('myRecentMatches');
        if (!container) return;

        const getDiffHtml = (delta) => {
            if (Math.abs(delta) < 0.01) return `<span class="diff-val diff-neu">-</span>`;
            return `<span class="diff-val ${delta > 0 ? 'diff-up' : 'diff-down'}">${delta > 0 ? '▲' : '▼'}${Math.abs(delta).toFixed(2)}</span>`;
        };

        // Helper function to find partner's matchDetails for doubles
        const findPartnerMatch = (m, currentPlayerName) => {
            if (!m.isDoubles || !players) return null;
            const playerNames = m.own_name_display.split(' / ').map(n => n.trim());
            const partnerName = playerNames.find(n => n !== currentPlayerName);
            if (!partnerName) return null;
            const partner = players[partnerName];
            if (!partner || !partner.matchDetails) return null;
            // Find the same match by round, opponent, and score
            return partner.matchDetails.find(pm => 
                pm.round === m.round && 
                pm.opponent === m.opponent && 
                pm.score_own === m.score_own && 
                pm.score_opp === m.score_opp &&
                pm.isDoubles === true
            );
        };

        // Helper function to render player row for doubles
        const renderDoublesPlayerRow = (playerName, team, rating, delta) => {
            return `<span class="player-name-span">${playerName}</span><span>(${team}, <span class="rating-current">${rating.toFixed(2)}</span>)</span>${getDiffHtml(delta)}`;
        };

        if (p.matchDetails.length === 0) {
            container.innerHTML = '<p class="no-match">Žiadne zápasy</p>';
            return;
        }

        const allMatches = [...p.matchDetails].reverse();
        const visibleMatches = allMatches.slice(0, 5);
        const hiddenMatches = allMatches.slice(5);
        const hasMoreMatches = hiddenMatches.length > 0;

        let html = `<div class='history-section'><div class='history-title'>História Zápasov: ${p.name}</div>`;
        
        // Render visible matches (first 5)
        visibleMatches.forEach(m => {
            const isWin = m.score_own > m.score_opp;
            const seasonLabel = m.season ? ` (${m.season})` : '';
            const doublesHtml = m.isDoubles ? '<span class="doubles-badge">ŠTVORHRA</span>' : '';
            const displayDate = `${m.round}${seasonLabel}${doublesHtml ? ' ' + doublesHtml : ''}`;

            let ownPlayerRow, oppPlayerRow;

            if (m.isDoubles) {
                // For doubles: show each player separately
                const playerNames = m.own_name_display.split(' / ').map(n => n.trim());
                const partnerMatch = findPartnerMatch(m, p.name);
                
                // Current player's info - use team from match
                const ownTeam = m.own_team || p.team; // Fallback to current team if not stored
                const player1Row = renderDoublesPlayerRow(p.name, ownTeam, m.rating_after, m.delta_own);
                
                // Partner's info - use team from partner's match
                let player2Row = '';
                if (partnerMatch) {
                    const partnerName = playerNames.find(n => n !== p.name);
                    const partner = players[partnerName];
                    if (partner) {
                        const partnerTeam = partnerMatch.own_team || partner.team; // Fallback to current team if not stored
                        player2Row = ' / ' + renderDoublesPlayerRow(partnerName, partnerTeam, partnerMatch.rating_after, partnerMatch.delta_own);
                    }
                }
                ownPlayerRow = player1Row + player2Row;

                // Opponent players - use team from opponent's match
                const oppNames = m.opponent.split(' / ').map(n => n.trim());
                let oppRows = [];
                oppNames.forEach(oppName => {
                    const oppPlayer = players[oppName];
                    if (oppPlayer) {
                        // Find opponent's match where they played against our team
                        const oppMatch = oppPlayer.matchDetails?.find(om => 
                            om.round === m.round && 
                            om.opponent === m.own_name_display && 
                            om.score_own === m.score_opp && 
                            om.score_opp === m.score_own &&
                            om.isDoubles === true
                        );
                        if (oppMatch) {
                            const oppTeam = oppMatch.own_team || oppPlayer.team; // Fallback to current team if not stored
                            oppRows.push(renderDoublesPlayerRow(oppName, oppTeam, oppMatch.rating_after, oppMatch.delta_own));
                        } else {
                            // Fallback if partner match not found
                            oppRows.push(`<span class="player-name-span">${oppName}</span><span>(${oppPlayer.team})</span>`);
                        }
                    }
                });
                oppPlayerRow = oppRows.join(' / ');
            } else {
                // For singles: original format - use team from match
                const oppRatingHtml = `, <span class="rating-current">${m.opp_rating_after.toFixed(2)}</span>`;
                const ownTeam = m.own_team || p.team; // Fallback to current team if not stored
                ownPlayerRow = `<span class="player-name-span">${m.own_name_display}</span><span>(${ownTeam}, <span class="rating-current">${m.rating_after.toFixed(2)}</span>)</span>${getDiffHtml(m.delta_own)}`;
                oppPlayerRow = `<span class="player-name-span">${m.opponent}</span><span>(${m.opponent_team}${oppRatingHtml})</span>${getDiffHtml(m.delta_opp)}`;
            }

            html += `<div class="history-item">
                <div class="match-date">${displayDate}</div>
                <div class="match-content">
                    <div class="player-row">${ownPlayerRow}</div>
                    <div class="score-row ${isWin ? 'win-text' : 'loss-text'}">${m.score_own}:${m.score_opp}</div>
                    <div class="player-row">${oppPlayerRow}</div>
                </div>
            </div>`;
        });

        // Render hidden matches (rest, initially hidden)
        hiddenMatches.forEach(m => {
            const isWin = m.score_own > m.score_opp;
            const seasonLabel = m.season ? ` (${m.season})` : '';
            const doublesHtml = m.isDoubles ? '<span class="doubles-badge">ŠTVORHRA</span>' : '';
            const displayDate = `${m.round}${seasonLabel}${doublesHtml ? ' ' + doublesHtml : ''}`;

            let ownPlayerRow, oppPlayerRow;

            if (m.isDoubles) {
                // For doubles: show each player separately
                const playerNames = m.own_name_display.split(' / ').map(n => n.trim());
                const partnerMatch = findPartnerMatch(m, p.name);
                
                // Current player's info - use team from match
                const ownTeam = m.own_team || p.team; // Fallback to current team if not stored
                const player1Row = renderDoublesPlayerRow(p.name, ownTeam, m.rating_after, m.delta_own);
                
                // Partner's info - use team from partner's match
                let player2Row = '';
                if (partnerMatch) {
                    const partnerName = playerNames.find(n => n !== p.name);
                    const partner = players[partnerName];
                    if (partner) {
                        const partnerTeam = partnerMatch.own_team || partner.team; // Fallback to current team if not stored
                        player2Row = ' / ' + renderDoublesPlayerRow(partnerName, partnerTeam, partnerMatch.rating_after, partnerMatch.delta_own);
                    }
                }
                ownPlayerRow = player1Row + player2Row;

                // Opponent players - use team from opponent's match
                const oppNames = m.opponent.split(' / ').map(n => n.trim());
                let oppRows = [];
                oppNames.forEach(oppName => {
                    const oppPlayer = players[oppName];
                    if (oppPlayer) {
                        // Find opponent's match where they played against our team
                        const oppMatch = oppPlayer.matchDetails?.find(om => 
                            om.round === m.round && 
                            om.opponent === m.own_name_display && 
                            om.score_own === m.score_opp && 
                            om.score_opp === m.score_own &&
                            om.isDoubles === true
                        );
                        if (oppMatch) {
                            const oppTeam = oppMatch.own_team || oppPlayer.team; // Fallback to current team if not stored
                            oppRows.push(renderDoublesPlayerRow(oppName, oppTeam, oppMatch.rating_after, oppMatch.delta_own));
                        } else {
                            // Fallback if partner match not found
                            oppRows.push(`<span class="player-name-span">${oppName}</span><span>(${oppPlayer.team})</span>`);
                        }
                    }
                });
                oppPlayerRow = oppRows.join(' / ');
            } else {
                // For singles: original format - use team from match
                const oppRatingHtml = `, <span class="rating-current">${m.opp_rating_after.toFixed(2)}</span>`;
                const ownTeam = m.own_team || p.team; // Fallback to current team if not stored
                ownPlayerRow = `<span class="player-name-span">${m.own_name_display}</span><span>(${ownTeam}, <span class="rating-current">${m.rating_after.toFixed(2)}</span>)</span>${getDiffHtml(m.delta_own)}`;
                oppPlayerRow = `<span class="player-name-span">${m.opponent}</span><span>(${m.opponent_team}${oppRatingHtml})</span>${getDiffHtml(m.delta_opp)}`;
            }

            html += `<div class="history-item history-item--hidden">
                <div class="match-date">${displayDate}</div>
                <div class="match-content">
                    <div class="player-row">${ownPlayerRow}</div>
                    <div class="score-row ${isWin ? 'win-text' : 'loss-text'}">${m.score_own}:${m.score_opp}</div>
                    <div class="player-row">${oppPlayerRow}</div>
                </div>
            </div>`;
        });

        html += `</div>`;
        
        // Add "Show all matches" button if there are more matches
        if (hasMoreMatches) {
            html += `<div class="show-all-matches-container">
                <button id="showAllMatchesBtn" class="show-all-matches-btn">Zobraziť všetky zápasy</button>
            </div>`;
        }
        
        container.innerHTML = html;

        // Add event listener for the button
        if (hasMoreMatches) {
            const showAllBtn = document.getElementById('showAllMatchesBtn');
            if (showAllBtn) {
                showAllBtn.addEventListener('click', () => {
                    const hiddenItems = container.querySelectorAll('.history-item--hidden');
                    hiddenItems.forEach(item => {
                        item.classList.remove('history-item--hidden');
                    });
                    showAllBtn.style.display = 'none';
                });
            }
        }
    };

    // Render upcoming team matches
    const renderUpcomingMatch = (p) => {
        const container = document.getElementById('myNextMatchDetails');
        if (!container) return;

        const teamName = p.team;
        if (!teamName || teamName === 'N/A') {
            container.innerHTML = '<span class="no-match">Žiadny tím priradený</span>';
            return;
        }

        // Find upcoming (unplayed) matches for the player's team using isPlayedMatch helper
        const futureMatches = matchResults.filter(m => {
            return !isPlayedMatch(m) && (m.player_a_team === teamName || m.player_b_team === teamName);
        });

        if (futureMatches.length === 0) {
            container.innerHTML = '<span class="no-match">Žiadny plánovaný zápas</span>';
            return;
        }

        // Sort matches by date/round to show them in order
        const sortedMatches = futureMatches.sort((a, b) => {
            const dateA = parseMatchDate(a.date) || new Date(0);
            const dateB = parseMatchDate(b.date) || new Date(0);
            return dateA - dateB;
        });

        const visibleMatch = sortedMatches[0];
        const hiddenMatches = sortedMatches.slice(1);
        const hasMoreMatches = hiddenMatches.length > 0;

        let html = '';
        
        // Show first match (always visible)
        const dateStr = visibleMatch.date ? formatDateWithSlovakDay(visibleMatch.date) : '';
        const location = visibleMatch.location || '';
        html += `
            <div class="next-match-item">
                <div class="next-match-teams">
                    <span>${visibleMatch.player_a_team}</span>
                    <span class="vs">vs</span>
                    <span>${visibleMatch.player_b_team}</span>
                </div>
                <div class="next-match-meta">${visibleMatch.round || ''}${dateStr ? ' • ' + dateStr : ''}${location ? ' • ' + location : ''}</div>
            </div>
        `;

        // Show hidden matches (initially hidden)
        hiddenMatches.forEach((match, index) => {
            const matchDateStr = match.date ? formatDateWithSlovakDay(match.date) : '';
            const matchLocation = match.location || '';
            const isLast = index === hiddenMatches.length - 1;

            html += `
                <div class="next-match-item next-match-item--hidden${isLast ? '' : ' next-match-item--separator'}">
                    <div class="next-match-teams">
                        <span>${match.player_a_team}</span>
                        <span class="vs">vs</span>
                        <span>${match.player_b_team}</span>
                    </div>
                    <div class="next-match-meta">${match.round || ''}${matchDateStr ? ' • ' + matchDateStr : ''}${matchLocation ? ' • ' + matchLocation : ''}</div>
                </div>
            `;
        });

        // Add "Show all matches" button if there are more matches
        if (hasMoreMatches) {
            html += `<div class="show-all-upcoming-container">
                <button id="showAllUpcomingBtn" class="show-all-upcoming-btn">Zobraziť všetky nadchádzajúce zápasy</button>
            </div>`;
        }

        container.innerHTML = html;

        // Add event listener for the button
        if (hasMoreMatches) {
            const showAllBtn = document.getElementById('showAllUpcomingBtn');
            if (showAllBtn) {
                showAllBtn.addEventListener('click', () => {
                    // Add separator to the first match
                    const firstMatch = container.querySelector('.next-match-item:not(.next-match-item--hidden)');
                    if (firstMatch) {
                        firstMatch.classList.add('next-match-item--separator');
                    }
                    // Show all hidden matches
                    const hiddenItems = container.querySelectorAll('.next-match-item--hidden');
                    hiddenItems.forEach(item => {
                        item.classList.remove('next-match-item--hidden');
                    });
                    showAllBtn.style.display = 'none';
                });
            }
        }
    };

    // Combined match simulator (Prediction + What If) for My Stats page
    const renderWhatIfMini = () => {
        const opponentInput = document.getElementById('myWhatIfOpponent');
        const resultDiv = document.getElementById('myWhatIfResult');
        const gridDiv = document.getElementById('myWhatIfGrid');
        const predictionList = document.getElementById('myPredictionScoreList');
        const youSpan = document.getElementById('myWhatIfYou');
        const oppSpan = document.getElementById('myWhatIfOpp');

        if (!opponentInput || !resultDiv || !gridDiv || !currentPlayer) return;

        const oppName = opponentInput.value.trim();
        const opponent = playerLookup[normalizePlayerKey(oppName)];

        if (!opponent) {
            resultDiv.style.display = 'none';
            return;
        }

        // Send GA4 event for player prediction
        if (typeof gtag !== 'undefined') {
            gtag('event', 'prediction_player', {
                playerA: currentPlayer.name,
                playerB: opponent.name,
                source: 'myStats'
            });
        }

        // Get K factors
        const getKFactor = (p) => {
            const totalMatches = p.matches + p.dMatches;
            if (totalMatches < 5) return 30;
            if (totalMatches < 10) return 20;
            return 10;
        };

        // Win probability and score distribution
        // Using global winProb and getScoreDistribution functions

        const kA = getKFactor(currentPlayer);
        const kB = getKFactor(opponent);
        const rA = currentPlayer.rating;
        const rB = opponent.rating;

        // Update player info cards
        youSpan.textContent = currentPlayer.name;
        oppSpan.textContent = opponent.name;
        
        const ratingAEl = document.getElementById('myWhatIfRatingA');
        const ratingBEl = document.getElementById('myWhatIfRatingB');
        const kFactorAEl = document.getElementById('myWhatIfKFactorA');
        const kFactorBEl = document.getElementById('myWhatIfKFactorB');
        
        if (ratingAEl) ratingAEl.textContent = rA.toFixed(2);
        if (ratingBEl) ratingBEl.textContent = rB.toFixed(2);
        if (kFactorAEl) kFactorAEl.textContent = kA;
        if (kFactorBEl) kFactorBEl.textContent = kB;

        // ============ PREDICTION PART ============
        const dist = getScoreDistribution(winProb(rA, rB));
        if (predictionList) {
            const scores = ['3-0', '3-1', '3-2', '2-3', '1-3', '0-3'];
            // Find max and min probabilities
            let maxVal = -Infinity, minVal = Infinity;
            scores.forEach(score => {
                const pct = dist[score] || 0;
                if (pct > maxVal) maxVal = pct;
                if (pct < minVal) minVal = pct;
            });
            predictionList.innerHTML = scores.map(score => {
                const pct = dist[score] || 0;
                let cls = '';
                if (pct === maxVal) cls = ' score-row-mini--max';
                else if (pct === minVal) cls = ' score-row-mini--min';
                return `
                    <div class="score-row-mini${cls}">
                        <span class="score-label-mini">${score.replace('-', ':')}</span>
                        <div class="score-bar-mini">
                            <div class="score-bar-fill-mini" style="width: ${pct}%"></div>
                        </div>
                        <span class="score-pct-mini">${pct.toFixed(1)}%</span>
                    </div>
                `;
            }).join('');
        }

        // ============ RATING SIMULATION PART ============
        const scenarios = [
            { label: '3:0', setsA: 3, setsB: 0, isWin: true },
            { label: '3:1', setsA: 3, setsB: 1, isWin: true },
            { label: '3:2', setsA: 3, setsB: 2, isWin: true },
            { label: '2:3', setsA: 2, setsB: 3, isWin: false },
            { label: '1:3', setsA: 1, setsB: 3, isWin: false },
            { label: '0:3', setsA: 0, setsB: 3, isWin: false }
        ];

        const results = scenarios.map(s => {
            const totalSets = s.setsA + s.setsB;
            const expectedA = totalSets / (1 + Math.pow(10, (rB - rA) / 300));
            const deltaA = kA * (s.setsA - expectedA);
            return {
                ...s,
                deltaA,
                newRatingA: rA + deltaA
            };
        });

        gridDiv.innerHTML = results.map(s => {
            const deltaClass = s.deltaA >= 0 ? 'positive' : 'negative';
            const deltaSign = s.deltaA >= 0 ? '+' : '';
            return `
                <div class="whatif-scenario-mini ${s.isWin ? 'win' : 'loss'}">
                    <div class="whatif-score-mini">${s.label}</div>
                    <div class="whatif-delta-mini ${deltaClass}">${deltaSign}${s.deltaA.toFixed(2)}</div>
                </div>
            `;
        }).join('');

        resultDiv.style.display = 'block';
    };

    // Head-to-head comparison
    const renderH2H = (comparePlayer) => {
        const resultDiv = document.getElementById('myCompareResult');
        const scoreDiv = document.getElementById('myH2HScore');
        const matchesList = document.getElementById('myCompareMatches');

        if (!resultDiv || !currentPlayer || !comparePlayer) {
            if (resultDiv) resultDiv.style.display = 'none';
            return;
        }

        // Find matches between these players
        const h2hMatches = currentPlayer.matchDetails.filter(m => 
            !m.isDoubles && normalizePlayerKey(m.opponent) === normalizePlayerKey(comparePlayer.name)
        );

        if (h2hMatches.length === 0) {
            resultDiv.style.display = 'block';
            scoreDiv.textContent = '0 : 0';
            matchesList.innerHTML = '<p class="no-match">Žiadne vzájomné zápasy</p>';
            return;
        }

        let winsA = 0, winsB = 0;
        h2hMatches.forEach(m => {
            if (m.score_own > m.score_opp) winsA++;
            else winsB++;
        });

        scoreDiv.textContent = `${winsA} : ${winsB}`;
        matchesList.innerHTML = h2hMatches.reverse().map(m => {
            const isWin = m.score_own > m.score_opp;
            return `
                <div class="compare-match-item">
                    <span>${m.round}</span>
                    <span class="compare-match-result ${isWin ? 'win' : 'loss'}">${m.score_own}:${m.score_opp}</span>
                </div>
            `;
        }).join('');

        resultDiv.style.display = 'block';
    };

    // Main render function for selected player
    const renderPlayerStats = (p) => {
        currentPlayer = p;
        localStorage.setItem(MYSTATS_STORAGE_KEY, p.name);
        updateURLWithPlayer(p.name);

        // Send GA4 event
        if (typeof gtag !== 'undefined') {
            gtag('event', 'view_player', { player: p.name });
        }

        // Header
        document.getElementById('myStatsName').textContent = p.name;
        document.getElementById('myStatsTeam').textContent = p.team || '-';
        document.getElementById('myStatsAvatar').textContent = p.name.charAt(0).toUpperCase();

        // Core stats
        const rank = ratingRanking.get(normalizePlayerKey(p.name)) || '?';
        document.getElementById('myRating').textContent = p.rating.toFixed(2);
        document.getElementById('myRank').textContent = `#${rank} z ${totalPlayers}`;

        // Rating change (this round)
        const roundChange = p.roundGain || 0;
        const changeEl = document.getElementById('myRatingChange');
        const changeSign = roundChange >= 0 ? '+' : '';
        changeEl.textContent = `${changeSign}${roundChange.toFixed(2)}`;
        changeEl.classList.remove('positive', 'negative');
        changeEl.classList.add(roundChange >= 0 ? 'positive' : 'negative');

        // Peak rating
        const peak = findPeakRating(p);
        document.getElementById('myPeakRating').textContent = peak.rating.toFixed(2);
        document.getElementById('myPeakWhen').textContent = peak.when;

        // Win/Loss record (colored)
        const wins = p.wins + p.dWins;
        const losses = p.losses + p.dLosses;
        const recordEl = document.getElementById('myRecord');
        if (recordEl) {
            recordEl.innerHTML = `<span class="record-win">${wins}V</span> - <span class="record-loss">${losses}P</span>`;
        }

        // Form
        const form = getRecentForm(p.matchDetails);
        const formContainer = document.getElementById('myForm');
        formContainer.innerHTML = form.map(f => 
            `<span class="form-indicator ${f === 'W' ? 'win' : 'loss'}">${f}</span>`
        ).join('');

        // Records
        // Best win
        if (p.bestWinOpponent && isFinite(p.bestWinRating)) {
            document.getElementById('myBestWin').textContent = p.bestWinOpponent;
            document.getElementById('myBestWinRating').textContent = `Rating: ${p.bestWinRating.toFixed(2)}`;
        } else {
            document.getElementById('myBestWin').textContent = '-';
            document.getElementById('myBestWinRating').textContent = '';
        }

        // Biggest upset
        const upset = calculateBiggestUpset(p.matchDetails);
        if (upset) {
            document.getElementById('myBiggestUpset').textContent = upset.opponent;
            document.getElementById('myBiggestUpsetDiff').textContent = `+${upset.diff.toFixed(0)} rating rozdiel`;
        } else {
            document.getElementById('myBiggestUpset').textContent = '-';
            document.getElementById('myBiggestUpsetDiff').textContent = '';
        }

        // Streak
        const streak = calculateStreak(p.matchDetails);
        document.getElementById('myLongestStreak').textContent = `${streak.longest} výhier`;
        document.getElementById('myCurrentStreak').textContent = streak.current > 0 ? `Aktuálna: ${streak.current}` : 'Žiadna aktívna';

        // Render charts and other sections
        setTimeout(() => renderMyLineChart(p), 100);
        setTimeout(() => renderMyRadarChart(p), 150);
        renderRecentMatches(p, players);
        renderUpcomingMatch(p);

        showStatsScreen();
    };

    // Select player handler
    const handleSelectPlayer = () => {
        const name = playerInput.value.trim();
        if (!name) {
            selectStatus.textContent = 'Zadajte meno hráča.';
            return;
        }

        const player = playerLookup[normalizePlayerKey(name)];
        if (!player) {
            selectStatus.textContent = 'Hráč nebol nájdený.';
            return;
        }

        selectStatus.textContent = '';
        renderPlayerStats(player);
    };

    // Event listeners
    if (selectBtn) {
        selectBtn.addEventListener('click', handleSelectPlayer);
    }

    if (playerInput) {
        playerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSelectPlayer();
            }
        });
    }

    if (changePlayerBtn) {
        changePlayerBtn.addEventListener('click', () => {
            localStorage.removeItem(MYSTATS_STORAGE_KEY);
            currentPlayer = null;
            updateURLWithPlayer(null);
            if (playerInput) playerInput.value = '';
            showSelectScreen();
        });
    }

    // Compare functionality
    const compareForm = document.getElementById('myCompareForm');
    const compareInput = document.getElementById('myCompareInput');
    const clearCompareBtn = document.getElementById('myClearCompareBtn');
    const compareStatus = document.getElementById('myCompareStatus');

    if (compareForm) {
        compareForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!currentPlayer || !compareInput) return;

            const name = compareInput.value.trim();
            if (!name) {
                compareStatus.textContent = 'Zadajte meno hráča.';
                return;
            }

            const target = playerLookup[normalizePlayerKey(name)];
            if (!target) {
                compareStatus.textContent = 'Hráč nebol nájdený.';
                return;
            }

            if (normalizePlayerKey(target.name) === normalizePlayerKey(currentPlayer.name)) {
                compareStatus.textContent = 'Nemôžete porovnať sami so sebou.';
                return;
            }

            // Send GA4 event for player comparison
            if (typeof gtag !== 'undefined') {
                gtag('event', 'compare_players', {
                    playerA: currentPlayer.name,
                    playerB: target.name,
                    source: 'myStats'
                });
            }

            compareStatus.textContent = `Porovnávanie s ${target.name}`;
            compareStatus.classList.add('ok');
            renderMyLineChart(currentPlayer, target);
            renderMyRadarChart(currentPlayer, target);
            renderH2H(target);
        });
    }

    if (clearCompareBtn) {
        clearCompareBtn.addEventListener('click', () => {
            if (compareInput) compareInput.value = '';
            if (compareStatus) {
                compareStatus.textContent = '';
                compareStatus.classList.remove('ok');
            }
            document.getElementById('myCompareResult').style.display = 'none';
            if (currentPlayer) {
                renderMyLineChart(currentPlayer);
                renderMyRadarChart(currentPlayer);
            }
        });
    }

    // What If button
    const whatIfBtn = document.getElementById('myWhatIfBtn');
    if (whatIfBtn) {
        whatIfBtn.addEventListener('click', renderWhatIfMini);
    }

    const whatIfInput = document.getElementById('myWhatIfOpponent');
    if (whatIfInput) {
        whatIfInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                renderWhatIfMini();
            }
        });
    }

    // Initialize: Check URL param first, then localStorage
    const urlPlayerName = getPlayerFromURL();
    const savedName = localStorage.getItem(MYSTATS_STORAGE_KEY);
    
    let playerNameToLoad = null;
    
    if (urlPlayerName) {
        // URL has player name
        const urlPlayer = playerLookup[normalizePlayerKey(urlPlayerName)];
        if (urlPlayer) {
            playerNameToLoad = urlPlayer.name;
            // Update localStorage if it differs from URL
            if (savedName !== urlPlayer.name) {
                localStorage.setItem(MYSTATS_STORAGE_KEY, urlPlayer.name);
            }
        } else {
            // URL has invalid player name, clear it
            updateURLWithPlayer(null);
        }
    } else if (savedName) {
        // No URL param but localStorage has a value, update URL
        const savedPlayer = playerLookup[normalizePlayerKey(savedName)];
        if (savedPlayer) {
            playerNameToLoad = savedPlayer.name;
            updateURLWithPlayer(savedPlayer.name);
        }
    }
    
    // Load the player if we found one
    if (playerNameToLoad) {
        const player = playerLookup[normalizePlayerKey(playerNameToLoad)];
        if (player) {
            renderPlayerStats(player);
        } else {
            showSelectScreen();
        }
    } else {
        showSelectScreen();
    }
}

// --- MY TEAM PAGE ---
function renderMyTeamPage() {
    const {players} = processData();
    const playerArr = Object.values(players);
    const MYTEAM_STORAGE_KEY = 'myteam_team_name';
    const MYSTATS_STORAGE_KEY = 'mystats_player_name';
    const URL_PARAM_NAME = 'team';

    // Create team map
    const teamMap = new Map();
    // Using global sortRoster function
    playerArr.forEach(p => {
        if (p.team && p.team !== 'N/A') {
            if (!teamMap.has(p.team)) teamMap.set(p.team, []);
            teamMap.get(p.team).push(p);
        }
    });
    teamMap.forEach((list, key) => teamMap.set(key, sortRoster(list)));
    const teamNames = Array.from(teamMap.keys()).sort((a, b) => a.localeCompare(b, 'sk', {sensitivity: 'base'}));

    // URL query parameter helpers
    const getTeamFromURL = () => {
        const params = new URLSearchParams(window.location.search);
        return params.get(URL_PARAM_NAME) || null;
    };

    const updateURLWithTeam = (teamName) => {
        const url = new URL(window.location.href);
        if (!teamName) {
            url.searchParams.delete(URL_PARAM_NAME);
        } else {
            url.searchParams.set(URL_PARAM_NAME, teamName);
        }
        window.history.replaceState({}, '', url);
    };

    // DOM elements
    const selectSection = document.getElementById('teamSelectSection');
    const teamContent = document.getElementById('myTeamContent');
    const teamInput = document.getElementById('myTeamSelect');
    const teamsList = document.getElementById('myTeamsList');
    const selectBtn = document.getElementById('selectTeamBtn');
    const selectStatus = document.getElementById('teamSelectStatus');
    const changeTeamBtn = document.getElementById('changeTeamBtn');

    // Populate datalists
    const populateTeamsList = (listEl) => {
        if (!listEl) return;
        listEl.innerHTML = '';
        teamNames.forEach(team => {
            const opt = document.createElement('option');
            opt.value = team;
            listEl.appendChild(opt);
        });
    };

    populateTeamsList(teamsList);

    // Compare select will be populated when a team is selected (in renderTeamStats)

    // Current selected team
    let currentTeam = null;
    let currentCompareTeam = null;
    let myTeamRatingChart = null;

    // Show team selection screen
    const showSelectScreen = () => {
        if (selectSection) selectSection.style.display = 'block';
        if (teamContent) teamContent.style.display = 'none';
    };

    // Show stats screen
    const showStatsScreen = () => {
        if (selectSection) selectSection.style.display = 'none';
        if (teamContent) teamContent.style.display = 'block';
    };

    // Calculate team active rating (4 most active players)
    const getActiveRating = (teamPlayers) => {
        const active = teamPlayers.slice(0, 4);
        if (active.length === 0) return 0;
        return active.reduce((sum, p) => sum + p.rating, 0) / active.length;
    };

    // Calculate team overall rating (all players)
    const getOverallRating = (teamPlayers) => {
        if (teamPlayers.length === 0) return 0;
        return teamPlayers.reduce((sum, p) => sum + p.rating, 0) / teamPlayers.length;
    };

    // Calculate team W/D/L record
    const getTeamRecord = (teamName) => {
        const teamMatches = matchResults.filter(m => {
            if (!isPlayedMatch(m)) return false;
            return m.player_a_team === teamName || m.player_b_team === teamName;
        });

        // Group by team match (same round, same teams)
        const grouped = {};
        teamMatches.forEach(m => {
            const key = `${getMatchRoundId(m)}_${m.player_a_team}_${m.player_b_team}`;
            if (!grouped[key]) {
                grouped[key] = {
                    teamA: m.player_a_team,
                    teamB: m.player_b_team,
                    games: [],
                    round: m.round
                };
            }
            grouped[key].games.push(m);
        });

        let wins = 0, draws = 0, losses = 0;
        Object.values(grouped).forEach(match => {
            let scoreA = 0, scoreB = 0;
            match.games.forEach(g => {
                const sA = parseInt(g.score_a) || 0;
                const sB = parseInt(g.score_b) || 0;
                if (sA > sB) scoreA++;
                if (sB > sA) scoreB++;
            });
            const isHome = match.teamA === teamName;
            const ourScore = isHome ? scoreA : scoreB;
            const theirScore = isHome ? scoreB : scoreA;
            if (ourScore > theirScore) wins++;
            else if (ourScore < theirScore) losses++;
            else draws++;
        });

        return { wins, draws, losses };
    };

    // Calculate team form (last 5 team matches)
    const getTeamForm = (teamName) => {
        const teamMatches = matchResults.filter(m => {
            if (!isPlayedMatch(m)) return false;
            return m.player_a_team === teamName || m.player_b_team === teamName;
        });

        const grouped = {};
        teamMatches.forEach(m => {
            const key = `${getMatchRoundId(m)}_${m.player_a_team}_${m.player_b_team}`;
            if (!grouped[key]) {
                grouped[key] = {
                    teamA: m.player_a_team,
                    teamB: m.player_b_team,
                    games: [],
                    round: m.round,
                    seasonOrder: getSeasonOrder(m.season),
                    roundNum: getRoundNumFromStr(m.round)
                };
            }
            grouped[key].games.push(m);
        });

        const sorted = Object.values(grouped).sort((a, b) => {
            if (a.seasonOrder !== b.seasonOrder) return b.seasonOrder - a.seasonOrder;
            return b.roundNum - a.roundNum;
        });

        const form = [];
        sorted.slice(0, 5).forEach(match => {
            let scoreA = 0, scoreB = 0;
            match.games.forEach(g => {
                const sA = parseInt(g.score_a) || 0;
                const sB = parseInt(g.score_b) || 0;
                if (sA > sB) scoreA++;
                if (sB > sA) scoreB++;
            });
            const isHome = match.teamA === teamName;
            const ourScore = isHome ? scoreA : scoreB;
            const theirScore = isHome ? scoreB : scoreA;
            form.push(ourScore > theirScore ? 'W' : (ourScore < theirScore ? 'L' : 'D'));
        });

        return form.reverse(); // Oldest first
    };

    // Render rating chart (active vs overall)
    // Helper function to calculate actual rating for a round (average of actual ratings from matches in that round)
    const calculateActualRatingForRound = (teamName, round) => {
        // Find all matches the team played in this round
        // Use the same round ID format as getMatchRoundId: `${season}__${round}`
        const targetRoundId = `${round.season || 'N/A'}__${round.name}`;
        
        const teamMatchesInRound = matchResults.filter(m => {
            if (!isPlayedMatch(m)) return false;
            const matchRoundId = getMatchRoundId(m);
            return matchRoundId === targetRoundId && (m.player_a_team === teamName || m.player_b_team === teamName);
        });

        if (teamMatchesInRound.length === 0) {
            return null;
        }

        // Group matches by team match (same opponent, same round)
        const teamMatchesMap = new Map();
        teamMatchesInRound.forEach(m => {
            const key = `${m.player_a_team}::${m.player_b_team}`;
            if (!teamMatchesMap.has(key)) {
                teamMatchesMap.set(key, {
                    teamA: m.player_a_team,
                    teamB: m.player_b_team,
                    games: [],
                    round: m.round,
                    season: m.season
                });
            }
            teamMatchesMap.get(key).games.push(m);
        });

        // Local helper to calculate actualRating for a team match
        const calculateActualRatingForTeamMatch = (teamName, teamMatch) => {
            const teamPlayers = teamMap.get(teamName) || [];
            if (teamPlayers.length === 0) {
                return 0;
            }

            const playerDataMap = new Map();
            const uniquePlayersSet = new Set();
            const playerMatchesInTeamMatch = new Map();
            
            teamMatch.games.forEach(g => {
                const isDoubles = g.doubles === true || g.doubles === "true";
                const playersA = g.player_a ? g.player_a.split('/').map(n => n.trim()).filter(n => n && !isWalkoverToken(n)) : [];
                const playersB = g.player_b ? g.player_b.split('/').map(n => n.trim()).filter(n => n && !isWalkoverToken(n)) : [];
                
                if (g.player_a_team === teamName) {
                    playersA.forEach(p => uniquePlayersSet.add(p));
                    
                    if (isDoubles && playersA.length === 2) {
                        playersA.forEach(p => {
                            playerMatchesInTeamMatch.set(p, (playerMatchesInTeamMatch.get(p) || 0) + 0.5);
                        });
                    } else if (playersA.length === 1) {
                        playerMatchesInTeamMatch.set(playersA[0], (playerMatchesInTeamMatch.get(playersA[0]) || 0) + 1);
                    }
                }
                
                if (g.player_b_team === teamName) {
                    playersB.forEach(p => uniquePlayersSet.add(p));
                    
                    if (isDoubles && playersB.length === 2) {
                        playersB.forEach(p => {
                            playerMatchesInTeamMatch.set(p, (playerMatchesInTeamMatch.get(p) || 0) + 0.5);
                        });
                    } else if (playersB.length === 1) {
                        playerMatchesInTeamMatch.set(playersB[0], (playerMatchesInTeamMatch.get(playersB[0]) || 0) + 1);
                    }
                }
            });

            let actualRating = 0;
            const uniquePlayersCount = uniquePlayersSet.size;
            
            if (uniquePlayersCount > 0) {
                const playerRatings = [];
                const matchWeights = [];
                
                uniquePlayersSet.forEach(playerName => {
                    const rating = getPlayerRatingBeforeMatch(playerName, teamMatch.round, teamMatch.season, players);
                    const matches = getPlayerMatchesBeforeMatch(playerName, teamMatch.round, teamMatch.season, players);
                    const matchesInTeamMatch = playerMatchesInTeamMatch.get(playerName) || 0;
                    
                    // Include players who actually played in this team match
                    // Even if they haven't played before (matches === 0), they should be included
                    if (matchesInTeamMatch > 0) {
                        playerRatings.push(rating);
                        matchWeights.push(matchesInTeamMatch);
                    }
                });
                
                if (playerRatings.length > 0) {
                    let totalWeighted = 0;
                    let totalWeight = 0;
                    for (let i = 0; i < playerRatings.length; i++) {
                        totalWeighted += playerRatings[i] * matchWeights[i];
                        totalWeight += matchWeights[i];
                    }
                    const expectedTotalMatches = 18;
                    if (totalWeight < expectedTotalMatches) {
                        totalWeight = expectedTotalMatches;
                    }
                    actualRating = totalWeight > 0 ? totalWeighted / totalWeight : 0;
                }
            }

            return actualRating;
        };

        // Calculate actualRating for each team match and average them
        const actualRatings = [];
        teamMatchesMap.forEach(teamMatch => {
            const rating = calculateActualRatingForTeamMatch(teamName, teamMatch);
            // Include any valid rating (not null, not 0 where 0 means no data)
            // Note: 0 means calculation failed or no players, so we exclude it
            // But we allow negative values if calculated (though they shouldn't normally occur)
            if (rating !== null && rating !== 0) {
                actualRatings.push(rating);
            }
        });

        if (actualRatings.length === 0) {
            return null;
        }

        // Return average of actual ratings from all team matches in this round
        return actualRatings.reduce((sum, r) => sum + r, 0) / actualRatings.length;
    };

    const renderTeamRatingChart = (teamName, teamPlayers, compareTeamName = null, compareTeamPlayers = null, attempt = 0) => {
        const canvas = document.getElementById('myTeamRatingChart');
        if (!canvas || typeof Chart === 'undefined') {
            if (attempt < 8) setTimeout(() => renderTeamRatingChart(teamName, teamPlayers, compareTeamName, compareTeamPlayers, attempt + 1), 120);
            return;
        }

        // Collect all unique rounds from PLAYED matches only
        const roundsMap = new Map();
        matchResults.filter(isPlayedMatch).forEach(m => {
            const id = getMatchRoundId(m);
            if (!roundsMap.has(id)) {
                const rNum = parseInt((m.round.match(/\d+/) || [0])[0]);
                const sOrder = getSeasonOrder(m.season);
                roundsMap.set(id, {
                    id,
                    name: m.round,
                    season: m.season,
                    seasonOrder: sOrder,
                    roundNum: rNum
                });
            }
        });

        const sortedRounds = Array.from(roundsMap.values()).sort((a, b) => {
            if (a.seasonOrder !== b.seasonOrder) return a.seasonOrder - b.seasonOrder;
            return a.roundNum - b.roundNum;
        });

        // Calculate ratings per round using actual player history
        const activeRatings = [];
        const overallRatings = [];
        const actualRatings = [];
        const compareActiveRatings = [];
        const compareOverallRatings = [];
        const compareActualRatings = [];
        const labels = [];

        sortedRounds.forEach(round => {
            // Calculate ratings for current team
            const { activeRating, overallRating } = calculateTeamRatingsForRound(teamPlayers, round);
            const actualRating = calculateActualRatingForRound(teamName, round);
            
            if (activeRating !== null && overallRating !== null) {
                activeRatings.push(activeRating);
                overallRatings.push(overallRating);
                actualRatings.push(actualRating);
                labels.push(round.name + (round.season ? ` (${round.season})` : ''));

                // Calculate ratings for comparison team if provided
                if (compareTeamPlayers && compareTeamName) {
                    const compareRatings = calculateTeamRatingsForRound(compareTeamPlayers, round);
                    const compareActualRating = calculateActualRatingForRound(compareTeamName, round);
                    compareActiveRatings.push(compareRatings.activeRating);
                    compareOverallRatings.push(compareRatings.overallRating);
                    compareActualRatings.push(compareActualRating);
                } else {
                    compareActiveRatings.push(null);
                    compareOverallRatings.push(null);
                    compareActualRatings.push(null);
                }
            }
        });

        // Check canvas size - if too small, retry (fixes issue when page loads with team in query string)
        const rect = canvas.getBoundingClientRect();
        if ((rect.width < 2 || rect.height < 2) && attempt < 8) {
            setTimeout(() => renderTeamRatingChart(teamName, teamPlayers, compareTeamName, compareTeamPlayers, attempt + 1), 120);
            return;
        }

        const ctx = canvas.getContext('2d');
        const themePrimary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#7c3aed';
        const themeDanger = getComputedStyle(document.documentElement).getPropertyValue('--color-danger').trim() || '#dc2626';

        const datasets = [{
            label: 'Aktívny Rating',
            data: activeRatings,
            borderColor: themePrimary,
            backgroundColor: themePrimary + '20',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 1
        }, {
            label: 'Celkový Rating',
            data: overallRatings,
            borderColor: '#000000',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.3,
            pointRadius: 1
        }, {
            label: 'Skutočný Rating',
            data: actualRatings,
            borderColor: '#666666',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [2, 2],
            tension: 0.3,
            pointRadius: 1,
            hidden: true
        }];

        // Add comparison team datasets if provided
        if (compareTeamName && compareTeamPlayers) {
            datasets.push({
                label: `${compareTeamName} - Aktívny Rating`,
                data: compareActiveRatings,
                borderColor: themeDanger,
                backgroundColor: themeDanger + 20,
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 1
            });
            datasets.push({
                label: `${compareTeamName} - Celkový Rating`,
                data: compareOverallRatings,
                borderColor: themeDanger,
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [5, 5],
                tension: 0.3,
                pointRadius: 1
            });
            datasets.push({
                label: `${compareTeamName} - Skutočný Rating`,
                data: compareActualRatings,
                borderColor: themeDanger,
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [2, 2],
                tension: 0.3,
                pointRadius: 1,
                hidden: true
            });
        }

        if (myTeamRatingChart) myTeamRatingChart.destroy();
        myTeamRatingChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: 'rgba(128,128,128,0.15)' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { maxTicksLimit: 10 }
                    }
                }
            }
        });
    };

    // Render players list
    const renderPlayersList = (teamPlayers) => {
        const container = document.getElementById('myTeamPlayersList');
        if (!container) return;

        if (teamPlayers.length === 0) {
            container.innerHTML = '<p class="no-match">Žiadni hráči</p>';
            return;
        }

        const tableHTML = `
            <div class="team-players-table-wrapper">
                <table class="team-players-table">
                    <thead>
                        <tr>
                            <th>Meno</th>
                            <th>Rating</th>
                            <th>Z</th>
                            <th>V</th>
                            <th>P</th>
                            <th>Úsp</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${teamPlayers.map((p, index) => {
                            const singlesWinRate = p.matches > 0 ? ((p.wins / p.matches) * 100).toFixed(1) : '0.0';
                            const doublesWinRate = p.dMatches > 0 ? ((p.dWins / p.dMatches) * 100).toFixed(1) : '0.0';
                            const winRate = (p.matches + p.dMatches) > 0 ? (((p.wins + p.dWins) / (p.matches + p.dMatches)) * 100).toFixed(1) : '0.0';
                            const isTopFour = index < 4;
                            const nameClass = isTopFour ? 'team-player-name--bold' : '';
                            return `
                                <tr>
                                    <td class="${nameClass}">${escapeHtml(p.name)}</td>
                                    <td class="team-player-rating-cell">${p.rating.toFixed(2)}</td>
                                    <td>${p.matches + p.dMatches}</td>
                                    <td>${p.wins + p.dWins}</td>
                                    <td>${p.losses + p.dLosses}</td>
                                    <td>${winRate}%</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = tableHTML;
    };

    // Render upcoming matches
    const renderUpcomingMatches = (teamName) => {
        const container = document.getElementById('myTeamNextMatchDetails');
        const showAllContainer = document.getElementById('myTeamShowAllUpcomingContainer');
        if (!container) return;

        const futureMatches = matchResults.filter(m => {
            return !isPlayedMatch(m) && (m.player_a_team === teamName || m.player_b_team === teamName);
        });

        if (futureMatches.length === 0) {
            container.innerHTML = '<span class="no-match">Žiadny plánovaný zápas</span>';
            if (showAllContainer) showAllContainer.style.display = 'none';
            return;
        }

        const sortedMatches = futureMatches.sort((a, b) => {
            const dateA = parseMatchDate(a.date) || new Date(0);
            const dateB = parseMatchDate(b.date) || new Date(0);
            return dateA - dateB;
        });

        const visibleMatch = sortedMatches[0];
        const hiddenMatches = sortedMatches.slice(1);
        const hasMoreMatches = hiddenMatches.length > 0;

        let html = '';
        const dateStr = visibleMatch.date ? formatDateWithSlovakDay(visibleMatch.date) : '';
        const location = visibleMatch.location || '';
        html += `
            <div class="next-match-item">
                <div class="next-match-teams">
                    <span>${escapeHtml(visibleMatch.player_a_team)}</span>
                    <span class="vs">vs</span>
                    <span>${escapeHtml(visibleMatch.player_b_team)}</span>
                </div>
                <div class="next-match-meta">${visibleMatch.round || ''}${dateStr ? ' • ' + dateStr : ''}${location ? ' • ' + location : ''}</div>
            </div>
        `;

        hiddenMatches.forEach((match, index) => {
            const matchDateStr = match.date ? formatDateWithSlovakDay(match.date) : '';
            const matchLocation = match.location || '';
            const isLast = index === hiddenMatches.length - 1;
            html += `
                <div class="next-match-item next-match-item--hidden${isLast ? '' : ' next-match-item--separator'}">
                    <div class="next-match-teams">
                        <span>${escapeHtml(match.player_a_team)}</span>
                        <span class="vs">vs</span>
                        <span>${escapeHtml(match.player_b_team)}</span>
                    </div>
                    <div class="next-match-meta">${match.round || ''}${matchDateStr ? ' • ' + matchDateStr : ''}${matchLocation ? ' • ' + matchLocation : ''}</div>
                </div>
            `;
        });

        container.innerHTML = html;

        if (hasMoreMatches && showAllContainer) {
            showAllContainer.style.display = 'block';
            const showAllBtn = document.getElementById('myTeamShowAllUpcomingBtn');
            if (showAllBtn) {
                showAllBtn.onclick = () => {
                    const firstMatch = container.querySelector('.next-match-item:not(.next-match-item--hidden)');
                    if (firstMatch) firstMatch.classList.add('next-match-item--separator');
                    container.querySelectorAll('.next-match-item--hidden').forEach(item => {
                        item.classList.remove('next-match-item--hidden');
                    });
                    showAllContainer.style.display = 'none';
                };
            }
        } else if (showAllContainer) {
            showAllContainer.style.display = 'none';
        }
    };

    // Using global getPlayerRatingBeforeMatch and getPlayerMatchesBeforeMatch functions directly

    // Calculate team ratings for a match
    const calculateTeamRatingsForMatch = (teamName, match) => {
        const teamPlayers = teamMap.get(teamName) || [];
        if (teamPlayers.length === 0) {
            return { actualRating: 0, activeRating: 0, overallRating: 0 };
        }

        // Calculate actual rating based on players in the match
        // Use a Set to track unique players (for singles) and unique pairs (for doubles)
        const playerDataMap = new Map(); // key: player name or "player1/player2" for doubles, value: {rating, matches}
        const uniquePlayersSet = new Set(); // Track unique individual players
        const playerMatchesInTeamMatch = new Map(); // Track how many matches each player played in THIS team match
        
        match.games.forEach(g => {
            const isDoubles = g.doubles === true || g.doubles === "true";
            const playersA = g.player_a ? g.player_a.split('/').map(n => n.trim()).filter(n => n && !isWalkoverToken(n)) : [];
            const playersB = g.player_b ? g.player_b.split('/').map(n => n.trim()).filter(n => n && !isWalkoverToken(n)) : [];
            
            // Process team A players
            if (g.player_a_team === teamName) {
                // Track unique players
                playersA.forEach(p => uniquePlayersSet.add(p));
                
                // Track matches played in this team match
                if (isDoubles && playersA.length === 2) {
                    // Doubles: each player gets 0.5 matches
                    playersA.forEach(p => {
                        playerMatchesInTeamMatch.set(p, (playerMatchesInTeamMatch.get(p) || 0) + 0.5);
                    });
                } else if (playersA.length === 1) {
                    // Singles: player gets 1 match
                    playerMatchesInTeamMatch.set(playersA[0], (playerMatchesInTeamMatch.get(playersA[0]) || 0) + 1);
                }
                
                if (isDoubles && playersA.length === 2) {
                    const key = `${playersA[0]}/${playersA[1]}`;
                    if (!playerDataMap.has(key)) {
                        const rating1 = getPlayerRatingBeforeMatch(playersA[0], match.round, match.season, players);
                        const rating2 = getPlayerRatingBeforeMatch(playersA[1], match.round, match.season, players);
                        const avgRating = (rating1 + rating2) / 2;
                        const matches1 = getPlayerMatchesBeforeMatch(playersA[0], match.round, match.season, players);
                        const matches2 = getPlayerMatchesBeforeMatch(playersA[1], match.round, match.season, players);
                        const totalMatches = matches1 + matches2;
                        if (totalMatches > 0) {
                            playerDataMap.set(key, { rating: avgRating, matches: totalMatches });
                        }
                    }
                } else if (playersA.length === 1) {
                    const key = playersA[0];
                    if (!playerDataMap.has(key)) {
                        const rating = getPlayerRatingBeforeMatch(playersA[0], match.round, match.season, players);
                        const matches = getPlayerMatchesBeforeMatch(playersA[0], match.round, match.season, players);
                        if (matches > 0) {
                            playerDataMap.set(key, { rating, matches });
                        }
                    }
                }
            }
            
            // Process team B players
            if (g.player_b_team === teamName) {
                // Track unique players
                playersB.forEach(p => uniquePlayersSet.add(p));
                
                // Track matches played in this team match
                if (isDoubles && playersB.length === 2) {
                    // Doubles: each player gets 0.5 matches
                    playersB.forEach(p => {
                        playerMatchesInTeamMatch.set(p, (playerMatchesInTeamMatch.get(p) || 0) + 0.5);
                    });
                } else if (playersB.length === 1) {
                    // Singles: player gets 1 match
                    playerMatchesInTeamMatch.set(playersB[0], (playerMatchesInTeamMatch.get(playersB[0]) || 0) + 1);
                }
                
                if (isDoubles && playersB.length === 2) {
                    const key = `${playersB[0]}/${playersB[1]}`;
                    if (!playerDataMap.has(key)) {
                        const rating1 = getPlayerRatingBeforeMatch(playersB[0], match.round, match.season, players);
                        const rating2 = getPlayerRatingBeforeMatch(playersB[1], match.round, match.season, players);
                        const avgRating = (rating1 + rating2) / 2;
                        const matches1 = getPlayerMatchesBeforeMatch(playersB[0], match.round, match.season, players);
                        const matches2 = getPlayerMatchesBeforeMatch(playersB[1], match.round, match.season, players);
                        const totalMatches = matches1 + matches2;
                        if (totalMatches > 0) {
                            playerDataMap.set(key, { rating: avgRating, matches: totalMatches });
                        }
                    }
                } else if (playersB.length === 1) {
                    const key = playersB[0];
                    if (!playerDataMap.has(key)) {
                        const rating = getPlayerRatingBeforeMatch(playersB[0], match.round, match.season, players);
                        const matches = getPlayerMatchesBeforeMatch(playersB[0], match.round, match.season, players);
                        if (matches > 0) {
                            playerDataMap.set(key, { rating, matches });
                        }
                    }
                }
            }
        });

        // Calculate weighted average (actual rating)
        let actualRating = 0;
        // Count unique individual players who actually played (not game entries)
        const uniquePlayersCount = uniquePlayersSet.size;
        
        if (uniquePlayersCount > 0) {
            // Collect individual player ratings and their match counts in this team match
            const playerRatings = [];
            const matchWeights = [];
            
            // Get ratings for each unique player
            uniquePlayersSet.forEach(playerName => {
                const rating = getPlayerRatingBeforeMatch(playerName, match.round, match.season, players);
                const matches = getPlayerMatchesBeforeMatch(playerName, match.round, match.season, players);
                const matchesInTeamMatch = playerMatchesInTeamMatch.get(playerName) || 0;
                
                // Include all players who actually played in this team match,
                // even if this was their first match in the league (matches may be 0)
                if (matchesInTeamMatch > 0) {
                    playerRatings.push(rating);
                    matchWeights.push(matchesInTeamMatch);
                }
            });
            
            if (playerRatings.length > 0) {
                // Calculate weighted average: sum(rating × matches_in_team_match) / sum(matches_in_team_match)
                let totalWeighted = 0;
                let totalWeight = 0;
                for (let i = 0; i < playerRatings.length; i++) {
                    totalWeighted += playerRatings[i] * matchWeights[i];
                    totalWeight += matchWeights[i];
                }
                // Normalize to 18 (standard team match total) if less, to account for walkover losses
                const expectedTotalMatches = 18;
                if (totalWeight < expectedTotalMatches) {
                    totalWeight = expectedTotalMatches;
                }
                actualRating = totalWeight > 0 ? totalWeighted / totalWeight : 0;
            }
        }

        // Calculate active rating and overall rating at the time of the match
        const playersAtMatch = teamPlayers.map(p => {
            const rating = getPlayerRatingBeforeMatch(p.name, match.round, match.season, players);
            const matches = getPlayerMatchesBeforeMatch(p.name, match.round, match.season, players);
            return { name: p.name, rating, matches };
        }).filter(p => p.matches > 0);

        // Sort by activity (matches) then by rating
        const sorted = [...playersAtMatch].sort((a, b) => {
            if (b.matches !== a.matches) return b.matches - a.matches;
            if (a.rating !== b.rating) return b.rating - a.rating;
            return a.name.localeCompare(b.name, 'sk', {sensitivity: 'base'});
        });

        // Active rating (4 most active)
        const active = sorted.slice(0, 4);
        const activeRating = active.length > 0 
            ? active.reduce((sum, p) => sum + p.rating, 0) / active.length 
            : 0;

        // Overall rating (all players)
        const overallRating = playersAtMatch.length > 0
            ? playersAtMatch.reduce((sum, p) => sum + p.rating, 0) / playersAtMatch.length
            : 0;

        return { actualRating, activeRating, overallRating };
    };

    // Render recent matches (expandable like results.html)
    const renderRecentMatches = (teamName) => {
        const container = document.getElementById('myTeamRecentMatches');
        const showAllContainer = document.getElementById('myTeamShowAllMatchesContainer');
        if (!container) return;

        const teamMatches = matchResults.filter(m => {
            if (!isPlayedMatch(m)) return false;
            return m.player_a_team === teamName || m.player_b_team === teamName;
        });

        // Group by team match
        const grouped = {};
        teamMatches.forEach(m => {
            const key = `${getMatchRoundId(m)}_${m.player_a_team}_${m.player_b_team}`;
            if (!grouped[key]) {
                grouped[key] = {
                    teamA: m.player_a_team,
                    teamB: m.player_b_team,
                    games: [],
                    round: m.round,
                    season: m.season,
                    date: m.date,
                    location: m.location,
                    seasonOrder: getSeasonOrder(m.season),
                    roundNum: getRoundNumFromStr(m.round),
                    group: m.group || ""
                };
            }
            grouped[key].games.push(m);
        });

        const sorted = Object.values(grouped).sort((a, b) => {
            if (a.seasonOrder !== b.seasonOrder) return b.seasonOrder - a.seasonOrder;
            return b.roundNum - a.roundNum;
        });

        const visibleMatches = sorted.slice(0, 5);
        const hiddenMatches = sorted.slice(5);
        const hasMoreMatches = hiddenMatches.length > 0;

        if (visibleMatches.length === 0) {
            container.innerHTML = '<p class="no-match">Žiadne zápasy</p>';
            if (showAllContainer) showAllContainer.style.display = 'none';
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'round-group';

        visibleMatches.forEach(match => {
            let scoreA = 0, scoreB = 0;
            match.games.forEach(g => {
                const sA = parseInt(g.score_a) || 0;
                const sB = parseInt(g.score_b) || 0;
                if (sA > sB) scoreA++;
                if (sB > sA) scoreB++;
            });

            // Determine result for selected team
            const isHome = match.teamA === teamName;
            const ourScore = isHome ? scoreA : scoreB;
            const theirScore = isHome ? scoreB : scoreA;
            let scoreBadgeClass = '';
            if (ourScore > theirScore) {
                scoreBadgeClass = 'score-badge--win';
            } else if (ourScore < theirScore) {
                scoreBadgeClass = 'score-badge--loss';
            } else {
                scoreBadgeClass = 'score-badge--draw';
            }

            // Season/round info
            const seasonRoundText = `${match.round || ''}${match.season ? ` • ${match.season}` : ''}`;

            const matchRow = document.createElement('div');
            // Add group-B class if group is B (for myteam.html)
            const isGroupB = match.group && match.group.trim().toUpperCase() === 'B';
            matchRow.className = 'match-row' + (isGroupB ? ' match-row--group-b' : '');

            const logoA = getTeamLogoSrc(match.teamA);
            const logoB = getTeamLogoSrc(match.teamB);
            const logoSlotHtml = (src, teamName) => {
                const alt = `${escapeAttr(teamName)} logo`;
                const img = src ? `<img class="team-logo-small" src="${src}" alt="${alt}" loading="lazy">` : '';
                return `<div class="team-logo-slot">${img}</div>`;
            };
            const logoAHtml = logoSlotHtml(logoA, match.teamA);
            const logoBHtml = logoSlotHtml(logoB, match.teamB);

            // Determine which team name should be bold
            const teamAClass = match.teamA === teamName ? 'team-name--selected' : '';
            const teamBClass = match.teamB === teamName ? 'team-name--selected' : '';

            const summary = document.createElement('div');
            summary.className = 'match-summary';
            summary.innerHTML = `<div class="team-name team-left ${teamAClass}">${escapeHtml(match.teamA)}</div>${logoAHtml}<div class="score-badge ${scoreBadgeClass}">${scoreA}-${scoreB}</div>${logoBHtml}<div class="team-name team-right ${teamBClass}">${escapeHtml(match.teamB)}</div><div class="expand-icon">▼</div>`;
            // Add round info as separate element positioned at bottom left
            const roundInfo = document.createElement('div');
            roundInfo.className = 'match-round-info';
            roundInfo.textContent = seasonRoundText;
            matchRow.appendChild(roundInfo);

            const details = document.createElement('div');
            details.className = 'match-details';

            // Stats generation
            const stats = {};
            match.games.forEach(g => {
                const isD = g.doubles === true || g.doubles === "true";
                const pVal = isD ? 0.5 : 1;
                const sA = parseInt(g.score_a);
                const sB = parseInt(g.score_b);

                const updateP = (namesStr, team, won) => {
                    if (!namesStr) return;
                    namesStr.split('/').map(n => n.trim()).forEach(n => {
                        if (!n || isWalkoverToken(n)) return;
                        if (!stats[n]) stats[n] = { name: n, team: team, points: 0, possible: 0 };
                        stats[n].possible += pVal;
                        if (won) stats[n].points += pVal;
                    });
                };
                updateP(g.player_a, match.teamA, sA > sB);
                updateP(g.player_b, match.teamB, sB > sA);
            });

            // Calculate ratings for both teams
            const ratingsA = calculateTeamRatingsForMatch(match.teamA, match);
            const ratingsB = calculateTeamRatingsForMatch(match.teamB, match);
            
            // Calculate prediction based on actual ratings
            // Using global winProb function
            const totalSets = 18; // Total sets in a team match
            let predScoreA = Math.round(totalSets * winProb(ratingsA.actualRating, ratingsB.actualRating));
            let predScoreB = Math.max(0, totalSets - predScoreA);
            
            // Ensure scores are within valid range
            predScoreA = Math.min(totalSets, Math.max(0, predScoreA));
            predScoreB = Math.min(totalSets, Math.max(0, predScoreB));
            
            const getTeamStatsHtml = (teamName, align, teamRatings) => {
                const list = Object.values(stats).filter(p => p.team === teamName).sort((a, b) => {
                    if (b.points !== a.points) return b.points - a.points;
                    return a.possible - b.possible;
                });
                if (list.length === 0) return '';
                const tLogo = getTeamLogoSrc(teamName);
                
                let h = `<div class="team-stats ${align}">`;
                if (tLogo) h += `<div class="team-logo-stats"><img class="team-logo-large" src="${tLogo}" alt="${escapeAttr(teamName)} logo" loading="lazy"></div>`;
                
                // Add rating information with tooltips
                h += `<div class="team-rating-info">
                    <div class="rating-info-item">
                        <span class="rating-label">
                            Skutočný rating:
                            <span class="tooltip-container">
                                <span class="tooltip-icon">ℹ️</span>
                                <span class="tooltip-text">Priemerný rating hráčov, ktorí hrali v zápase</span>
                            </span>
                        </span>
                        <span class="rating-value">${teamRatings.actualRating.toFixed(2)}</span>
                    </div>
                    <div class="rating-info-item">
                        <span class="rating-label">
                            Aktívny rating:
                            <span class="tooltip-container">
                                <span class="tooltip-icon">ℹ️</span>
                                <span class="tooltip-text">Priemerný rating 4 najaktívnejších hráčov v tíme</span>
                            </span>
                        </span>
                        <span class="rating-value">${teamRatings.activeRating.toFixed(2)}</span>
                    </div>
                    <div class="rating-info-item">
                        <span class="rating-label">
                            Celkový rating:
                            <span class="tooltip-container">
                                <span class="tooltip-icon">ℹ️</span>
                                <span class="tooltip-text">Priemerný rating všetkých hráčov v tíme</span>
                            </span>
                        </span>
                        <span class="rating-value">${teamRatings.overallRating.toFixed(2)}</span>
                    </div>
                </div>`;
                
                const isMobile = isMobileViewport();
                list.forEach((p) => {
                    h += `<div class="player-stat-row">
                        <div class="player-stat-name">${escapeHtml(isMobile ? formatPlayerName(p.name) : p.name)}</div>
                        <span class="player-stat-score">${p.points}/${p.possible}</span>
                    </div>`;
                });
                h += `</div>`;
                return h;
            };

            // Add single prediction section above team details
            const predictionHtml = `<div class="match-prediction-section">
                <div class="prediction-label">Predikcia pred zápasom (použitý skutočný rating - priemerný rating hráčov, ktorí hrali v zápase):</div>
                <div class="prediction-score">${escapeHtml(match.teamA)} ${predScoreA} : ${predScoreB} ${escapeHtml(match.teamB)}</div>
            </div>`;

            const scoreBadgeHtml = `<div class="score-badge score-badge--overlay ${scoreBadgeClass}">${scoreA}-${scoreB}</div>`;
            const statsHtml = `<div class="match-stats-container">${getTeamStatsHtml(match.teamA, 'left', ratingsA)}${scoreBadgeHtml}${getTeamStatsHtml(match.teamB, 'right', ratingsB)}</div>`;

            // Group games: doubles first, then singles
            const playedGames = match.games.filter(isPlayedMatch).sort((a, b) => (b.doubles ? 1 : 0) - (a.doubles ? 1 : 0));
            const doublesGames = playedGames.filter(g => g.doubles === true || g.doubles === "true");
            const singlesGames = playedGames.filter(g => !(g.doubles === true || g.doubles === "true"));
            
            let gamesHtml = '';
            let teamScoreA = 0;
            let teamScoreB = 0;
            let gameNumber = 0;
            
            // First 2 doubles matches
            if (doublesGames.length > 0) {
                gamesHtml += '<div class="game-group">';
                doublesGames.slice(0, 2).forEach(g => {
                    gameNumber++;
                    const sA = parseInt(g.score_a);
                    const sB = parseInt(g.score_b);
                    if (sA > sB) teamScoreA++;
                    else if (sB > sA) teamScoreB++;
                    gamesHtml += `<div class="game-row">
                        <span class="team-score team-score-left">${teamScoreA}</span>
                        <div class="game-row-content">
                            ${(g.doubles === true || g.doubles === "true") ? '<div class="doubles-badge">ŠTVORHRA</div>' : ''}
                            <div class="game-names"><div class="player-left">${escapeHtml(g.player_a)}</div><div class="game-score ${sA > sB ? 'win-left' : (sB > sA ? 'win-right' : '')}">${sA}:${sB}</div><div class="player-right">${escapeHtml(g.player_b)}</div></div>
                        </div>
                        <span class="team-score team-score-right">${teamScoreB}</span>
                    </div>`;
                });
                gamesHtml += '</div>';
            }
            
            // Singles matches in groups of 4
            for (let i = 0; i < singlesGames.length; i += 4) {
                const batch = singlesGames.slice(i, i + 4);
                if (batch.length > 0) {
                    gamesHtml += '<div class="game-group">';
                    batch.forEach(g => {
                        gameNumber++;
                        const sA = parseInt(g.score_a);
                        const sB = parseInt(g.score_b);
                        if (sA > sB) teamScoreA++;
                        else if (sB > sA) teamScoreB++;
                        gamesHtml += `<div class="game-row">
                            <span class="team-score team-score-left">${teamScoreA}</span>
                            <div class="game-row-content">
                                ${(g.doubles === true || g.doubles === "true") ? '<div class="doubles-badge">ŠTVORHRA</div>' : ''}
                                <div class="game-names"><div class="player-left">${escapeHtml(g.player_a)}</div><div class="game-score ${sA > sB ? 'win-left' : (sB > sA ? 'win-right' : '')}">${sA}:${sB}</div><div class="player-right">${escapeHtml(g.player_b)}</div></div>
                            </div>
                            <span class="team-score team-score-right">${teamScoreB}</span>
                        </div>`;
                    });
                    gamesHtml += '</div>';
                }
            }
            
            // Default mode is compact
            let currentViewMode = 'compact';
            
            // Create view toggle switch (on/off)
            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'match-details-toggle';
            toggleLabel.title = 'Prepnúť zobrazenie';

            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = true; // Default to compact (enabled)
            toggleInput.setAttribute('aria-label', 'Prepínač zobrazenia: kompaktný režim');

            const toggleSlider = document.createElement('span');
            toggleSlider.className = 'match-details-toggle__slider';

            const toggleText = document.createElement('span');
            toggleText.className = 'match-details-toggle__text';
            toggleText.textContent = 'Kompakt';

            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(toggleSlider);
            toggleLabel.appendChild(toggleText);
            
            const setupTableHighlighting = (container) => {
                if (!container) return;
                
                const table = container.querySelector('.compact-match-table');
                if (!table) return;
                
                // Remove all highlights
                const removeHighlights = () => {
                    table.querySelectorAll('.compact-cell--highlighted, .row-header--highlighted, .col-header--highlighted').forEach(el => {
                        el.classList.remove('compact-cell--highlighted', 'row-header--highlighted', 'col-header--highlighted');
                    });
                };
                
                // Highlight cells for a specific player (row or column)
                const highlightPlayer = (playerName, isRow) => {
                    removeHighlights();
                    if (isRow) {
                        // Find row header by comparing data attribute values
                        const rowHeaders = table.querySelectorAll('.row-header');
                        const rowHeader = Array.from(rowHeaders).find(h => h.getAttribute('data-player') === playerName);
                        if (rowHeader) {
                            rowHeader.classList.add('row-header--highlighted');
                            const rowIndex = rowHeader.getAttribute('data-row-index');
                            table.querySelectorAll(`td[data-row-index="${rowIndex}"]`).forEach(cell => {
                                cell.classList.add('compact-cell--highlighted');
                            });
                        }
                    } else {
                        // Find column header by comparing data attribute values
                        const colHeaders = table.querySelectorAll('.col-header');
                        const colHeader = Array.from(colHeaders).find(h => h.getAttribute('data-player') === playerName);
                        if (colHeader) {
                            colHeader.classList.add('col-header--highlighted');
                            const colIndex = colHeader.getAttribute('data-col-index');
                            table.querySelectorAll(`td[data-col-index="${colIndex}"]`).forEach(cell => {
                                cell.classList.add('compact-cell--highlighted');
                            });
                        }
                    }
                };
                
                // Highlight row and column for a specific match
                const highlightMatch = (rowIndex, colIndex) => {
                    removeHighlights();
                    const cell = table.querySelector(`td[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`);
                    if (cell) {
                        const playerA = cell.getAttribute('data-player-a');
                        const playerB = cell.getAttribute('data-player-b');
                        
                        // Highlight row
                        const rowHeaders = table.querySelectorAll('.row-header');
                        const rowHeader = Array.from(rowHeaders).find(h => h.getAttribute('data-player') === playerA);
                        if (rowHeader) {
                            rowHeader.classList.add('row-header--highlighted');
                            table.querySelectorAll(`td[data-row-index="${rowIndex}"]`).forEach(c => {
                                c.classList.add('compact-cell--highlighted');
                            });
                        }
                        
                        // Highlight column
                        const colHeaders = table.querySelectorAll('.col-header');
                        const colHeader = Array.from(colHeaders).find(h => h.getAttribute('data-player') === playerB);
                        if (colHeader) {
                            colHeader.classList.add('col-header--highlighted');
                            table.querySelectorAll(`td[data-col-index="${colIndex}"]`).forEach(c => {
                                c.classList.add('compact-cell--highlighted');
                            });
                        }
                    }
                };
                
                // Add click handlers to row headers
                table.querySelectorAll('.row-header').forEach(header => {
                    header.style.cursor = 'pointer';
                    header.onclick = (e) => {
                        e.stopPropagation();
                        const playerName = header.getAttribute('data-player');
                        highlightPlayer(playerName, true);
                    };
                });
                
                // Add click handlers to column headers
                table.querySelectorAll('.col-header').forEach(header => {
                    header.style.cursor = 'pointer';
                    header.onclick = (e) => {
                        e.stopPropagation();
                        const playerName = header.getAttribute('data-player');
                        highlightPlayer(playerName, false);
                    };
                });
                
                // Add click handlers to cells
                table.querySelectorAll('td.compact-cell').forEach(cell => {
                    cell.style.cursor = 'pointer';
                    cell.onclick = (e) => {
                        e.stopPropagation();
                        const rowIndex = cell.getAttribute('data-row-index');
                        const colIndex = cell.getAttribute('data-col-index');
                        highlightMatch(rowIndex, colIndex);
                    };
                });
                
                // Remove highlights when clicking elsewhere
                document.addEventListener('click', (e) => {
                    if (!table.contains(e.target)) {
                        removeHighlights();
                    }
                }, true);
            };
            
            const renderMatchDetails = () => {
                const predictionStatsGroup = `<div class="match-prediction-stats-group">${predictionHtml}${statsHtml}</div>`;
                
                if (currentViewMode === 'compact') {
                    const compactTable = buildCompactMatchTable(match);
                    details.innerHTML = predictionStatsGroup + compactTable;
                    details.classList.add('match-details--compact');
                    details.classList.remove('match-details--detailed');
                    
                    // Setup highlighting after table is rendered
                    const container = details.querySelector('.compact-match-table-container');
                    setupTableHighlighting(container);
                } else {
                    details.innerHTML = predictionStatsGroup + gamesHtml;
                    details.classList.add('match-details--detailed');
                    details.classList.remove('match-details--compact');
                }
                
                // Re-insert the header after the match-prediction-stats-group
                const statsGroup = details.querySelector('.match-prediction-stats-group');
                if (statsGroup) {
                    const detailsHeader = document.createElement('div');
                    detailsHeader.className = 'match-details-header';
                    detailsHeader.appendChild(toggleLabel);
                    statsGroup.insertAdjacentElement('afterend', detailsHeader);
                }
            };
            
            // Add toggle switch to details header (will be positioned after stats group)
            const detailsHeader = document.createElement('div');
            detailsHeader.className = 'match-details-header';
            detailsHeader.appendChild(toggleLabel);
            
            toggleLabel.onclick = (e) => {
                e.stopPropagation();
            };

            toggleInput.onchange = (e) => {
                e.stopPropagation();
                currentViewMode = toggleInput.checked ? 'compact' : 'detailed';
                toggleText.textContent = currentViewMode === 'detailed' ? 'Detail' : 'Kompakt';
                renderMatchDetails();
            };
            
            // Initial render
            renderMatchDetails();

            summary.onclick = () => {
                const isEx = details.style.display === 'block';
                details.style.display = isEx ? 'none' : 'block';
                matchRow.classList.toggle('active', !isEx);
            };
            matchRow.appendChild(summary);
            matchRow.appendChild(details);
            wrapper.appendChild(matchRow);
        });

        container.innerHTML = '';
        container.appendChild(wrapper);

        if (hasMoreMatches && showAllContainer) {
            showAllContainer.style.display = 'block';
            const showAllBtn = document.getElementById('myTeamShowAllMatchesBtn');
            if (showAllBtn) {
                showAllBtn.onclick = () => {
                    hiddenMatches.forEach(match => {
                        let scoreA = 0, scoreB = 0;
                        match.games.forEach(g => {
                            const sA = parseInt(g.score_a) || 0;
                            const sB = parseInt(g.score_b) || 0;
                            if (sA > sB) scoreA++;
                            if (sB > sA) scoreB++;
                        });

                        // Determine result for selected team
                        const isHome = match.teamA === teamName;
                        const ourScore = isHome ? scoreA : scoreB;
                        const theirScore = isHome ? scoreB : scoreA;
                        let scoreBadgeClass = '';
                        if (ourScore > theirScore) {
                            scoreBadgeClass = 'score-badge--win';
                        } else if (ourScore < theirScore) {
                            scoreBadgeClass = 'score-badge--loss';
                        } else {
                            scoreBadgeClass = 'score-badge--draw';
                        }

                        // Season/round info
                        const seasonRoundText = `${match.round || ''}${match.season ? ` • ${match.season}` : ''}`;

                        const matchRow = document.createElement('div');
                        // Add group-B class if group is B (for myteam.html - show all matches)
                        const isGroupB = match.group && match.group.trim().toUpperCase() === 'B';
                        matchRow.className = 'match-row' + (isGroupB ? ' match-row--group-b' : '');

                        const logoA = getTeamLogoSrc(match.teamA);
                        const logoB = getTeamLogoSrc(match.teamB);
                        const logoSlotHtml = (src, teamName) => {
                            const alt = `${escapeAttr(teamName)} logo`;
                            const img = src ? `<img class="team-logo-small" src="${src}" alt="${alt}" loading="lazy">` : '';
                            return `<div class="team-logo-slot">${img}</div>`;
                        };
                        const logoAHtml = logoSlotHtml(logoA, match.teamA);
                        const logoBHtml = logoSlotHtml(logoB, match.teamB);

                        // Determine which team name should be bold
                        const teamAClass = match.teamA === teamName ? 'team-name--selected' : '';
                        const teamBClass = match.teamB === teamName ? 'team-name--selected' : '';

                        const summary = document.createElement('div');
                        summary.className = 'match-summary';
                        summary.innerHTML = `<div class="team-name team-left ${teamAClass}">${escapeHtml(match.teamA)}</div>${logoAHtml}<div class="score-badge ${scoreBadgeClass}">${scoreA}-${scoreB}</div>${logoBHtml}<div class="team-name team-right ${teamBClass}">${escapeHtml(match.teamB)}</div><div class="expand-icon">▼</div>`;
                        // Add round info as separate element positioned at bottom left
                        const roundInfo = document.createElement('div');
                        roundInfo.className = 'match-round-info';
                        roundInfo.textContent = seasonRoundText;
                        matchRow.appendChild(roundInfo);

                        const details = document.createElement('div');
                        details.className = 'match-details';

                        const stats = {};
                        match.games.forEach(g => {
                            const isD = g.doubles === true || g.doubles === "true";
                            const pVal = isD ? 0.5 : 1;
                            const sA = parseInt(g.score_a);
                            const sB = parseInt(g.score_b);

                            const updateP = (namesStr, team, won) => {
                                if (!namesStr) return;
                                namesStr.split('/').map(n => n.trim()).forEach(n => {
                                    if (!n || isWalkoverToken(n)) return;
                                    if (!stats[n]) stats[n] = { name: n, team: team, points: 0, possible: 0 };
                                    stats[n].possible += pVal;
                                    if (won) stats[n].points += pVal;
                                });
                            };
                            updateP(g.player_a, match.teamA, sA > sB);
                            updateP(g.player_b, match.teamB, sB > sA);
                        });

                        // Calculate ratings for both teams
                        const ratingsA = calculateTeamRatingsForMatch(match.teamA, match);
                        const ratingsB = calculateTeamRatingsForMatch(match.teamB, match);
                        
                        // Calculate prediction based on actual ratings
                        // Using global winProb function
                        const totalSets = 18; // Total sets in a team match
                        let predScoreA = Math.round(totalSets * winProb(ratingsA.actualRating, ratingsB.actualRating));
                        let predScoreB = Math.max(0, totalSets - predScoreA);
                        
                        // Ensure scores are within valid range
                        predScoreA = Math.min(totalSets, Math.max(0, predScoreA));
                        predScoreB = Math.min(totalSets, Math.max(0, predScoreB));
                        
                        const getTeamStatsHtml = (teamName, align, teamRatings) => {
                            const list = Object.values(stats).filter(p => p.team === teamName).sort((a, b) => {
                                if (b.points !== a.points) return b.points - a.points;
                                return a.possible - b.possible;
                            });
                            if (list.length === 0) return '';
                            const tLogo = getTeamLogoSrc(teamName);
                            
                            let h = `<div class="team-stats ${align}">`;
                            if (tLogo) h += `<div class="team-logo-stats"><img class="team-logo-large" src="${tLogo}" alt="${escapeAttr(teamName)} logo" loading="lazy"></div>`;
                            
                            // Add rating information with tooltips
                            h += `<div class="team-rating-info">
                                <div class="rating-info-item">
                                    <span class="rating-label">
                                        Skutočný rating:
                                        <span class="tooltip-container">
                                            <span class="tooltip-icon">ℹ️</span>
                                            <span class="tooltip-text">Priemerný rating hráčov, ktorí hrali v zápase</span>
                                        </span>
                                    </span>
                                    <span class="rating-value">${teamRatings.actualRating.toFixed(2)}</span>
                                </div>
                                <div class="rating-info-item">
                                    <span class="rating-label">
                                        Aktívny rating:
                                        <span class="tooltip-container">
                                            <span class="tooltip-icon">ℹ️</span>
                                            <span class="tooltip-text">Priemerný rating 4 najaktívnejších hráčov v tíme</span>
                                        </span>
                                    </span>
                                    <span class="rating-value">${teamRatings.activeRating.toFixed(2)}</span>
                                </div>
                                <div class="rating-info-item">
                                    <span class="rating-label">
                                        Celkový rating:
                                        <span class="tooltip-container">
                                            <span class="tooltip-icon">ℹ️</span>
                                            <span class="tooltip-text">Priemerný rating všetkých hráčov v tíme</span>
                                        </span>
                                    </span>
                                    <span class="rating-value">${teamRatings.overallRating.toFixed(2)}</span>
                                </div>
                            </div>`;
                            
                            const isMobile = isMobileViewport();
                            list.forEach((p) => {
                                h += `<div class="player-stat-row">
                                    <div class="player-stat-name">${escapeHtml(isMobile ? formatPlayerName(p.name) : p.name)}</div>
                                    <span class="player-stat-score">${p.points}/${p.possible}</span>
                                </div>`;
                            });
                            h += `</div>`;
                            return h;
                        };

                        // Add single prediction section above team details
                        const predictionHtml = `<div class="match-prediction-section">
                            <div class="prediction-label">Systémová predikcia pred zápasom:</div>
                            <div class="prediction-score">${escapeHtml(match.teamA)} ${predScoreA} : ${predScoreB} ${escapeHtml(match.teamB)}</div>
                        </div>`;

                        const scoreBadgeHtml = `<div class="score-badge score-badge--overlay ${scoreBadgeClass}">${scoreA}-${scoreB}</div>`;
                        const statsHtml = `<div class="match-stats-container">${getTeamStatsHtml(match.teamA, 'left', ratingsA)}${scoreBadgeHtml}${getTeamStatsHtml(match.teamB, 'right', ratingsB)}</div>`;

                        // Group games: doubles first, then singles
                        const playedGames = match.games.filter(isPlayedMatch).sort((a, b) => (b.doubles ? 1 : 0) - (a.doubles ? 1 : 0));
                        const doublesGames = playedGames.filter(g => g.doubles === true || g.doubles === "true");
                        const singlesGames = playedGames.filter(g => !(g.doubles === true || g.doubles === "true"));
                        
                        let gamesHtml = '';
                        let teamScoreA = 0;
                        let teamScoreB = 0;
                        let gameNumber = 0;
                        
                        // First 2 doubles matches
                        if (doublesGames.length > 0) {
                            gamesHtml += '<div class="game-group">';
                            doublesGames.slice(0, 2).forEach(g => {
                                gameNumber++;
                                const sA = parseInt(g.score_a);
                                const sB = parseInt(g.score_b);
                                if (sA > sB) teamScoreA++;
                                else if (sB > sA) teamScoreB++;
                                gamesHtml += `<div class="game-row">
                                    <span class="team-score team-score-left">${teamScoreA}</span>
                                    <div class="game-row-content">
                                        ${(g.doubles === true || g.doubles === "true") ? '<div class="doubles-badge">ŠTVORHRA</div>' : ''}
                                        <div class="game-names"><div class="player-left">${escapeHtml(g.player_a)}</div><div class="game-score ${sA > sB ? 'win-left' : (sB > sA ? 'win-right' : '')}">${sA}:${sB}</div><div class="player-right">${escapeHtml(g.player_b)}</div></div>
                                    </div>
                                    <span class="team-score team-score-right">${teamScoreB}</span>
                                </div>`;
                            });
                            gamesHtml += '</div>';
                        }
                        
                        // Singles matches in groups of 4
                        for (let i = 0; i < singlesGames.length; i += 4) {
                            const batch = singlesGames.slice(i, i + 4);
                            if (batch.length > 0) {
                                gamesHtml += '<div class="game-group">';
                                batch.forEach(g => {
                                    gameNumber++;
                                    const sA = parseInt(g.score_a);
                                    const sB = parseInt(g.score_b);
                                    if (sA > sB) teamScoreA++;
                                    else if (sB > sA) teamScoreB++;
                                    gamesHtml += `<div class="game-row">
                                        <span class="team-score team-score-left">${teamScoreA}</span>
                                        <div class="game-row-content">
                                            <span class="game-number">${gameNumber}</span>
                                            ${(g.doubles === true || g.doubles === "true") ? '<div class="doubles-badge">ŠTVORHRA</div>' : ''}
                                            <div class="game-names"><div class="player-left">${escapeHtml(g.player_a)}</div><div class="game-score ${sA > sB ? 'win-left' : (sB > sA ? 'win-right' : '')}">${sA}:${sB}</div><div class="player-right">${escapeHtml(g.player_b)}</div></div>
                                        </div>
                                        <span class="team-score team-score-right">${teamScoreB}</span>
                                    </div>`;
                                });
                                gamesHtml += '</div>';
                            }
                        }
                        
                        // Default mode is compact
                        let currentViewMode = 'compact';
                        
                        // Create view toggle switch (on/off)
                        const toggleLabel = document.createElement('label');
                        toggleLabel.className = 'match-details-toggle';
                        toggleLabel.title = 'Prepnúť zobrazenie';

                        const toggleInput = document.createElement('input');
                        toggleInput.type = 'checkbox';
                        toggleInput.checked = true; // Default to compact (enabled)
                        toggleInput.setAttribute('aria-label', 'Prepínač zobrazenia: kompaktný režim');

                        const toggleSlider = document.createElement('span');
                        toggleSlider.className = 'match-details-toggle__slider';

                        const toggleText = document.createElement('span');
                        toggleText.className = 'match-details-toggle__text';
                        toggleText.textContent = 'Kompakt';

                        toggleLabel.appendChild(toggleInput);
                        toggleLabel.appendChild(toggleSlider);
                        toggleLabel.appendChild(toggleText);
                        
                        const renderMatchDetails = () => {
                            const predictionStatsGroup = `<div class="match-prediction-stats-group">${predictionHtml}${statsHtml}</div>`;
                            
                            if (currentViewMode === 'compact') {
                                const compactTable = buildCompactMatchTable(match);
                                details.innerHTML = predictionStatsGroup + compactTable;
                                details.classList.add('match-details--compact');
                                details.classList.remove('match-details--detailed');
                            } else {
                                details.innerHTML = predictionStatsGroup + gamesHtml;
                                details.classList.add('match-details--detailed');
                                details.classList.remove('match-details--compact');
                            }
                            
                            // Re-insert the header after the match-prediction-stats-group
                            const statsGroup = details.querySelector('.match-prediction-stats-group');
                            if (statsGroup) {
                                const detailsHeader = document.createElement('div');
                                detailsHeader.className = 'match-details-header';
                                detailsHeader.appendChild(toggleLabel);
                                statsGroup.insertAdjacentElement('afterend', detailsHeader);
                            }
                        };
                        
                        // Add toggle switch to details header
                        const detailsHeader = document.createElement('div');
                        detailsHeader.className = 'match-details-header';
                        detailsHeader.appendChild(toggleLabel);
                        
                        toggleLabel.onclick = (e) => {
                            e.stopPropagation();
                        };

                        toggleInput.onchange = (e) => {
                            e.stopPropagation();
                            currentViewMode = toggleInput.checked ? 'compact' : 'detailed';
                            toggleText.textContent = currentViewMode === 'detailed' ? 'Detail' : 'Kompakt';
                            renderMatchDetails();
                        };
                        
                        // Initial render
                        renderMatchDetails();

                        summary.onclick = () => {
                            const isEx = details.style.display === 'block';
                            details.style.display = isEx ? 'none' : 'block';
                            matchRow.classList.toggle('active', !isEx);
                        };
                        matchRow.appendChild(summary);
                        matchRow.appendChild(details);
                        wrapper.appendChild(matchRow);
                    });
                    showAllContainer.style.display = 'none';
                };
            }
        } else if (showAllContainer) {
            showAllContainer.style.display = 'none';
        }
    };

    // Initialize team prediction (similar to prediction page but with left team preselected)
    const initTeamPrediction = (teamName) => {
        const teamDisplayA = document.getElementById('myTeamPredTeamADisplay');
        const teamSelectB = document.getElementById('myTeamPredTeamB');
        const teamPredictionResult = document.getElementById('myTeamPredictionResult');
        const teamPredScore = document.getElementById('myTeamPredScore');
        const teamRateA = document.getElementById('myTeamRateA');
        const teamRateB = document.getElementById('myTeamRateB');
        const teamStatus = document.getElementById('myTeamPredictionStatus');
        const lineupA = document.getElementById('myTeamLineupA');
        const lineupB = document.getElementById('myTeamLineupB');
        const lineupTitleA = document.getElementById('myTeamLineupTitleA');
        const lineupTitleB = document.getElementById('myTeamLineupTitleB');
        const teamPredictBtn = document.getElementById('myTeamPredictBtn');
        const teamLogoA = document.getElementById('myTeamPredLogoA');
        const teamLogoB = document.getElementById('myTeamPredLogoB');
        const lineupWrapper = document.getElementById('myTeamLineupWrapper');

        if (!teamDisplayA || !teamSelectB || !teamPredictionResult) return;

        // Using global avgRating function
        // Using global winProb function

        const setTeamLogo = (teamName, targetEl) => {
            if (!targetEl) return;
            if (!teamName) {
                targetEl.innerHTML = '';
                return;
            }
            const logo = getTeamLogoSrc(teamName);
            if (logo) {
                targetEl.innerHTML = `<img src="${escapeAttr(logo)}" alt="${escapeAttr(teamName)} logo" loading="lazy">`;
            } else {
                targetEl.innerHTML = `<span class="logo-placeholder">${escapeHtml(teamName.slice(0, 3).toUpperCase())}</span>`;
            }
        };

        const populateTeams = (select) => {
            if (!select) return;
            select.innerHTML = `<option value="">Vyberte hosťujúci tím</option>`;
            teamNames.forEach(t => {
                if (t === teamName) return; // Don't include current team in opponent selection
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                select.appendChild(opt);
            });
        };

        const renderLineup = (teamName, targetEl, titleEl) => {
            if (titleEl && !titleEl.dataset.defaultTitle) titleEl.dataset.defaultTitle = titleEl.textContent || '';
            if (titleEl) titleEl.textContent = teamName ? `Zostava ${teamName}` : (titleEl.dataset.defaultTitle || '');
            if (!targetEl) return;
            targetEl.innerHTML = '';
            if (!teamName) {
                targetEl.innerHTML = `<div class="lineup-hint">Vyberte tím pre zobrazenie hráčov.</div>`;
                return;
            }
            const roster = teamMap.get(teamName) || [];
            if (roster.length === 0) {
                targetEl.innerHTML = `<div class="lineup-hint">Žiadni hráči k dispozícii.</div>`;
                return;
            }
            roster.forEach((p, idx) => {
                const checked = idx < 4;
                const meta = `Rating ${p.rating.toFixed(1)} • Zápasy ${p.matches + p.dMatches}`;
                targetEl.insertAdjacentHTML('beforeend',
                    `<label class="lineup-player">
                        <div>
                            <div>${escapeHtml(p.name)}</div>
                            <div class="player-meta">${escapeHtml(meta)}</div>
                        </div>
                        <input type="checkbox" value="${escapeAttr(p.name)}" ${checked ? 'checked' : ''}>
                    </label>`);
            });

            const applyLimitState = () => {
                const checked = targetEl.querySelectorAll('input[type="checkbox"]:checked');
                const disable = checked.length >= 4;
                targetEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    if (!cb.checked) cb.disabled = disable;
                });
            };

            if (!targetEl.dataset.boundLimit) {
                targetEl.addEventListener('change', (e) => {
                    const cb = e.target;
                    if (!(cb instanceof HTMLInputElement) || cb.type !== 'checkbox') return;
                    const checked = targetEl.querySelectorAll('input[type="checkbox"]:checked');
                    if (checked.length > 4) {
                        cb.checked = false;
                        if (teamStatus) teamStatus.innerText = 'Maximálne 4 hráči na tím.';
                    } else if (checked.length >= 3) {
                        if (teamStatus) teamStatus.innerText = '';
                    }
                    applyLimitState();
                });
                targetEl.dataset.boundLimit = '1';
            }
            applyLimitState();
        };

        const collectLineup = (teamName, targetEl) => {
            const roster = teamMap.get(teamName) || [];
            const fallback = roster.slice(0, 4).map(p => p.name);
            const selectedNames = Array.from(targetEl?.querySelectorAll('input[type="checkbox"]:checked') || []).map(el => el.value);
            const namesRaw = selectedNames.length > 0 ? selectedNames : fallback;
            const names = namesRaw.slice(0, 4);
            const chosen = roster.filter(p => names.includes(p.name)).slice(0, 4);
            const hasWO = chosen.length === 3;
            return { names, players: chosen.length ? chosen : roster.slice(0, 4), hasWO };
        };

        const setTeamStatus = (msg) => {
            if (teamStatus) teamStatus.innerText = msg || '';
        };

        const renderTeamPrediction = () => {
            const tA = teamName; // Always use the current team
            const tB = teamSelectB.value;
            if (!tA || !tB) {
                setTeamStatus('Vyberte hosťujúci tím.');
                return;
            }
            if (tA === tB) {
                setTeamStatus('Zvoľte rozdielny tím.');
                return;
            }
            setTeamStatus('');

            // Send GA4 event for team prediction
            if (typeof gtag !== 'undefined') {
                gtag('event', 'prediction_team', {
                    teamA: tA,
                    teamB: tB,
                    source: 'myTeam'
                });
            }

            const lineupSelA = collectLineup(tA, lineupA);
            const lineupSelB = collectLineup(tB, lineupB);
            const rosterA = lineupSelA.players;
            const rosterB = lineupSelB.players;

            if (rosterA.length < 3 || rosterB.length < 3) {
                setTeamStatus('Vyberte aspoň 3 hráčov v oboch tímoch (max 4).');
                return;
            }

            const avgA = avgRating(rosterA);
            const avgB = avgRating(rosterB);

            let sA = Math.round(18 * winProb(avgA, avgB));
            let sB = Math.max(0, 18 - sA);

            if (lineupSelA.hasWO) sB += 5;
            if (lineupSelB.hasWO) sA += 5;
            if ((sA + sB) > 18) {
                const scale = 18 / (sA + sB);
                sA = Math.round(sA * scale);
                sB = Math.max(0, 18 - sA);
            }

            sA = Math.min(18, Math.max(0, sA));
            sB = Math.min(18, Math.max(0, sB));

            if (teamPredScore) teamPredScore.innerText = `${sA} : ${sB}`;
            if (teamRateA) teamRateA.innerText = avgA.toFixed(1);
            if (teamRateB) teamRateB.innerText = avgB.toFixed(1);
            if (teamPredictionResult) teamPredictionResult.style.display = 'block';
        };

        populateTeams(teamSelectB);

        // Initially hide the lineup wrapper
        if (lineupWrapper) {
            lineupWrapper.style.display = 'none';
        }

        // Display the current team (not selectable)
        if (teamName && teamDisplayA) {
            teamDisplayA.textContent = teamName;
            renderLineup(teamName, lineupA, lineupTitleA);
            setTeamLogo(teamName, teamLogoA);
        }

        teamSelectB.addEventListener('change', () => {
            const selectedTeamB = teamSelectB.value;
            if (selectedTeamB) {
                // Show lineup wrapper when team B is selected
                if (lineupWrapper) {
                    lineupWrapper.style.display = '';
                }
                renderLineup(selectedTeamB, lineupB, lineupTitleB);
                setTeamLogo(selectedTeamB, teamLogoB);
            } else {
                // Hide lineup wrapper when team B is cleared
                if (lineupWrapper) {
                    lineupWrapper.style.display = 'none';
                }
                if (lineupB) lineupB.innerHTML = '';
                if (lineupTitleB) lineupTitleB.textContent = lineupTitleB.dataset.defaultTitle || 'Zostava hostia';
                if (teamLogoB) teamLogoB.innerHTML = '';
            }
        });
        if (teamPredictBtn) teamPredictBtn.addEventListener('click', (e) => {
            e.preventDefault();
            renderTeamPrediction();
        });
    };

    // Main render function for selected team
    const renderTeamStats = (teamName) => {
        currentTeam = teamName;
        localStorage.setItem(MYTEAM_STORAGE_KEY, teamName);
        updateURLWithTeam(teamName);

        // Send GA4 event
        if (typeof gtag !== 'undefined') {
            gtag('event', 'view_team', { team: teamName });
        }

        const teamPlayers = teamMap.get(teamName) || [];
        const sortedPlayers = sortRoster(teamPlayers);

        // Header
        document.getElementById('myTeamName').textContent = teamName;
        const logoEl = document.getElementById('myTeamLogoImg');
        const logoContainer = document.getElementById('myTeamLogo');
        const logoSrc = getTeamLogoSrc(teamName);
        if (logoEl && logoContainer) {
            if (logoSrc) {
                // Show logo image
                logoEl.src = logoSrc;
                logoEl.style.display = 'block';
                logoEl.style.width = '100%';
                logoEl.style.height = '100%';
                logoEl.style.objectFit = 'contain';
                logoEl.style.borderRadius = '50%';
                // Remove only text nodes (preserve img element)
                Array.from(logoContainer.childNodes).forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        node.remove();
                    }
                });
                logoContainer.style.background = 'white';
            } else {
                // No logo - show first letter
                logoEl.style.display = 'none';
                // Remove only text nodes first
                Array.from(logoContainer.childNodes).forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        node.remove();
                    }
                });
                logoContainer.textContent = teamName.charAt(0).toUpperCase();
            }
        }

        // Core stats
        const activeRating = getActiveRating(sortedPlayers);
        const overallRating = getOverallRating(teamPlayers);
        document.getElementById('myTeamActiveRating').textContent = activeRating.toFixed(2);
        document.getElementById('myTeamOverallRating').textContent = overallRating.toFixed(2);

        // Record (colored)
        const record = getTeamRecord(teamName);
        const recordEl = document.getElementById('myTeamRecord');
        if (recordEl) {
            recordEl.innerHTML = `<span class="record-win">${record.wins}V</span>-<span class="record-draw">${record.draws}R</span>-<span class="record-loss">${record.losses}P</span>`;
        }

        // Form
        const form = getTeamForm(teamName);
        const formContainer = document.getElementById('myTeamForm');
        formContainer.innerHTML = '';
        form.forEach(result => {
            const indicator = document.createElement('div');
            indicator.className = `form-indicator ${result === 'W' ? 'win' : (result === 'L' ? 'loss' : 'draw')}`;
            indicator.textContent = result;
            formContainer.appendChild(indicator);
        });
        if (form.length === 0) {
            formContainer.innerHTML = '<span style="color: var(--color-muted);">Žiadne zápasy</span>';
        }

        // Populate compare select (exclude current team)
        populateCompareSelect(teamName);

        // Render sections
        renderPlayersList(teamPlayers);
        // Defer chart render slightly to allow layout to settle (fixes zero-size canvas on reload with ?team=)
        setTimeout(() => {
            const compareTeamPlayers = currentCompareTeam ? (teamMap.get(currentCompareTeam) || []) : null;
            renderTeamRatingChart(teamName, teamPlayers, currentCompareTeam, compareTeamPlayers);
        }, 80);
        renderUpcomingMatches(teamName);
        renderRecentMatches(teamName);
        initTeamPrediction(teamName);
    };

    // Event handlers
    if (selectBtn) {
        selectBtn.addEventListener('click', () => {
            const teamName = teamInput.value.trim();
            if (!teamName) {
                if (selectStatus) selectStatus.textContent = 'Prosím, vyberte tím.';
                return;
            }
            const team = teamNames.find(t => t.toLowerCase() === teamName.toLowerCase());
            if (!team) {
                if (selectStatus) selectStatus.textContent = 'Tím nebol nájdený.';
                return;
            }
            if (selectStatus) selectStatus.textContent = '';
            renderTeamStats(team);
            showStatsScreen();
        });
    }

    if (changeTeamBtn) {
        changeTeamBtn.addEventListener('click', () => {
            showSelectScreen();
            if (teamInput) teamInput.value = '';
        });
    }

    // Compare functionality
    const compareForm = document.getElementById('myTeamCompareForm');
    const compareSelect = document.getElementById('myTeamCompareInput');
    const clearCompareBtn = document.getElementById('myTeamClearCompareBtn');
    const compareStatus = document.getElementById('myTeamCompareStatus');

    // Function to populate compare select (excludes current team)
    const populateCompareSelect = (currentTeamName) => {
        if (!compareSelect) return;
        compareSelect.innerHTML = '<option value="">Vyberte tím na porovnanie</option>';
        teamNames.forEach(t => {
            if (t === currentTeamName) return; // Don't include current team
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            compareSelect.appendChild(opt);
        });
    };

    if (compareForm) {
        compareForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!currentTeam || !compareSelect) return;

            const teamName = compareSelect.value;
            if (!teamName) {
                if (compareStatus) compareStatus.textContent = 'Vyberte tím na porovnanie.';
                return;
            }

            if (teamName === currentTeam) {
                if (compareStatus) compareStatus.textContent = 'Nemôžete porovnať tím so sebou samým.';
                return;
            }

            // Send GA4 event for team comparison
            if (typeof gtag !== 'undefined') {
                gtag('event', 'compare_teams', {
                    teamA: currentTeam,
                    teamB: teamName
                });
            }

            currentCompareTeam = teamName;
            if (compareStatus) {
                compareStatus.textContent = `Porovnávanie s ${teamName}`;
                compareStatus.classList.add('ok');
            }

            // Re-render chart with comparison
            const teamPlayers = teamMap.get(currentTeam) || [];
            const compareTeamPlayers = teamMap.get(currentCompareTeam) || [];
            setTimeout(() => {
                renderTeamRatingChart(currentTeam, teamPlayers, currentCompareTeam, compareTeamPlayers);
            }, 80);
        });
    }

    if (clearCompareBtn) {
        clearCompareBtn.addEventListener('click', () => {
            currentCompareTeam = null;
            if (compareSelect) compareSelect.value = '';
            if (compareStatus) {
                compareStatus.textContent = '';
                compareStatus.classList.remove('ok');
            }

            // Re-render chart without comparison
            if (currentTeam) {
                const teamPlayers = teamMap.get(currentTeam) || [];
                setTimeout(() => {
                    renderTeamRatingChart(currentTeam, teamPlayers);
                }, 80);
            }
        });
    }

    // Initialize: Check URL param first, then localStorage (team), then localStorage (player's team)
    const urlTeamName = getTeamFromURL();
    const savedTeamName = localStorage.getItem(MYTEAM_STORAGE_KEY);
    const savedPlayerName = localStorage.getItem(MYSTATS_STORAGE_KEY);

    let teamNameToLoad = null;

    if (urlTeamName) {
        // URL has team name
        const team = teamNames.find(t => t.toLowerCase() === urlTeamName.toLowerCase());
        if (team) {
            teamNameToLoad = team;
            // Update localStorage if it differs from URL
            if (savedTeamName !== team) {
                localStorage.setItem(MYTEAM_STORAGE_KEY, team);
            }
        } else {
            // URL has invalid team name, clear it
            updateURLWithTeam(null);
        }
    } else if (savedTeamName) {
        // No URL param but localStorage has a team, use it and update URL
        const team = teamNames.find(t => t.toLowerCase() === savedTeamName.toLowerCase());
        if (team) {
            teamNameToLoad = team;
            updateURLWithTeam(team);
        }
    } else if (savedPlayerName) {
        // No URL param and no saved team, but localStorage has a player, use that player's team
        const player = playerArr.find(p => normalizePlayerKey(p.name) === normalizePlayerKey(savedPlayerName));
        if (player && player.team && player.team !== 'N/A' && teamMap.has(player.team)) {
            teamNameToLoad = player.team;
            localStorage.setItem(MYTEAM_STORAGE_KEY, player.team);
            updateURLWithTeam(player.team);
        }
    }

    // Load the team if we found one
    if (teamNameToLoad) {
        renderTeamStats(teamNameToLoad);
        showStatsScreen();
    } else {
        showSelectScreen();
    }
}

// ============================================================
// NAVIGATION RENDERER
// ============================================================
function renderNavigation() {
    const navContainer = document.getElementById('mainNavContainer');
    if (!navContainer) return;

    // Get current page filename (e.g., "rating.html")
    const path = window.location.pathname;
    const page = path.split("/").pop() || "index.html";

    const applySeasonalNavBadge = () => {
        const badge = document.getElementById('navBadge');
        if (!badge) return;

        const now = new Date();
        const m = now.getMonth(); // 0=Jan .. 11=Dec
        const d = now.getDate();

        // Enable during December and the first week of January.
        const isXmasSeason = (m === 11) || (m === 0 && d <= 7);
        if (isXmasSeason) badge.classList.add('nav-badge--xmas');
    };

    // Fetch and update nav badge text from Google Sheets (Config!B2)
    const loadNavBadgeFromSheet = async () => {
        if (typeof GoogleSheetsLoader === 'undefined') {
            console.warn('GoogleSheetsLoader not available, keeping static nav badge.');
            return;
        }
        try {
            const badgeText = await GoogleSheetsLoader.fetchCell({
                sheetName: 'Config',
                cell: 'B2',
                cache: false
            });
            if (badgeText) {
                const badge = document.getElementById('navBadge');
                if (badge) {
                    badge.innerHTML = badgeText;
                }
            }
        } catch (e) {
            console.error('Failed to load nav badge from sheet:', e);
        }
    };

    // Define links
    const links = [
        { url: 'results.html', text: 'Výsledky' },
        { url: 'table.html', text: 'Tabuľka' },
        { url: 'rating.html', text: 'Rating' },
        { url: 'prediction.html', text: 'Predikcia' },
        { url: 'mystats.html', text: 'Moje Štatistiky' },
        { url: 'myteam.html', text: 'Môj Tím' },
    ];

    // Mobile menu includes Home as first item
    const mobileLinks = [
        { url: 'index.html', text: 'Domov' },
        ...links
    ];

    // Build the "Active" class string logic
    const getLinkHtml = (link) => {
        const isActive = page === link.url;
        return `<a href="${link.url}" ${isActive ? 'class="active"' : ''}>${link.text}</a>`;
    };

    // Build mobile menu links with stagger animation classes
    const getMobileLinkHtml = (link, index) => {
        const isActive = page === link.url;
        return `<a href="${link.url}" class="mobile-nav-link${isActive ? ' active' : ''}" style="--stagger-index: ${index}">${link.text}</a>`;
    };

    // Note: The H1 tag is used for SEO (as discussed previously)
    navContainer.innerHTML = `
    <nav class="top-nav" id="mainNav">
        <!-- Hamburger menu button (mobile only) -->
        <button class="hamburger-btn" id="hamburgerBtn" aria-label="Open menu" aria-expanded="false">
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
        </button>
        <h1 class="nav-title">
            <a href="index.html">Košická Miniliga</a>
        </h1>
        <div class="nav-badge" id="navBadge">Aktualizované:<br>22.12.2025</div>
        <!-- Desktop nav links -->
        <div class="nav-links">
            ${links.map(getLinkHtml).join('')}
        </div>
    </nav>
    <!-- Mobile sidebar menu -->
    <div class="mobile-nav-overlay" id="mobileNavOverlay"></div>
    <aside class="mobile-nav-sidebar" id="mobileNavSidebar">
        <div class="mobile-nav-links">
            ${mobileLinks.map(getMobileLinkHtml).join('')}
        </div>
    </aside>`;
    
    applySeasonalNavBadge();
    loadNavBadgeFromSheet(); // Load dynamic badge text from Google Sheets
    initMobileNav();
    if (typeof updateLayout === 'function') updateLayout();
}

// Mobile navigation functionality
function initMobileNav() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const overlay = document.getElementById('mobileNavOverlay');
    const sidebar = document.getElementById('mobileNavSidebar');
    
    if (!hamburgerBtn || !overlay || !sidebar) return;

    const openMenu = () => {
        sidebar.classList.add('open');
        overlay.classList.add('open');
        hamburgerBtn.classList.add('open');
        hamburgerBtn.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    };

    const closeMenu = () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        hamburgerBtn.classList.remove('open');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    };

    hamburgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (sidebar.classList.contains('open')) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    // Close on overlay click
    overlay.addEventListener('click', closeMenu);

    // Close on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            closeMenu();
        }
    });
}

// Add this to your existing window load event
window.addEventListener('load', renderNavigation);

// Set current year in footer
document.addEventListener('DOMContentLoaded', () => {
    const yearElement = document.getElementById('currentYear');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    const id = document.body.id;

    // matchResults is now loaded asynchronously (from data/matches.json + optional Google Sheet)
    try {
        if (window.matchResultsPromise) await window.matchResultsPromise;
    } catch (e) {
        console.error('Failed to load match data:', e);
    }

    requestAnimationFrame(() => {
        if (id === 'page-rating') renderRatingPage();
        else if (id === 'page-home') renderHomePage();
        else if (id === 'page-results') renderResultsPage();
        else if (id === 'page-table') renderTablePage();
        else if (id === 'page-prediction') renderPredictionPage();
        else if (id === 'page-mystats') renderMyStatsPage();
        else if (id === 'page-myteam') renderMyTeamPage();
        hideLoader();
    });
});

function hideLoader() {
    document.body.classList.remove('loading');
    document.getElementById('pageLoader')?.classList.add('hidden');
    // When `body.loading` is removed, `#pageContent` becomes visible.
    // Recompute header offset at that moment (nav height was 0 while hidden).
    requestAnimationFrame(() => {
        if (typeof updateLayout === 'function') updateLayout();
    });
}
