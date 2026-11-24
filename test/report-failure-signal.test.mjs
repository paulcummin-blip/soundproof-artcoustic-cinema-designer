import test from 'node:test';
import assert from 'node:assert/strict';
import {reportFailureCode} from '../src/components/systemHealth/reportFailureSignal.js';
test('saved evidence rejected triggers an alert without an exception',()=>assert.equal(reportFailureCode({blocked:true,hasSavedEvidence:true}),'REPORT_SAVED_EVIDENCE_REJECTED'));
test('evidence read failure triggers an alert',()=>assert.equal(reportFailureCode({readFailed:true}),'REPORT_EVIDENCE_READ_FAILED'));
test('hydration is not an incident',()=>assert.equal(reportFailureCode({loading:true,blocked:true,readFailed:true,hasSavedEvidence:true}),null));
test('new unassessed project is not an incident',()=>assert.equal(reportFailureCode({blocked:true,hasSavedEvidence:false}),null));
test('ready report is not an incident',()=>assert.equal(reportFailureCode({blocked:false,hasSavedEvidence:true}),null));
