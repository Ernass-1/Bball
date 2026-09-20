const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const { HISTORY_FILE } = require('../services/leagueHistory');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('league')
        .setDescription('League information')
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('View the league transaction history')
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Number of recent events to show (default 20)')
                        .setMinValue(1)
                        .setMaxValue(100)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'history') {
            if (!fs.existsSync(HISTORY_FILE)) {
                return interaction.reply({ content: "No history has been recorded yet.", ephemeral: true });
            }

            const limit = interaction.options.getInteger('limit') || 20;
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            const lines = data.trim().split('\n').filter(l => l.length > 0).reverse().slice(0, limit);

            if (lines.length === 0) {
                return interaction.reply({ content: "No history has been recorded yet.", ephemeral: true });
            }

            const output = lines.join('\n');
            
            if (output.length > 1900) {
                const chunks = [];
                let currentChunk = "```\n";
                for (const line of lines) {
                    if (currentChunk.length + line.length + 5 > 2000) {
                        chunks.push(currentChunk + "```");
                        currentChunk = "```\n";
                    }
                    currentChunk += line + "\n";
                }
                chunks.push(currentChunk + "```");

                await interaction.reply({ content: chunks[0] });
                for (let i = 1; i < chunks.length; i++) {
                    await interaction.followUp({ content: chunks[i] });
                }
            } else {
                await interaction.reply({ content: "```\n" + output + "```" });
            }
        }
    },
};
