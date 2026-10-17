from re import L
import discord
from discord.ext import commands
import json
import urllib.request
import csv
import asyncio
import checks
import basics
import commands
import shared_info
import os
import math
import trade_functions
import bible
from unidecode import unidecode
points = shared_info.points
#move commands to a shared place for access across the bot
shared_info.commandsRaw = commands.commandsRaw

#intents for DMing bawds
intents = discord.Intents.all()
intents.members = True
#intents.message_content = True
client = discord.Client(intents=intents)
shared_info.bot = client



#load settings db
serversList = shared_info.serversList


@client.event
async def on_ready():
    await client.change_presence(activity=discord.Activity(type=discord.ActivityType.watching, name='SolarBalls'))
    print('Bot connected')
    for g in client.guilds:
        print(g.name, '|', g.id)
        serversList = checks.server_check(g.id, g.name)
        await basics.save_db(serversList)
        try:
            current_dir = os.getcwd()
            path_to_file = os.path.join(current_dir, "exports", f'{g.id}-export.json')
            shared_info.serverExports[str(g.id)] = basics.load_db(path_to_file)
        except Exception as e:
            print(f"An error for server {g.name}: {e}")

@client.event
async def on_guild_join(g):
    print('Joined', g.name)
    serversList = checks.server_check(g.id, g.name)
    await basics.save_db(serversList)

commandAliases = {
    "r": "ratings",
    "s": "stats",
    "b": "bio",
    "setgm": "addgm",
    "ts": "tstats",
    "tsp": 'ptstats',
    "rs": "resignings",
    "runrs": "runresignings",
    "cs": "cstats",
    "hs": "hstats",
    'updateexport': 'updatexport',
    "balance":"bal",
    "gl":"globalleaders",
    "l":"pleaders",
    'lp':'lotterypool'
}

#set up bible commands quickly

bookNames = ['Joshua', '1 Samuel', '2 Samuel', '1 Chronicles', '2 Chronicles', 'Ezra', "Tobit", "1 Maccabees", "2 Maccabees", 'Revelation', 'Nehemiah', 'Psalm', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Ezekiel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Micah', 'Jonah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi']
for book in shared_info.bibleBooks:
    bookNames.append(str.lower(book['shortname']))

#mod only
modOnlyCommands = ['edit', 'load', 'addgm', 'removegm', 'runfa', 'startdraft', 'runresignings', 'autocut', 'pausedraft', 'updatexport', 'clearalloffers', 'specialize']


@client.event
async def on_message(message):
    
    try: prefix = serversList[str(message.guild.id)]['prefix']
    except: prefix = '-'
    if not str(message.author.id) in points:
        points.update({str(message.author.id):0})
    if not message.content.startswith(str(prefix)):
        increment = math.sqrt(len(message.content))*0.01
        points.update({str(message.author.id):points[str(message.author.id)]+increment})
    if message.channel in shared_info.trivias:
        if unidecode(shared_info.trivias[message.channel].lower()) in message.content.lower():
            del shared_info.trivias[message.channel]
            await message.channel.send(message.author.mention+" correct, and you gain 5 points")
            p = points[str(message.author.id)]
            points.update({str(message.author.id):p+5})
    
    
    #
    #trade scanning - if in trade channel, just pass it along to the proper functions
    if 1 == 1:
        if f"<#{message.channel.id}>" == serversList[str(message.guild.id)]['tradechannel'] and message.author.id != client.user.id:
            if str.lower(message.content) == 'confirm':
                await trade_functions.confirm_message(message)
            else:
                await trade_functions.scan_text(message.content, message)
        else:
            #print(str(prefix))
            if message.content.startswith(str(prefix)):

                text = message.content[1:].split(' ')
                command = text[0]

                command = str.lower(command)
                if command in commandAliases:
                    text[0] = commandAliases[command]
                    command = commandAliases[command]
                if command in commands.commands:

                    #check for mod command
                    valid = False
                    if command in modOnlyCommands:

                        if message.author.guild_permissions.manage_messages or message.author.id == 1248979952309637203:
                            valid = True
                    else:
                        valid = True
                    if valid:
                        await commands.commands[command](text, message)
                    else:
                        await message.channel.send("You aren't authorized to run that command.")

            #bible command
            for b in bookNames:
                if str.lower(message.content).startswith(str.lower(b)):
                    await bible.get_verse(message.content, message, b)




    
client.run('your_token_here')
