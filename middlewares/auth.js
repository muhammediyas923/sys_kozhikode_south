module.exports = {
  requireLogin: function (req, res, next) {
    if (req.session && req.session.user) {
      return next();
    }
    return res.redirect('/login');
  },

  requireRole: function (...roles) {
    return function (req, res, next) {
      if (roles.includes(req.session?.user?.role)) {
        return next();
      }
      res.status(403).render('error', { message: 'Access denied' });
    };
  },

  requireApiLogin: function (req, res, next) {
    if (req.session && req.session.user) {
      return next();
    }
    return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
  },

  requireApiRole: function (...roles) {
    return function (req, res, next) {
      if (roles.includes(req.session?.user?.role)) {
        return next();
      }
      return res.status(403).json({ success: false, message: 'Access denied.' });
    };
  },
};
