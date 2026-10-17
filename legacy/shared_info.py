import json

commandsRaw = {}

with open('servers.json') as f:
    serversList = json.load(f)

with open('books.json') as f:
    bibleBooks = json.load(f)
with open('verses.json') as f:
    bibleVerses = json.load(f)
with open('points.json') as f:
    points = json.load(f)
with open('daily.json') as f:
    daily = json.load(f) #daily is a list

serverExports = {}
trivias = dict()

bot = None


embedFooter = 'Made by ClevelandFan#2909 - v6.0 beta'
