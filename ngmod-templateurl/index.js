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
    map = require("event-stream").map,
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
module.exports.create = function () {
    var templates = {};

    return through.ctor({objectMode: true, verbose: true}, function (file, enc, next) {
        if (gutil.isNull(file.contents) || file.contents.toString() === "") {
            next();
        } else {
            var stream = this;

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
                        if (path.basename(file.path) === path.basename(chunk.value.value) && file.contents.toString() !== "") {
                            if (stream.options.verbose && !templates[file.path]) {
                                gutil.log(gutil.colors.magenta(file.relative), "resolving to templateUrl",
                                    gutil.colors.magenta(path.relative(stream.options.urlbase, chunk.value.value)));
                            }

                            templates[file.path] = path.join(file.cwd, path.relative(stream.options.urlbase, chunk.value.value));
                            file = file.clone();
                            file.path = templates[file.path];

                            stream.push(file);
                        }

                        next(null, file);
                    })).on("end", function () {
                        next(); // Go to next templateUrl chunk
                    });
                }).run(function () {
                    // Process next file in the stream only when the complete AST has been traversed for matches
                    next(null, file);
                });
            } catch (ex) {
                // Update file path for existing detected templates
                if (templates[file.path] !== undefined) {
                    file.path = templates[file.path];
                    stream.push(file);
                }

                next();
            }
        }
    });
};
