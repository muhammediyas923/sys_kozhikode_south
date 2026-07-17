const { MongoClient } = require('mongodb');

async function check() {
  const uri = 'mongodb://127.0.0.1:27017';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('sys');
    const programs = await db.collection('programs').find().toArray();
    console.log(`Programs: ${programs.length}`);
    const prog = programs.find(p => p.title.includes('Nattu Dars'));
    console.log('Nattu Dars ID:', prog ? prog._id : 'Not Found');

    const completions = await db.collection('program_completions').find({}).toArray();
    console.log(`Completions count: ${completions.length}`);
    
    if (prog) {
      const match = completions.filter(c => String(c.programId) === String(prog._id));
      console.log(`Completions for Nattu Dars: ${match.length}`);
      console.log(match);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}
check();
