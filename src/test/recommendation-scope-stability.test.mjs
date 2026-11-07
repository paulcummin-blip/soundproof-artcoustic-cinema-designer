import assert from "node:assert/strict";
import React, { useEffect, useState } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { normaliseRecommendationScope } from "../components/room/bass/stage1/stage1RecommendationScope.js";

// A store notification causes a rerender after scheduling. Equal scopes must
// not schedule again; a genuinely changed scope must still schedule.
let schedules = 0;
function Consumer({ quantities }) {
  const scope = normaliseRecommendationScope(quantities);
  const [, notify] = useState(0);
  useEffect(() => {
    schedules++;
    if (schedules < 8) notify(n => n + 1);
  }, [scope]);
  return null;
}
let root;
await act(async () => { root = TestRenderer.create(React.createElement(Consumer, { quantities: [1,2,4] })); });
assert.equal(schedules, 1, "one scheduling effect after store-driven rerender");
await act(async () => { root.update(React.createElement(Consumer, { quantities: [4,2,1,2] })); });
assert.equal(schedules, 1, "equivalent quantities do not restart work");
await act(async () => { root.update(React.createElement(Consumer, { quantities: [1,2] })); });
assert.equal(schedules, 2, "changed scope schedules new work");
await act(async () => root.unmount());
assert.deepEqual(normaliseRecommendationScope([3,1,2,4,4]), [1,2,4]);
assert.equal(normaliseRecommendationScope([3]), null);
console.log("PASS recommendation scope rerender stability and scope changes");
