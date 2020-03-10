var gulp = require('gulp')
var rev = require('gulp-rev-append');

gulp.task('bump', function() {
  return gulp.src('./*.html')
    .pipe(rev())
    .pipe(gulp.dest('.'));
});

gulp.task('bumpRoot', function() {
  return gulp.src('./root/*.html')
    .pipe(rev())
    .pipe(gulp.dest('./root/'));
});

gulp.task('default', gulp.series('bump','bumpRoot'))

gulp.task('copyRoot', function() {
	var files = [
		"./tvision.css",
		"./jquery.min.js",
		"./apexcharts.min.js",
		"./bigNumber.min.js",
		"./web3.min.js",
		"./web3connect.min.js",
		"./web3providers/walletConnect.min.js",
		"./web3providers/authereum.min.js",
		"./web3providers/burnerConnect.min.js",
		"./web3providers/fortmatic.min.js",
		"./chart.js",
		"./common.js",
		"./init.js",
	]
	return gulp.src(files , { base: './' })
		.pipe(gulp.dest('./root'));
});