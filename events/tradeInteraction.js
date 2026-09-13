const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTrade, updateTradeStatus } = require('../database/index.js');
const { isCommissioner, isBotOwner } = require('../utils/permissions.js');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (!interaction.isButton()) return;

		const isAccept = interaction.customId.startsWith('accept_trade_');
		const isReject = interaction.customId.startsWith('reject_trade_');
		const isApprove = interaction.customId.startsWith('approve_trade_');
		const isDeny = interaction.customId.startsWith('deny_trade_');

		if (!isAccept && !isReject && !isApprove && !isDeny) return;

		const tradeId = interaction.customId.split('_').pop();
		const trade = getTrade(tradeId);

		if (!trade) {
			return interaction.reply({ content: 'Trade not found.', ephemeral: true });
		}

		// Handle Accept/Reject (Recipient only)
		if (isAccept || isReject) {
			if (interaction.user.id !== trade.recipient_discord_id && !isBotOwner(interaction.user.id)) {
				return interaction.reply({ content: "This trade isn't for you to respond to.", ephemeral: true });
			}

			if (isAccept) {
				updateTradeStatus(tradeId, 'accepted');
				const acceptedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
					.setDescription('✅ Accepted — awaiting commissioner approval');
				
				await interaction.update({ embeds: [acceptedEmbed], components: [] });

				const commishChannelId = process.env.COMMISH_CHANNEL_ID;
				const commishChannel = interaction.client.channels.cache.get(commishChannelId);
				if (commishChannel) {
					const commishEmbed = EmbedBuilder.from(interaction.message.embeds[0])
						.setTitle('Trade Approval Required')
						.setDescription(`Trade accepted by <@${trade.recipient_discord_id}>`);
					
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
			} else {
				updateTradeStatus(tradeId, 'rejected');
				const rejectedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
					.setDescription('❌ Rejected by the other team');
				await interaction.update({ embeds: [rejectedEmbed], components: [] });
			}
		}

		// Handle Approve/Deny (Commissioners only)
		if (isApprove || isDeny) {
			if (!isCommissioner(interaction.member)) {
				return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
			}

			if (isApprove) {
				updateTradeStatus(tradeId, 'approved');
				const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
					.setDescription(`✅ Approved by ${interaction.user.tag}`);
				await interaction.update({ embeds: [approvedEmbed], components: [] });
			} else {
				updateTradeStatus(tradeId, 'denied');
				const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
					.setDescription(`❌ Denied by ${interaction.user.tag}`);
				await interaction.update({ embeds: [deniedEmbed], components: [] });
			}
		}
	},
};
