import shared_info
exports = shared_info.serverExports
import basics
import pull_info
from pull_info import pinfo
from pull_info import tinfo
import discord
import player_commands as pc

##PLAYER COMMANDS

commandFuncs = {
    'stats': pc.stats,
    'bio': pc.bio,
    'ratings': pc.ratings,
    'adv': pc.adv,
    'progs': pc.progs,
    'hstats': pc.hstats,
    'cstats': pc.stats,
    'awards': pc.awards,
    'pgamelog': pc.pgamelog,
    'compare': pc.compare,
    'nbacompare': 'players',
    'proggraph':pc.progschart,
    'trivia':pc.trivia
}


async def process_text(text, message):
    export = exports[str(message.guild.id)]
    season = export['gameAttributes']['season']
    players = export['players']
    teams = export['teams']
    commandSeason = season
    command = str.lower(text[0])
    for m in text:
        try:
            m = int(m)
            commandSeason = m
            text.remove(str(commandSeason))
        except:
            pass
    
    playerToFind = ' '.join(text[1:])
    playerPid = basics.find_match(playerToFind, export)
    for player in players:
        if player['pid'] == playerPid:
            p = player
    if commandSeason == season:
        p = pinfo(p)
    else:
        p = pinfo(p, commandSeason)
    t = None
    for team in teams:
        if team['tid'] == p['tid']:
            if commandSeason == season:
                t = tinfo(team)
            else:
                t = tinfo(team, commandSeason)
    if t == None:
        t = pull_info.tgeneric(p['tid'], p)
    
    descriptionLine = f"{p['position']}, {p['ovr']}/{p['pot']}, {commandSeason - p['born']} years | #{p['jerseyNumber']}, {t['name']} ({t['record']})"
    if p['skills'] != '': descriptionLine += '\n' + f"*Skills: {p['skills']}*"
    embed = discord.Embed(title=p['name'], description=descriptionLine, color=t['color'])

    #pull together some essential command info to pass along to the command funcs
    commandInfo = {"id": message.guild.id,
                   "season": commandSeason,
                   "commandName": command,
                   "message": message}
    #uncomment to get a full error message in console
    print(commandFuncs)
    embed = commandFuncs[command](embed, p, commandInfo) 
    #try: embed = commandFuncs[command](embed, p, commandInfo) #fill the embed with the specified function
    #except Exception as e:
     #   print(e) 
     #   embed.add_field(name='Error', value="An error occured. Command may not be specified.", inline=False)
    
    #add the bottom parts
    if not command=="trivia":
        if commandSeason == season:
            if p['retired']:
                titles = 0
                for a in p['awards']:
                    if a['type'] == 'Won Championship':
                        titles += 1
                embed.add_field(name=f'Championships: {titles}', value='', inline=False)
            else:
                contract = f"${p['contractAmount']}M/{p['contractExp']}"
                injury = p['injury'][0]
                if p['injury'][0] != "Healthy":
                    injury += f" (out {p['injury'][1]} more games)"
                embed.add_field(name=f"Contract: {contract}", value=injury, inline=False)
        else:
            embed.add_field(name=f"Playoffs: {pull_info.playoff_result(t['roundsWon'], export['gameAttributes']['numGamesPlayoffSeries'], commandSeason)}", value=p['awards'], inline=False)
    embed.set_footer(text=shared_info.embedFooter)
    await message.channel.send(embed=embed)
    gc = ["proggraph"]
    if command in gc:
        f = open("first_figure.png",'rb')
        await message.channel.send("Progs for "+p["name"], file = discord.File(f))
        f.close()



