const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTrade, updateTradeStatus, setTradeReviewStarted, addTradeVote, getTradeVoteCount, getTeamLink } = require('../database/index.js');
const { isCommissioner, isBotOwner } = require('../utils/permissions.js');
const { logEvent } = require('../services/leagueHistory');
const { getConfiguredChannelId } = require('../utils/config.js');
const { resolveTradeReview } = require('../services/tradeReview.js');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (!interaction.isButton()) return;

		const isAccept = interaction.customId.startsWith('accept_trade_');
		const isReject = interaction.customId.startsWith('reject_trade_');
		const isApprove = interaction.customId.startsWith('approve_trade_');
		const isDeny = interaction.customId.startsWith('deny_trade_');
		const isVeto = interaction.customId.startsWith('veto_trade_');

		if (!isAccept && !isReject && !isApprove && !isDeny && !isVeto) return;

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
				setTradeReviewStarted(tradeId);
				const acceptedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
					.setDescription('✅ Accepted — entering trade review window');
				
				await interaction.update({ embeds: [acceptedEmbed], components: [] });

				const reviewChannelId = getConfiguredChannelId('trade_review');
				const reviewChannel = await interaction.client.channels.fetch(reviewChannelId).catch(() => null);
				
				if (reviewChannel) {
					const threshold = parseInt(process.env.TRADE_VETO_THRESHOLD) || 3;
					const reviewEmbed = EmbedBuilder.from(interaction.message.embeds[0])
						.setTitle('Trade Under Review')
						.setFooter({ text: `Trade ID: ${tradeId}` });
					
					const reviewRow = new ActionRowBuilder()
						.addComponents(
							new ButtonBuilder()
								.setCustomId(`veto_trade_${tradeId}`)
								.setLabel(`🚫 Vote to Veto (0/${threshold})`)
								.setStyle(ButtonStyle.Secondary),
						);

					const reviewMsg = await reviewChannel.send({ embeds: [reviewEmbed], components: [reviewRow] });
					
					const reviewHours = parseInt(process.env.TRADE_REVIEW_HOURS) || 24;
					setTimeout(() => resolveTradeReview(tradeId, interaction.client, reviewMsg), reviewHours * 60 * 60 * 1000);
				}
			} else {
				updateTradeStatus(tradeId, 'rejected');
				const rejectedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
					.setDescription('❌ Rejected by the other team');
				await interaction.update({ embeds: [rejectedEmbed], components: [] });
			}
		}

		// Handle Veto Button
		if (isVeto) {
			const teamLink = getTeamLink(interaction.user.id);
			if (!teamLink && !isBotOwner(interaction.user.id)) {
				return interaction.reply({ content: "Only claimed team owners can vote to veto trades.", ephemeral: true });
			}

			if (interaction.user.id === trade.proposer_discord_id || interaction.user.id === trade.recipient_discord_id) {
				return interaction.reply({ content: "You cannot vote to veto your own trade.", ephemeral: true });
			}

			const added = addTradeVote(tradeId, interaction.user.id);
			if (!added) {
				return interaction.reply({ content: "You've already voted on this trade.", ephemeral: true });
			}

			const count = getTradeVoteCount(tradeId);
			const threshold = parseInt(process.env.TRADE_VETO_THRESHOLD) || 3;

			if (count >= threshold) {
				await interaction.deferUpdate();
				await resolveTradeReview(tradeId, interaction.client, interaction.message);
			} else {
				const row = ActionRowBuilder.from(interaction.message.components[0]);
				row.components[0].setLabel(`🚫 Vote to Veto (${count}/${threshold})`);
				await interaction.update({ components: [row] });
			}
		}

		// Handle Approve/Deny (Commissioners only)
		if (isApprove || isDeny) {
			if (!isCommissioner(interaction.member)) {
				return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
			}

			if (isApprove) {
				updateTradeStatus(tradeId, 'approved');
				
				const originalEmbed = interaction.message.embeds[0];
				const proposerTeam = originalEmbed.fields.find(f => f.name === 'From') || { value: 'Unknown' };
				const recipientTeam = originalEmbed.fields.find(f => f.name === 'To') || { value: 'Unknown' };
				const assets = originalEmbed.description;

				logEvent(interaction.client, 'trade_approved', {
					proposerTeam: proposerTeam.value,
					recipientTeam: recipientTeam.value,
					assets: assets
				});

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
