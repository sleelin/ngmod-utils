/*
 * ngmod-concat
 * https://bitbucket.org/sleelin/ngmod-concat
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
        var stream = this;

        try {
            // Parse source file contents and traverse AST, searching for angular module definitions or extensions
            astra(esprima.parse(file.contents.toString())).when({
                type: "CallExpression",
                callee: {
                    type: "MemberExpression",
                    object: {type: "Identifier", name: "angular"},
                    property: {type: "Identifier", name: "module"}
                },
                arguments: []
            }, function (chunk) {
                // Get angular module definition/extension name
                var name = _.chain(chunk.arguments).where({type: "Literal"}).pluck("value").first().value();

                file = _.assign(file.clone(), {ngmodule: (chunk.arguments.length === 2)});

                if (file.ngmodule) gutil.log("AngularJS module", gutil.colors.cyan(name), "defined in file", gutil.colors.cyan(file.relative));

                // Make sure files array exists for this module
                if (!_.has(modules, name)) modules[name] = [];

                // Update the file if it already exists, or add it to the array
                if (_.chain(modules[name]).where({path: file.path}).value().length > 0) {
                    modules[name][_.pluck(modules[name], "path").indexOf(file.path)] = file;
                } else {
                    modules[name][file.ngmodule ? "unshift" : "push"](file);
                }

                if (modules[name][0].ngmodule) {
                    file = modules[name][0].clone({contents: false});
                    file.contents = Buffer.concat(_.pluck(modules[name], "contents"));
                    stream.push(file);
                }
            }).run();
        } catch (ex) {
            stream.push(file);
        }

        next();
    });
};