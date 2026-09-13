const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isTeamClaimed } = require('../database/index.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('team')
		.setDescription('Team management commands')
		.addSubcommand(subcommand =>
			subcommand
				.setName('claim')
				.setDescription('Claim a franchise')
				.addStringOption(option =>
					option.setName('team_name')
						.setDescription('The name of the team you want to claim')
						.setRequired(true))),
	async execute(interaction) {
		const teamName = interaction.options.getString('team_name');
		const discordId = interaction.user.id;

		if (isTeamClaimed(teamName)) {
			return interaction.reply({ content: 'That team is already claimed.', ephemeral: true });
		}

		const channelId = process.env.COMMISH_CHANNEL_ID;
		const channel = interaction.client.channels.cache.get(channelId);

		if (!channel) {
			return interaction.reply({ content: 'Commissioner channel not found. Please contact an admin.', ephemeral: true });
		}

		const embed = new EmbedBuilder()
			.setTitle('New Team Claim Request')
			.addFields(
				{ name: 'Requester', value: `<@${discordId}> (${interaction.user.tag})` },
				{ name: 'Team', value: teamName },
				{ name: 'Date', value: new Date().toLocaleString() },
			)
			.setColor(0x0099FF);

		const row = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId(`approve_claim_${teamName}_${discordId}`)
					.setLabel('Approve GM')
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder()
					.setCustomId(`deny_claim_${teamName}_${discordId}`)
					.setLabel('Deny GM')
					.setStyle(ButtonStyle.Danger),
			);

		await channel.send({ embeds: [embed], components: [row] });

		await interaction.reply({ content: 'Your request has been submitted for approval.', ephemeral: true });
	},
};
