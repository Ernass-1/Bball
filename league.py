import shared_info
exports = shared_info.serverExports
import basics
import pull_info
from pull_info import pinfo
from pull_info import tinfo
import discord
import league_commands

##LEAGUE COMMANDS

commandFuncs = {
    'fa': league_commands.fa,
    'draft': league_commands.draft,
    'pr': league_commands.pr,
    'matchups': league_commands.matchups,
    'top': league_commands.top,
    'injuries': league_commands.injuries,
    'deaths': league_commands.deaths,
    'leaders': league_commands.leaders,
    'summary': league_commands.summary
}
    
async def process_text(text, message):
    export = exports[str(message.guild.id)]
    season = export['gameAttributes']['season']
    players = export['players']
    teams = export['teams']
    commandSeason = season
    pageNumber = 1
    command = str.lower(text[0])
    for m in text:
        try:
            m = int(m)
            if m > 1500:
                commandSeason = m
            else:
                pageNumber = m
            text.remove(str(commandSeason))
        except:
            pass
    descripLine = str(commandSeason) + ' season'
    if command == 'fa' and season != commandSeason:
        descripLine = f"Page {commandSeason}"
    embed = discord.Embed(title=message.guild.name, description=descripLine)
    commandInfo = {
        'serverId': message.guild.id,
        'message': message,
        'season': commandSeason,
        'pageNumber': pageNumber,
        'text': text
    }
    #embed = commandFuncs[command](embed, commandInfo)
    try: embed = commandFuncs[command](embed, commandInfo) #fill the embed with the specified function
    except Exception as e:
        print(e) 
        embed.add_field(name='Error', value="An error occured. Command may not be specified.", inline=False)

    embed.set_footer(text=shared_info.embedFooter)
    await message.channel.send(embed=embed)