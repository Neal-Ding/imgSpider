var https = require('https'),
	http = require('http'),
	path = require('path'),
	fs = require('graceful-fs'),
	util = require('util'),
	iconv = require('iconv-lite');

var config = {
	urlPath: './url.txt',		//列表文件路径
	path: './cms',				//文件夹路径
	fileType: '.vm',			//指定类型读取
	count: 0,
	logPath: './log.txt'
};

/**
 * 遍历文件夹
 * @param  {String}   filePath 文件路径
 * @param  {Function} callback 文件回调处理
 */
function getFromDictionary (filePath, callback) {
	fs.readdir(filePath, function (err, file) {
		file.forEach(function (t) {
			fs.stat(filePath + '/' + t, function (err, stats) {
				if (stats.isDirectory()) {
					arguments.callee(filePath + '/' + t, callback);
				}
				else if(stats.isFile() && path.extname(t) === config.fileType){
					fs.readFile(filePath + '/' + t, function (err, data) {
						if(err){
							console.log(err);
						}
						else{
							callback && callback(data, filePath + '/' + t, 'gbk', getFile);
						}
					});
				}
			});
		});
	});
}

/**
 * 分析URL读取文件
 * @param  {[type]}   filePath 文件路径
 * @param  {Function} callback [description]
 */
function getFromListFile (filePath, callback) {
	fs.readFile(filePath, function (err, data) {
		if (err) {
			console.log(err);
		} else{
			data = iconv.decode(data, 'utf8').split('\r\n');	//换行字符问题
			data.forEach(function (t) {
				getFile(t, t, function (URL, file, filePath) {
					callback && callback(file, filePath, 'utf8', getFile)
				});
			});
		}
	});
}

/**
 * 处理文件内容
 * @param  {String}   data     文件内容
 * @param  {String}   filePath 文件路径
 * @param  {String}   code     编码方式
 * @param  {Function} callback 回调
 */
function handleFile (data, filePath, code, callback) {
	data = iconv.decode(data, code);
	var srcURL = data.match(/img src=[\"|\'](.?)[\"|\']/gi) || [],
		bgURL = data.match(/url\((.+?)\)/gi) || [],
		cssURL = data.match(/href=[\"|\'](.+?)\.css[\"|\']/gi) || [];

	bgURL.forEach(function (t) {
		t = t.slice(4, -1).split(/[\"|\']/);
		if(t[1]){
			t = t[1];
		}
		else{
			t = t[0];
		}
		// console.log(t, filePath, ++config.count);
		callback && callback(t, filePath, setLog);
	});
	srcURL.forEach(function (t) {
		t = t.slice(9, -1);
		// console.log(t, filePath, ++config.count);
		callback && callback(t, filePath, setLog);
	});
	cssURL.forEach(function (t) {
		t = t.slice(6, -1);
		// console.log(t, filePath, ++config.count);
		callback && callback(t, filePath + ' --> ' + t, function (URL, file, filePath) {
			// console.log(URL, file)
			handleFile(file, filePath, 'utf8', callback);
		});
	});
}

/**
 * 针对指定链接获取文件
 * @param  {String} URL      文件链接
 * @param  {String} filePath 来自文件路径
 */
function getFile (URL, filePath, callback) {
	var bufferArr = [],
		bufferLen = 0,
		file = new Buffer(0),
		protocol = URL.match(/[http|https|data](.+?)\:/gi) || [];


	switch (protocol[0]) {
		case 'http:':
			protocol = http;
			break;
		case 'https:':
			protocol = https;
			break;
		case 'data:':
			protocol = 'data';
			break;
		default:
			protocol = null;
			break;
	}

	if(protocol === 'data') {
		var fileName = URL.slice(0, 15) + '...' + URL.slice(-15);
		callback && callback(fileName, URL, filePath, "success");
	}
	else if(protocol){
		protocol.get(URL, function (res) {
			res.on('data', function (data) {
				if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 304) {
					bufferArr.push(data);
					bufferLen += data.length;
				}
			});
			res.on('end', function () {
				file = Buffer.concat(bufferArr, bufferLen);
				// console.log(1);
				callback && callback(URL, file, filePath, "success");
			});
		}).on('error', function(e) {
			console.log('getFile ' + e.message + URL + file.length);
			callback && callback(URL, file, filePath, e.message);
		});
	}
	else {
		callback && callback(URL, file, filePath, 'UnKnow');
	}
}

/**
 * 输出日志
 * @param {String} URL      文件链接
 * @param {String} fileSize 文件大小
 * @param {String} filePath 文件目录
 * @param {String} status   文件状态
 */
function setLog (URL, file, filePath, status) {
	var item = URL + "\t" + file.length + "\t" + filePath + "\t" + status + "\r\n";
	// console.log(item);
	fs.writeFile(config.logPath, item, {flag: 'a'}, function (err) {
		if (err) {
			console.log('setLog ' + err.message);
		}
		else{
			console.log(++config.count + ' Saved! ' + item);
		}
	});
}

function logInit () {
	var item = "图片链接\t文件长度\t文件路径\t图片状态\r\n";
	fs.writeFile(config.logPath, item, {flag: 'w'}, function (err) {
		err && console.log(err);
		console.log('logInit Success');
	});
}

logInit();
// getFromDictionary (config.path, handleFile);		//以目录获取Log
getFromListFile (config.urlPath, handleFile);		//以URL列表读取