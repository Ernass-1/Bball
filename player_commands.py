from shared_info import serverExports
import pull_info
import basics
import plotly_express as px
import pandas
import random
import plotly.graph_objects as go
from shared_info import trivias
import discord

##PLAYER COMMANDS

def default(embed, player, commandInfo):
    embed.add_field(name='A New Player Command', value=f'This is the template for player commands that have no assigned funtion to fill the embed. Player name: {player["name"]}')
    return (embed)

def stats(embed, player, commandInfo):
    export = serverExports[str(commandInfo['id'])]
    players = export['players']
    teams = export['teams']
    for p in players:
        if p['pid'] == player['pid']:
            if commandInfo['commandName'] == 'stats':
                s = pull_info.pstats(p, commandInfo['season'])
                title = f"{commandInfo['season']} Season Stats "
            if commandInfo['commandName'] == 'cstats':
                s = pull_info.pstats(p, 'career')
                title = 'Player Career Stats '
    statsTeams = '('
    for tid in s['teams']:
        for t in teams:
            if t['tid'] == tid:
                name = t['abbrev']
                for season in t['seasons']:
                    if season['season'] == commandInfo['season']:
                        name = season['abbrev']
        statsTeams += name + '/'
    if statsTeams == '(':
        statsTeams = ''
    else:
        statsTeams = statsTeams[:-1] + ')'
    if s['gp'] == 0:
        statsLine = f'*No stats available.*'
        effLine = f'*No stats available.*'
    else:
        statsLine = f"{s['pts']} pts, {s['orb'] + s['drb']} reb, {s['ast']} ast, {s['blk']} blk, {s['stl']} stl, {s['tov']} tov"
        effLine = f"{str(s['gp']).replace('.0', '')} GP, {s['min']} MPG, {s['per']} PER, {s['fg']}% FG, {s['tp']} 3PT%, {s['ft']} FT%"
    embed.add_field(name=title+statsTeams, value=statsLine, inline=False)
    embed.add_field(name='Other', value=effLine, inline=False)

    return(embed)

def bio(embed, player, commandInfo):
    export = serverExports[str(commandInfo['id'])]
    players = export['players']
    teams = export['teams']
    for p in players:
        if p['pid'] == player['pid']:
            stats = pull_info.pstats(p, 'career')
    teamsPlayedFor = ""
    for t in stats['teams']:
        for team in teams:
            if team['tid'] == t:
                teamsPlayedFor += team['abbrev'] + ', '
    teamsPlayedFor = teamsPlayedFor[:-2]
    p = player

    try: statLine = f"{str(stats['gp'])[:-2]} G, {stats['pts']} pts, {stats['orb'] + stats['drb']} reb, {stats['ast']} ast, {stats['per']} PER"
    except: statLine = '*Could not access stats.*'
    leagueBlock = (f"**Experience:** {len(player['seasonsPlayed'])} seasons ({basics.group_numbers(player['seasonsPlayed'])})" + '\n'
    + f"**Career Stats:** {statLine}" + '\n'
    + f'**Teams:** {teamsPlayedFor}')
    embed.add_field(name='League', value=leagueBlock, inline=False)

    if p['deathInfo']['died']:
        ageText = f"Died in {p['deathInfo']['yearDied']} (age {p['deathInfo']['ageDied']})"
    else:
        ageText = str(export['gameAttributes']['season'] - p['born']) + ' yo'
    physicalBlock = (f"**Height:** {p['height']}" + '\n'
                     + f"**Weight:** {p['weight']} lbs" + '\n'
                     + f"**Age:** {ageText}")
    embed.add_field(name='Physical', value=physicalBlock)

    personalBlock = (f"**Country:** {p['country']}" + '\n'
                     + f"**College:** {p['college']}" + '\n'
                     + f"**Mood Traits:** {p['moodTraits']}")
    embed.add_field(name='Personal', value=personalBlock)

    for bbgmPlayer in players:
        if bbgmPlayer['pid'] == p['pid']:
            draftTid = bbgmPlayer['draft']['tid']
            draftRating = f"{bbgmPlayer['draft']['ovr']}/{bbgmPlayer['draft']['pot']}"
    draftTeam = 'Undrafted'
    for t in teams:
        if t['tid'] == draftTid:
            draftTeam = t['region'] + ' ' + t['name']
    draftBlock = (f"{p['draft']}" + '\n'
                  + f"{draftTeam}" + '\n'
                  + f"{draftRating} at draft")
    embed.add_field(name='Draft', value=draftBlock)
    

    return(embed)

    
def ratings(embed, player, commandInfo):
    r = player['ratings']

    physicalBlock = (f"**Height:** {r['hgt']}" + '\n'
                     + f"**Strength:** {r['stre']}" + '\n'
                     + f"**Speed:** {r['spd']}" + '\n'
                     + f"**Jumping:** {r['jmp']}" + '\n'
                     + f"**Endurance:** {r['endu']}")
    shootingBlock = (f"**Inside:** {r['ins']}" + '\n'
                     + f"**Dunks/Layups:** {r['dnk']}" + '\n'
                     + f"**Free Throws:** {r['ft']}" + '\n'
                     + f"**Two Pointers:** {r['fg']}" + '\n'
                     + f"**Three Pointers:** {r['tp']}")
    skillBlock = (f"**Offensive IQ:** {r['oiq']}" + '\n'
                  + f"**Defensive IQ:** {r['diq']}" + '\n'
                  + f"**Dribbling:** {r['drb']}" + '\n'
                  + f"**Passing:** {r['pss']}" + '\n'
                  + f"**Rebounding:** {r['reb']}")
    embed.add_field(name='Physical', value=physicalBlock)
    embed.add_field(name='Shooting', value=shootingBlock)
    embed.add_field(name='Skill', value=skillBlock)
    return embed

def adv(embed, player, commandInfo):
    export = serverExports[str(commandInfo['id'])]
    players = export['players']
    teams = export['teams']
    for p in players:
        if p['pid'] == player['pid']:
            s = pull_info.pstats(p, commandInfo['season'])
    statsTeams = '('
    for tid in s['teams']:
        for t in teams:
            if t['tid'] == tid:
                name = t['abbrev']
                for season in t['seasons']:
                    if season['season'] == commandInfo['season']:
                        name = season['abbrev']
        statsTeams += name + '/'
    if statsTeams == '(':
        statsTeams = ''
    else:
        statsTeams = statsTeams[:-1] + ')'
    if s['gp'] == 0:
        statsLine = f'*No stats available.*'
        effLine = f'*No stats available.*'
        shootingLine = '*No stats available.*'
    else:
        statsLine = f"{str(s['gp']).replace('.0', '')} GP, {s['min']} MPG, {s['per']} PER, {s['ewa']} EWA, {s['obpm']+s['dbpm']} BPM ({s['obpm']} OBPM, {s['dbpm']} DBPM), {s['vorp']} VORP"
        effLine = f"{s['ows']+s['dws']} WS ({s['ows']} OWS, {s['dws']} DWS), {str(round(((s['ows']+s['dws'])/(s['min']*s['gp']))*48, 3)).replace('0.', '.')} WS/48, {s['ortg']} ORTG, {s['drtg']} DRTG, {s['usgp']}% USG, {s['pm100']} +/- per 100 pos., {s['onOff100']} on/off per 100 pos."
        shootingLine = f"{s['fg']}% FG, {s['tp']}% 3P, {s['ft']}% FT, {s['at-rim']}% at-rim, {s['low-post']}% low-post, {s['mid-range']}% mid-range \n {s['dd']} double-doubles, {s['td']} triple doubles"
    embed.add_field(name=f"{commandInfo['season']} Advanced Stats {statsTeams}", value=statsLine, inline=False)
    embed.add_field(name='Team-Based', value=effLine, inline=False)
    embed.add_field(name='Shooting and Feats', value=shootingLine, inline=False)

    return embed

def progs(embed, player, commandInfo):
    export = serverExports[str(commandInfo['id'])]
    players = export['players']
    teams = export['teams']
    lines = []
    for p in players:
        if p['pid'] == player['pid']:
            ratings = p['ratings']
            for r in ratings:
                line = f"{r['season']} - {player['name']} - {r['season'] - player['born']} yo {r['ovr']}/{r['pot']} {' '.join(r['skills'])}"
                lines.append(f"{r['season']} - {player['name']} - {r['season'] - player['born']} yo {r['ovr']}/{r['pot']} {' '.join(r['skills'])}")
    numDivs, rem = divmod(len(lines), 20)
    numDivs += 1
    for i in range(numDivs):
        newLines = lines[(i*20):((i*20)+20)]
        text = '\n'.join(newLines)
        embed.add_field(name='Player Progressions', value=text)
    return embed

def hstats(embed, player, commandInfo):
    export = serverExports[str(commandInfo['id'])]
    players = export['players']
    teams = export['teams']
    lines = []
    for season in player['seasonsPlayed']:
        for p in players:
            if p['pid'] == player['pid']:
                stats = pull_info.pstats(p, season)
        teamText = '('
        for tid in stats['teams']:
            for t in teams:
                if t['tid'] == tid:
                    t = pull_info.tinfo(t, season)
                    teamText += t['abbrev'] + '/'
        teamText = teamText[:-1] + ')'
        line = f"**{season}** {teamText} - {stats['pts']} pts, {stats['reb']} reb, {stats['ast']} ast, {stats['stl']} stl, {stats['blk']} blk, {stats['per']} PER"
        lines.append(line)
    numDivs, rem = divmod(len(lines), 10)
    numDivs += 1
    for i in range(numDivs):
        newLines = lines[(i*10):((i*10)+10)]
        text = '\n'.join(newLines)
        embed.add_field(name='Player Stats', value=text, inline=False)
    return embed  

def awards(embed, player, commandInfo):
    export = serverExports[str(commandInfo['id'])]
    players = export['players']
    teams = export['teams']
    lines = []
    for p in players:
        if p['pid'] == player['pid']:
            awards = p['awards']
            totalAwards = []
            for a in awards:
                totalAwards.append(a['type'])
            totalAwards = list(dict.fromkeys(totalAwards))
            for t in totalAwards:
                numAward = 0
                awardSeasons = []
                for a in awards:
                    if a['type'] == t:
                        numAward += 1
                        awardSeasons.append(str(a['season']))
                awardYears = ', '.join(awardSeasons)
                awardYears = '(' + awardYears + ')'
                awardYears = awardYears.replace(', )', ')')
                lines.append(f'{numAward}x {t} {awardYears}')
    if lines == []:
        lines = ['No awards!']
    numDivs, rem = divmod(len(lines), 15)
    numDivs += 1
    for i in range(numDivs):
        newLines = lines[(i*15):((i*15)+15)]
        text = '\n'.join(newLines)
        embed.add_field(name='Player Awards', value=text, inline=False)
    return embed
def compare(embed, player, commandInfo):
    export = serverExports[str(commandInfo['id'])]
    #print(commandInfo)
    players = export['players']
    teams = export['teams']
    tocompare = None
    #print(player)
    for play in players:
        if player["pid"] == play["pid"]:
            trueplayer = play
    #print(trueplayer)
    #trueplayer = players[player["pid"]]
    for r in trueplayer['ratings']:
        
        if r['season'] == commandInfo['season']:
            tocompare = r
    if tocompare == None:
        if trueplayer['retiredYear'] == None:
            tocompare = trueplayer['ratings'][-1]
            commandInfo.update({"season":tocompare["season"]})
        else:
            peakovr = 0
            for item in trueplayer['ratings']:
                if item['ovr'] > peakovr:
                    tocompare = item
                    peakovr = item['ovr']
    page = commandInfo["season"]-player["born"]
    mindifference = 10000000
    bestplayer = 0
    bestseason = 0
    bestindex = 0
    index = 0
    for p in players:
        
        if not p["pid"] == trueplayer["pid"]:
        
            for r in p['ratings']:
                dif = 0
                for i in ["hgt","stre","endu","reb","drb","pss","oiq","diq","fg","ft","tp","ins","dnk","jmp","spd"]:
                    dif += (r[i]-tocompare[i])**2
                if dif < mindifference:
                    mindifference = dif
                    bestplayer = p["pid"]
                    bestseason = r["season"]
                    bestindex = index
        index += 1
    
    resultingplayer =pull_info.pinfo(players[bestindex], season = bestseason)

    if resultingplayer['tid'] >= 0:
         t = pull_info.tinfo(teams[resultingplayer['tid']], bestseason)
    else:
         t = pull_info.tgeneric(resultingplayer['tid'])
    s= str(resultingplayer["stats"]['pts'])+"pts, "+str(resultingplayer["stats"]['reb'])+"reb, "+str(resultingplayer["stats"]['ast'])+"ast, "+str(resultingplayer["stats"]['stl'])+"stl, "+str(resultingplayer["stats"]['blk'])+"blk"
    if 'abbrev' in t:
        text = str(bestseason)+" "+ resultingplayer["name"]+", "+str(bestseason-resultingplayer["born"])+" years old, "+str(resultingplayer["ovr"])+"/"+str(resultingplayer["pot"])+" ("+t["abbrev"]+")\n"+s
    else:
        text = str(bestseason)+" "+ resultingplayer["name"]+", "+str(bestseason-resultingplayer["born"])+" years old, "+str(resultingplayer["ovr"])+"/"+str(resultingplayer["pot"])+" ("+t["name"]+")\n"+s

    embed.add_field(name='Player Comparison', value=text, inline=False)
    return embed
def progschart(embed, player, commandInfo):
    
    finalthree = commandInfo['message'].content[-3:]
    #print(finalthree)
    key = "ovr"
    pname = player["name"]
    for item in ["pot", "hgt","dnk","oiq","tre","ins","diq","spd"," ft","drb","jmp","pss"," fg","ndu"," tp","reb"]:
        if finalthree == item:
            key = item
            if key == " ft":
                key = "ft"
            if key == "tre":
                key = "stre"
            if key == " fg":
                key = "fg"
            if key == "ndu":
                key = "endu"
            if key == " tp":
                key = "tp"
    export = serverExports[str(commandInfo['id'])]
    #print(commandInfo)
    players = export['players']
    teams = export['teams']
    for play in players:
        if player["pid"] == play["pid"]:
            player = play
    #player = players[player['pid']]
    newthing = player['ratings']
            
    birthyear = player.get("born").get("year")
    seasons = []
    ages = []
    rtg = []
    season = -1000
                
    names = [key]
    for item in newthing:
         if int(item.get("season"))>=season:
            print(item)
            seasons.append(int(item.get("season")))
            ages.append(-birthyear+int(item.get("season")))
            rtg.append(int(item.get(key)))
    df = pandas.DataFrame(rtg, index=ages,columns = names)
    fig = px.line(df,labels = {"index":"Age","value":"Rating"}, title = "Progs for "+pname+" "+key)
    fig.update_layout(

    yaxis=dict( # Here
        range=[0,100] # Here
    ) # Here
    )
    fig.write_image('first_figure.png')
    
    return embed

def pgamelog(embed, player, commandInfo):
    export = serverExports[str(commandInfo['id'])]
    players = export['players']
    teams = export['teams']
    try: games = export['games']
    except KeyError: 
        embed.add_field(name='Error', value='No box scores in this export.')
        return embed
    lines = []
    for g in games:
        if g['won']['tid'] > -1:
            for gt in g['teams']:
                for pl in gt['players']:
                    if pl['pid'] == player['pid']:
                        if pl['min'] > 0:
                            statLine = f"{round(pl['min'], 1)} min, {pl['pts']} pts, {pl['orb']+pl['drb']} reb, {pl['ast']} ast, {pl['blk']} blk, {pl['stl']} stl, {pl['fg']}/{pl['fga']} FG, {pl['tp']}/{pl['tpa']} 3P"
                        else:
                            statLine = 'Did not play'
                        gameInfo = pull_info.game_info(g, export, commandInfo['message'])
                        newLine = f"{gameInfo['abbrevScore']} - ``{statLine}``"
                        lines.append(newLine)
    numDivs, rem = divmod(len(lines), 10)
    numDivs += 1
    for i in range(numDivs):
        newLines = lines[(i*10):((i*10)+10)]
        text = '\n'.join(newLines)
        embed.add_field(name='Player Game Log', value=text, inline=False)
    return embed
def trivia(embed, player, commandInfo):
    embed  = discord.Embed(title="Trivia", description="Guess who")
    d = "Guess who"
    if commandInfo['message'].channel in trivias:
        d = "By the way, the last trivia's solution was "+trivias[commandInfo['message'].channel]
    embedresult  = discord.Embed(title="Trivia", description=d)
    export = serverExports[str(commandInfo['id'])]
    players = export['players']
    newcommandinfo = {'id':commandInfo['id']}
    found = False
    track = 1
    while not found:
        track += 1
        player_key = random.sample(players, 1)[0]
        player = pull_info.pinfo(player_key)
        if player['peakOvr'] > 65 or track == 10000:
            found = True
    t = "Player Progressions"
    if random.random() < 0.5:
        embed2 = progs(embed, player, newcommandinfo)
    else:
        t = "Player Stats"
        embed2 = hstats(embed, player, newcommandinfo)
    newstring = ""
    for field in embed.fields:
        newstring = field.value.replace(player['name'], 'X')
        if "(" in newstring:
            while "(" in newstring:
                #print(newstring)

                newstring = newstring[0:newstring.index("(")]+newstring[newstring.index(")")+1:]
        embedresult.add_field(name = t, value = newstring)
    trivias.update({commandInfo['message'].channel:player['name']})
    return embedresult
