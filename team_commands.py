from shared_info import serverExports
from shared_info import serversList
import pull_info
import basics
import discord

def roster(embed, t, commandInfo):
    #need drastically different versions depending on whether or not this is the current roster
    export = serverExports[str(commandInfo['serverId'])]
    season = export['gameAttributes']['season']
    players = export['players']
    #we can deal with formatting later - for now, form the list of players depending on whether or not this is current
    #CURRENT - grab by TID and sort by rosterPosition
    #PAST - grab by final stats TID and sort by OVR
    playerRatings = [] #for TR calc
    if commandInfo['season'] == season:
        #CURRENT
        rosterList = []
        for p in players:
            if p['tid'] == t['tid']:
                rosterList.append([p['pid'], p['rosterOrder'], pull_info.pinfo(p)])
                playerRatings.append(p['ratings'][-1]['ovr'])
        rosterList.sort(key=lambda r: r[1])
    else:
        #PAST
        rosterList = []
        for p in players:
            if 'stats' in p:
                stats = p['stats']
                endTeam = -1
                for s in stats:
                    if s['season'] == commandInfo['season']:
                        endTeam = s['tid']
                if endTeam == t['tid']:
                    ratings = p['ratings']
                    ovr = ratings[-1]['ovr']
                    for r in ratings:
                        if r['season'] == commandInfo['season']:
                            ovr = r['ovr']
                    rosterList.append([p['pid'], ovr])
                    playerRatings.append(ovr)
        rosterList.sort(key=lambda r: r[1], reverse = True)
    #rosterList now contains our sorted roster. all that's left is to put it in the embed. but first, we need to do the top parts
    #note that there will be the stats roster if this is -sroster or if it is a past season, the regular roster otherwise
    embed.add_field(name=f"Team Rating: {pull_info.team_rating(playerRatings, False)}/100", value=f"Playoffs: {pull_info.team_rating(playerRatings, True)}/100", inline=True)
    text = ""
    overflow = ""
    if commandInfo['command'] == 'roster' and commandInfo['season'] == season:
        #add the payroll
        payroll = 0
        for p in players:
            if p['tid'] == t['tid']:
                payroll += p['contract']['amount']
        try:
            for rp in export['releasedPlayers']:
                if rp['tid'] == t['tid']:
                    payroll += rp['contract']['amount']
        except KeyError: pass
        salaryCap = export['gameAttributes']['salaryCap']
        hardCap = serversList[str(commandInfo['serverId'])]['hardcap']

        embed.add_field(name=f"Payroll: ${payroll/1000}M/${salaryCap/1000}M", value=f"Hard Cap: ${hardCap}M", inline=True)
        embed.add_field(name=f"Roster Spots: {export['gameAttributes']['maxRosterSize']-len(playerRatings)}", value=f"PTI: {t['pti'][0]} regular season, {t['pti'][1]} playoffs", inline=True)
        #now make the standard roster
        added = 0
        for player in rosterList:
            pid = player[0]
            for p in players:
                if p['pid'] == pid:
                    p = pull_info.pinfo(p)
                    added += 1
                    playerLine = f"{p['position']} **{p['name']}** - {commandInfo['season'] - p['born']} yo {p['ovr']}/{p['pot']} | ${p['contractAmount']}M/{p['contractExp']}" + '\n'
                    if added <= 15:
                        text += playerLine
                    else:
                        overflow += playerLine
    else:
        if commandInfo['command'] == 'psroster':
            playoffs = True
        else:
            playoffs = False
        #stats roster
        added = 0
        for player in rosterList:
            pid = player[0]
            for p in players:
                if p['pid'] == pid:
                    added += 1
                    stats = pull_info.pstats(p, commandInfo['season'], playoffs)
                    p = pull_info.pinfo(p, commandInfo['season'])
                    if stats == None:
                        statLine = '``No stats available.``'
                    else:
                        statLine = f"``{stats['pts']} pts, {stats['orb'] + stats['drb']} reb, {stats['ast']} ast, {stats['per']} PER``"

                    playerLine = f"{p['position']} **{p['name']}** - {commandInfo['season'] - p['born']} yo {p['ovr']}/{p['pot']} | {statLine}" +'\n'
                    if added <= 13:
                        text += playerLine
                    else:
                        overflow += playerLine
    embed.add_field(name='Roster', value=text, inline=False)
    if overflow != "":
        embed.add_field(name='Continued', value=overflow, inline=False)
    
    return embed

def lineup(embed, t, commandInfo):
    #simply grab current lineup
    export = serverExports[str(commandInfo['serverId'])]
    season = export['gameAttributes']['season']
    players = export['players']
    if commandInfo['season'] != season:
        embed.add_field(name='No Support for Past Seasons', value="Basketball GM doesn't store lineup data for past seasons, so this command is only good for current lineups. You can access past teams with the roster command.")
    else:
        lineup = []
        for p in players:
            if p['tid'] == t['tid']:
                lineup.append([p['pid'], p['rosterOrder']])
        lineup.sort(key=lambda l: l[1])
        text = ""
        overflow = ""
        added = 0
        for l in lineup:
            added += 1
            for p in players:
                if p['pid'] == l[0]:
                    p = pull_info.pinfo(p)

                    ptText = None
                    #get the PT info
                    if p['ptModifier'] == 1:
                        ptText = ""
                    if p['ptModifier'] == 1.25:
                        ptText = "(**+** minutes)"
                    if p['ptModifier'] == 0.75:
                        ptText = "(**-** minutes)"
                    if p['ptModifier'] == 1.5:
                        ptText = "(**++** minutes)"
                    if p['ptModifier'] == 0:
                        ptText = "(**0** minutes)"
                    if ptText == None:
                        ptText = f"(custom playing time: **{round(p['ptModifier']*p['ovr'], 2)}** OVR)"
                    
                    line = f"{added}. {p['position']} **{p['name']}** - {p['ovr']}/{p['pot']} {ptText}" + '\n'
                    if added == 5:
                        line += '---' + '\n'
                    if added <= 15:
                        text += line
                    else:
                        overflow += line
        embed.add_field(name='Team Lineup', value=text)
        if overflow != '':
            embed.add_field(name='Continued', value=overflow, inline=False)
        return embed

def picks(embed, t, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    season = export['gameAttributes']['season']
    picks = export['draftPicks']
    teams = export['teams']
    text = ""
    overflow = ""
    picks.sort(key=lambda p: p['season'])
    added = 0
    for p in picks:
        if p['tid'] == t['tid']:
            
            line = f"{p['season']} round {p['round']} pick"
            if p['pick'] != 0:
                line += f"(#{p['pick']})"
            if p['originalTid'] != p['tid']:
                for team in teams:
                    if team['tid'] == p['originalTid']:
                        abbrev = team['abbrev']
                line += f" ({abbrev})"
            if p['round'] == 1:
                line = '**' + line + '**'
            line += '\n'
            if added < 20:
                text += line
            else:
                overflow += line
            added+=1
    embed.add_field(name=f"{t['abbrev']} Draft Picks", value=text)
    if overflow != "":
        embed.add_field(name='Continued', value=overflow)
    return embed

def ownspicks(embed, t, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    season = export['gameAttributes']['season']
    picks = export['draftPicks']
    teams = export['teams']
    text = ""
    overflow = ""
    picks.sort(key=lambda p: p['season'])
    added = 0
    for p in picks:
        if p['originalTid'] == t['tid']:
            
            line = f"{p['season']} round {p['round']} pick - owned by"
            for team in teams:
                if team['tid'] == p['tid']:
                    abbrev = team['abbrev']
            print("Line reached!")
            line += f" {abbrev}"
            if p['round'] == 1:
                line = '**' + line + '**'
            line += '\n'
            if added < 20:
                text += line
            else:
                overflow += line
            added+=1
    print("Line 2 reached!")
    embed.add_field(name=f"{t['abbrev']} Draft Pick Owners", value=text)
    if overflow != "":
        embed.add_field(name='Continued', value=overflow, inline=False)
    return embed

def history(embed, team, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    season = export['gameAttributes']['season']
    picks = export['draftPicks']
    teams = export['teams']
    players = export['players']
    #GENERIC INFO
    overallRecord = [0, 0]
    totalSeasons = 0
    playoffs = 0
    titles = 0
    finals = 0
    bestRecord = [-1, 5]
    worstRecord = [2,0]

    #PREVIOUS 10 SEASONS
    lines = []
    for t in teams:
        if t['tid'] == team['tid']:
            seasons = t['seasons']
            for s in seasons:
                totalSeasons += 1
                overallRecord[0] += s['won']
                overallRecord[1] += s['lost']
                if s['playoffRoundsWon'] > -1:
                    playoffs += 1
                playoffResult = pull_info.playoff_result(s['playoffRoundsWon'], export['gameAttributes']['numGamesPlayoffSeries'], s['season'], True)
                if playoffResult == '**won championship**':
                    titles += 1
                    finals += 1
                if playoffResult == 'made finals':
                    finals += 1
                try: winP = s['won'] / (s['won'] + s['lost'])
                except ZeroDivisionError: winP = 0
                try:
                    if winP > bestRecord[0] / (bestRecord[0]+bestRecord[1]):
                        bestRecord = [s['won'], s['lost'], s['season']]
                    if winP < worstRecord[0] / (worstRecord[0]+worstRecord[1]):
                        worstRecord = [s['won'], s['lost'], s['season']]
                except ZeroDivisionError: pass
                line = f"{s['season']} - {s['abbrev']} - {s['won']}-{s['lost']}"
                if playoffResult != '':
                    line+= f', {playoffResult}'
                lines.append(line)
                #RETIRED JERSEYS
                retiredJerseys = ""
                if len(t['retiredJerseyNumbers']) == 0:
                    retiredJerseys = "*No retired jerseys.*"
                else:
                    for r in t['retiredJerseyNumbers']:
                        for p in players:
                            if p['pid'] == r['pid']:
                                retiredName = p['firstName'] + ' ' + p['lastName']
                        retiredJerseys += '**#' + str(r['number']) + '** - ' + retiredName + '\n'
    #CALCULATE TOP PLAYERS
    topPlayers = []
    for p in players:
        if 'stats' in p:
            stats = p['stats']
            pts = 0
            reb = 0
            ast = 0
            ewa = 0
            for s in stats:
                if s['tid'] == team['tid'] and s['playoffs'] == False:
                    pts += s['pts']
                    reb += s['drb'] + s['orb']
                    ast += s['ast']
                    ewa += s['ewa']
            topPlayers.append([f"{p['firstName']} {p['lastName']}", pts, reb, ast, ewa])
    topPlayers.sort(key=lambda t: t[4], reverse=True)
    ewaText = ""
    number = 0
    for t in topPlayers[:5]:
        ewaText += f"{number}. **{t[0]}** - {round(t[4], 1)} EWA" + '\n'
        number+=1
    topPlayers.sort(key=lambda t: t[1], reverse=True)
    ptsText = ""
    number = 0
    for t in topPlayers[:3]:
        ptsText += f"{number}. **{t[0]}** - {t[1]} pts" + '\n'
        number+=1
    topPlayers.sort(key=lambda t: t[2], reverse=True)
    rebText = ""
    number = 0
    for t in topPlayers[:3]:
        rebText += f"{number}. **{t[0]}** - {t[2]} reb" + '\n'
        number+=1
    topPlayers.sort(key=lambda t: t[3], reverse=True)
    astText = ""
    number = 0
    for t in topPlayers[:3]:
        astText += f"{number}. **{t[0]}** - {t[3]} ast" + '\n'
        number+=1

    #compile past seasons
    lines.reverse()
    lines = lines[:15]
    pastSeasonText = '\n'.join(lines)
    
    #embed time
    try: overallWinP = str(round(overallRecord[0]/(overallRecord[0]+overallRecord[1]), 4))[1:]
    except ZeroDivisionError: overallWinP = '0'
    try: playoffsP = str(round(100*(playoffs/totalSeasons), 2))
    except ZeroDivisionError: playoffsP = 0
    embed.add_field(name='Generic', value=f"**Overall record:** {overallRecord[0]}-{overallRecord[1]} ({overallWinP})" + '\n'
                    + f"{totalSeasons} seasons, {playoffs} playoffs ({playoffsP}%)" + '\n'
                    + f"Finals Appearances: {finals}" + '\n' + f"**Championships:** {titles}" + '\n'
                    + f"Best Record: {bestRecord[0]}-{bestRecord[1]} ({bestRecord[2]})" + '\n' + f"Worst Record: {worstRecord[0]}-{worstRecord[1]} ({worstRecord[2]})")
    embed.add_field(name='Retired Jerseys', value=retiredJerseys)
    embed.add_field(name='Top Players', value=ewaText)
    embed.add_field(name='Top Statistics', value=f"**__Points__**" + '\n' + ptsText + '\n' + '**__Rebounds__**' + '\n' + rebText + '\n' + '**__Assists__**' + '\n' + astText)
    embed.add_field(name='Past 15 Seasons', value=pastSeasonText)
    
    return embed

def finances(embed, team, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    season = export['gameAttributes']['season']
    picks = export['draftPicks']
    teams = export['teams']
    players = export['players']

    if commandInfo['season'] < season:
        embed.add_field(name='Error', value='Finances cannot be shown for past seasons, only current and future ones.')
    else:
        roster = []
        playerCount = 0
        payroll = 0
        for p in players:
            if p['tid'] == team['tid']:
                if p['contract']['exp'] >= commandInfo['season']:
                    roster.append([p['pid'], p['contract']['amount'], False])
                    payroll+= p['contract']['amount']
                    playerCount += 1
        releasedPlayers = export['releasedPlayers']
        for rp in releasedPlayers:
            if rp['tid'] == team['tid']:
                if rp['contract']['exp'] >= commandInfo['season']:
                    roster.append([rp['pid'], rp['contract']['amount'], True, rp['contract']['exp']])
                    payroll+= rp['contract']['amount']
        roster.sort(key=lambda r: r[1], reverse=True)
        text = ""
        overflow = ""
        contractNumber = 1
        number = 0
        if export['gameAttributes']['phase'] >= 7:
            contractNumber = 0
        for r in roster:
            for p in players:
                if p['pid'] == r[0]:
                    line = f"{p['ratings'][-1]['pos']} **{p['firstName'][0]}. {p['lastName']}** - $"
                    if r[2]:
                        line += f"{r[1]/1000}M/{season+contractNumber - r[3]}Y"
                        line = '*' + line + '*'
                    else:
                        line += f"{p['contract']['amount']/1000}M/{season+contractNumber - p['contract']['exp']}Y"
                    line += '\n'
                    if number < 16:
                        text += line
                    else:
                        overflow += line
                    number += 1
        embed.add_field(name=f"{team['abbrev']} Finances ({commandInfo['season']})", value=text)
        if overflow != "":
            embed.add_field(name='Continued', value=overflow)
        #add basic info
        salaryCap = export['gameAttributes']['salaryCap']/1000
        rosterLimit = export['gameAttributes']['maxRosterSize']
        for t in teams:
            if t['tid'] == team['tid']:
                hype = t['seasons'][-1]['hype']
        embed.add_field(name=f"Payroll: ${payroll/1000}M/${salaryCap}M", value=f"Cap space: ${round((salaryCap-(payroll/1000)), 2)}M" + '\n' + f'Roster spots: {rosterLimit-playerCount}' + '\n' + f'**Hype:** {hype}', inline=False)
    return embed

def seasons(embed, team, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    season = export['gameAttributes']['season']
    picks = export['draftPicks']
    teams = export['teams']
    players = export['players']
    #season is irrelevant. collect seasons of a team
    lines = []
    for t in teams:
        if t['tid'] == team['tid']:
            seasons = t['seasons']
            for s in seasons:
                info = pull_info.tinfo(t, s['season'])
                line = f"{s['season']} - {info['abbrev']} - {info['record']}"
                playoffResult = pull_info.playoff_result(info['roundsWon'], export['gameAttributes']['numGamesPlayoffSeries'], s['season'], True)
                if playoffResult != "":
                    line += f", {playoffResult}"
                lines.append(line)
    lines.reverse()
    numDivs, rem = divmod(len(lines), 15)
    numDivs += 1
    for i in range(numDivs):
        newLines = lines[(i*15):((i*15)+15)]
        text = '\n'.join(newLines)
        embed.add_field(name='Seasons', value=text)
    return embed

def tstats(embed, team, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    season = export['gameAttributes']['season']
    picks = export['draftPicks']
    teams = export['teams']
    players = export['players']

    if commandInfo['command'] == 'tstats':
        playoffs = False
    else:
        playoffs = True

    #quick check
    gamesPlayed = False
    for t in teams:
        if t['tid'] == team['tid']:
            stats = t['stats']
            for s in stats:
                if s['season'] == commandInfo['season'] and s['playoffs'] == playoffs and s['gp'] > 0:
                    gamesPlayed = True
    if gamesPlayed == False:
        embed.add_field(name='Error', value='No stats found for the specified season or playoff.')
    else:
    
        def rank(season, statName, stat, type, worseBetter=False):
            rank = 1
            for t in teams:
                stats = t['stats']
                for s in stats:
                    if s['season'] == season and s['playoffs'] == playoffs:
                        s['reb'] = s['drb'] + s['orb']
                        s['oppReb'] = s['oppDrb'] + s['oppOrb']
                        if worseBetter:
                            if type == 'total':
                                if s[statName] < stat:
                                    rank += 1
                            if type == 'average':
                                if s[statName]/s['gp'] < stat:
                                    rank += 1
                            if type == 'percent':
                                try: teamAmount = s[statName[0]]/s[statName[1]]
                                except ZeroDivisionError: teamAmount = 10000000000
                                try: origAmount = stat[0] / (stat[1])
                                except ZeroDivisionError: origAMount = 0
                                if teamAmount < origAmount:
                                    rank += 1
                        else:
                            if type == 'total':
                                if s[statName] > stat:
                                    rank += 1
                            if type == 'average':
                                if s[statName]/s['gp'] > stat:
                                    rank += 1
                            if type == 'percent':
                                try: teamAmount = s[statName[0]]/s[statName[1]]
                                except ZeroDivisionError: teamAmount = 10000000000
                                try: origAmount = stat[0] / (stat[1])
                                except ZeroDivisionError: origAmount = 0
                                if teamAmount > origAmount:
                                    rank += 1
            return rank
        
        teamStats = [
            ['**Points**', 'pts', 'average', False], ['Rebounds', 'reb', 'average', False], ['Assists', 'ast', 'average', False], ['Blocks', 'blk', 'average', False], ['Steals', 'stl', 'average', False], ['Turnovers', 'tov', 'average', True], ['FG%', ['fg', 'fga'], 'percent', False], ['3P%', ['tp', 'tpa'], 'percent', False], ['FT%', ['ft', 'fta'], 'percent', False] 
        ]
        opponentStats = [
            ['**Opponent points**', 'oppPts', 'average', True], ['Opp. rebounds', 'oppReb', 'average', True], ['Opp. assists', 'oppAst', 'average', True], ['Opp. blocks', 'oppBlk', 'average', True], ['Opp. steals', 'oppStl', 'average', True], ['Opp. TOV', 'oppTov', 'average', False], ['Opp. FG%', ['oppFg', 'oppFga'], 'percent', True], ['Opp. 3P%', ['oppTp', 'oppTpa'], 'percent', True], ['Opp. FT%', ['oppFt', 'oppFta'], 'percent', True]
        ]

        text = ''
        for ts in teamStats:
            for t in teams:
                if t['tid'] == team['tid']:
                    stats = t['stats']
                    for s in stats:
                        if s['season'] == commandInfo['season'] and s['playoffs'] == playoffs:
                            s['reb'] = s['drb'] + s['orb']
                            s['oppReb'] = s['oppDrb'] + s['oppOrb']
                            if ts[2] == 'percent':
                                statAmount = [s[ts[1][0]], s[ts[1][1]]]
                            else:
                                statAmount = s[ts[1]]
                                if ts[2] == 'average':
                                    statAmount = statAmount/s['gp']
                            statRank = rank(s['season'], ts[1], statAmount, ts[2], ts[3])
            if isinstance(statAmount, list):
                statAmount = (statAmount[0] / statAmount[1]) * 100
            text += f"{ts[0]}: {round(statAmount, 1)} (Rank: #{statRank})" + '\n'
        embed.add_field(name='Team Stats', value=text)

        oppText = ''
        for ts in opponentStats:
            for t in teams:
                if t['tid'] == team['tid']:
                    stats = t['stats']
                    for s in stats:
                        if s['season'] == commandInfo['season'] and s['playoffs'] == playoffs:
                            s['reb'] = s['drb'] + s['orb']
                            s['oppReb'] = s['oppDrb'] + s['oppOrb']
                            if ts[2] == 'percent':
                                statAmount = [s[ts[1][0]], s[ts[1][1]]]
                            else:
                                statAmount = s[ts[1]]
                                if ts[2] == 'average':
                                    statAmount = statAmount / s['gp']
                            statRank = rank(s['season'], ts[1], statAmount, ts[2], ts[3])
            if isinstance(statAmount, list):
                statAmount = (statAmount[0] / +statAmount[1])*100
            oppText += f"{ts[0]}: {round(statAmount, 1)} (Rank: #{statRank})" + '\n'
        embed.add_field(name='Opponent Stats', value=oppText)

    return embed

def sos(embed, team, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    season = export['gameAttributes']['season']
    picks = export['draftPicks']
    teams = export['teams']
    players = export['players']
    schedule = export['schedule']

    oppWins = 0
    oppLoses = 0
    home = 0
    road = 0
    for s in schedule:
        oppTid = None
        if s['homeTid'] == team['tid']:
            oppTid = s['awayTid']
            home += 1
        if s['awayTid'] == team['tid']:
            oppTid = s['homeTid']
            road += 1
        if oppTid != None:
            for t in teams:
                if t['tid'] == oppTid:
                    oppWins += t['seasons'][-1]['won']
                    oppLoses += t['seasons'][-1]['lost']
    
    sos = oppWins / (oppWins+oppLoses)
    embed.add_field(name='Strength of Schedule', value=f"Remainder of season: {str(round(sos, 3))[1:]}" + '\n' + f"Home games: {home} | Road games: {road}")
    return embed

def schedule(embed, team, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    season = export['gameAttributes']['season']
    picks = export['draftPicks']
    teams = export['teams']
    players = export['players']
    schedule = export['schedule']

    lines = []
    for s in schedule:
        if s['homeTid'] == team['tid']:
            for t in teams:
                if t['tid'] == s['awayTid']:
                    line = f"**vs** {t['name']} ({t['seasons'][-1]['won']}-{t['seasons'][-1]['lost']})"
                    lines.append(line)
        if s['awayTid'] == team['tid']:
            for t in teams:
                if t['tid'] == s['homeTid']:
                    line = f"**@** {t['name']} ({t['seasons'][-1]['won']}-{t['seasons'][-1]['lost']})"
                    lines.append(line)
    
    numDivs, rem = divmod(len(lines), 15)
    numDivs += 1
    for i in range(numDivs):
        newLines = lines[(i*15):((i*15)+15)]
        text = '\n'.join(newLines)
        embed.add_field(name='Schedule', value=text)
    
    return embed
    
def gamelog(embed, team, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    season = export['gameAttributes']['season']
    picks = export['draftPicks']
    teams = export['teams']
    players = export['players']
    try: games = export['games']
    except: 
        embed.add_field(name='Error', value='No box scores in file.')
        return embed
    
    lines = []
    number = 1
    for g in games:
        if g['won']['tid'] == team['tid'] or g['lost']['tid'] == team['tid']:
            #record the game
            homeTeam = g['teams'][0]['tid']
            roadTeam = g['teams'][1]['tid']
            line = f"``{number}.`` "
            for t in teams:
                if t['tid'] == roadTeam:
                    line += f"{t['abbrev']} {g['teams'][1]['pts']}"
                    if g['won']['tid'] == t['tid']:
                        line = '**' + line + '**'
                    line += ' - '
            for t in teams:
                if t['tid'] == homeTeam:
                    teamLine = f"{t['abbrev']} {g['teams'][0]['pts']}"
                    if g['won']['tid'] == t['tid']:
                        teamLine = '**' + teamLine + '**'
                    line+= teamLine
            for gt in g['teams']:
                if gt['tid'] == team['tid']:
                    line += f" ({gt['won']}-{gt['lost']})"
            lines.append(line)
            number += 1
    numDivs, rem = divmod(len(lines), 20)
    numDivs += 1
    for i in range(numDivs):
        newLines = lines[(i*20):((i*20)+20)]
        text = '\n'.join(newLines)
        embed.add_field(name='Game Log', value=text)
    
    return embed

def game(embed, team, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    try: games = export['games']
    except: 
        embed.add_field(name='Error', value='No box scores in file.')
        return embed
    #just use commandseason as the number
    gameNum = commandInfo['season']
    number = 1
    found = False
    for g in games:
        if g['won']['tid'] == team['tid'] or g['lost']['tid'] == team['tid']:
            if number == gameNum:
                found = True
                number += 1
                gameData = pull_info.game_info(g, export, commandInfo['message'])
                text = f"{gameData['fullScore']}" + '\n' + f"{gameData['quarters']}" + '\n' + '\n' + f"**Top Performers:**" + '\n' + '\n'.join(gameData['topPerformances']) + '\n'
                if g['clutchPlays'] != []:
                    for c in g['clutchPlays']:
                        text += '\n' + '***' + c.split('>')[1].replace('</a', '') + '** ' + c.split('>')[2] + '*'
                embed.add_field(name='Game Summary', value=text)
            else:
                number += 1
    if found == False:
        embed.add_field(name='Error', value='No game found.')
    return embed

def boxscore(embed, team, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    season = export['gameAttributes']['season']
    picks = export['draftPicks']
    teams = export['teams']
    players = export['players']
    try: games = export['games']
    except: 
        embed.add_field(name='Error', value='No box scores in file.')
        return embed
    #just use commandseason as the number
    gameNum = commandInfo['season']
    number = 1
    found = False
    for g in games:
        if g['won']['tid'] == team['tid'] or g['lost']['tid'] == team['tid']:
            
            if number == gameNum:
                found = True
                number += 1
                gameData = pull_info.game_info(g, export, commandInfo['message'])
                #boxscore time
                embed.add_field(name='Game Info', value=f"{gameData['fullScore']}" + '\n' + f"{gameData['quarters']}" + '\n' + '\n', inline=False)
                numDivs, rem = divmod(len(gameData['boxScore'][1]), 8)
                numDivs += 1
                for i in range(numDivs):
                    newLines = gameData['boxScore'][1][(i*8):((i*8)+8)]
                    text ='\n'.join(newLines)
                    embed.add_field(name=f"{gameData['away']} Box Score", value=text, inline=False)
                numDivs, rem = divmod(len(gameData['boxScore'][0]), 8)
                numDivs += 1
                for i in range(numDivs):
                    newLines = gameData['boxScore'][0][(i*8):((i*8)+8)]
                    text ='\n'.join(newLines)
                    embed.add_field(name=f"{gameData['home']} Box Score", value=text, inline=False)
                
                

            else:
                number += 1
    if found == False:
        embed.add_field(name='Error', value='No game found.')
    return embed
                








        



    

    
            



                
 