var	exec = require('child_process').exec,
	config = require('./config.json');

var time = config.runIntervalTime * 1000 * 60;  //分钟为单位

console.log('forever --spinSleepTime ' + time + ' --minUptime ' + time + ' main.js');
exec('forever --spinSleepTime ' + time + ' --minUptime ' + time + ' main.js', {maxBuffer: config.cmdMaxBuffer});