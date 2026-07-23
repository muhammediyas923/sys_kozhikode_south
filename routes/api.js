const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const auth = require('../middlewares/auth');
const upload = require('../middlewares/upload');
const completionUpload = require('../middlewares/completion-upload');
const zoneHelper = require('../helpers/zone-helper');
const circleHelper = require('../helpers/circle-helper');
const userHelper = require('../helpers/user-helper');
const programHelper = require('../helpers/program-helper');
const notifHelper = require('../helpers/notification-helper');
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

/* Notifications API removed for user dashboard (endpoints disabled). */

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
    const { name, code, username, password, status } = req.body;
    if (!name || !username || !password) return res.status(400).json({ success: false, message: 'Name, username, and password are required.' });
    const id = await zoneHelper.createZone({ name, code, username, password, status });
    return res.json({ success: true, id });
  } catch (error) {
    if (error.message.includes('already exists')) return res.status(409).json({ success: false, message: error.message });
    return next(error);
  }
});

router.put('/admin/zones/:id', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const updated = await zoneHelper.updateZone(req.params.id, req.body);
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
    const { zoneId, zoneName, name, code, username, password, status } = req.body;
    if (!zoneId || !name || !username || !password) return res.status(400).json({ success: false, message: 'Zone, circle name, username, and password are required.' });
    const id = await circleHelper.createCircle({ zoneId, zoneName, name, code, username, password, status });
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

router.put('/admin/profile/username', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const { username } = req.body;
    const userId = req.session.user._id;

    // Validate inputs
    if (!username || !String(username).trim()) {
      return res.status(400).json({ success: false, message: 'Username is required.' });
    }

    if (!userId || !ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: 'Invalid user session.' });
    }

    const taken = await userHelper.isUsernameTaken(username, userId);
    if (taken) {
      return res.status(409).json({ success: false, message: 'Username already exists.' });
    }
    await userHelper.updateUsername(userId, username);
    req.session.user.username = username;
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

router.put('/admin/profile/password', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.user._id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new passwords are required.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from the current password.' });
    }
    if (!userId || !ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: 'Invalid user session.' });
    }

    const valid = await userHelper.verifyPassword(userId, currentPassword);
    if (!valid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }
    await userHelper.resetPassword(userId, newPassword);
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

// Get all completions for a specific program (admin detail view)
router.get('/admin/programs/:id/completions', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const completions = await programHelper.getProgramCompletionDetails(req.params.id);
    const groupedStats = await programHelper.getGroupedCompletionStats(req.params.id);
    const program = await programHelper.getProgramById(req.params.id);
    return res.json({ success: true, completions, groupedStats, program });
  } catch (error) { return next(error); }
});

router.post('/admin/programs', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'),
  upload.array('attachments', 10), async (req, res, next) => {
    try {
      if (!req.body.assignTo) {
        return res.status(400).json({ success: false, message: 'Assign Program To (user type) is required.' });
      }
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
    } catch (error) {
      if (error.message && error.message.includes('Cannot change assigned user type')) {
        return res.status(400).json({ success: false, message: error.message });
      }
      return next(error);
    }
  }
);

router.post('/admin/programs/:id/publish', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    await programHelper.publishProgram(req.params.id);
    const program = await programHelper.getProgramById(req.params.id);
    // Notification broadcast disabled for unit dashboard
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

/* ─── SUPER ADMIN: MONTHLY PROGRAM COMPLETION REPORTS ────────────────────── */

router.get('/admin/monthly-reports', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const filters = {
      month: req.query.month,
      year: req.query.year,
      zone: req.query.zone,
      circle: req.query.circle,
      unit: req.query.unit,
      program: req.query.program,
      status: req.query.status,
      userType: req.query.userType,
      userRole: req.query.userRole,
      search: req.query.search,
    };
    const reportData = await programHelper.getMonthlyCompletionReports(filters);
    return res.json(reportData);
  } catch (error) { return next(error); }
});

router.get('/admin/monthly-reports/export/excel', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const filters = {
      month: req.query.month,
      year: req.query.year,
      zone: req.query.zone,
      circle: req.query.circle,
      unit: req.query.unit,
      program: req.query.program,
      status: req.query.status,
      userType: req.query.userType,
      userRole: req.query.userRole,
      search: req.query.search,
    };
    const reportData = await programHelper.getMonthlyCompletionReports(filters);
    const rows = reportData.completions || [];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Program Completion Report');

    sheet.columns = [
      { header: 'Program Name', key: 'programTitle', width: 28 },
      { header: 'User Type', key: 'userType', width: 15 },
      { header: 'Completed By', key: 'completedBy', width: 22 },
      { header: 'Username', key: 'username', width: 18 },
      { header: 'Zone', key: 'zone', width: 18 },
      { header: 'Circle', key: 'circle', width: 18 },
      { header: 'Unit', key: 'unit', width: 18 },
      { header: 'Target', key: 'target', width: 10 },
      { header: 'Completed Count', key: 'completionCount', width: 16 },
      { header: 'Remaining', key: 'remaining', width: 12 },
      { header: 'Progress %', key: 'progressPct', width: 12 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Completion Date', key: 'completionDate', width: 22 },
      { header: 'Participants', key: 'participantsCount', width: 14 },
      { header: 'Photos Count', key: 'imagesCount', width: 14 },
      { header: 'Remarks / Notes', key: 'notes', width: 35 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14533E' } };

    rows.forEach(r => {
      sheet.addRow({
        programTitle: r.programTitle,
        userType: r.userType,
        completedBy: r.completedBy,
        username: r.username,
        zone: r.zone || '-',
        circle: r.circle || '-',
        unit: r.unit || '-',
        target: r.target,
        completionCount: r.completionCount,
        remaining: r.remaining,
        progressPct: `${r.progressPct}%`,
        status: r.completed ? 'Completed' : 'Pending',
        completionDate: r.completionDate ? new Date(r.completionDate).toLocaleString() : '-',
        participantsCount: r.participantsCount || 0,
        imagesCount: r.imagesCount || 0,
        notes: r.notes || '-'
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="SYS_Monthly_Program_Completion_Report.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) { return next(error); }
});

router.get('/admin/monthly-reports/export/pdf', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const filters = {
      month: req.query.month,
      year: req.query.year,
      zone: req.query.zone,
      circle: req.query.circle,
      unit: req.query.unit,
      program: req.query.program,
      status: req.query.status,
      userType: req.query.userType,
      userRole: req.query.userRole,
      search: req.query.search,
    };
    const reportData = await programHelper.getMonthlyCompletionReports(filters);
    const rows = reportData.completions || [];

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="SYS_Monthly_Program_Completion_Report.pdf"');
    doc.pipe(res);

    doc.fontSize(16).fillColor('#14533E').text('SYS Kozhikode South - Monthly Program Completion Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#666666').text(`Generated on: ${new Date().toLocaleString()} | Total Records: ${rows.length}`, { align: 'center' });
    doc.moveDown(0.8);

    const headers = ['Program Name', 'Completed By', 'Type', 'Zone', 'Circle', 'Unit', 'Progress', 'Status', 'Date'];
    const colWidths = [150, 110, 70, 80, 80, 80, 70, 65, 75];
    const startX = 30;
    let y = doc.y;

    doc.fillColor('#14533E');
    let x = startX;
    headers.forEach((h, i) => {
      doc.rect(x, y, colWidths[i], 20).fill('#14533E');
      doc.fillColor('#FFFFFF').fontSize(8).text(h, x + 3, y + 6, { width: colWidths[i] - 6, lineBreak: false });
      x += colWidths[i];
    });
    y += 20;

    rows.slice(0, 300).forEach((row, idx) => {
      x = startX;
      const rowBg = idx % 2 === 0 ? '#F0F7F4' : '#FFFFFF';
      const dateStr = row.completionDate ? new Date(row.completionDate).toLocaleDateString() : '-';
      const rowData = [
        row.programTitle || '',
        row.completedBy || '',
        row.userType || '',
        row.zone || '-',
        row.circle || '-',
        row.unit || '-',
        `${row.completionCount}/${row.target} (${row.progressPct}%)`,
        row.completed ? 'Completed' : 'Pending',
        dateStr
      ];

      colWidths.forEach((w, i) => { doc.rect(x + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, w, 18).fill(rowBg); });
      x = startX;
      rowData.forEach((cell, i) => {
        const textCol = i === 7 ? (row.completed ? '#16a34a' : '#d97706') : '#333333';
        doc.fillColor(textCol).fontSize(7.5).text(String(cell), x + 3, y + 4, { width: colWidths[i] - 6, lineBreak: false });
        x += colWidths[i];
      });
      y += 18;
      if (y > 520) { doc.addPage(); y = 30; }
    });

    doc.end();
  } catch (error) { return next(error); }
});

router.get('/admin/monthly-reports/export/csv', auth.requireApiLogin, auth.requireApiRole('SuperAdmin'), async (req, res, next) => {
  try {
    const filters = {
      month: req.query.month,
      year: req.query.year,
      zone: req.query.zone,
      circle: req.query.circle,
      unit: req.query.unit,
      program: req.query.program,
      status: req.query.status,
      userType: req.query.userType,
      userRole: req.query.userRole,
      search: req.query.search,
    };
    const reportData = await programHelper.getMonthlyCompletionReports(filters);
    const rows = reportData.completions || [];

    const headers = ['Program Name', 'User Type', 'Completed By', 'Username', 'Zone', 'Circle', 'Unit', 'Target', 'Completed Count', 'Remaining', 'Progress %', 'Status', 'Completion Date', 'Participants', 'Photos Count', 'Remarks'];
    
    let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';

    rows.forEach(r => {
      const line = [
        r.programTitle,
        r.userType,
        r.completedBy,
        r.username,
        r.zone || '-',
        r.circle || '-',
        r.unit || '-',
        r.target,
        r.completionCount,
        r.remaining,
        `${r.progressPct}%`,
        r.completed ? 'Completed' : 'Pending',
        r.completionDate ? new Date(r.completionDate).toLocaleString() : '-',
        r.participantsCount || 0,
        r.imagesCount || 0,
        (r.notes || '-').replace(/"/g, '""')
      ].map(v => `"${String(v)}"`).join(',');
      csvContent += line + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="SYS_Monthly_Program_Completion_Report.csv"');
    return res.send(csvContent);
  } catch (error) { return next(error); }
});

/* ─── UNIT USER: PROGRAMS ────────────────────────────────────────────────── */

router.get('/unit/programs', auth.requireApiLogin, auth.requireApiRole('UnitUser', 'CircleUser', 'ZoneUser'), async (req, res, next) => {
  try {
    const user = req.session.user;
    const programs = await programHelper.getProgramsWithCompletion(user._id, { publishedOnly: true, userRole: user.role });
    return res.json({ success: true, programs });
  } catch (error) { return next(error); }
});

/* Legacy checkbox toggle endpoint removed — completion is now target-based via submit-completion */


// Submit a structured completion with optional images and notes
router.post('/unit/programs/:id/submit-completion',
  auth.requireApiLogin, auth.requireApiRole('UnitUser', 'CircleUser', 'ZoneUser'),
  completionUpload.array('images', 5),
  async (req, res, next) => {
    try {
      const user = req.session.user;
      const { completionCount, participantsCount, completionDate, notes } = req.body;

      const program = await programHelper.getProgramById(req.params.id);
      if (!program) {
        return res.status(404).json({ success: false, message: 'Program not found.' });
      }
      if (program.assignTo && program.assignTo.length > 0) {
        const assignedRole = Array.isArray(program.assignTo) ? program.assignTo[0] : program.assignTo;
        if (assignedRole !== user.role) {
          return res.status(403).json({ success: false, message: 'Access denied. This program is not assigned to your role.' });
        }
      }

      // Build image records from uploaded files
      const images = (req.files || []).map(f => ({
        originalName: f.originalname,
        filename: f.filename,
        url: `/uploads/completions/${f.filename}`,
      }));

      const result = await programHelper.submitCompletion(
        req.params.id,
        user._id,
        { zone: user.zone, circle: user.circle, unitName: user.unitName, username: user.username },
        { completionCount, participantsCount, completionDate, notes, images }
      );

      // Fetch program title for notification
      const progTitle = program ? program.title : 'Unknown Program';
      const requiredCount = program ? (program.requiredCount || 1) : 1;
      const count = parseInt(completionCount, 10) || 1;

      // Notify admin
      try {
        await notifHelper.createNotification(
          'admin',
          'unit_completed',
          `${user.unitName} completed "${progTitle}" (${count}/${requiredCount} times).`,
          { programId: req.params.id, userId: user._id, unitName: user.unitName }
        );
      } catch (notifErr) {
        console.warn('Notification creation failed:', notifErr.message);
      }

      return res.json({
        success: true,
        completionCount: result.completionCount,
        participantsCount: result.participantsCount,
        completed: result.completed,
        requiredCount,
        progressPct: Math.min(100, Math.round((result.completionCount / requiredCount) * 100)),
      });
    } catch (error) { return next(error); }
  }
);

/* Legacy checkbox toggle endpoint removed — completion is now target-based via submit-completion */

// Get update history for a specific program and user
router.get('/unit/programs/:id/updates', auth.requireApiLogin, auth.requireApiRole('UnitUser', 'CircleUser', 'ZoneUser'), async (req, res, next) => {
  try {
    const user = req.session.user;
    const updates = await programHelper.getProgramUpdates(req.params.id, user._id);
    return res.json({ success: true, updates });
  } catch (error) { return next(error); }
});

// Edit an update
router.put('/unit/programs/:id/updates/:updateId', auth.requireApiLogin, auth.requireApiRole('UnitUser'), async (req, res, next) => {
  try {
    const user = req.session.user;
    const { completionCount, participantsCount, notes, completionDate } = req.body;
    const updateData = {};
    if (completionCount !== undefined) updateData.completionCount = parseInt(completionCount, 10);
    if (participantsCount !== undefined) updateData.participantsCount = parseInt(participantsCount, 10);
    if (notes !== undefined) updateData.notes = notes;
    if (completionDate !== undefined) updateData.completionDate = new Date(completionDate);
    updateData.updatedAt = new Date();

    const success = await programHelper.editProgramUpdate(req.params.updateId, req.params.id, user._id, updateData);
    return res.json({ success });
  } catch (error) { return next(error); }
});

// Delete an update
router.delete('/unit/programs/:id/updates/:updateId', auth.requireApiLogin, auth.requireApiRole('UnitUser'), async (req, res, next) => {
  try {
    const user = req.session.user;
    const success = await programHelper.deleteProgramUpdate(req.params.updateId, req.params.id, user._id);
    return res.json({ success });
  } catch (error) { return next(error); }
});

module.exports = router;
