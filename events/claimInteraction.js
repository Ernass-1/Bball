const { Events, EmbedBuilder } = require('discord.js');
const { linkTeamToUser } = require('../database/index.js');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (!interaction.isButton()) return;

		const isApprove = interaction.customId.startsWith('approve_claim_');
		const isDeny = interaction.customId.startsWith('deny_claim_');

		if (!isApprove && !isDeny) return;

		if (!interaction.member.roles.cache.has(process.env.COMMISSIONER_ROLE_ID)) {
			return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
		}

		const parts = interaction.customId.split('_');
		const requesterId = parts.pop();
		const teamName = parts.slice(2).join('_');

		const originalEmbed = interaction.message.embeds[0];
		const updatedEmbed = EmbedBuilder.from(originalEmbed);

		if (isApprove) {
			linkTeamToUser(requesterId, teamName);
			updatedEmbed.setDescription(`✅ Approved by ${interaction.user.tag}`);
			
			try {
				const user = await interaction.client.users.fetch(requesterId);
				await user.send(`Your request to claim **${teamName}** has been approved!`);
			} catch (error) {
				console.error(`Could not DM user ${requesterId}`);
			}
		} else {
			updatedEmbed.setDescription(`❌ Denied by ${interaction.user.tag}`);
			
			try {
				const user = await interaction.client.users.fetch(requesterId);
				await user.send(`Your request to claim **${teamName}** has been denied.`);
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
