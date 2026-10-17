import shared_info
from shared_info import serverExports
from shared_info import serversList
import pull_info
import basics
import discord
import free_agency_runner
import asyncio
import os
import copy

#-lineup will fall under team commands.

async def lmove(embed, text, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']
    teams = export['teams']
    #findPlayer
    player = ' '.join(text[1:-1])
    player = basics.find_match(player, export, False, True)
    #moveTo
    try:
        moveTo = int(text[-1])
    except:
        embed.add_field(name='Error', value='Please provide a valid integer as the last word of your command, to move the player to.')
    
    #see if player is valid
    valid = False
    for p in players:
        if p['pid'] == player:
            if p['tid'] != commandInfo['userTid']:
                embed.add_field(name='Error', value=f"{p['firstName']} {p['lastName']} is not on your team.")
            else:
                if moveTo < 1:
                    embed.add_field(name='Error', value='Please provide a positive number.')
                else:
                    #move the player
                    valid = True
    #create team lineup as a list
    teamLineup = []
    for p in players:
        if p['tid'] == commandInfo['userTid']:
            teamLineup.append([p['pid'], p['rosterOrder']])
    teamLineup.sort(key=lambda l: l[1])
    spot = 1
    newLineup = []
    for t in teamLineup:
        if t[0] == player:
            teamLineup.remove(t)
    for pl in teamLineup:
        if spot == moveTo:
            newLineup.append(player)
        newLineup.append(pl[0])
        spot+=1
    #check the validity of this new lineup with tank rules
    starters = newLineup[:5]
    lowStarterOvr = 101
    for s in starters:
        for p in players:
            if p['pid'] == s:
                if p['ratings'][-1]['ovr'] < lowStarterOvr:
                    lowStarterOvr = p['ratings'][-1]['ovr']
    bench = newLineup[5:]
    highBenchOvr = -1
    for b in bench:
        for p in players:
            if p['pid'] == b:
                if p['ratings'][-1]['ovr'] > highBenchOvr:
                    highBenchOvr = p['ratings'][-1]['ovr']
    limit = serversList[str(commandInfo['serverId'])]['lineupovrlimit']
    if highBenchOvr - lowStarterOvr > int(limit):
        embed.add_field(name='Error', value=f"Your lineup fails anti-tank rules. A bench player can not be more than {limit} OVR higher than a starter.")
    else:
        #set the lineup
        spot = 0
        for n in newLineup:
            for p in players:
                if p['pid'] == n:
                    p['rosterOrder'] = spot
                    spot += 1
        embed.add_field(name='Success', value='Lineup adjusted.')

    return embed

async def pt(embed, text, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']
    teams = export['teams']
    #findPlayer
    player = ' '.join(text[1:-1])
    player = basics.find_match(player, export, False, True)
    #the ptMod
    ptMods = ['+', '++', '-', '0', 'none', 'default']
    commandPt = text[-1]
    if commandPt in ptMods:
        if commandPt == '+':
            commandPt = 1.25
        if commandPt == '++':
            commandPt = 1.75
        if commandPt == '-':
            commandPt = 0.75
        if commandPt == '0':
            commandPt = 0
        if commandPt == 'none':
            commandPt = 1
        if commandPt == 'default':
            commandPt = 1
    else:
        try: commandPt = float(commandPt)
        except: embed.add_field(name='Error', value='Please provide 0, -, +, ++, or a positive number as the playing time modifier.')
    #check if player is on team
    valid = False
    for p in players:
        if p['pid'] == player:
            if p['tid'] == commandInfo['userTid']:
                valid = True
    if valid:
        if isinstance(commandPt, (int, float)):
            #if it's not a well known value, apply it as a PT OVR
            if commandPt not in [0, 0.75, 1, 1.25, 1.75]:
                for p in players:
                    if p['pid'] == player:
                        ovr = p['ratings'][-1]['ovr']
                        commandPt = commandPt/ovr
            #check limits
            serverSettings = serversList[str(commandInfo['serverId'])]
            if commandPt > float(serverSettings['maxptlimit']) or commandPt < float(serverSettings['minptlimit']):
                valid = False
                #one exception
                for p in players:
                    if p['pid'] == player:
                        if p['ratings'][-1]['ovr'] <= float(serverSettings['allowzero']):
                            if commandPt == 0:
                                valid = True

                if valid == False:            
                    embed.add_field(name='Violation', value=f'You tried applying a modifier of {round(commandPt, 2)}, which falls outside the server minimum/maximum limits.')
            if valid:
                #apply
                for p in players:
                    if p['pid'] == player:
                        p['ptModifier'] = commandPt
                        name = p['firstName'] + ' ' + p['lastName']
                        embed.add_field(name='Success', value=f"Adjusted {name}'s playing time modifier to {round(commandPt, 2)}.")
                        current_dir = os.getcwd()
                        path_to_file = os.path.join(current_dir, "exports", f"{commandInfo['serverId']}-export.json")
                        await basics.save_db(export, path_to_file)
    else:
        embed.add_field(name='Error', value='That player is not on your team.')

    return embed

async def autosort(embed, text, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']
    #just auto the roster
    lineup = []
    for p in players:
        if p['tid'] == commandInfo['userTid']:
            lineup.append([p['pid'], p['valueNoPot']])
    lineup.sort(key=lambda l: l[1], reverse=True)
    position = 0
    for l in lineup:
        for p in players:
            if p['pid'] == l[0]:
                p['rosterOrder'] = position
                position += 1
    embed.add_field(name='Success', value='Lineup autosorted.')
    current_dir = os.getcwd()
    path_to_file = os.path.join(current_dir, "exports", f"{commandInfo['serverId']}-export.json")
    await basics.save_db(export, path_to_file)
    return embed

async def resetpt(embed, text, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']
    for p in players:
        if p['tid'] == commandInfo['userTid']:
            p['ptModifier'] = 1
    embed.add_field(name='Success', value='Reset your playing time settings.')
    current_dir = os.getcwd()
    path_to_file = os.path.join(current_dir, "exports", f"{commandInfo['serverId']}-export.json")
    await basics.save_db(export, path_to_file)
    return embed

async def changepos(embed, text, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']
    teams = export['teams']
    #findPlayer
    player = ' '.join(text[1:-1])
    player = basics.find_match(player, export, False, True)
    #position
    positions = ['PG', 'G', 'SG', 'GF', 'SF', 'F', 'PF', 'FC', 'C']
    if str.upper(text[-1]) in positions:
        for p in players:
            if p['pid'] == player:
                if p['tid'] != commandInfo['userTid']:
                    embed.add_field(name='Violation', value='That player is not on your team.')
                else:
                    p['ratings'][-1]['pos'] = str.upper(text[-1])
                    current_dir = os.getcwd()
                    path_to_file = os.path.join(current_dir, "exports", f"{commandInfo['serverId']}-export.json")
                    await basics.save_db(export, path_to_file)
                    embed.add_field(name='Success', value=f"{p['firstName']} {p['lastName']}'s position has been changed to {str.upper(text[-1])}.")
    else:
        embed.add_field(name='Error', value='Please move to a valid position.')
    
    return embed

async def release(embed, text, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']
    teams = export['teams']
    serverSettings = shared_info.serversList[str(commandInfo['serverId'])]
    #findPlayer
    player = ' '.join(text[1:])
    player = basics.find_match(player, export, False, True)
    for p in players:
        if p['pid'] == player:
            name = f"{p['firstName']} {p['lastName']}"
            rating = f"{p['ratings'][-1]['ovr']}/{p['ratings'][-1]['pot']}"
            #validity checks!
            valid = True
            #OVR
            maxOvrRelease = int(serverSettings['maxovrrelease'])
            if p['ratings'][-1]['ovr'] > maxOvrRelease:
                embed.add_field(name='Illegal', value=f'{name} is too highly rated to be released.')
                valid = False
            #team
            if p['tid'] != commandInfo['userTid']:
                embed.add_field(name='Illegal', value=f"{name} is not on your team.")
                valid = False
            if valid:
                #confirmation
                text = f'Are you sure you want to release {name} ({rating})? This action can not be reversed. Click the ✅ to confirm.'
                confirmMessage = await commandInfo['message'].channel.send(text)
                await confirmMessage.add_reaction('✅')
                def check(reaction, user):
                    return reaction.message == confirmMessage and user == commandInfo['message'].author and str(reaction.emoji) == '✅'
                try:
                    reaction, user = await shared_info.bot.wait_for('reaction_add', timeout=60, check=check)
                except asyncio.TimeoutError:
                    await confirmMessage.edit(content='❌ Release timed out.')
                else:
                    await confirmMessage.edit(content='Releasing player...')
                    await basics.release_player(p['pid'], commandInfo['message'])
                    await confirmMessage.edit(content='**Complete.**')
                    embed = None
    return embed

async def autocut(embed, text, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']
    teams = export['teams']
    season = export['gameAttributes']['season']

    maxRoster = export['gameAttributes']['maxRosterSize']

    for t in teams:
        roster = []
        for p in players:
            if p['tid'] == t['tid']:
                autocutFormula = (p['ratings'][-1]['ovr'] + p['ratings'][-1]['pot'])
                if p['contract']['exp'] == season:
                    autocutFormula+=0.3
                if p['draft']['year'] == season or (p['draft']['year'] == season-1 and export['gameAttributes']['phase'] == 0):
                    autocutFormula += 0.5
                roster.append([p['pid'], autocutFormula])
        roster.sort(key=lambda r: r[1], reverse=True)
        toCut = len(roster) - maxRoster
        if toCut > 0:
            releasePlayers = roster[-toCut:]
            for r in releasePlayers:
                await basics.release_player(r[0], commandInfo['message'])
    embed.add_field(name='Complete', value='Autocuts done.')
    return embed





