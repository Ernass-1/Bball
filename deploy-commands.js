require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

async function registerCommands() {
	const commands = [];
	const commandsPath = path.join(__dirname, 'commands');
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			commands.push(command.data.toJSON());
		}
	}

	const rest = new REST().setToken(process.env.DISCORD_TOKEN);

	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		let route;
		if (process.env.GUILD_ID) {
			route = Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID);
		} else {
			route = Routes.applicationCommands(process.env.CLIENT_ID);
		}

		const data = await rest.put(
			route,
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		console.error(error);
		throw error;
	}
}

// Allow running as standalone script
if (require.main === module) {
	registerCommands();
}

module.exports = { registerCommands };
