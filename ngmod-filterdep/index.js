/*
 * ngmod-filterdep
 * https://bitbucket.org/sleelin/ngmod-filterdep
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
    gutil = require("gulp-util"),
    _ = require("lodash");

module.exports = function () {
    var modules = [];

    return through.obj(function transform(file, enc, next) {
        traverse(file, function (name, deps) {
            if (!_.some(modules, "name", name)) {
                // Find modules that depend on this module
                _.chain(modules).where({deps: [name]}).pluck("deps").value().forEach(function (deps) {
                    // Replace the module name with this file reference
                    if (_.includes(deps, name)) {
                        deps[deps.indexOf(name)] = file;
                    }
                });

                // Save reference for later modules
                modules.push({
                    name: name,
                    deps: [file].concat(_.chain(deps).map(function (module) {
                        // Replace dependency names with file references for existing modules
                        return _.chain(modules).where({name: module}).pluck("deps").first().first().value() || module;
                    }).value())
                });
            } else {
                next(new Error("Duplicate module definition"), file);
            }
        });

        next();
    }, function flush(next) {
        var files = [];

        // Only accumulate dependencies that are referenced
        modules.forEach(function (module) {
            if (_.chain(modules).without(module).where({deps: [module.deps[0]]}).value().length) {
                files = files.concat(module.deps);
            }
        });

        // Emit the files
        _.forEach(_.uniq(files), function (file) {
            this.push(file);
        }, this);

        // Always assume the first file to enter the stream is a required dependency
        this.push(modules[0].deps[0]);

        next();
    });
};

function traverse(file, callback) {
    try {
        // Parse source file contents and traverse AST, searching for angular module definitions
        astra(esprima.parse(file.contents.toString())).when({
            type: "CallExpression",
            callee: {
                type: "MemberExpression",
                object: {type: "Identifier", name: "angular"},
                property: {type: "Identifier", name: "module"}
            },
            arguments: []
        }, function (chunk) {
            var src = _.chain(chunk.arguments);

            if (chunk.arguments.length === 2) {
                // Pluck module name and dependencies and call the callback
                callback.apply(file, [
                    src.where({type: "Literal"}).pluck("value").first().value(),
                    src.where({type: "ArrayExpression"}).pluck("elements").first().pluck("value").value()
                ]);
            }
        }).run();
    } catch (ex) {
        // Do nothing, not a JavaScript file
    }
}

