var express = require('express');
var router = express.Router();

/* GET users listing. */
router.post('/user-interface', function(req, res, next) {
  res.render('/user/user-interface')
});


module.exports = router;
