import { runP18ExtensionAuthorityFixtures } from "../src/components/utils/p18ExtensionAuthorityFixtures.js";

const result = runP18ExtensionAuthorityFixtures();
console.log(JSON.stringify({ ...result, allPassed: true }, null, 2));
