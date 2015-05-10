var https = require('https'),
	http = require('http'),
	path = require('path'),
	fs = require('graceful-fs'),
	util = require('util'),
	iconv = require('iconv-lite'),
	nodemailer = require('nodemailer'),
	config = require('./config.json'),
	counter = 0;

/**
 * 遍历源文件夹并读取指定类型文件
 * @param  {String}   directory		源文件夹
 * @nData  {String}   fileData		文件内容
 * @nData  {String}   sourcePath	文件路径	
 * @nData  {String}   encode		文件编码
 */
function getFromDirectory (data) {
	var nextObj = new createNextObj();
	var directory = data.directory || config.folderPath;
	fs.readdir(directory, function (err, file) {
		file.forEach(function (t, idx) {
			var filePath = directory + '/' + t;
			fs.stat(filePath, function (err, stats) {
				if (stats.isDirectory()) {
					getFromDirectory({
						directory: filePath
					});
				}
				else if(stats.isFile() && path.extname(t) === config.fileType){		//todo multiExtName
					fs.readFile(filePath, function (err, data) {
						if(err){
							console.log(err);
						}
						else{
							nextObj.setData({
								fileData: data,
								filePath: filePath,
								encode: 'gbk'
							});
							nextObj.go();
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
function getFromListFile (data) {
	var nextObj = new createNextObj();
	fs.readFile(config.urlPath, {encoding: 'utf8'}, function (err, data) {
		if (err) {
			console.log(err);
		} else{
			data.split('\r\n').forEach(function (t) {
				nextObj.setData({
					URL: t,
					filePath: t,
					encode: 'utf8'
				});
				nextObj.go();
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
function extractImageURL (data) {
	var nextObj = new createNextObj();
	var content = iconv.decode(data.fileData, data.encode);
	var srcURL = content.match(/img src=(\"|\')(.+?)(\"|\')/gi) || [],
		bgURL = content.match(/url\((.+?)\)/gi) || [],
		cssURL = content.match(/href=[\"|\'](.+?)\.css[\"|\']/gi) || [];

	bgURL.forEach(function (t) {
		t = t.slice(4, -1).split(/[\"|\']/);
		if(t[1]){
			t = t[1];
		}
		else{
			t = t[0];
		}
		++counter;			//日志内容加1
		nextObj.setData({
			URL: t,
			filePath: data.filePath
		});
		nextObj.go();
	});
	srcURL.forEach(function (t) {
		t = t.slice(9, -1);
		++counter;			//日志内容加1
		nextObj.setData({
			URL: t,
			filePath: data.filePath
		});
		nextObj.go();
	});
	cssURL.forEach(function (t) {
		t = t.slice(6, -1);
		nextObj.setData({
			URL: t,
			filePath: data.filePath,
			type: 'css'
		});
		nextObj.go();
	});
}

/**
 * 根据链接分发请求
 * @param  {String} URL	  文件链接
 * @param  {String} filePath 来自文件路径
 */
function urlAssign (data) {
	var nextObj = new createNextObj();
	var	protocol = data.URL.match(/(https|http|data)(.?)\:/gi) || [''];

	protocol = protocol[0].split(':')[0];

	if(protocol === 'data') {		//统计dataURL有bug,前后引号一致
		var fileName = data.URL.slice(0, 15) + '...' + data.URL.slice(-15);
		nextObj.setData({
			fileName: fileName,
			fileData: data.URL,
			filePath: data.filePath,
			status: 'success'
		});
		nextObj.setBranch('isDataURL');
	}
	else if(protocol.length > 0){
		nextObj.setData({
			protocol: protocol,
			URL: data.URL,
			filePath: data.filePath,
			type: data.type
		});
		nextObj.setBranch('isURL');
	}
	else {
		nextObj.setData({
			fileName: data.URL,
			fileData: data.URL,
			filePath: data.filePath,
			status: 'UnKnow'
		});
		nextObj.setBranch('isDataURL');
	}
	nextObj.go();
}

function getFile (data) {
	var nextObj = new createNextObj();
	var bufferArr = [],
		bufferLen = 0,
		file = new Buffer(0),
		protocol = data.protocol,
		status;

	protocol = (protocol === 'http') ? http : 
		(protocol === 'https') ? https : null;

	protocol.get(data.URL, function (res) {
		res.on('data', function (data) {
			if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 304) {
				bufferArr.push(data);
				bufferLen += data.length;
			}
		});
		res.on('end', function () {
			file = Buffer.concat(bufferArr, bufferLen);
			if (data.type === 'css') {
				nextObj.setData({
					fileData: file,
					filePath: data.filePath + ' --> ' + data.URL,
					encode: 'utf8'
				});
				nextObj.setBranch('isCss');
			} else{
				nextObj.setData({
					fileName: data.URL,
					fileData: file,
					filePath: data.filePath,
					status: status || 'success'
				});
			}			
			nextObj.go();
		});
	}).on('error', function(e) {
		status = e.message;
	});
}

function logInit () {
	// var nextObj = new createNextObj();
	var item = htmlTemplate({
		URL: '图片链接',
		size: '文件长度',
		path: '文件路径',
		status: '图片状态'
	});
	fs.writeFile(config.logPath, item, {encoding: 'utf8', flag: 'w'}, function (err) {
		if (err) {
			console.log('%s %s', arguments.callee.name, err.message);
		}
		console.log('logInit Success');
		// nextObj.go();
	});
}

/**
 * 输出日志
 * @param {String} URL	  文件链接
 * @param {String} fileSize 文件大小
 * @param {String} filePath 文件目录
 * @param {String} status   文件状态
 */
function setLog (data) {
	var item = htmlTemplate({
		URL: data.fileName,
		size: data.fileData.length,
		path: data.filePath,
		status: data.status
	});

	if(data.fileData.length > 0){
		fs.writeFile(config.logPath, item, {encoding: 'utf8', flag: 'a'}, function (err) {
			if (err) {
				console.log('%s %s', arguments.callee.name, err.message);
			}
			else{
				--counter;			//日志内容加1
				console.log(counter + ' Saved! ' + item);
				if(counter === 0) {
					nextObj.go();
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
		var sortedData;
		data = data.split('\r\n');
		data[0] = '\ufeff' + data[0];			//为xls兼容加BOM
		data.pop();								//去结尾空行
		sortedData = data.sort(function (n1, n2) {
			var n1 = +n1.split('\t')[1];
				n2 = +n2.split('\t')[1];

			if((isNaN(n1) || isNaN(n2)) == false){
				return n2 - n1;
			}
		}).join('\r\n');
		fs.writeFile(config.logPath, data, {encoding: 'ucs2', flag: 'w+'}, function (err) {
			if (err) {
				console.log('%s %s', arguments.callee.name, err.message);
			}
			else{
				console.log('sort done!');
				nextObj.go();
			}
		});
	});
}

function sendMail () {
	var transporter = nodemailer.createTransport(config.mailInfo);

	transporter.sendMail({
		from: config.mailInfo.auth.user,
		to: config.mailTo,
		subject: config.mailInfo.mailTo,
		html: config.mailInfo.mailContentHTML,
		attachments: [
			{
				path: config.logPath
			}
		]
	},function () {
		console.log('Mail Send!')
		nextObj.go();
	});
}

function htmlTemplate (data) {
	return data.URL + '\t' + data.size + '\t' + data.path + '\t' + data.status + '\r\n';
}

function init (data, branch) {
	var nextObj = new createNextObj();

	nextObj.setData(data);
	nextObj.setBranch(branch);
	nextObj.go();
}

function exit () {
	process.exit();
}

function createNextObj (myprocess) {
	this.data = {};
	this.branch = 'default';
	this.from = arguments.callee.caller.name;
	this.taskProcess = myprocess || taskProcess;
}
createNextObj.prototype.setData = function(data) {
	this.data = data || {};
};
createNextObj.prototype.setBranch = function(branch) {
	this.branch = branch || 'default';
};
createNextObj.prototype.go = function() {
	var t = this;
	console.log(t.from, t.branch, t.data);					//todo debug
	t.taskProcess[t.from][t.branch].call(t, t.data);
};

logInit();			//todo 整合

var taskProcess = {
	'init': {
		'isList': getFromListFile,
		'isDirectory': getFromDirectory,
		'default': getFromDirectory
	},
	'getFromListFile': {
		'default': urlAssign
	},
	'getFromDirectory': {
		'default': extractImageURL
	},
	'extractImageURL': {
		'default': urlAssign
	},
	'urlAssign': {
		'isDataURL': setLog,
		'isURL': getFile,
		'default': setLog
	},
	'getFile': {
		'isCss': extractImageURL,
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


// init(null, 'isList');
init(null, 'isDirectory');

