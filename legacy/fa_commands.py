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



async def offer(embed, text, commandInfo):
    offerList = serversList[commandInfo['serverId']]['offers']
    export = serverExports[commandInfo['serverId']]
    validFormat = False
    if '/' in text[-1]:
            name = ' '.join(text[1:-1])
            validFormat = True
            offerText = text[-1]
    else:
        name = ' '.join(text[1:])
        validFormat=True
        minContract = export['gameAttributes']['minContract']/1000
        offerText = f'{minContract}/1'
    if validFormat:
        offerPlayer = basics.find_match(name, export, True)
        for p in export['players']:
            if p['pid'] == offerPlayer:
                offerPlayer = pull_info.pinfo(p)
        offerText = offerText.split('/')
        try: 
            amount = float(offerText[0])
            amount = round(amount, 2)
        except: validFormat = False
        try: years = int(offerText[1])
        except: validFormat = False
        if validFormat:
            legalOffer = True
            #check for extras
            option = None
            if str.upper(text[-1]) == 'PO' or str.upper(text[-1]) == 'TO':
                if serversList[commandInfo['serverId']]['options'] == 'on':
                    option = str.upper(text[-1])
                else:
                    embed.add_field(name='⚠️ Warning', value='You attempted to offer an option, which is not turned on for this server. Therefore, that part of the offer was ignored.', inline=False)

            if offerPlayer['tid'] != -1:
                if offerPlayer['tid'] < -1:
                    legalOffer = False
                    embed.add_field(name='Illegal Offer', value=f"{offerPlayer['name']} isn't active, and thus you cannot offer them.")
                else:
                    embed.add_field(name='⚠️ Warning', value='This player is not currently a free agent. The offer has been recorded in case you anticipate that they will become a free agent, but it might be invalidated before FA is run.', inline=False)
            else:
                askingPrice = offerPlayer['contractAmount']
                holdoutLimit = float(serversList[commandInfo['serverId']]['holdout'])/100 * askingPrice
                if amount < holdoutLimit:
                    embed.add_field(name='⚠️ Warning', value=f'This server currently has holdouts enabled, and your offer of ${amount}M falls below the holdout amount for this player of ${holdoutLimit}M. Feel free to keep this offer in case that limit changes or in case the asking price decreases, but it might be invalidated before FA is run.')
                    
                

            #now specific validity checks
            if amount > (export['gameAttributes']['maxContract']/1000) or amount < (export['gameAttributes']['minContract']/1000):
                embed.add_field(name='Illegal Offer', value=f'Your amount of ${amount}M is not within the min/max contracts for the league.' + '\n' + f"Max contract: ${export['gameAttributes']['maxContract']/1000}M" + '\n' + f"Min Contract: ${export['gameAttributes']['minContract']/1000}M", inline=False)
                legalOffer = False
            
            if option == None:
                realYears = years
            else:
                realYears = years+1
            if realYears > (export['gameAttributes']['maxContractLength']) or realYears < (export['gameAttributes']['minContractLength']):
                embed.add_field(name='Illegal Offer', value=f'Your length of {years} years (with player or team options being counted as a year) is not within the min/max years for the league.' + '\n' + f"Max years: {export['gameAttributes']['maxContractLength']}" + '\n' + f"Min years: {export['gameAttributes']['minContractLength']}", inline=False)
                legalOffer = False

            #three year rule
            if serversList[commandInfo['serverId']]['threeyearrule'] == 'on' and export['gameAttributes']['phase'] != 7:
                if years > 2 and amount < (export['gameAttributes']['minContract']/1000)*2.5:
                    min = (export['gameAttributes']['minContract']/1000)*2.5
                    legalOffer = False
                    embed.add_field(name='Illegal Offer', value=f'Offers 3 or more years must be at least ${min}M per year.')

            #figure out the priority
            priority = 1
            for o in offerList:
                if o['team'] == commandInfo['userTid']:
                    priority += 1
            
            if legalOffer:
                offer = {
                    "player": offerPlayer['pid'],
                    "amount": amount,
                    "years": years,
                    "team": commandInfo['userTid'],
                    "option": option,
                    "priority": priority
                }

            optionText = ""
            if option != None:
                optionText = f", + {option}"
            if legalOffer:
                toDelete = []
                for o in offerList:
                    if o['team'] == commandInfo['userTid'] and o['player'] == offerPlayer['pid']:
                        toDelete.append(o)
                for d in toDelete:
                    offerList.remove(d)
                if toDelete != []:
                    embed.add_field(name='Offer Deleted', value='A previous offer for this player was cleared.', inline=False)


                offerList.append(offer)
                serversList[commandInfo['serverId']]['offers'] = offerList
                await basics.save_db(serversList)

                #score
                offerScore = round(await free_agency_runner.offer_score(offer, commandInfo['serverId']), 2)
                if export['gameAttributes']['phase'] == 7:
                    playerPrices = await free_agency_runner.resign_prices(offerPlayer['pid'], commandInfo['userTid'], export, commandInfo['serverId'])
                    odds = await basics.resign_odds(playerPrices, years, amount)
                    odds = str(round(odds*100, 2))
                    embed.add_field(name='✅ Offer Submitted', value=('Review details below:' + '\n' +
                    f"**Player:** {offerPlayer['name']} ({offerPlayer['ovr']}/{offerPlayer['pot']})" + '\n' +
                    f"**Contract:** ${amount}M/{years} years" + optionText) + '\n' +
                    f"**Priority:** #{priority} (can be edited)" + '\n' +
                    f"**Odds to accept:** {odds}%" + '\n' +  "(**Warning:** These odds can change before re-signings are run if you make trades or other roster moves, if such moves change player asking prices.)" + '\n' +
                    f'*Offers cannot be edited (except priority). To change this offer, delete it with {serversList[commandInfo["serverId"]]["prefix"]}deloffer [player name] and re-offer.*')
                
                else:
                    embed.add_field(name='✅ Offer Submitted', value=('Review details below:' + '\n' +
                    f"**Player:** {offerPlayer['name']} ({offerPlayer['ovr']}/{offerPlayer['pot']})" + '\n' +
                    f"**Contract:** ${amount}M/{years} years" + optionText) + '\n' +
                    f"**Priority:** #{priority} (can be edited)" + '\n' +
                    f"**Score:** {offerScore} (what player views offer as worth)" + '\n' +
                    f'*Offers cannot be edited (except priority). To change this offer, delete it with {serversList[commandInfo["serverId"]]["prefix"]}deloffer [player name] and re-offer.*')
                

                if serversList[str(commandInfo['serverId'])]['openmarket'] == 'on':
                    for o in offerList:
                        o['score'] = await free_agency_runner.offer_score(o, commandInfo['serverId'])
                    playerOffers = []
                    for o in offerList:
                        if int(o['player']) == int(offerPlayer['pid']):
                            if o['option'] != None:
                                optionText = f", + {o['option']}"
                            else:
                                optionText = ""
                            playerOffers.append({
                                "team": o['team'],
                                "score": o['score'],
                                "offer": f"${o['amount']}M/{o['years']}Y{optionText}"
                            })
                            print(playerOffers)
                            playerOffers = sorted(playerOffers, key=lambda o: o['score'])
                            text = f">>> **{offerPlayer['name']} - Top 5 Offers**" + '\n' + '--'
                            for o in playerOffers[5:]:
                                for t in export['teams']:
                                    if t['tid'] == o['team']:
                                        name = t['region'] + ' ' + t['name']
                                role = discord.utils.get(commandInfo['message'].guild.roles, name=name)
                                if role is not None:
                                    roleMention = role.mention
                                else:
                                    # Role does not exist, so just use the team name
                                    roleMention = name
                                text += f"• {roleMention} - {o['offer']} (score: **{round(o['score'], 2)}**)" + '\n'
                            text += '--'
                            channelId = int(serversList[str(commandInfo['serverId'])]['fachannel'].replace('<#', '').replace('>', ''))
                            channel = await shared_info.bot.get_channel(channelId)
                            if isinstance(channel, discord.TextChannel):
                                await channel.send(text)
                            else:
                                commandInfo['message'].channel.send('Your FA channel is invalid, so top 5 offers were not sent to it.')


                
                
    return embed

async def offers(embed, text, commandInfo):
    offerList = serversList[commandInfo['serverId']]['offers']
    players = serverExports[commandInfo['serverId']]['players']
    userOffers = []
    for o in offerList:
        if o['team'] == commandInfo['userTid']:
            userOffers.append(o)
    userOffers.sort(key=lambda o: o['priority'])
    textLines = []
    for u in userOffers:
        for p in players:
            if p['pid'] == u['player']:
                playerName = p['firstName'] + ' ' + p['lastName']
        if u['option'] != None:
            optionText = f', + {u["option"]}'
        else:
            optionText = ""
        text = f"Pri {u['priority']} - {playerName}, ${u['amount']}M/{u['years']}Y {optionText}"
        textLines.append(text)
    output = []
    for i in range(0, len(textLines), 20):
        output.append(textLines[i:i+20])
    for o in output:
        fieldText = ""
        for l in o:
            fieldText += l + '\n'
        embed.add_field(name='Offers', value=fieldText)
    if userOffers == []:
        embed.add_field(name='No offers!', value='Start making some by running the ``help offer`` command.', inline=False)
    
    toSign = 'Max Possible'
    toSignData = serversList[commandInfo['serverId']]['toSign']
    for t, v in toSignData.items():
        if t == str(commandInfo['userTid']):
            toSign = str(v)
    
    embed.add_field(name=f'Max Players to Sign: {toSign}', value='Edit this with ``-tosign [new number]``, or ``-tosign reset``', inline=False)

    
    return(embed)

async def deloffer(embed, text, commandInfo):
    offerList = serversList[commandInfo['serverId']]['offers']
    export = serverExports[commandInfo['serverId']]
    playerToDelete = ' '.join(text[1:])
    playerToDelete = basics.find_match(playerToDelete, export)
    toDelete = []
    for p in export['players']:
            if p['pid'] == playerToDelete:
                name = p['firstName'] + ' ' + p['lastName']
    for o in offerList:
        if o['team'] == commandInfo['userTid'] and o['player'] == playerToDelete:
            toClear = o
    
    try: 
        offerList.remove(toClear)
        embed.add_field(name='Success', value=f'Deleted offer for {name}.')
        await basics.save_db(serversList)
    except: 
        embed.add_field(name='Error', value=f"No offer found for {name}.")
    return embed

async def clearoffers(embed, text, commandInfo):
    offerList = serversList[commandInfo['serverId']]['offers']
    toClear = []
    for o in offerList:
        if o['team'] == commandInfo['userTid']:
            toClear.append(o)
    for t in toClear:
        offerList.remove(t)
    embed.add_field(name='Success', value='Cleared all your offers.')
    return embed

async def clearall(embed, text, commandInfo):
    serversList[commandInfo['serverId']]['offers'] = []
    embed.add_field(name='Success', value='Cleared all offers, league-wide.')
    return embed


async def move(embed, text, commandInfo):
    offerList = serversList[commandInfo['serverId']]['offers']
    export = serverExports[commandInfo['serverId']]
    playerToMove = ' '.join(text[1:-1])
    print(playerToMove)
    playerToMove = basics.find_match(playerToMove, export)
    newPriority = text[-1]
    try: newPriority = int(text[-1])
    except: 
        embed.add_field(name='Error', value='Please specify an integer as your new priority as the last word in the command.')
        return embed
    if isinstance(newPriority, int):
        for o in offerList:
            if o['team'] == commandInfo['userTid'] and o['player'] == playerToMove:
                currentPriority = o['priority']
                if currentPriority > newPriority:
                    o['priority'] = newPriority-0.1
                if currentPriority < newPriority:
                    o['priority'] = newPriority+0.1
                embed.add_field(name='Complete', value=f'Moved player to priority {newPriority}.')
        await basics.save_db(serversList)
        return embed

async def tosign(embed, text, commandInfo):
    toSign = None
    try: 
        toSign = int(text[1])
    except:
        if str.lower(text[1]) == 'reset':
            try:  
                del serversList[commandInfo['serverId']]['toSign'][str(commandInfo['userTid'])]
            except Exception as error: 
                print('failed: ', type(error).__name__)
            embed.add_field(name='Complete', value='Reset max number of players to sign to maximum.')
        else:

            embed.add_field(name='Error', value='Please set your new maximum signed players to an integer.')
    if toSign != None:
        
        serversList[commandInfo['serverId']]['toSign'][str(commandInfo['userTid'])] = toSign
        embed.add_field(name='Success', value=f"Set your maximum number of players to sign to {toSign}.")
    await basics.save_db(serversList)
    
    return embed

async def runfa(embed, text, commandInfo):
    offerList = serversList[commandInfo['serverId']]['offers']
    export = serverExports[commandInfo['serverId']]
    players = export['players']
    teams = export['teams']
    delay = 0
    if len(text) > 1:
        if text[1] == 'delay':
            try: delay = int(text[2])
            except: pass
    
    #BACK UP THE OFFERS
    for o in offerList:
        o['score'] = await free_agency_runner.offer_score(o, commandInfo['serverId'])
    serversList[str(commandInfo['serverId'])]['backupOffers'] = copy.deepcopy(offerList)
    await basics.save_db(serversList)
    #run it
    validOffers = 1
    signings = []
    playersDone = []
    invalidations = []
    finalSignings = []
    totalTimes = 200
    while validOffers > 0 and totalTimes > 0:
        totalTimes -= 1
        print('got here')
        faData = await free_agency_runner.run_fa(offerList, signings, playersDone, invalidations, commandInfo['serverId'])
        print('finished the function')
        offerList = faData[0]
        print('finished offerList var')
        signings = faData[1]
        print('finished signings var')
        playersDone = faData[2]
        print('playersDone var')
        print(faData[3])
        invalidations += faData[3]
        print('invalidations var')
        validOffers = faData[5]
        print('validOffers var')
        finalSignings += faData[4]
        print('finalSignings var')
        print(signings, validOffers)
    signingLines = []
    for f in finalSignings:
        for p in players:
            if p['pid'] == f['player']:
                name = p['firstName'] + ' ' + p['lastName']
        for t in teams:
            if t['tid'] == f['team']:
                teamName = t['abbrev']
        text = f"{name}, {teamName} - ${f['amount']}M/{f['years']}Y"
        signingLines.append(text)
    signingLines = [signingLines[i:i+20] for i in range(0, len(signingLines), 20)]
    for s in signingLines:
        s = '\n'.join(s)
        await commandInfo['message'].author.send(s)
    await commandInfo['message'].author.send('**ERRORS**')
    invalidations = set(invalidations)
    invalidations = list(invalidations)
    
    lines = invalidations
    numDivs, rem = divmod(len(lines), 15)
    numDivs += 1
    for i in range(numDivs):
        newLines = lines[(i*15):((i*15)+15)]
        text ='\n'.join(newLines)
        if text != '':
            await commandInfo['message'].author.send(text)
    
    confirmEmbed = discord.Embed(
    title='Confirmation',
    description=f"{export['gameAttributes']['season']} season")
    confirmEmbed.add_field(name='FA Completed', value="I've DMd you the list of signings for a last look. Press the ✅ to send signings to the server's FA channel, update the server export file with the signings, and clear all existing offers from database.")
    confirmEmbed = await commandInfo['message'].channel.send(embed=confirmEmbed)
    await confirmEmbed.add_reaction('✅')
    def check(reaction, user):
        return str(reaction.emoji) == '✅' and user == commandInfo['message'].author and reaction.message.id == confirmEmbed.id

    try:
        reaction, user = await shared_info.bot.wait_for('reaction_add', timeout=300, check=check)
    except asyncio.TimeoutError:
        await confirmEmbed.edit(content='❌ Timed out.')
        current_dir = os.getcwd()
        path_to_file = os.path.join(current_dir, "exports", f"{commandInfo['serverId']}-export.json")
        shared_info.serverExports[commandInfo['serverId']] = basics.load_db(path_to_file)
    else:
        await confirmEmbed.edit(content='✅ Confirmed. Sending signings to transaction channel...')
        errorSent = False
        for o in finalSignings:
            for p in players:
                if p['pid'] == o['player']:
                    name = p['firstName'] + ' ' + p['lastName']
                    rating = f"{p['ratings'][-1]['ovr']}/{p['ratings'][-1]['pot']}"
                    age = str(export['gameAttributes']['season'] - p['born']['year'])
                    pos = p['ratings'][-1]['pos']
                    traits = ' '.join(p['moodTraits'])
            for t in teams:
                if t['tid'] == o['team']:
                    teamName = t['region'] + ' ' + t['name']
                    abbrev = t['abbrev']
            text = '>>> **FA Signing**' + '\n' + '--' + '\n'
            role = discord.utils.get(commandInfo['message'].guild.roles, name=teamName)
            if role is not None:
                roleMention = role.mention
            else:
                # Role does not exist, so just use the team name
                roleMention = teamName
            emoji = discord.utils.get(commandInfo['message'].guild.emojis, name=str.lower(abbrev))
            if emoji is not None:
                teamText = f"{roleMention} {emoji}"
            else:
                teamText = roleMention
            text += f"The {teamText} signed **{name}** to a {o['years']}-year, ${o['amount']}M contract." + '\n'
            text += f"{pos} - {age} yo {rating} | *Traits: {traits}*" + '\n' + '--'

            #send message to channel
            errorSent = False
            channelId = int(serversList[str(commandInfo['serverId'])]['fachannel'].replace('<#', '').replace('>', ''))
            channel = shared_info.bot.get_channel(channelId)
            if isinstance(channel, discord.TextChannel):
                # Send the message to the channel
                await channel.send(text)
            else:
                if errorSent == False:
                    commandInfo['message'].channel.send('Your FA channel is invalid, so signings were not sent. FA was still executed.')
                    errorSent = True
        #await confirmEmbed.edit(content='✅ **Signings sent!** Now, saving changes to server export file...')
        #current_dir = os.getcwd()
        #path_to_file = os.path.join(current_dir, "exports", f"{commandInfo['serverId']}-export.json")
        #await basics.save_db(export, path_to_file)
        await confirmEmbed.edit(content='✅ **Signings sent! FA Complete.** Run -updateexport for a new link.')
    
    return embed

        

async def resignings(embed, text, commandInfo):
    offerList = serversList[commandInfo['serverId']]['offers']
    export = serverExports[commandInfo['serverId']]
    players = export['players']
    season = export['gameAttributes']['season']
    settings = export['gameAttributes']
    if settings['phase'] != 7:
        embed.add_field(name='Error', value='Export must be in the re-signings phase.')
        return embed

    #create a list of the team's re-signings - should be useful
    resigns = export['negotiations']
    teamResigns = []
    for r in resigns:
        try:
            if r['tid'] == commandInfo['userTid'] and r['resigning'] == True:
                for p in players:
                    if p['pid'] == r['pid']:
                        playerRating = p['ratings'][-1]['ovr'] + p['ratings'][-1]['pot']
                teamResigns.append([r['pid'], playerRating])
        except KeyError: pass
    teamResigns.sort(key=lambda r: r[1], reverse=True)


    lines = []
    if len(text) == 1:
        progressMessage = await commandInfo['message'].channel.send('Calculating re-signings prices...')
        numberAdded = 0
        for r, pr in teamResigns:
            for p in players:
                if p['pid'] == r:
                    numberAdded += 1
                    rating = str(p['ratings'][-1]['ovr']) + '/' + str(p['ratings'][-1]['pot'])
                    age = str(season - p['born']['year'])
                    reSignPrice = await free_agency_runner.resign_prices(p['pid'], commandInfo['userTid'], export, commandInfo['serverId'])
                    lines.append(p['ratings'][-1]['pos'] + ' ' + p['firstName'] + ' ' + p['lastName'] + ' (' + age + 'yo ' + rating + ') - $' + str(reSignPrice['main'][0]/1000) + 'M / ' + str(reSignPrice['main'][1]) + 'Y')
        if lines == []:
            lines.append('None!')
        lines.append('')
        lines.append(f'Run -rs [player name] to see what each player wants over different years. Use -offer just like in free agency to offer a player. An offer at or above their asking price for the given years will always be accepted. An offer lower will be randomly accepted or declined, with the chances depending on how much lower it is.' + '\n' + 'If you have team options, you can accept them with -ao [player].')
        numDivs, rem = divmod(len(lines), 10)
        numDivs += 1
        for i in range(numDivs):
            newLines = lines[(i*10):((i*10)+10)]
            text = '\n'.join(newLines)
            if text !='':
                embed.add_field(name='Re-Signings', value=text, inline = False)
        
        #team option check
        optionsText = ""
        for r, pr in teamResigns:
            for p in players:
                if p['pid'] == r:
                    if 'note' and 'noteBool' in p:
                        if 'note' == f"Option: {season+1} TO":
                            optionAmount = p['salaries'][-1]['amount']/1000
                            optionsText += p['ratings'][-1]['pos'] + ' ' + p['firstName'] + ' ' + p['lastName'] + ' - $' + str(optionAmount) + 'M TO' + '\n'
        if optionsText != "":
            embed.add_field(name='Team Options', value=optionsText, inline=False)
        #cap space
        salaryCap = settings['salaryCap']
        hardCap = float(serversList[str(commandInfo['serverId'])]['hardcap'])*1000
        teamPayroll = 0
        for p in players:
            if p['tid'] == commandInfo['userTid']:
                teamPayroll += p['contract']['amount']
        try:
            for r in export['releasedPlayers']:
                if r['tid'] == commandInfo['userTid']:
                    teamPayroll += r['contract']['amount']
        except: pass
        #sum of offers
        offerSum = 0
        for o in offerList:
            if o['team'] == commandInfo['userTid']:
                offerSum += float(o['amount'])
        #tie it together
        capText = "Salary Cap Room: $" + str((salaryCap - teamPayroll)/1000) + 'M' + '\n' + 'Hard Cap Room: $' + str((hardCap - teamPayroll)/1000) + 'M' + '\n' + 'Sum of current offers: $' + str(round(offerSum, 2)) + 'M'
        if round(offerSum, 2)*1000 + teamPayroll > hardCap:
            capText += '\n' + '⚠️ Warning: Your offers total more than the hard cap, which means that they cannot all be accepted. Check your offers priority list to ensure you have them sorted correctly (re-signings are ran in priority order).'
        embed.add_field(name='Finances', value=capText, inline=False)
        await progressMessage.delete()


    else:
        pid = basics.find_match(' ' + ' '.join(text[1:]), export, True)
        for p in players:
            if p['pid'] == pid:
                if [p['pid'], p['ratings'][-1]['ovr'] + p['ratings'][-1]['pot']] in teamResigns:
                    reSignPrice = await free_agency_runner.resign_prices(p['pid'], commandInfo['userTid'], export, commandInfo['serverId'])
                    text = ""
                    for r in reSignPrice:
                        if r != 'main':
                            if r == reSignPrice['main'][1]:
                                text += '**'
                            text += str(r) + 'Y: $' + str(reSignPrice[r]/1000) + 'M'
                            if r == reSignPrice['main'][1]:
                                text += '**'
                            text += '\n'
                    embed.add_field(name=p['firstName'] + ' ' + p['lastName'] + ' Re-Signing Prices', value=text)
                else:
                    embed.add_field(name='Error', value=p['firstName'] + ' ' + p['lastName'] + " isn't up for re-signing on your team.")
    return embed

import random
async def runresign(embed, text, commandInfo):
    offerList = serversList[commandInfo['serverId']]['offers']
    export = serverExports[commandInfo['serverId']]
    players = export['players']
    teams = export['teams']
    season = export['gameAttributes']['season']
    settings = export['gameAttributes']
    if settings['phase'] == 7:
        pricesDb = {}
        for n in export['negotiations']:
            for p in players:
                if p['pid'] == n['pid']:
                    pricesDb[str(p['pid'])] = await free_agency_runner.resign_prices(p['pid'], n['tid'], export, commandInfo['serverId'])
        for team in teams:
            if team['disabled'] == False:
                teamOffers = []
                text = ""
                #run re-signings for each team
                for o in offerList:
                    if o['team'] == team['tid']:
                        teamOffers.append(o)
                teamOffers.sort(key=lambda t: int(t['priority']))
                for t in teamOffers:
                    for p in players:
                        if p['pid'] == t['player']:
                            valid = False
                            for n in export['negotiations']:
                                if n['pid'] == p['pid'] and n['tid'] == team['tid']:
                                    valid = True
                            payroll = 0
                            for pl in players:
                                if pl['tid'] == team['tid']:
                                    payroll += pl['contract']['amount']
                            try:
                                for rp in export['releasedPlayers']:
                                    if rp['tid'] == team['tid']:
                                        payroll += rp['contract']['amount']
                                            
                            except: pass
                            if payroll + t['amount']*1000 > settings['luxuryPayroll']:
                                valid = False
                            if valid:
                                accepted = False
                                #time for the sauce
                                playerPrices = pricesDb[str(p['pid'])]
                                probability = await basics.resign_odds(playerPrices, float(t['years']), float(t['amount']))
        
                                if random.random() <= probability:
                                    accepted = True
                                else:
                                    teamList = serversList[str(commandInfo['serverId'])]['teamlist']
                                    for tl in teamList:
                                        if teamList[tl] == team['tid']:
                                            toDm = shared_info.bot.get_user(int(tl))
                                            textToSend = p['firstName'] + ' ' + p['lastName'] + ' declines your offer (' + str(round(probability*100, 2)) + '% chance to accept).'
                                            try: await toDm.send(textToSend)
                                            except: print('could not send DM to', int(tl))
                                if accepted:
                                    #re-signing festivities
                                    print('got here')
                                    p['tid'] = team['tid']
                                    p['contract'] = {
                                        "amount": t['amount']*1000,
                                        "exp": season + t['years']
                                    }
                                    p['gamesUntilTradable'] = serversList[str(commandInfo['serverId'])]['traderesign']
                                    for i in range(t['years']):
                                        salaryInfo = dict()
                                        salaryInfo['season'] = season + i + 1
                                        salaryInfo['amount'] = t['amount']*1000
                                        p['salaries'].append(salaryInfo)
                                    events = export['events']
                                    newEvent = dict()
                                    newEvent['text'] = 'The <a href="/l/10/roster/' + team['abbrev'] + '/' + str(season) + '">' + team['name'] + '</a> re-signed <a href="/l/10/player/' + str(p['pid']) + '">' + p['firstName'] + ' ' + p['lastName'] + '</a> for $' + str(t['amount']) + 'M/year through ' + str(float(t['years']) + season) + '.'
                                    newEvent['pids'] = [p['pid']]
                                    newEvent['tids'] = [team['tid']]
                                    newEvent['season'] = season
                                    newEvent['type'] = 'reSigned'
                                    newEvent['eid'] = events[-1]['eid'] + 1
                                    events.append(newEvent)
                                    #print(p['tid'])
                                    text += '• **' + p['firstName'] + ' ' + p['lastName'] + '** - $' + str(t['amount']) + 'M/' + str(t['years']) + ' years' + '\n'
                if text == "":
                    text = "*No players.*" + '\n'
                finalText = '>>> **Re-Signings**' + '\n' + '--' + '\n' + 'The '
                rolePing = basics.team_mention(commandInfo['message'], team['region'] + ' ' + team['name'], team['abbrev'])
                finalText += rolePing + ' re-sign:' + '\n' + text + '--'
                #print(int(serversList[str(commandInfo['serverId'])]['fachannel'].replace('<#', '').replace('>', '')))
                transChannel = shared_info.bot.get_channel(int(serversList[str(commandInfo['serverId'])]['fachannel'].replace('<#', '').replace('>', '')))
                await transChannel.send(finalText)
        current_dir = os.getcwd()
        path_to_file = os.path.join(current_dir, "exports", f"{commandInfo['serverId']}-export.json")
        await basics.save_db(export, path_to_file)
        embed.add_field(name='Complete', value='Re-Signings run. Run -updateexport to get a new link.')
    else:
        embed.add_field(name='Could Not Run Re-Signings', value='Make sure your export is in the re-signings phase, and that you have mod permissions.')
    return embed


async def bulkoffer(embed, text, commandInfo):
    teamList = serversList[str(commandInfo['serverId'])]['teamlist']
    draftBoards = serversList[str(commandInfo['serverId'])]['draftBoards']
    players = serverExports[str(commandInfo['serverId'])]['players']
    season = serverExports[str(commandInfo['serverId'])]['gameAttributes']['season']
    offerList = serversList[str(commandInfo['serverId'])]['offers']
    settings = serverExports[str(commandInfo['serverId'])]['gameAttributes']
    userTeam = commandInfo['userTid']
    if userTeam == -1:
        embed.add_field(name='Error', value="You don't seem to be assigned as a GM of a team.")
    else:
        bulkGroup = (' '.join(text[1:])).split('\n')
        priority = 1
        for player in bulkGroup:
            pid = basics.find_match(player, serverExports[str(commandInfo['serverId'])], True, True)
            for p in players:
                if p['pid'] == pid:
                    name = p['firstName'] + ' ' + p['lastName']
                    thePlayer = p
            if thePlayer['tid'] != -1:
                print('error for player')
                embed.add_field(name='Error', value=f"{name} is not a free agent. The offer has been recorded regardless in case you anticipate them becoming one, but it may be invalidated before FA is run.")
            offer = {
                "player": thePlayer['pid'],
                "amount": settings['minContract']/1000,
                "years": 1,
                "team": commandInfo['userTid'],
                "option": None,
                "priority": priority
            }
            priority += 1
            toDelete = []
            for o in offerList:
                if o['team'] == commandInfo['userTid'] and o['player'] == thePlayer['pid']:
                    toDelete.append(o)
            for d in toDelete:
                offerList.remove(d)
            if toDelete != []:
                embed.add_field(name='Offer Deleted', value='A previous offer for this player was cleared.', inline=False)


            offerList.append(offer)
            serversList[commandInfo['serverId']]['offers'] = offerList
            
        await basics.save_db(serversList)
        embed.add_field(name='Success', value=f"Everyone who doesn't have an error message has been offered a 1-year minimum contract.")
    return embed
