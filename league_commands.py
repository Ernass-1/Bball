from shared_info import serverExports
import pull_info
import basics
import discord

#LEAGUE COMMANDS

def fa(embed, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']
    sortBy = 'ovr'
    values = ['ovr', 'pot', 'hgt', 'stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb']
    if len(commandInfo['text']) > 1:
        if str.lower(commandInfo['text'][1]) in values:
            sortBy = commandInfo['text'][1]
    freeAgents = []
    for p in players:
        if p['tid'] == -1:
            playerInfo = pull_info.pinfo(p)
            freeAgents.append(playerInfo)
    commandContent = basics.player_list_embed(freeAgents, commandInfo['pageNumber'], export['gameAttributes']['season'], sortBy)
    
    embed.add_field(name=f"Sorted by {commandContent[1]}", value=commandContent[0])
    return embed

def draft(embed, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    season = export['gameAttributes']['season']
    players = export['players']
    sortBy = ['draftRound']
    values = ['ovr', 'pot', 'hgt', 'stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb']
    if len(commandInfo['text']) > 1:
        if str.lower(commandInfo['text'][1]) in values:
            sortBy = commandInfo['text'][1]
    draftProspects = []
    for p in players:
        if commandInfo['season'] < season:
            if p['draft']['year'] == commandInfo['season'] and p['draft']['round'] != 0:
                playerInfo = pull_info.pinfo(p)
                draftProspects.append(playerInfo)
                draftProspects.sort(key=lambda p: p['draftPick'])
        else:
            if p['draft']['year'] == commandInfo['season'] and p['tid'] == -2:
                playerInfo = pull_info.pinfo(p)
                draftProspects.append(playerInfo)
                if sortBy == ['draftRound']:
                    sortBy = ['value']
    
    if sortBy == ['draftRound']:
        commandContent = basics.player_list_embed(draftProspects, commandInfo['pageNumber'], export['gameAttributes']['season'], sortBy, False, True)
    else:
        commandContent = basics.player_list_embed(draftProspects, commandInfo['pageNumber'], export['gameAttributes']['season'], sortBy)
    embed.add_field(name=f"Sorted by {commandContent[1]}", value=commandContent[0])
    return embed
    
def pr(embed, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']
    teams = export['teams']
    season = export['gameAttributes']['season']

    powerRanking = []

    for t in teams:
        roster = []
        for p in players:
            if commandInfo['season'] == season:
                if p['tid'] == t['tid']:
                    roster.append(p['ratings'][-1]['ovr'])
            else:
                if 'stats' in p:
                    stats = p['stats']
                    lastTeam = -1
                    for s in stats:
                        if s['season'] == commandInfo['season']:
                            lastTeam = s['tid']
                    if lastTeam == t['tid']:
                        roster.append(pull_info.pinfo(p, commandInfo['season']['ovr']))
        teamInfo = pull_info.tinfo(t, commandInfo['season'])
        powerRanking.append([teamInfo['name'], teamInfo['record'], pull_info.team_rating(roster, False)])
    
    powerRanking.sort(key=lambda p: int(p[2]), reverse=True)
    lines = []
    number = 1
    for p in powerRanking:
        lines.append(f"``{number}.`` **{p[0]}** ({p[1]}) - **{p[2]}/100** TR")
        number += 1
    numDivs, rem = divmod(len(lines), 15)
    numDivs += 1
    for i in range(numDivs):
        newLines = lines[(i*15):((i*15)+15)]
        text ='\n'.join(newLines)
        embed.add_field(name=f"Power Rankings", value=text, inline=False)
    return embed


def top(embed, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']
    sortBy = 'ovr'
    if len(commandInfo['text']) > 1:
        sortBy = commandInfo['text'][1]
    activePlayers = []
    for p in players:
        if p['tid'] > -2:
            playerInfo = pull_info.pinfo(p)
            activePlayers.append(playerInfo)
    commandContent = basics.player_list_embed(activePlayers, commandInfo['pageNumber'], export['gameAttributes']['season'], sortBy)
    
    embed.add_field(name=f"Sorted by {commandContent[1]}", value=commandContent[0])
    return embed

def injuries(embed, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']

    injuries = []
    for p in players:
        if p['injury']['type'] != 'Healthy':
            injuries.append([f"{p['ratings'][-1]['pos']} **{p['firstName']} {p['lastName']}** ({p['ratings'][-1]['ovr']}/{ p['ratings'][-1]['pot']})", p['ratings'][-1]['ovr']+p['injury']['gamesRemaining'], p['injury']])
    injuries.sort(key=lambda i: i[1], reverse=True)
    lines = []
    for i in injuries:
        lines.append(f"{i[0]} - {i[2]['type']}, {i[2]['gamesRemaining']} games")
    numDivs, rem = divmod(len(lines), 15)
    numDivs += 1
    for i in range(numDivs):
        newLines = lines[(i*15):((i*15)+15)]
        text ='\n'.join(newLines)
        embed.add_field(name=f"Injuries", value=text, inline=False)
    
    return embed

def top(embed, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']
    sortBy = 'ovr'
    if len(commandInfo['text']) > 1:
        sortBy = commandInfo['text'][1]
    activePlayers = []
    for p in players:
        if p['tid'] > -2:
            playerInfo = pull_info.pinfo(p)
            activePlayers.append(playerInfo)
    commandContent = basics.player_list_embed(activePlayers, commandInfo['pageNumber'], export['gameAttributes']['season'], sortBy)
    
    embed.add_field(name=f"Sorted by {commandContent[1]}", value=commandContent[0])
    return embed

def deaths(embed, commandInfo):
    cont = commandInfo['message'].content.split(' ')
    deathInfo = ['deathInfo', 'yearDied']
    if len(cont) > 1:
        if str.lower(cont[1]) in ['age', 'oldest']:
            deathInfo = ['deathInfo', 'ageDied']

    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']
    deadPlayers = []
    for p in players:
        p = pull_info.pinfo(p)
        if p['deathInfo']['died']:
            deadPlayers.append(p)
    deadPlayers.sort(key=lambda p: p['deathInfo']['yearDied'], reverse=True)
    commandContent = basics.player_list_embed(deadPlayers, commandInfo['pageNumber'], export['gameAttributes']['season'], deathInfo)
    
    embed.add_field(name=f"Sorted by {commandContent[1]}", value=commandContent[0])
    return embed

def leaders(embed, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    players = export['players']
    statTypes = ['pts', 'reb', 'drb', 'orb', 'ast', 'stl', 'blk', 'tov', 'min', 'tov', 'pm', 'gp', 'ows', 'dws', 'ortg', 'drtg', 'pm100', 'onOff100', 'vorp', 'obpm', 'dbpm', 'ewa', 'per', 'usgp', 'dd', 'td', 'qd', 'fxf', 'fg%', 'tp%', 'ft%', 'at-rim%', 'low-post%', 'mid-range%']
    sortBy = ['stats', 'pts']
    if len(commandInfo['text']) > 1:
        if commandInfo['text'][1] in statTypes:
            sortBy = ['stats', str.lower(commandInfo['text'][1]).replace('%', '')]
        else:
            text = "These stats are supported: " + '\n' + '\n'
            for s in statTypes:
                text += f"• ``{s}``" + '\n'
            embed.add_field(name='Error', value=text)
            return embed
    playerList = []
    for p in players:
        played = False
        stats = p['stats']
        for s in stats:
            if s['season'] == commandInfo['season']:
                if s['gp'] > 0:
                    played = True
        if played:
            playerInfo = pull_info.pinfo(p, commandInfo['season'])
            playerList.append(playerInfo)
    commandContent = basics.player_list_embed(playerList, commandInfo['pageNumber'], commandInfo['season'], sortBy)
    
    embed.add_field(name=f"Sorted by {commandContent[1]}", value=commandContent[0])
    return embed

def matchups(embed, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    teams = export['teams']
    text = commandInfo['text']
    abbrevs = []
    teamOne = None
    teamTwo = None
    for t in teams:
        abbrevs.append(str.lower(t['abbrev']))
    if len(text) < 3:
        embed.add_field(name='Error', value='Please provide two teams to search for matchups between.')
        return embed
    else:
        if str.lower(text[1]) in abbrevs:
            teamOne = str.lower(text[1])
        if str.lower(text[2]) in abbrevs:
            teamTwo = str.lower(text[2])
    if teamOne == None or teamTwo == None:
        embed.add_field(name='Team Finding Error', value='Make sure you use current team abbreviations.')
    else:
        for t in teams:
            if str.lower(t['abbrev']) == teamOne:
                teamOne = t['tid']
            if str.lower(t['abbrev']) == teamTwo:
                teamTwo = t['tid']
        #find matchups
        matchupsFound = 0
        try: games = export['games']
        except KeyError: 
            embed.add_field(name='Error', value='No boxscores in file.')
            return embed
        
        for g in games:
            if (g['teams'][0]['tid'] == teamOne and g['teams'][1]['tid'] == teamTwo) or (g['teams'][0]['tid'] == teamTwo and g['teams'][1]['tid'] == teamOne):
                matchupsFound += 1
                gameInfo = pull_info.game_info(g, export, commandInfo['message'])
                text = f"{gameInfo['fullScore']} \n \n **Top Performances:** \n {gameInfo['topPerformances'][0]} \n {gameInfo['topPerformances'][1]}"
                if g['clutchPlays'] != []:
                    for c in g['clutchPlays']:
                        text += '\n' + '***' + c.split('>')[1].replace('</a', '') + '** ' + c.split('>')[2] + '*'
                embed.add_field(name=f"Game {matchupsFound}", value=text)
        
        if matchupsFound == 0:
            embed.add_field(name='No Games Found', value='Those two teams have not yet faced, or no box scores of their game are saved.')
        
        return embed
    
def summary(embed, commandInfo):
    export = serverExports[str(commandInfo['serverId'])]
    teams = export['teams']
    players = export['players']
    found = False
    for s in export['awards']:
        if s['season'] == commandInfo['season']:
            found = True
            #get champion
            playoffSettings = export['gameAttributes']['numGamesPlayoffSeries']
            for t in teams:
                t = pull_info.tinfo(t, commandInfo['season'])
                result = pull_info.playoff_result(t['roundsWon'], playoffSettings, commandInfo['season'])
                if result == '**won championship**':
                    champion = f"{basics.team_mention(commandInfo['message'], t['name'], t['abbrev'])} ({t['record']})"
                #grab FMVP team
                if t['tid'] == s['finalsMvp']['tid']:
                    fmvpTeam = t['abbrev']
            fmvp = f"{s['finalsMvp']['name']} ({fmvpTeam}) - ``{round(s['finalsMvp']['pts'], 1)} pts, {round(s['finalsMvp']['trb'], 1)} reb, {round(s['finalsMvp']['ast'], 1)} ast``"
            sfMvps = ""
            try:
                for mvp in s['sfmvp']:
                    for t in teams:
                        if t['tid'] == mvp['tid']:
                            t = pull_info.tinfo(t, commandInfo['season'])
                            abbrev = t['abbrev']
                    sfMvps += f"**{mvp['name']}** ({abbrev}) - ``{round(mvp['pts'], 1)}pts , {round(mvp['trb'], 1)} reb, {round(mvp['ast'], 1)} ast``" + '\n'
            except KeyError: sfMvps = "None"
            bestRecords = ""
            for tr in s['bestRecordConfs']:
                for t in teams:
                    if t['tid'] == tr['tid']:
                        t = pull_info.tinfo(t, commandInfo['season'])
                        bestRecords += f"{basics.team_mention(commandInfo['message'], t['name'], t['abbrev'])} ({tr['won']}-{tr['lost']})" + '\n'
            embed.add_field(name='Season Summary', value=f"**Champion:** {champion}\n Finals MVP: {fmvp} \n \n Semifinals MVPs: \n {sfMvps} \n \n Best Records: \n {bestRecords}")
            #awards
            text = ""
            awards = ['mvp', 'dpoy', 'smoy', 'roy', 'mip']
            for a in awards:
                if a in s:
                    for t in teams:
                        if t['tid'] == s[a]['tid']:
                            info = pull_info.tinfo(t, commandInfo['season'])
                            teamLine = f"{info['name']} ({info['record']}, {pull_info.playoff_result(info['roundsWon'], export['gameAttributes']['numGamesPlayoffSeries'], commandInfo['season'])})"
                    if a == 'dpoy':
                        text += f"**{str.upper(a)}: {s[a]['name']}**" + '\n' + teamLine + '\n' + f"``{round(s[a]['trb'], 1)} reb, {round(s[a]['blk'], 1)} blk, {round(s[a]['stl'], 1)} stl``" + '\n' + '\n'
                    else:
                        text += f"**{str.upper(a)}: {s[a]['name']}**" + '\n' + teamLine + '\n' + f"``{round(s[a]['pts'], 1)} pts, {round(s[a]['trb'], 1)} reb, {round(s[a]['ast'], 1)} ast``" + '\n' + '\n'
            embed.add_field(name='Awards', value=text)

            
            #retirements
            text = ""
            retiredPlayers = []
            for p in players:
                p = pull_info.pinfo(p, commandInfo['season'])
                if p['retired']:
                    if p['retiredYear'] == commandInfo['season']:
                        retiredPlayers.append([p['name'], p['peakOvr'], commandInfo['season']-p['born']])
            retiredPlayers.sort(key=lambda r: r[1], reverse=True)
            retiredPlayers = retiredPlayers[:10]
            text = ""
            for r in retiredPlayers:
                text += f"**{r[0]}** ({r[2]} yo, peaked at {r[1]} OVR) \n"

            embed.add_field(name='Retirements', value=text) 



            #all-league
            text = ""
            allLeague = s['allLeague']
            for t in allLeague:
                text += f"\n __{t['title']}__\n"
                for pl in t['players']:
                    for te in teams:
                        if te['tid'] == pl['tid']:
                            abbrev = pull_info.tinfo(te, commandInfo['season'])['abbrev']
                    text += f"{pl['name']} ({abbrev})" + '\n'
            embed.add_field(name='All-League Teams', value=text)
            
            #all-defense
            text = ""
            allDefense = s['allDefensive']
            for t in allDefense:
                text += f"\n __{t['title']}__\n"
                for pl in t['players']:
                    for te in teams:
                        if te['tid'] == pl['tid']:
                            abbrev = pull_info.tinfo(te, commandInfo['season'])['abbrev']
                    text += f"{pl['name']} ({abbrev})" + '\n'
            embed.add_field(name='All-Defensive Teams', value=text)

            #all-rookie
            text = f"\n __All-Rookie Team__\n"
            allRookie = s['allRookie']
            for pl in allRookie:
                for te in teams:
                    if te['tid'] == pl['tid']:
                        abbrev = pull_info.tinfo(te, commandInfo['season'])['abbrev']
                text += f"{pl['name']} ({abbrev})" + '\n'
            embed.add_field(name='All-Rookie Team', value=text)
        
    if found == False:
        embed.add_field(name='Error', value='No summary data for that season.')
    return embed






                

    
        
    