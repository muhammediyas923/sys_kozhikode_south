module.exports = {
  requireLogin: function (req, res, next) {
    if (req.session && req.session.user) {
      return next();
    }
    return res.redirect('/login');
  },

  requireRole: function (role) {
    return function (req, res, next) {
      if (req.session?.user?.Role === role) {
        return next();
      }
      res.status(403).render('error', { message: 'Access denied' });
    };
  },
};
