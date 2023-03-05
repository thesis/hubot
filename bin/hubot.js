#!/usr/bin/env node --loader esm-loader-typescript --experimental-import-meta-resolve

// While all other files have been converted to JavaScript via https://github.com/github/hubot/pull/1347,
// we left the `bin/hubot` file to remain in CoffeeScript in order prevent
// breaking existing 3rd party adapters of which some are still written in
// CoffeeScript themselves. We will depracate and eventually remove this file
// in a future version of hubot

import('../dist/bin/hubot.esm.js')
