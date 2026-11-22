import assert from 'node:assert/strict';
import fs from 'node:fs';
export function checkLocalization(locale,scenarios){
 const catalog=JSON.parse(fs.readFileSync(new URL('../app/ui-translations.json',import.meta.url),'utf8'));
 for(const [key,row]of Object.entries(catalog)){
  assert.equal(row.length,3,key);for(const lang of ['en','ja','ko']){const text=locale.translate(lang,key);assert.ok(text.trim(),`${key}:${lang}`);assert.equal(typeof text,'string');}
 }
 for(const key of scenarios.scenarioSources)for(const lang of ['en','ja','ko']){
  const translated=scenarios.scenarioText(lang,key);assert.notEqual(translated,key,`${lang}:${key}`);assert.equal(scenarios.canonicalScenario(translated),key);
 }
 for(const lang of ['zh','en','ja','ko']){
  const custom='My own clue — not a built-in scenario';assert.equal(scenarios.scenarioText(lang,custom),custom);
  assert.equal(scenarios.canonicalScenario(custom),null);
  const message=locale.translate(lang,'等待 {0} 猜一个分数',['Yu']);assert.ok(message.includes('Yu'));assert.ok(!message.includes('{0}'));
 }
 assert.equal(locale.speechLocales.en,'en-US');assert.equal(locale.speechLocales.ja,'ja-JP');assert.equal(locale.speechLocales.ko,'ko-KR');
 console.log(`PASS: ${Object.keys(catalog).length} UI strings and ${scenarios.scenarioSources.length} scenarios in four languages; canonical clues, placeholders and unchanged custom text.`);
}
