#!/usr/bin/env node

const got = require('got')
const moment = require('moment')
const wrap = require('word-wrap')
const TurndownService = require('turndown')
const turndownService = new TurndownService()

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const explode = entry => {
  return {
    createdAt: entry.createdAt,
    content: turndownService.turndown(entry.content),
    id: entry.id,
    journalist: entry.journalistName
  }
}

const cache = {}
const processed = {}

const updateCache = async minId => {
  const url = `https://live-api-prod.schibsted.tech/ab/entries?liveblogId=772${minId ? `&minId=${minId}` : ''}`
  const { body } = await got(url, {
    method: 'GET',
    headers: {
      'Content-type': 'application/json; charset=utf-8',
      'User-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36'
    }
  })
  const json = JSON.parse(body)
  const { entries } = json

  for (const rawEntry of entries) {
    const entry = explode(rawEntry)
    const { id } = entry

    if (!(id in cache) && !(id in processed)) {
      cache[id] = entry
    }

    if (!minId) {
      break
    }
  }
}

const output = async entry => {
  console.log(wrap(entry.content, { width: process.stdout.columns - 4 }))
  console.log('')
  console.log(wrap(`${entry.journalist} - ${moment(entry.createdAt).format('YYYY-MM-DD HH:mm')}`, { indent: ' '.repeat(process.stdout.columns - entry.journalist.length - 22) }))
  console.log('-'.repeat(process.stdout.columns))
  console.log('')

  if (process.env.POST_TO_URL) {
    await got(process.env.POST_TO_URL, {
      method: 'POST',
      body: entry.content
    })
  }

  processed[entry.id] = 1
  delete cache[entry.id]
}

const main = async () => {
  await updateCache()

  console.log(`${'-'.repeat(process.stdout.columns)}\n`)

  while (true) {
    for (const entry of Object.values(cache)) {
      if (!(entry.id in processed)) {
        await output(entry)
      }
    }

    await sleep(process.env.SLEEP_INTERVAL || 1000 * 60)
    await updateCache(Object.keys(processed)[Object.keys(processed).length - 1])
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
