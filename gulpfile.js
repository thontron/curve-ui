var gulp = require('gulp')
var replace = require('gulp-replace');
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

gulp.task('bumpVersion', function() {
	return gulp.src('./common.js')
		.pipe(replace(/var version = (.*);/, (match, p1) => {
			console.log(p1)
			p1 = +p1 + 1;
			return `var version = ${p1};`;
		}))
		.pipe(gulp.dest('.'))
})

gulp.task('default', gulp.series('bump','bumpRoot','bumpVersion'))