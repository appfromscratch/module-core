"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var http = require("http");
var Promise = require("bluebird");
var fs = require("fs-extra-promise");
var path = require("path");
var express = require("express");
var MarkdownIt = require("markdown-it");
var pug = require("pug");
var md = new MarkdownIt({ html: true });
require('pug').filters['md'] = function (data, options) {
    return md.render(data);
};
require('pug').filters['mdInclude'] = function (relPath, options) {
    var filePath = path.relative(options.filename, relPath);
    var data = fs.readFileSync(filePath, 'utf8');
    return md.render(data);
};
var app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
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
function mapUrlToFilePath(url, folderName) {
    return path.join(__dirname, folderName, url);
}
function readMarkDownFile(filePath) {
    var md = new MarkdownIt();
    return fs.readFileAsync(filePath, 'utf8')
        .then(function (data) {
        return md.render(data);
    });
}
function readMarkDownFileList(filePathList) {
    return Promise.map(filePathList, readMarkDownFile);
}
function readRawFile(filePath) {
    return fs.readFileAsync(filePath);
}
function configurableStaticFileHandler(folderName) {
    return function staticFileHandler(req, res, next) {
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
                    .then(function (data) {
                    return res.end(data);
                })
                    .catch(next);
            default:
                return readRawFile(mappedPath)
                    .then(function (data) {
                    return res.end(data);
                })
                    .catch(next);
        }
    };
}
var includeRegex = /<Include>\s*([^<\s]+)\s*<\/Include>/g;
var TemplateEngine = (function () {
    function TemplateEngine(basePath) {
        this._basePath = basePath;
        this._templateMap = {};
    }
    TemplateEngine.prototype.getFullTemplatePath = function (templateFilePath) {
        if (path.isAbsolute(templateFilePath)) {
            return templateFilePath;
        }
        else {
            return path.join(this._basePath, templateFilePath);
        }
    };
    TemplateEngine.prototype.getTemplate = function (templateFilePath) {
        var _this = this;
        var fullTemplateFilePath = this.getFullTemplatePath(templateFilePath);
        if (this._templateMap[fullTemplateFilePath]) {
            return Promise.resolve(this._templateMap[fullTemplateFilePath]);
        }
        else {
            return this.compileTemplate(fullTemplateFilePath)
                .then(function (template) {
                _this._templateMap[fullTemplateFilePath] = template;
                return template;
            });
        }
    };
    TemplateEngine.prototype.compileTemplate = function (fullTemplateFilePath) {
        var _this = this;
        var extname = path.extname(fullTemplateFilePath);
        switch (extname) {
            case '.pug':
                return Promise.try(function () { return pug.compileFile(fullTemplateFilePath, {
                    filename: path.basename(fullTemplateFilePath),
                    basedir: _this._basePath
                }); });
            case '.md':
                return fs.readFileAsync(fullTemplateFilePath, 'utf8')
                    .then(function (data) {
                    return function (locals) {
                        return md.render(data, { html: true });
                    };
                });
            default:
                throw new Error("UnknownTemplateType: " + extname);
        }
    };
    TemplateEngine.prototype.getRelativeFullPath = function (fullFilePath, relativePath) {
        return path.join(path.dirname(fullFilePath), relativePath);
    };
    TemplateEngine.prototype.render = function (templateFilePath, locals) {
        var _this = this;
        var fullTemplateFilePath = this.getFullTemplatePath(templateFilePath);
        return this.getTemplate(templateFilePath)
            .then(function (fn) {
            var result = fn(locals);
            var _a = _this.splitByIncludes(result), fragments = _a[0], includePaths = _a[1];
            console.info('TemplateEngine.render', templateFilePath, fragments, includePaths);
            var output = [fragments[0]];
            var fullIncludePaths = includePaths.map(function (includePath) {
                return _this.getRelativeFullPath(fullTemplateFilePath, includePath);
            });
            return Promise.map(fullIncludePaths, function (includePath) {
                return _this.render(includePath, locals);
            })
                .then(function (files) {
                for (var i = 0; i < files.length; ++i) {
                    output.push(files[i]);
                    output.push(fragments[i + 1]);
                }
                return output.join('');
            });
        });
    };
    TemplateEngine.prototype.findIncludePaths = function (html) {
        var result = html.match(includeRegex);
        console.log('This.findIncludePaths', result);
        if (result) {
            return result.map(function (res) { return res.replace(includeRegex, '$1'); });
        }
        else {
            return [];
        }
    };
    TemplateEngine.prototype.splitByIncludes = function (html) {
        var split = html.split(includeRegex);
        var fragments = [split[0]];
        var includePaths = [];
        for (var i = 1; i < split.length; i = i + 2) {
            includePaths.push(split[i]);
            fragments.push(split[i + 1]);
        }
        return [fragments, includePaths];
    };
    return TemplateEngine;
}());
var templateEngine = new TemplateEngine(path.join(__dirname, 'views'));
app.use(sayHelloMiddleware);
app.get('/', function (req, res, next) {
    templateEngine.render('index.pug')
        .then(function (result) { return res.end(result); })
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
server.listen(PORT, function (err) {
    console.log('running server on ', PORT, err);
});
//# sourceMappingURL=index.js.map