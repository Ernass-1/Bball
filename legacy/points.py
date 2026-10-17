import shared_info
pointdb = shared_info.points
import basics
import pull_info
from pull_info import pinfo
from pull_info import tinfo
import discord
import points_commands as pc
import json
import random

##PLAYER COMMANDS

commandFuncs = {
    'bal': pc.bal,
    'pleaders':pc.leaders,
    'flip':pc.flip,
    'rob':pc.rob,
    'daily':pc.dailyclaim,
    'resetdaily':pc.resetdaily,
    'globalleaders':pc.all_leaders,
    'lotterypool':pc.lotterypool,
    'lottery':pc.lottery,
    'give':pc.give
    
}


async def process_text(text, message):

    command = str.lower(text[0])
    if command == 'echo':
        await message.channel.send(" ".join(message.content.split(" ")[1:]))
        return
    commandInfo = {"user":str(message.author.id)}
    commandInfo.update({"guild":message.guild})
    commandInfo.update({"guess":'Heads'})
    commandInfo.update({"bet":0.1})
    commandInfo.update({"number":1})
    for word in text:
        if word.__contains__("@"):
            commandInfo.update({"user":word.replace("<","").replace("!","").replace(">","").replace("@","")})
        try:
            commandInfo.update({"number":int(word)})
        except ValueError:
            pass
        try:
            commandInfo.update({"bet":float(word)})
        except ValueError:
            pass
        if word == "t" or word == "T" or word.upper() == "TAILS":
            commandInfo.update({"guess":'Tails'})
        
    
    
    embed = discord.Embed(title = "Points System:")
    
    embed = commandFuncs[command](embed, message.author, commandInfo) 
    #try: embed = commandFuncs[command](embed, p, commandInfo) #fill the embed with the specified function
    #except Exception as e:
     #   print(e) 
     #   embed.add_field(name='Error', value="An error occured. Command may not be specified.", inline=False)
    #print(pointdb)
    
    embed = pc.balance(embed, message.author, message.guild)
    #add the bottom parts
    s = shared_info.embedFooter
    if random.random() < 0.05:
        s = "Dedicated to Ben135, the best multiplayer GM in history"
    embed.set_footer(text=s)
    await message.channel.send(embed=embed)
    x = open("points.json",'w')
    x.write(json.dumps(pointdb))
    x.close()




