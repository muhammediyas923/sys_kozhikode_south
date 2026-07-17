const db = require('./config/connection');
db.connect(async (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const completions = await db.getDb().collection('program_completions').find({}).toArray();
  console.log("ALL COMPLETIONS:", completions.length);
  completions.forEach(c => {
    console.log(c.userId, c.programId, c.completionCount, c.completed);
  });
  process.exit(0);
});
