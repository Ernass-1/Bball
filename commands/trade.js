const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTeamLink, createTrade } = require('../database/index.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('trade')
		.setDescription('Trade management commands')
		.addSubcommand(subcommand =>
			subcommand
				.setName('propose')
				.setDescription('Propose a player-for-player trade')
				.addUserOption(option => option.setName('recipient').setDescription('The user you are trading with').setRequired(true))
				.addStringOption(option => option.setName('your_player').setDescription('The player you are sending').setRequired(true))
				.addStringOption(option => option.setName('their_player').setDescription('The player you are receiving').setRequired(true))),
	async execute(interaction) {
		if (interaction.options.getSubcommand() === 'propose') {
			const recipient = interaction.options.getUser('recipient');
			const yourPlayer = interaction.options.getString('your_player');
			const theirPlayer = interaction.options.getString('their_player');
			const proposerId = interaction.user.id;
			const recipientId = recipient.id;

			const proposerTeam = getTeamLink(proposerId);
			const recipientTeam = getTeamLink(recipientId);

			if (!proposerTeam) {
				return interaction.reply({ content: 'You must claim a team before proposing trades.', ephemeral: true });
			}
			if (!recipientTeam) {
				return interaction.reply({ content: 'The recipient does not have a claimed team.', ephemeral: true });
			}

			const tradeId = createTrade(proposerId, yourPlayer, recipientId, theirPlayer);

			const embed = new EmbedBuilder()
				.setTitle('Trade Proposal')
				.setColor(0x0099FF)
				.addFields(
					{ name: 'Proposer', value: `<@${proposerId}>`, inline: true },
					{ name: 'Sending', value: yourPlayer, inline: true },
					{ name: '\u200B', value: '\u200B', inline: true },
					{ name: 'Recipient', value: `<@${recipientId}>`, inline: true },
					{ name: 'Sending', value: theirPlayer, inline: true },
					{ name: '\u200B', value: '\u200B', inline: true },
				)
				.setFooter({ text: `Trade ID: ${tradeId}` });

			const row = new ActionRowBuilder()
				.addComponents(
					new ButtonBuilder()
						.setCustomId(`accept_trade_${tradeId}`)
						.setLabel('Accept Trade')
						.setStyle(ButtonStyle.Success),
					new ButtonBuilder()
						.setCustomId(`reject_trade_${tradeId}`)
						.setLabel('Reject Trade')
						.setStyle(ButtonStyle.Danger),
				);

			await interaction.reply({ content: `Trade proposal sent to <@${recipientId}>.`, ephemeral: true });
			await interaction.channel.send({
				content: `<@${recipientId}>, you have received a trade proposal!`,
				embeds: [embed],
				components: [row]
			});
		}
	},
};
