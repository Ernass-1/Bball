const { getConfig } = require('../database/index');

function getConfiguredChannelId(purpose) {
    // purpose: 'commish' or 'draft'
    const dbKey = `channel:${purpose}`;
    const dbValue = getConfig(dbKey);
    if (dbValue) return dbValue;

    if (purpose === 'commish') return process.env.COMMISH_CHANNEL_ID;
    if (purpose === 'draft') return process.env.DRAFT_CHANNEL_ID;
    return null;
}

function getConfiguredRoleId(purpose) {
    // purpose: 'commissioner'
    const dbKey = `role:${purpose}`;
    const dbValue = getConfig(dbKey);
    if (dbValue) return dbValue;

    if (purpose === 'commissioner') return process.env.COMMISSIONER_ROLE_ID;
    return null;
}

module.exports = { getConfiguredChannelId, getConfiguredRoleId };
