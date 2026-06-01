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
  res.render('login', { loginError });
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
  res.render('admin/admin-dashboard', { user: req.session.user });
});

router.get('/user-dashboard', auth.requireLogin, auth.requireRole('User'), function(req, res) {
  res.render('user/user-dashboard', { user: req.session.user });
});

router.get('/logout', function(req, res) {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
