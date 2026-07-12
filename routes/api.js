const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const upload = require('../middlewares/upload');
const zoneHelper = require('../helpers/zone-helper');
const circleHelper = require('../helpers/circle-helper');
const userHelper = require('../helpers/user-helper');
const programHelper = require('../helpers/program-helper');
const notificationHelper = require('../helpers/notification-helper');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

/* ─── PUBLIC: For login dropdowns ─────────────────────────────────────────── */

router.get('/zones', async (req, res, next) => {
  try {
    const zones = await zoneHelper.getAllZones();
    return res.json({ success: true, zones });
  } catch (error) { return next(error); }
});

router.get('/circles', async (req, res, next) => {
  try {
    const { zoneId, zoneName } = req.query;
    let circles;
    if (zoneId) {
      circles = await circleHelper.getCirclesByZone(zoneId);
    } else if (zoneName) {
      circles = await circleHelper.getCirclesByZoneName(zoneName);
    } else {
      circles = await circleHelper.getAllCircles();
    }
    return res.json({ success: true, circles });
  } catch (error) { return next(error); }
});

router.get('/units', async (req, res, next) => {
  try {
    const { circleId, zoneName, circleName } = req.query;
    let units;
    if (circleId) {
      units = await circleHelper.getUnitsByCircle(circleId);
    } else if (zoneName && circleName) {
      units = await circleHelper.getUnitsByCircleName(zoneName, circleName);
    } else {
      units = [];
    }
    return res.json({ success: true, units });
  } catch (error) { return next(error); }
});

/* ─── NOTIFICATIONS ──────────────────────────────────────────────────────── */

router.get('/notifications', auth.requireApiLogin, async (req, res, next) => {
  try {
    const user = req.session.user;
    let notifications;
    if (user.role === 'SuperAdmin') {
      notifications = await notificationHelper.getNotificationsForAdmin();
    } else {
      notifications = await notificationHelper.getNotificationsForUser(user._id);
    }
    const unreadCount = await notificationHelper.getUnreadCount(user._id);
    return res.json({ success: true, notifications, unreadCount });
  } catch (error) { return next(error); }
});

router.put('/notifications/:id/read', auth.requireApiLogin, async (req, res, next) => {
  try {
    await notificationHelper.markAsRead(req.params.id);
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

router.put('/notifications/read-all', auth.requireApiLogin, async (req, res, next) => {
  try {
    await notificationHelper.markAllAsRead(req.session.user._id);
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

/* ─── SUPER ADMIN: ANALYTICS ─────────────────────────────────────────────── */

router.get('/admin/analytics', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const analytics = await programHelper.getDashboardAnalytics();
    return res.json({ success: true, analytics });
  } catch (error) { return next(error); }
});

/* ─── SUPER ADMIN: ZONES ─────────────────────────────────────────────────── */

router.get('/admin/zones', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const zones = await zoneHelper.getAllZones();
    return res.json({ success: true, zones });
  } catch (error) { return next(error); }
});

router.post('/admin/zones', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Zone name is required.' });
    const id = await zoneHelper.createZone(name);
    return res.json({ success: true, id });
  } catch (error) {
    if (error.message.includes('already exists')) return res.status(409).json({ success: false, message: error.message });
    return next(error);
  }
});

router.put('/admin/zones/:id', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const updated = await zoneHelper.updateZone(req.params.id, req.body.name);
    return res.json({ success: updated });
  } catch (error) { return next(error); }
});

router.delete('/admin/zones/:id', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const deleted = await zoneHelper.deleteZone(req.params.id);
    return res.json({ success: deleted });
  } catch (error) { return next(error); }
});

/* ─── SUPER ADMIN: CIRCLES ───────────────────────────────────────────────── */

router.get('/admin/circles', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const circles = await circleHelper.getAllCircles();
    return res.json({ success: true, circles });
  } catch (error) { return next(error); }
});

router.post('/admin/circles', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const { zoneId, zoneName, name } = req.body;
    if (!zoneId || !name) return res.status(400).json({ success: false, message: 'Zone and circle name are required.' });
    const id = await circleHelper.createCircle(zoneId, zoneName, name);
    return res.json({ success: true, id });
  } catch (error) { return next(error); }
});

router.put('/admin/circles/:id', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const updated = await circleHelper.updateCircle(req.params.id, req.body);
    return res.json({ success: updated });
  } catch (error) { return next(error); }
});

router.delete('/admin/circles/:id', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const deleted = await circleHelper.deleteCircle(req.params.id);
    return res.json({ success: deleted });
  } catch (error) { return next(error); }
});

/* ─── SUPER ADMIN: USERS ─────────────────────────────────────────────────── */

router.get('/admin/users', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const filters = {
      zone: req.query.zone,
      circle: req.query.circle,
      status: req.query.status,
      search: req.query.search,
    };
    const users = await userHelper.getAllUsers(filters);
    return res.json({ success: true, users });
  } catch (error) { return next(error); }
});

router.get('/admin/users/:id', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const user = await userHelper.getUserById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    return res.json({ success: true, user });
  } catch (error) { return next(error); }
});

router.post('/admin/users', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const id = await userHelper.createUser(req.body);
    return res.json({ success: true, id });
  } catch (error) {
    if (error.message.includes('already exists')) return res.status(409).json({ success: false, message: error.message });
    return next(error);
  }
});

router.put('/admin/users/:id', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const updated = await userHelper.updateUser(req.params.id, req.body);
    return res.json({ success: updated });
  } catch (error) { return next(error); }
});

router.delete('/admin/users/:id', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const deleted = await userHelper.deleteUser(req.params.id);
    return res.json({ success: deleted });
  } catch (error) { return next(error); }
});

router.post('/admin/users/:id/activate', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    await userHelper.setUserStatus(req.params.id, 'Active');
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

router.post('/admin/users/:id/deactivate', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    await userHelper.setUserStatus(req.params.id, 'Inactive');
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

router.post('/admin/users/:id/reset-password', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ success: false, message: 'New password is required.' });
    await userHelper.resetPassword(req.params.id, newPassword);
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

/* ─── SUPER ADMIN: PROGRAMS ──────────────────────────────────────────────── */

router.get('/admin/programs', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const programs = await programHelper.getAllPrograms();
    return res.json({ success: true, programs });
  } catch (error) { return next(error); }
});

router.post('/admin/programs', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'),
  upload.array('attachments', 10), async (req, res, next) => {
    try {
      const id = await programHelper.createProgram(
        { ...req.body, createdBy: req.session.user.username },
        req.files
      );
      return res.json({ success: true, id });
    } catch (error) { return next(error); }
  }
);

router.put('/admin/programs/:id', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'),
  upload.array('attachments', 10), async (req, res, next) => {
    try {
      const updated = await programHelper.updateProgram(req.params.id, req.body, req.files);
      return res.json({ success: updated });
    } catch (error) { return next(error); }
  }
);

router.post('/admin/programs/:id/publish', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    await programHelper.publishProgram(req.params.id);
    const program = await programHelper.getProgramById(req.params.id);
    // Notify all units
    await notificationHelper.broadcastToAllUnits(
      'program_published',
      `New program published: "${program.title}"`,
      { programId: req.params.id }
    );
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

router.post('/admin/programs/:id/unpublish', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    await programHelper.unpublishProgram(req.params.id);
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

router.delete('/admin/programs/:id', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const deleted = await programHelper.deleteProgram(req.params.id);
    return res.json({ success: deleted });
  } catch (error) { return next(error); }
});

/* ─── SUPER ADMIN: REPORTS ───────────────────────────────────────────────── */

router.get('/admin/reports', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const filters = {
      zone: req.query.zone,
      circle: req.query.circle,
      unitName: req.query.unitName,
      status: req.query.status,
      programId: req.query.programId,
    };
    const data = await programHelper.getCompletionReport(filters);
    return res.json({ success: true, data });
  } catch (error) { return next(error); }
});

router.get('/admin/reports/export/excel', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const filters = {
      zone: req.query.zone,
      circle: req.query.circle,
      unitName: req.query.unitName,
      status: req.query.status,
      programId: req.query.programId,
    };
    const data = await programHelper.getCompletionReport(filters);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SYS Admin';
    const sheet = workbook.addWorksheet('Completion Report');

    sheet.columns = [
      { header: 'Zone', key: 'zone', width: 20 },
      { header: 'Circle', key: 'circle', width: 20 },
      { header: 'Unit Name', key: 'unitName', width: 25 },
      { header: 'Username', key: 'username', width: 20 },
      { header: 'Program', key: 'programTitle', width: 35 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Completed On', key: 'completedAt', width: 25 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: 'FF14533E' },
    };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    data.forEach((row) => {
      sheet.addRow({
        zone: row.zone || '',
        circle: row.circle || '',
        unitName: row.unitName || '',
        username: row.username || '',
        programTitle: row.programTitle || '',
        status: row.completed ? 'Completed' : 'Pending',
        completedAt: row.completedAt ? new Date(row.completedAt).toLocaleString() : '-',
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="SYS_Completion_Report.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) { return next(error); }
});

router.get('/admin/reports/export/pdf', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const filters = {
      zone: req.query.zone,
      circle: req.query.circle,
      unitName: req.query.unitName,
      status: req.query.status,
      programId: req.query.programId,
    };
    const data = await programHelper.getCompletionReport(filters);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="SYS_Completion_Report.pdf"');
    doc.pipe(res);

    doc.fontSize(18).fillColor('#14533E').text('SYS Program Completion Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(1);

    const headers = ['Zone', 'Circle', 'Unit Name', 'Program', 'Status', 'Completed On'];
    const colWidths = [70, 70, 90, 120, 70, 100];
    const startX = 40;
    let y = doc.y;

    // Header row
    doc.fillColor('#14533E');
    let x = startX;
    headers.forEach((h, i) => {
      doc.rect(x, y, colWidths[i], 20).fill('#14533E');
      doc.fillColor('#FFFFFF').fontSize(9).text(h, x + 3, y + 5, { width: colWidths[i] - 6, lineBreak: false });
      x += colWidths[i];
    });
    y += 20;

    // Data rows
    data.slice(0, 200).forEach((row, idx) => {
      x = startX;
      const rowBg = idx % 2 === 0 ? '#F0F7F4' : '#FFFFFF';
      const rowData = [
        row.zone || '',
        row.circle || '',
        row.unitName || '',
        row.programTitle || '',
        row.completed ? 'Completed' : 'Pending',
        row.completedAt ? new Date(row.completedAt).toLocaleDateString() : '-',
      ];
      doc.fillColor(rowBg);
      colWidths.forEach((w, i) => { doc.rect(x + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, w, 18).fill(rowBg); });
      x = startX;
      rowData.forEach((cell, i) => {
        doc.fillColor('#333333').fontSize(8).text(cell, x + 3, y + 4, { width: colWidths[i] - 6, lineBreak: false });
        x += colWidths[i];
      });
      y += 18;
      if (y > 780) { doc.addPage(); y = 40; }
    });

    doc.end();
  } catch (error) { return next(error); }
});

/* ─── UNIT USER: PROGRAMS ────────────────────────────────────────────────── */

router.get('/unit/programs', auth.requireApiLogin, auth.requireApiRole('UnitUser'), async (req, res, next) => {
  try {
    const user = req.session.user;
    const programs = await programHelper.getProgramsWithCompletion(user._id, { publishedOnly: true });
    return res.json({ success: true, programs });
  } catch (error) { return next(error); }
});

router.put('/unit/programs/:id/complete', auth.requireApiLogin, auth.requireApiRole('UnitUser'), async (req, res, next) => {
  try {
    const user = req.session.user;
    const { completed } = req.body;
    const database_result = await programHelper.markCompletion(req.params.id, user._id, {
      zone: user.zone,
      circle: user.circle,
      unitName: user.unitName,
      username: user.username,
    });

    if (database_result.completed) {
      // Notify admin
      await notificationHelper.createNotification(
        'superadmin',
        'unit_completed',
        `${user.unitName} (${user.circle}, ${user.zone}) completed a program.`,
        { programId: req.params.id, userId: user._id }
      );
    }
    return res.json({ success: true, completed: database_result.completed });
  } catch (error) { return next(error); }
});

module.exports = router;
