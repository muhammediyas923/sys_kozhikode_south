const collections = require('../config/collections');
var db = require('../config/connection');
const bcrypt = require('bcrypt');

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

module.exports = {
    doSignup: async (userData) => {
        const database = db.getDb();
        const email = normalizeEmail(userData.Email);
        const name = typeof userData.Name === 'string' ? userData.Name.trim() : '';
        const password = userData.Password;

        if (!name || !email || !password || !/.+@.+\..+/.test(email) || password.length < 8) {
            return {
                status: false,
                message: 'Name, valid email, and password (min 8 chars) are required.',
            };
        }

        const existing = await database
            .collection(collections.USER_COLLECTION)
            .findOne({ Email: email });
        if (existing) {
            return { status: false, message: 'Email already registered' };
        }

        const hashed = await bcrypt.hash(password, 10);
        const user = {
            Name: name,
            Email: email,
            Password: hashed,
        };
        const res = await database
            .collection(collections.USER_COLLECTION)
            .insertOne(user);
        const saved = { _id: res.insertedId, Name: user.Name, Email: user.Email };
        return { status: true, user: saved };
    },

    doLogin: async (userData) => {
        const database = db.getDb();
        const email = normalizeEmail(userData.Email);
        const password = userData.Password;

        const user = await database
            .collection(collections.USER_COLLECTION)
            .findOne({ Email: email });
        if (!user) {
            return { status: false, message: 'Invalid credentials' };
        }
        const match = await bcrypt.compare(password, user.Password);
        if (match) {
            const sanitized = {
                _id: user._id,
                Name: user.Name,
                Email: user.Email,
                isAdmin: user.Email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase(),
            };
            return { status: true, user: sanitized };
        } else {
            return { status: false, message: 'Invalid credentials' };
        }
    },
};