const fs = require('node:fs');

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
    saveSaveFile
};
