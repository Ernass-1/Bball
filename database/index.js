const Database = require('better-sqlite3');
const path = require('node:path');

const db = new Database(path.join(__dirname, 'league.db'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS team_links (
    discord_id TEXT PRIMARY KEY,
    team_id INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposer_discord_id TEXT NOT NULL,
    proposer_player TEXT NOT NULL,
    recipient_discord_id TEXT NOT NULL,
    recipient_player TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
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

function linkTeamToUser(discordId, teamId) {
    const stmt = db.prepare('INSERT OR REPLACE INTO team_links (discord_id, team_id) VALUES (?, ?)');
    return stmt.run(discordId, teamId);
}

function getTeamOwner(teamId) {
    const stmt = db.prepare('SELECT discord_id FROM team_links WHERE team_id = ?');
    return stmt.get(teamId);
}

function isTeamClaimed(teamId) {
    const stmt = db.prepare('SELECT 1 FROM team_links WHERE team_id = ?');
    return !!stmt.get(teamId);
}

function createTrade(proposerDiscordId, proposerPlayer, recipientDiscordId, recipientPlayer) {
    const stmt = db.prepare('INSERT INTO trades (proposer_discord_id, proposer_player, recipient_discord_id, recipient_player) VALUES (?, ?, ?, ?)');
    const info = stmt.run(proposerDiscordId, proposerPlayer, recipientDiscordId, recipientPlayer);
    return info.lastInsertRowid;
}

function getTrade(tradeId) {
    const stmt = db.prepare('SELECT * FROM trades WHERE id = ?');
    return stmt.get(tradeId);
}

function updateTradeStatus(tradeId, status) {
    const stmt = db.prepare('UPDATE trades SET status = ? WHERE id = ?');
    return stmt.run(status, tradeId);
}

module.exports = {
    linkTeam,
    getTeamLink,
    unlinkTeam,
    linkTeamToUser,
    getTeamOwner,
    isTeamClaimed,
    createTrade,
    getTrade,
    updateTradeStatus
};
