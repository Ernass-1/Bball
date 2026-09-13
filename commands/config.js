const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { setConfig, getConfig } = require('../database/index');
const { isBotOwner } = require('../utils/permissions');
const { getConfiguredChannelId, getConfiguredRoleId } = require('../utils/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Manage bot configuration')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-channel')
                .setDescription('Set a bot channel')
                .addStringOption(option =>
                    option.setName('purpose')
                        .setDescription('The purpose of the channel')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Commissioner channel', value: 'commish' },
                            { name: 'Draft channel', value: 'draft' }
                        ))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to use')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-role')
                .setDescription('Set a bot role')
                .addStringOption(option =>
                    option.setName('purpose')
                        .setDescription('The purpose of the role')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Commissioner role', value: 'commissioner' }
                        ))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to use')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Show current configuration')),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && !isBotOwner(interaction.user.id)) {
            return interaction.reply({ content: "You need Administrator permission (or bot owner) to change bot config.", ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set-channel') {
            const purpose = interaction.options.getString('purpose');
            const channel = interaction.options.getChannel('channel');
            setConfig(`channel:${purpose}`, channel.id);
            await interaction.reply(`Set ${purpose} channel to ${channel}.`);
        } else if (subcommand === 'set-role') {
            const purpose = interaction.options.getString('purpose');
            const role = interaction.options.getRole('role');
            setConfig(`role:${purpose}`, role.id);
            await interaction.reply(`Set ${purpose} role to ${role}.`);
        } else if (subcommand === 'show') {
            const getSource = (val, envVal) => {
                if (val) return `Discord Config (${val})`;
                if (envVal) return `Env Var (${envVal})`;
                return "Not set";
            };

            const commishChannel = getConfig('channel:commish');
            const draftChannel = getConfig('channel:draft');
            const commishRole = getConfig('role:commissioner');

            const embed = new EmbedBuilder()
                .setTitle('Bot Configuration')
                .addFields(
                    { name: 'Commissioner Channel', value: getSource(commishChannel ? `<#${commishChannel}>` : null, process.env.COMMISH_CHANNEL_ID ? `<#${process.env.COMMISH_CHANNEL_ID}>` : null) },
                    { name: 'Draft Channel', value: getSource(draftChannel ? `<#${draftChannel}>` : null, process.env.DRAFT_CHANNEL_ID ? `<#${process.env.DRAFT_CHANNEL_ID}>` : null) },
                    { name: 'Commissioner Role', value: getSource(commishRole ? `<@&${commishRole}>` : null, process.env.COMMISSIONER_ROLE_ID ? `<@&${process.env.COMMISSIONER_ROLE_ID}>` : null) }
                );

            await interaction.reply({ embeds: [embed] });
        }
    },
};
