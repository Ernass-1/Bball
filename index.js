require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { restoreFromGitHub, backupToGitHub } = require('./services/dataBackup');
const { registerCommands } = require('./deploy-commands');
const { ensureDirectoryExists, getActiveSavePath } = require('./services/saveEditor');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	}
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

// Global button interaction handler for confirmation flows
client.on('interactionCreate', async interaction => {
	if (!interaction.isButton()) return;

	if (interaction.customId === 'cancel_restore') {
		return interaction.update({ content: 'Restore cancelled.', components: [] });
	}

	if (interaction.customId.startsWith('confirm_restore_')) {
		const { isCommissioner } = require('./utils/permissions');
		if (!isCommissioner(interaction.member)) {
			return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
		}

		const { restoreSnapshot, backupToGitHub } = require('./services/dataBackup');
		const timestamp = interaction.customId.replace('confirm_restore_', '');
		const filename = `active_save_${timestamp.replace(/:/g, '-')}.json`;

		await interaction.update({ content: 'Restoring snapshot...', components: [] });

		try {
			const result = await restoreSnapshot(filename);
			await interaction.followUp({ content: `✅ Restored snapshot from \`${timestamp}\` (Teams: ${result.teamCount}, Players: ${result.playerCount}).`, ephemeral: true });
			backupToGitHub();
		} catch (error) {
			await interaction.followUp({ content: `❌ Restore failed: ${error.message}`, ephemeral: true });
		}
	}
});

// Initialize Backup System
ensureDirectoryExists(getActiveSavePath());
restoreFromGitHub();
const backupInterval = parseInt(process.env.BACKUP_INTERVAL_MINUTES) || 5;
setInterval(backupToGitHub, backupInterval * 60 * 1000);

// Register commands and start bot
(async () => {
	try {
		await registerCommands();
	} catch (error) {
		console.error('Failed to register commands:', error);
	}
	client.login(process.env.DISCORD_TOKEN);
})();
