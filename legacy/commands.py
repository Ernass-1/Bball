import settings
import settings_checks as sc
import players
import basics
import moderators
import free_agency
import league
import draft
import draft_runner
import roster
import teams
import points
import help


commandsRaw = {
    "settings": 'settings',
    "edit": 'settings',
    "load": 'load_export',
    "stats": 'players',
    "bio": 'players',
    "ratings": 'players',
    "addgm": 'mods',
    "teamlist": 'mods',
    "removegm": 'mods',
    "offer": 'fa',
    "offers": 'fa',
    "deloffer": 'fa',
    "clearoffers": 'fa',
    "move": 'fa',
    "tosign": 'fa',
    'runfa': 'fa',
    'fa': 'league',
    'board': 'draft',
    'add': 'draft',
    'dmove': 'draft',
    'remove': 'draft',
    'clearboard': 'draft',
    'auto': 'draft',
    'startdraft': 'startdraft',
    'pick': 'draft',
    'draft': 'league',
    'roster': 'team',
    'sroster': 'team',
    'psroster': 'team',
    'lineup': 'team',
    'lmove': 'roster',
    'pt': 'roster',
    'autosort': 'roster',
    'resetpt': 'roster',
    'changepos': 'roster',
    'picks': 'team',
    'ownspicks': 'team',
    'history': 'team',
    'finances': 'team',
    'seasons': 'team',
    'tstats': 'team',
    'sos': 'team',
    'schedule': 'team',
    'gamelog': 'team',
    'ptstats': 'team',
    'game': 'team',
    'boxscore': 'team',
    'resignings': 'fa',
    'runresignings': 'fa',
    'pr': 'league',
    'matchups': 'league',
    'top': 'league',
    'injuries': 'league',
    'deaths': 'league',
    'leaders': 'league',
    'summary': 'league',
    'adv': 'players',
    'progs': 'players',
    'hstats': 'players',
    'cstats': 'players',
    'awards': 'players',
    'pgamelog': 'players',
    'compare': 'players',
    'nbacompare': 'players',
    'release': 'roster',
    'autocut': 'roster',
    'pausedraft': 'draft',
    'updatexport': 'updatexport',
    'help': 'help',
    'bulkadd': 'draft',
    'bal':'points',
    'pleaders':'points',
    'flip':'points',
    'rob':'points',
    'daily':'points',
    'resetdaily':'points',
    'globalleaders':'points',
    'lottery':'points',
    'lotterypool':'points',
    'proggraph':'players',
    'give':'points',
    'trivia':'players',
    'bulkoffer': 'fa',
    'clearalloffers': 'fa',
    'specialize': 'mods',
    'restoreofferbackup': 'mods'
}
commandTypes = {
    'players': players.process_text,
    'settings': settings.process_text,
    'load_export': basics.load_export,
    'mods': moderators.process_text,
    'fa': free_agency.process_text,
    'league': league.process_text,
    'draft': draft.process_text,
    'startdraft': draft_runner.run_draft,
    'roster': roster.process_text,
    'team': teams.process_text,
    'updatexport': basics.update_export,
    'help': help.process_text,
    'points': points.process_text
}
commands = {}

for c, v in commandsRaw.items():
    commands[c] = commandTypes[v]


settingsDirectory = {
    "prefix": sc.prefix,
    "holdout": sc.percents,
    "maxroster": sc.positive_int,
    "birdrights": sc.onoff,
    "rookiescount": sc.onoff,
    "options": sc.onoff,
    "openmarket": sc.onoff,
    "threeyearrule": sc.onoff,
    "winning": sc.numbers,
    "fame": sc.numbers,
    "loyalty": sc.numbers,
    "money": sc.numbers,
    "fachannel": sc.channel,
    "tradechannel": sc.channel,
    "tradeannouncechannel": sc.channel,
    "tradeback": sc.onoff,
    "tradefa": sc.positive_int,
    "hardcap": sc.numbers,
    "draftclock": sc.numberlist,
    "draftchannel": sc.channel,
    "lineupovrlimit": sc.positive_int,
    "maxptmod": sc.positive_int,
    "maxptlimit": sc.numbers,
    "minptlimit": sc.numbers,
    "allowzero": sc.positive_int,
    "releasechannel": sc.channel,
    'maxovrrelease': sc.positive_int
}

