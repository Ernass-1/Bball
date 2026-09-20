const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTrade, updateTradeStatus, getTradeVoteCount } = require('../database/index.js');
const { getConfiguredChannelId } = require('../utils/config.js');

async function resolveTradeReview(tradeId, client, reviewMessage) {
    const trade = getTrade(tradeId);
    if (!trade || trade.status !== 'in_review') return;

    const threshold = parseInt(process.env.TRADE_VETO_THRESHOLD) || 3;
    const voteCount = getTradeVoteCount(tradeId);

    if (voteCount >= threshold) {
        updateTradeStatus(tradeId, 'denied');
        if (reviewMessage) {
            const vetoedEmbed = EmbedBuilder.from(reviewMessage.embeds[0])
                .setDescription('❌ Vetoed by league vote');
            await reviewMessage.edit({ embeds: [vetoedEmbed], components: [] });
        }
    } else {
        if (reviewMessage) {
            const passedEmbed = EmbedBuilder.from(reviewMessage.embeds[0])
                .setDescription('✅ Review window passed — sent to commissioner for final approval.');
            await reviewMessage.edit({ embeds: [passedEmbed], components: [] });
        }

        const commishChannelId = getConfiguredChannelId('commish');
        const commishChannel = await client.channels.fetch(commishChannelId).catch(() => null);
        
        if (commishChannel) {
            const commishEmbed = EmbedBuilder.from(reviewMessage ? reviewMessage.embeds[0] : new EmbedBuilder())
                .setTitle('Trade Approval Required')
                .setDescription(`Trade accepted by <@${trade.recipient_discord_id}> and passed review.`);
            
            const commishRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_trade_${tradeId}`)
                        .setLabel('Approve Trade')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`deny_trade_${tradeId}`)
                        .setLabel('Deny Trade')
                        .setStyle(ButtonStyle.Danger),
                );

            await commishChannel.send({ embeds: [commishEmbed], components: [commishRow] });
        }
    }
}

module.exports = { resolveTradeReview };
