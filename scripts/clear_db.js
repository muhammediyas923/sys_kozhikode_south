const { MongoClient } = require('mongodb');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('sys');
    
    const zonesRes = await db.collection('zones').deleteMany({});
    console.log(`Deleted ${zonesRes.deletedCount} zones.`);
    
    const circlesRes = await db.collection('circles').deleteMany({});
    console.log(`Deleted ${circlesRes.deletedCount} circles.`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

run();
