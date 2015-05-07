var	path = require('path'),
	fs = require('fs');

var counter = {
	all: 0,
	fileSum: 0,
	folderSum: 0
};

function getFromDictionary (filePath, callback) {
	fs.readdir(filePath, function (err, file) {
		file.forEach(function (t, idx) {
			counter.all++;
			fs.stat(filePath + '/' + t, function (err, stats) {
				if (stats.isDirectory()) {
					counter.folderSum++;
					callback && callback(filePath + '/' + t);
					return getFromDictionary(filePath + '/' + t, callback);
				}
				else if(stats.isFile()){
					counter.fileSum++;
					callback && callback(filePath + '/' + t);
				}

				if(counter.all === (counter.fileSum + counter.folderSum)){
					console.log('遍历完毕');
					// process.exit();
				}
			});
		});
	});
}

getFromDictionary('./cms', function (filePath) {
	console.log(filePath, counter.fileSum, counter.folderSum, counter.all);
})