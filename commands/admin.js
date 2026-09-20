const { SlashCommandBuilder } = require('discord.js');
const { backupToGitHub } = require('../services/dataBackup');
const { isCommissioner } = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Administrator commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('backup')
                .setDescription('Force an immediate backup to GitHub')),
    async execute(interaction) {
        if (!isCommissioner(interaction.member)) {
            return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            backupToGitHub();
            await interaction.editReply('Backup completed successfully.');
        } catch (error) {
            console.error(error);
            await interaction.editReply('Backup failed. Check logs.');
        }
    }
};
