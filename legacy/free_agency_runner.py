import shared_info
exports = shared_info.serverExports
serversList = shared_info.serversList
import basics
import pull_info
import fa_commands
import discord
import copy
import random

async def offer_score(offer, serverId):
    serverExport = exports[str(serverId)]
    players = serverExport['players']
    teams = serverExport['teams']
    season = serverExport['gameAttributes']['season']
    for p in players:
        if p['pid'] == offer['player']:
            playerOvr = p['ratings'][-1]['ovr']
            playerPos = p['ratings'][-1]['pos']
            playerAge = p['born']['year'] - season
            playerStats = p['stats'] #for loyalty calculation
            playerRequest = p['contract']['amount']
            #mood trait scores
            playerWinning = serversList[str(serverId)]['winning']
            playerFame = serversList[str(serverId)]['fame']
            playerLoyal = serversList[str(serverId)]['loyalty']
            playerMoney = serversList[str(serverId)]['money']
            if 'W' in p['moodTraits']:
                playerWinning += 1
            if 'F' in p['moodTraits']:
                playerFame += 1
            if 'L' in p['moodTraits']:
                playerLoyal += 1
            if '$' in p['moodTraits']:
                playerMoney += 1
            if playerAge > 25:
                playerWinning += (0.1*(playerAge - 25))
                playerLoyal += (0.1*(playerAge - 25))
            if playerAge < 25:
                playerFame += (0.33*(25 - playerAge))
                playerMoney += (0.33*(25 - playerAge))
            #calculate winning score (15% hype, 85% weighted win%)
            for t in teams:
                if t['tid'] == offer['team']:
                    #first step, weighted winning % over the past 5 years
                    ts = t['seasons']
                    #need this to make it expansion-team friendly
                    if len(ts) == 0:
                        teamWinPercent = 0
                        teamHype = 0.5
                    else:
                        if len(ts) > 4:
                            lastSeasonMultiplier = 16
                            if serverExport['gameAttributes']['phase'] == 7:
                                lastSeasonMultiplier = 512
                            teamWinPercent = ((ts[-1]['won'] / (ts[-1]['won'] + ts[-1]['lost'] + 0.000000001))*lastSeasonMultiplier + (ts[-2]['won'] / (ts[-2]['won'] + ts[-2]['lost']))*8 + (ts[-3]['won'] / (ts[-3]['won'] + ts[-3]['lost']))*4 + (ts[-4]['won'] / (ts[-4]['won'] + ts[-4]['lost']))*2 + (ts[-5]['won'] / (ts[-5]['won'] + ts[-5]['lost']))*1) / (15 + lastSeasonMultiplier)
                        else:
                            teamWinPercent = (ts[-1]['won'] / (ts[-1]['won'] + ts[-1]['lost'] + 0.000000001))
                        teamHype = ts[-1]['hype']
                    teamWinning = teamWinPercent*0.85 + teamHype*0.15
            winningScore = (0.5 + teamWinning)*offer['amount']
            #calculate fame score (50% hype, 50% rotation)
            #hype variable should be made already. if it's not, we've got other errors on our hands anyway, so may as well assume it's there
            #rotation calculation
            playersBetter = 0
            for p in players:
                if p['tid'] == offer['team'] and p['ratings'][-1]['ovr'] >= playerOvr:
                    if p['ratings'][-1]['pos'] == playerPos:
                        playersBetter += 1.5
                    else:
                        playersBetter += 0.75
            fameScore = (1.5 - playersBetter/10)
            if fameScore < 0.2:
                fameScore = 0.2
            fameScore = (fameScore*0.5 + (teamHype + 0.5)*0.5)*offer['amount']
            #calculate money score (80% money per year, 20% total money)
            moneyScore = 0.8*offer['amount'] + 0.2*(offer['amount']*offer['years'])

            #loyalty score (15% years with team prior, 85% trade penalty)
            yearsWith = 0
            for s in playerStats:
                if 'tid' in s:
                    if s['tid'] == offer['team'] and s['playoffs'] == False:
                        yearsWith += 1
            penalty = pull_info.trade_penalty(offer['team'], serverExport)
            loyalScore = (1 + (yearsWith/10))*0.15 + ((1 - penalty)*0.85)*offer['amount']

            #combine our scores into the final offer score
            loyalScore = loyalScore*playerLoyal
            winningScore = winningScore*playerWinning
            moneyScore = moneyScore*playerMoney
            fameScore = fameScore*playerFame
            finalScore = (loyalScore + winningScore + moneyScore + fameScore) / (playerLoyal + playerWinning + playerMoney + playerFame)
            #now for the final part... years!
            years = offer['years']
            if offer['amount'] < playerRequest/1000:
                
                if offer['option'] != None:
                    if offer['option'] == 'PO':
                        years += 1
                    if offer['option'] == 'TO':
                        years -= 1
                finalScore = finalScore*(1 + (-0.10*years))
            if offer['amount'] > playerRequest/1000:
                if offer['option'] != None:
                    if offer['option'] == 'PO':
                        years -= 1
                    if offer['option'] == 'TO':
                        years += 1
                finalScore = finalScore*(1 + (0.10*years))
            
            #adding later - options! 15% penalty for a TO. 15% boost for a PO.
            if offer['option'] != None:
                if offer['option'] == 'PO':
                    finalScore = finalScore*1.15
                if offer['option'] == 'TO':
                    finalScore = finalScore*0.85
                    
            #additional years boost
            if playerAge > 28:
                boost = 0.5 * (-0.75**(playerAge - 28)) + 0.5
                finalScore = finalScore*(1+boost*(offer['years']-1))


            return finalScore

async def run_fa(offerList, signings, playersDone, invalidations, serverId):
    print('NEW FA RUN!!!')
    export = exports[str(serverId)]
    players = export['players']
    teams = export['teams']
    events = export['events']
    settings = export['gameAttributes']
    season = settings['season']
    salaryCap = settings['salaryCap']/1000
    hardCap = float(serversList[str(serverId)]['hardcap'])
    minContract = settings['minContract']/1000
    serverSettings = serversList[str(serverId)]
    finalSignings = []
    validOffers = 0

    for p in players:
        if p['pid'] in playersDone:
            continue
        else:
            playersDone.append(p['pid'])
            playerName = p['firstName'] + ' ' + p['lastName']
            winningOffer = None
            toRemove = []
            for o in offerList:
                for t in teams:
                    if t['tid'] == o['team']:
                        teamName = t['region'] + ' ' + t['name']
                if o['player'] == p['pid']:
                    #validity
                    valid = True

                    #ROSTER
                    maxRoster = serverSettings['maxroster']
                    rostered = 0
                    for player in players:
                        if player['tid'] == o['team']:
                            if player['draft']['year'] == season:
                                if serverSettings['rookiescount'] == 'on':
                                    rostered += 1
                            else:
                                rostered += 1
                    if rostered > int(maxRoster):
                        valid = False
                        message = f"{playerName}'s offer from the {teamName} invalid due to max roster limit."
                        invalidations.append(message)

                    #PLAYER
                    if p['tid'] > -1:
                        valid = False
                        message = f"{playerName}'s offer from the {teamName} invalidated due to player not being a free agent."
                        invalidations.append(message)

                    #TOSIGN
                    totalSignings = 0
                    for s in signings:
                        if s == o['team']:
                            totalSignings+=1
                    try: toSign = int(serversList[str(serverId)]['toSign'][str(o['team'])])
                    except: toSign = 100000000
                    if totalSignings == toSign:
                        valid = False
                        message = f"{playerName}'s offer from the {teamName} invalidated due to team hitting their max signing number of {toSign} ({totalSignings} signings)."
                        invalidations.append(message)
                    
                    #SALARY CAP
                    ##team payroll
                    payroll = 0
                    
                    for player in players:
                        if player['tid'] == o['team']:
                            payroll += player['contract']['amount']
                    try:
                        releasedPlayers = export['releasedPlayers']
                        for r in releasedPlayers:
                            if r['tid'] == o['team']:
                                payroll += o['contract']['amount']
                    except: pass
                    payroll = payroll/1000
                    birdPlayer = False
                    if len(p['stats']) >= 1:
                        if p['stats'][-1]['tid'] == o['team'] and serverSettings['birdrights'] == 'on':
                            birdPlayer = True
                    if o['amount'] == minContract or birdPlayer:
                        #hardcap
                        if payroll + minContract > hardCap:
                            valid = False
                            message = f"{playerName}'s min offer from the {teamName} invalidated due to hard cap."
                            invalidations.append(message)
                    else:
                        if payroll + o['amount'] > salaryCap:
                            valid = False
                            message = f"{playerName}'s offer from the {teamName} invalidated due to going over the salary cap."
                            invalidations.append(message)
                    o['bird'] = birdPlayer
                    
                    #HOLDOUTS
                    holdoutMultiplier = float(serverSettings['holdout'])/100
                    holdoutAmount = holdoutMultiplier*p['contract']['amount']
                    if o['amount'] < holdoutAmount:
                        valid = False
                        message = f"{playerName}'s offer from the {teamName} invalidated due to holdout threshold."
                        invalidations.append(message)

                    #FINAL
                    
                    if valid:
                        validOffers += 1
                        if winningOffer == None:
                            winningOffer = o
                        else:
                            if o['score'] > winningOffer['score']:
                                winningOffer = o
                    else:
                        #delete offer
                        toRemove.append(o)
                    
            #NEXT STEPS
            for o in toRemove:
                offerList.remove(o)
            if winningOffer != None:
                o = winningOffer
                #validity checks are done. Now we have to get into the more complicated priority handling. I'm not gonna annotate this part since it's pretty much black magic, but it works
                goThru = True
                print('on player', o['player'])
                if o['priority'] > 1:
                    goThru = False
                    sumOfAbove = 0
                    playersAbove = 0
                    for offer in offerList:
                        if offer['team'] == o['team'] and offer['priority'] < o['priority']:
                            sumOfAbove += offer['amount']
                            playersAbove += 1
                    payroll = 0
                    playersRostered = 0
                    for player in players:
                        if player['tid'] == o['team']:
                            payroll += player['contract']['amount']
                            if player['draft']['year'] == season:
                                if serverSettings['rookiescount'] == 'on':
                                    playersRostered += 1
                            else:
                                playersRostered += 1
                    try:
                        for rp in export['releasedPlayers']:
                            if rp['tid'] == o['team']:
                                payroll += rp['contract']['amount']
                    except: pass
                    payroll = payroll/1000
                    capNumber = salaryCap
                    if o['bird']:
                        capNumber = hardCap
                    capRoom = capNumber - payroll
                    rosterRoom = int(serverSettings['maxroster']) - playersRostered
                    if (sumOfAbove+o['amount'] <= capRoom or sumOfAbove == 0) and playersAbove+1 <= rosterRoom:
                        goThru = True
                
                if goThru == False:
                    scoreDock = (1.1**(o['priority'] - 50))/(1.1**(o['priority'] - 50) + 1)*1
                    if scoreDock > 0.99:
                        scoreDock = 0.99
                    if scoreDock < 0.01:
                        scoreDock = 0.01
                    o['score'] = float(o['score'])*(1-scoreDock)
                    

                #back to rational living!
                toRemove = []
                if goThru:
                    for offer in offerList:
                        if offer['player'] == o['player']:
                            toRemove.append(offer)
                    signings.append(o['team'])
                    p['tid'] = o['team']
                    p['contract']['amount'] = o['amount']*1000
                    p['gamesUntilTradable'] = int(serverSettings['tradefa'])
                    if settings['phase'] == 8:
                        expDate = season + o['years']
                        var = 1
                    else:
                        expDate = season + o['years'] - 1
                        var = 0
                    p['contract']['exp'] = expDate
                    for i in range(o['years']):
                        salaryInfo = {
                            'season': season + var + i,
                            'amount': o['amount']*1000
                        }
                    #option
                    for t in teams:
                        if t['tid'] == o['team']:
                            teamAbbrev = t['abbrev']
                    eventText = f'The <a href="/l/10/roster/{teamAbbrev}/{season}">{teamName}</a> signed <a href="/l/10/player/{p["pid"]}">{playerName}</a> for ${o["amount"]}M/year through {expDate}'
                    if o['option'] != None:
                        optionText = f"Option: {expDate+1} {o['option']}"
                        p['note'] = optionText
                        p['noteBool'] = 1
                        eventText += f", plus a {o['option']}."
                    else:
                        eventText += '.'
                    
                    
                    #transaction
                    transaction = {
                        "season": season,
                        "phase": settings['phase'],
                        "tid": o['team'],
                        "type": "freeAgent"
                    }
                    try:
                        p['transactions'].append(transaction)
                    except KeyError:
                        p['transactions'] = []
                        p['transactions'].append(transaction)

                    #event
                    newEvent = {
                        'text': eventText,
                        'pids': [p['pid']],
                        'tids': [o['team']],
                        'season': season,
                        'type': 'freeAgent',
                        'eid': events[-1]['eid']+1
                    } 
                    events.append(newEvent)
                    finalSignings.append(o)
                
                else:
                    playersDone.remove(p['pid'])
                for o in toRemove:
                    offerList.remove(o)
    #await basics.save_db(serversList)
    print('got here no problem')
    invalidations = []          
    return (offerList, signings, playersDone, invalidations, finalSignings, validOffers)

async def resign_prices(playerId, teamId, serverExport, serverId):
    players = serverExport['players']
    season = serverExport['gameAttributes']['season']
    teams = serverExport['teams']
    settings = serverExport['gameAttributes']
    for p in players:
        if p['pid'] == playerId:
            basePrice = p['contract']['amount']
            
            baseYears = p['contract']['exp'] - season
            if basePrice == serverExport['gameAttributes']['minContract']:
                reSignFinal = [basePrice, baseYears]
            else:
                #mood calc
                offer = {
                    "player": playerId,
                    "team": teamId,
                    "amount": basePrice/1000,
                    "years": baseYears,
                    "option": None,
                    "priority": 1
                }
                score = await offer_score(offer, serverId)
                #average
                total = 0
                num = 0
                for t in teams:
                    if t['disabled'] == False:
                        num += 1
                        offer = {
                        "player": playerId,
                        "team": t['tid'],
                        "amount": basePrice/1000,
                        "years": baseYears,
                        "option": None,
                        "priority": 1
                    }
                        total += await offer_score(offer, serverId)
                scoreMultiplier = score / (total/num)
                newScoreMulti = 2 - scoreMultiplier
                if newScoreMulti <= 1:
                    reSignFinal = [basePrice, baseYears]
                else:
                    finalPrice = round(basePrice*(newScoreMulti + ((newScoreMulti - 1)*1.35)), -1)
                    if finalPrice > settings['maxContract']:
                        finalPrice = settings['maxContract']
                    reSignFinal = [finalPrice, baseYears]
            reSignPrices = {}
            for i in range(settings['maxContractLength']):
                i = i+1
                price = round(reSignFinal[0] + 0.15*(abs(i - reSignFinal[1]))*reSignFinal[0], -1)
                if price <= settings['maxContract'] and price >= settings['minContract']:
                    reSignPrices[i] = price
    reSignPrices['main'] = reSignFinal
    return(reSignPrices)




                    



                    



                    


