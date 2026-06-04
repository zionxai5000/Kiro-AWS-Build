const inner = `{"domain":"X","userGoal":"Y","screens":["a"],"stateModel":"S","seed":"S","persistence":"P","visualAnchor":"V","hero":"H","emptyState":"E","failCheck":"F"}`;
const fenced = '<spec>\n```json\n' + inner + '\n```\n</spec>';
console.log('input:', JSON.stringify(fenced));
const m = fenced.match(/<spec>([\s\S]*?)<\/spec>/i);
console.log('match[1]:', JSON.stringify(m && m[1]));
const stripped = (m[1] || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
console.log('stripped:', JSON.stringify(stripped));
try { console.log('parsed:', JSON.parse(stripped)); } catch (e) { console.log('parse error:', e.message); }
