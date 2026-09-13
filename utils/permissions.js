const { getConfiguredRoleId } = require('./config');

function isBotOwner(discordId) {
    return process.env.BOT_OWNER_DISCORD_ID && discordId === process.env.BOT_OWNER_DISCORD_ID;
}

function isCommissioner(member) {
    const commishRoleId = getConfiguredRoleId('commissioner');
    return isBotOwner(member.id) || (commishRoleId && member.roles.cache.has(commishRoleId));
}

module.exports = { isBotOwner, isCommissioner };
