const { MongoClient } = require('mongodb');

const url = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB || 'sys';
const client = new MongoClient(url);
let database = null;

async function connect() {
  if (!database) {
    await client.connect();
    database = client.db(dbName);
    console.log('Successfully connected to MongoDB');
  }
  return database;
}

function getDb() {
  if (!database) {
    throw new Error('Database not initialized. Call connect() first.');
  }
  return database;
}

module.exports = {
  connect,
  getDb,
};