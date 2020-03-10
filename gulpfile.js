var gulp = require('gulp')
var rev = require('gulp-rev-append');

gulp.task('rev', function() {
  return gulp.src('./*.html')
    .pipe(rev())
    .pipe(gulp.dest('./dist'));
});

gulp.task('revRoot', function() {
  return gulp.src('./root/*.html')
    .pipe(rev())
    .pipe(gulp.dest('./dist/root/'));
});

gulp.task('default', gulp.series('rev','revRoot'))