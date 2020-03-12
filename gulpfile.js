var gulp = require('gulp')
var rev = require('gulp-rev-append');

gulp.task('default', function() {
  return gulp.src('./*.html')
    .pipe(rev())
    .pipe(gulp.dest('.'));
});