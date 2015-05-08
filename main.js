var https = require('https'),
	http = require('http'),
	path = require('path'),
	fs = require('graceful-fs'),
	util = require('util'),
	iconv = require('iconv-lite'),
	nodemailer = require('nodemailer'),
	config = require('./config.json'),
	counter = 0;

var counter = {
	allFileFolder: 0,
	file: 0,
	folder: 0,
	all

}

/**
 * 遍历文件夹
 * @param  {String}   filePath 文件路径
 * @param  {Function} callback 文件回调处理
 */
function getFromDictionary (filePath) {
	fs.readdir(filePath, function (err, file) {
		file.forEach(function (t, idx) {
			fs.stat(filePath + '/' + t, function (err, stats) {
				if (stats.isDirectory()) {
					getFromDictionary(filePath + '/' + t);
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
	fs.readFile(filePath, {encoding: 'utf8'}, function (err, data) {
		if (err) {
			console.log(err);
		} else{
			data.split('\r\n').forEach(function (t) {	//换行字符问题
				getFile(t, t, function (URL, file, filePath) {
					callback && callback(file, filePath, 'utf8', getFile)
				});
			});
		}
	});
}

/**
 * 处理文件内容
 * @param  {String}   data	 文件内容
 * @param  {String}   filePath 文件路径
 * @param  {String}   code	 编码方式
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
		++counter;			//日志内容加1
		callback && callback(t, filePath, setLog, false);
	});
	srcURL.forEach(function (t) {
		t = t.slice(9, -1);
		++counter;			//日志内容加1
		callback && callback(t, filePath, setLog, false);
	});
	cssURL.forEach(function (t) {
		t = t.slice(6, -1);
		callback && callback(t, filePath + ' --> ' + t, function (URL, file, filePath) {
			// console.log(URL, file)
			handleFile(file, filePath, 'utf8', callback);
		});
	});
}

/**
 * 针对指定链接获取文件内容
 * @param  {String} URL	  文件链接
 * @param  {String} filePath 来自文件路径
 */
function getFile (URL, filePath, callback, isCss) {
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

	if(protocol === 'data') {		//统计dataURL有bug
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
				callback && callback(URL, file, filePath, "success");
			});
		}).on('error', function(e) {
			// console.log('getFile ' + e.message + URL + file.length);
			callback && callback(URL, file, filePath, e.message);
		});
	}
	else {
		callback && callback(URL, file, filePath, 'UnKnow');
	}
}

function logInit () {
	var item = htmlTemplate({
		link: '图片链接',
		size: '文件长度',
		dir: '文件路径',
		status: '图片状态'
	});
	fs.writeFile(config.logPath, item, {encoding: 'utf8', flag: 'w'}, function (err) {
		err && console.log(err);
		console.log('logInit Success');
	});
}

/**
 * 输出日志
 * @param {String} URL	  文件链接
 * @param {String} fileSize 文件大小
 * @param {String} filePath 文件目录
 * @param {String} status   文件状态
 */
function setLog (URL, file, filePath, status) {

	var item = htmlTemplate({
		link: URL,
		size: file.length,
		dir: filePath,
		status: status
	});
	// console.log(item);
	if(file.length && file.length > 0){
		fs.writeFile(config.logPath, item, {encoding: 'utf8', flag: 'a'}, function (err) {
			if (err) {
				console.log('setLog ' + err.message);
			}
			else{
				--counter;			//日志内容加1
				console.log(counter + ' Saved! ' + item);
				if(counter === 0) {
					nextStep();
				}
			}
		});
	}
	else{
		--counter;			//日志内容加1
	}
}

function sortMax () {
	fs.readFile(config.logPath, {encoding: 'utf8'}, function (err, data) {
		var data = data.split('\r\n');
		data[0] = '\ufeff' + data[0];
		data.pop();								//去结尾空行
		data = data.sort(function (n1, n2) {
			var n1 = +n1.split('\t')[1];
				n2 = +n2.split('\t')[1];

			if((isNaN(n1) || isNaN(n2)) == false){
				return n2 - n1;
			}
		}).join('\r\n');
		fs.writeFile(config.logPath, data, {encoding: 'ucs2', flag: 'w+'}, function (err) {
			if (err) {
				console.log('sort ' + err.message);
			}
			else{
				console.log('sort done!');
				nextStep();
			}
		});
	});
}

function sendMail () {
	var transporter = nodemailer.createTransport(config.mailConfig);

	transporter.sendMail({
		from: config.mailConfig.auth.user,
		to: config.mailTo,
		subject: 'hello',
		html: '<p style="color: red;">33333</p>',
		attachments: [
			{
				path: config.logPath
			}
		]
	},function () {
		nextStep();
	});
}

function htmlTemplate (data) {
	// return '<tr><td>' + data.link + '</td><td>' + data.size + '</td><td>' + data.dir + '</td><td>' + data.status + '</td></tr>'
	return data.link + '\t' + data.size + '\t' + data.dir + '\t' + data.status + '\r\n';
}

function nextStep (data, branch) {
	var data = data || null,
		name = arguments.callee.caller.name,
		branch = branch || 'default';

	taskProcess[name][branch].apply(this, data)
}

logInit();

// getFromDictionary (config.folderPath, handleFile);		//以目录获取Log
getFromListFile (config.urlPath, handleFile);		//以URL列表读取

// sortMax();

var taskProcess = {
	'init': {
		'isList': getFromListFile,
		'isDirectory': getFromDictionary,
		'default': getFromDictionary
	},
	'getFromListFile': {
		'default': handleFile
	},
	'getFromDictionary': {
		'default': handleFile
	},
	'handleFile': {
		'isCss': handleFile,
		'default': imgFilter
	},
	'imgFilter': {
		'isDataURL': setLog,
		'isURL': getImg,
		'default': setLog
	},
	'getImg': {
		'default': setLog
	},
	'setLog': {
		'default': sortMax
	},
	'sortMax': {
		'default': sendMail
	},
	'sendMail': {
		'default': exit
	}
}