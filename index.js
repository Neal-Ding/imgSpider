var	exec = require('child_process').exec,
	commander = require('commander');

commander
	.option('-t, --time [dir]', 'interval time [60000]', '60000')
	.option('-m, --mail ', 'mail to [wb-dingxinghua@alibaba-inc.com]', 'wb-dingxinghua@alibaba-inc.com')
	.parse(process.argv);

exec('svn update').on('exit', function (code) {
	exec('forever --spinSleepTime ' + commander.time + ' --minUptime ' + commander.time + ' main.js -m' + commander.mail);
	// console.log('forever --spinSleepTime ' + commander.time + ' --minUptime ' + commander.time + ' main.js')
});