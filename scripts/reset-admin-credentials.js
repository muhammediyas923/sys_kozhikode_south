const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');
const collections = require('../config/collections');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB || 'sys';

const username = process.argv[2];
const password = process.argv[3];

if (!username || !password) {
  console.error('Usage: node scripts/reset-admin-credentials.js <username> <password>');
  process.exit(1);
}

(async () => {
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    await client.connect();
    const db = client.db(dbName);
    const hashed = await bcrypt.hash(password, 10);

    const result = await db.collection(collections.USERS_COLLECTION).updateOne(
      { role: 'SuperAdmin' },
      {
        $set: {
          username,
          password: hashed,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      console.error('No SuperAdmin user found in the users collection.');
      process.exit(2);
    }

    console.log('SuperAdmin credentials updated successfully.');
  } catch (err) {
    console.error('Failed to update credentials:', err);
    process.exit(3);
  } finally {
    await client.close();
  }
})();
