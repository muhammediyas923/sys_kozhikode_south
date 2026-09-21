const { MongoClient } = require('mongodb');
const config = require('./env');

const url = config.db.uri;
const dbName = config.db.name;
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