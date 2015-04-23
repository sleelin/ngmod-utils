/*
 * ngmod-templateurl
 * https://bitbucket.org/sleelin/ngmod-templateurl
 *
 * Copyright (c) 2015 S. Lee-Lindsay
 * Licensed under the GNU license.
 */

var path = require("path"),
    through = require("through2"),
    esprima = require("esprima"),
    astra = require("astra"),
    File = require("vinyl"),
    fs = require("vinyl-fs"),
    map = require("map-stream"),
    gutil = require("gulp-util"),
    _ = require("lodash");

/**
 * This function will return a transforming stream which expects to be passed vinyl representations of JavaScript files,
 * containing one or more objects with templateUrl properties (typically used by AngularJS directive definitions).
 * It will then search all sibling files for one whose file name matches the file name (excluding path) defined in the
 * templateUrl property. Given a matching file, it will then emit a clone of the match, with the relative path updated
 * to be the expected path defined on the templateUrl property.
 * @param options
 * @returns {Stream.Transform}
 */
module.exports = function (options) {
    var opts = _.merge({
        urlbase: "",
        verbose: true
    }, options);

    return through.obj(function (file, enc, next) {
        var stream = this;

        this.push(file);

        try {
            // Parse source file contents and traverse AST, searching for templateUrl string literals
            astra(esprima.parse(file.contents.toString()), true).when({
                type: "Property",
                key: {type: "Identifier", name: "templateUrl"}
            }, function (chunk, next) {
                // Look through all sibling files for one which matches templateUrl's file name
                fs.src(path.join(path.dirname(file.path), "*"), {
                    cwd: file.cwd,
                    base: file.base
                }).pipe(map(function (file, next) {
                    // If sibling file matches templateUrl's filename, push it to the output stream with templateUrl's path
                    if (path.basename(file.path) === path.basename(chunk.value.value)) {
                        file = file.clone();
                        file.path = path.join(file.cwd, path.relative(opts.urlbase, chunk.value.value));

                        if (opts.verbose) {
                            gutil.log("Detected templateUrl source for", gutil.colors.cyan(file.relative));
                        }

                        stream.push(file);
                    }

                    next();
                })).on("end", function () {
                    next(); // Go to next templateUrl chunk
                });
            }).run(function () {
                // Process next file in the stream only when the complete AST has been traversed for matches
                next();
            });
        } catch (ex) {
            // Not a JavaScript file, pass down the stream
            next();
        }
    });
}
