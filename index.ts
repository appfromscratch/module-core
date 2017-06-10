import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import * as MarkdownIt from 'markdown-it';

// let's add some changes.

function fooHandler(req : express.Request, res : express.Response) {
  res.setHeader('content-type', 'text/plain');
  return res.end('you have reached page foo');
}

function barHandler(req : express.Request, res : express.Response) {
  res.setHeader('content-type', 'text/plain');
  return res.end('you have reached page BAR');
}

function defaultHandler(req : express.Request, res  : express.Response) {
  return fs.readFile(path.join(__dirname, 'read.js'), 'utf8', function (err : any, data : string) {
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
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

function sayHelloMiddleware(req : express.Request, res : express.Response, next : express.NextFunction) {
  console.log('we are saying hello', req.url);
  next();
}

function errorMiddleware(err : any, req : express.Request, res : express.Response, next : express.NextFunction) {
  res.statusCode = 500;
  res.end('This is the default error handler' + err.stack);
}

function throwErrorIfReached(req : express.Request, res : express.Response) {
  throw new Error("I am reached");
}

function mapUrlToFilePath(url : string, folderName : string) {
  return path.join(__dirname, folderName, url);
}

function configurableStaticFileHandler(folderName : string) {
  return function staticFileHandler(req : express.Request, res : express.Response, next : express.NextFunction) {
    // 1 - identify which particular file that this request is asking for.
    // 2 - find that file, read it, and then serve out the result.
    // hello.html
    // /hello.html.
    // /hello.html => static/hello.html
    // /test.html => static/test.html
    // <url> => static/<url>
    var mappedPath = mapUrlToFilePath(req.url, folderName);
    var md = new MarkdownIt();
    // .md => md.render
    // .png => pass through (binary instead of utf8)
    // .html => pass through.
    fs.readFile(mappedPath, function (err : any, data : Buffer) {
      if (err != null) {
        next(err);
      } else {
        console.log('mappedPath =', mappedPath, path.extname(mappedPath));
        switch (path.extname(mappedPath)) {
          case '.md':
            // convert this data over from html to markdown.
            try {
              return res.end(md.render(data.toString('utf8')));
            } catch (e) {
              return next(e);
            }
          default:
            return res.end(data);
        }
      }
    });
  }
}


app.use(sayHelloMiddleware);
app.get('/', function (req, res, next) {
  return res.render('index', {});
});
app.get('/foo', fooHandler);
//app.post('/foo', fooHandler);
app.get('/bar', barHandler);
app.get('/xyz', function (rqe, res) {
  res.end('this is the XYZ handler');
});
app.get('/error', throwErrorIfReached);
app.use(express.static(path.join(__dirname, 'static')));
app.use(configurableStaticFileHandler('static'));

// called back.
// by using callback - Node.js handles IO asynchronously.
var server = http.createServer(app);
var PORT = 8000;
server.listen(PORT, function(err : any) {
  console.log('running server on ', PORT, err);
})
