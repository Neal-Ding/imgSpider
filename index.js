var	exec = require('child_process').exec,
	config = require('./config.json');

var time = config.time * 1000 * 60;  //分钟为单位
exec('forever --spinSleepTime ' + config.time + ' --minUptime ' + config.time + ' main.js');