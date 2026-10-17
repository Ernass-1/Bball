const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { hasActiveSave, loadSaveFile, getActiveSavePath } = require('../services/saveEditor');
const { getTeamOwner } = require('../database/index');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('teamlist')
        .setDescription('List all teams in the league and their owners'),
    async execute(interaction) {
        if (!hasActiveSave()) {
            return interaction.reply({ content: "No active save file found.", ephemeral: true });
        }

        const save = loadSaveFile(getActiveSavePath());
        const teams = save.teams.sort((a, b) => (a.region + " " + a.name).localeCompare(b.region + " " + b.name));

        const embed = new EmbedBuilder()
            .setTitle('🏀 League Teams & Owners')
            .setColor(0x0099FF);

        let description = '';
        for (const team of teams) {
            const owner = getTeamOwner(team.tid);
            const ownerStr = owner ? `<@${owner.discord_id}>` : '*Unclaimed*';
            description += `**${team.region} ${team.name}** (${team.abbrev}) — ID: \`${team.tid}\` — Owner: ${ownerStr}\n`;
            if (description.length > 3800) {
                embed.setDescription(description);
                return interaction.reply({ embeds: [embed] });
            }
        }

        embed.setDescription(description);
        return interaction.reply({ embeds: [embed] });
    }
};
