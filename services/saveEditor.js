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
    validateTradeSalaries,
    getDraftProspects,
    getPickOrder,
    draftPlayer,
    ensureDirectoryExists,
    validateAndStoreSave
};
