const Database = require('better-sqlite3');
const path = require('node:path');

const db = new Database(path.join(__dirname, 'league.db'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS team_links (
    discord_id TEXT PRIMARY KEY,
    team_id INTEGER NOT NULL
  )
`);

function linkTeam(discordId, teamId) {
    const stmt = db.prepare('INSERT OR REPLACE INTO team_links (discord_id, team_id) VALUES (?, ?)');
    return stmt.run(discordId, teamId);
}

function getTeamLink(discordId) {
    const stmt = db.prepare('SELECT team_id FROM team_links WHERE discord_id = ?');
    return stmt.get(discordId);
}

function unlinkTeam(discordId) {
    const stmt = db.prepare('DELETE FROM team_links WHERE discord_id = ?');
    return stmt.run(discordId);
}

module.exports = {
    linkTeam,
    getTeamLink,
    unlinkTeam
};
