import shared_info
exports = shared_info.serverExports
import basics
import pull_info
import discord
import commands

#HELP SCREENS

modScreen = {
    "settings": 'Shows settings and the various commands for editing them. Mods will want to look through all the screens and make sure it is tuned to their liking.',
    "load [URL]": 'Load an export file to the bot.',
    'updateexport': 'Uploads your export to Dropbox.',
    'teamlist': 'List of teams and their assigned GMs.',
    "addgm [team] [mention user]": 'Assign a GM to a team.',
    'removegm [team or mention user]': 'Can clear a team of GMs or remove a specific GM.',
    'runfa': "Runs free agency.",
    'startdraft': 'Begins the automated draft.',
    'autocut': 'Auto-release for teams who are over the roster limit.',
    'runresignings':'Everyone gets resigned who had a valid offer made to them in the re-signings period.',
    'clearalloffers': "Clears all FA Offers."
}
playerScreen = {
    "stats": 'shows player stats',
    "ratings": 'shows player ratings',
    "bio": 'shows basic player biography',
    'adv': 'shows advanced statistics',
    'progs': 'shows progression charts',
    'hstats': 'Statlines for each season.',
    'cstats': 'Total career stats',
    'awards': 'shows awards',
    'pgamelog': 'Player game log.'
}

freeAgencyScreen = {
    'fa [optional: page number]': 'Shows free agents.',
    'offer [player name] [contract amount]/[contract length]': 'Offer a free agent.',
    'offers': 'Your list of offers.',
    'deloffer [player name]': 'Delete an offer.',
    'clearoffers': "Clears your offers.",
    'move [player name] [new priority]': 'Adjust your priority list.',
    'tosign [number]': 'Sets a max # of players to sign.',
    'resignings': 'Shows your re-signings.'
}

leagueScreen = {
    'fa [optional: page number]': 'Shows free agents.',
    'pr [optional: season]': 'League power rankings.',
    'matchups [team] [team]': 'Shows the matchups between two teams.',
    'top [rating]': 'Players ranked by a specirfic rating.',
    'injuries': 'League injuries.',
    'deaths': 'Players who have died.',
    'leaders [stat]': 'shows statistical leaders for current season',
    'summary [season]': 'season summary'
}

draftScreen = {
    'board': "Shows your draft board.",
    'add [player name]': 'Add a player to your board.',
    'remove [player name]': 'Remove a player from your board.',
    'dmove [player name] [new spot]': 'Adjust the board order.',
    'clearboard': 'Clear your board.',
    'auto': "Shows full details on setting an autodrafting formula.",
    'pick [player name]': "While you're on the clock, selects a player.",
    'draft': 'Shows current draft board.',
    'bulkadd': 'Put player names each on a new line to add several players to your board at once. This command requires correct spelling.'
}

teamScreen = {
    'roster': 'the thing you think it does, it does that thing',
    'sroster': 'Roster, with contracts swapped for stats.',
    'psroster': 'Playoff stats.',
    'lineup': 'No past season support - just shows the current lineup.',
    'picks': '',
    'ownspicks': "Shows the owner of the team's original picks.",
    'history': '',
    'finances':'',
    'seasons': '',
    'tstats': '',
    'ptstats': 'Team stats, but for the playoffs.',
    'schedule': '',
    'sos': 'Future strength of schedule.',
    'gamelog': '',
    'game [game number]': 'Pull game numbers from the gamelog page. Shows a summary of the game, and top performers.',
    'boxscore [game number]': "Same as above, but with the full box score."
}

rosterScreen = {
    'lineup': 'Shows your lineup.',
    'lmove [player name] [new spot]': 'Moves a player around the lineup.',
    'pt [player name] [playing time adjustment]': "'Playing time adjustment' can be used two different ways. You can apply the traditional adjustments, such as + or - (if they're legal in your server). Or, you can specify an OVR, such as 37 or 59. If you specify a rating, the bot will manipulate Basketball GM's 'playing time modifier' system, and the player will receive as much minutes in games as they would if that OVR was their actual rating. So setting the playing time OVR of a 55 OVR to 60 OVR will make the sim engine treat them as if they were a 60, for rotation purposes. This can be good to fine-tune your minutes.",
    'autosort': 'Autosorts your roster.',
    'resetpt': 'Resets all playing time adjusements.',
    'changepos [player] [new position]': 'Change a position.' 
}

pointsScreen = {
    'bal':'shows your number of points',
    'rob [ping user]': 'rob someone else',
    'daily': "Gives you some points every day like a login reward",
    'leaders (or globalleaders)': 'Shows points leaders.',
    'flip': 'flips a coin, used to bet points.',
    'lottery':'Enters the lottery. each ticket costs 1 point, and has a 5% chance to win you the entire lottery pool.'
}

helpScreens = {
    'mods': {'commands': modScreen, 'description': "Commands mostly for moderators to manage the league. **In ClevelandBot, 'manage message' permissions are assumed to mean moderator status.**"},
    "players": {'commands': playerScreen, 'description': 'Provide a player name, and for most, you can optionally provide a season.'},
    "teams": {'commands': teamScreen, 'description': 'If no team given, this defaults to your assigned team, but you can specify any. Most support a past season.'},
    "league": {'commands': leagueScreen, 'description': 'General league commands. Some, but not all, will support a provided season.'},
    "roster": {'commands': rosterScreen, 'description': 'Commands for managing your roster as a GM.'},
    "freeagency": {'commands': freeAgencyScreen, 'description': 'Commands for offering and managing free agent offers.'},
    'draft': {'commands': draftScreen, 'description': 'Commands for setting up your draft preferences.'},
    'points': {'commands': pointsScreen, 'description': 'Commands for points system.'}
}

async def process_text(text, message):
    helpText = "**Please call help for a specific category of commands.** The categories are: " + '\n'
    for h in helpScreens:
        helpText += f"• {h}" + '\n'
    if len(text) == 1:
        await message.channel.send(helpText)
    else:
        if str.lower(text[1]) not in helpScreens:
            await message.channel.send(helpText)
        else:
            screen = str.lower(text[1])
            embed = discord.Embed(title=f"{screen} help", description=helpScreens[screen]['description'])
            lines = []
            prefix = shared_info.serversList[str(message.guild.id)]['prefix']
            for command, descripLine in helpScreens[screen]['commands'].items():
                text = f"**{prefix}{command}**"
                if descripLine != "":
                    text += f" - {descripLine}"
                text += '\n'
                lines.append(text)
            numDivs, rem = divmod(len(lines), 5)
            numDivs += 1
            for i in range(numDivs):
                newLines = lines[(i*5):((i*5)+5)]
                text = '\n'.join(newLines)
                embed.add_field(name="ClevelandBot Help", value=text)
            await message.channel.send(embed=embed)




