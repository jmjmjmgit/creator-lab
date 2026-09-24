import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
let config={};try{config=parseEnv(await readFile(new URL('../.env',import.meta.url),'utf8'));}catch{}
const value=name=>config[name]||process.env[name];
let failures=0;
function check(name,ok,hint){console.log(`${ok?'OK':'MISSING'} ${name}${ok?'':`: ${hint}`}`);if(!ok)failures++;}
const [major,minor]=process.versions.node.split('.').map(Number);
check('Node.js',major>22||major===22&&minor>=9,'Install Node 24 LTS or Node >=22.9.');
for(const cmd of ['ffmpeg','ffprobe'])check(cmd,spawnSync(cmd,['-version'],{stdio:'ignore'}).status===0,'Install FFmpeg, then reopen your terminal.');
const provider=value('TRANSCRIPTION_PROVIDER')||'fireworks';
check('Transcription provider',['fireworks','groq'].includes(provider),'Set TRANSCRIPTION_PROVIDER to fireworks or groq.');
check('Apify key',Boolean(value('APIFY_TOKEN')||value('APIFY_API_TOKEN')),'Add APIFY_TOKEN to .env.');
const classifier=value('CLASSIFIER')||'jev';
check('Classifier',['jev','llm'].includes(classifier),'Set CLASSIFIER to jev or llm.');
if(classifier==='llm'){check('LLM key',Boolean(value('LLM_API_KEY')),'Add LLM_API_KEY to .env.');check('LLM model',Boolean(value('LLM_MODEL')),'Set LLM_MODEL. Save & verify in Connections lists the models your key can use.');}
else check('Jev key',Boolean(value('TYPESAFE_API_KEY')||value('JEV_API_KEY')),'Add TYPESAFE_API_KEY to .env, or set CLASSIFIER=llm.');
if(['fireworks','groq'].includes(provider))check(`${provider} key`,Boolean(value(provider==='groq'?'GROQ_API_KEY':'FIREWORKS_API_KEY')),`Add your ${provider} key to .env.`);
console.log('Keys are checked for presence only. No key values are printed and no paid requests are made.');
console.log(failures?'Fix the items above for live analysis. The synthetic demo still works without keys.':'Ready for a pilot. Start the app and verify Connections.');
process.exitCode=failures?1:0;
