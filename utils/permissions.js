function isBotOwner(discordId) {
    return process.env.BOT_OWNER_DISCORD_ID && discordId === process.env.BOT_OWNER_DISCORD_ID;
}

function isCommissioner(member) {
    return isBotOwner(member.id) || member.roles.cache.has(process.env.COMMISSIONER_ROLE_ID);
}

module.exports = { isBotOwner, isCommissioner };
