const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { hasActiveSave, loadSaveFile, getActiveSavePath } = require('../services/saveEditor');
const { getConfiguredChannelId, getConfiguredRoleId } = require('../utils/config');
const { getLastBackupInfo } = require('../services/dataBackup');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Show the current bot status and configuration'),
    async execute(interaction) {
        const save = hasActiveSave() ? loadSaveFile(getActiveSavePath()) : null;
        const allData = db.getAllData();
        
        // 1. Active Save
        let saveStatus = "No save file loaded.";
        if (save) {
            saveStatus = `Loaded: ${save.teams.length} teams, ${save.players.length} players.`;
        }

        // 2. Configured Channels
        const commishChannelId = getConfiguredChannelId('commish');
        const draftChannelId = getConfiguredChannelId('draft');
        const commishChannelStr = commishChannelId ? `<#${commishChannelId}>` : "Not set";
        const draftChannelStr = draftChannelId ? `<#${draftChannelId}>` : "Not set";

        // 3. Configured Role
        const commishRoleId = getConfiguredRoleId('commissioner');
        const commishRoleStr = commishRoleId ? `<@&${commishRoleId}>` : "Not set";

        // 4. Team Roles
        const teamRoles = db.getAllTeamRoles();
        const totalTeams = save ? save.teams.length : 0;
        const teamRolesStr = save ? `${teamRoles.length} / ${totalTeams} teams have a Discord role assigned` : "N/A (No save loaded)";

        // 5. Claimed Teams
        const teamLinks = allData.team_links;
        const claimedTeamsStr = save ? `${teamLinks.length} / ${totalTeams} teams claimed` : "N/A (No save loaded)";

        // 6. Draft State
        const draftState = db.getDraftState();
        const draftStateStr = draftState 
            ? `Season ${draftState.season}, Pick ${draftState.current_pick_index + 1}` 
            : "No draft in progress";

        // 7. Open Items
        const openTrades = allData.trades.filter(t => t.status === 'pending' || t.status === 'accepted').length;
        const openFaOffers = allData.fa_offers.filter(o => o.status === 'open').length;
        const pendingRfa = allData.fa_offers.filter(o => o.status === 'signed_elsewhere_pending_match').length;
        const openItemsStr = `${openTrades} trades awaiting approval, ${openFaOffers} open FA offers, ${pendingRfa} RFA match pending`;

        // 8. GitHub Backup
        const lastBackup = getLastBackupInfo();
        const backupStr = lastBackup ? `Last backup: <t:${Math.floor(lastBackup.getTime() / 1000)}:R>` : "Never backed up yet";

        // 9. Bot Owner
        const botOwnerStr = process.env.BOT_OWNER_DISCORD_ID ? "Configured" : "Not configured";

        const embed = new EmbedBuilder()
            .setTitle('Bot Status')
            .setColor(0x0099FF)
            .addFields(
                { name: 'Active Save', value: saveStatus },
                { name: 'Channels', value: `Commissioner: ${commishChannelStr}\nDraft: ${draftChannelStr}` },
                { name: 'Commissioner Role', value: commishRoleStr },
                { name: 'Team Roles', value: teamRolesStr },
                { name: 'Claimed Teams', value: claimedTeamsStr },
                { name: 'Draft State', value: draftStateStr },
                { name: 'Open Items', value: openItemsStr },
                { name: 'GitHub Backup', value: backupStr },
                { name: 'Bot Owner Override', value: botOwnerStr }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
