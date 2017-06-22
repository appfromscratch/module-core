import * as http from 'http';
import * as Promise from 'bluebird';
import * as fs from 'fs-extra-promise';
import * as path from 'path';
import * as express from 'express';
import * as MarkdownIt from 'markdown-it';

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

function readMarkDownFile(filePath : string) : Promise<string> {
  var md = new MarkdownIt();
  return fs.readFileAsync(filePath, 'utf8')
    .then((data) => {
      return md.render(data);
    });
}

function readMarkDownFileList(filePathList : string[]) : Promise<string[]> {
  return Promise.map(filePathList, readMarkDownFile);
}

function readRawFile(filePath : string) : Promise<Buffer> {
  return fs.readFileAsync(filePath);
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
    switch (path.extname(mappedPath)) {
      case '.md':
        return readMarkDownFile(mappedPath)
          .then((data) => {
            return res.end(data);
          })
          .catch(next);
      default:
        return readRawFile(mappedPath)
          .then((data) => {
            return res.end(data);
          })
          .catch(next);
    }
  }
}


app.use(sayHelloMiddleware);
app.get('/', function (req, res, next) {
  return readMarkDownFileList([
    './static/landing-page/jumbotron.md',
    './static/landing-page/proposition.md',
    './static/landing-page/benefits/benefit-1.md',
    './static/landing-page/benefits/benefit-2.md',
    './static/landing-page/benefits/benefit-3.md',
    './static/landing-page/topics/topic-1.md',
    './static/landing-page/topics/topic-2.md',
    './static/landing-page/topics/topic-3.md',
    './static/landing-page/call-to-action.md'
  ].map((filePath) => path.join(__dirname, filePath)))
    .then((markdownFiles) => {
      console.log('markdownFiles', markdownFiles)
      return res.render('index', {
        jumbotron: markdownFiles[0],
        proposition: markdownFiles[1],
        benefits: [
          markdownFiles[2],
          markdownFiles[3],
          markdownFiles[4]
        ],
        topics: [
          markdownFiles[5],
          markdownFiles[6],
          markdownFiles[7]
        ],
        callToAction: markdownFiles[8]
      })
    })
    .catch(next);
});
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
