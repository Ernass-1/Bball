const { Events, EmbedBuilder } = require('discord.js');
const { linkTeamToUser, getRoleForTeam, getAllTeamRoles } = require('../database/index.js');
const { isCommissioner } = require('../utils/permissions.js');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (!interaction.isButton()) return;

		const isApprove = interaction.customId.startsWith('approve_claim_');
		const isDeny = interaction.customId.startsWith('deny_claim_');

		if (!isApprove && !isDeny) return;

		if (!isCommissioner(interaction.member)) {
			return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
		}

		const parts = interaction.customId.split('_');
		const requesterId = parts.pop();
		const teamId = parseInt(parts[2], 10);

		const originalEmbed = interaction.message.embeds[0];
		const updatedEmbed = EmbedBuilder.from(originalEmbed);

		if (isApprove) {
			linkTeamToUser(requesterId, teamId);
			updatedEmbed.setDescription(`✅ Approved by ${interaction.user.tag}`);
			
			// Handle Roles
			const roleMapping = getRoleForTeam(teamId);
			if (roleMapping) {
				try {
					const member = await interaction.guild.members.fetch(requesterId);
					const role = interaction.guild.roles.cache.get(roleMapping.role_id);

					if (role) {
						// Remove other team roles
						const allTeamRoles = getAllTeamRoles();
						for (const mapping of allTeamRoles) {
							if (member.roles.cache.has(mapping.role_id)) {
								await member.roles.remove(mapping.role_id);
							}
						}
						// Add new role
						await member.roles.add(role);
					}
				} catch (error) {
					console.error(`Failed to update roles for user ${requesterId}:`, error);
				}
			}
			
			try {
				const user = await interaction.client.users.fetch(requesterId);
				await user.send(`Your request to claim your team has been approved!`);
			} catch (error) {
				console.error(`Could not DM user ${requesterId}`);
			}
		} else {
			updatedEmbed.setDescription(`❌ Denied by ${interaction.user.tag}`);
			
			try {
				const user = await interaction.client.users.fetch(requesterId);
				await user.send(`Your request to claim your team has been denied.`);
			} catch (error) {
				console.error(`Could not DM user ${requesterId}`);
			}
		}

		await interaction.update({
			embeds: [updatedEmbed],
			components: []
		});
	},
};
