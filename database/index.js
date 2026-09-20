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
    recipient_discord_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trade_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id INTEGER NOT NULL,
    side TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    player_name TEXT,
    pick_season INTEGER,
    pick_round INTEGER,
    FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
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

  CREATE TABLE IF NOT EXISTS team_roles (
    team_id INTEGER PRIMARY KEY,
    role_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS team_channels (
    team_id INTEGER PRIMARY KEY,
    channel_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bot_config (
    config_key TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rfa_status (
    player_id INTEGER PRIMARY KEY,
    status TEXT NOT NULL
  );
`);

const TABLES = [
    'team_links', 'trades', 'trade_assets', 'fa_offers', 'draft_state',
    'team_roles', 'team_channels', 'bot_config', 'rfa_status'
];

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

function createTrade(proposerDiscordId, recipientDiscordId) {
    const stmt = db.prepare('INSERT INTO trades (proposer_discord_id, recipient_discord_id) VALUES (?, ?)');
    const info = stmt.run(proposerDiscordId, recipientDiscordId);
    return info.lastInsertRowid;
}

function addTradeAsset(tradeId, side, assetType, details) {
    const stmt = db.prepare('INSERT INTO trade_assets (trade_id, side, asset_type, player_name, pick_season, pick_round) VALUES (?, ?, ?, ?, ?, ?)');
    const playerName = assetType === 'player' ? details.playerName : null;
    const pickSeason = assetType === 'pick' ? details.season : null;
    const pickRound = assetType === 'pick' ? details.round : null;
    const info = stmt.run(tradeId, side, assetType, playerName, pickSeason, pickRound);
    return info.lastInsertRowid;
}

function getTradeAssets(tradeId) {
    const stmt = db.prepare('SELECT * FROM trade_assets WHERE trade_id = ?');
    const assets = stmt.all(tradeId);
    return {
        proposer: assets.filter(a => a.side === 'proposer'),
        recipient: assets.filter(a => a.side === 'recipient')
    };
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

function setPickStartedAt(timestamp) {
    const stmt = db.prepare("INSERT OR REPLACE INTO bot_config (config_key, config_value, updated_at) VALUES ('draft_pick_started_at', ?, CURRENT_TIMESTAMP)");
    return stmt.run(timestamp);
}

// Team Roles
function upsertTeamRole(teamId, roleId) {
    const stmt = db.prepare('INSERT OR REPLACE INTO team_roles (team_id, role_id) VALUES (?, ?)');
    return stmt.run(teamId, roleId);
}

function getRoleForTeam(teamId) {
    const stmt = db.prepare('SELECT role_id FROM team_roles WHERE team_id = ?');
    return stmt.get(teamId);
}

function getAllTeamRoles() {
    const stmt = db.prepare('SELECT * FROM team_roles');
    return stmt.all();
}

// Team Channels
function upsertTeamChannel(teamId, channelId) {
    const stmt = db.prepare('INSERT OR REPLACE INTO team_channels (team_id, channel_id) VALUES (?, ?)');
    return stmt.run(teamId, channelId);
}

function getChannelForTeam(teamId) {
    const stmt = db.prepare('SELECT channel_id FROM team_channels WHERE team_id = ?');
    return stmt.get(teamId);
}

function getAllTeamChannels() {
    const stmt = db.prepare('SELECT * FROM team_channels');
    return stmt.all();
}

// Config
function setConfig(key, value) {
    const stmt = db.prepare('INSERT OR REPLACE INTO bot_config (config_key, config_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
    return stmt.run(key, value);
}

function getConfig(key) {
    const stmt = db.prepare('SELECT config_value FROM bot_config WHERE config_key = ?');
    const row = stmt.get(key);
    return row ? row.config_value : null;
}

// RFA Status
function getRfaStatus(playerId) {
    const stmt = db.prepare('SELECT status FROM rfa_status WHERE player_id = ?');
    const row = stmt.get(playerId);
    return row ? row.status : 'not yet qualified';
}

function setRfaStatus(playerId, status) {
    const stmt = db.prepare('INSERT OR REPLACE INTO rfa_status (player_id, status) VALUES (?, ?)');
    return stmt.run(playerId, status);
}

// Backup/Restore helpers
function getAllData() {
    const data = {};
    for (const table of TABLES) {
        data[table] = db.prepare(`SELECT * FROM ${table}`).all();
    }
    return data;
}

function clearAllTables() {
    for (const table of TABLES) {
        db.prepare(`DELETE FROM ${table}`).run();
    }
}

function importData(data) {
    const transaction = db.transaction((data) => {
        clearAllTables();
        
        const insertTeam = db.prepare('INSERT INTO team_links (discord_id, team_id) VALUES (?, ?)');
        for (const row of data.team_links) insertTeam.run(row.discord_id, row.team_id);

        const insertTrade = db.prepare('INSERT INTO trades (id, proposer_discord_id, recipient_discord_id, status, created_at) VALUES (?, ?, ?, ?, ?)');
        for (const row of data.trades) insertTrade.run(row.id, row.proposer_discord_id, row.recipient_discord_id, row.status, row.created_at);

        if (data.trade_assets) {
            const insertAsset = db.prepare('INSERT INTO trade_assets (id, trade_id, side, asset_type, player_name, pick_season, pick_round) VALUES (?, ?, ?, ?, ?, ?, ?)');
            for (const row of data.trade_assets) insertAsset.run(row.id, row.trade_id, row.side, row.asset_type, row.player_name, row.pick_season, row.pick_round);
        }

        const insertFa = db.prepare('INSERT INTO fa_offers (id, discord_id, team_id, player_name, amount_per_year, years, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.fa_offers) insertFa.run(row.id, row.discord_id, row.team_id, row.player_name, row.amount_per_year, row.years, row.status, row.created_at);

        const insertDraft = db.prepare('INSERT INTO draft_state (id, season, current_pick_index) VALUES (?, ?)');
        for (const row of data.draft_state) insertDraft.run(row.id, row.season, row.current_pick_index);

        const insertRole = db.prepare('INSERT INTO team_roles (team_id, role_id) VALUES (?, ?)');
        for (const row of data.team_roles) insertRole.run(row.team_id, row.role_id);

        const insertChannel = db.prepare('INSERT INTO team_channels (team_id, channel_id, created_at) VALUES (?, ?, ?)');
        for (const row of data.team_channels) insertChannel.run(row.team_id, row.channel_id, row.created_at);

        const insertConfig = db.prepare('INSERT INTO bot_config (config_key, config_value, updated_at) VALUES (?, ?, ?)');
        for (const row of data.bot_config) insertConfig.run(row.config_key, row.config_value, row.updated_at);

        const insertRfa = db.prepare('INSERT INTO rfa_status (player_id, status) VALUES (?, ?)');
        for (const row of data.rfa_status) insertRfa.run(row.player_id, row.status);
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
    addTradeAsset,
    getTradeAssets,
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
    setPickStartedAt,
    upsertTeamRole,
    getRoleForTeam,
    getAllTeamRoles,
    upsertTeamChannel,
    getChannelForTeam,
    getAllTeamChannels,
    setConfig,
    getConfig,
    getRfaStatus,
    setRfaStatus,
    getAllData,
    clearAllTables,
    importData
};
