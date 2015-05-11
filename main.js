var https = require('https'),
	http = require('http'),
	path = require('path'),
	fs = require('graceful-fs'),
	iconv = require('iconv-lite'),
	nodemailer = require('nodemailer'),
	config = require('./config.json'),
	exec = require('child_process').exec,
	supportFile = config.fileType.split('|'),
	counter = 0;

// 控制器流程
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
		'isHTML': extractImageURL,
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
};

// 控制器部分
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
	// console.log(t.from, t.branch, t.data);					//debug switcher
	t.taskProcess[t.from][t.branch].call(t, t.data);
};

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
		if (err) {
			console.log('%s %s', nextObj.from, err.message);
		}
		file.forEach(function (t) {
			var filePath = directory + '/' + t;
			fs.stat(filePath, function (err, stats) {
				if (err) {
					console.log('%s %s', nextObj.from, err.message);
				}
				if (stats.isDirectory()) {
					getFromDirectory({
						directory: filePath
					});
				}
				else if(stats.isFile() && supportFile.indexOf(path.extname(t)) > -1){		//todo multiExtName
					fs.readFile(filePath, function (err, data) {
						if (err) {
							console.log('%s %s', nextObj.from, err.message);
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
 */
function getFromListFile (data) {
	var nextObj = new createNextObj();
	var urlList = data.urlList || config.urlPath;
	fs.readFile(urlList, {encoding: 'utf8'}, function (err, data) {
		if (err) {
			console.log('%s %s', nextObj.from, err.message);
		} else{
			data.split('\r\n').forEach(function (t) {
				nextObj.setData({
					URL: t,
					filePath: t,
					encode: 'utf8',
					type: 'html'
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
	var srcURL = content.match(/<img(.+?)src=[\"|'](\S*?)(?=[\"|'])/gi) || [],
		bgURL = content.match(/(background|background-image)(\s*?):(\s*?)url\((.+?)(?=[\"|']*?\))/gi) || [],
		cssURL = content.match(/<link(.*?)href=[\"|'](.+?)\.css(?=[\"|'])/gi) || [];

	bgURL.forEach(function (t) {
		t = t.split(t.match(/url(\s)*?\((.*?)['|\"]*/)[0])[1];
		++counter;			//日志内容加1
		nextObj.setData({
			URL: t,
			filePath: data.filePath
		});
		nextObj.go();
	});
	srcURL.forEach(function (t) {
		t = t.split(/src=[\"|']/)[1];
		++counter;			//日志内容加1
		nextObj.setData({
			URL: t,
			filePath: data.filePath
		});
		nextObj.go();
	});
	cssURL.forEach(function (t) {
		t = t.split(/href=[\"|']/)[1];
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
	var	protocol = data.URL.match(/(https|http|data)(.*?)(?=\:)/gi) || [''];
		protocol = protocol[0];

	if(protocol === 'data') {		//统计dataURL有bug,前后引号一致
		var fileName = data.URL.slice(0, 15) + '...' + data.URL.slice(-15);
		nextObj.setData({
			fileName: fileName,
			fileData: data.URL,
			filePath: data.filePath,
			status: 'success'
		});
		nextObj.setBranch('isDataURL');
		nextObj.go();
	}
	else if(protocol.length > 0){
		nextObj.setData({
			protocol: protocol,
			URL: data.URL,
			filePath: data.filePath,
			type: data.type
		});
		nextObj.setBranch('isURL');
		nextObj.go();
	}
	else if(!data.type){
		nextObj.setData({
			fileName: data.URL,
			fileData: data.URL,
			filePath: data.filePath,
			status: 'UnKnow'
		});
		nextObj.setBranch('isDataURL');
		nextObj.go();
	}
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
			} else if (data.type === 'html') {
				nextObj.setData({
					fileData: file,
					filePath: data.URL,
					encode: 'utf8'
				});
				nextObj.setBranch('isHTML');
			} else{
				nextObj.setData({
					fileName: data.URL,
					fileData: file,
					filePath: data.filePath,
					status: 'success'
				});
			}
			nextObj.go();
		});
	}).on('error', function(e) {
		if(!data.type){
			nextObj.setData({
				fileName: data.URL,
				fileData: file,
				filePath: data.filePath,
				status: status || e.code
			});
			nextObj.go();
		}
	}).setTimeout(config.imgTimeout, function(){
		status = 'timeout';
		this.socket.destroy();
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
			console.log('%s %s', 'logInit', err.message);
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
	var nextObj = new createNextObj();
	var item = htmlTemplate({
		URL: data.fileName,
		size: data.fileData.length,
		path: data.filePath,
		status: data.status
	});
	if(data.fileData.length > 0 || data.status !== 'UnKnow'){
		fs.writeFile(config.logPath, item, {encoding: 'utf8', flag: 'a'}, function (err) {
			--counter;			//日志内容加1
			if (err) {
				console.log('%s %s', nextObj.from, err.message);
			}
			else{
				console.log(counter + ' Saved! ' + item);
			}
			if(counter === 0) {
				nextObj.go();
			}
		});
	}
	else{
		--counter;			//日志内容加1
		console.log(counter + ' not Saved! ' + item);
		if(counter === 0) {
			nextObj.go();
		}
	}
}

function sortMax () {
	var nextObj = new createNextObj();
	fs.readFile(config.logPath, {encoding: 'utf8'}, function (err, data) {
		if (err) {
			console.log('%s %s', nextObj.from, err.message);
		}
		var sortedData;
		data = data.split('\r\n');
		data[0] = '\ufeff' + data[0];			//为xls兼容加BOM
		data.pop();								//去结尾空行
		sortedData = data.sort(function (n1, n2) {
			n1 = +n1.split('\t')[1];
			n2 = +n2.split('\t')[1];

			if((isNaN(n1) || isNaN(n2)) === false){
				return n2 - n1;
			}
		}).join('\r\n');
		fs.writeFile(config.logPath, sortedData, {encoding: 'ucs2', flag: 'w+'}, function (err) {
			if (err) {
				console.log('%s %s', nextObj.from, err.message);
			}
			else{
				console.log('sort done!');
				nextObj.go();
			}
		});
	});
}

function sendMail () {
	var nextObj = new createNextObj();
	var transporter = nodemailer.createTransport(config.mailInfo);

	transporter.sendMail({
		from: config.mailInfo.auth.user,
		to: config.mailInfo.mailTo,
		subject: config.mailInfo.mailSubject,
		html: config.mailInfo.mailContentHTML,
		attachments: [
			{
				path: config.logPath
			}
		]
	},function () {
		console.log('Mail Send!');
		nextObj.go();
	});
}

function htmlTemplate (data) {
	return data.URL + '\t' + data.size + '\t' + data.path + '\t' + data.status + '\r\n';
}

function exit () {
	process.exit();
}

function init (data, branch) {
	var nextObj = new createNextObj();

	nextObj.setData(data);
	nextObj.setBranch(branch);
	nextObj.go();
}


exec('svn update').on('exit', function (err) {
	if(err !== 0){
		console.log('命令执行失败');
	}
	logInit();					//todo 整合
	// init(null, 'isList');
	init(null, 'isDirectory');
});

//todo 关键词生成小报告