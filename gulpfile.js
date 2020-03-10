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