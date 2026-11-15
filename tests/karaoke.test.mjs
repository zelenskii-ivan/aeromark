import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, advance, cues, metrics, appendRun, recommend } from '../lib/karaoke/model.ts';
import { READING_TEXTS, prepareText } from '../content/karaoke/texts.ts';
import { migrateAcademy } from '../lib/academy/state.ts';
const run = { id:'one', date:'2026-11-15T12:00:00.000Z', textId:'cat', mode:'syllables', pace:15, elapsedMs:30000, totalWords:10, attempted:10, errors:[2], verified:true, answers:[true,true] };
test('lexical counting preserves hyphens, stress, numbers and excludes punctuation', () => {
 assert.deepEqual(tokenize('«Кто-то», ёж! ма́ма — 12. ...').map(w=>w.text), ['Кто-то','ёж','ма́ма','12']);
});
test('all curated syllables round trip and canonical story has 37 words', () => {
 for (const t of READING_TEXTS) { const p=prepareText(t); assert.equal(p.parts.map(x=>x.join('')).join(' '), p.words.map(x=>x.text).join(' ')); assert.ok(p.parts.every(x=>x.every(Boolean))); }
 assert.equal(prepareText(READING_TEXTS[0]).words.length,37);
});
test('syllable timing gives each word equal duration and handles tempo changes', () => {
 const c=cues([['ма','ма'],['кот']], 'syllables');
 assert.deepEqual(advance(c,0,0,1000,30),{index:1,fraction:0});
 const a=advance(c,1,0,500,60); assert.deepEqual(a,{index:2,fraction:0});
 assert.deepEqual(advance(c,2,0,1000,60),{index:3,fraction:0});
 assert.throws(()=>advance(c,0,0,-1,30));
});
test('real reading metrics require verification and count unique wrong words',()=>{
 assert.equal(metrics({...run,verified:false}),null);
 assert.deepEqual(metrics(run),{wpm:20,wcpm:18,accuracy:.9});
 assert.throws(()=>appendRun([],{...run,errors:[2,2]}));
 assert.throws(()=>appendRun([],{...run,errors:[10]}));
 assert.throws(()=>appendRun([],{...run,elapsedMs:0}));
 assert.equal(appendRun([run],run).length,1);
 assert.equal(appendRun(Array.from({length:60},(_,i)=>({...run,id:String(i)})),run).length,60);
});
test('migration preserves good records and old saves; skips corrupt records',()=>{
 assert.deepEqual(migrateAcademy({}).karaoke,[]);
 assert.deepEqual(migrateAcademy({karaoke:[run,{bad:true}]}).karaoke,[run]);
});
test('adaptation ignores unverified/short runs, requires two successes and understanding',()=>{
 assert.equal(recommend([{...run,verified:false}],'cat').pace,15);
 const good={...run,errors:[]};
 assert.equal(recommend([good,{...good,id:'two'}],'cat').pace,17);
 assert.equal(recommend([{...run,answers:[false]}],'cat').pace,12);
 assert.equal(recommend([{...good,elapsedMs:1000}],'cat').pace,15);
});

test('library contains 30 different stories with valid questions and syllable boundaries', () => {
 assert.equal(READING_TEXTS.length,30);
 assert.equal(new Set(READING_TEXTS.map(t=>t.id)).size,30);
 assert.equal(new Set(READING_TEXTS.map(t=>prepareText(t).plain)).size,30);
 for (const t of READING_TEXTS) {
   const p=prepareText(t); assert.ok(p.words.length>=15,t.id);
   for (const parts of p.parts) for (const part of parts) assert.ok((part.match(/[аеёиоуыэюя]/gi)||[]).length<=1,`${t.id}: ${part}`);
   for (const q of t.questions) { assert.equal(q.options.length,3); assert.ok(q.options[q.correct]); assert.equal(new Set(q.options).size,3); }
 }
});

test('automatic selection visits all texts before repeating and survives history truncation', async () => {
 const { nextTextId } = await import('../lib/karaoke/model.ts');
 const ids=READING_TEXTS.map(t=>t.id);let history=[];
 for(let round=0;round<4;round++) {
   const seen=new Set();
   for(let i=0;i<30;i++) { const id=nextTextId(ids,history);assert.ok(!seen.has(id));seen.add(id);history=[...history,{textId:id}].slice(-60); }
 }
 assert.notEqual(nextTextId(ids,[],ids[0]),ids[0]);
});
