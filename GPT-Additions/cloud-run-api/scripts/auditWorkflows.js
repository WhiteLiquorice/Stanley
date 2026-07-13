const admin = require('firebase-admin');
const { validateWorkflow } = require('../src/workflowContract');

const projectId = process.env.STANLEY_PROJECT_ID || 'bridgeway-db29e';
admin.initializeApp({ projectId });

async function main() {
  const snapshot = await admin.firestore().collectionGroup('workflows').get();
  let valid = 0;
  let invalid = 0;
  for (const doc of snapshot.docs) {
    try {
      validateWorkflow({ id: doc.id, ...doc.data() });
      valid += 1;
    } catch (error) {
      invalid += 1;
      console.log(`INVALID ${doc.ref.path}`);
      for (const issue of error.issues || [error.message]) console.log(`  - ${issue}`);
    }
  }
  console.log(`Audit complete: ${valid} valid, ${invalid} requiring review, ${snapshot.size} total.`);
  if (invalid) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
