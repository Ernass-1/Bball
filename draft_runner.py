import shared_info
from shared_info import serverExports
from shared_info import serversList
import pull_info
import basics
import discord
import asyncio
import os

async def select_player(pid, dp, message):
    
    export = serverExports[str(message.guild.id)]
    players = export['players']
    teams = export['teams']
    season = export['gameAttributes']['season']
    events = export['events']
    draftStatus = serversList[str(message.guild.id)]['draftStatus']
    #sending message is not necessary since initiating the next pick will do that. It's only necessary if this is the last pick of the draft.
    lastPick = False
    picksMade = 0
    for p in players:
        if p['draft']['year'] == season and p['tid'] != -2:
            picksMade += 1
    if picksMade == draftStatus['totalPicks']:
        lastPick = True
        #will send message later if true
    
    #select the player.
    for p in players:
        if p['pid'] == pid:
            name = p['firstName'] + ' ' + p['lastName']
            p['tid'] = dp['tid']
            p['draft']['round'] = dp['round']
            p['draft']['tid'] = dp['tid']
            p['draft']['pick'] = dp['pick']
            p['draft']['ovr'] = p['ratings'][-1]['ovr']
            p['draft']['pot'] = p['ratings'][-1]['pot']
            p['draft']['skills'] = p['ratings'][-1]['skills']
            p['draft']['year'] = season
            p['draft']['originalTid'] = dp['originalTid']
            p['draft']['dpid'] = dp['dpid']

            newTrans = {
                "season": season,
                "phase": 5,
                "tid": dp['tid'],
                "type": 'draft',
                "pickNum": picksMade+1
            }
            try: p['transactions'].append(newTrans)
            except:
                p['transactions'] = []
                p['transactions'].append(newTrans)
            if dp['round'] > 1:
                p['contract']['amount'] = export['gameAttributes']['minContract']
            else:
                p['contract']['amount'] = basics.rookie_salary(dp['pick'], export)
            try: p['contract']['exp'] = season + export['gameAttributes']['rookieContractLengths'][dp['round'] - 1]
            except: p['contract']['exp'] = season + export['gameAttributes']['rookieContractLengths'][-1]
            p['contract']['rookie'] = True

            #event
            for t in teams:
                if t['tid'] == dp['tid']:
                    abbrev = t['abbrev']
                    teamName = t['region'] + ' ' + t['name']
            newEvent = {
                'type': 'draft',
                'pids': [pid],
                'tids': [dp['tid']],
                'season': season,
                'eid': events[-1]['eid']+1,
                'text': 'The <a href="/l/10/roster/' + abbrev + '/' + str(season) + '">' + teamName + '</a> selected <a href="/l/10/player/' + str(pid) + '">' + name + '</a> with the #' + str(picksMade+1) + ' pick in the <a href="/l/15/draft_history/' + str(season) + f'">{season} draft</a>.'
            }
            if dp['round'] == 1 and dp['pick'] == 1:
                newEvent['score'] = 20
            else:
                if dp['round'] == 1 and dp['pick'] > draftStatus['totalPicks']/10:
                    newEvent['score'] = 5
                else:
                    newEvent['score'] = 0
            events.append(newEvent)
            #remove from draft boards
            boards = serversList[str(message.guild.id)]['draftBoards']
            for tid, board in boards.items():
                if pid in board:
                    board.remove(pid)
            #finally, remove the draft pick
            draftPicks = export['draftPicks']
            for pick in draftPicks:
                if pick['round'] == dp['round'] and pick['pick'] == dp['pick'] and pick['season'] == dp['season']:
                    draftPicks.remove(pick)




async def draft_pick(dp, clockTime, message):
    export = serverExports[str(message.guild.id)]
    players = export['players']
    teams = export['teams']
    season = export['gameAttributes']['season']
    picks = export['draftPicks']
    currentPickNum = 1
    for p in players:
        if p['draft']['year'] == season and p['draft']['tid'] != -1 and p['draft']['round'] <= dp['round'] and p['draft']['pick'] < dp['pick']:
            currentPickNum += 1
    text = ""
    if dp['pick'] == 1:
        #start of round
        if dp['round'] == 1:
            #start of draft
            text = '>>> **START OF DRAFT**' + '\n' + '---' + '\n'
        else:
            text = f">>> **START OF ROUND {dp['round']}**" + '\n' + '---' + '\n'
    else:
        text = '>>> '
    #make the initial message before starting the clock
    #first line will say where we are
    text += f"**__Round {dp['round']}, Pick #{dp['pick']}__**" + '\n'
    #if this isn't rd1 pk1, we need to announce what the last pick was

    secondPartText = ""
    #next on the clock
    #current pick
    for t in teams:
        if t['tid'] == dp['tid']:
            teamName = t['region'] + ' ' + t['name']
            abbrev = t['abbrev']
    secondPartText += f"**On the clock:** {basics.team_mention(message, teamName, abbrev)}" + '\n'
    #get the next team that's up
    nextTeam = None
    for pick in picks:
        if pick['round'] == dp['round'] and pick['pick'] == dp['pick']+1:
            nextTeam = pick['tid']
    if nextTeam == None:
        for pick in picks:
            if pick['round'] == dp['round']+1 and pick['pick'] == 1:
                nextTeam = pick['tid']
    #if it still + none
    if nextTeam == None:
        nextTeamLine = '*End of draft.*'
    else:
        for t in teams:
            if t['tid'] == nextTeam:
                teamName = t['region'] + ' ' + t['name']
                abbrev = t['abbrev']
        nextTeamLine = f"**Next pick:** {basics.team_mention(message, teamName, abbrev)}"
    secondPartText += nextTeamLine + '\n' + '---'
    #the text var as we have it now forms the basic message we'll be modifying
    channelId = int(serversList[str(message.guild.id)]['draftchannel'].replace('<#', '').replace('>', ''))
    channel = shared_info.bot.get_channel(channelId)
    finalText = text + secondPartText
    if isinstance(channel, discord.TextChannel):
        # Send the message to the channel
        pickMessage = await channel.send(content=finalText)
    else:
        pickMessage = await message.channel.send(content=finalText)
    
    #now we can start the clock
    while clockTime > 0:
        newText = finalText + '\n' + f'*Time remaining: **{clockTime}** seconds.*'
        await pickMessage.edit(content=newText)
        if serversList[str(message.guild.id)]['draftStatus']['onTheClock'] != dp:
            await pickMessage.edit(content=finalText)
            return ['pick', pickMessage, text]
        clockTime -= 1
        await asyncio.sleep(0.9)
    await pickMessage.edit(content=finalText)
    return ['auto', pickMessage, text]
        
        



async def run_draft(text, message):
    serverId = message.guild.id
    export = serverExports[str(serverId)]
    draftStatus = serversList[str(serverId)]['draftStatus']
    players = export['players']
    teams = export['teams']
    settings = export['gameAttributes']
    if settings['phase'] != 5 and settings['phase'] != 6:
        await message.channel.send('Your export must be in the draft phase to run a draft.')
    else:
        picks = export['draftPicks']
        season = settings['season']
        draftStatus['totalRounds'] = settings['numDraftRounds']
        draftStatus['totalPicks'] = settings['numDraftPicksCurrent']
        #create a list of all the picks in the draft
        pickList = []
        for pick in picks:
            if pick['season'] == season:
                pickList.append(pick)
        pickList.sort(key=lambda x: x['pick'])
        pickList.sort(key=lambda x: x['round'])

        draftStatus['draftRunning'] = True

        for pick in pickList:
            if draftStatus['draftRunning'] == True:
                #get the times
                clockSettings = serversList[str(message.guild.id)]['draftclock']
                #convert to list
                clockSettings = clockSettings.split(',')
                clockList = []
                for c in clockSettings:
                    try:
                        c = int(c)
                        clockList.append(c)
                    except: pass
                #clockList will be used later
                if len(clockList) < pick['round']:
                    clockTime = 300
                else:
                    clockTime = int(clockList[pick['round']-1])
                draftStatus['draftRunning'] = True
                draftStatus['onTheClock'] = pick
                result = await draft_pick(pick, clockTime, message)
                if result[0] == 'auto':
                    #now we must auto-pick
                    draftBoards = serversList[str(message.guild.id)]['draftBoards']
                    draftFormulas = serversList[str(message.guild.id)]['draftPreferences']
                    selectionMade = False
                    draftClass = []
                    for p in players:
                        if p['draft']['year'] == season and p['tid'] == -2:
                            draftClass.append(p)
                    #CHECK FOR BOARD
                    for tid, board in draftBoards.items():
                        if int(tid) == pick['tid']:
                            if board != []:
                                #pick top player who was not already picked
                                for pid in board:
                                    print(pid)
                                    for p in players:
                                        if p['pid'] == pid and p['draft']['year'] == season and p in draftClass and selectionMade == False:
                                            if p['tid'] == -2:
                                                print('got here', p['firstName'], p['tid'])
                                                await select_player(pid, pick, message)
                                                selectionMade = True
                    if selectionMade == False:
                        #CHECK FOR FORMULA
                        for tid, formula in draftFormulas.items():
                            if int(tid) == pick['tid']:
                                if formula != '':
                                    #pick highest scoring
                                    try: ranked = basics.formula_ranking(draftClass, season, formula)
                                    except: ranked = basics.formula_ranking(draftClass, season, 'ovr + 5 * (24-age)')
                                    #select #1
                                    await select_player(ranked[0][0], pick, message)
                                    selectionMade = True
                    if selectionMade == False:
                        #JUST TAKE BEST AVAILABLE
                        defaultFormula = 'ovr + 5 * (24-age)'
                        ranked = basics.formula_ranking(draftClass, season, defaultFormula)
                        await select_player(ranked[0][0], pick, message)
                #either way, must edit the last message with the result
                for p in players:
                    if p['draft']['year'] == season and p['draft']['round'] == pick['round'] and p['draft']['pick'] == pick['pick']:
                        tid = p['tid']
                        for t in teams:
                            if t['tid'] == tid:
                                teamName = t['region'] + ' ' + t['name']
                                abbrev = t['abbrev']
                        selectionLine = f"The {basics.team_mention(message, teamName, abbrev)} select {p['ratings'][-1]['pos']} **{p['firstName']} {p['lastName']}**! ({season - p['born']['year']} yo {p['ratings'][-1]['ovr']}/{p['ratings'][-1]['pot']})"
                        newText = result[2] + selectionLine + '\n' + '---'
                        await result[1].edit(content=newText)
            
        export['gameAttributes']['phase'] = 6
        current_dir = os.getcwd()
        path_to_file = os.path.join(current_dir, "exports", f"{message.guild.id}-export.json")
        await basics.save_db(export, path_to_file)
        draftStatus['onTheClock'] = None

        await message.channel.send('Draft Complete.')

            




