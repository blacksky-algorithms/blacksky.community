import {readFileSync} from 'node:fs'
import {androidRuntimeResource} from './core.mjs'

console.log(androidRuntimeResource(readFileSync(process.argv[2], 'utf8')))
