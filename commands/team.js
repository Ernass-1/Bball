const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isTeamClaimed } = require('../database/index.js');
const { hasActiveSave, loadSaveFile, getActiveSavePath, resolveTeamId, getTeam } = require('../services/saveEditor.js');

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
		const teamInput = interaction.options.getString('team_name');
		const discordId = interaction.user.id;

		if (!hasActiveSave()) {
			return interaction.reply({ content: "No active save file has been uploaded yet — ask your commissioner to run /save upload first.", ephemeral: true });
		}

		let teamId;
		let team;
		try {
			const save = loadSaveFile(getActiveSavePath());
			teamId = resolveTeamId(save, teamInput);
			team = getTeam(save, teamId);
		} catch (error) {
			return interaction.reply({ content: error.message, ephemeral: true });
		}

		if (isTeamClaimed(teamId)) {
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
				{ name: 'Team', value: `${team.region} ${team.name} (${team.abbrev})` },
				{ name: 'Date', value: new Date().toLocaleString() },
			)
			.setColor(0x0099FF);

		const row = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId(`approve_claim_${teamId}_${discordId}`)
					.setLabel('Approve GM')
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder()
					.setCustomId(`deny_claim_${teamId}_${discordId}`)
					.setLabel('Deny GM')
					.setStyle(ButtonStyle.Danger),
			);

		await channel.send({ embeds: [embed], components: [row] });

		await interaction.reply({ content: 'Your request has been submitted for approval.', ephemeral: true });
	},
};
