const fs = require('node:fs');
const path = require('node:path');

const ACTIVE_SAVE_PATH = path.join(__dirname, '..', 'data', 'active_save.json');

function getActiveSavePath() {
    return ACTIVE_SAVE_PATH;
}

function hasActiveSave() {
    return fs.existsSync(ACTIVE_SAVE_PATH);
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
    resolveTeamId,
    saveSaveFile,
    getActiveSavePath,
    hasActiveSave
};
