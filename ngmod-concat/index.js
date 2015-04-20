/*
 * ngmod-concat
 *
 * Copyright (c) 2015 S. Lee-Lindsay
 * Licensed under the GNU license.
 */

var path = require("path"),
    through = require("through2"),
    esprima = require("esprima"),
    astra = require("astra"),
    File = require("vinyl"),
    gutil = require("gulp-util"),
    _ = require("lodash");

/**
 * This function will return a transforming stream which expects to be passed vinyl representations of JavaScript files,
 * containing one or more objects with AngularJS module definitions or extensions. It will then extract the angular
 * module name from each file, and finally, emit a single new file for each detected module, with concatenated contents
 * of all files referencing the module.
 * @param options
 * @returns {Stream.Transform}
 */

module.exports = function (options) {
    var modules = {},
        opts = _.merge({
            verbose: true,
            namespace: ""
        }, options);

    return through.obj(function (file, enc, next) {
        try {
            //var target = opts.namespace.split(".").concat(_.map(path.dirname(file.relative).split(path.sep), _.capitalize)).join(".");
            //console.log(target);

            // Parse source file contents and traverse AST, searching for angular module definitions or extensions
            astra(esprima.parse(file.contents.toString())).when({
                type: 'CallExpression',
                callee: {
                    type: 'MemberExpression',
                    object: {type: 'Identifier', name: 'angular'},
                    property: {type: 'Identifier', name: 'module'}
                },
                arguments: []
            }, function (chunk) {
                // Get angular module definition/extension name
                var name = _.chain(chunk.arguments).where({type: "Literal"}).pluck("value").first().value(),
                    first = (chunk.arguments.length === 2);
                    //deps = src.where({type: "ArrayExpression"}).pluck("elements").first().pluck("value").value();

                // Add file to the array of files for the module, or create array for future files
                if (!_.has(modules, name)) {
                    modules[name] = [file];
                } else {
                    // If this file contains the angular module definition, put it first
                    modules[name][first ? "unshift" : "push"](file);
                }

                if (opts.verbose && first) {
                    gutil.log("Detected angular module definition", gutil.colors.cyan(name), "in file", gutil.colors.cyan(file.relative));
                }
            }).run();

            next();
        } catch (ex) {
            next(ex, null);
        }
    }, function (cb) {
        // Emit new files for each module, with concatenated contents of files referencing this module
        _.forEach(modules, function (module) {
            this.push(new File({
                cwd: module[0].cwd,
                base: module[0].base,
                path: module[0].path,
                contents: Buffer.concat(_.pluck(module, "contents"))
            }));
        }, this);

        cb();
    });
};