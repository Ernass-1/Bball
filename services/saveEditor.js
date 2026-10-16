const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ACTIVE_SAVE_PATH = path.join(__dirname, '..', 'data', 'active_save.json');

function ensureDirectoryExists(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

function getActiveSavePath() {
    return ACTIVE_SAVE_PATH;
}

function hasActiveSave() {
    return fs.existsSync(ACTIVE_SAVE_PATH);
}

function decompressIfNeeded(buffer) {
    // Check for gzip magic number: 0x1f 0x8b
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
        try {
            return zlib.gunzipSync(buffer);
        } catch (error) {
            throw new Error("File looked gzip-compressed but failed to decompress — it may be corrupted.");
        }
    }
    // Check for zip magic number: 0x50 0x4b 0x03 0x04
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
        try {
            let offset = 0;
            let targetEntry = null;
            let firstEntry = null;

            while (offset < buffer.length - 4) {
                const signature = buffer.readUInt32LE(offset);
                if (signature !== 0x04034b50) break; // Not a local file header anymore

                if (offset + 30 > buffer.length) break;
                const compressionMethod = buffer.readUInt16LE(offset + 8);
                const compressedSize = buffer.readUInt32LE(offset + 18);
                const fileNameLength = buffer.readUInt16LE(offset + 26);
                const extraFieldLength = buffer.readUInt16LE(offset + 28);

                const fileNameOffset = offset + 30;
                const dataOffset = fileNameOffset + fileNameLength + extraFieldLength;

                if (dataOffset + compressedSize > buffer.length) break;

                const fileName = buffer.toString('utf8', fileNameOffset, fileNameOffset + fileNameLength);
                const entry = {
                    compressionMethod,
                    compressedSize,
                    dataOffset,
                    fileName
                };

                if (!firstEntry) firstEntry = entry;
                if (fileName.toLowerCase().endsWith('.json')) {
                    targetEntry = entry;
                    break;
                }

                offset = dataOffset + compressedSize;
            }

            const chosen = targetEntry || firstEntry;
            if (!chosen) {
                throw new Error("No valid files found inside zip archive.");
            }

            const compressedData = buffer.subarray(chosen.dataOffset, chosen.dataOffset + chosen.compressedSize);

            if (chosen.compressionMethod === 0) {
                return compressedData;
            } else if (chosen.compressionMethod === 8) {
                return zlib.inflateRawSync(compressedData);
            } else {
                throw new Error(`Unsupported zip compression method: ${chosen.compressionMethod}`);
            }
        } catch (error) {
            throw new Error(`File looked zip-compressed but failed to decompress: ${error.message}`);
        }
    }
    return buffer;
}

function validateAndStoreSave(rawBuffer) {
    const decompressed = decompressIfNeeded(rawBuffer);
    let save;
    try {
        save = JSON.parse(decompressed.toString('utf8'));
    } catch (error) {
        throw new Error("Invalid JSON in save file.");
    }

    if (!save.teams || !Array.isArray(save.teams) || !save.players || !Array.isArray(save.players)) {
        throw new Error("Invalid BBGM save format: Missing teams or players arrays.");
    }

    saveSaveFile(save, ACTIVE_SAVE_PATH);

    return {
        teamCount: save.teams.length,
        playerCount: save.players.length
    };
}

function loadSaveFile(path) {
    try {
        const data = fs.readFileSync(path, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`File not found: ${path}`);
        }
        if (error instanceof SyntaxError) {
            throw new Error(`Invalid JSON in save file: ${path}`);
        }
        throw error;
    }
}

function getTeam(save, teamId) {
    if (!save.teams) return null;
    return save.teams.find(t => t.tid === teamId) || null;
}

function getPlayer(save, playerId) {
    if (!save.players) return null;
    return save.players.find(p => p.pid === playerId) || null;
}

/**
 * BBGM Save Structure Documentation (Issue #18):
 * - draftPicks: Array of objects { tid, originalTid, round, pick, season }.
 *   - 'tid' is the team that currently owns the pick.
 *   - 'round' and 'pick' are 1-indexed.
 * - Players: 
 *   - Draft prospects have tid === -2.
 *   - Draft year is stored in player.draft.year.
 *   - Ratings (rankings) are in player.ratings, which is an array. 
 *     The last entry is the most recent. We'll use 'ovr' for sorting prospects.
 */

function getDraftProspects(save, season) {
    if (!save.players) return [];

    return save.players
        .filter(p => p.tid === -2 && p.draft && p.draft.year === season)
        .sort((a, b) => {
            const getOvr = (p) => (p.ratings && p.ratings.length > 0) ? p.ratings[p.ratings.length - 1].ovr : 0;
            return getOvr(b) - getOvr(a);
        });
}

function getPickOrder(save, season) {
    if (!save.draftPicks) return [];

    return save.draftPicks
        .filter(p => p.season === season)
        .sort((a, b) => {
            if (a.round !== b.round) return a.round - b.round;
            return a.pick - b.pick;
        });
}

function draftPlayer(save, playerName, teamId, pickIndex, season) {
    if (!save.players) throw new Error("No players found in save file.");

    const player = save.players.find(p => 
        (p.firstName + " " + p.lastName === playerName) && 
        p.tid === -2 && 
        p.draft && p.draft.year === season
    );

    if (!player) {
        throw new Error(`Player '${playerName}' is not an available prospect for the ${season} draft.`);
    }

    // Rookie scale logic:
    // Top pick starts at $10M. Decreases by $250k per pick index. Minimum $1M.
    // This provides a simple documented linear scale for BBGM.
    const baseAmount = 10000; // BBGM amounts are usually in thousands ($10,000k = $10M)
    const step = 250;
    const minAmount = 1000;
    const amount = Math.max(minAmount, baseAmount - (pickIndex * step));

    player.tid = teamId;
    player.salaries = [
        {
            amount: amount,
            exp: season + 3 // 4-year rookie contract (current + 3)
        }
    ];

    return save;
}

function getPlayerSalary(save, playerName, teamId) {
    if (!save.players) return null;

    // BBGM stores salaries in an array 'salaries'. 
    // The current season's salary is the first entry in the array for the current year.
    // We use .amount from the first element as it represents the current year's cap hit.
    const player = save.players.find(p => p.firstName + " " + p.lastName === playerName && p.tid === teamId);
    
    if (!player || !player.salaries || player.salaries.length === 0) {
        return null;
    }

    return player.salaries[0].amount;
}

function getTotalOutgoingSalary(save, assets, teamId) {
    let totalSalary = 0;
    for (const asset of assets) {
        if (asset.asset_type === 'player') {
            const salary = getPlayerSalary(save, asset.player_name, teamId);
            if (salary === null) {
                throw new Error(`Could not find salary for player ${asset.player_name} on team ${teamId}.`);
            }
            totalSalary += salary;
        }
    }
    return totalSalary;
}

function validateTradeSalaries(save, proposerSalary, recipientSalary) {
    // Standard NBA-style rule: incoming <= outgoing * 1.25 + 100k
    // This check must be run independently for BOTH teams in the trade.
    
    const proposerMaxIncoming = proposerSalary * 1.25 + 100000;
    const recipientMaxIncoming = recipientSalary * 1.25 + 100000;

    if (recipientSalary > proposerMaxIncoming) {
        return { 
            legal: false, 
            reason: `Trade illegal: Proposer is taking back $${recipientSalary.toLocaleString()}, which exceeds their allowed limit of $${proposerMaxIncoming.toLocaleString()} (125% + $100k).` 
        };
    }

    if (proposerSalary > recipientMaxIncoming) {
        return { 
            legal: false, 
            reason: `Trade illegal: Recipient is taking back $${proposerSalary.toLocaleString()}, which exceeds their allowed limit of $${recipientMaxIncoming.toLocaleString()} (125% + $100k).` 
        };
    }

    return { legal: true };
}

function executeTradeAssets(save, proposerAssets, proposerTid, recipientAssets, recipientTid) {
    // 1. Validate all assets exist before mutating anything
    
    // Validate Proposer's assets
    for (const asset of proposerAssets) {
        if (asset.asset_type === 'player') {
            const player = save.players.find(p => p.firstName + " " + p.lastName === asset.player_name && p.tid === proposerTid);
            if (!player) throw new Error(`Player '${asset.player_name}' not found on proposer's team.`);
        } else if (asset.asset_type === 'pick') {
            const pick = save.draftPicks.find(p => p.season === asset.pick_season && p.round === asset.pick_round && p.tid === proposerTid);
            if (!pick) throw new Error(`Pick (Season ${asset.pick_season}, Round ${asset.pick_round}) not found owned by proposer's team.`);
        }
    }

    // Validate Recipient's assets
    for (const asset of recipientAssets) {
        if (asset.asset_type === 'player') {
            const player = save.players.find(p => p.firstName + " " + p.lastName === asset.player_name && p.tid === recipientTid);
            if (!player) throw new Error(`Player '${asset.player_name}' not found on recipient's team.`);
        } else if (asset.asset_type === 'pick') {
            const pick = save.draftPicks.find(p => p.season === asset.pick_season && p.round === asset.pick_round && p.tid === recipientTid);
            if (!pick) throw new Error(`Pick (Season ${asset.pick_season}, Round ${asset.pick_round}) not found owned by recipient's team.`);
        }
    }

    // 2. Apply mutations
    
    // Move Proposer's assets to Recipient
    for (const asset of proposerAssets) {
        if (asset.asset_type === 'player') {
            const player = save.players.find(p => p.firstName + " " + p.lastName === asset.player_name && p.tid === proposerTid);
            player.tid = recipientTid;
        } else if (asset.asset_type === 'pick') {
            const pick = save.draftPicks.find(p => p.season === asset.pick_season && p.round === asset.pick_round && p.tid === proposerTid);
            pick.tid = recipientTid;
        }
    }

    // Move Recipient's assets to Proposer
    for (const asset of recipientAssets) {
        if (asset.asset_type === 'player') {
            const player = save.players.find(p => p.firstName + " " + p.lastName === asset.player_name && p.tid === recipientTid);
            player.tid = proposerTid;
        } else if (asset.asset_type === 'pick') {
            const pick = save.draftPicks.find(p => p.season === asset.pick_season && p.round === asset.pick_round && p.tid === recipientTid);
            pick.tid = proposerTid;
        }
    }

    return save;
}

function swapPlayers(save, playerNameA, teamIdA, playerNameB, teamIdB) {
    if (!save.players) {
        throw new Error("No players found in save file.");
    }

    const playerA = save.players.find(p => p.firstName + " " + p.lastName === playerNameA && p.tid === teamIdA);
    const playerB = save.players.find(p => p.firstName + " " + p.lastName === playerNameB && p.tid === teamIdB);

    if (!playerA) {
        throw new Error(`Player '${playerNameA}' not found on the expected team.`);
    }
    if (!playerB) {
        throw new Error(`Player '${playerNameB}' not found on the expected team.`);
    }

    playerA.tid = teamIdB;
    playerB.tid = teamIdA;

    return save;
}

function resolveTeamId(save, input) {
    if (!save.teams || !Array.isArray(save.teams)) {
        throw new Error("No teams found in save file.");
    }

    const search = input.toString().trim().toLowerCase();

    // 1. Numeric ID match
    if (/^\d+$/.test(search)) {
        const tid = parseInt(search, 10);
        const team = save.teams.find(t => t.tid === tid);
        if (team) return tid;
    }

    // 2. Exact match against abbrev
    let matches = save.teams.filter(t => t.abbrev.toLowerCase() === search);
    if (matches.length === 1) return matches[0].tid;

    // 3. Exact match against name
    if (matches.length === 0) {
        matches = save.teams.filter(t => t.name.toLowerCase() === search);
    }
    if (matches.length === 1) return matches[0].tid;

    // 4. Exact match against region + name
    if (matches.length === 0) {
        matches = save.teams.filter(t => `${t.region} ${t.name}`.toLowerCase() === search);
    }
    if (matches.length === 1) return matches[0].tid;

    // 5. Substring match against region + name
    if (matches.length === 0) {
        matches = save.teams.filter(t => `${t.region} ${t.name}`.toLowerCase().includes(search));
    }

    if (matches.length === 1) {
        return matches[0].tid;
    } else if (matches.length === 0) {
        throw new Error(`No team found matching '${input}'.`);
    } else {
        const list = matches.map(t => `${t.region} ${t.name} (${t.abbrev})`).join(', ');
        throw new Error(`'${input}' matches multiple teams: ${list} — please be more specific.`);
    }
}

function saveSaveFile(save, path) {
    try {
        ensureDirectoryExists(path);
        const data = JSON.stringify(save);
        fs.writeFileSync(path, data, 'utf8');
    } catch (error) {
        throw new Error(`Failed to write save file: ${error.message}`);
    }
}

function getCurrentSeason(save) {
    return save.gameAttributes ? save.gameAttributes.season : null;
}

function getExpiringContracts(save, teamId) {
    const season = getCurrentSeason(save);
    if (!season) return [];

    if (!save.players) return [];

    return save.players
        .filter(p => p.tid === teamId && p.salaries && p.salaries.length > 0)
        .filter(p => p.salaries[0].exp === season)
        .map(p => ({
            name: `${p.firstName} ${p.lastName}`,
            pos: p.pos,
            amount: p.salaries[0].amount
        }));
}

function isRfaEligible(player) {
    // RFA eligibility logic:
    // Typically players with < 4 years of service are RFA.
    // We check if they are on a rookie contract (yearsWithTeam < 4).
    return player.yearsWithTeam < 4;
}

/**
 * Reads a value out of gameAttributes, which BBGM has stored in two shapes
 * depending on version: a plain object ({ season: 2024, ... }) or an array
 * of { key, value } records. Handles both.
 */
function getSeasonAttr(save, key) {
    if (!save.gameAttributes) return null;
    if (Array.isArray(save.gameAttributes)) {
        const entry = save.gameAttributes.find(a => a.key === key);
        return entry ? entry.value : null;
    }
    return save.gameAttributes[key] !== undefined ? save.gameAttributes[key] : null;
}

/**
 * Finds a player by name, tolerant of partial/case-insensitive input.
 * Mirrors the matching strategy used by resolveTeamId: exact match first,
 * then a unique substring match, throwing a helpful error on 0 or 2+ hits.
 */
function findPlayer(save, input) {
    if (!save.players || !Array.isArray(save.players)) {
        throw new Error("No players found in save file.");
    }

    const search = input.toString().trim().toLowerCase();
    const fullName = (p) => `${p.firstName} ${p.lastName}`;

    let matches = save.players.filter(p => fullName(p).toLowerCase() === search);
    if (matches.length === 1) return matches[0];

    if (matches.length === 0) {
        matches = save.players.filter(p => fullName(p).toLowerCase().includes(search));
    }

    if (matches.length === 1) {
        return matches[0];
    } else if (matches.length === 0) {
        throw new Error(`No player found matching '${input}'.`);
    } else {
        // Prefer players currently on a roster (tid >= 0) for disambiguation display,
        // but still list everyone that matched.
        const list = matches.slice(0, 10).map(p => {
            const team = getTeam(save, p.tid);
            const where = team ? `${team.abbrev}` : (p.tid === -1 ? 'FA' : p.tid === -2 ? 'Draft Prospect' : 'Retired');
            return `${fullName(p)} (${where})`;
        }).join(', ');
        throw new Error(`'${input}' matches multiple players: ${list}${matches.length > 10 ? ', ...' : ''} — please be more specific.`);
    }
}

/** Returns the most recent ratings entry for a player, or null. */
function getLatestRatings(player) {
    if (!player.ratings || player.ratings.length === 0) return null;
    return player.ratings[player.ratings.length - 1];
}

/** Returns the ratings entry for a given season, falling back to the latest available. */
function getRatingsForSeason(player, season) {
    if (!player.ratings || player.ratings.length === 0) return null;
    if (season === undefined || season === null) return getLatestRatings(player);
    return player.ratings.find(r => r.season === season) || getLatestRatings(player);
}

/**
 * A player's current salary/contract amount and expiration year, whichever
 * save format is in use (modern BBGM uses `contract`, this codebase's save
 * editor writes `salaries`). Returns { amount, exp } in thousands, or null.
 */
function getPlayerContract(player) {
    if (player.contract && typeof player.contract.amount === 'number') {
        return { amount: player.contract.amount, exp: player.contract.exp };
    }
    if (player.salaries && player.salaries.length > 0) {
        return { amount: player.salaries[0].amount, exp: player.salaries[0].exp };
    }
    return null;
}

/**
 * Aggregates a player's regular-season stat rows for a single season
 * (a player can have multiple rows in one season if they were traded).
 * Returns null if the player has no stats for that season.
 */
function getStatsForSeason(player, season, { playoffs = false } = {}) {
    if (!player.stats || player.stats.length === 0) return null;
    const rows = player.stats.filter(s => s.season === season && !!s.playoffs === playoffs);
    if (rows.length === 0) return null;
    return sumStatRows(rows);
}

/** Aggregates every regular-season stat row a player has ever recorded. */
function getCareerStats(player) {
    if (!player.stats || player.stats.length === 0) return null;
    const rows = player.stats.filter(s => !s.playoffs);
    if (rows.length === 0) return null;
    return sumStatRows(rows);
}

const COUNTING_STAT_KEYS = [
    'gp', 'gs', 'min', 'fg', 'fga', 'tp', 'tpa', 'ft', 'fta',
    'orb', 'drb', 'trb', 'ast', 'tov', 'stl', 'blk', 'pf', 'pts'
];

function sumStatRows(rows) {
    const totals = {};
    for (const key of COUNTING_STAT_KEYS) {
        totals[key] = rows.reduce((sum, row) => sum + (row[key] || 0), 0);
    }
    // Some BBGM versions store orb/drb but not trb directly.
    if (!totals.trb) {
        totals.trb = (totals.orb || 0) + (totals.drb || 0);
    }
    totals.seasons = [...new Set(rows.map(r => r.season))];
    return totals;
}

/** Formats a per-game rate from a totals object produced by sumStatRows. */
function perGame(totals, key) {
    if (!totals || !totals.gp) return '0.0';
    return (totals[key] / totals.gp).toFixed(1);
}

/** Formats a shooting percentage (0-100), or "—" if there were no attempts. */
function shootingPct(made, attempted) {
    if (!attempted) return '—';
    return `${((made / attempted) * 100).toFixed(1)}%`;
}

/** Converts BBGM's height-in-inches to a "6'8"" style string. */
function formatHeight(hgtInInches) {
    if (typeof hgtInInches !== 'number') return 'N/A';
    const feet = Math.floor(hgtInInches / 12);
    const inches = hgtInInches % 12;
    return `${feet}'${inches}"`;
}

/** Looks up a team's win-loss record for a given season from team.seasons[]. */
function getTeamRecord(team, season) {
    if (!team || !team.seasons || team.seasons.length === 0) return null;
    const entry = season !== undefined && season !== null
        ? team.seasons.find(s => s.season === season)
        : team.seasons[team.seasons.length - 1];
    if (!entry) return null;
    return { won: entry.won || 0, lost: entry.lost || 0, season: entry.season };
}

module.exports = {
    loadSaveFile,
    getTeam,
    getPlayer,
    swapPlayers,
    resolveTeamId,
    saveSaveFile,
    getActiveSavePath,
    hasActiveSave,
    getPlayerSalary,
    getTotalOutgoingSalary,
    validateTradeSalaries,
    executeTradeAssets,
    getDraftProspects,
    getPickOrder,
    draftPlayer,
    ensureDirectoryExists,
    validateAndStoreSave,
    getExpiringContracts,
    getCurrentSeason,
    isRfaEligible,
    getSeasonAttr,
    findPlayer,
    getLatestRatings,
    getRatingsForSeason,
    getPlayerContract,
    getStatsForSeason,
    getCareerStats,
    perGame,
    shootingPct,
    formatHeight,
    getTeamRecord
};
