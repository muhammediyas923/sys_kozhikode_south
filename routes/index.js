var express = require('express');
var router = express.Router();
const userHelper = require('../helpers/user-helper');
const auth = require('../middlewares/auth');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index');
});

router.get('/login', function(req, res) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  const loginError = req.session.loginError;
  delete req.session.loginError;
  res.render('login', { loginError, layout: false });
});

router.post('/login', async function(req, res, next) {
  try {
    const result = await userHelper.doLogin(req.body);
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

router.get('/dashboard', auth.requireLogin, function(req, res) {
  if (req.session.user.Role === 'Admin') {
    return res.redirect('/admin-dashboard');
  }
  return res.redirect('/user-dashboard');
});

router.get('/admin-dashboard', auth.requireLogin, auth.requireRole('Admin'), function(req, res) {
  // set a short-lived, HttpOnly cookie indicating dashboard session (non-sensitive)
  res.cookie('sys_dashboard_session', `role=${req.session.user.Role};ts=${Date.now()}`, {
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });
  res.render('admin/admin-dashboard', { user: req.session.user, layout: false });
});

router.get('/user-dashboard', auth.requireLogin, auth.requireRole('User'), function(req, res) {
  // set a short-lived, HttpOnly cookie indicating dashboard session (non-sensitive)
  res.cookie('sys_dashboard_session', `role=${req.session.user.Role};ts=${Date.now()}`, {
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.render('user/user-dashboard', { user: req.session.user, layout: false });
});

router.get('/team', function(req, res) {
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
    {
      name: 'Safa Nazeer',
      role: 'Women Wing Leader',
      description: 'Driving women’s programs, outreach, and leadership development within the district.',
      photo: 'https://via.placeholder.com/600x600?text=Women+Wing',
    },
    {
      name: 'Hassan Shibli',
      role: 'Youth Coordinator',
      description: 'Coordinating youth volunteer activities and training across the district units.',
      photo: 'https://via.placeholder.com/600x600?text=Youth+Coordinator',
    },
    {
      name: 'Amina Reshma',
      role: 'Public Relations Head',
      description: 'Managing communications, publicity, and community relations for SYS Kozhikode South.',
      photo: 'https://via.placeholder.com/600x600?text=PR+Head',
    },
  ];
  res.render('team', { team });
});

router.get('/logout', function(req, res) {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
