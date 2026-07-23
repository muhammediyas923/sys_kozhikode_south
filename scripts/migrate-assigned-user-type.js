const db = require('../config/connection');
const collections = require('../config/collections');

(async () => {
  try {
    await db.connect();
    const database = db.getDb();

    const programs = await database
      .collection(collections.PROGRAMS_COLLECTION)
      .find({})
      .toArray();

    console.log(`Found ${programs.length} programs to check for migration.`);

    let updatedCount = 0;
    for (const prog of programs) {
      if (!prog.assigned_user_type) {
        let userType = 'UNIT';
        let assignTo = ['UnitUser'];

        if (Array.isArray(prog.assignTo) && prog.assignTo.length > 0) {
          const firstRole = prog.assignTo[0];
          if (firstRole === 'CircleUser' || firstRole === 'CIRCLE') {
            userType = 'CIRCLE';
            assignTo = ['CircleUser'];
          } else if (firstRole === 'ZoneUser' || firstRole === 'ZONE') {
            userType = 'ZONE';
            assignTo = ['ZoneUser'];
          } else {
            userType = 'UNIT';
            assignTo = ['UnitUser'];
          }
        }

        await database
          .collection(collections.PROGRAMS_COLLECTION)
          .updateOne(
            { _id: prog._id },
            { $set: { assigned_user_type: userType, assignTo: assignTo, updatedAt: new Date() } }
          );
        updatedCount++;
      }
    }

    console.log(`Successfully migrated ${updatedCount} program records with assigned_user_type.`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
