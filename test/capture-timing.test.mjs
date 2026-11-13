import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForCapturePaint, withCaptureDeadline } from '../src/components/library/captureTiming.js';

test('offscreen frame with no animation callbacks still settles and cancels callback', async () => {
  const cancelled = [];
  await waitForCapturePaint({ requestAnimationFrame: () => 17, cancelAnimationFrame: id => cancelled.push(id) }, 5);
  assert.deepEqual(cancelled, [17]);
});

test('visible frame completes after both animation callbacks', async () => {
  const callbacks = [];
  let done = false;
  const pending = waitForCapturePaint({ requestAnimationFrame: cb => callbacks.push(cb), cancelAnimationFrame() {} }, 100);
  pending.then(() => { done = true; });
  callbacks[0]();
  await Promise.resolve();
  assert.equal(done, false);
  callbacks[1]();
  await pending;
  assert.equal(done, true);
});

test('expired capture aborts cleanup and late bytes never reach upload', async () => {
  let finish;
  let aborted = false;
  let uploads = 0;
  const capture = withCaptureDeadline(signal => {
    signal.addEventListener('abort', () => { aborted = true; });
    return new Promise(resolve => { finish = resolve; });
  }, 5);
  const storage = capture.then(() => { uploads += 1; });
  await assert.rejects(storage, /before upload/);
  assert.equal(aborted, true);
  finish('late PDF');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(uploads, 0);
});

test('successful capture keeps its bytes and clears the deadline', async () => {
  let aborted = false;
  const result = await withCaptureDeadline(signal => {
    signal.addEventListener('abort', () => { aborted = true; });
    return 'PDF bytes';
  }, 5);
  assert.equal(result, 'PDF bytes');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(aborted, false);
});
