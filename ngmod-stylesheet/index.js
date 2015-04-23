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

module.exports = function (options) {
    var opts = _.merge({verbose: true}, options || {}),
        modules = [];

    return through.obj(function transform(file, enc, next) {
        var stream = this;

        stream.push(file);

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
                if (chunk.arguments.length === 2) {
                    modules[modules.push(file.clone({contents: false}))-1].ngmodule = chunk.arguments[0].value;
                }

                next();
            }).run(function () {
                var paths = _.chain(modules).pluck("relative").map(path.dirname);

                merge(modules.map(function (file) {
                    var relativeDir = path.dirname(file.relative),
                        stylesheets = [];

                    return fs.src([path.join("**", "*.css")].concat(excludes(paths.without(relativeDir), relativeDir)), {
                        cwd: path.dirname(file.path),
                        base: path.dirname(file.path)
                    }).pipe(map(function (file, next) {
                        stylesheets.push(file.contents);
                        next();
                    })).on("end", function () {
                        if (stylesheets.length > 0) {
                            file = file.clone({contents: false});
                            file.path = path.join(path.dirname(file.path), [path.basename(file.path, ".js"), "css"].join("."));
                            file.contents = Buffer.concat(stylesheets)

                            if (opts.verbose) {
                                //gutil.log("Building stylesheet", gutil.colors.cyan(file.relative), "for AngularJS module", gutil.colors.cyan(file.ngmodule));
                            }

                            stream.push(file);
                        }
                    });
                })).on("end", function () {
                    next();
                });
            });
        } catch (ex) {
            // Do nothing, obviously not a JavaScript file
            next();
        }
    });
}

function excludes(paths, relative) {
    return paths.filter(function (filepath) {
        return _.startsWith(filepath, relative);
    }).map(function (filepath) {
        return path.relative(relative, filepath);
    }).compact().map(function (filepath) {
        return ["!", filepath, path.sep, "**"].join("");
    }).value();
}