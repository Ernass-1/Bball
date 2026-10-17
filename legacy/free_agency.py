import shared_info
exports = shared_info.serverExports
serversList = shared_info.serversList
import basics
import pull_info
import fa_commands
import discord

commandFuncs = {
    'offer': fa_commands.offer,
    'offers': fa_commands.offers,
    'deloffer': fa_commands.deloffer,
    'clearoffers': fa_commands.clearoffers,
    'move': fa_commands.move,
    'tosign': fa_commands.tosign,
    'runfa': fa_commands.runfa,
    'resignings': fa_commands.resignings,
    'runresignings': fa_commands.runresign,
    'bulkoffer': fa_commands.bulkoffer,
    'clearalloffers': fa_commands.clearall
}

async def process_text(text, message):
    export = exports[str(message.guild.id)]
    season = export['gameAttributes']['season']
    teams = export['teams']
    userTid = serversList[str(message.guild.id)]['teamlist'][str(message.author.id)]

    t = None
    for team in teams:
        if team['tid'] == userTid:
            t = pull_info.tinfo(team)
    if t == None:
        t = pull_info.tgeneric(-1)

    command = str.lower(text[0])
    embed = discord.Embed(title=t['name'] + ' FA', description=f"{season} season", color=t['color'])

    commandInfo = {
        "userTid": userTid,
        "serverId": str(message.guild.id),
        "userId": str(message.author.id),
        "message": message
    }
    
    #uncomment to get full error message in console
    embed = await commandFuncs[command](embed, text, commandInfo) #fill the embed with the specified function
    #try: embed = await commandFuncs[command](embed, text, commandInfo) #fill the embed with the specified function
    #except Exception as e:
        #print(e) 
        #embed.add_field(name='Error', value="An error occured. Command may not be specified.", inline=False)

    embed.set_footer(text=shared_info.embedFooter)
    if command != 'runfa':
        await message.channel.send(embed=embed)