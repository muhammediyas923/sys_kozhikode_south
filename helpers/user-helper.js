const collections = require('../config/collections');
var db = require('../config/connection');
const bcrypt = require('bcrypt');

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

async function seedDefaultAccounts() {
  const database = db.getDb();
  const accounts = [
    {
      Name: 'SYS Admin',
      Email: process.env.ADMIN_EMAIL || 'admin@sys.org',
      Password: process.env.ADMIN_PASSWORD || 'Admin@1234',
      Role: 'Admin',
    },
    {
      Name: 'SYS User',
      Email: process.env.USER_EMAIL || 'user@sys.org',
      Password: process.env.USER_PASSWORD || 'User@1234',
      Role: 'User',
    },
  ];

  for (const account of accounts) {
    const normalizedEmail = normalizeEmail(account.Email);
    const existing = await database
      .collection(collections.USER_COLLECTION)
      .findOne({ Email: normalizedEmail });

    if (!existing) {
      const hashed = await bcrypt.hash(account.Password, 10);
      await database.collection(collections.USER_COLLECTION).insertOne({
        Name: account.Name,
        Email: normalizedEmail,
        Password: hashed,
        Role: account.Role,
      });
    }
  }
}

module.exports = {
  seedDefaultAccounts,

  doLogin: async (userData) => {
    const database = db.getDb();
    const email = normalizeEmail(userData.Email);
    const password = userData.Password;

    if (!email || !password) {
      return { status: false, message: 'Email and password are required' };
    }

    const user = await database
      .collection(collections.USER_COLLECTION)
      .findOne({ Email: email });

    if (!user) {
      return { status: false, message: 'Invalid credentials' };
    }

    const match = await bcrypt.compare(password, user.Password);
    if (!match) {
      return { status: false, message: 'Invalid credentials' };
    }

    const sanitized = {
      _id: user._id,
      Name: user.Name,
      Email: user.Email,
      Role: user.Role || 'User',
    };

    return { status: true, user: sanitized };
  },
};
