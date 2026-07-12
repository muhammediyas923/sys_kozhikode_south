const db = require('../config/connection');
const collections = require('../config/collections');
const ph = require('../helpers/program-helper');

(async () => {
  try {
    await db.connect();
    const database = db.getDb();

    const res = await database
      .collection(collections.PROGRAMS_COLLECTION)
      .updateMany({ published: { $ne: true } }, { $set: { published: true, publishedAt: new Date(), updatedAt: new Date() } });

    console.log('modifiedCount', res.modifiedCount);

    const sample = await database.collection(collections.PROGRAMS_COLLECTION).find().limit(5).toArray();
    console.log('sample programs:', sample.map(p => ({ id: p._id.toString(), title: p.title, published: p.published })));

    const user = await database.collection(collections.USERS_COLLECTION).findOne({ role: 'UnitUser' });
    if (user) {
      const progs = await ph.getProgramsWithCompletion(user._id, { publishedOnly: true });
      console.log('programs for user', progs.length);
      console.log(progs.slice(0,5).map(p => ({ id: p._id.toString(), title: p.title, published: p.published, completed: p.completed })));
    } else {
      console.log('no unit user found');
    }

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
