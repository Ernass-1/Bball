const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { hasActiveSave, loadSaveFile, getActiveSavePath, resolveTeamId, getTeam } = require('../services/saveEditor.js');
const { isTeamClaimed, upsertTeamRole, getRoleForTeam } = require('../database/index.js');
const { isCommissioner } = require('../utils/permissions.js');

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
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('list')
				.setDescription('List all teams in the league'))
		.addSubcommand(subcommand =>
			subcommand
				.setName('setuproles')
				.setDescription('Create Discord roles for all teams (Commissioner only)')),
	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'list') {
			if (!hasActiveSave()) {
				return interaction.reply({ content: "No active save file found.", ephemeral: true });
			}

			const save = loadSaveFile(getActiveSavePath());
			const teams = save.teams.sort((a, b) => (a.region + " " + a.name).localeCompare(b.region + " " + b.name));
			
			const embed = new EmbedBuilder()
				.setTitle('League Teams')
				.setColor(0x0099FF);

			let description = '';
			for (const team of teams) {
				description += `${team.region} ${team.name} — ${team.abbrev} — id: ${team.tid}\n`;
				if (description.length > 3800) { // Safety buffer for embed limit
					embed.setDescription(description);
					await interaction.reply({ embeds: [embed], ephemeral: true });
					return;
				}
			}
			embed.setDescription(description);
			return interaction.reply({ embeds: [embed], ephemeral: true });
		}

		if (subcommand === 'setuproles') {
			if (!isCommissioner(interaction.member)) {
				return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
			}
			if (!hasActiveSave()) {
				return interaction.reply({ content: "No active save file found.", ephemeral: true });
			}

			await interaction.deferReply();

			const save = loadSaveFile(getActiveSavePath());
			let created = 0;
			let existed = 0;
			let errors = 0;

			for (const team of save.teams) {
				try {
					const existingMapping = getRoleForTeam(team.tid);
					let role = null;

					if (existingMapping) {
						role = interaction.guild.roles.cache.get(existingMapping.role_id);
					}

					if (role) {
						existed++;
					} else {
						const newRole = await interaction.guild.roles.create({
							name: `${team.region} ${team.name}`,
							reason: `Auto-created for BBGM team ${team.tid}`
						});
						upsertTeamRole(team.tid, newRole.id);
						created++;
					}
				} catch (error) {
					console.error(`Failed to create role for team ${team.tid}:`, error);
					errors++;
				}
			}

			return interaction.editReply(`Setup complete. Created: ${created}, Already existed: ${existed}, Errors: ${errors}.`);
		}

		// Original claim logic
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

		const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
