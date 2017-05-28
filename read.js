var fs = require('fs'); // this is the file system module. built-in to node.
//var server = require('./index'); // relative module, based on the current file's directory.
var path = require('path'); // path manipulation.

// the 3rd variable is the callback
///*

fs.readFile(path.join(__dirname, 'index1.js'), 'utf8', function (err, data) {
  if (err != null) {
    console.error('error occured', err);
  } else {
    console.log(data);
  }
});

//*/

// Node.js differ from other programmnig environment. we write code in async fashion.
// synchronous IO code is easier to write!!!!!
/*
try {
  var data = fs.readFileSync(path.join(__dirname, 'index2.js'), 'utf8');
  console.log(data);
} catch (e) {
  console.error('handling error', e);
}
//*/


