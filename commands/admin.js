const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { backupToGitHub } = require('../services/dataBackup');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('admin')
		.setDescription('Admin management commands')
		.addSubcommand(subcommand =>
			subcommand
				.setName('backup')
				.setDescription('Force a manual backup to GitHub')),
	async execute(interaction) {
		if (!interaction.member.roles.cache.has(process.env.COMMISSIONER_ROLE_ID)) {
			return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
		}

		try {
			await interaction.deferReply({ ephemeral: true });
			backupToGitHub();
			await interaction.editReply('Backup completed successfully.');
		} catch (error) {
			console.error(error);
			await interaction.editReply('Backup failed. Check logs.');
		}
	},
};
