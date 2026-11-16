// Firestore Rules isolation tests — run against the emulator, never production:
//   npm run test:rules   (starts the Firestore emulator via firebase-tools, JAVA_HOME required)
// Verifies BUILD-PLAN access control: anonymous Auth uid owns users/{uid}/**; nobody else can touch it.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";

const testEnv = await initializeTestEnvironment({
  projectId: "demo-repair-ledger",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
});

const alice = testEnv.authenticatedContext("alice-uid").firestore();
const bob = testEnv.authenticatedContext("bob-uid").firestore();
const anon = testEnv.unauthenticatedContext().firestore();
const rec = { rawText: "No heat", status: "Confirmed" };
let failures = 0;
const check = async (name, promise, shouldPass) => {
  try { await (shouldPass ? assertSucceeds(promise) : assertFails(promise)); console.log(`PASS  ${name}`); }
  catch (e) { failures++; console.log(`FAIL  ${name}: ${String(e).slice(0, 200)}`); }
};

await check("owner writes own record", setDoc(doc(alice, "users/alice-uid/records/r1"), rec), true);
await check("owner reads own record", getDoc(doc(alice, "users/alice-uid/records/r1")), true);
await check("other user CANNOT read owner's record", getDoc(doc(bob, "users/alice-uid/records/r1")), false);
await check("other user CANNOT write into owner's tree", setDoc(doc(bob, "users/alice-uid/records/evil"), rec), false);
await check("other user CANNOT update owner's record", updateDoc(doc(bob, "users/alice-uid/records/r1"), { status: "x" }), false);
await check("other user CANNOT delete owner's record", deleteDoc(doc(bob, "users/alice-uid/records/r1")), false);
await check("other user writes own tree", setDoc(doc(bob, "users/bob-uid/records/r9"), rec), true);
await check("unauthenticated CANNOT read any record", getDoc(doc(anon, "users/alice-uid/records/r1")), false);
await check("unauthenticated CANNOT write", setDoc(doc(anon, "users/alice-uid/records/r2"), rec), false);
await check("owner deletes own record", deleteDoc(doc(alice, "users/alice-uid/records/r1")), true);
await check("no access outside users/ tree", getDoc(doc(alice, "letters/l1")), false);

await testEnv.cleanup();
console.log(failures ? `\n${failures} RULES TEST(S) FAILED` : "\nALL RULES TESTS PASSED");
process.exit(failures ? 1 : 0);
