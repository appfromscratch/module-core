var http = require('http'); // http <- the http module.
var fs = require('fs');
var path = require('path');

// called back.
// by using callback - Node.js handles IO asynchronously.
var server = http.createServer(function (req, res) {
  console.log('a new request', req.method, req.url);
  fs.readFile(path.join(__dirname, 'read2.js'), 'utf8', function (err, data) {
    res.setHeader('content-type', 'text/plain');
    if (err) {
      res.statusCode = 500;
      res.end('Error: ' + err.stack);
    } else {
      res.end(data);
    }
  });
  //res.end('hello world, App From Scratch is here!');
});
var PORT = 8000;
server.listen(PORT, function(err) {
  console.log('running server on ', PORT, err);
})
