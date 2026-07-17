var express = require('express');
var router = express.Router();
const userHelper = require('../helpers/user-helper');
const programHelper = require('../helpers/program-helper');
const auth = require('../middlewares/auth');

/* GET home page */
router.get('/', function (req, res) {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('index');
});

/* GET Login page */
router.get('/login', function (req, res) {
  if (req.session.user) return res.redirect('/dashboard');
  const loginError = req.session.loginError;
  delete req.session.loginError;
  res.render('login', { loginError, layout: false });
});

/* POST Login */
router.post('/login', async function (req, res, next) {
  try {
    const { zone, circle, username, password } = req.body;
    const result = await userHelper.doLogin({ zone, circle, username, password });
    if (!result.status) {
      req.session.loginError = result.message;
      return res.redirect('/login');
    }
    req.session.user = result.user;
    return res.redirect('/dashboard');
  } catch (error) {
    next(error);
  }
});

/* GET Admin Login page */
router.get('/admin/login', function (req, res) {
  if (req.session.user) return res.redirect('/dashboard');
  const loginError = req.session.loginError;
  delete req.session.loginError;
  res.render('admin/login', { loginError, layout: false });
});

/* POST Admin Login */
router.post('/admin/login', async function (req, res, next) {
  try {
    const { username, password } = req.body;
    // For admin login, zone and circle are bypassed, so we don't pass them
    const result = await userHelper.doLogin({ username, password, isAdminLogin: true });
    if (!result.status || result.user.role !== 'SuperAdmin') {
      req.session.loginError = result.user?.role !== 'SuperAdmin' && result.status
        ? 'Access denied. Not an admin account.'
        : result.message || 'Invalid credentials.';
      return res.redirect('/admin/login');
    }
    req.session.user = result.user;
    return res.redirect('/dashboard');
  } catch (error) {
    next(error);
  }
});

/* Logout */
router.get('/logout', function (req, res) {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

/* Dashboard redirect */
router.get('/dashboard', auth.requireLogin, function (req, res) {
  if (req.session.user.role === 'SuperAdmin') {
    return res.redirect('/super-admin');
  }
  return res.redirect('/unit-dashboard');
});

/* ─── SUPER ADMIN ROUTES ──────────────────────────────────────────────────── */

router.get('/super-admin', auth.requireLogin, auth.requireRole('SuperAdmin'), function (req, res) {
  res.render('super-admin/dashboard', {
    user: req.session.user,
    layout: false,
    pageTitle: 'Dashboard',
    activePage: 'dashboard',
  });
});

router.get('/super-admin/zones', auth.requireLogin, auth.requireRole('SuperAdmin'), function (req, res) {
  res.render('super-admin/zones', {
    user: req.session.user,
    layout: false,
    pageTitle: 'Manage Zones',
    activePage: 'zones',
  });
});

router.get('/super-admin/circles', auth.requireLogin, auth.requireRole('SuperAdmin'), function (req, res) {
  res.render('super-admin/circles', {
    user: req.session.user,
    layout: false,
    pageTitle: 'Manage Circles',
    activePage: 'circles',
  });
});

router.get('/super-admin/users', auth.requireLogin, auth.requireRole('SuperAdmin'), function (req, res) {
  res.render('super-admin/users', {
    user: req.session.user,
    layout: false,
    pageTitle: 'Manage Users',
    activePage: 'users',
  });
});

router.get('/super-admin/programs', auth.requireLogin, auth.requireRole('SuperAdmin'), function (req, res) {
  res.render('super-admin/programs', {
    user: req.session.user,
    layout: false,
    pageTitle: 'Manage Programs',
    activePage: 'programs',
  });
});

router.get('/super-admin/profile', auth.requireLogin, auth.requireRole('SuperAdmin'), function (req, res) {
  res.render('super-admin/profile', {
    user: req.session.user,
    layout: false,
    pageTitle: 'Account Settings',
    activePage: 'profile',
  });
});

router.get('/super-admin/reports', auth.requireLogin, auth.requireRole('SuperAdmin'), function (req, res) {
  res.render('super-admin/reports', {
    user: req.session.user,
    layout: false,
    pageTitle: 'Reports',
    activePage: 'reports',
  });
});

/* ─── UNIT USER ROUTES ───────────────────────────────────────────────────── */

router.get('/unit-dashboard', auth.requireLogin, auth.requireRole('UnitUser'), async function (req, res, next) {
  try {
    const programs = Array.isArray(await programHelper.getProgramsWithCompletion(req.session.user._id, { publishedOnly: true }))
      ? await programHelper.getProgramsWithCompletion(req.session.user._id, { publishedOnly: true })
      : [];
    const serializedPrograms = programs.map((p) => ({
      ...p,
      _id: p._id && p._id.toString ? p._id.toString() : p._id,
      dueDate: p.dueDate ? new Date(p.dueDate).toISOString() : null,
      completedAt: p.completedAt ? new Date(p.completedAt).toISOString() : null,
    }));
    const programsJson = JSON.stringify(serializedPrograms).replace(/</g, '\\u003c');
    res.render('unit/dashboard', {
      user: req.session.user,
      layout: false,
      pageTitle: 'My Dashboard',
      activePage: 'dashboard',
      programs: serializedPrograms,
      __programCount: serializedPrograms.length,
      programsJson,
    });
  } catch (error) {
    return next(error);
  }
});

/* Keep /team route */
router.get('/team', function (req, res) {
  const team = [
    {
      name: 'Ameer Abdul Rahman',
      role: 'District President',
      description: 'Leading the SYS Kozhikode South District Committee and overseeing all district initiatives.',
      photo: 'https://via.placeholder.com/600x600?text=President',
    },
    {
      name: 'Zainab Fathima',
      role: 'District Secretary',
      description: 'Managing coordination across units and organizing district-level events.',
      photo: 'https://via.placeholder.com/600x600?text=Secretary',
    },
    {
      name: 'Muhammad Faiz',
      role: 'Treasurer',
      description: 'Responsible for financial planning, donations, and district funds management.',
      photo: 'https://via.placeholder.com/600x600?text=Treasurer',
    },
  ];
  res.render('team', { team });
});

module.exports = router;
