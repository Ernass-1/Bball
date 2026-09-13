const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isCommissioner } = require('../utils/permissions');
const { hasActiveSave, loadSaveFile, getActiveSavePath, isRfaEligible } = require('../services/saveEditor');
const { getChannelForTeam } = require('../database/index');
const { getRfaStatus } = require('../database/index');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rfa')
        .setDescription('Restricted free agency commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('announce')
                .setDescription('Announce RFA-eligible players to each team channel')),
    async execute(interaction) {
        if (!isCommissioner(interaction.member)) {
            return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
        }

        if (!hasActiveSave()) {
            return interaction.reply({ content: "No active save file found.", ephemeral: true });
        }

        const save = loadSaveFile(getActiveSavePath());
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'announce') {
            await interaction.deferReply({ ephemeral: true });

            let postedCount = 0;
            let noEligibleCount = 0;
            let skippedCount = 0;

            for (const team of save.teams) {
                const roster = save.players.filter(p => p.tid === team.tid);
                const eligiblePlayers = roster.filter(p => isRfaEligible(p));

                if (eligiblePlayers.length === 0) {
                    noEligibleCount++;
                    continue;
                }

                const channelData = getChannelForTeam(team.tid);
                if (!channelData) {
                    skippedCount++;
                    continue;
                }

                const channel = interaction.client.channels.cache.get(channelData.channel_id);
                if (!channel) {
                    skippedCount++;
                    continue;
                }

                const embed = new EmbedBuilder()
                    .setTitle('Restricted free agency eligible players')
                    .setDescription('The following players are eligible for restricted free agency:')
                    .setColor(0x0099FF);

                for (const player of eligiblePlayers) {
                    const status = getRfaStatus(player.pid);
                    const salary = player.salaries && player.salaries.length > 0 ? player.salaries[0].amount : 0;
                    embed.addFields({
                        name: `${player.firstName} ${player.lastName} (${player.pos})`,
                        value: `Salary: $${salary}k | Status: ${status}`,
                        inline: false
                    });
                }

                embed.addFields({
                    name: 'Reminder',
                    value: 'Use /rfa qualify to extend a qualifying offer before another team can make an offer sheet.',
                    inline: false
                });

                await channel.send({ embeds: [embed] });
                postedCount++;
            }

            await interaction.editReply(`RFA announcement complete:
- Posted to ${postedCount} team channels.
- ${noEligibleCount} teams had no eligible players.
- ${skippedCount} teams were skipped due to missing channel mapping.`);
        }
    }
};
