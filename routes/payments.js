const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const auth = require('../middlewares/auth');
const config = require('../config/env');
const paymentHelper = require('../helpers/payment-helper');

/* ─── USER PAYMENT PAGE ─────────────────────────────────────────────────── */

router.get('/payments', auth.requireLogin, async (req, res, next) => {
  try {
    const user = req.session.user;

    // Super Admin should not use user payment page
    if (user.role === 'SuperAdmin') {
      return res.redirect('/super-admin/payment-reports');
    }

    // Must be one of the non-admin roles
    if (!['UnitUser', 'CircleUser', 'ZoneUser'].includes(user.role)) {
      return res.status(403).render('error', { message: 'Access denied: Invalid user role for payments.' });
    }

    const history = await paymentHelper.getUserPaymentHistory(user._id);

    return res.render('payments', {
      user,
      keyId: config.razorpay.keyId,
      currency: config.razorpay.currency,
      paymentMode: config.razorpay.mode,
      history,
      layout: false,
      pageTitle: 'Payments & Contributions',
      activePage: 'payments',
    });
  } catch (error) {
    return next(error);
  }
});

/* ─── SUPER ADMIN PAYMENT REPORTS PAGE ───────────────────────────────────── */

router.get('/super-admin/payment-reports', auth.requireLogin, auth.requireRole('SuperAdmin'), (req, res) => {
  res.render('super-admin/payment-reports', {
    user: req.session.user,
    layout: false,
    pageTitle: 'Payment Reports',
    activePage: 'payment-reports',
  });
});

/* ─── USER PAYMENT APIS ──────────────────────────────────────────────────── */

// Create Razorpay Order (Server-Side)
router.post(
  '/api/payments/create-order',
  auth.requireApiLogin,
  auth.requireApiRole('UnitUser', 'CircleUser', 'ZoneUser'),
  async (req, res, next) => {
    try {
      const { amount, purpose, description } = req.body;
      const orderData = await paymentHelper.createOrder(req.session.user, { amount, purpose, description });
      return res.json({ success: true, order: orderData });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message || 'Failed to create payment order.' });
    }
  }
);

// Verify Payment Signature (Server-Side)
router.post(
  '/api/payments/verify',
  auth.requireApiLogin,
  auth.requireApiRole('UnitUser', 'CircleUser', 'ZoneUser'),
  async (req, res, next) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      const result = await paymentHelper.verifyPayment({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        user: req.session.user,
      });
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message || 'Payment signature verification failed.' });
    }
  }
);

// Record Client-Side Failure
router.post(
  '/api/payments/failure',
  auth.requireApiLogin,
  async (req, res, next) => {
    try {
      const { orderId, paymentId, errorCode, errorDescription } = req.body;
      await paymentHelper.recordFailure({
        orderId,
        paymentId,
        errorCode,
        errorDescription,
        user: req.session.user,
      });
      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  }
);

// Get User's Own Payment History (IDOR protected)
router.get(
  '/api/payments/history',
  auth.requireApiLogin,
  auth.requireApiRole('UnitUser', 'CircleUser', 'ZoneUser'),
  async (req, res, next) => {
    try {
      const history = await paymentHelper.getUserPaymentHistory(req.session.user._id);
      return res.json({ success: true, history });
    } catch (error) {
      return next(error);
    }
  }
);

// Get Single Payment Details for User
router.get(
  '/api/payments/:id',
  auth.requireApiLogin,
  async (req, res, next) => {
    try {
      const payment = await paymentHelper.getPaymentById(req.params.id, req.session.user);
      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment record not found.' });
      }
      return res.json({ success: true, payment });
    } catch (error) {
      return next(error);
    }
  }
);

/* ─── SUPER ADMIN REPORT APIS ────────────────────────────────────────────── */

// Filtered, paginated payments list with summary totals
router.get(
  '/api/admin/payments',
  auth.requireApiLogin,
  auth.requireApiRole('SuperAdmin'),
  async (req, res, next) => {
    try {
      const filters = {
        role: req.query.role,
        zone: req.query.zone,
        circle: req.query.circle,
        unit: req.query.unit,
        status: req.query.status,
        purpose: req.query.purpose,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        quickDate: req.query.quickDate,
        search: req.query.search,
      };

      const pagination = {
        page: req.query.page,
        limit: req.query.limit,
      };

      const sort = {
        field: req.query.sortField || 'createdAt',
        order: req.query.sortOrder || 'desc',
      };

      const reportData = await paymentHelper.getAdminPaymentReports(filters, pagination, sort);
      return res.json({
        success: true,
        payments: reportData.payments,
        totals: reportData.totals,
        pagination: reportData.pagination,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Single payment transaction detail for modal
router.get(
  '/api/admin/payments/:id',
  auth.requireApiLogin,
  auth.requireApiRole('SuperAdmin'),
  async (req, res, next) => {
    try {
      const payment = await paymentHelper.getPaymentById(req.params.id, req.session.user);
      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment record not found.' });
      }
      return res.json({ success: true, payment });
    } catch (error) {
      return next(error);
    }
  }
);

/* ─── EXPORT ENDPOINTS (SUPER ADMIN ONLY) ────────────────────────────────── */

// Export to Excel (.xlsx)
router.get(
  '/api/admin/payments/export/excel',
  auth.requireApiLogin,
  auth.requireApiRole('SuperAdmin'),
  async (req, res, next) => {
    try {
      const filters = {
        role: req.query.role,
        zone: req.query.zone,
        circle: req.query.circle,
        status: req.query.status,
        purpose: req.query.purpose,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        search: req.query.search,
      };

      const payments = await paymentHelper.getAllPaymentsForExport(filters);

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Payment Transactions');

      sheet.columns = [
        { header: 'Order ID', key: 'orderId', width: 24 },
        { header: 'Payment ID', key: 'paymentId', width: 24 },
        { header: 'User / Unit Name', key: 'displayName', width: 24 },
        { header: 'Username', key: 'username', width: 16 },
        { header: 'Role', key: 'role', width: 14 },
        { header: 'Zone', key: 'zone', width: 18 },
        { header: 'Circle', key: 'circle', width: 18 },
        { header: 'Amount (INR)', key: 'amount', width: 14 },
        { header: 'Purpose', key: 'purpose', width: 25 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Created Date', key: 'createdAt', width: 20 },
        { header: 'Paid Date', key: 'paidAt', width: 20 },
      ];

      // Format header row with SYS Brand Dark Green
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14533E' } };

      payments.forEach((p) => {
        sheet.addRow({
          orderId: p.orderId,
          paymentId: p.paymentId || '-',
          displayName: p.displayName || '-',
          username: p.username || '-',
          role: p.role || '-',
          zone: p.zone || '-',
          circle: p.circle || '-',
          amount: p.amount,
          purpose: p.purpose || '-',
          status: p.status ? p.status.toUpperCase() : '-',
          createdAt: p.createdAt ? new Date(p.createdAt).toLocaleString('en-IN') : '-',
          paidAt: p.paidAt ? new Date(p.paidAt).toLocaleString('en-IN') : '-',
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="SYS_Payment_Transactions_Report.xlsx"');

      await workbook.xlsx.write(res);
      return res.end();
    } catch (error) {
      return next(error);
    }
  }
);

// Export to PDF (.pdf)
router.get(
  '/api/admin/payments/export/pdf',
  auth.requireApiLogin,
  auth.requireApiRole('SuperAdmin'),
  async (req, res, next) => {
    try {
      const filters = {
        role: req.query.role,
        zone: req.query.zone,
        circle: req.query.circle,
        status: req.query.status,
        purpose: req.query.purpose,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        search: req.query.search,
      };

      const payments = await paymentHelper.getAllPaymentsForExport(filters);

      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="SYS_Payment_Transactions_Report.pdf"');
      doc.pipe(res);

      doc.fontSize(16).fillColor('#14533E').text('SYS Kozhikode South - Payment Transactions Report', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#666666').text(`Generated: ${new Date().toLocaleString('en-IN')} | Total Records: ${payments.length}`, { align: 'center' });
      doc.moveDown(0.8);

      const headers = ['Order ID', 'Payment ID', 'User / Unit', 'Role', 'Zone', 'Circle', 'Amount', 'Purpose', 'Status', 'Date'];
      const colWidths = [100, 100, 100, 65, 75, 75, 60, 95, 55, 65];
      const startX = 30;
      let y = doc.y;

      // Draw table header
      let x = startX;
      headers.forEach((h, i) => {
        doc.rect(x, y, colWidths[i], 20).fill('#14533E');
        doc.fillColor('#FFFFFF').fontSize(8).text(h, x + 3, y + 6, { width: colWidths[i] - 6, lineBreak: false });
        x += colWidths[i];
      });
      y += 20;

      // Draw rows (up to 300 in PDF)
      payments.slice(0, 300).forEach((row, idx) => {
        x = startX;
        const rowBg = idx % 2 === 0 ? '#F0F7F4' : '#FFFFFF';
        const dateStr = row.paidAt ? new Date(row.paidAt).toLocaleDateString('en-IN') : (row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-IN') : '-');
        const rowData = [
          row.orderId || '',
          row.paymentId || '-',
          row.displayName || row.username || '-',
          row.role || '-',
          row.zone || '-',
          row.circle || '-',
          `INR ${row.amount}`,
          row.purpose || '-',
          row.status ? row.status.toUpperCase() : '-',
          dateStr,
        ];

        colWidths.forEach((w, i) => {
          doc.rect(x + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, w, 18).fill(rowBg);
        });

        x = startX;
        rowData.forEach((cell, i) => {
          const textCol = i === 8 ? (row.status === 'paid' ? '#16a34a' : '#d97706') : '#333333';
          doc.fillColor(textCol).fontSize(7).text(String(cell), x + 3, y + 5, { width: colWidths[i] - 6, lineBreak: false });
          x += colWidths[i];
        });

        y += 18;
        if (y > 520) {
          doc.addPage();
          y = 30;
        }
      });

      doc.end();
    } catch (error) {
      return next(error);
    }
  }
);

// Export to CSV (.csv)
router.get(
  '/api/admin/payments/export/csv',
  auth.requireApiLogin,
  auth.requireApiRole('SuperAdmin'),
  async (req, res, next) => {
    try {
      const filters = {
        role: req.query.role,
        zone: req.query.zone,
        circle: req.query.circle,
        status: req.query.status,
        purpose: req.query.purpose,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        search: req.query.search,
      };

      const payments = await paymentHelper.getAllPaymentsForExport(filters);
      const headers = ['Order ID', 'Payment ID', 'User Name', 'Username', 'Role', 'Zone', 'Circle', 'Amount (INR)', 'Purpose', 'Status', 'Created At', 'Paid At'];

      let csvContent = headers.map((h) => `"${h}"`).join(',') + '\n';

      payments.forEach((p) => {
        const line = [
          p.orderId,
          p.paymentId || '-',
          p.displayName || '-',
          p.username || '-',
          p.role || '-',
          p.zone || '-',
          p.circle || '-',
          p.amount,
          (p.purpose || '-').replace(/"/g, '""'),
          p.status ? p.status.toUpperCase() : '-',
          p.createdAt ? new Date(p.createdAt).toLocaleString('en-IN') : '-',
          p.paidAt ? new Date(p.paidAt).toLocaleString('en-IN') : '-',
        ]
          .map((v) => `"${String(v)}"`)
          .join(',');
        csvContent += line + '\n';
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="SYS_Payment_Transactions_Report.csv"');
      return res.send(csvContent);
    } catch (error) {
      return next(error);
    }
  }
);

/* ─── WEBHOOK LISTENER ───────────────────────────────────────────────────── */

router.post('/api/payments/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const result = await paymentHelper.handleWebhook(req.rawBody, signature);

    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ success: false, message: 'Internal webhook error.' });
  }
});

module.exports = router;
