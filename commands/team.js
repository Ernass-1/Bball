const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { hasActiveSave, loadSaveFile, getActiveSavePath, resolveTeamId } = require('../services/saveEditor.js');
const { isTeamClaimed, upsertTeamRole, getRoleForTeam, upsertTeamChannel, getChannelForTeam } = require('../database/index.js');
const { isCommissioner } = require('../utils/permissions.js');
const { getConfiguredRoleId, getConfiguredChannelId } = require('../utils/config.js');

// Helper to get team from save data
function getTeam(save, teamId) {
    return save.teams.find(t => t.tid === teamId);
}

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
				.setDescription('Create Discord roles for all teams (Commissioner only)'))
		.addSubcommand(subcommand =>
			subcommand
				.setName('setupchannels')
				.setDescription('Create private Discord channels for all teams (Commissioner only)')),
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

		if (subcommand === 'setupchannels') {
			if (!isCommissioner(interaction.member)) {
				return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
			}
			if (!hasActiveSave()) {
				return interaction.reply({ content: "No active save file found.", ephemeral: true });
			}

			await interaction.deferReply();

			const save = loadSaveFile(getActiveSavePath());
			const commishRoleId = getConfiguredRoleId('commissioner');
			
			// 1. Get or create category
			const categoryName = 'Team Channels';
			let category = interaction.guild.channels.cache.find(c => c.name === categoryName && c.type === ChannelType.GuildCategory);
			
			if (!category) {
				category = await interaction.guild.channels.create({
					name: categoryName,
					type: ChannelType.GuildCategory,
				});
			}

			let createdCount = 0;
			let skippedCount = 0;
			let failedCount = 0;
			const summary = [];

			for (const team of save.teams) {
				const roleData = getRoleForTeam(team.tid);
				if (!roleData) {
					summary.push(`Skipped ${team.abbrev}: No role assigned.`);
					skippedCount++;
					continue;
				}

				// Check if channel already exists
				const existingChannelData = getChannelForTeam(team.tid);
				if (existingChannelData) {
					const existingChannel = interaction.guild.channels.cache.get(existingChannelData.channel_id);
					if (existingChannel) {
						summary.push(`Skipped ${team.abbrev}: Channel already exists.`);
						skippedCount++;
						continue;
					}
				}

				// Create channel
				try {
					const channel = await interaction.guild.channels.create({
						name: team.abbrev.toLowerCase(),
						type: ChannelType.GuildText,
						parent: category.id,
						permissionOverwrites: [
							{
								id: interaction.guild.id, // @everyone
								deny: [PermissionFlagsBits.ViewChannel],
							},
							{
								id: roleData.role_id, // Team role
								allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
							},
							{
								id: interaction.client.user.id, // Bot
								allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
							},
							...(commishRoleId ? [{
								id: commishRoleId,
								allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
							}] : []),
						],
					});

					upsertTeamChannel(team.tid, channel.id);
					createdCount++;
					summary.push(`Created ${team.abbrev}.`);
				} catch (error) {
					console.error(`Failed to create channel for ${team.abbrev}:`, error);
					failedCount++;
					summary.push(`Failed ${team.abbrev}: ${error.message}`);
				}
			}

			await interaction.editReply(`Setup complete.\nCreated: ${createdCount}, Skipped: ${skippedCount}, Failed: ${failedCount}\n\n${summary.join('\n')}`);
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

		const channelId = getConfiguredChannelId('commish');
		const channel = interaction.client.channels.cache.get(channelId);

		if (!channel) {
			return interaction.reply({ content: 'Commissioner channel not found. Please contact an admin.', ephemeral: true });
		}

		const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
