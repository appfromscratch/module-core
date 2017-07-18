import * as http from 'http';
import * as Promise from 'bluebird';
import * as fs from 'fs-extra-promise';
import * as path from 'path';
import * as express from 'express';
import * as MarkdownIt from 'markdown-it';
import * as pug from 'pug';
import * as chokidar from 'chokidar';

var md = new MarkdownIt({ html: true });
require('pug').filters['md'] = function (data : string, options : any) {
  return md.render(data);
};
require('pug').filters['mdInclude'] = function (relPath : string, options : any) {
  let filePath = path.relative(options.filename, relPath);
  let data = fs.readFileSync(filePath, 'utf8');
  return md.render(data);
};

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

interface List<T> {
  isEmpty() : boolean;
  push(item: T) : List<T>;
  has(item: T) : boolean;
  toArray() : T[];
}

class Empty<T> implements List<T> {
  isEmpty() : boolean { return true }
  push(item : T) : List<T> {
    return new Pair<T>(item, this);
  }
  has(item: T) : boolean { return false; }
  toArray() : T[] { return []; }
}

class Pair<T> implements List<T> {
  readonly head : T;
  readonly tail : List<T>;
  constructor(head: T, tail : List<T>) {
    this.head = head;
    this.tail = tail;
  }
  isEmpty() : boolean { return false; }

  push(item : T) : List<T> {
    return new Pair<T>(item, this);
  }

  has(item : T) : boolean {
    let current : List<T> = this;
    while (current instanceof Pair) {
      if (current.head === item)
        return true;
      current = current.tail;
    }
    return false;
  }
  toArray() : T[] {
    let result : T[] = [];
    let current : List<T> = this;
    while (current instanceof Pair) {
      result.push(current.head);
      current = current.tail;
    }
    return result;
  }
}

let includeRegex = /<Include>\s*([^<\s]+)\s*<\/Include>/g;

interface Template {
  filename: string;
  fullPath: string;
  mtime: number;
  fn: (locals ?: {[key: string] : any}) => string;
}

class TemplateEngine {
  private _templateMap : {[key: string] : Template};
  private _basePath : string;
  private _watcher : chokidar.FSWatcher;

  constructor(basePath : string) {
    this._basePath = basePath;
    this._templateMap = {};
    this._watcher = chokidar.watch(this._basePath, {
      ignored: /(^|[\/\\])\../,
      persistent: true
    })
    this._watcher
      .on('change', (fullPath : string, stat : fs.Stats) => {
        console.info('Template.change', fullPath);
        if (this._templateMap[fullPath]) { // only refresh if it exists in the template.
          console.info('Template.change:RECOMPILE', fullPath);
          this.compileSetTemplate(fullPath)
            .then(() => null)
        }
      })
      .on('unlink', (fullPath : string) => {
        delete this._templateMap[fullPath];
      })
  }

  getFullTemplatePath(templateFilePath : string) : string {
    if (path.isAbsolute(templateFilePath)) {
      return templateFilePath;
    } else {
      return path.join(this._basePath, templateFilePath);
    }
  }

  compileSetTemplate(fullTemplateFilePath : string) : Promise<Template> {
    return this.compileTemplate(fullTemplateFilePath)
      .then((template) => {
        this._templateMap[fullTemplateFilePath] = template;
        return template;
      })
  }

  getTemplate(templateFilePath : string) : Promise<Template> {
    let fullTemplateFilePath = this.getFullTemplatePath(templateFilePath);
    if (this._templateMap[fullTemplateFilePath]) {
      return Promise.resolve<Template>(this._templateMap[fullTemplateFilePath]);
    } else {
      return this.compileSetTemplate(fullTemplateFilePath);
    }
  }

  compilePugTemplate(fullTemplateFilePath : string) : Promise<Template> {
    return fs.statAsync(fullTemplateFilePath)
      .then((stat) => {
        if (stat.isFile()) {
          return {
            filename: path.basename(fullTemplateFilePath),
            fullPath: fullTemplateFilePath,
            mtime: stat.mtime.getTime(),
            fn: pug.compileFile(fullTemplateFilePath, {
              filename: path.basename(fullTemplateFilePath),
              basedir: this._basePath
            })
          }
        } else {
          throw new Error(`NotFile: ${fullTemplateFilePath}`)
        }
      });
  }

  compileMarkdownTemplate(fullTemplateFilePath : string) : Promise<Template> {
    return fs.statAsync(fullTemplateFilePath)
      .then((stat) => {
        if (stat.isFile()) {
          return fs.readFileAsync(fullTemplateFilePath, 'utf8')
            .then((data) => {
              return {
                filename: path.basename(fullTemplateFilePath),
                fullPath: fullTemplateFilePath,
                mtime: stat.mtime.getTime(),
                fn: (locals: any) => {
                  return md.render(data, { html : true })
                }
              }
            })
        } else {
          throw new Error(`NotFile: ${fullTemplateFilePath}`)
        }
      })
  }

  compileTemplate(fullTemplateFilePath : string) : Promise<Template> {
    let extname = path.extname(fullTemplateFilePath);
    switch (extname) {
      case '.pug':
        return this.compilePugTemplate(fullTemplateFilePath);
      case '.md':
        return this.compileMarkdownTemplate(fullTemplateFilePath);
      default:
        throw new Error(`UnknownTemplateType: ${extname}`);
    }
  }

  getRelativeFullPath(fullFilePath : string, relativePath : string) : string {
    return path.join(path.dirname(fullFilePath), relativePath);
  }

  renderCycleError(fullTemplateFilePath : string, prev : List<string>) : Promise<string> {
    return this.render('_cycle-error.pug', {
      filePath: fullTemplateFilePath,
      stack: prev.toArray()
    });
  }

  renderNoCycle(templateFilePath : string, locals: {[key: string]: any}, prev : List<string>) : Promise<string> {
    let fullTemplateFilePath = this.getFullTemplatePath(templateFilePath);
    if (prev.has(fullTemplateFilePath)) {
      return this.renderCycleError(fullTemplateFilePath, prev);
    }
    return this.getTemplate(templateFilePath)
      .then((template) => {
        let result = template.fn(locals);
        let [ fragments , includePaths ] = this.splitByIncludes(result);
        let output : string[] = [ fragments[0] ];
        let fullIncludePaths = includePaths.map((includePath) => {
          return this.getRelativeFullPath(fullTemplateFilePath, includePath);
        });
        return Promise.map(fullIncludePaths, (includePath) => {
          return this.renderNoCycle(includePath, locals, prev.push(fullTemplateFilePath));
        })
          .then((files) => {
            for (var i = 0; i < files.length; ++i) {
              output.push(files[i]);
              output.push(fragments[i + 1]);
            }
            return output.join('');
          })
      })
  }

  render(templateFilePath : string, locals ?: {[key: string]: any}) : Promise<string> {
    return this.renderNoCycle(templateFilePath, locals || {}, new Empty<string>());
  }

  findIncludePaths(html : string) : string[] {
    let result = html.match(includeRegex);
    console.log('This.findIncludePaths', result);
    if (result) {
      return result.map((res) => res.replace(includeRegex, '$1'));
    } else {
      return [];
    }
  }

  splitByIncludes(html : string) : [ string[] , string[] ] {
    let split = html.split(includeRegex);
    let fragments : string[] = [ split[0] ];
    let includePaths : string[] = [];
    for (var i = 1; i < split.length; i = i + 2) {
      includePaths.push(split[i]);
      fragments.push(split[i + 1]);
    }
    return [ fragments, includePaths ];
  }

}

let templateEngine = new TemplateEngine(path.join(__dirname, 'static'));

app.use(sayHelloMiddleware);
app.get('/', function (req, res, next) {
  templateEngine.render('index.pug')
    .then(result => res.end(result))
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
