/*
 * ngmod-stylesheet
 * https://bitbucket.org/sleelin/ngmod-stylesheet
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
    merge = require("event-stream").merge,
    gutil = require("gulp-util"),
    _ = require("lodash");

module.exports.create = function () {
    var stylesheets = [],
        modules = [];

    return through.ctor({objectMode: true, verbose: true, read: true, immediate: false}, function transform(file, enc, next) {
        if (file.isNull() || file.contents.toString() === "") {
            next();
        } else {
            var stream = this;

            try {
                // Parse source file contents and traverse AST, searching for angular module definitions
                astra(esprima.parse(file.contents.toString()), true).when({
                    type: "CallExpression",
                    callee: {
                        type: "MemberExpression",
                        object: {type: "Identifier", name: "angular"},
                        property: {type: "Identifier", name: "module"}
                    },
                    arguments: []
                }, function (chunk, next) {
                    if ((chunk.arguments.length === 2) && (_.chain(modules).pluck("path").value().indexOf(file.path) < 0)) {
                        modules[modules.push(file) - 1].ngmodule = chunk.arguments[0].value;
                    }

                    next();
                }).run(function () {
                    var paths = _.chain(modules).pluck("relative").map(path.dirname);

                    merge(modules.map(function (file) {
                        var relativeDir = path.dirname(file.relative),
                            files = [];

                        // Look for all CSS files which are siblings or descendants of this module
                        return fs.src([path.join("**", "*.css")].concat(exclude(paths.without(relativeDir), relativeDir)), {
                            cwd: path.dirname(file.path),
                            base: path.dirname(file.path)
                        }).pipe(map(function (file, next) {
                            files.push(file);
                            next();
                        })).on("end", function () {
                            if (files.length > 0) {
                                // Create the module stylesheet file
                                file = file.clone({contents: false});
                                file.path = path.join(path.dirname(file.path), [path.basename(file.path, ".js"), "css"].join("."));
                                file.contents = Buffer.concat(_.pluck(files, "contents"));
                                file.stylesheets = files;

                                // Update the module's file if it already exists, or add the module
                                if (_.chain(stylesheets).where({path: file.path}).value().length > 0) {
                                    stylesheets[_.pluck(stylesheets, "path").indexOf(file.path)] = file;
                                } else {
                                    stylesheets.push(file);

                                    if (stream.options.verbose && stream.options.read) {
                                        gutil.log("Building stylesheet", gutil.colors.magenta(file.relative), "for AngularJS module", gutil.colors.cyan(file.ngmodule));
                                    }
                                }
                            }
                        });
                    })).on("end", function () {
                        next(null, file);
                    });
                });
            } catch (ex) {
                // Not a JavaScript file, so must be a stylesheet.
                // See if it was picked up earlier and needs updating
                findExisting(file, function (stylesheet, index) {
                    // File is part of a module's stylesheet, replace reference and rebuild module stylesheet
                    stylesheet.stylesheets[index] = file.clone();
                    stylesheet.contents = Buffer.concat(_.pluck(stylesheet.stylesheets, "contents"));

                    // Emit latest stylesheet
                    stream.push(stylesheet);

                    if (stream.options.verbose) gutil.log("Rebuilding stylesheet", gutil.colors.magenta(stylesheet.relative));
                });

                next();
            }
        }
    }, function flush(next) {
        // Flush will only run if the stream ends
        if (!this.options.immediate) _.forEach(stylesheets, function (file) {
            if (file.stylesheets.length > 0) this.push(file);
        }, this);

        next();
    });

    function findExisting(file, callback) {
        var stylesheet = _.chain(stylesheets).where({stylesheets: [{path: file.path}]}).last().value();
        if ((callback !== undefined) && (stylesheet !== undefined)) {
            callback.apply(this, [stylesheet, _.pluck(stylesheet.stylesheets, "path").indexOf(file.path)]);
        }

        return stylesheet;
    }

    function exclude(paths, relative) {
        return paths.filter(function (filepath) {
            return _.startsWith(filepath, relative);
        }).map(function (filepath) {
            return path.relative(relative, filepath);
        }).compact().map(function (filepath) {
            return ["!", filepath, path.sep, "**"].join("");
        }).value();
    }
};