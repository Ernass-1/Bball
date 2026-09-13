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

  CREATE TABLE IF NOT EXISTS fa_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    team_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    amount_per_year INTEGER NOT NULL,
    years INTEGER NOT NULL,
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS draft_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    season INTEGER NOT NULL,
    current_pick_index INTEGER NOT NULL DEFAULT 0
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

function createFaOffer(discordId, teamId, playerName, amountPerYear, years) {
    const stmt = db.prepare('INSERT INTO fa_offers (discord_id, team_id, player_name, amount_per_year, years, status) VALUES (?, ?, ?, ?, ?, ?)');
    const info = stmt.run(discordId, teamId, playerName, amountPerYear, years, 'open');
    return info.lastInsertRowid;
}

function getOpenOffersForPlayer(playerName) {
    const stmt = db.prepare("SELECT * FROM fa_offers WHERE player_name = ? AND status = 'open' ORDER BY created_at DESC");
    return stmt.all(playerName);
}

function getFaOffer(offerId) {
    const stmt = db.prepare('SELECT * FROM fa_offers WHERE id = ?');
    return stmt.get(offerId);
}

function updateFaOfferStatus(offerId, status) {
    const stmt = db.prepare('UPDATE fa_offers SET status = ? WHERE id = ?');
    return stmt.run(status, offerId);
}

function closeOtherOffersForPlayer(playerName, exceptOfferId) {
    const stmt = db.prepare("UPDATE fa_offers SET status = 'rejected' WHERE player_name = ? AND id != ? AND status = 'open'");
    return stmt.run(playerName, exceptOfferId);
}

function getDraftState() {
    const stmt = db.prepare('SELECT * FROM draft_state WHERE id = 1');
    return stmt.get();
}

function setDraftState(season, currentPickIndex) {
    const stmt = db.prepare('INSERT OR REPLACE INTO draft_state (id, season, current_pick_index) VALUES (1, ?, ?)');
    return stmt.run(season, currentPickIndex);
}

function advancePick() {
    const stmt = db.prepare('UPDATE draft_state SET current_pick_index = current_pick_index + 1 WHERE id = 1');
    return stmt.run();
}

// Backup/Restore helpers
function getAllData() {
    return {
        team_links: db.prepare('SELECT * FROM team_links').all(),
        trades: db.prepare('SELECT * FROM trades').all(),
        fa_offers: db.prepare('SELECT * FROM fa_offers').all(),
        draft_state: db.prepare('SELECT * FROM draft_state').all()
    };
}

function clearAllTables() {
    db.prepare('DELETE FROM team_links').run();
    db.prepare('DELETE FROM trades').run();
    db.prepare('DELETE FROM fa_offers').run();
    db.prepare('DELETE FROM draft_state').run();
}

function importData(data) {
    const transaction = db.transaction((data) => {
        clearAllTables();
        
        const insertTeam = db.prepare('INSERT INTO team_links (discord_id, team_id) VALUES (?, ?)');
        for (const row of data.team_links) insertTeam.run(row.discord_id, row.team_id);

        const insertTrade = db.prepare('INSERT INTO trades (id, proposer_discord_id, proposer_player, recipient_discord_id, recipient_player, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.trades) insertTrade.run(row.id, row.proposer_discord_id, row.proposer_player, row.recipient_discord_id, row.recipient_player, row.status, row.created_at);

        const insertFa = db.prepare('INSERT INTO fa_offers (id, discord_id, team_id, player_name, amount_per_year, years, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.fa_offers) insertFa.run(row.id, row.discord_id, row.team_id, row.player_name, row.amount_per_year, row.years, row.status, row.created_at);

        const insertDraft = db.prepare('INSERT INTO draft_state (id, season, current_pick_index) VALUES (?, ?, ?)');
        for (const row of data.draft_state) insertDraft.run(row.id, row.season, row.current_pick_index);
    });
    transaction(data);
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
    updateTradeStatus,
    createFaOffer,
    getOpenOffersForPlayer,
    getFaOffer,
    updateFaOfferStatus,
    closeOtherOffersForPlayer,
    getDraftState,
    setDraftState,
    advancePick,
    getAllData,
    clearAllTables,
    importData
};
