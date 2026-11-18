import {test} from 'vitest';
import assert from 'node:assert/strict';
import {clientIntentCoverage as check} from '../base44/shared/proposalWriter/clientIntentCoverage.js';
const brief = 'The showroom should offer a 75" or 83" TV for everyday use with a 110" screen for movie nights.';
const copy = 'Visitors can compare a 75-inch or 83-inch television for daily viewing with a retractable 110-inch projection screen for films. This showroom lets customers experience the presentation and discuss priorities for their own rooms.';
test('meaningful display and showroom paraphrases pass', () => assert.equal(check(brief,[{text:copy}]).complete,true));
for (const size of ['75','83','110']) test('omitting '+size+' independently is caught', () => assert.equal(check(brief,[{text:copy.replace(size+'-inch','alternative')}]).complete,false));
test('a noun list is not an explanation', () => assert.equal(check(brief,[{text:'showroom demonstration customers own rooms 75" TV 83" TV 110" screen daily movie'}]).complete,false));
test('concealment rationale accepts an uncluttered-front paraphrase', () => assert.equal(check('The need to be on the front and rear walls, and the system will look too busy if on show at the front',[{text:'Bass comes from the front and rear units. A textile wall hides the front subwoofers to keep the screen end uncluttered.'}]).complete,true));
