const { getChannelForTeam } = require('../database');

function getTeamChannel(client, teamId) {
    const channelData = getChannelForTeam(teamId);
    if (!channelData) return null;
    return client.channels.cache.get(channelData.channel_id) || null;
}

module.exports = { getTeamChannel };
