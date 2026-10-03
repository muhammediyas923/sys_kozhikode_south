var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');
var hbs = require('hbs');
var config = require('./config/env');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var apiRouter = require('./routes/api');
var paymentsRouter = require('./routes/payments');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// Register Handlebars helpers
hbs.registerHelper('eq', function (a, b) {
  return a === b;
});
hbs.registerHelper('formatNumber', function (num) {
  return Number(num || 0).toLocaleString('en-IN');
});
hbs.registerHelper('formatDate', function (date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
});

app.disable('x-powered-by');

const securityHeaders = require('./middlewares/security-headers');
app.use(securityHeaders);

app.use(logger('dev'));
// Capture rawBody for webhook HMAC verification while parsing JSON
app.use(express.json({
  limit: '5mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '5mb' }));
app.use(cookieParser());
app.use(session({
  name: 'sys.sid',
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.app.isProduction,
    sameSite: 'lax',
    maxAge: config.session.maxAge,
  }
}));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

const csrfProtection = require('./middlewares/csrf');

app.use(function (req, res, next) {
  res.locals.currentUser = req.session.user || null;
  next();
});

app.use(csrfProtection);

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/api', apiRouter);
app.use('/', paymentsRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log the error for debugging
  console.error('Error:', {
    status,
    message,
    path: req.path,
    method: req.method,
    stack: err.stack
  });

  // If it's an API request, return JSON
  if (req.path.startsWith('/api')) {
    return res.status(status).json({ success: false, message });
  }

  // Otherwise render the error page
  res.locals.message = message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(status);
  res.render('error');
});

module.exports = app;
// trigger restart
// trigger restart 2
