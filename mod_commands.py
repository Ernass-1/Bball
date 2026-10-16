import shared_info
from shared_info import serverExports
from shared_info import serversList
import pull_info
import basics
import discord

async def add_gm(embed, text, message):
    if len(text) != 3:
        embed.add_field(name='Invalid Format', value='Please set a new GM using this format:' + '\n' + '``-setgm [team abbreviation] [new GM, ping the user or provide their user ID number]``')
    else:
        teamToEdit = str.upper(text[1])
        gm = text[2]
        toReplace = ['<@!', '<@', '>']
        for to in toReplace:
            gm = gm.replace(to, '')
        try: gm = int(gm)
        except: embed.add_field(name='Error', value='Invalid GM. Ping the user, or provide only the numbers of their user ID.')
        teamId = None
        teams = serverExports[str(message.guild.id)]['teams']
        for t in teams:
            if t['abbrev'] == teamToEdit:
                teamId = t['tid']
                teamName = t['region'] + ' ' + t['name']
        if teamId == None:
            embed.add_field(name='Error', value='Could not find that team. Use their abbreviation.')
        else:
            if isinstance(gm, int):
                teamList = serversList[str(message.guild.id)]['teamlist']
                teamList[str(gm)] = teamId
                await basics.save_db(serversList)
                embed.add_field(name='GM Set', value=f"Set <@!{gm}> as the {teamName} GM.")
    return(embed)

async def restore(embed, text, message):
    newServersList = serversList[str(message.guild.id)]
    newServersList['offers'] = newServersList['backupOffers']
    embed.add_field(name='Success', value='Restored previous offer list.')
    return(embed)

async def removegm(embed, text, message):
    teamList = serversList[str(message.guild.id)]['teamlist']
    if len(text) > 2:
        embed.add_field(name='Invalid Format', value='Please remove a GM by either pinging the user or specifying the team, to clear them.' + '\n' + '``-removegm @ClevelandFan`` / ``-removegm atl``')
    else:
        #first check for a team
        teams = serverExports[str(message.guild.id)]['teams']
        teamAbbrevs = []
        for t in teams:
            teamAbbrevs.append([t['abbrev'], t['tid']])
        removeUser = True
        
        for t in teamAbbrevs:
            if t[0] == str.upper(text[1]):
                usersToClear = []
                #remove a team
                for user, team in teamList.items():
                    if team == t[1]:
                        usersToClear.append(user)
                removeUser = False
                for u in usersToClear:
                    del teamList[u]
                await basics.save_db(serversList)
                embed.add_field(name='Team Cleared', value=f'Cleared all GMs from team {t[0]}')
        if removeUser:
            gm = text[1]
            toReplace = ['<@!', '<@', '>']
            for to in toReplace:
                gm = gm.replace(to, '')
            try: gm = int(gm)
            except: embed.add_field(name='Error', value='Invalid GM. Ping the user, or provide only the numbers of their user ID.')
            try:
                del teamList[str(gm)]
                embed.add_field(name='GM Removed', value=f"Removed GM <@!{gm}> from the team list.")
            except:
                embed.add_field(name='Error', value='That GM may not be on the team list.')
    return embed




        

async def teamlist(embed, text, message):
    id = message.guild.id
    export = shared_info.serverExports[str(id)]
    teams = export['teams']
    teamsList = []
    for t in teams:
        teamsList.append([t['tid'], t['abbrev']])
    teamsList = sorted(teamsList, key=lambda t: t[1])
    textLines = []
    serverGmList = shared_info.serversList[str(id)]['teamlist']
    for t in teamsList:
        gmText = ""
        for gm, team in serverGmList.items():
            if team == t[0]:
                gmText += '<@!' + gm + '>, '
        gmText = gmText[:-2]
        text = f"**{t[1]}** - {gmText}"
        textLines.append(text)
    output = []
    for i in range(0, len(textLines), 20):
        output.append(textLines[i:i+20])
    for o in output:
        text = ""
        for l in o:
            text += l + '\n'
        embed.add_field(name='Team List', value=text)
    return(embed)

async def specialize(embed, text, message):
    try: draftSeason = int(text[1])
    except: await message.channel.send('Please provide a season to specialize.')
    ratingBoost = 1.44
    averageRating = 35.2
    averageGuardRating = 41
    # 34.3 is the average rating for the things we're editing among generated draft prospects, this will find the average boost and use it to subtract, do not edit unless you know what you're doing
    ratingPenalty = ratingBoost * averageRating - averageRating
    # rounds so we don't get decimal ratings
    ratingPenaltyFinal = round(ratingPenalty)
    # Testing new different boost for drb/pss since they were getting overly inflated.
    guardBoost = 1.1
    guardPenalty = guardBoost * averageGuardRating - averageGuardRating
    guardPenaltyFinal = round(guardPenalty)
    serverExport = serverExports[str(message.guild.id)]
    players = serverExport['players']
    for p in players:
        if p['tid'] == -2 and p['draft']['year'] == draftSeason:
            p['ratings'][-1]['ins'] = round(p['ratings'][-1]['ins'] * guardBoost)
            p['ratings'][-1]['dnk'] = round(p['ratings'][-1]['dnk'] * ratingBoost)
            p['ratings'][-1]['ft'] = round(p['ratings'][-1]['ft'] * ratingBoost)
            p['ratings'][-1]['fg'] = round(p['ratings'][-1]['fg'] * ratingBoost)
            p['ratings'][-1]['tp'] = round(p['ratings'][-1]['tp'] * ratingBoost)
            p['ratings'][-1]['drb'] = round(p['ratings'][-1]['drb'] * guardBoost)
            p['ratings'][-1]['pss'] = round(p['ratings'][-1]['pss'] * guardBoost)
            p['ratings'][-1]['reb'] = round(p['ratings'][-1]['reb'] * ratingBoost)
            # marks these prospects as modified, might make use of this in the future, does nothing for now
            p['ratings'][-1]['done'] = 1
            # Take off the average boost from every rating after boosting
            p['ratings'][-1]['ins'] = min(90, p['ratings'][-1]['ins'] - guardPenaltyFinal)
            p['ratings'][-1]['dnk'] = min(90, p['ratings'][-1]['dnk'] - ratingPenaltyFinal)
            p['ratings'][-1]['ft'] = min(85, p['ratings'][-1]['ft'] - ratingPenaltyFinal)
            p['ratings'][-1]['fg'] = min(90, p['ratings'][-1]['fg'] - ratingPenaltyFinal)
            p['ratings'][-1]['tp'] = min(90, p['ratings'][-1]['tp'] - ratingPenaltyFinal)
            p['ratings'][-1]['drb'] = min(90, p['ratings'][-1]['drb'] - guardPenaltyFinal)
            p['ratings'][-1]['pss'] = min(85, p['ratings'][-1]['pss'] - guardPenaltyFinal)
            p['ratings'][-1]['reb'] = min(90, p['ratings'][-1]['reb'] - ratingPenaltyFinal)
            # Remove OVR, POT, tags, position for recalculation
            p['ratings'][-1].pop("ovr")
            p['ratings'][-1].pop("pot")
            p['ratings'][-1].pop("skills")
            p['ratings'][-1].pop("pos")
            ratings = p['ratings']
            ratings[-1]['hgt'] = round(ratings[-1]['hgt'])
            ratings[-1]['stre'] = round(ratings[-1]['stre'])
            ratings[-1]['spd'] = round(ratings[-1]['spd'])
            ratings[-1]['jmp'] = round(ratings[-1]['jmp'])
            ratings[-1]['endu'] = round(ratings[-1]['endu'])
            ratings[-1]['ins'] = round(ratings[-1]['ins'])
            ratings[-1]['dnk'] = round(ratings[-1]['dnk'])
            ratings[-1]['ft'] = round(ratings[-1]['ft'])
            ratings[-1]['fg'] = round(ratings[-1]['fg'])
            ratings[-1]['tp'] = round(ratings[-1]['tp'])
            ratings[-1]['oiq'] = round(ratings[-1]['oiq'])
            ratings[-1]['diq'] = round(ratings[-1]['diq'])
            ratings[-1]['drb'] = round(ratings[-1]['drb'])
            ratings[-1]['pss'] = round(ratings[-1]['pss'])
            ratings[-1]['reb'] = round(ratings[-1]['reb'])
            if ratings[-1]['hgt'] < 0:
                ratings[-1]['hgt'] = 0
            if ratings[-1]['stre'] < 0:
                ratings[-1]['stre'] = 0
            if ratings[-1]['spd'] < 0:
                ratings[-1]['spd'] = 0
            if ratings[-1]['jmp'] < 0:
                ratings[-1]['jmp'] = 0
            if ratings[-1]['endu'] < 0:
                ratings[-1]['endu'] = 0
            if ratings[-1]['ins'] < 0:
                ratings[-1]['ins'] = 0
            if ratings[-1]['dnk'] < 0:
                ratings[-1]['dnk'] = 0
            if ratings[-1]['ft'] < 0:
                ratings[-1]['ft'] = 0
            if ratings[-1]['tp'] < 0:
                ratings[-1]['tp'] = 0
            if ratings[-1]['fg'] < 0:
                ratings[-1]['fg'] = 0
            if ratings[-1]['oiq'] < 0:
                ratings[-1]['oiq'] = 0
            if ratings[-1]['diq'] < 0:
                ratings[-1]['diq'] = 0
            if ratings[-1]['drb'] < 0:
                ratings[-1]['drb'] = 0
            if ratings[-1]['pss'] < 0:
                ratings[-1]['pss'] = 0
            if ratings[-1]['reb'] < 0:
                ratings[-1]['reb'] = 0
    text = '**Specialized the ' + str(draftSeason) + f' draft!** Run updateexport for a new link. **Warning:** Viewing profiles or any screen to do with modified draft prospects will **not work** until the export is loaded and then exported again. This is becuase BBGM needs to recompute some key values for the players with their new ratings, such as OVR, position, and tags.'
    await message.channel.send(text)