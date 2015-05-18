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

var resultLog = [];

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
		nextObj.setBranch('isBgURL');
		nextObj.go();
	});
	srcURL.forEach(function (t) {
		t = t.split(/src=[\"|']/)[1];
		++counter;			//日志内容加1
		nextObj.setData({
			URL: t,
			filePath: data.filePath
		});
		nextObj.setBranch('isSrcURL');
		nextObj.go();
	});
	cssURL.forEach(function (t) {
		t = t.split(/href=[\"|']/)[1];
		nextObj.setData({
			URL: t,
			filePath: data.filePath,
			type: 'css'
		});
		nextObj.setBranch('isCssURL');
		nextObj.go();
	});
}

/**
 * 根据链接分发请求
 * @param  {data}
 *	{
		URL: '传入链接',
		filePath: '来自路径',
		type: '文件类型' (仅非图片链接时需要赋值)
	}
 */
function urlAssign (data) {
	var nextObj = new createNextObj();
	var	protocol = data.URL.match(/(https|http|data)(.*?)(?=\:)/gi) || [''];	//链接合法性验证
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
	else if(protocol === 'http' || protocol === 'https'){
		nextObj.setData({
			protocol: protocol,
			URL: data.URL,
			filePath: data.filePath,
			type: data.type
		});
		nextObj.setBranch('isURL');
		nextObj.go();
	}
	else if(!data.type){		//非法图片链接流程
		nextObj.setData({
			fileName: data.URL,
			fileData: data.URL,
			filePath: data.filePath,
			status: 'UnKnow'
		});
		nextObj.setBranch('notURL');
		nextObj.go();
	}
}

/**
 * 获取文件内容
 * @param  {data}
 *	{
		URL: '传入链接',
		filePath: '来自路径',
		type: '文件类型' (仅非图片链接时需要赋值)
	}
 */
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
				nextObj.setBranch('isImage');
			}
			nextObj.go();
		});
	}).on('error', function(e) {
		if(!data.type){
			nextObj.setData({
				fileName: data.URL,
				fileData: file,
				filePath: data.filePath,
				encode: 'utf8',
				status: status || e.code
			});
			nextObj.setBranch('isError');
			nextObj.go();
		}
	}).setTimeout(config.imgTimeout, function(){
		status = 'timeout';
		this.socket.destroy();
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
	var item = {
		URL: data.fileName,
		size: data.fileData.length,
		path: data.filePath,
		status: data.status
	};
	resultLog.push(item);

	--counter;			//日志序列减1
	if(counter === 0) {
		resultLog = resultLog.sort(function (n1, n2) {
			n1 = +n1.size;
			n2 = +n2.size;

			if((isNaN(n1) || isNaN(n2)) === false){
				return n2 - n1;
			}
		});

		fs.writeFile(config.logPath, JSON.stringify(resultLog), {encoding: 'utf8', flag: 'w'}, function (err) {
			if (err) {
				console.log('%s %s', nextObj.from, err.message);
			}
			else{
				nextObj.go();
			}
		});
	}
}

function setXLS () {
	var nextObj = new createNextObj();

	var xlsData = resultLog.map(function (t) {
		if(t.size > 0 || t.status !== 'UnKnow'){
			return htmlTemplate(t);
		}
	});
	xlsData.unshift(htmlTemplate({				//插入表头
		URL: '图片链接',
		size: '文件长度',
		path: '文件路径',
		status: '图片状态'
	}));
	xlsData[0] = '\ufeff' + xlsData[0];			//为xls兼容加BOM

	// console.log(xlsData);
	fs.writeFile(config.mailLogPath, xlsData.join('\r\n'), {encoding: 'ucs2', flag: 'w+'}, function (err) {
		if (err) {
			console.log('%s %s', nextObj.from, err.message);
		}
		else{
			nextObj.go();
		}
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
				path: config.mailLogPath
			}
		]
	},function () {
		nextObj.go();
	});
}

function htmlTemplate (data) {
	return data.URL + '\t' + data.size + '\t' + data.path + '\t' + data.status;
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

var taskProcess = {
	'init': {
		'isURLList': {
			'name': getFromListFile,
			'alias': '读取目标列表'
		},
		'isDirectory': {
			'name': getFromDirectory,
			'alias': '读取目标目录'
		}
	},
	'getFromListFile': {
		'default': {
			'name': urlAssign,
			'alias': '从URL列表中获取链接'
		}
	},
	'getFromDirectory': {
		'default': {
			'name': extractImageURL,
			'alias': '从目录中获取文件'
		}
	},
	'extractImageURL': {
		'isBgURL': {
			'name': urlAssign,
			'alias': '提取背景URL'
		},
		'isSrcURL': {
			'name': urlAssign,
			'alias': '提取资源URL'
		},
		'isCssURL': {
			'name': urlAssign,
			'alias': '提取样式表URL'
		}
	},
	'urlAssign': {
		'isDataURL': {
			'name': setLog,
			'alias': '链接中图片dataURL'
		},
		'isURL': {
			'name': getFile,
			'alias': '链接中图片外链URL'
		},
		"notURL": {
			'name': setLog,
			'alias': '链接中非外链URL'
		}
	},
	'getFile': {
		'isCss': {
			'name': extractImageURL,
			'alias': '文件内容中样式链接'
		},
		'isHTML': {
			'name': extractImageURL,
			'alias': '文件内容中页面链接'
		},
		'isImage': {
			'name': setLog,
			'alias': '文件内容中图片链接'
		},
		'isError': {
			'name': setLog,
			'alias': '文件内容获取出错'
		}
	},
	'setLog': {
		'default': {
			'name': setXLS,
			'alias': '写入日志文件'
		}
	},
	'setXLS': {
		'default': {
			'name': sendMail,
			'alias': '降序排列内容'
		}
	},
	'sendMail': {
		'default': {
			'name': exit,
			'alias': '发送邮件'
		}
	}
};

var fnStatistics = {};
// 控制器对象
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

	t.clearLog();
	t.printLog();
	try {
		t.taskProcess[t.from][t.branch]['name'].call(t, t.data);
	} catch(e) {
		t.printLog();
		console.log(t.from, t.branch, t.data);			//出错时提示debug信息
	}
};
createNextObj.prototype.printLog = function() {
	var tInfo = this.taskProcess[this.from][this.branch];

	if (fnStatistics[tInfo.alias] === undefined) {
		fnStatistics[tInfo.alias] = 0;
	}
	fnStatistics[tInfo.alias]++;

	for (var i in fnStatistics) {
		if (fnStatistics.hasOwnProperty(i)) {
			process.stdout.write( i + ': ' + fnStatistics[i] + '\n');
		}
	}
};
createNextObj.prototype.clearLog = function() {
	process.stdout.clearScreenDown();
	process.stdout.cursorTo(0, 0);
};

exec('svn update').on('exit', function (err) {
	if(err !== 0){
		console.log('命令执行失败');
	}
	// init(null, 'isURLList');
	init(null, 'isDirectory');
});

//todo 关键词生成小报告