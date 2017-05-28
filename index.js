var http = require('http'); // http <- the http module.
var fs = require('fs');
var path = require('path');
var express = require('express');

function fooHandler(req, res) {
  res.setHeader('content-type', 'text/plain');
  return res.end('you have reached page foo');
}

function barHandler(req, res) {
  res.setHeader('content-type', 'text/plain');
  return res.end('you have reached page BAR');
}

function defaultHandler(req, res) {
  return fs.readFile(path.join(__dirname, 'read.js'), 'utf8', function (err, data) {
    res.setHeader('content-type', 'text/plain');
    if (err) {
      res.statusCode = 500;
      res.end('Error: ' + err.stack);
    } else {
      res.end(data);
    }
  });
}

var app = express();

function sayHelloMiddleware(req, res, next) {
  console.log('we are saying hello', req.url);
  next();
}

function errorMiddleware(err, req, res, next) {
  res.statusCode = 500;
  res.end('This is the default error handler' + err.stack);
}

function throwErrorIfReached(req, res) {
  throw new Error("I am reached");
}

app.use(sayHelloMiddleware);
app.get('/foo', fooHandler);
//app.post('/foo', fooHandler);
app.get('/bar', barHandler);
app.get('/xyz', function (rqe, res) {
  res.end('this is the XYZ handler');
});
app.get('/error', throwErrorIfReached);
app.use(defaultHandler);
app.use(errorMiddleware);

// called back.
// by using callback - Node.js handles IO asynchronously.
var server = http.createServer(app);
var PORT = 8000;
server.listen(PORT, function(err) {
  console.log('running server on ', PORT, err);
})
